import { describe, expect, it } from 'vitest'

import { resolveObservablePlotEncoding } from '@/panels/observablePlotEncoding'
import type { ObservablePlotPanelConfig } from '@/layout/types'

const baseConfig: ObservablePlotPanelConfig = {
  type: 'observable-plot',
  title: 'Mode Share by Purpose',
  metric: 'trip_mode_share',
  mark: 'barY',
}

const rows = [
  { purpose: 'HBW', mode: 'SOV', share: 0.62 },
  { purpose: 'HBW', mode: 'HOV', share: 0.18 },
]

describe('resolveObservablePlotEncoding', () => {
  it('copies markName and data through unchanged', () => {
    const result = resolveObservablePlotEncoding(baseConfig, rows)
    expect(result.markName).toBe('barY')
    expect(result.data).toBe(rows)
  })

  it('copies x/y/fill/stroke through as literal column names — NOT $metric.-prefixed (research.md §4)', () => {
    const result = resolveObservablePlotEncoding(
      { ...baseConfig, x: 'purpose', y: 'share', fill: 'mode', stroke: 'mode' },
      rows,
    )
    expect(result.options).toEqual({ x: 'purpose', y: 'share', fill: 'mode', stroke: 'mode' })
  })

  it('maps facet_x/facet_y to Plot channel keys fx/fy', () => {
    const result = resolveObservablePlotEncoding(
      { ...baseConfig, facet_x: 'mode', facet_y: 'purpose' },
      rows,
    )
    expect(result.options).toEqual({ fx: 'mode', fy: 'purpose' })
  })

  it('does not set options.tip at all when config.tip is unset', () => {
    expect(resolveObservablePlotEncoding(baseConfig, rows).options).toEqual({})
  })

  // A real hover bug found post-implementation: @observablehq/plot's own
  // tip: true shorthand always resolves to "xy" (2D) pointer mode,
  // regardless of mark shape (confirmed against Plot's real source,
  // mark.js's maybeTip) — which creates "dead spots" on bar-shaped marks
  // per Plot's own documented caveat (the pointer must land within ~40px
  // of a bar's centroid, not anywhere on its visible area). Resolved
  // internally rather than exposing a new author-facing grammar key.
  it('resolves tip: true to "x" pointer mode for barY, avoiding the documented dead-spot caveat on bar marks', () => {
    expect(
      resolveObservablePlotEncoding({ ...baseConfig, mark: 'barY', tip: true }, rows).options,
    ).toEqual({ tip: 'x' })
  })

  it('resolves tip: true to the "xy" default for lineY and other non-bar marks', () => {
    expect(
      resolveObservablePlotEncoding({ ...baseConfig, mark: 'lineY', tip: true }, rows).options,
    ).toEqual({ tip: true })
    expect(
      resolveObservablePlotEncoding({ ...baseConfig, mark: 'dot', tip: true }, rows).options,
    ).toEqual({ tip: true })
  })

  it('passes grid through to plotOptions only when set, never into options', () => {
    const result = resolveObservablePlotEncoding({ ...baseConfig, grid: true }, rows)
    // style: {fontSize: '12px'} is always present — see the font-size-match
    // test below for the full finding; not this test's own concern.
    expect(result.plotOptions).toEqual({ grid: true, style: { fontSize: '12px' } })
    expect(result.options).not.toHaveProperty('grid')
  })

  // A real legend bug found post-implementation, same category as the tip
  // fix above: docs/GRAMMAR.md has no legend: key at all, and
  // @observablehq/plot's color: {legend: true} is confirmed a top-level
  // plot() option that is NOT automatic — a fill/stroke channel with no
  // explicit legend option shows no legend. Defaults to showing one
  // whenever a color channel exists, matching PlotlyPanel's own
  // auto-legend behavior.
  it('sets plotOptions.color = {legend: true} when fill is set, never into options', () => {
    const result = resolveObservablePlotEncoding({ ...baseConfig, fill: 'mode' }, rows)
    expect(result.plotOptions.color).toEqual({ legend: true })
    expect(result.options).not.toHaveProperty('color')
  })

  it('sets plotOptions.color = {legend: true} when stroke is set', () => {
    const result = resolveObservablePlotEncoding({ ...baseConfig, stroke: 'purpose' }, rows)
    expect(result.plotOptions.color).toEqual({ legend: true })
  })

  it('does not set plotOptions.color when neither fill nor stroke is set', () => {
    const result = resolveObservablePlotEncoding(baseConfig, rows)
    expect(result.plotOptions).not.toHaveProperty('color')
  })

  it('omits keys entirely for fields the author did not configure — no undefined-valued keys', () => {
    const result = resolveObservablePlotEncoding(baseConfig, rows)
    expect(Object.keys(result.options)).toEqual([])
    // style: {fontSize: '12px'} is the one unconditional plotOptions key —
    // see the font-size-match test below for the full finding — every
    // other key here still stays fully conditional on author config.
    expect(Object.keys(result.plotOptions)).toEqual(['style'])
  })

  // Real, confirmed visual bug: @observablehq/plot's own default rendered
  // font-size (10px) reads noticeably smaller than PlotlyPanel.tsx's own
  // charts, which render at Plotly's own default (12px — PlotlyPanel.tsx
  // sets no explicit font.size at all, confirmed by direct read, so 12px
  // is Plotly's own real, live-confirmed rendered default, not a guessed
  // value). Matched here via Plot.plot()'s own top-level `style` option
  // (a CSSStyleDeclaration-shaped object, confirmed against the installed
  // package's own plot.d.ts) — unconditional, applied to every observable-
  // plot chart regardless of author config, so the two charting panel
  // types never visibly disagree on text size.
  it('always sets plotOptions.style.fontSize to match PlotlyPanel.tsx\'s own real default (12px)', () => {
    const result = resolveObservablePlotEncoding(baseConfig, rows)
    expect(result.plotOptions.style).toEqual({ fontSize: '12px' })
  })

  // 019-baseline-diff-consumption (FR-014): a real, confirmed finding —
  // Observable Plot's barY renders a null y as a real <rect height="0">
  // at the exact position a genuine 0 value would occupy (empirically
  // verified against the real, rendered SVG — not assumed), silently
  // indistinguishable from "no change." Rows with a null y value are now
  // filtered out before ever reaching Plot.plot().
  describe('null y-value filtering (FR-014)', () => {
    const diffRows = [
      { taz_id: 100, diff_value: -13 },
      { taz_id: 300, diff_value: null },
      { taz_id: 700, diff_value: 20 },
    ]

    it('drops rows whose configured y field is null when y is set', () => {
      const result = resolveObservablePlotEncoding({ ...baseConfig, y: 'diff_value' }, diffRows)
      expect(result.data).toEqual([
        { taz_id: 100, diff_value: -13 },
        { taz_id: 700, diff_value: 20 },
      ])
    })

    it('does not filter at all when y is not configured — data passes through unchanged, same reference', () => {
      const result = resolveObservablePlotEncoding(baseConfig, diffRows)
      expect(result.data).toBe(diffRows)
    })

    it('never drops a row whose y value is a real, non-null number (including 0)', () => {
      const rowsWithZero = [
        { taz_id: 100, diff_value: 0 },
        { taz_id: 300, diff_value: null },
      ]
      const result = resolveObservablePlotEncoding({ ...baseConfig, y: 'diff_value' }, rowsWithZero)
      expect(result.data).toEqual([{ taz_id: 100, diff_value: 0 }]) // real 0 kept, null dropped
    })
  })
})

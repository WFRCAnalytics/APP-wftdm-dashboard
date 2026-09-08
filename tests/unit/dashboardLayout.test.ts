import { describe, expect, it, vi } from 'vitest'

import { findFullPagePanel, isMetricStripRow, resolveSections } from '@/layout/dashboardLayout'
import type { DashboardTabConfig, PanelConfig, ValueBoxPanelConfig } from '@/layout/types'

const valueBox = (title: string): ValueBoxPanelConfig => ({
  type: 'valuebox',
  title,
  metric: 'summary_kpis',
  column: 'total_households',
  format: '{:,.0f}',
})

const plotly: PanelConfig = {
  type: 'plotly',
  title: 'A Chart',
  metric: 'trip_mode_share',
  traces: [],
}

const markdown: PanelConfig = { type: 'markdown', title: 'Some Text' }

function tab(layout: Record<string, PanelConfig[]>, sections?: DashboardTabConfig['sections']): DashboardTabConfig {
  return {
    header: { tab: 'Test', title: 'Test Tab' },
    filters: [],
    layout,
    sections,
  }
}

describe('isMetricStripRow', () => {
  it('is true for a row of all-valuebox panels', () => {
    expect(isMetricStripRow([valueBox('A'), valueBox('B'), valueBox('C')])).toBe(true)
  })
  it('is false when any panel is not a valuebox', () => {
    expect(isMetricStripRow([valueBox('A'), plotly])).toBe(false)
  })
  it('is false for an empty row', () => {
    expect(isMetricStripRow([])).toBe(false)
  })
})

describe('findFullPagePanel', () => {
  it('returns the single panel when layout resolves to exactly one panel total', () => {
    const t = tab({ row_a: [markdown] })
    expect(findFullPagePanel(t)).toBe(markdown)
  })
  it('returns null for zero panels', () => {
    expect(findFullPagePanel(tab({}))).toBeNull()
  })
  it('returns null for two or more panels, even across different rows', () => {
    expect(findFullPagePanel(tab({ row_a: [markdown], row_b: [plotly] }))).toBeNull()
    expect(findFullPagePanel(tab({ row_a: [markdown, plotly] }))).toBeNull()
  })
})

describe('resolveSections', () => {
  it('resolves a well-formed section unchanged', () => {
    const t = tab(
      { row_kpis: [valueBox('A')], row_chart: [plotly] },
      [{ id: 'overview', label: 'Overview', rows: ['row_kpis', 'row_chart'] }],
    )
    expect(resolveSections(t)).toEqual([{ id: 'overview', label: 'Overview', rows: ['row_kpis', 'row_chart'] }])
  })

  it('re-orders a section\'s own rows to match layout\'s real key order, not the section\'s authored order', () => {
    const t = tab(
      { row_kpis: [valueBox('A')], row_chart: [plotly] },
      // Authored backwards (row_chart before row_kpis) — resolveSections
      // must still return layout's own real order.
      [{ id: 'overview', label: 'Overview', rows: ['row_chart', 'row_kpis'] }],
    )
    expect(resolveSections(t)[0].rows).toEqual(['row_kpis', 'row_chart'])
  })

  it('drops a rows[] entry naming a row absent from layout, with a console.warn, keeping the section if any valid rows remain', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const t = tab(
      { row_kpis: [valueBox('A')] },
      [{ id: 'overview', label: 'Overview', rows: ['row_kpis', 'row_nonexistent'] }],
    )
    expect(resolveSections(t)).toEqual([{ id: 'overview', label: 'Overview', rows: ['row_kpis'] }])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('omits a section entirely when every one of its rows[] entries is invalid', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const t = tab({ row_kpis: [valueBox('A')] }, [
      { id: 'overview', label: 'Overview', rows: ['row_nonexistent'] },
    ])
    expect(resolveSections(t)).toEqual([])
    warn.mockRestore()
  })

  it('returns an empty array for a tab with no sections at all — the default, unchanged case', () => {
    expect(resolveSections(tab({ row_kpis: [valueBox('A')] }))).toEqual([])
  })

  it('a layout row not referenced by any section is simply absent from the result — it still renders normally elsewhere', () => {
    const t = tab(
      { row_kpis: [valueBox('A')], row_chart: [plotly] },
      [{ id: 'overview', label: 'Overview', rows: ['row_kpis'] }],
    )
    const resolved = resolveSections(t)
    expect(resolved).toHaveLength(1)
    expect(resolved[0].rows).not.toContain('row_chart')
  })

  it('skips a malformed section entry (missing id/label, non-array rows) with a console.warn, not a thrown error', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const t = tab(
      { row_kpis: [valueBox('A')] },
      // @ts-expect-error — deliberately malformed, real YAML has no
      // compile-time type safety
      [{ id: 'overview', rows: ['row_kpis'] }],
    )
    expect(resolveSections(t)).toEqual([])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

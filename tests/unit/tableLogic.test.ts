import { describe, expect, it } from 'vitest'

import { cellColor, filterRows, resolveColumns, sortRows } from '@/panels/tableLogic'
import type { TablePanelConfig } from '@/layout/types'

const BASE_CONFIG: TablePanelConfig = {
  type: 'table',
  title: 'Test Table',
  metric: 'screenlines',
}

describe('resolveColumns', () => {
  it('maps config.columns 1:1, in order, defaulting label to field when omitted', () => {
    const config: TablePanelConfig = {
      ...BASE_CONFIG,
      columns: [
        { field: 'link_id', label: 'Link ID' },
        { field: 'pct_error', format: '{:.1%}', color_scale: 'diverging', domain: [-0.5, 0.5] },
      ],
    }
    const rows = [{ link_id: 'L001', pct_error: 0.1 }]
    const resolved = resolveColumns(config, rows)
    expect(resolved).toEqual([
      { field: 'link_id', label: 'Link ID', format: undefined, colorScale: undefined, domain: undefined },
      {
        field: 'pct_error',
        label: 'pct_error',
        format: '{:.1%}',
        colorScale: 'diverging',
        domain: [-0.5, 0.5],
      },
    ])
  })

  it('derives columns from the query result shape when config.columns is absent, in returned order', () => {
    const rows = [{ link_id: 'L001', facility_type: 'Freeway', observed: 500 }]
    const resolved = resolveColumns(BASE_CONFIG, rows)
    expect(resolved.map((c) => c.field)).toEqual(['link_id', 'facility_type', 'observed'])
    expect(resolved.every((c) => c.format === undefined && c.colorScale === undefined)).toBe(true)
  })

  it('returns an empty array when there are no rows to derive columns from and no config.columns', () => {
    expect(resolveColumns(BASE_CONFIG, [])).toEqual([])
  })
})

describe('sortRows', () => {
  const rows = [{ v: -0.12 }, { v: -5 }, { v: 0.3 }, { v: 2 }]

  it('sorts a numeric column numerically, not lexicographically', () => {
    const sorted = sortRows(rows, 'v', 'asc')
    expect(sorted.map((r) => r.v)).toEqual([-5, -0.12, 0.3, 2])
  })

  it('reverses order for direction: desc', () => {
    const sorted = sortRows(rows, 'v', 'desc')
    expect(sorted.map((r) => r.v)).toEqual([2, 0.3, -0.12, -5])
  })

  it('sorts a non-numeric column via locale-aware string comparison', () => {
    const strRows = [{ name: 'Collector' }, { name: 'Arterial' }, { name: 'Freeway' }]
    const sorted = sortRows(strRows, 'name', 'asc')
    expect(sorted.map((r) => r.name)).toEqual(['Arterial', 'Collector', 'Freeway'])
  })

  it('never mutates the input array', () => {
    const original = [...rows]
    sortRows(rows, 'v', 'asc')
    expect(rows).toEqual(original)
  })
})

describe('filterRows', () => {
  const columns = [
    { field: 'link_id', label: 'Link ID' },
    { field: 'pct_error', label: '% Error', format: '{:.1%}' },
  ]
  const rows = [
    { link_id: 'L001', pct_error: 0.12 },
    { link_id: 'L002', pct_error: -0.5 },
  ]

  it('matches against the rendered (formatted) value, not the raw underlying value', () => {
    // raw pct_error 0.12 renders as "12.0%" via the {:.1%} format — the
    // search term below only matches the formatted string.
    expect(filterRows(rows, columns, '12.0%')).toEqual([rows[0]])
  })

  it('is case-insensitive', () => {
    expect(filterRows(rows, columns, 'l002')).toEqual([rows[1]])
  })

  it('evaluates every row passed in, with no built-in pagination assumption', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ link_id: `L${i}`, pct_error: 0 }))
    many[49] = { link_id: 'UNIQUE', pct_error: 0 }
    expect(filterRows(many, columns, 'unique')).toEqual([many[49]])
  })

  it('returns every row unchanged for an empty search term', () => {
    expect(filterRows(rows, columns, '')).toEqual(rows)
  })
})

describe('cellColor', () => {
  it('returns undefined when colorScale is not set', () => {
    expect(cellColor(0.3, undefined, [-0.5, 0.5])).toBeUndefined()
  })

  it('returns undefined when domain is not set', () => {
    expect(cellColor(0.3, 'diverging', undefined)).toBeUndefined()
  })

  it('returns undefined for a non-numeric value', () => {
    expect(cellColor('SOV', 'diverging', [-0.5, 0.5])).toBeUndefined()
  })

  it('sequential: low values blend toward --muted, high values toward --brand-wfrc-blue', () => {
    const low = cellColor(0, 'sequential', [0, 100])!
    const high = cellColor(100, 'sequential', [0, 100])!
    expect(low).toContain('--brand-wfrc-blue')
    expect(low).toMatch(/var\(--brand-wfrc-blue\) 0%/)
    expect(high).toMatch(/var\(--brand-wfrc-blue\) 40%/) // MAX_COLOR_STRENGTH
  })

  it('diverging, symmetric domain: negative extreme is --brand-wfrc-blue, positive extreme is --destructive, 0 is neutral', () => {
    const negative = cellColor(-0.5, 'diverging', [-0.5, 0.5])!
    const positive = cellColor(0.5, 'diverging', [-0.5, 0.5])!
    const zero = cellColor(0, 'diverging', [-0.5, 0.5])!
    expect(negative).toContain('--brand-wfrc-blue')
    expect(positive).toContain('--destructive')
    // 0% strength either direction — reads as pure --muted either way.
    expect(zero).toMatch(/ 0%, var\(--muted\)/)
  })

  it('diverging, ASYMMETRIC domain: the midpoint is fixed at literal 0, not the domain\'s geometric center', () => {
    // Domain [-0.1, 0.9] — geometric center is 0.4, not 0. If the
    // implementation used the domain center as its midpoint, evaluating
    // at exactly 0 would NOT read as the neutral (0% strength) color —
    // it would read as partway toward --brand-wfrc-blue (0 is below the
    // 0.4 center). research.md §4's decision is that 0 itself must
    // always be the neutral point, regardless of where it falls within
    // an asymmetric domain.
    const atZero = cellColor(0, 'diverging', [-0.1, 0.9])!
    expect(atZero).toMatch(/ 0%, var\(--muted\)/)

    // And the domain's own center (0.4) should NOT read as neutral —
    // it's partway toward --destructive under a fixed-0 midpoint.
    const atDomainCenter = cellColor(0.4, 'diverging', [-0.1, 0.9])!
    expect(atDomainCenter).toContain('--destructive')
    expect(atDomainCenter).not.toMatch(/ 0%, var\(--muted\)/)
  })

  it('clamps values outside the domain to the nearest extreme\'s color, not extrapolated further', () => {
    const beyondMax = cellColor(0.9, 'diverging', [-0.5, 0.5])!
    const atMax = cellColor(0.5, 'diverging', [-0.5, 0.5])!
    expect(beyondMax).toBe(atMax) // same clamped (100% of MAX_COLOR_STRENGTH) result

    const beyondMin = cellColor(-0.9, 'diverging', [-0.5, 0.5])!
    const atMin = cellColor(-0.5, 'diverging', [-0.5, 0.5])!
    expect(beyondMin).toBe(atMin)
  })

  // 019-baseline-diff-consumption (research.md §6, FR-014): a null value
  // (e.g. a diff_value column's own zero-baseline percent-diff case) must
  // get a dedicated, visibly-distinct "not computable" color — never
  // silently no color at all (the pre-existing behavior for any other
  // non-numeric value, still correct for those), and never blended into
  // the real scale's normal range.
  it('null gets a dedicated "not computable" color, distinct from "no color" and from the real scale', () => {
    const notComputable = cellColor(null, 'diverging', [-0.5, 0.5])
    expect(notComputable).toBeDefined()
    expect(notComputable).toContain('--muted-foreground')
    // Distinct from every real-scale color this suite already exercises
    // above — none of them reference --muted-foreground.
    const zero = cellColor(0, 'diverging', [-0.5, 0.5])
    expect(notComputable).not.toBe(zero)
  })

  it('null gets the dedicated color even when no colorScale/domain is configured at all', () => {
    // Deliberately checked BEFORE the colorScale/domain guard — a null
    // diff_value must read as distinct regardless of whether the column
    // even has a color_scale configured (matching formatValue.ts's own
    // null branch, which likewise applies regardless of format string).
    expect(cellColor(null, undefined, undefined)).toContain('--muted-foreground')
  })
})

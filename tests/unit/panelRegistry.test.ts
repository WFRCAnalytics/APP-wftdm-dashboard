import { describe, expect, it } from 'vitest'

import { EXPANDABLE_PANEL_TYPES } from '@/panels/expandablePanelTypes'

// 034-metric-panel-redesign — see contracts/panel-expand-scoping.md's own
// table. Deliberately does NOT import panels/registry.tsx itself (a real,
// confirmed constraint found during implementation: that module eagerly
// imports every real panel component, several of which — FlowMapPanel.tsx
// via @flowmap.gl/layers — fail to resolve under Vitest's plain-Node unit
// test environment; see expandablePanelTypes.ts's own header comment for
// the full finding). This is also why the constant lives in its own
// dedicated file rather than tests/unit/registry.test.ts, which already
// exists but covers a real, unrelated module — panels/basemap/registry.ts's
// basemap presets, not panels/registry.tsx.
describe('EXPANDABLE_PANEL_TYPES', () => {
  const expandable = ['table', 'markdown', 'plotly', 'observable-plot', 'sankey', 'recharts', 'flowmap', 'zonemap']
  const notExpandable = ['valuebox', 'graphic-walker']

  it.each(expandable)('contains "%s"', (type) => {
    expect(EXPANDABLE_PANEL_TYPES.has(type)).toBe(true)
  })

  it.each(notExpandable)('does NOT contain "%s"', (type) => {
    expect(EXPANDABLE_PANEL_TYPES.has(type)).toBe(false)
  })

  it('contains exactly the 8 documented types — no more, no fewer', () => {
    expect(EXPANDABLE_PANEL_TYPES.size).toBe(expandable.length)
  })
})

// 034-metric-panel-redesign: which panel types offer PanelCard's
// expand-to-dialog affordance (layout/panelCard.tsx) — a real, deliberate
// scope-down from the previous blanket default (every registered type got
// it unconditionally, contracts/panel-expand-scoping.md). A plain,
// explicit list rather than `Object.keys(registry).filter(...)` — easier
// to audit at a glance against the contract's own table, and a future
// eleventh panel type added to `registry.tsx` needs an explicit decision
// here rather than silently inheriting expand-ability (data-model.md §1).
// `valuebox` and `graphic-walker` are deliberately excluded: a value box
// has nothing more to show at a larger size, and graphic-walker's own
// chromeless full-page Explore mode (030-sidebar-navigation) already
// bypasses this mechanism entirely for its own real use case — this only
// affects a graphic-walker panel rendered as an ordinary card.
//
// Deliberately its OWN file, not co-located inside panels/registry.tsx —
// a real, confirmed constraint found during this feature's own
// implementation: registry.tsx eagerly imports every one of the ten real
// panel components at module scope, several of which (FlowMapPanel.tsx,
// via @flowmap.gl/layers) fail to resolve under Vitest's plain-Node
// `environment: 'node'` unit-test config (a real "directory import is not
// supported resolving ES modules" error, confirmed live) — vitest.config.js's
// own header comment already documents the project's deliberate intent
// ("Pure-logic unit tests only... no browser"), which importing the full
// registry module would violate. A dedicated, dependency-free module lets
// this Set be unit-tested directly with zero risk of pulling in a heavy
// panel component's own browser-only dependencies.
export const EXPANDABLE_PANEL_TYPES = new Set([
  'table',
  'markdown',
  'plotly',
  'observable-plot',
  'sankey',
  'recharts',
  'flowmap',
  'zonemap',
])

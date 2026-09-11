import { lazy, type ComponentType } from 'react'

import type { PanelConfig } from '@/layout/types'

export interface PanelProps<TConfig extends PanelConfig = PanelConfig> {
  config: TConfig
}

// Panel-type-to-component map (constitution v2.2.0's Development
// Workflow) — panelCard.tsx/dashboardRenderer.tsx's FullPagePanel both
// look up registry[config.type] and render it inside a <Suspense>
// boundary (see those two files' own comments for why the boundary lives
// at the CONSUMER, not here).
//
// 042-boot-performance-fix: every entry is now a real React.lazy()
// dynamic import(), not a static top-level import — a real, confirmed
// finding from the 042 investigation (docs/PIPELINE.md): this module used
// to statically import all ten panel components unconditionally, which
// made every one of their heavy library dependencies (Plotly, MapLibre/
// deck.gl, GraphicWalker, Recharts, D3-sankey — ~3.5MB compressed)
// transitively reachable from main.tsx's own entry graph, so Vite emitted
// a <link rel="modulepreload"> for every one of them in index.html and the
// browser fetched all of it on every single page load, regardless of
// which tab (if any) a viewer ever actually opened. Switching to
// React.lazy() breaks that static reachability — Vite now only fetches a
// given panel type's own chunk the first time PanelCard/FullPagePanel
// actually renders a panel of that type, which for most viewers (anyone
// who doesn't open every tab) is never all ten.
//
// Each panel component is a NAMED export (not a default export) — the
// `.then((m) => ({ default: m.X }))` adapter is required because
// React.lazy() only accepts a loader that resolves to `{ default: ... }`.
//
// This `any` is the one deliberate escape hatch (unchanged from before
// this feature), scoped to the registry's own value type only — the
// registry is keyed dynamically (config.type decides which entry runs at
// render time), so it can't be statically proven type-safe per-entry the
// way a fully generic map would require; each panel component narrows its
// own PanelConfig variant internally instead. React.lazy()'s own return
// type (`LazyExoticComponent<ComponentType<P>>`) is itself a valid
// `ComponentType<P>`, so this map's declared value type needed no change.
export const registry: Record<string, ComponentType<PanelProps<any>>> = {
  valuebox: lazy(() => import('@/panels/ValueBoxPanel').then((m) => ({ default: m.ValueBoxPanel }))),
  plotly: lazy(() => import('@/panels/PlotlyPanel').then((m) => ({ default: m.PlotlyPanel }))),
  table: lazy(() => import('@/panels/TablePanel').then((m) => ({ default: m.TablePanel }))),
  markdown: lazy(() => import('@/panels/MarkdownPanel').then((m) => ({ default: m.MarkdownPanel }))),
  'observable-plot': lazy(() =>
    import('@/panels/ObservablePlotPanel').then((m) => ({ default: m.ObservablePlotPanel })),
  ),
  recharts: lazy(() => import('@/panels/RechartsPanel').then((m) => ({ default: m.RechartsPanel }))),
  sankey: lazy(() => import('@/panels/SankeyPanel').then((m) => ({ default: m.SankeyPanel }))),
  flowmap: lazy(() => import('@/panels/FlowMapPanel').then((m) => ({ default: m.FlowMapPanel }))),
  zonemap: lazy(() => import('@/panels/ZoneMapPanel').then((m) => ({ default: m.ZoneMapPanel }))),
  'graphic-walker': lazy(() =>
    import('@/panels/GraphicWalkerPanel').then((m) => ({ default: m.GraphicWalkerPanel })),
  ),
}

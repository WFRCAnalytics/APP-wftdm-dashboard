import type { ComponentType } from 'react'

import { MarkdownPanel } from '@/panels/MarkdownPanel'
import { ObservablePlotPanel } from '@/panels/ObservablePlotPanel'
import { PlotlyPanel } from '@/panels/PlotlyPanel'
import { TablePanel } from '@/panels/TablePanel'
import { ValueBoxPanel } from '@/panels/ValueBoxPanel'
import type { PanelConfig } from '@/layout/types'

export interface PanelProps<TConfig extends PanelConfig = PanelConfig> {
  config: TConfig
}

// Panel-type-to-component map (constitution v2.2.0's Development
// Workflow) — panelCard.tsx looks up registry[config.type] and renders
// it directly.
//
// The registry is keyed dynamically (config.type decides which entry
// runs at render time), so it can't be statically proven type-safe
// per-entry the way a fully generic map would require — each panel
// component narrows its own PanelConfig variant internally instead. This
// `any` is the one deliberate escape hatch, scoped to the registry's own
// value type only.
export const registry: Record<string, ComponentType<PanelProps<any>>> = {
  valuebox: ValueBoxPanel,
  plotly: PlotlyPanel,
  table: TablePanel,
  markdown: MarkdownPanel,
  'observable-plot': ObservablePlotPanel,
}

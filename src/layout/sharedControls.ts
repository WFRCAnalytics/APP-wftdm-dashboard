// Controls lifted from the tiles of a tab into the tab strip (project-docs/redesign/10-toolbar-layout-export-proposal.md,
// question 6). Pure logic: which options the tiles of a tab offer in common, and which tiles a chosen option applies to.
import { defaultStrategies, resolveMultiView, STRATEGY_LABEL, validateMultiView } from '../panels/multiView.ts'
import type { TileState } from '../state/tileState.ts'
import type { MultiViewPanelConfig, PanelConfig, SharedControlKind } from './types.ts'

/** What a control needs from the page: each tile own state (the shared Compare as depends on the view it shows) and the mode. */
export interface SharedContext {
  selection: (panel: PanelConfig) => TileState
  compare: boolean
}

export interface SharedControl {
  kind: SharedControlKind
  label: string
  options: { id: string; label: string }[]
  /** The option shown when the viewer has not chosen one: the first tile's own default. */
  fallback: string
}

const isMultiView = (p: PanelConfig): p is MultiViewPanelConfig => p.type === 'multi-view' && Array.isArray((p as MultiViewPanelConfig).views)

/** Option ids offered by a tile for a kind, with labels. */
function tileOptions(tile: MultiViewPanelConfig, kind: SharedControlKind, ctx?: SharedContext): { id: string; label: string }[] {
  if (kind === 'strategy') {
    // the strategies of the view the tile shows now, so the control follows the tile View choice
    if (!ctx?.compare || validateMultiView(tile)) return []
    const r = resolveMultiView(tile, ctx.selection(tile), { compare: true })
    // a difference is the Show control's job, not an arrangement to pick
    const offered = r.strategies.filter((x) => x !== 'diff')
    if (r.scenarioIndependent || offered.length < 2) return []
    return offered.map((s) => ({ id: s, label: STRATEGY_LABEL[s] }))
  }
  if (kind === 'group') return (tile.group_by?.options ?? []).map((o) => ({ id: o.id, label: o.label }))
  return tile.views.map((v) => ({ id: v.id, label: v.label ?? v.id }))
}

function tileDefault(tile: MultiViewPanelConfig, kind: SharedControlKind, ctx?: SharedContext): string | undefined {
  if (kind === 'strategy') return tileOptions(tile, kind, ctx)[0]?.id
  if (kind === 'group') return tile.group_by?.default ?? tile.group_by?.options[0]?.id
  return tile.default_view ?? tile.views[0]?.id
}

/** The union (by option id, first label wins, first tile's order) of what the multi-view tiles offer; null when fewer than two options. */
export function sharedControl(kind: SharedControlKind, tiles: PanelConfig[], ctx?: SharedContext): SharedControl | null {
  const multi = tiles.filter(isMultiView)
  const options: { id: string; label: string }[] = []
  for (const tile of multi) for (const o of tileOptions(tile, kind, ctx)) if (!options.some((x) => x.id === o.id)) options.push(o)
  if (options.length < 2) return null
  const first = multi.find((t) => tileOptions(t, kind, ctx).length > 0)
  const wanted = first ? tileDefault(first, kind, ctx) : undefined
  return {
    kind,
    label: kind === 'group' ? (first?.group_by?.label ?? 'Group by') : kind === 'strategy' ? 'Compare as' : 'View',
    options,
    fallback: wanted && options.some((o) => o.id === wanted) ? wanted : options[0].id,
  }
}

/** Does this tile offer the chosen option, so the shared value should be written to it? */
export function tileAccepts(tile: PanelConfig, kind: SharedControlKind, id: string): boolean {
  if (kind === 'strategy') return isMultiView(tile) && tile.views.some((v) => (v.compare ?? defaultStrategies(v.type)).includes(id as never))
  return isMultiView(tile) && tileOptions(tile, kind).some((o) => o.id === id)
}

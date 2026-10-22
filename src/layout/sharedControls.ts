// Controls lifted from the tiles of a tab into the tab strip (project-docs/redesign/10-toolbar-layout-export-proposal.md,
// question 6). Pure logic: which options the tiles of a tab offer in common, and which tiles a chosen option applies to.
import type { MultiViewPanelConfig, PanelConfig, SharedControlKind } from './types.ts'

export interface SharedControl {
  kind: SharedControlKind
  label: string
  options: { id: string; label: string }[]
  /** The option shown when the viewer has not chosen one: the first tile's own default. */
  fallback: string
}

const isMultiView = (p: PanelConfig): p is MultiViewPanelConfig => p.type === 'multi-view' && Array.isArray((p as MultiViewPanelConfig).views)

/** Option ids offered by a tile for a kind, with labels. */
function tileOptions(tile: MultiViewPanelConfig, kind: SharedControlKind): { id: string; label: string }[] {
  if (kind === 'group') return (tile.group_by?.options ?? []).map((o) => ({ id: o.id, label: o.label }))
  return tile.views.map((v) => ({ id: v.id, label: v.label ?? v.id }))
}

function tileDefault(tile: MultiViewPanelConfig, kind: SharedControlKind): string | undefined {
  if (kind === 'group') return tile.group_by?.default ?? tile.group_by?.options[0]?.id
  return tile.default_view ?? tile.views[0]?.id
}

/** The union (by option id, first label wins, first tile's order) of what the multi-view tiles offer; null when fewer than two options. */
export function sharedControl(kind: SharedControlKind, tiles: PanelConfig[]): SharedControl | null {
  const multi = tiles.filter(isMultiView)
  const options: { id: string; label: string }[] = []
  for (const tile of multi) for (const o of tileOptions(tile, kind)) if (!options.some((x) => x.id === o.id)) options.push(o)
  if (options.length < 2) return null
  const first = multi.find((t) => tileOptions(t, kind).length > 0)
  const wanted = first ? tileDefault(first, kind) : undefined
  return {
    kind,
    label: kind === 'group' ? (first?.group_by?.label ?? 'Group by') : 'View',
    options,
    fallback: wanted && options.some((o) => o.id === wanted) ? wanted : options[0].id,
  }
}

/** Does this tile offer the chosen option, so the shared value should be written to it? */
export function tileAccepts(tile: PanelConfig, kind: SharedControlKind, id: string): boolean {
  return isMultiView(tile) && tileOptions(tile, kind).some((o) => o.id === id)
}

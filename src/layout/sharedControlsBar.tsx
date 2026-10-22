import { createContext, useContext, useMemo, useSyncExternalStore } from 'react'

import { PillSelect } from '@/components/ui/pill-select'
import { Segmented } from '@/components/ui/segmented'
import { useTileState } from '@/hooks/useTileState'
import { sharedControl, tileAccepts } from '@/layout/sharedControls'
import type { PanelConfig, SharedControlKind } from '@/layout/types'
import { getTileState, getTileVersion, setTileState, subscribe, tileKey } from '@/state/tileState'
import type { SharedContext } from '@/layout/sharedControls'
import { useResolvedView } from '@/hooks/useViewContext'

/** The kinds lifted into the tab strip for the tab being rendered; a multi-view tile hides its own control for these. */
export const SharedKindsContext = createContext<ReadonlySet<SharedControlKind>>(new Set())

export function useSharedKinds(): ReadonlySet<SharedControlKind> {
  return useContext(SharedKindsContext)
}

const tileIdOf = (panel: PanelConfig, rowName: string, index: number) => (panel as { id?: string }).id ?? `${rowName}-${index}`

/** Holder of the shared choice (so it survives a tab switch) and the tiles it fans out to. */
/** The tile states and the compare mode as the shared controls read them; re-reads when any tile changes. */
export function useSharedContext(page: string, ids: Map<PanelConfig, string>): SharedContext {
  const { compare } = useResolvedView()
  useSyncExternalStore(subscribe, getTileVersion)
  return { compare, selection: (panel) => getTileState(tileKey(page, ids.get(panel) ?? '')) }
}

export function SharedControlsBar({ page, sectionId, kinds, rows, rowNames }: { page: string; sectionId: string; kinds: SharedControlKind[]; rows: ReadonlyMap<string, PanelConfig[]>; rowNames: string[] }) {
  const tiles = useMemo(
    () => rowNames.flatMap((name) => (rows.get(name) ?? []).map((panel, index) => ({ panel, id: tileIdOf(panel, name, index), key: tileKey(page, tileIdOf(panel, name, index)) }))),
    [page, rowNames, rows],
  )
  const [shared, setShared] = useTileState(tileKey(page, `${sectionId}:shared`))
  const ctx = useSharedContext(page, useMemo(() => new Map(tiles.map((t) => [t.panel, t.id])), [tiles]))
  const controls = kinds.map((k) => sharedControl(k, tiles.map((t) => t.panel), ctx)).filter((c) => c !== null)

  const choose = (kind: SharedControlKind, id: string) => {
    setShared({ [kind]: id })
    for (const t of tiles) if (tileAccepts(t.panel, kind, id)) setTileState(t.key, { [kind]: id })
  }

  return (
    <>
      {controls.map((c) => {
        const stored = shared[c.kind]
        const value = stored && c.options.some((o) => o.id === stored) ? stored : c.fallback
        return c.kind === 'group' ? (
          <PillSelect key={c.kind} label={c.label} value={value} options={c.options.map((o) => ({ value: o.id, label: o.label }))} onChange={(id) => choose('group', id)} data-testid="shared-group" />
        ) : (
          <Segmented key={c.kind} label={c.label} value={value} options={c.options} onChange={(id) => choose(c.kind, id)} />
        )
      })}
    </>
  )
}

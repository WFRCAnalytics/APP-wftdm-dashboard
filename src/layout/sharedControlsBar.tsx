import { createContext, useContext, useMemo } from 'react'

import { PillSelect } from '@/components/ui/pill-select'
import { Segmented } from '@/components/ui/segmented'
import { useTileState } from '@/hooks/useTileState'
import { sharedControl, tileAccepts } from '@/layout/sharedControls'
import type { PanelConfig, SharedControlKind } from '@/layout/types'
import { setTileState, tileKey } from '@/state/tileState'

/** The kinds lifted into the tab strip for the tab being rendered; a multi-view tile hides its own control for these. */
export const SharedKindsContext = createContext<ReadonlySet<SharedControlKind>>(new Set())

export function useSharedKinds(): ReadonlySet<SharedControlKind> {
  return useContext(SharedKindsContext)
}

const tileIdOf = (panel: PanelConfig, rowName: string, index: number) => (panel as { id?: string }).id ?? `${rowName}-${index}`

/** Holder of the shared choice (so it survives a tab switch) and the tiles it fans out to. */
export function SharedControlsBar({ page, sectionId, kinds, rows, rowNames }: { page: string; sectionId: string; kinds: SharedControlKind[]; rows: ReadonlyMap<string, PanelConfig[]>; rowNames: string[] }) {
  const tiles = useMemo(
    () => rowNames.flatMap((name) => (rows.get(name) ?? []).map((panel, index) => ({ panel, key: tileKey(page, tileIdOf(panel, name, index)) }))),
    [page, rowNames, rows],
  )
  const [shared, setShared] = useTileState(tileKey(page, `${sectionId}:shared`))
  const controls = kinds.map((k) => sharedControl(k, tiles.map((t) => t.panel))).filter((c) => c !== null)

  const choose = (kind: SharedControlKind, id: string) => {
    setShared({ [kind]: id })
    for (const t of tiles) if (tileAccepts(t.panel, kind, id)) setTileState(t.key, { [kind]: id })
  }

  return (
    <>
      {controls.map((c) => {
        const value = shared[c.kind] ?? c.fallback
        return c.kind === 'group' ? (
          <PillSelect key={c.kind} label={c.label} value={value} options={c.options.map((o) => ({ value: o.id, label: o.label }))} onChange={(id) => choose('group', id)} data-testid="shared-group" />
        ) : (
          <Segmented key={c.kind} label={c.label} value={value} options={c.options} onChange={(id) => choose('view', id)} />
        )
      })}
    </>
  )
}

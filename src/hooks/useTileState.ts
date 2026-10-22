import { createContext, useCallback, useContext, useSyncExternalStore } from 'react'

import { getTileState, setTileState, subscribe, type TileState } from '@/state/tileState'

/** The `pageId:tileId` key of the tile being rendered; provided by PanelCard, read by the multi-view body. */
export const TileKeyContext = createContext<string>('')

export function useTileState(key: string): [TileState, (patch: Partial<TileState>) => void] {
  const state = useSyncExternalStore(subscribe, () => getTileState(key))
  const set = useCallback((patch: Partial<TileState>) => setTileState(key, patch), [key])
  return [state, set]
}

export function useTileKey(): string {
  return useContext(TileKeyContext)
}

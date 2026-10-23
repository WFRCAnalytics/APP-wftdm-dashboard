// Per-tile session state (project-docs/redesign/03-state-and-compare.md section 1), keyed `pageId:tileId`. It survives
// page switches and resets on reload (plain module state, never web storage).
import type { CompareStrategy } from '../layout/types.ts'

export interface TileState {
  /** Chosen view id; default = the first view in the YAML. */
  view?: string
  /** Chosen group-by option id; default = the configured default group. */
  group?: string
  /** Chosen compare strategy; default = the view's first strategy. */
  strategy?: CompareStrategy
  /** The local scenario for the `switch` strategy. */
  scenario?: string
  /** Side-by-side arrangement: `auto` (default) picks columns from the width, `row` puts every cell in one row, `grid` uses two columns. */
  layout?: 'auto' | 'row' | 'grid'
  /** Pager index for `multi` / `grid`. */
  page?: number
  /** Synced-map group id, generated once per tile. */
  mapGroup?: string
}

const EMPTY: TileState = Object.freeze({})
const tiles = new Map<string, TileState>()
const subscribers = new Set<() => void>()
let version = 0

/** Changes whenever any tile state does (for code that reads many tiles at once). */
export function getTileVersion(): number {
  return version
}

export function subscribe(fn: () => void): () => void {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

export function tileKey(pageId: string, tileId: string): string {
  return `${pageId}:${tileId}`
}

/** A stable object per tile until it changes, so it is safe as a useSyncExternalStore snapshot. */
export function getTileState(key: string): TileState {
  return tiles.get(key) ?? EMPTY
}

export function setTileState(key: string, patch: Partial<TileState>): void {
  tiles.set(key, { ...getTileState(key), ...patch })
  version++
  for (const fn of subscribers) fn()
}

/** Test helper: forget every tile. */
export function resetTileStates(): void {
  tiles.clear()
  version++
  for (const fn of subscribers) fn()
}

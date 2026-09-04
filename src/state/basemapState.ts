// 020-settings-modal: the single, viewer-set global basemap choice — a
// dashboard-wide store, not scenario-scoped, so it lives here rather than
// on state/appState.ts (whose own header comment scopes it explicitly to
// "scenario metadata and selection state"). Mirrors state/appState.ts's/
// state/filterState.ts's own subscribe/notify shape exactly — a single
// module-level value, not a Map, since there is exactly one global
// basemap choice for the whole app (research.md §6, data-model.md).
//
// Deliberately typed BasemapPresetName (a plain string), not the full
// BasemapSelection union that also includes BasemapComposition objects —
// the Settings modal's Basemap tab only ever offers entries from
// registry.ts's BUILT_IN_PRESETS, which contains only preset names, never
// compositions (those are a downstream-authoring-only escape hatch, per
// panels/basemap/types.ts's own comment). Keeping this a primitive means
// useGlobalBasemap()'s useSyncExternalStore snapshot compares correctly
// via the default Object.is check, with no memoized cache needed — same
// reasoning hooks/useBaseline.ts already documents for its own primitive
// return value.
//
// No persistence anywhere (FR-015) — in-memory only, reset by a page
// reload. There is no dedicated "clear" control in the Basemap tab
// (contracts/settings-modal.md) — clearGlobalBasemap() exists for
// completeness/testability.
import type { BasemapPresetName } from '@/panels/basemap/types'

let globalBasemap: BasemapPresetName | undefined

export type Subscriber = () => void
export type Unsubscribe = () => void

const subscribers = new Set<Subscriber>()

function notify(): void {
  for (const fn of subscribers) fn()
}

export function subscribe(fn: Subscriber): Unsubscribe {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

export function getGlobalBasemap(): BasemapPresetName | undefined {
  return globalBasemap
}

export function setGlobalBasemap(name: BasemapPresetName): void {
  globalBasemap = name
  notify()
}

export function clearGlobalBasemap(): void {
  globalBasemap = undefined
  notify()
}

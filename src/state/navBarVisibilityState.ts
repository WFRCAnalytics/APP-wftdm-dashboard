// Nav-bar visibility mode — mirrors state/basemapState.ts's/state/
// themeState.ts's own established shape exactly: a single module-level
// primitive value + subscribe/notify + a hook (hooks/useNavBarVisibilityMode.ts)
// wrapping it via useSyncExternalStore. Lives in its own module rather than
// on either of those two — this is neither scenario-metadata state
// (state/appState.ts's own documented scope) nor a basemap/theme choice;
// it's a THIRD, independent Settings-modal preference, matching how
// basemapState.ts itself was split out as its own module rather than
// folded onto appState.ts when it was added.
//
// In-memory only, no persistence (constitution Principle VI) — a fresh
// module load always starts at 'auto', matching every other Settings-modal
// preference in this app (theme mode, global basemap): a page reload
// always resets to the documented default, never a silently-remembered
// prior choice.
export type NavBarVisibilityMode = 'auto' | 'fixed'

let mode: NavBarVisibilityMode = 'auto'

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

export function getNavBarVisibilityMode(): NavBarVisibilityMode {
  return mode
}

export function setNavBarVisibilityMode(next: NavBarVisibilityMode): void {
  mode = next
  notify()
}

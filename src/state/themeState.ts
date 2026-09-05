// UI polish pass (post-merge correction to 021-basemap-catalog-redesign):
// appearanceTab.tsx's theme `mode` used to be local component state
// (React.useState). Confirmed directly, via a live Playwright
// reproduction, that switching Settings-modal tabs and back genuinely
// resets a previously-selected Light/Dark choice straight back to
// System — this codebase's Tabs primitive (Radix, via its Presence
// child) tears the inactive tab's content down when a different tab is
// selected, so any state local to that content does not survive a
// round trip. Lifted to module-level state mirroring
// state/basemapState.ts's own subscribe/notify shape exactly — the same
// fix category, for the same underlying cause (component state needing
// to survive a remount this app's own Tabs usage genuinely performs).
//
// Still no persistence across a page RELOAD (constitution Principle
// VI unchanged) — a fresh module load always starts at 'system'; only
// survival across a Settings-tab switch within one open modal session
// is in scope here. appearanceTab.tsx keeps ownership of the actual
// DOM side effect (applying `.dark` to document.documentElement,
// managing the matchMedia listener while mode === 'system') — only the
// VALUE itself moved here. Since that value now survives the
// component's own unmount/remount, the component's mount effect
// simply reapplies the same, already-correct value on remount instead
// of resetting to 'system' — no visible flash, no relocation of the
// DOM-application logic needed.
export type ThemeMode = 'system' | 'light' | 'dark'

let mode: ThemeMode = 'system'

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

export function getMode(): ThemeMode {
  return mode
}

export function setMode(next: ThemeMode): void {
  mode = next
  notify()
}

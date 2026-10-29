// Whether the Settings modal is open, and on which tab, so something other than its nav button (the scenario picker's
// "Edit colours, names and order" link) can open it. Session-only module state, like every other store here.
export type SettingsTab = 'appearance' | 'scenarios' | 'basemap' | 'ai' | 'documentation'

interface SettingsUi {
  open: boolean
  tab: SettingsTab
}

const DEFAULT_TABS: readonly SettingsTab[] = ['appearance', 'scenarios', 'basemap', 'ai', 'documentation']
// The tabs the deployment shows, in order (`settings.tabs`), set once at boot. Until then, today's five.
let shown: readonly SettingsTab[] = DEFAULT_TABS

let ui: SettingsUi = { open: false, tab: 'appearance' }
// The element that had focus when the modal opened: focus returns to it on close, even when the modal was opened
// from somewhere other than its own nav button.
let opener: HTMLElement | null = null
const subscribers = new Set<() => void>()

function rememberOpener(): void {
  const active = typeof document === 'undefined' ? null : document.activeElement
  opener = typeof HTMLElement !== 'undefined' && active instanceof HTMLElement && active !== document.body ? active : null
}

export function subscribe(fn: () => void): () => void {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

/** Sets the tabs to show, in order (never empty), once at boot; the first listed tab is the one that opens. */
export function configureSettingsTabs(tabs: readonly SettingsTab[]): void {
  shown = tabs.length > 0 ? tabs : DEFAULT_TABS
  ui = { ...ui, tab: shown[0] }
  for (const fn of subscribers) fn()
}

export function getShownSettingsTabs(): readonly SettingsTab[] {
  return shown
}

/** A tab that is shown: the one asked for, else the first listed. */
function usable(tab: SettingsTab): SettingsTab {
  return shown.includes(tab) ? tab : shown[0]
}

export function getSettingsUi(): SettingsUi {
  return ui
}

export function getSettingsOpener(): HTMLElement | null {
  return opener
}

export function setSettingsOpen(open: boolean): void {
  if (open && !ui.open) rememberOpener()
  ui = { ...ui, open }
  for (const fn of subscribers) fn()
}

export function setSettingsTab(tab: SettingsTab): void {
  ui = { ...ui, tab: usable(tab) }
  for (const fn of subscribers) fn()
}

/** Open the modal straight onto a tab. */
export function openSettings(tab: SettingsTab): void {
  if (!ui.open) rememberOpener()
  ui = { open: true, tab: usable(tab) }
  for (const fn of subscribers) fn()
}

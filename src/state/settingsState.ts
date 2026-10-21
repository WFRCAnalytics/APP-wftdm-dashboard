// Whether the Settings modal is open, and on which tab, so something other than its nav button (the scenario picker's
// "Edit colours, names and order" link) can open it. Session-only module state, like every other store here.
export type SettingsTab = 'appearance' | 'scenarios' | 'basemap'

interface SettingsUi {
  open: boolean
  tab: SettingsTab
}

let ui: SettingsUi = { open: false, tab: 'appearance' }
const subscribers = new Set<() => void>()

export function subscribe(fn: () => void): () => void {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

export function getSettingsUi(): SettingsUi {
  return ui
}

export function setSettingsOpen(open: boolean): void {
  ui = { ...ui, open }
  for (const fn of subscribers) fn()
}

export function setSettingsTab(tab: SettingsTab): void {
  ui = { ...ui, tab }
  for (const fn of subscribers) fn()
}

/** Open the modal straight onto a tab. */
export function openSettings(tab: SettingsTab): void {
  ui = { open: true, tab }
  for (const fn of subscribers) fn()
}

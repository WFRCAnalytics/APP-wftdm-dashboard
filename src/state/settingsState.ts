// Whether the Settings modal is open, and on which tab, so something other than its nav button (the scenario picker's
// "Edit colours, names and order" link) can open it. Session-only module state, like every other store here.
export type SettingsTab = 'appearance' | 'scenarios' | 'basemap' | 'documentation'

interface SettingsUi {
  open: boolean
  tab: SettingsTab
}

let ui: SettingsUi = { open: false, tab: 'appearance' }
// The element that had focus when the modal opened: focus returns to it on close, even when the modal was opened
// from somewhere other than its own nav button.
let opener: HTMLElement | null = null
const subscribers = new Set<() => void>()

function rememberOpener(): void {
  const active = typeof document === 'undefined' ? null : document.activeElement
  opener = active instanceof HTMLElement && active !== document.body ? active : null
}

export function subscribe(fn: () => void): () => void {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
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
  ui = { ...ui, tab }
  for (const fn of subscribers) fn()
}

/** Open the modal straight onto a tab. */
export function openSettings(tab: SettingsTab): void {
  if (!ui.open) rememberOpener()
  ui = { open: true, tab }
  for (const fn of subscribers) fn()
}

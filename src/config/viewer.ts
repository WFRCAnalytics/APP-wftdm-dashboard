// Viewer-facing settings, pure: the documentation link's address and label. (The Settings tab list joins this file in a later
// step.) Imported by the schema table for its checks, so this file must not import the schema.

/** A web address a link may point at: scheme `http` or `https`, no spaces. Anything else (`javascript:`, `data:`, `ftp:`) is refused. */
export function isWebAddress(value: string): boolean {
  const text = value.trim()
  if (text === '' || /\s/.test(text)) return false
  try {
    const { protocol } = new URL(text)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

/** A path relative to the documentation address: not empty, no scheme, not starting `//`. A `#fragment` or `?query` is fine. */
export function isRelativePath(value: string): boolean {
  const text = value.trim()
  return text !== '' && !/^[a-z][a-z0-9+.-]*:/i.test(text) && !text.startsWith('//')
}

export const DEFAULT_DOCS_LABEL = 'Documentation'

/** The link's label: the deployer's text, else "Documentation". */
export function docsLabel(label: string | undefined): string {
  return label !== undefined && label.trim() !== '' ? label.trim() : DEFAULT_DOCS_LABEL
}

/**
 * Where the documentation link goes: the site address, with the page's path appended (one `/` between them) when the page has one
 * that is usable. `undefined` when there is no usable address, so no link is shown.
 */
export function docsHref(url: string | undefined, path?: string): string | undefined {
  if (url === undefined || !isWebAddress(url)) return undefined
  const base = url.trim()
  if (path === undefined || !isRelativePath(path)) return base
  return `${base.replace(/\/+$/, '')}/${path.trim().replace(/^\/+/, '')}`
}

/** The Settings window's tabs, by the names a deployer writes, in today's order. (`assistant` is the tab the app calls `ai` inside.) */
export const SETTINGS_TAB_NAMES = ['appearance', 'scenarios', 'basemap', 'assistant', 'documentation'] as const
export type SettingsTabName = (typeof SETTINGS_TAB_NAMES)[number]

const isTabName = (v: unknown): v is SettingsTabName => (SETTINGS_TAB_NAMES as readonly unknown[]).includes(v)

/**
 * The schema's `clean` for `settings.tabs`: keeps the known, first-time names in the order written and reports each unknown or
 * repeated one; when nothing usable is left the value is dropped, so every tab is shown.
 */
export function cleanSettingsTabs(value: unknown): { value: unknown; messages: string[] } {
  const list = Array.isArray(value) ? value : []
  const messages: string[] = []
  const kept: SettingsTabName[] = []
  for (const entry of list) {
    if (!isTabName(entry)) messages.push(`unknown tab "${String(entry)}" (known: ${SETTINGS_TAB_NAMES.join(', ')})`)
    else if (kept.includes(entry)) messages.push(`tab "${entry}" is listed twice`)
    else kept.push(entry)
  }
  if (kept.length === 0) {
    messages.push('no usable tab, so all tabs are shown')
    return { value: undefined, messages }
  }
  return { value: kept, messages }
}

/**
 * The tabs the Settings window shows, in order. Unset gives today's five. The assistant switch wins: with the assistant off the
 * Assistant tab is never shown, whether or not it is listed. Never empty: a list that would leave nothing gives the default.
 */
export function resolveSettingsTabs(list: readonly string[] | undefined, opts: { assistantEnabled: boolean }): SettingsTabName[] {
  const base = list && list.length > 0 ? list.filter(isTabName) : [...SETTINGS_TAB_NAMES]
  const shown = base.filter((t) => t !== 'assistant' || opts.assistantEnabled)
  if (shown.length > 0) return shown
  return SETTINGS_TAB_NAMES.filter((t) => t !== 'assistant' || opts.assistantEnabled)
}

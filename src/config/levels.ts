// Adapts the spellings pages and panels already use into schema paths, in one place, so the cascade reads one shape.
//   page:  header.layout_mode -> layout.mode   · default_basemap -> basemap.default
//   panel: its Explore option keys (limits, features, charts, tables, columns, presets) -> explore.*
// A page file's stray top-level key that is a site setting (title, colors, ...) is passed through unchanged so that
// `validate(.., { level: 'page' })` can report it. Pure.
import { isTree, type Tree } from './paths'
import { SETTINGS } from './schema'

/** Top-level keys a page file owns itself; they are not settings even when a setting shares the name (`layout`). */
const PAGE_OWN = new Set(['header', 'sections', 'layout', 'filters', 'panels', 'default_basemap'])
const EXPLORE_KEYS = ['limits', 'features', 'charts', 'tables', 'columns', 'presets'] as const
const ROOTS = new Set(SETTINGS.map((r) => r.path.split('.')[0]))

/** The settings a page file sets, as a schema tree. */
export function pageSettings(raw: unknown): Tree {
  const out: Tree = {}
  if (!isTree(raw)) return out
  const header = isTree(raw.header) ? raw.header : {}
  if (header.layout_mode !== undefined) out.layout = { mode: header.layout_mode }
  if (raw.default_basemap !== undefined) out.basemap = { default: raw.default_basemap }
  // the page-scoped settings; the page's other header keys (tab, title, icon, slug, ...) are not checked here
  const own: Tree = {}
  if (header.docs !== undefined) own.docs = header.docs
  if (header.hidden !== undefined) own.hidden = header.hidden
  if (Object.keys(own).length > 0) out.header = own
  for (const [k, v] of Object.entries(raw)) if (ROOTS.has(k) && !PAGE_OWN.has(k)) out[k] = v
  return out
}

/** The Explore options a panel sets, as a schema tree (`explore.*`). */
export function exploreSettings(panel: unknown): Tree {
  if (!isTree(panel)) return {}
  const explore: Tree = {}
  for (const k of EXPLORE_KEYS) if (panel[k] !== undefined) explore[k] = panel[k]
  return Object.keys(explore).length ? { explore } : {}
}

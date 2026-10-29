// The one cascade: site -> page -> panel (most specific wins). Pure, with provenance for every value.
//
//   scalars replace · maps merge key by key · `replace` lists replace · `concat` lists are joined, broader level first
//   no `null` reset: to switch something off a lower level sets `false` or `[]`
//
// Only rows the schema marks as cascading are taken from a lower level; everything else comes from the first level (the site).
import { getPath, isTree, setPath, type Tree } from './paths'
import { SETTINGS, type SettingDef } from './schema'

export interface NamedLevel {
  /** `site`, `page`, `panel`, or any name a later level (such as panel defaults) wants. */
  name: string
  values: Tree
}

export interface Resolved {
  values: Tree
  /** The level that supplied each path's value. */
  source: Record<string, string>
}

/** Resolves an ordered list of levels, broadest first. */
export function resolveLevels(levels: readonly NamedLevel[], schema: readonly SettingDef[] = SETTINGS): Resolved {
  const values: Tree = {}
  const source: Record<string, string> = {}
  levels.forEach((level, index) => {
    for (const row of schema) {
      if (row.scope === 'page' || (index > 0 && !row.cascade)) continue
      const v = getPath(level.values, row.path)
      if (v === undefined) continue
      const before = getPath(values, row.path)
      setPath(values, row.path, index === 0 || before === undefined ? clone(v) : combine(row, before, v))
      source[row.path] = level.name
    }
  })
  return { values, source }
}

export function resolve(levels: { site: Tree; page?: Tree; panel?: Tree }, schema: readonly SettingDef[] = SETTINGS): Resolved {
  const list: NamedLevel[] = [{ name: 'site', values: levels.site }]
  if (levels.page) list.push({ name: 'page', values: levels.page })
  if (levels.panel) list.push({ name: 'panel', values: levels.panel })
  return resolveLevels(list, schema)
}

function combine(row: SettingDef, higher: unknown, lower: unknown): unknown {
  if (row.type === 'list' && Array.isArray(higher) && Array.isArray(lower) && typeof row.cascade === 'object' && row.cascade.merge === 'concat') {
    return [...higher, ...lower]
  }
  if (isTree(higher) && isTree(lower)) return mergeMaps(higher, lower)
  return clone(lower)
}

function mergeMaps(a: Tree, b: Tree): Tree {
  const out: Tree = { ...a }
  for (const [k, v] of Object.entries(b)) out[k] = isTree(out[k]) && isTree(v) ? mergeMaps(out[k] as Tree, v) : v
  return out
}

function clone<T>(v: T): T {
  return Array.isArray(v) || isTree(v) ? (JSON.parse(JSON.stringify(v)) as T) : v
}

/**
 * Two files of the same level (a deployment's config over the demo's fallback): per row, the first value that is set wins.
 * Unlike the cascade this covers every row, because both files are site-level.
 */
export function overlay(base: Tree, over: Tree, schema: readonly SettingDef[] = SETTINGS): Tree {
  const out: Tree = {}
  for (const row of schema) {
    if (row.scope === 'page') continue
    const v = getPath(over, row.path) ?? getPath(base, row.path)
    if (v !== undefined) setPath(out, row.path, clone(v))
  }
  return out
}

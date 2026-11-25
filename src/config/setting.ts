// One setting's value through the cascade (site -> page -> panel), checked against its schema row: an unknown or invalid
// value falls back to the row's default, so a typo in a page or panel never breaks a tile. An enum row without a `default`
// falls back to its first allowed value (so the row needs no `default`, which `check --explain` would list as set). Pure.
import { getPath, type Tree } from './paths'
import { resolve } from './resolve'
import { indexSchema, SETTINGS, type SettingDef } from './schema'

const { byPath } = indexSchema(SETTINGS)

function valid(def: SettingDef, v: unknown): boolean {
  if (def.type === 'enum') return typeof v === 'string' && (def.values ?? []).includes(v)
  if (def.type === 'boolean') return typeof v === 'boolean'
  if (def.type === 'string') return typeof v === 'string'
  return true
}

/** The value of `path` for a panel on a page (either level may be absent); the schema default when unset or invalid. */
export function settingValue(path: string, levels: { site: Tree; page?: Tree; panel?: Tree }, schema: readonly SettingDef[] = SETTINGS): unknown {
  const def = schema === SETTINGS ? byPath.get(path) : schema.find((r) => r.path === path)
  if (!def) return undefined
  const v = getPath(resolve(levels, schema).values, path)
  return v !== undefined && valid(def, v) ? v : (def.default ?? (def.type === 'enum' ? def.values?.[0] : undefined))
}

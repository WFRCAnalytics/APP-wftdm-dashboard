// Checks one level of settings (the site file, a page, a panel) against the schema table. A wrong value is reported and
// left out, so the key keeps its default and nothing here throws. Pure.
import { getPath, isTree, setPath, type Tree } from './paths'
import { indexSchema, SCHEMA_VERSION, SETTINGS, type SettingDef } from './schema'

export type Level = 'site' | 'page' | 'panel'

export type ProblemKind =
  | 'unknown_key'
  | 'wrong_type'
  | 'invalid_value'
  | 'not_allowed_here'
  | 'duplicate'
  | 'missing_file'
  | 'syntax'
  | 'moved'

export interface ConfigProblem {
  file: string
  /** Key path, for example `years.base`; empty for a whole-file problem. */
  path: string
  message: string
  /** 1-based, only for YAML syntax errors. */
  line?: number
  kind: ProblemKind
}

export interface ValidateOptions {
  file: string
  level?: Level
  schema?: readonly SettingDef[]
}

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const FUNC = /^(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\(.+\)$/i
const KEYWORD = /^[a-z]+$/i

/** A colour as CSS writes it. Named colours are accepted by shape; the browser has the last word where it is drawn. */
export function looksLikeColor(v: string): boolean {
  const s = v.trim()
  return HEX.test(s) || FUNC.test(s) || KEYWORD.test(s)
}

const looksLikeUrl = (v: string): boolean => !/\s/.test(v.trim())

function checkScalar(row: SettingDef, value: unknown): { ok: true; value: unknown } | { ok: false; kind: ProblemKind; message: string } {
  const bad = (message: string, kind: ProblemKind = 'wrong_type') => ({ ok: false as const, kind, message })
  switch (row.type) {
    case 'string':
      return typeof value === 'string' ? { ok: true, value } : bad('expected text')
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? { ok: true, value } : bad('expected a number')
    case 'integer':
      return Number.isInteger(value) ? { ok: true, value } : bad('expected a whole number')
    case 'boolean':
      return typeof value === 'boolean' ? { ok: true, value } : bad('expected true or false')
    case 'boolean|string':
      return typeof value === 'boolean' || typeof value === 'string' ? { ok: true, value } : bad('expected true, false or text')
    case 'color':
      if (typeof value !== 'string') return bad('expected a colour')
      return looksLikeColor(value) ? { ok: true, value } : bad(`"${value}" is not a colour`, 'invalid_value')
    case 'url':
      if (typeof value !== 'string') return bad('expected a URL or path')
      if (value === '') return { ok: true, value: undefined } // an empty one means unset
      return looksLikeUrl(value) ? { ok: true, value } : bad(`"${value}" is not a URL or path`, 'invalid_value')
    case 'enum':
      if (typeof value !== 'string') return bad(`expected one of ${row.values?.join(', ')}`)
      return row.values?.includes(value) ? { ok: true, value } : bad(`"${value}" is not one of ${row.values?.join(', ')}`, 'invalid_value')
    case 'list': {
      if (!Array.isArray(value)) return bad('expected a list')
      if (row.of === 'string' && value.some((e) => typeof e !== 'string')) return bad('every entry must be text')
      if (row.of === 'color') {
        const wrong = value.find((e) => typeof e !== 'string' || !looksLikeColor(e))
        if (wrong !== undefined) return bad(`${JSON.stringify(wrong)} is not a colour`, 'invalid_value')
      }
      if (row.of === 'integer' && value.some((e) => !Number.isInteger(e))) return bad('every entry must be a whole number')
      return { ok: true, value }
    }
    case 'map':
      return isTree(value) ? { ok: true, value } : bad('expected a map')
  }
}

/**
 * `raw` is a parsed YAML object. Returns the valid settings (defaults included) and every problem found. A non-site level
 * may only set keys the schema lets cascade.
 */
export function validate(raw: unknown, opts: ValidateOptions): { settings: Tree; problems: ConfigProblem[] } {
  const { file, level = 'site', schema = SETTINGS } = opts
  const { byPath, groups } = indexSchema(schema)
  const settings: Tree = {}
  const problems: ConfigProblem[] = []
  const report = (path: string, kind: ProblemKind, message: string) => problems.push({ file, path, kind, message })

  if (raw !== undefined && raw !== null && !isTree(raw)) {
    report('', 'wrong_type', 'the file must be a map of settings')
    return { settings: withDefaults(settings, schema), problems }
  }

  const walk = (obj: Tree, prefix: string) => {
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key
      const row = byPath.get(path)
      if (row) {
        if (level !== 'site' && !row.cascade) {
          report(path, 'not_allowed_here', `"${path}" is a site setting and cannot be set on a ${level}`)
          continue
        }
        const checked = checkScalar(row, value)
        if (!checked.ok) {
          report(path, checked.kind, checked.message)
          continue
        }
        const extra = row.check?.(checked.value)
        if (extra) {
          report(path, 'invalid_value', extra)
          continue
        }
        if (checked.value !== undefined) setPath(settings, path, checked.value)
      } else if (groups.has(path)) {
        if (isTree(value)) walk(value, path)
        else report(path, 'wrong_type', 'expected a group of settings')
      } else {
        report(path, 'unknown_key', `unknown setting "${path}"`)
      }
    }
  }
  if (isTree(raw)) walk(raw, '')

  const version = getPath(settings, 'version')
  if (typeof version === 'number' && version > SCHEMA_VERSION) {
    report('version', 'invalid_value', `version ${version} is newer than this app reads (${SCHEMA_VERSION}); reading what it can`)
  }
  const pages = getPath(settings, 'pages')
  if (Array.isArray(pages)) {
    const seen = new Set<string>()
    for (const p of pages as string[]) {
      if (seen.has(p)) report('pages', 'duplicate', `page "${p}" is listed twice`)
      seen.add(p)
    }
  }
  return { settings: level === 'site' ? withDefaults(settings, schema) : settings, problems }
}

function withDefaults(settings: Tree, schema: readonly SettingDef[]): Tree {
  for (const row of schema) {
    if (row.default !== undefined && getPath(settings, row.path) === undefined) setPath(settings, row.path, row.default)
  }
  return settings
}

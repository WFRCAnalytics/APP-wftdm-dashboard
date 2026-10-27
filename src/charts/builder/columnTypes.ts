// 065-chart-builder: the data types a column can have, how one is inferred from what DuckDB reports, and which role
// the type plays in a chart. Pure, so it is unit-testable without a browser (tests/unit/chartBuilderColumnTypes.test.ts).

export const DATA_TYPES = [
  'category', 'integer', 'decimal', 'boolean', 'text', 'id', 'date', 'datetime', 'ordinal', 'geometry', 'complex',
] as const
export type DataType = (typeof DATA_TYPES)[number]

/** What a column does on a chart: n category, o ordered category, q number, t date, '' = not chartable yet. */
export type Role = 'n' | 'o' | 'q' | 't' | ''

export const ROLE_OF: Record<DataType, Role> = {
  category: 'n', integer: 'q', decimal: 'q', boolean: 'n', text: '', id: '', date: 't', datetime: 't', ordinal: 'o',
  geometry: '', complex: '',
}

export const TYPE_LABEL: Record<DataType, string> = {
  category: 'Category', integer: 'Integer', decimal: 'Decimal', boolean: 'Boolean', text: 'Text', id: 'ID',
  date: 'Date', datetime: 'Date and time', ordinal: 'Ordinal', geometry: 'Geometry', complex: 'Nested',
}

/** Lucide-style 24x24 stroke paths, one per type. */
export const TYPE_ICON: Record<DataType, string> = {
  category: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01',
  integer: 'M4 9h16M4 15h16M10 3 8 21M16 3l-2 18',
  decimal: 'M5 19h.01M10 6h4a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z',
  boolean: 'M16 7H8a5 5 0 0 0 0 10h8a5 5 0 0 0 0-10zM8 12h.01',
  text: 'M4 7V5h16v2M9 19h6M12 5v14',
  id: 'M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4',
  date: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  datetime: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  ordinal: 'M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1',
  geometry: 'M12 3l9 6-3.5 11h-11L3 9z',
  complex: 'M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3',
}

export interface InferInput {
  name: string
  /** DuckDB type name as DESCRIBE reports it, e.g. `INTEGER`, `DECIMAL(18,3)`, `VARCHAR`. */
  dbType: string
  rows?: number
  distinct?: number
  /** Average text length for a string column. */
  avgLength?: number
}

const ID_NAME = /(^|_)(id|uuid|key)$/i
const INT_ID_NAME = /(^|_)(id|taz|zone|code)$/i
const INTEGERS = /^(U?(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT)|INT\d*|UINT\d*|INT)$/
const DECIMALS = /^(FLOAT|REAL|DOUBLE|DECIMAL|NUMERIC)$/

/** Infers a column's data type. Ordinal is never inferred: it has no native type, so a person sets it. */
export function inferDataType(i: InferInput): DataType {
  const raw = i.dbType.trim().toUpperCase()
  if (/^(LIST|STRUCT|MAP|UNION|ARRAY)\b/.test(raw) || raw.endsWith(']')) return 'complex'
  const base = raw.replace(/\(.*$/, '').trim()
  if (base === 'BOOLEAN' || base === 'BOOL') return 'boolean'
  if (INTEGERS.test(base)) return INT_ID_NAME.test(i.name) ? 'id' : 'integer'
  if (DECIMALS.test(base)) return 'decimal'
  if (base === 'DATE') return 'date'
  if (base.startsWith('TIMESTAMP') || base.startsWith('TIME') || base === 'DATETIME') return 'datetime'
  if (base === 'GEOMETRY') return 'geometry'
  if (base === 'BLOB' || base === 'WKB_BLOB') return /geom|geometry|shape|wkb/i.test(i.name) ? 'geometry' : 'complex'
  if (base === 'UUID') return 'id'
  if (base === 'VARCHAR' || base === 'STRING' || base === 'TEXT' || base.startsWith('ENUM')) {
    if (ID_NAME.test(i.name)) return 'id'
    if (base.startsWith('ENUM')) return 'category'
    const rows = i.rows ?? 0, distinct = i.distinct ?? 0, avg = i.avgLength ?? 0
    if (avg > 40) return 'text'
    if (rows >= 50 && distinct / rows > 0.9) return avg <= 16 ? 'id' : 'text'
    return 'category'
  }
  return 'text'
}

export function chartRole(t: DataType): Role {
  return ROLE_OF[t]
}

/** True when a channel that accepts the role letters (e.g. `not`) can take a column of this role. */
export function roleAccepts(accepts: string, role: Role): boolean {
  return role !== '' && accepts.includes(role)
}

/** The types present in a list of columns, with counts, in the fixed display order. */
export function typesPresent(cols: readonly { type: DataType }[]): { type: DataType; count: number }[] {
  const counts = new Map<DataType, number>()
  for (const c of cols) counts.set(c.type, (counts.get(c.type) ?? 0) + 1)
  return DATA_TYPES.filter((t) => counts.has(t)).map((t) => ({ type: t, count: counts.get(t) ?? 0 }))
}

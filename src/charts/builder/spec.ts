// 065-chart-builder: the chart specification a visualization tab edits, what each mark accepts, and the portable JSON
// configuration (export/import). Pure. Contract: specs/065-chart-builder/contracts/chart-spec.md.
import { roleAccepts, type DataType, type Role } from '@/charts/builder/columnTypes'

export const MARKS = ['bar', 'line', 'area', 'scatter', 'heatmap', 'histogram', 'box', 'pie', 'tick', 'text', 'waffle', 'density', 'rule', 'treemap', 'radar'] as const
export type Mark = (typeof MARKS)[number]
export type Channel = 'x' | 'y' | 'color' | 'pattern' | 'dash' | 'shape' | 'size' | 'opacity' | 'detail' | 'label' | 'column' | 'row'
export type Agg = 'sum' | 'mean' | 'median' | 'min' | 'max' | 'count'
export const AGGS: Agg[] = ['sum', 'mean', 'median', 'min', 'max', 'count']
export type Stack = 'group' | 'stack' | 'normalize'
export type TextSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'
export const TEXT_SIZES: { v: TextSize; label: string }[] = [
  { v: 'xs', label: 'Extra small' }, { v: 'sm', label: 'Small' }, { v: 'md', label: 'Medium' }, { v: 'lg', label: 'Large' }, { v: 'xl', label: 'Extra large' },
]

export interface FieldDef { f: string; agg?: Agg | null }
export interface TextBlock { t: string; size: TextSize; b: boolean; i: boolean }
export type TextKey = 'title' | 'sub' | 'src' | 'note'

export interface ChartSpec {
  mark: Mark
  donut: boolean
  stack: Stack
  enc: Partial<Record<Channel, FieldDef>>
  filter: { f: string; v: string }
  zero: boolean
  grid: boolean
  ref: string
  text: Record<TextKey, TextBlock>
}

export interface Slot { ch: Channel; req: boolean; accepts: string }
const S = (a: [Channel, number, string][]): Slot[] => a.map(([ch, r, accepts]) => ({ ch, req: !!r, accepts }))

/** Channels per mark: which are required and which roles (n, o, q, t) each takes. A mark never shows other channels. */
export const SLOTS: Record<Mark, Slot[]> = {
  bar: S([['x', 1, 'not'], ['y', 1, 'q'], ['color', 0, 'no'], ['pattern', 0, 'no'], ['column', 0, 'no'], ['row', 0, 'no']]),
  line: S([['x', 1, 'otq'], ['y', 1, 'q'], ['color', 0, 'no'], ['dash', 0, 'no'], ['shape', 0, 'no'], ['detail', 0, 'no'], ['column', 0, 'no'], ['row', 0, 'no']]),
  area: S([['x', 1, 'otq'], ['y', 1, 'q'], ['color', 0, 'no'], ['pattern', 0, 'no'], ['detail', 0, 'no'], ['column', 0, 'no'], ['row', 0, 'no']]),
  scatter: S([['x', 1, 'q'], ['y', 1, 'q'], ['color', 0, 'no'], ['shape', 0, 'no'], ['size', 0, 'q'], ['opacity', 0, 'q'], ['detail', 0, 'no'], ['label', 0, 'notq'], ['column', 0, 'no'], ['row', 0, 'no']]),
  histogram: S([['x', 1, 'q'], ['color', 0, 'no'], ['pattern', 0, 'no'], ['column', 0, 'no'], ['row', 0, 'no']]),
  box: S([['x', 1, 'no'], ['y', 1, 'q'], ['color', 0, 'no'], ['column', 0, 'no'], ['row', 0, 'no']]),
  heatmap: S([['x', 1, 'not'], ['y', 1, 'not'], ['color', 1, 'q'], ['column', 0, 'no'], ['row', 0, 'no']]),
  pie: S([['color', 1, 'no'], ['size', 1, 'q'], ['pattern', 0, 'no'], ['column', 0, 'no'], ['row', 0, 'no']]),
  tick: S([['x', 1, 'q'], ['y', 0, 'no'], ['color', 0, 'no'], ['column', 0, 'no'], ['row', 0, 'no']]),
  text: S([['x', 1, 'not'], ['y', 1, 'not'], ['label', 1, 'q'], ['column', 0, 'no'], ['row', 0, 'no']]),
  waffle: S([['color', 1, 'no'], ['size', 1, 'q'], ['pattern', 0, 'no'], ['column', 0, 'no'], ['row', 0, 'no']]),
  density: S([['x', 1, 'q'], ['color', 0, 'no'], ['pattern', 0, 'no'], ['column', 0, 'no'], ['row', 0, 'no']]),
  rule: S([['x', 1, 'q'], ['y', 1, 'no'], ['color', 0, 'no'], ['column', 0, 'no'], ['row', 0, 'no']]),
  treemap: S([['color', 1, 'no'], ['size', 1, 'q'], ['pattern', 0, 'no'], ['column', 0, 'no'], ['row', 0, 'no']]),
  radar: S([['x', 1, 'no'], ['y', 1, 'q'], ['color', 0, 'no'], ['column', 0, 'no'], ['row', 0, 'no']]),
}

export const MARK_LABEL: Record<Mark, string> = {
  bar: 'Bar', line: 'Line', area: 'Area', scatter: 'Scatter', heatmap: 'Heatmap', histogram: 'Histogram', box: 'Box', pie: 'Pie', tick: 'Tick strip', text: 'Text table', waffle: 'Waffle', density: 'Density', rule: 'Rule', treemap: 'Treemap', radar: 'Radar',
}
export const MARK_ICON: Record<Mark, string> = {
  bar: 'M5 20V11M12 20V5M19 20v-6', line: 'M3 17l5-6 4 3 8-9', area: 'M3 19v-6l5-5 4 3 9-6v14z',
  scatter: 'M7 16h.01M11 9h.01M15 14h.01M18 6h.01M8 7h.01M19 17h.01', heatmap: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  histogram: 'M4 20v-7h4v7M8 20V6h4v14M12 20V9h4v11M16 20v-5h4v5', box: 'M12 3v4M12 17v4M7 7h10v10H7zM7 12h10',
  pie: 'M12 3a9 9 0 1 0 9 9h-9zM14.5 3.5A9 9 0 0 1 20.5 9.5H14.5z',
  tick: 'M5 6v6M9 8v4M12 5v7M16 7v5M19 6v6M4 18h16', text: 'M4 6h16M4 12h16M4 18h16M9 4v16M15 4v16', waffle: 'M4 4h5v5H4zM11 4h5v5h-5zM4 11h5v5H4zM11 11h5v5h-5zM18 11h2v5h-2zM4 18h16',
  density: 'M3 19c3 0 3-12 6-12s3 12 6 12 3-6 6-6M3 19h18', rule: 'M4 7h12M4 12h16M4 17h8M16 5v4M20 10v4M12 15v4', treemap: 'M3 3h11v10H3zM14 3h7v6h-7zM14 9h7v4h-7zM3 13h7v8H3zM10 13h11v8H10z', radar: 'M12 3l8 6-3 10H7L4 9zM12 3v18M4 9l16 0M7 19L17 19',
}
export const COMING_SOON = ['Sunburst', 'Sankey', 'Chord', 'Map', 'Trail']

export const ROLE_WORD: Record<Exclude<Role, ''>, string> = { n: 'a category', o: 'an ordered category', q: 'a number', t: 'a date' }
export const ROLE_SHORT: Record<Exclude<Role, ''>, string> = { n: 'category', o: 'ordered', q: 'number', t: 'date' }
export const acceptsText = (accepts: string): string => accepts.length >= 4 ? 'any column' : accepts.split('').map((c) => ROLE_WORD[c as Exclude<Role, ''>]).join(' or ')
export const acceptsShort = (accepts: string): string => accepts.length >= 4 ? 'any column' : accepts.split('').map((c) => ROLE_SHORT[c as Exclude<Role, ''>]).join(' or ')

export function channelLabel(mark: Mark, ch: Channel): string {
  if (mark === 'pie' && ch === 'size') return 'Slice size'
  if (mark === 'waffle' && ch === 'size') return 'Share of squares'
  if (mark === 'treemap' && ch === 'size') return 'Tile size'
  if (mark === 'radar' && ch === 'x') return 'Spokes'
  if (mark === 'density' && ch === 'x') return 'Values'
  if (mark === 'text' && ch === 'label') return 'Cell text'
  if (mark === 'heatmap' && ch === 'color') return 'Cell value'
  if (mark === 'histogram' && ch === 'x') return 'Values to bin'
  return { x: 'X axis', y: 'Y axis', color: 'Colour', pattern: 'Hatch', dash: 'Dash', shape: 'Shape', size: 'Size', opacity: 'Opacity', detail: 'Detail', label: 'Label', column: 'Columns', row: 'Rows' }[ch]
}

/** The aggregate a number gets by default on a channel that totals (bar, line and area y; heatmap cell; pie slice). */
export function defaultAgg(mark: Mark, ch: Channel, role: Role): Agg | null {
  if (role !== 'q') return null
  if (ch === 'y' && (mark === 'bar' || mark === 'line' || mark === 'area' || mark === 'radar')) return 'sum'
  if (ch === 'color' && mark === 'heatmap') return 'sum'
  if (ch === 'size' && (mark === 'pie' || mark === 'waffle' || mark === 'treemap')) return 'sum'
  if (ch === 'label' && mark === 'text') return 'sum'
  return null
}
export const channelAggregates = (mark: Mark, ch: Channel): boolean => defaultAgg(mark, ch, 'q') !== null

export function defaultSpec(over: Partial<ChartSpec> = {}): ChartSpec {
  return {
    mark: 'bar', donut: false, stack: 'group', enc: {}, filter: { f: '', v: '' }, zero: false, grid: true, ref: '',
    text: {
      title: { t: '', size: 'lg', b: true, i: false }, sub: { t: '', size: 'md', b: false, i: false },
      src: { t: '', size: 'xs', b: false, i: true }, note: { t: '', size: 'xs', b: false, i: false },
    },
    ...over,
  }
}

export type Assign = { ok: true; spec: ChartSpec } | { ok: false; reason: string }

/** Places a field on a channel, refusing with a reason when its role does not fit. */
export function assignField(spec: ChartSpec, ch: Channel, field: string, _type: DataType, role: Role): Assign {
  const slot = SLOTS[spec.mark].find((s) => s.ch === ch)
  if (!slot) return { ok: false, reason: `${channelLabel(spec.mark, ch)} is not used by this chart.` }
  if (!roleAccepts(slot.accepts, role)) {
    return { ok: false, reason: role ? `${field} is ${ROLE_WORD[role]}. ${channelLabel(spec.mark, ch)} takes ${acceptsText(slot.accepts)}.` : `This type of column can't go on a chart yet.` }
  }
  return { ok: true, spec: { ...spec, enc: { ...spec.enc, [ch]: { f: field, agg: defaultAgg(spec.mark, ch, role) } } } }
}

/** Switches the mark and keeps every encoding the new mark can still use; returns what was dropped. */
export function switchMark(spec: ChartSpec, mark: Mark, roleOf: (field: string) => Role): { spec: ChartSpec; dropped: Channel[] } {
  const enc: ChartSpec['enc'] = {}
  const dropped: Channel[] = []
  for (const [ch, e] of Object.entries(spec.enc) as [Channel, FieldDef][]) {
    const slot = SLOTS[mark].find((s) => s.ch === ch)
    if (slot && roleAccepts(slot.accepts, roleOf(e.f))) enc[ch] = { f: e.f, agg: defaultAgg(mark, ch, roleOf(e.f)) }
    else dropped.push(ch)
  }
  return { spec: { ...spec, mark, enc, stack: mark === 'area' && spec.stack === 'group' ? 'stack' : spec.stack }, dropped }
}

// ---------------------------------------------------------------- portable configuration

export interface ChartConfig {
  version: 1
  data: { relation: string; source: { scenarios: string[]; sql: string } }
  mark: string
  encoding: Partial<Record<Channel, { field: string; type?: string; aggregate?: Agg }>>
  stack: Stack
  filter: { field: string; op: '='; value: string }[]
  axes: { zeroBaseline: boolean; gridlines: boolean; referenceLine: number | null }
  text: Partial<Record<'title' | 'subtitle' | 'source' | 'note', { text: string; size: TextSize; weight: 'normal' | 'bold'; italic: boolean }>>
}

const TEXT_KEYS: [TextKey, 'title' | 'subtitle' | 'source' | 'note'][] = [['title', 'title'], ['sub', 'subtitle'], ['src', 'source'], ['note', 'note']]

export function toConfig(spec: ChartSpec, ctx: { relation: string; scenarios: string[]; sql: string; typeOf(field: string): string | undefined }): ChartConfig {
  const encoding: ChartConfig['encoding'] = {}
  for (const [ch, e] of Object.entries(spec.enc) as [Channel, FieldDef][]) encoding[ch] = { field: e.f, type: ctx.typeOf(e.f), ...(e.agg ? { aggregate: e.agg } : {}) }
  const text: ChartConfig['text'] = {}
  for (const [k, name] of TEXT_KEYS) {
    const t = spec.text[k]
    if (t.t) text[name] = { text: t.t, size: t.size, weight: t.b ? 'bold' : 'normal', italic: t.i }
  }
  return {
    version: 1,
    data: { relation: ctx.relation, source: { scenarios: ctx.scenarios, sql: ctx.sql } },
    mark: spec.mark + (spec.mark === 'pie' && spec.donut ? ':donut' : ''),
    encoding, stack: spec.stack,
    filter: spec.filter.f ? [{ field: spec.filter.f, op: '=', value: spec.filter.v }] : [],
    axes: { zeroBaseline: spec.zero, gridlines: spec.grid, referenceLine: spec.ref === '' ? null : Number(spec.ref) },
    text,
  }
}

export interface ImportContext {
  scenarios: readonly string[]
  /** Columns of a relation, or undefined when the relation does not exist here. */
  columnsOf(relation: string, scenarios: readonly string[]): { name: string }[] | undefined
}
export type ImportResult = { ok: true; spec: ChartSpec; relation: string; scenarios: string[] } | { ok: false; errors: string[] }

/** Validates a configuration file and turns it into a spec. Every problem is listed with its path. */
export function fromConfig(text: string, ctx: ImportContext): ImportResult {
  let c: Partial<ChartConfig>
  try { c = JSON.parse(text) as Partial<ChartConfig> } catch (e) { return { ok: false, errors: [`This is not valid JSON: ${(e as Error).message}`] } }
  const errors: string[] = []
  if (!c || c.version !== 1) errors.push('version: expected 1.')
  const markRaw = String(c?.mark ?? '')
  const donut = markRaw.endsWith(':donut')
  const mark = markRaw.replace(/:donut$/, '') as Mark
  if (!MARKS.includes(mark)) errors.push(`mark: "${mark}" is not available yet. Supported: ${MARKS.join(', ')}.`)
  const relation = c?.data?.relation
  if (!relation) errors.push('data.relation: missing.')
  const want = c?.data?.source?.scenarios
  let scenarios = [...ctx.scenarios]
  if (Array.isArray(want)) {
    const missing = want.filter((s) => !ctx.scenarios.includes(s))
    if (missing.length) errors.push(`data.source.scenarios: not loaded here: ${missing.join(', ')}.`)
    else scenarios = ctx.scenarios.filter((s) => want.includes(s))
  }
  if (errors.length || !relation) return { ok: false, errors }
  const cols = ctx.columnsOf(relation, scenarios)
  if (!cols) return { ok: false, errors: [`data.relation: ${relation} is not a table here.`] }
  const enc: ChartSpec['enc'] = {}
  for (const [ch, e] of Object.entries(c.encoding ?? {}) as [Channel, { field: string; aggregate?: Agg }][]) {
    if (!SLOTS[mark].some((s) => s.ch === ch)) { errors.push(`encoding.${ch}: not used by ${mark}.`); continue }
    if (!cols.some((x) => x.name === e.field)) { errors.push(`encoding.${ch}.field: "${e.field}" is not a column of ${relation}.`); continue }
    enc[ch] = { f: e.field, agg: e.aggregate ?? null }
  }
  if (errors.length) return { ok: false, errors }
  const spec = defaultSpec({
    mark, donut, enc, stack: c.stack ?? 'group',
    filter: c.filter?.[0] ? { f: c.filter[0].field, v: String(c.filter[0].value) } : { f: '', v: '' },
    zero: c.axes?.zeroBaseline === true, grid: c.axes?.gridlines !== false,
    ref: c.axes?.referenceLine === null || c.axes?.referenceLine === undefined ? '' : String(c.axes.referenceLine),
  })
  for (const [k, name] of TEXT_KEYS) {
    const t = c.text?.[name]
    if (t) spec.text[k] = { t: t.text ?? '', size: t.size ?? spec.text[k].size, b: t.weight === 'bold', i: !!t.italic }
  }
  return { ok: true, spec, relation, scenarios }
}

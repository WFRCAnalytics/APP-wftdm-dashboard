// 065-chart-builder: the chart specification a visualization tab edits, what each mark accepts, and the portable JSON
// configuration (export/import). Pure. Contract: specs/065-chart-builder/contracts/chart-spec.md.
import { roleAccepts, type DataType, type Role } from '@/charts/builder/columnTypes'

export const MARKS = ['bar', 'line', 'area', 'scatter', 'heatmap', 'histogram', 'box', 'pie', 'tick', 'text', 'waffle', 'density', 'rule', 'treemap', 'radar', 'sunburst', 'sankey', 'chord', 'trail'] as const
/** Marks with no axes, so panning and zooming the drawing cannot distort a scale: they get drag to pan, wheel to zoom, double click to reset. */
export const ZOOMABLE_MARKS: readonly string[] = ['pie', 'waffle', 'radar', 'sankey', 'chord']
export type Mark = (typeof MARKS)[number]
export type Channel = 'x' | 'y' | 'color' | 'pattern' | 'dash' | 'shape' | 'size' | 'opacity' | 'detail' | 'ring3' | 'ring4' | 'ring5' | 'rg2' | 'rg3' | 'rg4' | 'cg2' | 'cg3' | 'cg4' | 'val2' | 'val3' | 'val4' | 'label' | 'order' | 'column' | 'row'
/** The extra levels of a treemap or sunburst, after colour (level 1) and detail (level 2): each is one more nesting level. */
export const RING_CHANNELS: Channel[] = ['ring3', 'ring4', 'ring5']
export type Agg = 'sum' | 'mean' | 'median' | 'min' | 'max' | 'count'
export const AGGS: Agg[] = ['sum', 'mean', 'median', 'min', 'max', 'count']
export type Stack = 'group' | 'stack' | 'normalize'
/** How the categories of a bar or line chart are ordered: the data's own order, tallest or shortest first, or reversed. */
export type Sort = 'natural' | 'high' | 'low' | 'reverse'
export const SORTS: { v: Sort; label: string }[] = [
  { v: 'natural', label: 'Natural' }, { v: 'high', label: 'Largest first' }, { v: 'low', label: 'Smallest first' }, { v: 'reverse', label: 'Reversed' },
]
export type TextSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'
export const TEXT_SIZES: { v: TextSize; label: string }[] = [
  { v: 'xs', label: 'Extra small' }, { v: 'sm', label: 'Small' }, { v: 'md', label: 'Medium' }, { v: 'lg', label: 'Large' }, { v: 'xl', label: 'Extra large' },
]

/** How a table cell is shown: the value itself, or its share of its row, its column, or the whole table. */
export type ShowAs = 'value' | 'row' | 'col' | 'total'
export const SHOW_AS: { v: ShowAs; label: string }[] = [
  { v: 'value', label: 'Value' }, { v: 'row', label: '% of row' }, { v: 'col', label: '% of column' }, { v: 'total', label: '% of total' },
]
/** How a table measure is written: decimals (null: chosen from the numbers), a prefix and a suffix ("$", " mi"), and what it shows. */
export interface MeasureFormat { show?: ShowAs; dec?: number | null; pre?: string; suf?: string }
export interface FieldDef extends MeasureFormat { f: string; agg?: Agg | null }

export type CellStyle = 'plain' | 'shade' | 'bars'
export type Density = 'comfortable' | 'compact'
/** Options of the table (text table) mark. */
export interface TableOpts { cells: CellStyle; density: Density; subtotals: boolean; transpose: boolean }
export const TABLE_DEFAULTS: TableOpts = { cells: 'plain', density: 'comfortable', subtotals: true, transpose: false }
export interface TextBlock { t: string; size: TextSize; b: boolean; i: boolean }
export type TextKey = 'title' | 'sub' | 'src' | 'note'

export interface ChartSpec {
  mark: Mark
  donut: boolean
  stack: Stack
  sort: Sort
  enc: Partial<Record<Channel, FieldDef>>
  filter: { f: string; v: string }
  zero: boolean
  grid: boolean
  table: TableOpts
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
  text: S([['y', 1, 'not'], ['rg2', 0, 'not'], ['rg3', 0, 'not'], ['rg4', 0, 'not'], ['x', 1, 'not'], ['cg2', 0, 'not'], ['cg3', 0, 'not'], ['cg4', 0, 'not'], ['label', 1, 'q'], ['val2', 0, 'q'], ['val3', 0, 'q'], ['val4', 0, 'q'], ['column', 0, 'no'], ['row', 0, 'no']]),
  waffle: S([['color', 1, 'no'], ['size', 1, 'q'], ['pattern', 0, 'no'], ['column', 0, 'no'], ['row', 0, 'no']]),
  density: S([['x', 1, 'q'], ['color', 0, 'no'], ['pattern', 0, 'no'], ['column', 0, 'no'], ['row', 0, 'no']]),
  rule: S([['x', 1, 'q'], ['y', 1, 'no'], ['color', 0, 'no'], ['column', 0, 'no'], ['row', 0, 'no']]),
  treemap: S([['color', 1, 'no'], ['detail', 0, 'no'], ['ring3', 0, 'no'], ['ring4', 0, 'no'], ['ring5', 0, 'no'], ['size', 1, 'q'], ['pattern', 0, 'no'], ['column', 0, 'no'], ['row', 0, 'no']]),
  radar: S([['x', 1, 'no'], ['y', 1, 'q'], ['color', 0, 'no'], ['column', 0, 'no'], ['row', 0, 'no']]),
  sunburst: S([['color', 1, 'no'], ['detail', 0, 'no'], ['ring3', 0, 'no'], ['ring4', 0, 'no'], ['ring5', 0, 'no'], ['size', 1, 'q'], ['column', 0, 'no'], ['row', 0, 'no']]),
  sankey: S([['x', 1, 'no'], ['y', 1, 'no'], ['size', 1, 'q'], ['column', 0, 'no'], ['row', 0, 'no']]),
  chord: S([['x', 1, 'no'], ['y', 1, 'no'], ['size', 1, 'q'], ['column', 0, 'no'], ['row', 0, 'no']]),
  trail: S([['x', 1, 'q'], ['y', 1, 'q'], ['order', 1, 'qot'], ['color', 0, 'no'], ['column', 0, 'no'], ['row', 0, 'no']]),
}

/**
 * Channels that are added one at a time: only the ones in use show, plus one "Add" pill for the next. Treemap and sunburst nest
 * further levels; a table nests row groups and column groups and takes more than one measure.
 */
export interface Chain { chs: Channel[]; add: string }
const LEVELS: Channel[] = ['detail', ...RING_CHANNELS]
export const CHAINS: Partial<Record<Mark, Chain[]>> = {
  treemap: [{ chs: LEVELS, add: 'Add level' }],
  sunburst: [{ chs: LEVELS, add: 'Add ring' }],
  text: [{ chs: ['rg2', 'rg3', 'rg4'], add: 'Add row group' }, { chs: ['cg2', 'cg3', 'cg4'], add: 'Add column group' }, { chs: ['val2', 'val3', 'val4'], add: 'Add value' }],
}
export const chainOf = (mark: Mark, ch: Channel): Chain | undefined => CHAINS[mark]?.find((c) => c.chs.includes(ch))
/** Table channels in reading order: the row-group fields, the column-group fields, the measures. */
export const TABLE_ROWS: Channel[] = ['y', 'rg2', 'rg3', 'rg4']
export const TABLE_COLS: Channel[] = ['x', 'cg2', 'cg3', 'cg4']
export const TABLE_VALUES: Channel[] = ['label', 'val2', 'val3', 'val4']

export const MARK_LABEL: Record<Mark, string> = {
  bar: 'Bar', line: 'Line', area: 'Area', scatter: 'Scatter', heatmap: 'Heatmap', histogram: 'Histogram', box: 'Box', pie: 'Pie', tick: 'Tick strip', text: 'Text table', waffle: 'Waffle', density: 'Density', rule: 'Rule', treemap: 'Treemap', radar: 'Radar', sunburst: 'Sunburst', sankey: 'Sankey', chord: 'Chord', trail: 'Trail',
}
/** Charts that are planned and shown dimmed at the end of the chart grid. */
export const COMING_SOON: string[] = ['Map']

export const ROLE_WORD: Record<Exclude<Role, ''>, string> = { n: 'a category', o: 'an ordered category', q: 'a number', t: 'a date' }
export const ROLE_SHORT: Record<Exclude<Role, ''>, string> = { n: 'category', o: 'ordered', q: 'number', t: 'date' }
export const acceptsText = (accepts: string): string => accepts.length >= 4 ? 'any column' : accepts.split('').map((c) => ROLE_WORD[c as Exclude<Role, ''>]).join(' or ')
export const acceptsShort = (accepts: string): string => accepts.length >= 4 ? 'any column' : accepts.split('').map((c) => ROLE_SHORT[c as Exclude<Role, ''>]).join(' or ')

export function channelLabel(mark: Mark, ch: Channel): string {
  if (mark === 'pie' && ch === 'size') return 'Slice size'
  if (mark === 'waffle' && ch === 'size') return 'Share of squares'
  if (mark === 'treemap') { if (ch === 'color') return 'Groups'; if (ch === 'detail') return 'Tiles in a group'; if (ch === 'ring3') return 'Third level'; if (ch === 'ring4') return 'Fourth level'; if (ch === 'ring5') return 'Fifth level'; if (ch === 'size') return 'Tile size' }
  if (mark === 'sunburst') { if (ch === 'color') return 'Inner ring'; if (ch === 'detail') return 'Second ring'; if (ch === 'ring3') return 'Third ring'; if (ch === 'ring4') return 'Fourth ring'; if (ch === 'ring5') return 'Fifth ring'; if (ch === 'size') return 'Slice size' }
  if (mark === 'text') {
    const t: Partial<Record<Channel, string>> = { y: 'Rows', rg2: 'Row group 2', rg3: 'Row group 3', rg4: 'Row group 4', x: 'Columns', cg2: 'Column group 2', cg3: 'Column group 3', cg4: 'Column group 4', label: 'Values', val2: 'Value 2', val3: 'Value 3', val4: 'Value 4', column: 'Panels across', row: 'Panels down' }
    if (t[ch]) return t[ch]!
  }
  if ((mark === 'sankey' || mark === 'chord') && ch === 'x') return 'From'
  if ((mark === 'sankey' || mark === 'chord') && ch === 'y') return 'To'
  if ((mark === 'sankey' || mark === 'chord') && ch === 'size') return 'Flow'
  if (mark === 'radar' && ch === 'x') return 'Spokes'
  if (mark === 'density' && ch === 'x') return 'Values'
  if (mark === 'text' && ch === 'label') return 'Cell text'
  if (mark === 'heatmap' && ch === 'color') return 'Cell value'
  if (mark === 'histogram' && ch === 'x') return 'Values to bin'
  return { x: 'X axis', y: 'Y axis', color: 'Colour', pattern: 'Hatch', dash: 'Dash', shape: 'Shape', size: 'Size', opacity: 'Opacity', detail: 'Detail', rg2: 'Row group 2', rg3: 'Row group 3', rg4: 'Row group 4', cg2: 'Column group 2', cg3: 'Column group 3', cg4: 'Column group 4', val2: 'Value 2', val3: 'Value 3', val4: 'Value 4', ring3: 'Level 3', ring4: 'Level 4', ring5: 'Level 5', label: 'Label', order: 'Order', column: 'Columns', row: 'Rows' }[ch]
}

/** The aggregate a number gets by default on a channel that totals (bar, line and area y; heatmap cell; pie slice). */
export function defaultAgg(mark: Mark, ch: Channel, role: Role): Agg | null {
  if (role !== 'q') return null
  if (ch === 'y' && (mark === 'bar' || mark === 'line' || mark === 'area' || mark === 'radar')) return 'sum'
  if (ch === 'color' && mark === 'heatmap') return 'sum'
  if (ch === 'size' && (mark === 'pie' || mark === 'waffle' || mark === 'treemap' || mark === 'sunburst' || mark === 'sankey' || mark === 'chord')) return 'sum'
  if ((ch === 'label' || ch === 'val2' || ch === 'val3' || ch === 'val4') && mark === 'text') return 'sum'
  return null
}
export const channelAggregates = (mark: Mark, ch: Channel): boolean => defaultAgg(mark, ch, 'q') !== null

export function defaultSpec(over: Partial<ChartSpec> = {}): ChartSpec {
  return {
    mark: 'bar', donut: false, stack: 'group', sort: 'natural', enc: {}, filter: { f: '', v: '' }, zero: false, grid: true, table: { ...TABLE_DEFAULTS }, ref: '',
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
  encoding: Partial<Record<Channel, { field: string; type?: string; aggregate?: Agg; show?: ShowAs; decimals?: number; prefix?: string; suffix?: string }>>
  stack: Stack
  filter: { field: string; op: '='; value: string }[]
  axes: { zeroBaseline: boolean; gridlines: boolean; referenceLine: number | null; sort?: Sort }
  /** Only the options that differ from the defaults. */
  table?: Partial<TableOpts>
  text: Partial<Record<'title' | 'subtitle' | 'source' | 'note', { text: string; size: TextSize; weight: 'normal' | 'bold'; italic: boolean }>>
}

const TEXT_KEYS: [TextKey, 'title' | 'subtitle' | 'source' | 'note'][] = [['title', 'title'], ['sub', 'subtitle'], ['src', 'source'], ['note', 'note']]

const tableDiff = (t: TableOpts): Partial<TableOpts> => Object.fromEntries(Object.entries(t).filter(([k, v]) => v !== TABLE_DEFAULTS[k as keyof TableOpts])) as Partial<TableOpts>

export function toConfig(spec: ChartSpec, ctx: { relation: string; scenarios: string[]; sql: string; typeOf(field: string): string | undefined }): ChartConfig {
  const encoding: ChartConfig['encoding'] = {}
  for (const [ch, e] of Object.entries(spec.enc) as [Channel, FieldDef][]) encoding[ch] = {
    field: e.f, type: ctx.typeOf(e.f), ...(e.agg ? { aggregate: e.agg } : {}),
    ...(e.show && e.show !== 'value' ? { show: e.show } : {}), ...(typeof e.dec === 'number' ? { decimals: e.dec } : {}), ...(e.pre ? { prefix: e.pre } : {}), ...(e.suf ? { suffix: e.suf } : {}),
  }
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
    axes: { zeroBaseline: spec.zero, gridlines: spec.grid, referenceLine: spec.ref === '' ? null : Number(spec.ref), ...(spec.sort !== 'natural' ? { sort: spec.sort } : {}) },
    ...(Object.keys(tableDiff(spec.table)).length ? { table: tableDiff(spec.table) } : {}),
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
  for (const [ch, e] of Object.entries(c.encoding ?? {}) as [Channel, { field: string; aggregate?: Agg; show?: ShowAs; decimals?: number; prefix?: string; suffix?: string }][]) {
    if (!SLOTS[mark].some((s) => s.ch === ch)) { errors.push(`encoding.${ch}: not used by ${mark}.`); continue }
    if (!cols.some((x) => x.name === e.field)) { errors.push(`encoding.${ch}.field: "${e.field}" is not a column of ${relation}.`); continue }
    if (e.show !== undefined && !SHOW_AS.some((o) => o.v === e.show)) { errors.push(`encoding.${ch}.show: "${String(e.show)}" is not one of ${SHOW_AS.map((o) => o.v).join(', ')}.`); continue }
    enc[ch] = { f: e.field, agg: e.aggregate ?? null, ...(e.show ? { show: e.show } : {}), ...(typeof e.decimals === 'number' ? { dec: e.decimals } : {}), ...(e.prefix ? { pre: e.prefix } : {}), ...(e.suffix ? { suf: e.suffix } : {}) }
  }
  const sort = c.axes?.sort
  if (sort !== undefined && !SORTS.some((o) => o.v === sort)) errors.push(`axes.sort: "${String(sort)}" is not one of ${SORTS.map((o) => o.v).join(', ')}.`)
  const tb = c.table ?? {}
  if (tb.cells !== undefined && !['plain', 'shade', 'bars'].includes(tb.cells)) errors.push(`table.cells: "${String(tb.cells)}" is not one of plain, shade, bars.`)
  if (tb.density !== undefined && !['comfortable', 'compact'].includes(tb.density)) errors.push(`table.density: "${String(tb.density)}" is not one of comfortable, compact.`)
  if (errors.length) return { ok: false, errors }
  const spec = defaultSpec({
    table: { ...TABLE_DEFAULTS, ...(tb.cells ? { cells: tb.cells } : {}), ...(tb.density ? { density: tb.density } : {}), ...(tb.subtotals === false ? { subtotals: false } : {}), ...(tb.transpose === true ? { transpose: true } : {}) },
    mark, donut, enc, stack: c.stack ?? 'group', sort: sort ?? 'natural',
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

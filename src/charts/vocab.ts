// Category vocabularies and their display order (project-docs/redesign/04-chart-catalogue.md, top). Charts draw
// categories in this order whatever order a table returns them in; a category absent from a table still gets its slot.
//
// The arrays are live: a deployment can describe its own categories in dashboard-config/index.json (`vocab`), and
// `configureVocab` replaces their contents in place at boot, so every `import { MODES }` keeps working. Raw values in a
// run's tables are mapped onto these labels when the rows are loaded (charts/data/adapt.ts), several raw values can
// share one label (the rows are summed), and a mode names the colour token it is drawn with.

export type ModeColorKey = 'car-1' | 'car-2' | 'c1' | 'c2' | 'c3' | 'c23'

export interface VocabEntry {
  /** Display label, the value charts see. */
  label: string
  /** Raw values in the data that map to it; default: the label itself. */
  ids?: (string | number)[]
}
export interface ModeEntry extends VocabEntry {
  color?: ModeColorKey
}
export interface VocabConfig {
  modes?: ModeEntry[]
  purposes?: VocabEntry[]
  incomes?: VocabEntry[]
  autos?: VocabEntry[]
  districts?: VocabEntry[]
}

const DEFAULT_MODES: ModeEntry[] = [
  { label: 'Drive alone', color: 'car-1' },
  { label: 'Shared ride', color: 'car-2' },
  { label: 'Transit', color: 'c1' },
  { label: 'Walk', color: 'c2' },
  { label: 'Bike', color: 'c3' },
  { label: 'School bus', color: 'c23' },
]
const labels = (...l: string[]): VocabEntry[] => l.map((label) => ({ label }))

const DEFAULTS = {
  modes: DEFAULT_MODES,
  purposes: labels('Work', 'School', 'Shopping', 'Other', 'Non-home'),
  incomes: labels('Under $35k', '$35k to $75k', '$75k to $125k', 'Over $125k'),
  autos: labels('0 cars', '1 car', '2 cars', '3 cars', '4+ cars'),
  districts: labels('Weber', 'Davis', 'Salt Lake', 'Utah', 'Tooele'),
}

export const MODES: string[] = DEFAULTS.modes.map((m) => m.label)
export const PURPOSES: string[] = DEFAULTS.purposes.map((m) => m.label)
export const INCOMES: string[] = DEFAULTS.incomes.map((m) => m.label)
export const AUTOS: string[] = DEFAULTS.autos.map((m) => m.label)
export const DISTRICTS: string[] = DEFAULTS.districts.map((m) => m.label)
export const DISTANCE_BANDS = ['Under 2 mi', '2 to 8 mi', 'Over 8 mi'] as const
export const FACILITIES = ['Freeway', 'Arterial', 'Collector', 'Local'] as const
export const COUNTIES = ['Salt Lake', 'Utah', 'Davis', 'Weber', 'Tooele', 'External'] as const

type Dimension = 'major_trip_mode' | 'primary_purpose' | 'income_group' | 'auto_ownership' | 'district'

let modeEntries: ModeEntry[] = DEFAULT_MODES
const entries: Record<Dimension, VocabEntry[]> = {
  major_trip_mode: DEFAULTS.modes,
  primary_purpose: DEFAULTS.purposes,
  income_group: DEFAULTS.incomes,
  auto_ownership: DEFAULTS.autos,
  district: DEFAULTS.districts,
}

function setArray(target: string[], list: VocabEntry[]): void {
  target.splice(0, target.length, ...list.map((e) => e.label))
}

/** Replaces the vocabularies a deployment describes (an omitted one keeps the default). Call once at boot. */
export function configureVocab(cfg: VocabConfig | undefined): void {
  const c = cfg ?? {}
  modeEntries = c.modes?.length ? c.modes : DEFAULT_MODES
  entries.major_trip_mode = modeEntries
  entries.primary_purpose = c.purposes?.length ? c.purposes : DEFAULTS.purposes
  entries.income_group = c.incomes?.length ? c.incomes : DEFAULTS.incomes
  entries.auto_ownership = c.autos?.length ? c.autos : DEFAULTS.autos
  entries.district = c.districts?.length ? c.districts : DEFAULTS.districts
  setArray(MODES, modeEntries)
  setArray(PURPOSES, entries.primary_purpose)
  setArray(INCOMES, entries.income_group)
  setArray(AUTOS, entries.auto_ownership)
  setArray(DISTRICTS, entries.district)
}

/** The colour token a mode label is drawn with (a mode the vocabulary does not know falls back to a neutral). */
export function modeColorKey(label: string): ModeColorKey | undefined {
  return modeEntries.find((m) => m.label === label)?.color
}

/**
 * Maps a raw data value onto its display label for a dimension; undefined when the vocabulary does not list it.
 * With no configured ids an entry matches its own label.
 */
export function aliasValue(dimension: Dimension, raw: unknown): string | undefined {
  const key = String(raw)
  for (const e of entries[dimension]) {
    const ids = e.ids ?? [e.label]
    if (ids.some((id) => String(id) === key)) return e.label
  }
  return undefined
}

/** True when the dimension's vocabulary differs from the raw labels (an alias map is configured). */
export function hasAliases(dimension: Dimension): boolean {
  return entries[dimension].some((e) => e.ids !== undefined)
}

/** Index of `name` in `order`, unknown names last (stable). */
export function orderIndex(order: readonly string[], name: string): number {
  const i = order.indexOf(name)
  return i < 0 ? order.length : i
}

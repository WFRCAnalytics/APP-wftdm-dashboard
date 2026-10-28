// Ordered shelves: the levels of a treemap or sunburst, a table's row groups, column groups and measures. Each is a list in reading
// order that is always packed into its first slots, so there is never a gap: taking one out promotes the ones after it, and a field
// dropped before another pushes it (and the rest) one place along. Pure; the shelves in ChartTabView call these.
import { RING_CHANNELS, TABLE_COLS, TABLE_ROWS, TABLE_VALUES, type Channel, type ChartSpec, type FieldDef, type Mark } from '@/charts/builder/spec'

const HIERARCHY: Channel[] = ['color', 'detail', ...RING_CHANNELS]
const ORDERS: Partial<Record<Mark, Channel[][]>> = { treemap: [HIERARCHY], sunburst: [HIERARCHY], text: [TABLE_ROWS, TABLE_COLS, TABLE_VALUES] }

/** The ordered channels `ch` belongs to on this mark (innermost or first first), or undefined when it is an ordinary shelf. */
export const chainOrder = (mark: Mark, ch: Channel): Channel[] | undefined => ORDERS[mark]?.find((o) => o.includes(ch))

/** The fields in use, in order. */
export const chainEntries = (spec: ChartSpec, order: Channel[]): FieldDef[] => order.filter((c) => spec.enc[c]).map((c) => spec.enc[c]!)

/** Where `ch` sits among the fields in use (-1 when empty). */
export const chainIndex = (spec: ChartSpec, order: Channel[], ch: Channel): number => order.filter((c) => spec.enc[c]).indexOf(ch)

/** Writes the list back into the first slots of the chain; each field keeps its own settings. */
const pack = (spec: ChartSpec, order: Channel[], entries: FieldDef[]): ChartSpec => {
  const enc = { ...spec.enc }
  order.forEach((c, i) => { if (entries[i]) enc[c] = entries[i]; else delete enc[c] })
  return { ...spec, enc }
}

/** Closes any gap in a chain (after a field was taken off one of its shelves by other means). */
export const closeGap = (spec: ChartSpec, order: Channel[]): ChartSpec => pack(spec, order, chainEntries(spec, order))

/** Takes the field off a shelf; on a chain the ones after it move up one place. */
export function removeFromChain(spec: ChartSpec, ch: Channel): ChartSpec {
  const order = chainOrder(spec.mark, ch)
  if (!order) { const enc = { ...spec.enc }; delete enc[ch]; return { ...spec, enc } }
  return pack(spec, order, order.filter((c) => c !== ch && spec.enc[c]).map((c) => spec.enc[c]!))
}

/** Puts a field into the chain at `index` (0 = first), pushing the others along. Null when every level is already used. */
export function insertIntoChain(spec: ChartSpec, order: Channel[], index: number, entry: FieldDef): ChartSpec | null {
  const entries = chainEntries(spec, order)
  if (entries.length >= order.length) return null
  entries.splice(Math.max(0, Math.min(index, entries.length)), 0, entry)
  return pack(spec, order, entries)
}

/** Moves a field already in the chain so it sits before the field now at `index` (index = the length puts it last). */
export function reorderInChain(spec: ChartSpec, order: Channel[], from: Channel, index: number): ChartSpec {
  const entries = chainEntries(spec, order)
  const i = chainIndex(spec, order, from)
  if (i < 0) return spec
  const [moved] = entries.splice(i, 1)
  entries.splice(index > i ? index - 1 : index, 0, moved)
  return pack(spec, order, entries)
}

export type Side = 'before' | 'after' | 'on'
export interface Box { ch: Channel; left: number; right: number; top: number; bottom: number; empty?: boolean }

/**
 * Which shelf, and which part of it, a point is over. The outer quarter of a field's shelf and the gap beside it mean "insert there";
 * the middle means "replace". An empty shelf only ever means "add". The boxes are the shelves' own, which do not move during a drag,
 * so the answer cannot flip because the preview changed the layout (the old per-shelf enter/leave handling did exactly that).
 */
export function dropZone(boxes: Box[], x: number, y: number, gap = 8): { ch: Channel; side: Side } | null {
  const pad = gap / 2
  for (const b of boxes) {
    if (y < b.top - pad || y > b.bottom + pad || x < b.left - pad || x > b.right + pad) continue
    if (b.empty) return { ch: b.ch, side: 'on' }
    const w = b.right - b.left
    return { ch: b.ch, side: x < b.left + w * 0.25 ? 'before' : x > b.right - w * 0.25 ? 'after' : 'on' }
  }
  return null
}

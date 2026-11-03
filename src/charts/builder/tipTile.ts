// 065-chart-builder: the tooltip text a drawn mark carries in its `data-t` attribute, and the tile that shows how the mark looks.
// A tip is `title~label⁣value~label⁣value`, optionally followed by one `⁤`-led segment that carries the tile as
// plain fields. The separators are control characters so a label such as "Autos >= Workers" survives. Pure: no DOM, no store.
import type { TipRow, TipSpec, TipTile } from '@/services/tooltip'

const PAIR = '⁣'
const TILE = '⁤'
const FIELD = '⁥'

/** The segment to append to a tip string (leading `~` included), or '' when there is no tile. */
export function tileSegment(t: TipTile | undefined): string {
  if (!t) return ''
  const h = t.hatch
  const f = [t.kind, t.fill, t.stroke ?? '', t.dash ?? '', t.d ?? '', h ? h.d : '', h ? String(h.sw) : '', h ? (h.fill ? '1' : '0') : '']
  return `~${TILE}${f.join(FIELD)}`
}

function readTile(seg: string): TipTile | undefined {
  const [kind, fill, stroke, dash, d, hd, hsw, hfill] = seg.slice(1).split(FIELD)
  if (kind !== 'sq' && kind !== 'line' && kind !== 'glyph') return undefined
  const tile: TipTile = { kind, fill: fill || 'none' }
  if (stroke) tile.stroke = stroke
  if (dash) tile.dash = dash
  if (d) tile.d = d
  if (hd) tile.hatch = { d: hd, sw: Number(hsw) || 1.4, fill: hfill === '1' }
  return tile
}

/** A `data-t` string as a tooltip spec: the first part is the title, each pair a row, a tile segment the title's tile. */
export function parseTip(raw: string): TipSpec {
  const [title, ...rest] = raw.split('~')
  const rows: TipRow[] = []
  let tile: TipTile | undefined
  for (const p of rest) {
    if (p.startsWith(TILE)) { tile = readTile(p); continue }
    const i = p.indexOf(PAIR)
    rows.push({ k: i < 0 ? p : p.slice(0, i), v: i < 0 ? '' : p.slice(i + 1) })
  }
  return { title, rows, ...(tile ? { tile } : {}) }
}

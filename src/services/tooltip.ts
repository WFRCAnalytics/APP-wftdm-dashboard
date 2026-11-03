// The one tooltip every chart uses (project-docs/redesign/05-tooltips-and-interaction.md sections 1-2): a single floating
// element with one anatomy (title with swatch, label/value rows, optional delta, optional footer). Plain TypeScript, no
// React. Charts hand it a TipSpec; it follows the pointer, flips at the viewport edges and never takes pointer events.
import '@/styles/chartInteraction.css'
import { prettyOperators } from '@/services/typography'

export interface TipRow {
  /** Label. */
  k: string
  /** Value, already formatted. */
  v: string
  /** Swatch colour; omit for a blank slot that keeps rows aligned. */
  c?: string
  /** Bold row: the hovered series, or the reference. */
  b?: boolean
  /** Delta text, muted. */
  d?: string
  /** Delta colour (CSS colour); default var(--mute). */
  dc?: string
}

/** A small picture of how the hovered mark looks, drawn before the title: a filled square, a hatched one, a line with its dash,
 * or the marker shape. Plain data, never markup: `tipHtml` builds the SVG and escapes every value. */
export interface TipTile {
  kind: 'sq' | 'line' | 'glyph'
  /** Fill colour (a hatched tile uses it for the base tint and the strokes); 'none' for an outline only. */
  fill: string
  stroke?: string
  /** stroke-dasharray of a line tile. */
  dash?: string
  /** Path of a glyph tile, drawn in a 14 x 14 box. */
  d?: string
  /** A hatch: the pattern's path, stroke width and whether its shapes are filled. */
  hatch?: { d: string; sw: number; fill: boolean }
}

export interface TipSpec {
  title?: string
  /** Colour dot before the title. */
  swatch?: string
  /** A tile in place of the dot (wins over `swatch`). */
  tile?: TipTile
  /** Muted text at the right of the title row. */
  sub?: string
  rows?: TipRow[]
  /** Muted footer, separated by a hairline. */
  foot?: string
}

export interface TipPointer {
  clientX: number
  clientY: number
  target?: EventTarget | null
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
export const escapeHtml = (s: unknown): string => String(s).replace(/[&<>"]/g, (c) => ESCAPES[c])

/** The tile as an inline SVG, 14 x 14. Every value is escaped and goes in an attribute, so nothing in a spec is parsed as markup. */
export function tileSvg(t: TipTile): string {
  const e = escapeHtml
  const stroke = t.stroke && t.stroke !== 'none' ? t.stroke : ''
  let body: string
  if (t.kind === 'line') {
    body = `<line x1="0" y1="7" x2="14" y2="7" stroke="${e(stroke || t.fill)}" stroke-width="2.4" stroke-linecap="round"${t.dash ? ` stroke-dasharray="${e(t.dash)}"` : ''}/>`
  } else if (t.kind === 'glyph') {
    body = `<path d="${e(t.d ?? '')}" fill="${e(t.fill)}" stroke="${e(stroke || 'none')}" stroke-width="1.4" stroke-linejoin="round"/>`
  } else if (t.hatch) {
    const h = t.hatch
    const hatch = `<pattern id="wf-tt-hatch" patternUnits="userSpaceOnUse" width="8" height="8"><rect width="8" height="8" fill="${e(t.fill)}" fill-opacity="0.16"/><path d="${e(h.d)}" stroke="${e(t.fill)}" stroke-width="${h.sw}" fill="${h.fill ? e(t.fill) : 'none'}"/></pattern>`
    body = `<defs>${hatch}</defs><rect x="1" y="1" width="12" height="12" rx="3" fill="url(#wf-tt-hatch)" stroke="${e(t.fill)}" stroke-width="1"/>`
  } else {
    body = `<rect x="1" y="1" width="12" height="12" rx="3" fill="${e(t.fill)}"${stroke ? ` stroke="${e(stroke)}" stroke-width="1"` : ''}/>`
  }
  return `<svg class="tt-tile" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">${body}</svg>`
}

/** The tooltip markup for a spec. Every string is escaped; colours go in a style attribute and are never parsed as markup. */
export function tipHtml(o: TipSpec): string {
  const color = (c: string) => escapeHtml(c)
  const head = o.title
    ? `<div class="tt-h">${o.tile ? tileSvg(o.tile) : o.swatch ? `<i style="background:${color(o.swatch)}"></i>` : ''}<span>${escapeHtml(prettyOperators(o.title))}</span>${
        o.sub ? `<em>${escapeHtml(o.sub)}</em>` : ''
      }</div>`
    : ''
  // the colour slot is only there when some row has a colour; otherwise the labels start at the left edge
  const slot = (o.rows ?? []).some((r) => r.c)
  const rows = (o.rows ?? [])
    .map(
      (r) =>
        `<div class="tt-r${r.b ? ' b' : ''}${slot ? '' : ' nc'}">${slot ? (r.c ? `<i style="background:${color(r.c)}"></i>` : '<i class="n"></i>') : ''}<span class="tt-k">${escapeHtml(
          prettyOperators(r.k),
        )}</span><b class="tt-v">${escapeHtml(prettyOperators(r.v))}</b>${
          r.d ? `<em class="tt-d" style="color:${color(r.dc ?? 'var(--mute)')}">${escapeHtml(r.d)}</em>` : ''
        }</div>`,
    )
    .join('')
  const foot = o.foot ? `<div class="tt-f">${escapeHtml(prettyOperators(o.foot))}</div>` : ''
  return head + rows + foot
}

let el: HTMLDivElement | null = null
function node(): HTMLDivElement {
  if (!el || !el.isConnected) {
    el = document.createElement('div')
    el.className = 'wf-tip'
    el.setAttribute('role', 'tooltip')
    document.body.appendChild(el)
  }
  return el
}

/** Position for a tooltip of `w` x `h` at the pointer: 16px offset, flipped at the right and bottom viewport edges. */
export function placeTip(
  pointer: { clientX: number; clientY: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): { x: number; y: number } {
  const pad = 16
  let x = pointer.clientX + pad
  let y = pointer.clientY + pad
  if (x + size.width > viewport.width - 8) x = pointer.clientX - size.width - pad
  if (y + size.height > viewport.height - 8) y = pointer.clientY - size.height - pad
  return { x: Math.max(8, x), y: Math.max(8, y) }
}

export const tooltip = {
  /** Shows the tooltip at the pointer. Suppressed inside a side-by-side grid, which shows one synced tooltip itself (a grid of difference facets, `data-own-tips`, does not: each facet shows its own). */
  show(spec: TipSpec | string, e: TipPointer): void {
    if (e.target instanceof Element && e.target.closest('.wf-multi:not([data-own-tips])')) return
    const t = node()
    t.innerHTML = typeof spec === 'string' ? spec : tipHtml(spec)
    t.style.opacity = '1'
    const r = t.getBoundingClientRect()
    const { x, y } = placeTip(e, r, { width: window.innerWidth, height: window.innerHeight })
    t.style.left = `${x}px`
    t.style.top = `${y}px`
  },
  /** Shows it even inside a grid: used by the grid's own synced handler. */
  showSynced(spec: TipSpec, e: TipPointer): void {
    tooltip.show(spec, { clientX: e.clientX, clientY: e.clientY, target: document.body })
  },
  hide(): void {
    if (el) el.style.opacity = '0'
  },
}

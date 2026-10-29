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

export interface TipSpec {
  title?: string
  /** Colour dot before the title. */
  swatch?: string
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

/** The tooltip markup for a spec. Every string is escaped; colours go in a style attribute and are never parsed as markup. */
export function tipHtml(o: TipSpec): string {
  const color = (c: string) => escapeHtml(c)
  const head = o.title
    ? `<div class="tt-h">${o.swatch ? `<i style="background:${color(o.swatch)}"></i>` : ''}<span>${escapeHtml(prettyOperators(o.title))}</span>${
        o.sub ? `<em>${escapeHtml(o.sub)}</em>` : ''
      }</div>`
    : ''
  const rows = (o.rows ?? [])
    .map(
      (r) =>
        `<div class="tt-r${r.b ? ' b' : ''}">${r.c ? `<i style="background:${color(r.c)}"></i>` : '<i class="n"></i>'}<span class="tt-k">${escapeHtml(
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

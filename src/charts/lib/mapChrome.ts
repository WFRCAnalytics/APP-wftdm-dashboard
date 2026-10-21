// DOM builders for the chrome over the zone maps (look of prototype core3.js ctl/chip and pages.js mapView).
import '@/charts/lib/mapChrome.css'

const RESET_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>'

export interface ControlHandlers {
  zoomIn(): void
  zoomOut(): void
  reset(): void
}

/** The 30px-wide bordered + / − / reset group. */
export function controlGroup(h: ControlHandlers): HTMLDivElement {
  const bar = document.createElement('div')
  bar.className = 'wfz-ctl'
  bar.setAttribute('role', 'group')
  bar.setAttribute('aria-label', 'Map zoom')
  const mk = (html: string, label: string, fn: () => void) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.innerHTML = html
    b.setAttribute('aria-label', label)
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      fn()
    })
    bar.appendChild(b)
  }
  mk('+', 'Zoom in', h.zoomIn)
  mk('−', 'Zoom out', h.zoomOut)
  mk(RESET_ICON, 'Reset view', h.reset)
  return bar
}

/** The shared group of a side-by-side grid: the "Zoom and pan are linked" caption beside a horizontal control group. */
export function linkedControls(h: ControlHandlers): HTMLDivElement {
  const wrap = document.createElement('div')
  wrap.className = 'wfz-linked'
  const note = document.createElement('span')
  note.className = 'note'
  note.textContent = 'Zoom and pan are linked'
  wrap.append(note, controlGroup(h))
  return wrap
}

/** A caption chip (scenario name). */
export function chip(text: string, side: 'left' | 'right', swatch?: string): HTMLDivElement {
  const el = document.createElement('div')
  el.className = `wfz-chip ${side}`
  if (swatch) {
    const dot = document.createElement('i')
    dot.style.cssText = `width:9px;height:9px;border-radius:50%;flex:none;background:${swatch}`
    el.appendChild(dot)
  }
  const span = document.createElement('span')
  span.textContent = text
  span.style.cssText = 'overflow:hidden;text-overflow:ellipsis'
  el.appendChild(span)
  return el
}

/** A legend: a gradient bar of `width` px and end labels (two or three). */
export function legend(gradient: string, labels: string[], width: number): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'wfz-legend'
  const bar = document.createElement('div')
  bar.className = 'bar'
  bar.style.cssText = `width:${width}px;background:${gradient}`
  const ends = document.createElement('div')
  ends.className = 'ends'
  for (const l of labels) {
    const s = document.createElement('span')
    s.textContent = l
    ends.appendChild(s)
  }
  el.append(bar, ends)
  return el
}

/** The swipe divider: 3px ink line, 30px round grip with arrows, `role="slider"`. */
export function swipeHandle(): { el: HTMLDivElement; set(x: number, width: number): void } {
  const el = document.createElement('div')
  el.className = 'wfz-swipe'
  el.setAttribute('role', 'slider')
  el.setAttribute('tabindex', '0')
  el.setAttribute('aria-label', 'Swipe between scenarios')
  el.setAttribute('aria-orientation', 'horizontal')
  el.setAttribute('aria-valuemin', '0')
  el.setAttribute('aria-valuemax', '100')
  el.innerHTML =
    '<div class="line"></div><div class="grip"><svg width="20" height="12" viewBox="-10 -6 20 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M-5 -5 L-10 0 L-5 5 M5 -5 L10 0 L5 5"/></svg></div>'
  return {
    el,
    set(x, width) {
      el.style.left = `${x}px`
      el.setAttribute('aria-valuenow', String(Math.round((x / Math.max(1, width)) * 100)))
    },
  }
}

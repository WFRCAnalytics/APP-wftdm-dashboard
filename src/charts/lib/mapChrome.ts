// DOM builders for the chrome over the zone maps (look of prototype core3.js ctl/chip and pages.js mapView).
import '@/charts/lib/mapChrome.css'

const RESET_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>'

// A north needle (the north half solid, the south half faint), turned by --wfz-bearing, which each map sets on its wrapper
// as it rotates (ZoneMap), so a group rebuilt on every draw never holds a listener.
const COMPASS_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style="transform:rotate(var(--wfz-bearing,0deg));transition:transform .1s"><path d="M12 2.5 16 12h-8z" fill="currentColor"/><path d="M12 21.5 8 12h8z" fill="currentColor" opacity=".35"/></svg>'

export interface ControlHandlers {
  zoomIn(): void
  zoomOut(): void
  /** Turns the map back to north (and flat). */
  resetNorth(): void
  reset(): void
}

/** The 30px-wide bordered + / − / north / reset group: the same set, in the same order, as the flow map's controls. */
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
  mk(COMPASS_ICON, 'Reset bearing to north', h.resetNorth)
  mk(RESET_ICON, 'Reset view', h.reset)
  return bar
}

const LINK_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/></svg>'
const UNLINK_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 17H7A5 5 0 0 1 7 7"/><path d="M15 7h2a5 5 0 0 1 4 8"/><line x1="8" x2="12" y1="12" y2="12"/><line x1="2" x2="22" y1="2" y2="22"/></svg>'

/** A colour key, bottom-right inside the map just above the attribution (where MapLibre puts its own controls): a gradient
 * bar of `width` px and end labels (two or three). */
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

/** CSS for a legend gradient from a list of colours. */
export const gradient = (colors: string[]): string => `linear-gradient(90deg,${colors.join(',')})`

/**
 * The chain button of a side-by-side grid, a one-button group under the reference map's zoom group (so + / - / reset stay
 * in the same place in every map): linked (every map's zoom, pan and buttons move them all) or a broken chain
 * (each map moves on its own). `isLinked` reads the state; `toggleLink` flips it.
 */
export function linkButton(h: { isLinked(): boolean; toggleLink(): void }): HTMLDivElement {
  const wrap = document.createElement('div')
  wrap.className = 'wfz-ctl wfz-link'
  const link = document.createElement('button')
  link.type = 'button'
  link.className = 'link'
  const paint = () => {
    const on = h.isLinked()
    link.innerHTML = on ? LINK_ICON : UNLINK_ICON
    link.setAttribute('aria-pressed', String(on))
    link.setAttribute('aria-label', on ? 'Zoom and pan are linked' : 'Zoom and pan are separate')
    link.title = on ? 'Zoom and pan are linked across the maps. Click to move each map on its own.' : 'Each map zooms and pans on its own. Click to link them.'
  }
  link.addEventListener('click', (e) => {
    e.stopPropagation()
    h.toggleLink()
    paint()
  })
  paint()
  wrap.appendChild(link)
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

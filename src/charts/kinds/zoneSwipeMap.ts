// Zone map, Swipe (project-docs/redesign/04-chart-catalogue.md entry 21). Two MapLibre maps in one container, the
// reference on the left of a draggable divider and the focus on the right, both with the Values ramp and one linked
// camera. Each map is clipped with `clip-path`; the divider is a 3px ink line with a 30px round grip, a
// `role="slider"`, arrow keys moving it 24px (clamped 24px from each edge). Wheel zooms both; dragging the divider does
// not pan the map. Compare-only. Observed has no zone table: the baseline stands in and the chip says so.
import { chip, controlGroup, legend, swipeHandle } from '@/charts/lib/mapChrome'
import { CameraGroup, SHARE_DOMAIN, clampSwipe, sequentialT, swipeKey } from '@/charts/lib/mapMath'
import {
  ZONE_TABLE,
  applyBasemaps,
  attach,
  destroyHost,
  focusRunOf,
  gradient,
  hostOf,
  needGeometry,
  showNote,
  trackMap,
  watchBasemap,
  zoneReference,
  zoneRows,
  type ZoneHost,
} from '@/charts/lib/zoneMapHost'
import { ZoneMap } from '@/charts/lib/zoneMapView'
import type { ChartEnv, ChartKind } from '@/charts/types'

interface Swipe {
  clips: [HTMLDivElement, HTMLDivElement]
  cams: CameraGroup<ZoneMap>
  handle: ReturnType<typeof swipeHandle>
  /** Divider position as a fraction of the width, so a resize keeps its place. */
  frac: number
  width: number
}

function clipDiv(): HTMLDivElement {
  const d = document.createElement('div')
  d.style.cssText = 'position:absolute;inset:0'
  return d
}

/** Creates the two maps, the camera link and the divider (once per panel). */
function build(host: ZoneHost): Swipe {
  const geo = host.geo!
  const clips: [HTMLDivElement, HTMLDivElement] = [clipDiv(), clipDiv()]
  host.wrap.append(...clips)
  const cams = new CameraGroup<ZoneMap>()
  const make = (parent: HTMLElement, camera?: ZoneMap) => {
    let m!: ZoneMap
    m = new ZoneMap(parent, geo, { hover: () => {}, click: () => {}, moved: () => void cams.moved(m) }, { camera: camera?.getCamera(), zoneEvents: false })
    cams.add(m)
    trackMap(m)
    host.maps.push(m)
    return m
  }
  const a = make(clips[0])
  const b = make(clips[1], a)
  b.home = a.home
  cams.last = a.getCamera()
  watchBasemap(host)

  const handle = swipeHandle()
  host.wrap.appendChild(handle.el)
  const sw: Swipe = { clips, cams, handle, frac: 0.5, width: 0 }
  const place = (x: number) => {
    sw.width = host.wrap.clientWidth || sw.width
    const pos = clampSwipe(x, sw.width)
    sw.frac = pos / Math.max(1, sw.width)
    applyPos(sw)
  }
  handle.el.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    handle.el.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => place(ev.clientX - host.wrap.getBoundingClientRect().left)
    const up = () => {
      handle.el.removeEventListener('pointermove', move)
      handle.el.removeEventListener('pointerup', up)
      handle.el.removeEventListener('pointercancel', up)
    }
    handle.el.addEventListener('pointermove', move)
    handle.el.addEventListener('pointerup', up)
    handle.el.addEventListener('pointercancel', up)
    move(e)
  })
  // the divider must not hand wheel/touch gestures to anything under it as a pan
  handle.el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true })
  handle.el.addEventListener('keydown', (e) => {
    const next = swipeKey(e.key, sw.frac * sw.width, sw.width)
    if (next === null) return
    e.preventDefault()
    place(next)
  })
  return sw
}

function applyPos(sw: Swipe): void {
  const pos = clampSwipe(sw.frac * sw.width, sw.width)
  sw.clips[0].style.clipPath = `inset(0 ${Math.max(0, sw.width - pos)}px 0 0)`
  sw.clips[1].style.clipPath = `inset(0 0 0 ${pos}px)`
  sw.handle.set(pos, sw.width)
}

const kind: ChartKind = {
  tables: () => [ZONE_TABLE],
  extraRuns: (plan) => {
    const r = zoneReference(plan).run
    return r ? [r] : []
  },
  draw(el, env: ChartEnv) {
    const host = hostOf(env.state)
    host.env = env
    const run = focusRunOf(env)
    const focusLabel = env.scenarios.find((s) => s.run === run)?.label ?? env.focus?.label ?? ''
    const ref = zoneReference(env)
    const out = { label: `Swipe between ${ref.label} and ${focusLabel}: transit share by zone` }
    const geo = needGeometry(el, env, host)
    if (!geo) return out
    if (!ref.run || ref.run === run) {
      showNote(el, 'Choose a focus scenario other than the reference to swipe between them.')
      return out
    }
    const focus = zoneRows(env, run)
    const base = zoneRows(env, ref.run)
    if (focus.size === 0 || base.size === 0) {
      showNote(el, 'No zone data for one of the two scenarios.')
      return out
    }
    attach(el, host)

    const sw = (host.extra.swipe ??= build(host)) as Swipe
    const [mapRef, mapFocus] = host.maps
    const t = env.theme
    const noData = t.mix(t.surface, t.ink, 0.1)
    const colors = (rows: typeof focus) => {
      const m = new Map<number, string>()
      for (const [id, r] of rows) m.set(id, t.mix(t.surface, t.tokens.c1, sequentialT(r.share * 100)))
      return m
    }
    for (const [m, rows] of [[mapRef, base], [mapFocus, focus]] as const) {
      m.setTheme(t)
      m.setFills(colors(rows), noData)
    }
    applyBasemaps(host, env)
    sw.width = host.wrap.clientWidth || env.width
    applyPos(sw)
    const sizeKey = `${env.width}x${env.height}`
    if (host.extra.size !== sizeKey) {
      host.extra.size = sizeKey
      for (const m of host.maps) m.resize()
    }

    const left = chip(ref.label + (ref.fellBack ? ' (Observed has no zone data)' : ''), 'left')
    const right = chip(focusLabel, 'right')
    host.chrome.replaceChildren(
      left,
      right,
      controlGroup({ zoomIn: () => mapFocus.zoomBy(1.6), zoomOut: () => mapFocus.zoomBy(1 / 1.6), reset: () => mapFocus.resetView() }),
      legend(gradient([t.mix(t.surface, t.tokens.c1, 0), t.tokens.c1]), [`${SHARE_DOMAIN[0]}%`, `${SHARE_DOMAIN[1]}%+ transit share`], 150),
    )
    if (host.chrome.parentElement !== host.wrap) host.wrap.appendChild(host.chrome)
    return out
  },
  destroy: destroyHost,
}

export default kind

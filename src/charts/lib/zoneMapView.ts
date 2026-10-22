// One MapLibre map showing the zone choropleth, the rail line and a hover/selection outline, on the user's basemap.
// Shared by the three zone-map kinds. The map is created once and kept in the chart's persistent state: draws only
// push new fills, theme colours, size and basemap into it (CLAUDE.md "Map panels": geometry already loaded through
// ST_GeomFromWKB()/ST_AsGeoJSON(), basemap through panels/basemap/*).
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import type { Camera, CameraMap } from '@/charts/lib/mapMath'
import type { MapGeometry } from '@/charts/lib/mapGeometry'
import type { ChartTheme } from '@/charts/types'
import { basemapKey, resolveEffectiveBasemap } from '@/panels/basemap/resolveEffectiveBasemap'
import { freshBlankStyle, loadBasemapStyle } from '@/panels/basemap/loadBasemapStyle'
import type { BasemapPresetName, BasemapSelection } from '@/panels/basemap/types'
import type { ChartPanelConfig } from '@/layout/types'
import { trackMap } from '@/services/mapCapture'

const SRC_ZONES = 'wfz-zones'
const SRC_HL = 'wfz-hl'
const SRC_RAIL = 'wfz-rail'
const SRC_STATIONS = 'wfz-stations'
const L_FILL = 'wfz-fill'
const L_LINE = 'wfz-line'
const L_RAIL = 'wfz-rail-line'
const L_STATION = 'wfz-station'
const L_HL = 'wfz-hl-line'
const OWN_PREFIX = 'wfz-'

/** Opacity of the zones over a real basemap; fully opaque on "Zones only" (a style with no tile sources). */
export const ZONE_OPACITY_OVER_BASEMAP = 0.8

export interface ZoneMapHooks {
  /** Pointer over a zone (id) or leaving the zones (null). `event` is the DOM event for tooltip placement. */
  hover(id: number | null, event: MouseEvent | null): void
  click(id: number | null): void
  /** The camera changed (user, zoom buttons or a linked map). */
  moved(): void
}

export interface ZoneMapOptions {
  /** Start camera; the zone extent is fitted when absent. */
  camera?: Pick<Camera, 'center' | 'zoom'>
  /** Wire hover/click on the zones (default true); the swipe map has no zone interaction. */
  zoneEvents?: boolean
}

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

export class ZoneMap implements CameraMap {
  readonly root: HTMLDivElement
  readonly map: maplibregl.Map
  /** The camera of the initial fit, used by Reset. */
  home: Pick<Camera, 'center' | 'zoom'>
  /** True when the current basemap draws no tiles. */
  zonesOnly = true

  private ready = false
  private destroyed = false
  private fills = new Map<number, string>()
  private noData = '#cccccc'
  private theme: ChartTheme | null = null
  private themeSig = ''
  private hoverId: number | null = null
  private hoverWidth = 1.4
  private selectedId: number | null = null
  private basemapSig: string | null = null
  private pendingBasemap: BasemapSelection | null = null
  private basemapGen = 0
  private basemapAbort: AbortController | null = null
  private readonly byId = new Map<number, GeoJSON.Feature>()
  private readonly observer: ResizeObserver

  constructor(
    parent: HTMLElement,
    private readonly geo: MapGeometry,
    private readonly hooks: ZoneMapHooks,
    opts: ZoneMapOptions = {},
  ) {
    for (const f of geo.zones) this.byId.set(Number(f.id), f)
    this.root = document.createElement('div')
    this.root.className = 'wfz-map'
    parent.appendChild(this.root)

    const view = opts.camera
      ? { center: opts.camera.center, zoom: opts.camera.zoom }
      : geo.bounds
        ? { bounds: geo.bounds as [number, number, number, number], fitBoundsOptions: { padding: 28, maxZoom: 11, animate: false } }
        : { center: [-111.89, 40.76] as [number, number], zoom: 9 }
    this.map = new maplibregl.Map({
      container: this.root,
      style: freshBlankStyle(),
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      maxPitch: 0,
      minZoom: 5,
      maxZoom: 16,
      fadeDuration: 0,
      ...view,
    })
    trackMap(this.map)
    this.map.touchZoomRotate.disableRotation()
    this.home = { center: this.map.getCenter().toArray() as [number, number], zoom: this.map.getZoom() }

    this.map.on('move', () => this.hooks.moved())
    const zoneEvents = opts.zoneEvents !== false
    if (zoneEvents) this.map.on('mousemove', L_FILL, (e) => {
      const id = Number(e.features?.[0]?.properties?.id)
      this.map.getCanvas().style.cursor = 'pointer'
      this.hooks.hover(Number.isFinite(id) ? id : null, e.originalEvent)
    })
    if (zoneEvents) this.map.on('mouseleave', L_FILL, () => {
      this.map.getCanvas().style.cursor = ''
      this.hooks.hover(null, null)
    })
    if (zoneEvents) this.map.on('click', (e) => {
      const f = this.map.getLayer(L_FILL) ? this.map.queryRenderedFeatures(e.point, { layers: [L_FILL] })[0] : undefined
      const id = Number(f?.properties?.id)
      this.hooks.click(f && Number.isFinite(id) ? id : null)
    })
    this.map.once('load', () => {
      if (this.destroyed) return
      this.addLayers()
      this.ready = true
      this.apply()
      if (this.pendingBasemap) {
        const sel = this.pendingBasemap
        this.pendingBasemap = null
        void this.applyBasemap(sel)
      }
    })
    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(parent)
  }

  // ---- camera ----
  getCamera(): Camera {
    const c = this.map.getCenter()
    return { center: [c.lng, c.lat], zoom: this.map.getZoom(), bearing: this.map.getBearing(), pitch: this.map.getPitch() }
  }

  jumpTo(camera: Camera): void {
    this.map.jumpTo({ center: camera.center, zoom: camera.zoom, bearing: camera.bearing, pitch: camera.pitch })
  }

  zoomBy(factor: number): void {
    this.map.easeTo({ zoom: this.map.getZoom() + Math.log2(factor), duration: 250 })
  }

  resetView(): void {
    this.map.easeTo({ center: this.home.center, zoom: this.home.zoom, bearing: 0, pitch: 0, duration: 300 })
  }

  resize(): void {
    if (!this.destroyed && this.root.clientWidth > 1 && this.root.clientHeight > 1) this.map.resize()
  }

  // ---- data ----
  setFills(fills: Map<number, string>, noData: string): void {
    this.fills = fills
    this.noData = noData
    this.apply()
  }

  setOutline(hoverId: number | null, hoverWidth: number, selectedId: number | null): void {
    if (hoverId === this.hoverId && hoverWidth === this.hoverWidth && selectedId === this.selectedId) return
    this.hoverId = hoverId
    this.hoverWidth = hoverWidth
    this.selectedId = selectedId
    this.applyOutline()
  }

  setTheme(theme: ChartTheme): void {
    const sig = [theme.ink, theme.line, theme.surface].join('|')
    this.theme = theme
    if (sig === this.themeSig) return
    this.themeSig = sig
    this.applyTheme()
  }

  /** Applies the effective basemap (panel > tab > global > default) when it changed since the last call. */
  setBasemap(config: ChartPanelConfig, global: BasemapPresetName | undefined, protomapsKey = ''): void {
    const eff = resolveEffectiveBasemap(config.basemap as BasemapSelection | undefined, config._tabDefaultBasemap as BasemapSelection | undefined, global)
    const sig = `${basemapKey(eff.selection)}|${protomapsKey}`
    if (sig === this.basemapSig) return
    this.basemapSig = sig
    if (!this.ready) {
      this.pendingBasemap = eff.selection
      return
    }
    void this.applyBasemap(eff.selection)
  }

  // ---- internals ----
  private addLayers(): void {
    const m = this.map
    m.addSource(SRC_ZONES, { type: 'geojson', data: EMPTY })
    m.addSource(SRC_HL, { type: 'geojson', data: EMPTY })
    m.addSource(SRC_RAIL, { type: 'geojson', data: { type: 'FeatureCollection', features: this.geo.rail.lines } })
    m.addSource(SRC_STATIONS, { type: 'geojson', data: { type: 'FeatureCollection', features: this.geo.rail.stations } })
    const ink = this.theme?.ink ?? '#111111'
    const line = this.theme?.line ?? '#dddddd'
    const surface = this.theme?.surface ?? '#ffffff'
    m.addLayer({ id: L_FILL, type: 'fill', source: SRC_ZONES, paint: { 'fill-color': ['get', 'fill'], 'fill-opacity': ZONE_OPACITY_OVER_BASEMAP } })
    m.addLayer({ id: L_LINE, type: 'line', source: SRC_ZONES, paint: { 'line-color': line, 'line-width': 0.6 } })
    m.addLayer({
      id: L_RAIL,
      type: 'line',
      source: SRC_RAIL,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ink, 'line-width': 2.2, 'line-opacity': 0.85 },
    })
    m.addLayer({
      id: L_STATION,
      type: 'circle',
      source: SRC_STATIONS,
      paint: { 'circle-radius': 4, 'circle-color': surface, 'circle-stroke-color': ink, 'circle-stroke-width': 2 },
    })
    m.addLayer({ id: L_HL, type: 'line', source: SRC_HL, layout: { 'line-join': 'round' }, paint: { 'line-color': ink, 'line-width': ['get', 'w'] } })
  }

  private apply(): void {
    if (!this.ready || this.destroyed) return
    const src = this.map.getSource(SRC_ZONES) as maplibregl.GeoJSONSource | undefined
    if (src) {
      src.setData({
        type: 'FeatureCollection',
        features: this.geo.zones.map((f) => ({
          type: 'Feature',
          id: f.id,
          properties: { id: f.id, fill: this.fills.get(Number(f.id)) ?? this.noData },
          geometry: f.geometry,
        })),
      })
    }
    this.applyOutline()
    this.applyTheme()
    this.applyOpacity()
  }

  private applyOutline(): void {
    if (!this.ready || this.destroyed) return
    const src = this.map.getSource(SRC_HL) as maplibregl.GeoJSONSource | undefined
    if (!src) return
    const features: GeoJSON.Feature[] = []
    const add = (id: number | null, w: number) => {
      const f = id === null ? undefined : this.byId.get(id)
      if (f) features.push({ type: 'Feature', properties: { w }, geometry: f.geometry })
    }
    if (this.selectedId !== null && this.selectedId !== this.hoverId) add(this.selectedId, 2)
    add(this.hoverId, this.hoverWidth)
    src.setData({ type: 'FeatureCollection', features })
  }

  private applyTheme(): void {
    const t = this.theme
    if (!t || !this.ready || this.destroyed) return
    const m = this.map
    if (!m.getLayer(L_LINE)) return
    m.setPaintProperty(L_LINE, 'line-color', t.line)
    m.setPaintProperty(L_RAIL, 'line-color', t.ink)
    m.setPaintProperty(L_STATION, 'circle-color', t.surface)
    m.setPaintProperty(L_STATION, 'circle-stroke-color', t.ink)
    m.setPaintProperty(L_HL, 'line-color', t.ink)
    this.applyOpacity()
  }

  /** Zones fully opaque and a tinted background when no basemap tiles are drawn; 80% over a real basemap. */
  private applyOpacity(): void {
    if (!this.ready || this.destroyed || !this.map.getLayer(L_FILL)) return
    const style = this.map.getStyle()
    const own = (id: string) => id.startsWith(OWN_PREFIX)
    this.zonesOnly = Object.keys(style.sources ?? {}).every(own)
    this.map.setPaintProperty(L_FILL, 'fill-opacity', this.zonesOnly ? 1 : ZONE_OPACITY_OVER_BASEMAP)
    const bg = style.layers.find((l) => l.type === 'background')
    if (bg && this.zonesOnly && this.theme) {
      this.map.setPaintProperty(bg.id, 'background-color', this.theme.mix(this.theme.surface, this.theme.ink, 0.05))
    }
  }

  private async applyBasemap(selection: BasemapSelection): Promise<void> {
    const gen = ++this.basemapGen
    this.basemapAbort?.abort()
    const controller = new AbortController()
    this.basemapAbort = controller
    let resolved
    try {
      resolved = await loadBasemapStyle(selection, controller.signal)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      throw e
    }
    if (gen !== this.basemapGen || this.destroyed) return
    const map = this.map
    const styleArg = resolved.kind === 'url' ? resolved.url : resolved.style
    const onStyleReady = () => {
      map.off('styledata', onStyleReady)
      map.off('error', onLoadError)
      this.applyTheme()
      this.applyOpacity()
    }
    const onLoadError = () => {
      map.off('error', onLoadError)
      map.off('styledata', onStyleReady)
      const current = map.getStyle()
      const tiles = Object.keys(current?.sources ?? {}).some((id) => !id.startsWith(OWN_PREFIX))
      if (this.destroyed || !tiles) return
      map.once('styledata', () => {
        this.applyTheme()
        this.applyOpacity()
      })
      map.setStyle(freshBlankStyle(), { transformStyle: (prev, next) => this.keepOwn(prev, next) })
    }
    map.on('error', onLoadError)
    map.on('styledata', onStyleReady)
    map.setStyle(styleArg, { transformStyle: (prev, next) => this.keepOwn(prev, next) })
  }

  /** A style swap must carry our sources and layers forward (they are drawn above the new basemap). */
  private keepOwn(prev: maplibregl.StyleSpecification | undefined, next: maplibregl.StyleSpecification): maplibregl.StyleSpecification {
    if (!prev) return next
    const ownLayers = prev.layers.filter((l) => l.id.startsWith(OWN_PREFIX))
    if (ownLayers.length === 0) return next
    const sources = { ...next.sources }
    for (const [id, s] of Object.entries(prev.sources)) if (id.startsWith(OWN_PREFIX)) sources[id] = s
    return { ...next, sources, layers: [...next.layers.filter((l) => !l.id.startsWith(OWN_PREFIX)), ...ownLayers] }
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.basemapAbort?.abort()
    this.observer.disconnect()
    this.map.remove()
    this.root.remove()
  }
}

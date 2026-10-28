// Zone map, Difference (project-docs/redesign/04-chart-catalogue.md entry 20). Per-zone difference between the focus
// scenario and the reference, diverging (secondary <- mid -> primary, never green/red), the domain at the 96th
// percentile of the absolute differences. Compare-only. Observed has no zone table, so with Observed as the reference
// the baseline stands in and the caption chip says so.
import { sharedExtent } from '@/charts/lib/facetSync'
import { chip, controlGroup, legend } from '@/charts/lib/mapChrome'
import { diffDomain, divergeT, f1 } from '@/charts/lib/mapMath'
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
  type ZoneRow,
} from '@/charts/lib/zoneMapHost'
import { ZoneMap } from '@/charts/lib/zoneMapView'
import type { ChartEnv, ChartKind } from '@/charts/types'
import { deltaValue, formatDelta } from '@/panels/compareMath'
import { tooltip } from '@/services/tooltip'

interface View {
  focus: Map<number, ZoneRow>
  ref: Map<number, ZoneRow>
  diff: Map<number, number | null>
  fill(id: number): string
  focusLabel: string
  refLabel: string
  mode: 'abs' | 'pct'
}

function build(host: ZoneHost): ZoneMap {
  const view = () => host.extra.view as View
  let map!: ZoneMap
  map = new ZoneMap(host.wrap, host.geo!, {
    hover(id, ev) {
      map.setOutline(id, 1.4, host.selected)
      if (id === null || !ev) return tooltip.hide()
      const v = view()
      const d = v.diff.get(id)
      const a = v.focus.get(id)
      const b = v.ref.get(id)
      tooltip.show(
        {
          title: `TAZ ${id}`,
          rows: [
            { k: `Change vs ${v.refLabel}`, v: d === undefined ? 'n/a' : formatDelta(d, v.mode, { share: true }), c: v.fill(id), b: true },
            { k: v.focusLabel, v: a ? `${f1(a.share * 100)}%` : 'No data' },
            { k: v.refLabel, v: b ? `${f1(b.share * 100)}%` : 'No data' },
          ],
        },
        ev,
      )
    },
    click(id) {
      host.selected = id === host.selected ? null : id
      map.setOutline(null, 1.4, host.selected)
    },
    moved() {},
  })
  trackMap(map)
  host.maps.push(map)
  watchBasemap(host)
  return map
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
    const out = { label: `Change in transit share by zone, ${focusLabel} minus ${ref.label}` }
    const geo = needGeometry(el, env, host)
    if (!geo) return out
    if (!ref.run || ref.run === run) {
      showNote(el, 'Choose a focus scenario other than the reference to see differences.')
      return out
    }
    const focus = zoneRows(env, run)
    const base = zoneRows(env, ref.run)
    if (focus.size === 0 || base.size === 0) {
      showNote(el, 'No zone data for one of the two scenarios.')
      return out
    }
    attach(el, host)

    const t = env.theme
    const mode: 'abs' | 'pct' = env.display === 'pct' ? 'pct' : 'abs'
    const diff = new Map<number, number | null>()
    for (const [id, a] of focus) diff.set(id, deltaValue(a.share * 100, base.get(id) ? (base.get(id) as ZoneRow).share * 100 : null, mode))
    const shared = sharedExtent(env, diffDomain([...diff.values()]))
    const half = shared.extent
    const noData = t.mix(t.surface, t.ink, 0.1)
    const fills = new Map<number, string>()
    for (const [id, v] of diff) fills.set(id, v === null ? noData : t.diverge(divergeT(v, half)))
    host.extra.view = { focus, ref: base, diff, fill: (id: number) => fills.get(id) ?? noData, focusLabel, refLabel: ref.label, mode } satisfies View

    const map = host.maps[0] ?? build(host)
    map.setTheme(t)
    map.setFills(fills, noData)
    applyBasemaps(host, env)
    const sizeKey = `${env.width}x${env.height}`
    if (host.extra.size !== sizeKey) {
      host.extra.size = sizeKey
      map.resize()
    }

    const unit = mode === 'pct' ? '%' : ' pts'
    const caption = `${focusLabel} minus ${ref.label}${ref.fellBack ? ' (Observed has no zone data)' : ''}`
    const cap = chip(caption, 'left')
    cap.style.maxWidth = 'calc(100% - 60px)'
    host.chrome.replaceChildren(
      cap,
      controlGroup({ zoomIn: () => map.zoomBy(1.6), zoomOut: () => map.zoomBy(1 / 1.6), reset: () => map.resetView() }),
      legend(gradient([t.diverge(-1), t.diverge(0), t.diverge(1)]), [`−${f1(half)}${unit}`, '0', `+${f1(half)}${unit}`], 170),
    )
    if (host.chrome.parentElement !== host.wrap) host.wrap.appendChild(host.chrome)
    return { ...out, dispose: shared.dispose }
  },
  destroy: destroyHost,
}

export default kind

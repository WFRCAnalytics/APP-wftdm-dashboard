// Zone map, Values (project-docs/redesign/04-chart-catalogue.md entry 19, and entry 22 for the side-by-side grid).
// A MapLibre choropleth of transit share by traffic analysis zone, on the viewer's basemap at 80% zone opacity (fully
// opaque on "Zones only"), with the rail line and stations. In a side-by-side grid each cell is one of these maps; the
// cells share a camera and hover (lib/zoneMapGrid.ts).
import { chip, controlGroup, legend } from '@/charts/lib/mapChrome'
import { SHARE_DOMAIN, f1, sequentialT } from '@/charts/lib/mapMath'
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
  untrackMap,
  watchBasemap,
  zoneRows,
  type ZoneHost,
  type ZoneRow,
} from '@/charts/lib/zoneMapHost'
import { gridGroupFor, type GridMember } from '@/charts/lib/zoneMapGrid'
import { ZoneMap } from '@/charts/lib/zoneMapView'
import type { ChartEnv, ChartKind } from '@/charts/types'
import { tooltip } from '@/services/tooltip'

interface View {
  rows: Map<number, ZoneRow>
  fill(id: number): string
  label: string
}

const SIZE = 'size'

function build(el: HTMLElement, env: ChartEnv, host: ZoneHost): ZoneMap {
  const geo = host.geo!
  const grid = env.pinned ? gridGroupFor(el) : undefined
  const view = () => host.extra.view as View
  let map!: ZoneMap
  map = new ZoneMap(
    host.wrap,
    geo,
    {
      hover(id, ev) {
        if (grid) return grid.group.hover(id, ev)
        map.setOutline(id, 1.4, host.selected)
        if (id === null || !ev) return tooltip.hide()
        const v = view()
        const row = v.rows.get(id)
        tooltip.show(
          {
            title: `TAZ ${id}`,
            rows: [
              { k: 'Transit share', v: row ? `${f1(row.share * 100)}%` : 'No data', c: v.fill(id), b: true },
              { k: 'Residents', v: row ? Math.round(row.residents).toLocaleString('en-US') : 'No data' },
            ],
          },
          ev,
        )
      },
      click(id) {
        if (grid) return grid.group.select(id)
        host.selected = id === host.selected ? null : id
        map.setOutline(null, 1.4, host.selected)
      },
      moved() {
        grid?.group.cameras.moved(map)
      },
    },
    { camera: grid?.group.cameras.last },
  )
  trackMap(map)
  host.maps.push(map)
  if (grid) {
    // the grid's own mousemove handler (gridSync.ts) looks for data-key marks, finds none on a canvas and would hide the
    // synced tooltip this map just showed: keep the pointer events of the map to the map
    host.wrap.addEventListener('mousemove', (e) => e.stopPropagation())
    const member: GridMember = {
      map,
      cell: grid.cell,
      run: '',
      label: '',
      color: '',
      isReference: false,
      value(id) {
        const row = view().rows.get(id)
        return row ? { val: `${f1(row.share * 100)}%`, num: row.share * 100 } : undefined
      },
    }
    host.extra.member = member
    grid.group.join(member)
    host.unsubs.push(() => {
      grid.group.leave(member)
      untrackMap(map)
    })
  }
  watchBasemap(host)
  return map
}

const kind: ChartKind = {
  tables: () => [ZONE_TABLE],
  draw(el, env) {
    const host = hostOf(env.state)
    host.env = env
    const run = focusRunOf(env)
    const label = env.scenarios.find((s) => s.run === run)?.label ?? env.focus?.label ?? ''
    const out = { label: `Transit share by zone, ${label}` }
    const geo = needGeometry(el, env, host)
    if (!geo) return out
    const rows = zoneRows(env, run)
    if (rows.size === 0) {
      showNote(el, 'No zone data for this scenario.')
      return out
    }
    attach(el, host)

    const t = env.theme
    const lo = t.mix(t.surface, t.tokens.c1, 0)
    const ramp = (pct: number) => t.mix(t.surface, t.tokens.c1, sequentialT(pct))
    const noData = t.mix(t.surface, t.ink, 0.1)
    const fills = new Map<number, string>()
    for (const [id, r] of rows) fills.set(id, ramp(r.share * 100))
    host.extra.view = { rows, fill: (id: number) => fills.get(id) ?? noData, label } satisfies View

    const map = host.maps[0] ?? build(el, env, host)
    const member = host.extra.member as GridMember | undefined
    const grid = member ? gridGroupFor(el) : undefined
    if (member) {
      member.run = run ?? ''
      member.label = label
      member.color = env.scenarios.find((s) => s.run === run)?.color ?? t.mute
      member.isReference = env.reference.kind !== 'self-base-year' && run === env.reference.run
    }
    map.setTheme(t)
    map.setFills(fills, noData)
    applyBasemaps(host, env)
    const sizeKey = `${env.width}x${env.height}`
    if (host.extra[SIZE] !== sizeKey) {
      host.extra[SIZE] = sizeKey
      map.resize()
    }

    // chrome: single maps carry their own control group and caption; grid cells show the legend in the first cell only
    const parts: HTMLElement[] = []
    if (!grid) {
      parts.push(chip(label, 'left'), controlGroup({ zoomIn: () => map.zoomBy(1.6), zoomOut: () => map.zoomBy(1 / 1.6), reset: () => map.resetView() }))
    }
    const firstCell = grid ? [...grid.group.grid.children].find((c) => (c as HTMLElement).dataset.s !== undefined) === grid.cell : true
    if (firstCell) parts.push(legend(gradient([lo, t.tokens.c1]), [`${SHARE_DOMAIN[0]}%`, `${SHARE_DOMAIN[1]}%+ transit share`], 150))
    host.chrome.replaceChildren(...parts)
    if (host.chrome.parentElement !== host.wrap) host.wrap.appendChild(host.chrome)
    return out
  },
  destroy: destroyHost,
}

export default kind

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { SKELETON_DEFAULT_HEIGHT, type SkeletonShape } from '@/panels/skeleton'

// The one loading placeholder for every panel: a soft silhouette of the chart that is coming (bars, a ring, a map, a table...),
// drawn in faint tints of the ink colour so it follows the theme. Two tints only: `--sk` for shapes, `--sk-line` for the scaffolding
// (gridlines, tracks, frames). One `animate-pulse` on the wrapper (the whole picture breathes together; reduced motion holds it still).
// It is decoration: the wrapper is a status with a label, the shapes are hidden.

const STUB = 'rounded-full bg-[var(--sk)]'
const TAU = Math.PI * 2
/** Header and body rows share one grid, so a cell stub sits in the same column as its header stub (numbers right-aligned). */
const TABLE_COLS = [0, 1, 2, 3, 4]
const TABLE_ROW = 'grid grid-cols-[2.2fr_1fr_1fr_1fr_1fr] items-center gap-4 px-2'

const Axis = ({ n = 4 }: { n?: number }) => (
  <div className="flex w-7 shrink-0 flex-col justify-between py-1">
    {Array.from({ length: n }, (_, i) => (
      <div key={i} className={cn(STUB, 'h-1.5 w-full')} />
    ))}
  </div>
)

/** Tick stubs under a plot, indented past the Axis column. */
const XTicks = () => (
  <div className="ml-10 flex justify-between">
    {Array.from({ length: 5 }, (_, i) => (
      <div key={i} className={cn(STUB, 'h-1.5 w-8')} />
    ))}
  </div>
)

/** Faint dashed gridlines behind a plot, lined up with the Axis tick stubs. */
const Grid = ({ n = 4 }: { n?: number }) => (
  <div className="pointer-events-none absolute inset-0 flex flex-col justify-between py-1" aria-hidden="true">
    {Array.from({ length: n }, (_, i) => (
      <div key={i} className="border-t border-dashed border-[var(--sk-line)]" />
    ))}
  </div>
)

/** A plot area with its y axis, gridlines and x ticks; the drawing goes inside. */
const Plot = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className="flex h-full flex-col gap-2">
    <div className="flex min-h-0 flex-1 gap-3">
      <Axis />
      <div className={cn('relative min-w-0 flex-1 border-b border-[var(--sk)]', className)}>
        <Grid />
        {children}
      </div>
    </div>
    <XTicks />
  </div>
)

/** Inline drawings share this frame; `meet` keeps circles round, `slice` fills a box, `none` stretches a chart to its box. */
const Svg = ({ children, box = '0 0 200 100', stretch, slice }: { children: ReactNode; box?: string; stretch?: boolean; slice?: boolean }) => (
  <svg viewBox={box} preserveAspectRatio={stretch ? 'none' : slice ? 'xMidYMid slice' : 'xMidYMid meet'} className="h-full w-full" aria-hidden="true">
    {children}
  </svg>
)
const LINE = { fill: 'none', stroke: 'var(--sk)', strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round', vectorEffect: 'non-scaling-stroke' } as const

const pt = (r: number, a: number, c = 50): [number, number] => [c + r * Math.sin(a), c - r * Math.cos(a)]

const hex = (r: number) => Array.from({ length: 6 }, (_, i) => pt(r, (Math.PI / 3) * i).join(',')).join(' ')

/** An annular sector from angle a0 to a1 (radians clockwise from 12 o'clock). */
function sector(r0: number, r1: number, a0: number, a1: number): string {
  const large = a1 - a0 > Math.PI ? 1 : 0
  const [x0, y0] = pt(r1, a0), [x1, y1] = pt(r1, a1), [x2, y2] = pt(r0, a1), [x3, y3] = pt(r0, a0)
  return `M${x0} ${y0} A${r1} ${r1} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${r0} ${r0} 0 ${large} 0 ${x3} ${y3}Z`
}

/** Splits a span into weighted pieces with a small gap between them. */
function split(weights: number[], from: number, to: number, gap: number): [number, number][] {
  const total = weights.reduce((a, b) => a + b, 0)
  const room = to - from - gap * (weights.length - 1)
  let a = from
  return weights.map((w) => { const s: [number, number] = [a, a + (w / total) * room]; a = s[1] + gap; return s })
}

/** A sankey laid out once: three columns of nodes, ribbons stacked inside each node so they meet edge to edge. */
const SANKEY = (() => {
  const cols = [[4, 3, 2], [4, 3, 2], [6, 3]]
  const flows: [number, number, number, number][] = [ // [column, from node, to node (next column), value]
    [0, 0, 0, 3], [0, 0, 1, 1], [0, 1, 1, 2], [0, 1, 2, 1], [0, 2, 0, 1], [0, 2, 2, 1],
    [1, 0, 0, 3], [1, 0, 1, 1], [1, 1, 0, 2], [1, 1, 1, 1], [1, 2, 0, 1], [1, 2, 1, 1],
  ]
  const gap = 6, nodeW = 2.4, xs = [0, 98.8, 197.6]
  const nodes = cols.map((col) => {
    const total = col.reduce((a, b) => a + b, 0)
    const k = (100 - gap * (col.length - 1)) / total
    let y = 0
    return col.map((v) => { const n = { y, h: v * k, k, out: 0, in: 0 }; y += v * k + gap; return n })
  })
  const ribbons = flows.map(([c, a, b, v]) => {
    const from = nodes[c][a], to = nodes[c + 1][b]
    const h = v * from.k, h2 = v * to.k
    const y0 = from.y + from.out, y1 = to.y + to.in
    from.out += h; to.in += h2
    const x0 = xs[c] + nodeW, x1 = xs[c + 1], m = (x0 + x1) / 2
    return `M${x0} ${y0} C${m} ${y0} ${m} ${y1} ${x1} ${y1} L${x1} ${y1 + h2} C${m} ${y1 + h2} ${m} ${y0 + h} ${x0} ${y0 + h}Z`
  })
  return { nodes, ribbons, xs, nodeW }
})()

/** A sunburst laid out once: a core, then two rings of children that stay inside their parent's angle. */
const SUNBURST = (() => {
  const top = split([40, 35, 25], 0, TAU, 0.05)
  const tone = [1, 0.75, 0.5]
  const kids: number[][] = [[18, 12, 10], [20, 15], [15, 10]]
  const out: { d: string; o: number }[] = []
  top.forEach(([a0, a1], i) => {
    out.push({ d: sector(17, 29, a0, a1), o: tone[i] })
    split(kids[i], a0, a1, 0.025).forEach(([b0, b1], j) => {
      out.push({ d: sector(31, 40, b0, b1), o: tone[i] * 0.7 })
      if (j === 0) split([2, 1], b0, b1, 0.02).forEach(([c0, c1]) => out.push({ d: sector(42, 47, c0, c1), o: tone[i] * 0.45 }))
    })
  })
  return out
})()

/** A chord diagram laid out once: five arcs on a ring, ribbons between slices of them. */
const CHORD = (() => {
  const arcs = split([28, 22, 20, 17, 13], 0, TAU, 0.14)
  const links: [number, number, number][] = [[0, 2, 4], [0, 3, 3], [1, 3, 3.5], [1, 4, 3], [2, 4, 3]]
  const totals = arcs.map((_, i) => links.reduce((s, [a, b, w]) => s + (a === i || b === i ? w : 0), 0))
  const used = arcs.map(() => 0)
  const slice = (i: number, w: number): [number, number] => {
    const [a0, a1] = arcs[i]
    const s: [number, number] = [a0 + ((a1 - a0) * used[i]) / totals[i], a0 + ((a1 - a0) * (used[i] + w)) / totals[i]]
    used[i] += w
    return s
  }
  const r = 37
  const ribbons = links.map(([a, b, w]) => {
    const [a0, a1] = slice(a, w), [b0, b1] = slice(b, w)
    const p = (ang: number) => pt(r, ang).join(' ')
    return `M${p(a0)} A${r} ${r} 0 0 1 ${p(a1)} Q50 50 ${p(b0)} A${r} ${r} 0 0 1 ${p(b1)} Q50 50 ${p(a0)}Z`
  })
  return { arcs: arcs.map(([a0, a1]) => sector(40, 45, a0, a1)), ribbons }
})()

/** Time-of-day heat: two commute peaks across 24 hours, weekdays heavier than the weekend (the last two rows). */
const HEAT_COLS = 24
const heatCell = (c: number, r: number, rows: number) => {
  const peak = Math.exp(-(((c - 7.5) / 2) ** 2)) * 0.9 + Math.exp(-(((c - 17) / 2.6) ** 2))
  return 0.22 + 0.78 * Math.min(1, peak * (r < rows - 2 ? 1 : 0.5) * (0.85 + ((c * 5 + r * 3) % 4) * 0.05))
}

/** Treemap tiles as percent boxes: [left, top, width, height, tone]. */
const TILES: [number, number, number, number, number][] = [
  [0, 0, 46, 60, 1], [46, 0, 30, 36, 0.7], [76, 0, 24, 36, 0.5],
  [46, 36, 54, 24, 0.6], [0, 60, 30, 40, 0.55], [30, 60, 38, 40, 0.8], [68, 60, 32, 40, 0.4],
]

/** The map's zone blocks: a tilted street grid with a choropleth tint per block. */
const ZONES = (() => {
  const cols = 10, rows = 6
  const corner = (c: number, r: number): [number, number] => [
    -10 + c * 22 + (((c * 37 + r * 91) % 9) - 4) * 1.7,
    -8 + r * 20 + (((c * 53 + r * 29) % 9) - 4) * 1.7,
  ]
  return Array.from({ length: cols * rows }, (_, i) => {
    const c = i % cols, r = Math.floor(i / cols)
    const pts = [corner(c, r), corner(c + 1, r), corner(c + 1, r + 1), corner(c, r + 1)].map((p) => p.join(',')).join(' ')
    return { pts, o: 0.1 + (((c * 7 + r * 13 + c * r) % 10) / 10) * 0.55 }
  })
})()
const RIVER = 'M-10 78 C40 58 80 92 124 62 S190 30 220 18'
const ROAD_A = 'M-10 22 C50 34 110 8 210 36'
const ROAD_B = 'M66 -10 C84 36 58 70 92 110'
const GAP = 'var(--tile, var(--card, white))'

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Measures its box and hands the size to a render function, so a drawing can count its own bars, rows or lines
 *  (an enlarged panel gets more of them, not fatter ones). The first render assumes a typical tile. */
function Sized({ children }: { children: (w: number, h: number) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 600, h: 230 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => setBox((b) => (b.w === el.clientWidth && b.h === el.clientHeight ? b : { w: el.clientWidth, h: el.clientHeight }))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return <div ref={ref} className="h-full w-full">{children(box.w, box.h)}</div>
}

/** Rows are counted from the measured height (about TABLE_ROW_PX each) and then share the leftover, so an enlarged table gets more rows, not taller ones, and none is cut off. */
const TABLE_ROW_PX = 30
const TABLE_HEADER_PX = 36

function TableDrawing() {
  const ref = useRef<HTMLDivElement>(null)
  const [rows, setRows] = useState(8)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => setRows(Math.max(3, Math.min(40, Math.floor((el.clientHeight - TABLE_HEADER_PX) / TABLE_ROW_PX))))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={ref} className="flex h-full flex-col overflow-hidden">
      <div className={cn(TABLE_ROW, 'mb-1 shrink-0 rounded-md bg-[var(--sk-line)]')} style={{ height: TABLE_HEADER_PX - 4 }}>
        {TABLE_COLS.map((_, i) => (
          <div key={i} className={cn('flex', i > 0 && 'justify-end')}>
            <div className="h-2.5 rounded-full bg-[var(--sk)]" style={{ width: i === 0 ? '55%' : '70%' }} />
          </div>
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className={cn(TABLE_ROW, 'min-h-0 flex-1 border-b border-[var(--sk-line)]')}>
          {TABLE_COLS.map((_, i) => (
            <div key={i} className={cn('flex', i > 0 && 'justify-end')}>
              <div className={cn('h-2 rounded-full bg-[var(--sk)]', i === 0 ? 'opacity-90' : 'opacity-55')} style={{ width: i === 0 ? `${52 + ((r * 7) % 4) * 12}%` : `${48 + ((r * 3 + i * 5) % 4) * 10}%` }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function Drawing({ shape }: { shape: SkeletonShape }): ReactNode {
  switch (shape) {
    case 'bars':
      return (
        <Sized>
          {(w) => (
            <Plot className="flex items-end gap-[2.5%] px-[2%]">
              {Array.from({ length: clamp(Math.floor(w / 36), 5, 36) }, (_, i) => (
                <div key={i} className="relative flex flex-1 flex-col justify-end overflow-hidden rounded-t-sm" style={{ height: `${38 + 58 * Math.abs(Math.sin(i * 1.9 + 0.6))}%` }}>
                  <div className="bg-[var(--sk)] opacity-60" style={{ height: `${28 + ((i * 11) % 22)}%` }} />
                  <div className="bg-[var(--sk)]" style={{ height: `${50 - ((i * 7) % 14)}%` }} />
                </div>
              ))}
            </Plot>
          )}
        </Sized>
      )
    case 'hbars':
      return (
        <Sized>
          {(_, h) => {
            const n = clamp(Math.floor(h / 34), 3, 16)
            return (
              <div className="flex h-full flex-col">
                {Array.from({ length: n }, (_, i) => (
                  <div key={i} className="flex min-h-0 flex-1 items-center gap-3">
                    <div className={cn(STUB, 'h-2 w-16 shrink-0')} />
                    <div className="h-4 flex-1 rounded-md bg-[var(--sk-line)]">
                      <div className="h-full rounded-md bg-[var(--sk)]" style={{ width: `${94 * (1 - (0.75 * i) / n) - (i % 3) * 2}%` }} />
                    </div>
                    <div className={cn(STUB, 'h-1.5 w-8 shrink-0')} />
                  </div>
                ))}
              </div>
            )
          }}
        </Sized>
      )
    case 'pyramid':
      return (
        <Sized>
          {(_, h) => {
            const n = clamp(Math.floor(h / 24), 6, 32)
            return (
              <div className="flex h-full gap-3">
                <div className="flex w-7 shrink-0 flex-col justify-between py-1">
                  {Array.from({ length: Math.ceil(n / 3) }, (_, i) => <div key={i} className={cn(STUB, 'h-1.5 w-full')} />)}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  {Array.from({ length: n }, (_, i) => {
                    const w = 24 + 76 * Math.sin((Math.PI * (i + 0.5)) / n) ** 0.7
                    return (
                      <div key={i} className="flex min-h-0 flex-1 items-stretch gap-[3px]">
                        <div className="flex flex-1 justify-end rounded-l-md bg-[var(--sk-line)]"><div className="rounded-l-md bg-[var(--sk)]" style={{ width: `${w}%` }} /></div>
                        <div className="flex-1 rounded-r-md bg-[var(--sk-line)]"><div className="h-full rounded-r-md bg-[var(--sk)] opacity-70" style={{ width: `${w * 0.9}%` }} /></div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          }}
        </Sized>
      )
    case 'lines':
      return (
        <Plot>
          <div className="absolute inset-0">
            <Svg stretch>
              <path d="M0 58 C25 40 45 66 75 46 S130 18 160 30 S190 24 200 20 L200 100 L0 100Z" fill="var(--sk)" fillOpacity={0.35} />
              <path d="M0 58 C25 40 45 66 75 46 S130 18 160 30 S190 24 200 20" {...LINE} />
              <path d="M0 78 C30 70 50 84 85 68 S140 56 200 58" {...LINE} strokeOpacity={0.55} />
              <path d="M0 90 C35 84 70 92 110 82 S170 80 200 76" {...LINE} strokeOpacity={0.35} strokeDasharray="2 5" />
            </Svg>
          </div>
          <div className="absolute inset-y-0 left-[62%] border-l border-dashed border-[var(--sk)]" />
        </Plot>
      )
    case 'area':
      return (
        <Plot>
          <div className="absolute inset-0">
            <Svg stretch>
              <path d="M0 100 L0 40 C40 20 80 50 120 28 S175 14 200 22 L200 100Z" fill="var(--sk)" fillOpacity={0.3} />
              <path d="M0 100 L0 60 C40 44 85 70 125 52 S175 40 200 46 L200 100Z" fill="var(--sk)" fillOpacity={0.55} />
              <path d="M0 100 L0 80 C45 70 85 88 130 76 S175 70 200 72 L200 100Z" fill="var(--sk)" />
            </Svg>
          </div>
        </Plot>
      )
    case 'heat':
      return (
        <Sized>
          {(_, h) => {
            const rows = clamp(Math.floor((h - 20) / 26), 4, 14)
            return (
              <div className="flex h-full flex-col gap-2">
                <div className="flex min-h-0 flex-1 gap-3">
                  <Axis n={rows} />
                  <div className="grid min-w-0 flex-1 gap-[2px]" style={{ gridTemplateColumns: `repeat(${HEAT_COLS}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
                    {Array.from({ length: HEAT_COLS * rows }, (_, i) => (
                      <div key={i} className="rounded-[2px] bg-[var(--sk)]" style={{ opacity: heatCell(i % HEAT_COLS, Math.floor(i / HEAT_COLS), rows) }} />
                    ))}
                  </div>
                </div>
                <XTicks />
              </div>
            )
          }}
        </Sized>
      )
    case 'waffle':
      return (
        <div className="flex h-full items-center justify-center gap-8">
          <div className="aspect-square h-full max-h-[260px] min-w-0">
            <Svg box="0 0 100 100">
              {Array.from({ length: 100 }, (_, i) => {
                const col = i % 10, row = 9 - Math.floor(i / 10), n = col * 10 + (9 - row)
                return <rect key={i} x={col * 10 + 1} y={row * 10 + 1} width="8" height="8" rx="1.5" fill="var(--sk)" fillOpacity={n < 46 ? 1 : n < 78 ? 0.55 : 0.25} />
              })}
            </Svg>
          </div>
          <div className="hidden shrink-0 flex-col gap-3 sm:flex">
            {[1, 0.55, 0.25].map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="size-2.5 rounded-sm bg-[var(--sk)]" style={{ opacity: o }} />
                <div className={cn(STUB, 'h-1.5')} style={{ width: 40 + ((i * 19) % 26) }} />
              </div>
            ))}
          </div>
        </div>
      )
    case 'donut':
      return (
        <div className="flex h-full items-center justify-center gap-8">
          <div className="aspect-square h-full max-h-[260px] min-w-0">
            <Svg box="0 0 100 100">
              {split([40, 28, 20, 12], 0, TAU, 0.05).map(([a0, a1], i) => (
                <path key={i} d={sector(26, 42, a0, a1)} fill="var(--sk)" fillOpacity={[1, 0.65, 0.4, 0.25][i]} />
              ))}
              <circle cx="50" cy="50" r="19" fill="none" stroke="var(--sk-line)" strokeDasharray="2 3" />
            </Svg>
          </div>
          <div className="hidden shrink-0 flex-col gap-3 sm:flex">
            {[1, 0.65, 0.4, 0.25].map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="size-2.5 rounded-sm bg-[var(--sk)]" style={{ opacity: o }} />
                <div className={cn(STUB, 'h-1.5')} style={{ width: 44 + ((i * 17) % 28) }} />
              </div>
            ))}
          </div>
        </div>
      )
    case 'sunburst':
      return (
        <Svg box="0 0 100 100">
          <circle cx="50" cy="50" r="13" fill="var(--sk)" />
          {SUNBURST.map((s, i) => <path key={i} d={s.d} fill="var(--sk)" fillOpacity={s.o} />)}
        </Svg>
      )
    case 'chord':
      return (
        <Svg box="0 0 100 100">
          {CHORD.ribbons.map((d, i) => <path key={i} d={d} fill="var(--sk)" fillOpacity={0.3 + (i % 3) * 0.14} />)}
          {CHORD.arcs.map((d, i) => <path key={i} d={d} fill="var(--sk)" />)}
        </Svg>
      )
    case 'radar':
      return (
        <Svg box="0 0 100 100">
          {[40, 30, 20, 10].map((r) => (
            <polygon key={r} points={hex(r)} fill="none" stroke="var(--sk-line)" strokeWidth="1" />
          ))}
          {Array.from({ length: 6 }, (_, i) => {
            const [x, y] = pt(40, (Math.PI / 3) * i)
            const [dx, dy] = pt(45, (Math.PI / 3) * i)
            return (
              <g key={i}>
                <line x1="50" y1="50" x2={x} y2={y} stroke="var(--sk-line)" strokeWidth="1" />
                <circle cx={dx} cy={dy} r="1.6" fill="var(--sk)" />
              </g>
            )
          })}
          <polygon points="50,18 76,36 66,66 50,76 30,62 26,38" fill="var(--sk)" fillOpacity="0.5" stroke="var(--sk)" strokeWidth="1.5" strokeLinejoin="round" />
          <polygon points="50,30 64,42 58,58 50,62 40,56 38,42" fill="var(--sk)" fillOpacity="0.5" />
        </Svg>
      )
    case 'treemap':
      return (
        <div className="relative h-full w-full">
          {TILES.map(([l, t, w, h, o], i) => (
            <div key={i} className="absolute rounded-lg bg-[var(--sk)] p-2" style={{ left: `calc(${l}% + 1.5px)`, top: `calc(${t}% + 1.5px)`, width: `calc(${w}% - 3px)`, height: `calc(${h}% - 3px)`, opacity: o }}>
              <div className="h-1.5 w-1/2 max-w-16 rounded-full bg-[var(--tile,var(--card,white))] opacity-70" />
            </div>
          ))}
        </div>
      )
    case 'sankey':
      return (
        <Svg stretch>
          {SANKEY.ribbons.map((d, i) => <path key={i} d={d} fill="var(--sk)" fillOpacity={0.4} />)}
          {SANKEY.nodes.map((col, c) =>
            col.map((n, i) => <rect key={`${c}-${i}`} x={SANKEY.xs[c]} y={n.y} width={SANKEY.nodeW} height={n.h} fill="var(--sk)" />),
          )}
        </Svg>
      )
    case 'map':
      return (
        <div className="relative h-full w-full overflow-hidden rounded-lg border border-[var(--sk-line)]">
          <Svg slice>
            {ZONES.map((z, i) => <polygon key={i} points={z.pts} fill="var(--sk)" fillOpacity={z.o} stroke={GAP} strokeWidth="1.4" strokeLinejoin="round" />)}
            {[ROAD_A, ROAD_B].map((d) => (
              <g key={d} fill="none" strokeLinecap="round">
                <path d={d} stroke={GAP} strokeWidth="4" />
                <path d={d} stroke="var(--sk)" strokeWidth="1" strokeDasharray="6 3" />
              </g>
            ))}
            <path d={RIVER} fill="none" stroke={GAP} strokeWidth="8" strokeLinecap="round" />
            <path d={RIVER} fill="none" stroke="var(--sk)" strokeWidth="1.2" strokeDasharray="1 4" strokeLinecap="round" />
            <g transform="translate(0 20)"><ellipse cx="127" cy="44" rx="6" ry="1.8" fill="var(--sk)" />
            <path d="M118 26 a9 9 0 1 1 18 0 c0 8 -9 17 -9 17 s-9 -9 -9 -17z" fill="var(--sk)" stroke={GAP} strokeWidth="1.2" strokeLinejoin="round" />
            <circle cx="127" cy="26" r="3.2" fill={GAP} /></g>
          </Svg>
          <div className="absolute right-2 top-2 flex flex-col overflow-hidden rounded-md border border-[var(--sk)]">
            {['M2 6h8M6 2v8', 'M2 6h8'].map((d, i) => (
              <svg key={i} viewBox="0 0 12 12" className={cn('size-5 p-1', i === 0 && 'border-b border-[var(--sk)]')} aria-hidden="true">
                <path d={d} stroke="var(--sk)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
              </svg>
            ))}
          </div>
          <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md border border-[var(--sk-line)] px-1.5 py-1">
            {[0.15, 0.3, 0.5, 0.75, 1].map((o) => <div key={o} className="size-2 rounded-[2px] bg-[var(--sk)]" style={{ opacity: o }} />)}
          </div>
        </div>
      )
    case 'table':
      return <TableDrawing />
    case 'kpi':
      return (
        <div className="flex h-full flex-col gap-3 px-1">
          <div className="flex items-center justify-between">
            <div className={cn(STUB, 'h-2.5 w-28')} />
            <div className="size-6 rounded-full bg-[var(--sk-line)]" />
          </div>
          <div className="h-10 w-44 rounded-lg bg-[var(--sk)]" />
          <div className="flex items-center gap-2">
            <div className="h-5 w-16 rounded-full bg-[var(--sk-line)]" />
            <div className={cn(STUB, 'h-2 w-24 opacity-60')} />
          </div>
          <div className="relative mt-1 min-h-10 w-full flex-1">
            <div className="absolute inset-x-0 top-[45%] border-t border-dashed border-[var(--sk)]" />
            <Svg stretch box="0 0 100 40">
              <path d="M0 32 L12 26 L24 30 L36 19 L48 23 L60 14 L72 18 L84 8 L100 11 L100 40 L0 40Z" fill="var(--sk)" fillOpacity={0.35} />
              <path d="M0 32 L12 26 L24 30 L36 19 L48 23 L60 14 L72 18 L84 8 L100 11" {...LINE} />
            </Svg>
            <div className="absolute right-0 top-[27%] size-2.5 -translate-y-1/2 translate-x-0 rounded-full bg-[var(--sk)] ring-4 ring-[var(--sk-line)]" />
          </div>
        </div>
      )
    case 'text':
      return (
        <Sized>
          {(_, h) => {
            const lines = clamp(Math.floor((h - 28) / 24), 3, 36)
            return (
              <div className="flex h-full flex-col gap-3">
                <div className="mb-1 h-4 w-2/5 shrink-0 rounded-full bg-[var(--sk)]" />
                {Array.from({ length: lines }, (_, i) => {
                  const end = i % 6 === 5 || i === lines - 1 // a paragraph ends on a short line
                  return <div key={i} className={cn('h-2.5 shrink-0 rounded-full bg-[var(--sk)] opacity-70', i % 6 === 0 && i > 0 && 'mt-3')} style={{ width: end ? `${48 + ((i * 13) % 25)}%` : `${88 + ((i * 7) % 13)}%` }} />
                })}
              </div>
            )
          }}
        </Sized>
      )
    default:
      return (
        <div className="flex h-full w-full items-center justify-center rounded-xl bg-[var(--sk-line)]">
          <svg viewBox="0 0 24 24" className="size-8" aria-hidden="true">
            <path d="M5 19V11M12 19V5M19 19v-6" stroke="var(--sk)" strokeWidth="3" strokeLinecap="round" fill="none" />
          </svg>
        </div>
      )
  }
}

export interface PanelSkeletonProps {
  shape: SkeletonShape
  /** Pixels, or `'100%'` to fill the parent. Default: the panel's usual height. */
  height?: number | string
  /** What is loading, for assistive technology. */
  label?: string
  className?: string
}

export function PanelSkeleton({ shape, height, label = 'Loading panel', className }: PanelSkeletonProps) {
  return (
    <div
      role="status"
      aria-label={label}
      data-skeleton={shape}
      className={cn('animate-pulse px-1 py-2 motion-reduce:animate-none', className)}
      style={{
        '--sk': 'color-mix(in srgb, var(--ink) 13%, transparent)',
        '--sk-line': 'color-mix(in srgb, var(--ink) 7%, transparent)',
        height: height ?? SKELETON_DEFAULT_HEIGHT,
        minHeight: 100,
      } as CSSProperties}
    >
      <Drawing shape={shape} />
    </div>
  )
}

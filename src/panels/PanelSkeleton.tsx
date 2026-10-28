import type { CSSProperties, ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { SKELETON_DEFAULT_HEIGHT, type SkeletonShape } from '@/panels/skeleton'

// The one loading placeholder for every panel: a soft silhouette of the chart that is coming (bars, a ring, a map, a table...),
// drawn in a faint tint of the ink colour so it follows the theme. One `animate-pulse` on the wrapper (the whole picture
// breathes together; reduced motion holds it still). It is decoration: the wrapper is a status with a label, the shapes are hidden.

const BARS = [38, 62, 48, 80, 55, 70, 44, 66, 52, 74]
const ROWS = [88, 72, 61, 49, 40, 31, 22]
const PYRAMID = [30, 50, 70, 88, 100, 92, 80, 66, 52, 38, 24]
const STUB = 'rounded-full bg-[var(--sk)]'

const Axis = ({ n = 4 }: { n?: number }) => (
  <div className="flex w-7 shrink-0 flex-col justify-between py-1">
    {Array.from({ length: n }, (_, i) => (
      <div key={i} className={cn(STUB, 'h-1.5 w-full')} />
    ))}
  </div>
)

/** Inline drawings share this frame; `meet` keeps circles round, `none` stretches a chart to its box. */
const Svg = ({ children, box = '0 0 200 100', stretch }: { children: ReactNode; box?: string; stretch?: boolean }) => (
  <svg viewBox={box} preserveAspectRatio={stretch ? 'none' : 'xMidYMid meet'} className="h-full w-full" aria-hidden="true">
    {children}
  </svg>
)
const LINE = { fill: 'none', stroke: 'var(--sk)', strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round', vectorEffect: 'non-scaling-stroke' } as const

const hex = (r: number, c = 50) =>
  Array.from({ length: 6 }, (_, i) => `${c + r * Math.cos(Math.PI / 3 * i - Math.PI / 2)},${c + r * Math.sin(Math.PI / 3 * i - Math.PI / 2)}`).join(' ')

function Drawing({ shape }: { shape: SkeletonShape }): ReactNode {
  switch (shape) {
    case 'bars':
      return (
        <div className="flex h-full flex-col gap-2">
          <div className="flex min-h-0 flex-1 gap-3">
            <Axis />
            <div className="flex flex-1 items-end gap-[2.5%] border-b border-l border-[var(--sk)] px-[2%]">
              {BARS.map((h, i) => (
                <div key={i} className="flex-1 rounded-t-md bg-[var(--sk)]" style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
          <div className="ml-10 flex justify-between">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className={cn(STUB, 'h-1.5 w-8')} />
            ))}
          </div>
        </div>
      )
    case 'hbars':
      return (
        <div className="flex h-full flex-col justify-around gap-2">
          {ROWS.map((w, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className={cn(STUB, 'h-2 w-16 shrink-0')} />
              <div className="h-4 rounded-md bg-[var(--sk)]" style={{ width: `${w}%`, maxWidth: 'calc(100% - 5rem)' }} />
            </div>
          ))}
        </div>
      )
    case 'pyramid':
      return (
        <div className="flex h-full flex-col gap-1">
          {PYRAMID.map((w, i) => (
            <div key={i} className="flex min-h-0 flex-1 items-stretch gap-1">
              <div className="flex flex-1 justify-end"><div className="rounded-l-md bg-[var(--sk)]" style={{ width: `${w}%` }} /></div>
              <div className="flex-1"><div className="h-full rounded-r-md bg-[var(--sk)]" style={{ width: `${w * 0.9}%` }} /></div>
            </div>
          ))}
        </div>
      )
    case 'lines':
      return (
        <div className="flex h-full gap-3">
          <Axis />
          <div className="min-w-0 flex-1 border-b border-l border-[var(--sk)]">
            <Svg stretch>
              <path d="M0 70 C30 40 55 80 90 50 S150 20 200 35" {...LINE} />
              <path d="M0 85 C40 70 70 90 110 70 S160 55 200 60" {...LINE} strokeOpacity={0.6} />
              <path d="M0 55 C35 60 60 30 100 40 S160 75 200 50" {...LINE} strokeOpacity={0.4} />
            </Svg>
          </div>
        </div>
      )
    case 'area':
      return (
        <div className="flex h-full gap-3">
          <Axis />
          <div className="min-w-0 flex-1 border-b border-l border-[var(--sk)]">
            <Svg stretch>
              <path d="M0 100 L0 55 C40 30 80 70 120 40 S170 25 200 35 L200 100Z" fill="var(--sk)" fillOpacity={0.5} />
              <path d="M0 100 L0 75 C40 60 80 85 120 65 S170 55 200 62 L200 100Z" fill="var(--sk)" />
            </Svg>
          </div>
        </div>
      )
    case 'heat':
      return (
        <div className="flex h-full flex-col gap-2">
          <div className="grid min-h-0 flex-1 gap-[3px]" style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))', gridTemplateRows: 'repeat(6, minmax(0, 1fr))' }}>
            {Array.from({ length: 96 }, (_, i) => (
              <div key={i} className="rounded-[3px] bg-[var(--sk)]" style={{ opacity: 0.35 + (((i * 7) % 11) / 11) * 0.65 }} />
            ))}
          </div>
          <div className="flex justify-between">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className={cn(STUB, 'h-1.5 w-8')} />
            ))}
          </div>
        </div>
      )
    case 'waffle':
      return (
        <Svg box="0 0 100 100">
          {Array.from({ length: 100 }, (_, i) => (
            <rect key={i} x={(i % 10) * 10 + 1} y={Math.floor(i / 10) * 10 + 1} width="8" height="8" rx="1.5" fill="var(--sk)" fillOpacity={i < 62 ? 1 : 0.45} />
          ))}
        </Svg>
      )
    case 'donut':
      return (
        <Svg box="0 0 100 100">
          <circle cx="50" cy="50" r="32" fill="none" stroke="var(--sk)" strokeWidth="14" strokeDasharray="70 24 52 20 30 5" />
        </Svg>
      )
    case 'sunburst':
      return (
        <Svg box="0 0 100 100">
          <circle cx="50" cy="50" r="14" fill="var(--sk)" />
          <circle cx="50" cy="50" r="27" fill="none" stroke="var(--sk)" strokeWidth="12" strokeDasharray="62 4 40 4 52 4" />
          <circle cx="50" cy="50" r="40" fill="none" stroke="var(--sk)" strokeOpacity="0.6" strokeWidth="10" strokeDasharray="36 3 28 3 44 3 30 3 40 3" />
        </Svg>
      )
    case 'chord':
      return (
        <Svg box="0 0 100 100">
          <circle cx="50" cy="50" r="40" fill="none" stroke="var(--sk)" strokeWidth="6" strokeDasharray="56 8 40 8 64 8 40 8" />
          <path d="M50 12 C50 50 22 50 20 70 M50 12 C50 40 80 45 82 66 M20 70 C45 60 60 60 82 66" {...LINE} strokeOpacity={0.55} />
        </Svg>
      )
    case 'radar':
      return (
        <Svg box="0 0 100 100">
          {[40, 30, 20, 10].map((r) => (
            <polygon key={r} points={hex(r)} fill="none" stroke="var(--sk)" strokeWidth="1" />
          ))}
          <polygon points="50,14 78,34 70,70 50,80 28,64 24,36" fill="var(--sk)" fillOpacity="0.7" />
        </Svg>
      )
    case 'treemap':
      return (
        <div className="relative h-full w-full">
          {[
            ['0%', '0%', '58%', '62%', 1],
            ['60%', '0%', '40%', '38%', 0.7],
            ['60%', '40%', '40%', '22%', 0.5],
            ['0%', '64%', '36%', '36%', 0.6],
            ['38%', '64%', '62%', '36%', 0.85],
          ].map(([l, t, w, h, o], i) => (
            <div key={i} className="absolute rounded-lg bg-[var(--sk)]" style={{ left: l as string, top: t as string, width: `calc(${w} - 3px)`, height: `calc(${h} - 3px)`, opacity: o as number }} />
          ))}
        </div>
      )
    case 'sankey':
      return (
        <Svg stretch>
          {[[0, 16, 44], [0, 64, 30]].map(([x, y, h], i) => <rect key={`a${i}`} x={x} y={y} width="6" height={h} rx="2" fill="var(--sk)" />)}
          {[[97, 8, 28], [97, 42, 22], [97, 72, 20]].map(([x, y, h], i) => <rect key={`b${i}`} x={x} y={y} width="6" height={h} rx="2" fill="var(--sk)" />)}
          {[[194, 12, 34], [194, 56, 36]].map(([x, y, h], i) => <rect key={`c${i}`} x={x} y={y} width="6" height={h} rx="2" fill="var(--sk)" />)}
          <path d="M6 30 C50 30 50 20 97 20 L97 34 C50 34 50 44 6 44Z" fill="var(--sk)" fillOpacity="0.5" />
          <path d="M6 48 C50 48 50 50 97 50 L97 62 C50 62 50 58 6 58Z" fill="var(--sk)" fillOpacity="0.5" />
          <path d="M6 70 C50 70 50 80 97 80 L97 90 C50 90 50 90 6 94Z" fill="var(--sk)" fillOpacity="0.5" />
          <path d="M103 20 C150 20 150 22 194 22 L194 40 C150 40 150 34 103 34Z" fill="var(--sk)" fillOpacity="0.5" />
          <path d="M103 50 C150 50 150 66 194 66 L194 84 C150 84 150 64 103 62Z" fill="var(--sk)" fillOpacity="0.5" />
        </Svg>
      )
    case 'map':
      return (
        <Svg stretch>
          <path d="M14 22 L58 10 L88 26 L80 58 L40 66 L12 48Z" fill="var(--sk)" fillOpacity="0.8" />
          <path d="M66 12 L120 8 L142 30 L104 46 L84 28Z" fill="var(--sk)" fillOpacity="0.55" />
          <path d="M92 48 L138 36 L176 50 L168 86 L120 92 L96 74Z" fill="var(--sk)" />
          <path d="M146 14 L188 18 L190 40 L152 34Z" fill="var(--sk)" fillOpacity="0.45" />
          <path d="M18 62 L66 72 L58 92 L22 90Z" fill="var(--sk)" fillOpacity="0.6" />
        </Svg>
      )
    case 'table':
      return (
        <div className="flex h-full flex-col gap-2.5 overflow-hidden">
          <div className="flex gap-4">
            {[28, 16, 16, 16, 16].map((w, i) => (
              <div key={i} className="h-3 rounded bg-[var(--sk)]" style={{ width: `${w}%` }} />
            ))}
          </div>
          {Array.from({ length: 9 }, (_, r) => (
            <div key={r} className="flex gap-4 border-t border-[var(--sk)] pt-2.5">
              {[28, 16, 16, 16, 16].map((w, i) => (
                <div key={i} className="h-2.5 rounded bg-[var(--sk)]" style={{ width: `${w * (i === 0 ? 0.8 : 0.6 + ((r * 3 + i) % 4) * 0.1)}%`, opacity: 0.7 }} />
              ))}
            </div>
          ))}
        </div>
      )
    case 'kpi':
      return (
        <div className="flex h-full flex-col justify-center gap-3">
          <div className={cn(STUB, 'h-2.5 w-24')} />
          <div className="h-9 w-36 rounded-md bg-[var(--sk)]" />
          <div className="h-8 w-full max-w-[220px]">
            <Svg stretch box="0 0 100 20">
              <path d="M0 15 L15 10 L30 13 L45 6 L60 9 L75 3 L100 5" {...LINE} />
            </Svg>
          </div>
        </div>
      )
    case 'text':
      return (
        <div className="flex h-full flex-col gap-3">
          {[92, 100, 84, 96, 60].map((w, i) => (
            <div key={i} className="h-2.5 rounded-full bg-[var(--sk)]" style={{ width: `${w}%` }} />
          ))}
        </div>
      )
    default:
      return <div className="h-full w-full rounded-xl bg-[var(--sk)]" style={{ opacity: 0.6 }} />
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
      style={{ '--sk': 'color-mix(in srgb, var(--ink) 12%, transparent)', height: height ?? SKELETON_DEFAULT_HEIGHT, minHeight: 100 } as CSSProperties}
    >
      <Drawing shape={shape} />
    </div>
  )
}

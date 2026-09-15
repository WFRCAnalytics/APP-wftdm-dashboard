# Contract: `ValueBoxSparkline` re-implementation (`src/panels/valueBoxSparkline.tsx`)

Satisfies FR-003. Same exported function name, same props, same
container size/placement — only the rendering library underneath
changes, matching this file's own existing "reuse the library, not a new
rendering engine" convention (now pointed at `@observablehq/plot` instead
of `recharts`).

## Props (unchanged)

```ts
export function ValueBoxSparkline({
  rows,
  config,
}: {
  rows: Record<string, unknown>[]
  config: ValueBoxSparklineConfig // { metric, x, y, chart_type? }
}): JSX.Element
```

## Shape (as actually built — `src/panels/valueBoxSparkline.tsx`)

```tsx
import { useEffect, useRef } from 'react'
import * as Plot from '@observablehq/plot'

import { useColorScheme } from '@/hooks/useColorScheme'
import type { ValueBoxSparklineConfig } from '@/layout/types'

const FALLBACK_CARD = { light: '#ffffff', dark: '#081b26' } as const

export function ValueBoxSparkline({
  rows,
  config,
}: {
  rows: Record<string, unknown>[]
  config: ValueBoxSparklineConfig
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const plotElementRef = useRef<Element | null>(null)
  const colorScheme = useColorScheme()

  useEffect(() => {
    const el = containerRef.current
    if (!el) return undefined

    const markName = config.chart_type === 'line' ? 'lineY' : 'barY'
    const mark = (Plot as unknown as Record<string, (d: unknown, o: unknown) => unknown>)[markName]

    const draw = () => {
      const width = el.clientWidth
      if (width === 0) return // not yet laid out — the ResizeObserver below draws it once it is

      const options = { x: config.x, y: config.y, fill: 'var(--chart-1)', stroke: 'var(--chart-1)' }
      const plotElement = Plot.plot({
        marks: [mark(rows, options) as unknown as Plot.Markish],
        width,
        height: 40,
        x: { axis: null },
        y: { axis: null },
        style: { fontSize: '12px' },
      }) as unknown as SVGSVGElement

      const card =
        getComputedStyle(document.documentElement).getPropertyValue('--card').trim() ||
        FALLBACK_CARD[colorScheme]
      plotElement.style.setProperty('--plot-background', card)

      if (plotElementRef.current) plotElementRef.current.remove()
      el.append(plotElement)
      plotElementRef.current = plotElement
    }

    draw()
    const observer = new ResizeObserver(() => draw())
    observer.observe(el)

    return () => {
      observer.disconnect()
      plotElementRef.current?.remove()
      plotElementRef.current = null
    }
  }, [rows, config.x, config.y, config.chart_type, colorScheme])

  return <div ref={containerRef} className="observable-plot-chart h-10 w-full" aria-hidden="true" />
}
```

Two real decisions the illustrative draft above left open, resolved
during implementation:

1. **A `ResizeObserver` IS included** — the value-box's own card width is
   not guaranteed stable across a sidebar collapse/window resize/panel-
   expand-dialog transition, so this keeps `Plot.plot()`'s own explicit
   `width` (it has no `responsive:true` equivalent) in sync the same way
   Recharts' `ResponsiveContainer` did before this conversion.
2. **The container reuses the `observable-plot-chart` class** — the same
   one `ObservablePlotPanel.tsx`'s own container carries, rather than a
   second, sparkline-only class name — so the established test convention
   (`.observable-plot-chart svg[viewBox]`) works identically here with no
   new selector vocabulary. `--plot-background` reuses `ObservablePlotPanel.tsx`'s
   own proven fix (research.md §8) exactly, including its `FALLBACK_CARD`
   constant and `useColorScheme()`-driven redraw-on-theme-flip (a full
   sparkline redraw is cheap enough that this doesn't need the full
   panel's own requery-avoiding split-effect optimization).

## What does NOT change

- `ValueBoxSparklineConfig` (`src/layout/types.ts`) — zero changes
  (data-model.md §1).
- `panels/ValueBoxPanel.tsx`'s own call site — still passes `rows`/
  `config` to `ValueBoxSparkline` exactly as today; no prop change.
- `panels/rechartsEncoding.ts` — no longer called by this file, but
  otherwise unchanged (still used by `RechartsPanel.tsx`).
- The sparkline's visual size/placement (`h-10 w-full`, no axes, no
  legend, no tooltip) — FR-003 requires this to look the same, not
  merely function the same.

## Explicitly out of scope (do not build)

- A `fill`/color-by-category mode for the sparkline — no current
  behavior to preserve here, and none is being added (data-model.md §3).
- Any `tip`/hover-tooltip affordance — the current Recharts sparkline has
  none (`isAnimationActive={false}`, no `<Tooltip>` element); this stays
  a purely visual mini-chart.

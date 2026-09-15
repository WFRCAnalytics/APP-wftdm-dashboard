import { useEffect, useRef } from 'react'
import * as Plot from '@observablehq/plot'

import { useColorScheme } from '@/hooks/useColorScheme'
import type { ValueBoxSparklineConfig } from '@/layout/types'

// 034-metric-panel-redesign (data-model.md §4 zone 4, research.md §2 of
// 034) — a small, minimal-chrome embedded chart for a value-box panel's
// optional sparkline mode.
//
// 057-observable-plot-conversion: re-implemented against
// @observablehq/plot instead of bare Recharts primitives (contracts/
// valuebox-sparkline-plot.md) — same exported function signature, same
// fixed h-10 (40px), axis-less, chrome-less presentation. Deliberately
// NOT a reuse of the full ObservablePlotPanel.tsx component — that one
// owns a ResizeObserver-driven legend-height compensation, panel-expand-
// dialog awareness, and its own loading/empty/error branches, none of
// which apply at sparkline scale (this component is only ever rendered
// once ValueBoxPanel.tsx's own sparklineStatus is already 'ready' — see
// that file). This mirrors the SAME "reuse the library, not the full
// chrome" reasoning this file's own previous Recharts version already
// established, just pointed at a different library.
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
  // Only consulted for the --plot-background dark-mode fix below — a
  // theme flip alone (no data/config change) still needs to re-resolve
  // and re-apply the real --card token, so it's included in the redraw
  // effect's own dependency array (unlike ObservablePlotPanel.tsx's
  // dedicated, requery-avoiding split, a full sparkline redraw on theme
  // flip is cheap enough not to warrant that same optimization).
  const colorScheme = useColorScheme()

  useEffect(() => {
    const el = containerRef.current
    if (!el) return undefined

    const markName = config.chart_type === 'line' ? 'lineY' : 'barY'
    // Looked up dynamically by name, matching ObservablePlotPanel.tsx's
    // own established pattern for the same reason (config.mark/
    // config.chart_type is a plain string, not a hardcoded enum).
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

      // Same dark-mode fix ObservablePlotPanel.tsx already established and
      // proved (research.md §8 of 057-observable-plot-conversion) —
      // Plot's own generated SVG hardcodes --plot-background: white,
      // invisible against this app's own dark --card card surface without
      // this override, applied directly to the svg element itself.
      const card =
        getComputedStyle(document.documentElement).getPropertyValue('--card').trim() ||
        FALLBACK_CARD[colorScheme]
      plotElement.style.setProperty('--plot-background', card)

      if (plotElementRef.current) plotElementRef.current.remove()
      el.append(plotElement)
      plotElementRef.current = plotElement
    }

    draw()

    // The value-box's own card width can change after this effect's
    // first run (sidebar collapse, window resize, panel-expand dialog) —
    // a ResizeObserver keeps the sparkline's own drawn width in sync, the
    // same real-time responsiveness Recharts' own ResponsiveContainer
    // provided before this conversion (Plot.plot() has no equivalent
    // built in, research.md §6).
    const observer = new ResizeObserver(() => draw())
    observer.observe(el)

    return () => {
      observer.disconnect()
      plotElementRef.current?.remove()
      plotElementRef.current = null
    }
  }, [rows, config.x, config.y, config.chart_type, colorScheme])

  // Reuses the SAME `observable-plot-chart` class ObservablePlotPanel.tsx's
  // own container carries — one consistent selector convention across the
  // app for "this DOM region holds Observable-Plot-rendered output"
  // (tests/integration/observablePlotPanel.spec.ts's and this feature's
  // own contracts/test-migration.md already establish `.observable-plot-
  // chart svg[viewBox]` as the standard way to find one), rather than a
  // second, sparkline-only class name a test author would have to know
  // about separately.
  return <div ref={containerRef} className="observable-plot-chart h-10 w-full" aria-hidden="true" />
}

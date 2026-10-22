import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PanelErrorState } from '@/panels/PanelErrorState'
import { usePanelExpandHost } from '@/layout/panelExpandHost'
import { RailContext } from '@/components/ui/railContext'
import { useFill } from '@/layout/fill'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'
import { registerPageTile } from '@/layout/pageExport'
import { createExportRegistry, ExportMenu, TileExportContext } from '@/layout/tileExport'

// The tile chrome (project-docs/redesign/02-layout-and-components.md section 2), top to bottom: header row (title,
// badges, expand), optional subtitle, control row, legend row, body. The error boundary, Suspense and expand
// mechanism stay with the callers; this component only lays out what they hand it.

/** The legend row's DOM node. A chart can portal its legend into it; the row hides itself while empty. */
const TileLegendContext = createContext<HTMLElement | null>(null)
export function useTileLegendSlot(): HTMLElement | null {
  return useContext(TileLegendContext)
}

export interface TileProps {
  title: string
  subtitle?: string
  /** Inline after the title. */
  badges?: ReactNode
  /** The control row: group-by, compare-as, scenario and view controls. */
  controls?: ReactNode
  /** Configured body height; the inline anchor keeps it exactly as before. */
  height?: number
  expandable: boolean
  /** The panel element (already inside its error boundary and Suspense); null when the type is unknown. */
  panel: ReactNode | null
  /** Shown in the body instead of a panel (unknown type, invalid config). */
  errorMessage?: string
}

export function Tile({ title, subtitle, badges, controls, height, expandable, panel, errorMessage }: TileProps) {
  const [legendEl, setLegendEl] = useState<HTMLDivElement | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const exports = useMemo(() => createExportRegistry(), [])
  // Tabbed pages: the tile fills the space it is given, its controls move to a rail beside the chart (wide screens).
  const fill = useFill()
  const wide = useMediaQuery('(min-width: 1100px)')
  // the rail needs room: a half-width tile keeps its controls above the chart
  const [cardWidth, setCardWidth] = useState(0)
  useEffect(() => {
    const el = cardRef.current
    if (!fill.active || !el) return
    const ro = new ResizeObserver(() => setCardWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [fill.active])
  const rail = fill.active && wide && cardWidth >= 760 && Boolean(controls)
  const bodyRef = useRef<HTMLDivElement>(null)
  const { report } = fill
  useEffect(() => {
    const el = bodyRef.current
    if (!fill.active || !el) return
    const measure = () => el.clientHeight > 80 && report(el.clientHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [fill.active, report])

  // Shared by the card and the expand overlay so every control keeps working while expanded.
  const chrome = (
    <>
      {badges && <div className="flex flex-wrap items-center gap-2">{badges}</div>}
      {controls && <div data-export-skip="" className="flex flex-wrap items-center gap-[10px]">{controls}</div>}
    </>
  )

  // Called unconditionally (rules of hooks); see panelExpandHost.tsx for why `body` is simply never placed when the
  // tile is not expandable.
  const { trigger, body } = usePanelExpandHost(title, panel, { height: fill.active ? '100%' : height, chrome: <>{subtitle && <p className="text-[12.5px] text-[var(--mute)]">{subtitle}</p>}{chrome}</>, exportMenu: (ref) => <ExportMenu title={title} cardRef={ref} tables={exports.all} /> })
  const hasPanel = panel !== null && !errorMessage
  useEffect(() => (hasPanel ? registerPageTile({ title, cardRef, tables: exports.all }) : undefined), [hasPanel, title, exports])

  return (
    <TileExportContext.Provider value={exports.registry}>
    <Card ref={cardRef} className="flex h-full flex-col">
      <CardHeader className="flex-row items-center gap-2 space-y-0 px-[18px] pb-0 pt-4">
        <CardTitle className="text-[15.5px]">{title}</CardTitle>
        {badges}
        <span className="flex-1" />
        {hasPanel && <ExportMenu title={title} cardRef={cardRef} tables={exports.all} />}
        {hasPanel && expandable && <span data-export-skip="">{trigger}</span>}
      </CardHeader>
      {subtitle && <p className="max-w-[72ch] px-[18px] pt-0.5 font-body text-[12.5px] text-[var(--mute)]">{subtitle}</p>}
      {controls && !rail && <div data-export-skip="" className="flex flex-wrap items-center gap-[10px] px-[18px] pt-[10px]">{controls}</div>}
      <div
        ref={setLegendEl}
        data-testid="tile-legend"
        className="max-h-[70px] min-h-0 overflow-y-auto px-[18px] pt-2 font-body text-[12.5px] text-[var(--mute)] empty:hidden"
      />
      <div className={cn(fill.active && 'flex min-h-0 flex-1 gap-1')}>
      <CardContent className={cn(fill.active ? 'relative min-h-0 min-w-0 flex-1 p-0' : 'px-[14px] pb-[14px] pt-2')}>
        <div ref={bodyRef} className={cn(fill.active && 'absolute bottom-[14px] left-[14px] right-[14px] top-2 overflow-hidden')}>
        <TileLegendContext.Provider value={legendEl}>
          {fill.active && fill.height === undefined ? null : errorMessage ? (
            <PanelErrorState message={errorMessage} />
          ) : hasPanel ? (
            expandable ? (
              body
            ) : (
              panel
            )
          ) : (
            <PanelErrorState message="This tile has nothing to show" />
          )}
        </TileLegendContext.Provider>
        </div>
      </CardContent>
      {rail && (
        <aside aria-label={`${title} controls`} data-export-skip="" className="flex w-[232px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-[var(--line)] px-4 pb-4 pt-3">
          <RailContext.Provider value={true}>{controls}</RailContext.Provider>
        </aside>
      )}
      </div>
    </Card>
    </TileExportContext.Provider>
  )
}

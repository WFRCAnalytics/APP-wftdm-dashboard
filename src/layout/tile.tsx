import { createContext, useContext, useState, type ReactNode } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PanelErrorState } from '@/panels/PanelErrorState'
import { usePanelExpandHost } from '@/layout/panelExpandHost'

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

  // Shared by the card and the expand overlay so every control keeps working while expanded.
  const chrome = (
    <>
      {badges && <div className="flex flex-wrap items-center gap-2">{badges}</div>}
      {controls && <div className="flex flex-wrap items-center gap-[10px]">{controls}</div>}
    </>
  )

  // Called unconditionally (rules of hooks); see panelExpandHost.tsx for why `body` is simply never placed when the
  // tile is not expandable.
  const { trigger, body } = usePanelExpandHost(title, panel, { height, chrome: <>{subtitle && <p className="text-[12.5px] text-[var(--mute)]">{subtitle}</p>}{chrome}</> })
  const hasPanel = panel !== null && !errorMessage

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0 px-[18px] pb-0 pt-4">
        <CardTitle className="text-[15.5px]">{title}</CardTitle>
        {badges}
        <span className="flex-1" />
        {hasPanel && expandable && trigger}
      </CardHeader>
      {subtitle && <p className="px-[18px] pt-1 font-body text-[12.5px] text-[var(--mute)]">{subtitle}</p>}
      {controls && <div className="flex flex-wrap items-center gap-[10px] px-[18px] pt-[10px]">{controls}</div>}
      <div
        ref={setLegendEl}
        data-testid="tile-legend"
        className="max-h-[70px] min-h-0 overflow-y-auto px-[18px] pt-2 font-body text-[12.5px] text-[var(--mute)] empty:hidden"
      />
      <CardContent className="px-[14px] pb-[14px] pt-2">
        <TileLegendContext.Provider value={legendEl}>
          {errorMessage ? (
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
      </CardContent>
    </Card>
  )
}

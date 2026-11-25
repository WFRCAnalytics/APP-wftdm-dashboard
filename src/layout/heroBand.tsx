import type { PanelConfig, ValueBoxPanelConfig } from '@/layout/types'
import { HeroCell, isPlainKpi } from '@/layout/heroCell'
import { useCompareInputs } from '@/hooks/useCompareInputs'
import { useSetting } from '@/hooks/useSetting'
import { useResolvedView } from '@/hooks/useViewContext'
import { HeroReferenceNamedContext, heroReferenceRun } from '@/panels/heroReference'
import { prettyOperators } from '@/services/typography'

/** The hero KPI band (project-docs/redesign/02-layout-and-components.md section 1.4): one raised container, equal columns
 * split by hairlines, two columns below 1100px with the last cell spanning both. Scroll and tabbed pages both draw it here.
 * With `hero.reference: band` (the default) the reference is named once, above the cells, instead of under every delta. */
/** True when a band draws a delta under some cell (a plain KPI; not the calibration count). */
export function heroHasDeltas(panels: PanelConfig[]): boolean {
  return panels.some((p) => p.type === 'valuebox' && isPlainKpi(p as ValueBoxPanelConfig) && (p as ValueBoxPanelConfig).kpi !== 'calibration')
}

/** `nameReference`: this band carries the page's one "Changes are against" line (the first band with deltas on the page). */
export function HeroBand({ rowName, panels, sectionId, nameReference = true }: { rowName: string; panels: PanelConfig[]; sectionId?: string; nameReference?: boolean }) {
  const view = useResolvedView()
  const { referenceLabel } = useCompareInputs()
  const placement = useSetting<'band' | 'cell'>('hero.reference')
  const named = placement === 'band' && heroHasDeltas(panels) && Boolean(heroReferenceRun(view))
  return (
    <div
      id={sectionId ? `section-${sectionId}` : undefined}
      className="flex shrink-0 scroll-mt-24 flex-col rounded-[26px] border border-[var(--glass-line)] bg-[var(--tile-hi)] p-[6px] shadow-[var(--sh1)]"
    >
      {named && nameReference && (
        <p className="flex items-center gap-2 px-5 pb-0 pt-3 font-body text-[12.5px] text-[var(--mute)]" data-testid="hero-reference">
          <i aria-hidden="true" className="inline-block h-0 w-[16px] border-t-2 border-dashed border-[var(--ink)]" />
          Changes are against <strong className="font-semibold text-[var(--ink)]">{prettyOperators(referenceLabel)}</strong>
        </p>
      )}
      {/* the row's test id is on the grid, so its children are the cells, as for every other row */}
      <div data-testid={rowName} className="grid grid-cols-[repeat(var(--n),minmax(0,1fr))] max-[1100px]:grid-cols-2" style={{ '--n': panels.length } as React.CSSProperties}>
        <HeroReferenceNamedContext.Provider value={named}>
          {panels.map((panel, index) => (
            <HeroCell key={`${rowName}-${index}`} config={panel} />
          ))}
        </HeroReferenceNamedContext.Provider>
      </div>
    </div>
  )
}

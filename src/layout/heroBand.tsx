import type { PanelConfig } from '@/layout/types'
import { HeroCell } from '@/layout/heroCell'

/** The hero KPI band (project-docs/redesign/02-layout-and-components.md section 1.4): one raised container, equal columns
 * split by hairlines, two columns below 1100px with the last cell spanning both. */
export function HeroBand({ rowName, panels, sectionId }: { rowName: string; panels: PanelConfig[]; sectionId?: string }) {
  return (
    <div
      id={sectionId ? `section-${sectionId}` : undefined}
      data-testid={rowName}
      className="grid shrink-0 scroll-mt-24 grid-cols-[repeat(var(--n),minmax(0,1fr))] rounded-[26px] border border-[var(--glass-line)] bg-[var(--tile-hi)] p-[6px] shadow-[var(--sh1)] max-[1100px]:grid-cols-2"
      style={{ '--n': panels.length } as React.CSSProperties}
    >
      {panels.map((panel, index) => (
        <HeroCell key={`${rowName}-${index}`} config={panel} />
      ))}
    </div>
  )
}

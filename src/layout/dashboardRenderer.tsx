import { PanelCard } from '@/layout/panelCard'
import type { DashboardTabConfig } from '@/layout/types'

// Renders one active tab's layout (docs/GRAMMAR.md: named rows, each a
// flat list of panels) as ordered rows of PanelCards, each sized by its
// width fraction (0.0-1.0) within its own row.
//
// CSS Grid, not flexbox, for the row track sizing: two panels at
// width: 0.5 each (a common case — see the fixture) produced flex-basis:
// 50%/50%, but flexbox's percentage flex-basis does NOT account for
// `gap` — 50% + 50% + the row's own gap exceeds 100% of the container,
// so flex-wrap silently wrapped the second panel onto its own line
// (looked like every panel was full-width, regardless of its configured
// width). Grid's `fr` units are gap-aware by design — gridTemplateColumns
// built from each panel's width fraction distributes exactly the
// remaining space after gaps are subtracted, no overflow/wrap surprise.
export function DashboardRenderer({ tab }: { tab: DashboardTabConfig }) {
  const rows = Object.entries(tab.layout)

  return (
    <div className="flex flex-col gap-6 p-6">
      {rows.map(([rowName, panels]) => (
        <div
          key={rowName}
          className="grid gap-6"
          style={{
            gridTemplateColumns: panels.map((p) => `${(p.width ?? 1) * 100}fr`).join(' '),
          }}
        >
          {panels.map((panel, index) => (
            <div key={`${rowName}-${index}`} className="min-w-0">
              <PanelCard config={panel} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

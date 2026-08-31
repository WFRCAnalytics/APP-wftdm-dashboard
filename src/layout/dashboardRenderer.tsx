import { PanelCard } from '@/layout/panelCard'
import type { DashboardTabConfig } from '@/layout/types'

// Renders one active tab's layout (docs/GRAMMAR.md: named rows, each a
// flat list of panels) as ordered rows of PanelCards, each sized by its
// width fraction (0.0-1.0) within its own row.
export function DashboardRenderer({ tab }: { tab: DashboardTabConfig }) {
  const rows = Object.entries(tab.layout)

  return (
    <div className="flex flex-col gap-6 p-6">
      {rows.map(([rowName, panels]) => (
        <div key={rowName} className="flex flex-wrap gap-6">
          {panels.map((panel, index) => (
            <div
              key={`${rowName}-${index}`}
              style={{ flexBasis: `${(panel.width ?? 1) * 100}%` }}
              className="min-w-0 flex-shrink"
            >
              <PanelCard config={panel} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

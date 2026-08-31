import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { DashboardTabConfig } from '@/layout/types'

// Wraps 002-design-tokens' shadcn Tabs for navigation only (trigger
// switching/accessibility) — shell.tsx owns which DashboardRenderer is
// actually mounted below, so an inactive tab's panels never query in the
// background. No tab count or name is hardcoded here (FR-001) — the
// trigger list is generated entirely from whatever `tabs` the caller
// passes.
export interface NavBarProps {
  tabs: DashboardTabConfig[]
  activeTab: string
  onTabChange: (tab: string) => void
}

export function NavBar({ tabs, activeTab, onTabChange }: NavBarProps) {
  return (
    <Tabs value={activeTab} onValueChange={onTabChange}>
      <TabsList>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.header.tab} value={tab.header.tab}>
            {tab.header.tab}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

import { Settings } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AppearanceTab } from '@/layout/settings/appearanceTab'
import { ScenariosTab } from '@/layout/settings/scenariosTab'
import { BasemapTab } from '@/layout/settings/basemapTab'
import { DocumentationTab } from '@/layout/settings/documentationTab'

// 020-settings-modal: the single dashboard-wide settings entry point,
// replacing shell.tsx's previous <ScenarioLoader />+<ThemeToggle /> pair
// entirely (FR-001, FR-002). Reuses components/ui/dialog.tsx
// (004-panel-expand-dialog) for modal chrome and components/ui/tabs.tsx
// (002/003, already proven by navBar.tsx's own tab strip) for the
// four-tab internal navigation (FR-003) — no new modal/tab primitive
// built from scratch (research.md §1). Escape/overlay-click/close-button
// dismissal (FR-016) is Dialog's own existing, unmodified behavior.
//
// 021-basemap-catalog-redesign (T026): DialogContent gains a fixed target
// height alongside its existing viewport-relative caps, so the modal's
// size is a pure function of the viewport — never of which tab is active
// (FR-019/FR-021, research.md §7). Tabs switches from a horizontal
// top-row strip to a vertical left-side rail (orientation="vertical" +
// flex-row), making a future tab addition a straightforward list
// insertion (FR-020). TabsContent keeps its existing overflow-y-auto for
// three of the four tabs — it just needed a properly-bounded ancestor
// (flex-1 min-h-0) to actually take effect, which it didn't have before
// this change. scrollbar-thin (tokens.css) applied to all three for
// consistency with the Basemap tab below, even though Appearance/
// Documentation rarely grow tall enough to actually scroll.
//
// UI polish pass (post-merge correction): the Basemap tab's own
// TabsContent no longer sets overflow-y-auto itself — basemapTab.tsx now
// owns its OWN internal fixed-header/scrollable-sections split (its
// preview map + description + Apply button must never scroll, only the
// catalog sections below them), so the outer TabsContent here is just a
// plain flex passthrough giving it real height to work with.
export function SettingsModal() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="h-4 w-4" />
          Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="flex h-[600px] max-h-[85vh] w-[95vw] max-w-[720px] flex-col gap-4">
        <DialogTitle>Settings</DialogTitle>
        <Tabs defaultValue="appearance" orientation="vertical" className="flex min-h-0 flex-1 flex-row gap-4">
          <TabsList>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="scenarios">Scenarios</TabsTrigger>
            <TabsTrigger value="basemap">Basemap</TabsTrigger>
            <TabsTrigger value="documentation">Documentation</TabsTrigger>
          </TabsList>
          <TabsContent value="appearance" className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            <AppearanceTab />
          </TabsContent>
          <TabsContent value="scenarios" className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            <ScenariosTab />
          </TabsContent>
          <TabsContent value="basemap" className="flex min-h-0 flex-1 flex-col">
            <BasemapTab />
          </TabsContent>
          <TabsContent value="documentation" className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            <DocumentationTab />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

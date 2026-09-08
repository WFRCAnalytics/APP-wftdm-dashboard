import { Settings } from 'lucide-react'

import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SidebarMenuButton, useSidebar } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'
import { AppearanceTab } from '@/layout/settings/appearanceTab'
import { ScenariosTab } from '@/layout/settings/scenariosTab'
import { BasemapTab } from '@/layout/settings/basemapTab'

// 020-settings-modal: the single dashboard-wide settings entry point,
// replacing shell.tsx's previous <ScenarioLoader />+<ThemeToggle /> pair
// entirely (FR-001, FR-002). Reuses components/ui/dialog.tsx
// (004-panel-expand-dialog) for modal chrome and components/ui/tabs.tsx
// (002/003, already proven by navBar.tsx's own tab strip) for the internal
// tab navigation (FR-003) — no new modal/tab primitive built from scratch
// (research.md §1). Escape/overlay-click/close-button dismissal (FR-016)
// is Dialog's own existing, unmodified behavior.
//
// 021-basemap-catalog-redesign (T026): DialogContent gains a fixed target
// height alongside its existing viewport-relative caps, so the modal's
// size is a pure function of the viewport — never of which tab is active
// (FR-019/FR-021, research.md §7). Tabs switches from a horizontal
// top-row strip to a vertical left-side rail (orientation="vertical" +
// flex-row), making a future tab addition a straightforward list
// insertion (FR-020). TabsContent keeps its existing overflow-y-auto for
// each tab — it just needed a properly-bounded ancestor (flex-1 min-h-0)
// to actually take effect, which it didn't have before this change.
// scrollbar-thin (tokens.css) applied for consistency with the Basemap
// tab below, even though Appearance rarely grows tall enough to actually
// scroll.
//
// UI polish pass (post-merge correction): the Basemap tab's own
// TabsContent no longer sets overflow-y-auto itself — basemapTab.tsx now
// owns its OWN internal fixed-header/scrollable-sections split (its
// preview map + description + Apply button must never scroll, only the
// catalog sections below them), so the outer TabsContent here is just a
// plain flex passthrough giving it real height to work with.
//
// Post-completion correction (explicit user request): the Documentation
// tab is REMOVED from this modal entirely — moved to its own standalone
// entry point (layout/documentationModal.tsx), a separate SidebarFooter
// item below this one, not nested inside it. Down to three tabs
// (Appearance/Scenarios/Basemap). The trigger itself also changed from a
// bordered/boxed <Button variant="outline"> to a plain, borderless
// SidebarMenuButton — visually consistent with the primary sidebar nav
// list and with the new DocumentationModal trigger sitting right below
// it, rather than looking like a distinct floating button. SidebarMenuButton
// already has its own collapsed-state centering built in
// (components/ui/sidebar.tsx); only the text label needs to hide here,
// same sr-only technique as before so getByRole('button', { name:
// 'Settings' }) keeps resolving regardless of collapse state.
export function SettingsModal() {
  const { state } = useSidebar()
  const collapsed = state === 'collapsed'
  return (
    <Dialog>
      <DialogTrigger asChild>
        <SidebarMenuButton>
          <Settings className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className={cn(collapsed && 'sr-only')}>Settings</span>
        </SidebarMenuButton>
      </DialogTrigger>
      <DialogContent className="flex h-[600px] max-h-[85vh] w-[95vw] max-w-[720px] flex-col gap-4">
        <DialogTitle>Settings</DialogTitle>
        <Tabs defaultValue="appearance" orientation="vertical" className="flex min-h-0 flex-1 flex-row gap-4">
          {/* 024-settings-modal-visual-redesign (US4, FR-013): the
              Appearance tab's own System/Light/Dark control is now ALSO a
              Tabs instance (appearanceTab.tsx), nesting a second
              role="tablist" inside this one while the modal is open on
              that tab. Distinct aria-labels on each TabsList (this one,
              and appearanceTab.tsx's own "Theme") is what lets any query
              or assistive technology tell them apart — research.md §3. */}
          <TabsList aria-label="Settings sections">
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="scenarios">Scenarios</TabsTrigger>
            <TabsTrigger value="basemap">Basemap</TabsTrigger>
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
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

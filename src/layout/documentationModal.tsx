import { BookOpen } from 'lucide-react'

import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { NavButton } from '@/layout/navButton'
import { DocumentationTab } from '@/layout/settings/documentationTab'

// Post-completion correction (explicit user request): Documentation is no
// longer one of SettingsModal's own tabs — it's its own standalone
// SidebarFooter entry, rendered BELOW SettingsModal (shell.tsx), not
// nested inside it. layout/settings/documentationTab.tsx itself is
// UNCHANGED and reused verbatim — its content (FR-014's own "clearly
// labeled placeholder, no broken link") doesn't change, only its
// presentation container does: a small standalone Dialog instead of one
// Tabs panel among several. Same trigger shape as SettingsModal's own
// (SidebarMenuButton, sr-only label when collapsed) for visual/behavioral
// parity between the two footer items.
export function DocumentationModal() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <NavButton icon={<BookOpen className="h-5 w-5" aria-hidden="true" />}>Documentation</NavButton>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogTitle>Documentation</DialogTitle>
        <DocumentationTab />
      </DialogContent>
    </Dialog>
  )
}

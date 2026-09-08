import type { LucideIcon } from 'lucide-react'
import * as icons from 'lucide-react'

// Kebab-case ("person-walking") -> PascalCase ("PersonWalking") lucide-react
// export name lookup — extracted out of ValueBoxPanel.tsx (its original,
// sole owner) during 030-sidebar-navigation, whose own sidebarNav.tsx needs
// the identical resolution for a tab's new `header.icon:` field
// (contracts/sidebar-shell.md's Primary navigation section: "resolved via
// the SAME iconComponentFor()-style lookup ValueBoxPanel.tsx already
// uses"). A shared module rather than a second, duplicated copy — matching
// this project's own established convention for logic reused across more
// than one file (tableLogic.ts, zonemapColor.ts). Returns undefined for an
// unresolvable name — every caller already has its own "no icon configured
// → no icon rendered, never a default/placeholder substitute" convention
// built on top of that.
export function iconComponentFor(name: string): LucideIcon | undefined {
  const pascal = name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
  return (icons as unknown as Record<string, LucideIcon>)[pascal]
}

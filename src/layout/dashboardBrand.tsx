import { useState } from 'react'

import { useColorScheme } from '@/hooks/useColorScheme'
import type { DashboardBranding } from '@/services/yamlLoader'

// Deployer-configurable app-wide branding (title/logo), rendered at the
// left edge of shell.tsx's own <header>, before NavBar's tab strip — see
// yamlLoader.ts's own DashboardBranding doc comment for the full "why
// this lives in dashboard-config/index.json, not a new config file"
// story. A small, standalone component (not inlined in shell.tsx
// directly) for the same reason resetViewControl.ts/mapTooltip.ts are
// their own modules — a real, independently-testable UI concern (image-
// load-failure fallback, theme-aware logo selection) shell.tsx itself
// has no need to know the internals of.
//
// Renders exactly one of three things, never a broken-image icon and
// never an empty gap when nothing is configured (FR-004): the resolved
// logo image, OR the configured title as plain text (only reached when
// there's no logo to show — a logo that already has its own name baked
// into the image, as WFRC's real one does, would otherwise show the same
// name twice), OR nothing at all.
export function DashboardBrand({ branding }: { branding: DashboardBranding }) {
  const colorScheme = useColorScheme()
  // Tracks the single most recently FAILED url, not a plain boolean — a
  // theme flip that resolves to a DIFFERENT url (light logoUrl -> dark
  // logoUrlDark or back) must get its own fresh attempt, not stay
  // permanently suppressed by an earlier, different url's own failure.
  const [failedUrl, setFailedUrl] = useState<string | null>(null)

  // Real, confirmed reason this needs a genuine light/dark PAIR, not one
  // url used for both themes: WFRC's own real logo assets (see
  // public/demo-dashboard-config/index.json) are dark-navy-on-transparent
  // for light mode and white-on-transparent for dark mode — either one
  // alone is illegible against the other theme's own header background.
  // Falls back to the light url in dark mode if no dark-specific one was
  // configured (still shows SOMETHING rather than nothing).
  const resolvedLogoUrl = colorScheme === 'dark' ? (branding.logoUrlDark ?? branding.logoUrl) : branding.logoUrl
  const showLogo = Boolean(resolvedLogoUrl) && resolvedLogoUrl !== failedUrl

  if (showLogo) {
    return (
      <img
        src={resolvedLogoUrl}
        alt={branding.title ?? 'Dashboard logo'}
        className="dashboard-brand-logo h-8 w-auto max-w-[220px] object-contain"
        onError={() => setFailedUrl(resolvedLogoUrl ?? null)}
      />
    )
  }

  if (branding.title) {
    // wftdm-design-system's own Page Title role (20px/600/tracking-tight) —
    // this text IS a page-level heading (the app's own name, shown when no
    // logo image exists), not an arbitrary one-off size. Previously
    // text-lg/18px, a value with no home in the design system's typography
    // scale at all — Phase 2's own audit found and fixed it.
    return (
      <span className="dashboard-brand-title whitespace-nowrap font-heading text-xl font-semibold tracking-tight text-foreground">
        {branding.title}
      </span>
    )
  }

  return null
}

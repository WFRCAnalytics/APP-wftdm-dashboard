// 055-build-time-skeleton: generates the boot skeleton's real markup at
// BUILD TIME (not runtime — the skeleton paints before any JavaScript
// executes, so it structurally CANNOT read deployer config the normal
// browser-fetch way main.tsx's own loadDashboards()/loadDashboardBranding()
// do). This plugin reads the exact same on-disk config files those
// runtime functions fetch — public/dashboard-config/ (a real deployer's
// own, gitignored) and public/demo-dashboard-config/ (this repo's own
// git-tracked demo content) — straight off `fs`, at the moment Vite
// processes `index.html`, and splices a REAL sidebar skeleton (actual
// tab count/labels/icon-presence, actual branding) into the single
// `<!-- BOOT_SKELETON --> ... <!-- /BOOT_SKELETON -->` marker pair
// index.html itself keeps as its own bare, brand-neutral fallback (used
// as-is if neither config root exists — never a build failure).
//
// Runs for BOTH real build targets this project has (`npm run build` ->
// dist/, `npm run build:pages` -> docs/) with zero target-specific code —
// `transformIndexHtml` is an ordinary Vite plugin hook, applied to
// whichever `index.html` Vite is currently processing regardless of
// `--outDir`; neither build script needed to change. Also runs for
// `npm run dev` (no reason to special-case it away — the skeleton should
// reflect whatever config is actually on disk there too, matching this
// project's own "no dev-only branching" discipline elsewhere, e.g.
// scenarioDiscovery.ts's registerDemoScenarios() applies unconditionally,
// not gated by NODE_ENV).
//
// Deliberately does NOT reuse services/yamlLoader.ts's real
// loadDashboards()/loadDashboardBranding() — those are browser-fetch-
// based (`fetch(url)`) and cannot run in this plugin's own Node/build
// context at all. This is an independent, build-time reimplementation of
// the same two on-disk shapes, the same category of deliberate
// duplication this project's own python/wftdm_dashboard/postprocessor
// already established for parsing the SAME summarize.yaml grammar in a
// different runtime (expand.py mirrors sqlExpander.ts; this file mirrors
// yamlLoader.ts) — not a shortcut, a genuinely different execution
// context with no shared runtime to call into.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import yaml from 'js-yaml'
import type { Plugin } from 'vite'

interface SkeletonTab {
  label: string
  hasIcon: boolean
}

interface SkeletonBranding {
  title?: string
  hasLogo: boolean
}

interface SkeletonRoot {
  tabs: SkeletonTab[]
  branding: SkeletonBranding
}

const EMPTY_ROOT: SkeletonRoot = { tabs: [], branding: { hasLogo: false } }

function readJSONSafe(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

/**
 * Mirrors services/yamlLoader.ts's own loadDashboards()/
 * loadDashboardBranding() read of one config root's index.json — the
 * SAME two real shapes (028-dashboard-branding): either a bare filename
 * array, or `{ dashboards: [...], title?, logoUrl?, logoUrlDark? }`.
 * Fails soft exactly like the runtime version's own `if (!res.ok) return
 * []` — a missing/malformed root contributes nothing to the skeleton,
 * never fails the build.
 */
function readDashboardRoot(rootDir: string): SkeletonRoot {
  const indexPath = resolve(rootDir, 'index.json')
  if (!existsSync(indexPath)) return EMPTY_ROOT

  const index = readJSONSafe(indexPath)
  if (index === null) return EMPTY_ROOT

  const isBareArray = Array.isArray(index)
  const filenames: unknown[] = isBareArray
    ? index
    : Array.isArray((index as Record<string, unknown>).dashboards)
      ? (index as Record<string, unknown>).dashboards as unknown[]
      : []

  const branding: SkeletonBranding = isBareArray
    ? { hasLogo: false }
    : {
        title:
          typeof (index as Record<string, unknown>).title === 'string'
            ? ((index as Record<string, unknown>).title as string)
            : undefined,
        hasLogo: Boolean(
          (index as Record<string, unknown>).logoUrl || (index as Record<string, unknown>).logoUrlDark,
        ),
      }

  const tabs: SkeletonTab[] = []
  for (const filename of filenames) {
    if (typeof filename !== 'string') continue
    const filePath = resolve(rootDir, filename)
    if (!existsSync(filePath)) continue
    try {
      const parsed = yaml.load(readFileSync(filePath, 'utf-8')) as
        | { header?: { tab?: unknown; icon?: unknown } }
        | undefined
      const label = parsed?.header?.tab
      // A single space is a REAL, valid header.tab (dashboard-8-test.yaml's
      // own deliberately-near-invisible sliver tab, CLAUDE.md's own
      // documented convention) — length > 0, never .trim().length > 0,
      // which would wrongly drop it.
      if (typeof label === 'string' && label.length > 0) {
        tabs.push({ label, hasIcon: typeof parsed?.header?.icon === 'string' })
      }
    } catch {
      // A malformed dashboard-*.yaml is a real, pre-existing authoring
      // error the runtime boot sequence already surfaces on its own
      // (main.tsx's parseDashboardConfig() catch, console.error) — the
      // skeleton just skips generating a row for it, never breaks the
      // build over placeholder generation for a file real boot will
      // also skip.
    }
  }
  return { tabs, branding }
}

const PULSE = 'animate-pulse rounded-md bg-muted'

function tabRowHtml(tab: SkeletonTab): string {
  // Real per-label width variance (clamped) — a small, honest touch of
  // fidelity beyond a uniform bar: a short tab name ("Explore") and a
  // long one ("Person/Household Models") shouldn't skeleton-render
  // identically when the real content won't either. Not exact text
  // measurement (this runs with no DOM/canvas available) — a reasonable,
  // deliberately approximate proxy, not a claim of pixel accuracy.
  const widthPx = Math.max(56, Math.min(168, tab.label.length * 7))
  const icon = tab.hasIcon
    ? `<div class="h-4 w-4 shrink-0 ${PULSE} rounded-full"></div>`
    : ''
  return `<li class="list-none"><div class="flex w-full items-center gap-3 rounded-md px-2.5 py-2" role="tab" aria-label="${escapeHtml(tab.label)}">${icon}<div class="h-4 ${PULSE}" style="width:${widthPx}px"></div></div></li>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * The real sidebar skeleton — structurally mirrors layout/shell.tsx's
 * own composition (SidebarHeader[brand+trigger] / SidebarContent[nav
 * rows] / SidebarFooter[Settings+Documentation]) and
 * components/ui/sidebar.tsx's own real widths/tokens/paddings
 * (SIDEBAR_WIDTH_EXPANDED='w-64', the --sidebar/--sidebar-foreground/
 * --sidebar-border token set, SidebarMenuButton's own `px-2.5 py-2
 * gap-3` row shape) — consulted directly from that file, not
 * approximated from memory, per the wftdm-design-system skill's own
 * "ground every skeleton in the real component it stands in for"
 * convention. Assumes the sidebar's own real DEFAULT state
 * (`defaultOpen = true`, expanded) — a narrow-viewport visitor briefly
 * sees the expanded shape before SidebarProvider's own mount-time
 * media-query check collapses it, an acceptable, bounded mismatch (the
 * real Shell settles it within one paint) rather than duplicating that
 * check's own logic here via a CSS media query this generator would
 * then have to keep in sync by hand.
 */
function buildSkeletonHtml(tabs: SkeletonTab[], branding: SkeletonBranding): string {
  const brand = branding.hasLogo
    ? `<div class="h-8 w-32 ${PULSE}"></div>`
    : branding.title
      ? `<div class="h-6 ${PULSE}" style="width:${Math.max(64, Math.min(180, branding.title.length * 9))}px"></div>`
      : ''

  const tabRows = tabs.map(tabRowHtml).join('')

  return `
    <div role="status" aria-label="Loading dashboard" class="flex min-h-screen bg-background text-foreground">
      <aside class="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar shadow-md">
        <div class="flex flex-col">
          <div class="flex items-center justify-between gap-2 p-4">
            ${brand || '<div></div>'}
            <div class="h-8 w-8 shrink-0 ${PULSE}"></div>
          </div>
          <div class="border-b border-sidebar-border"></div>
        </div>
        <div class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden px-2 py-2">
          <ul role="tablist" class="flex flex-col gap-0.5">${tabRows}</ul>
        </div>
        <div class="flex flex-col">
          <div class="border-b border-sidebar-border"></div>
          <div class="flex flex-col gap-0.5 p-4">
            <div class="flex w-full items-center gap-3 rounded-md px-2.5 py-2">
              <div class="h-4 w-4 shrink-0 ${PULSE} rounded-full"></div>
              <div class="h-4 w-16 ${PULSE}"></div>
            </div>
            <div class="flex w-full items-center gap-3 rounded-md px-2.5 py-2">
              <div class="h-4 w-4 shrink-0 ${PULSE} rounded-full"></div>
              <div class="h-4 w-24 ${PULSE}"></div>
            </div>
          </div>
        </div>
      </aside>
      <main class="flex min-h-screen min-w-0 flex-1 flex-col">
        <div class="flex flex-col gap-6 p-6">
          <div class="h-7 w-56 ${PULSE}"></div>
          <div class="grid gap-6" style="grid-template-columns: repeat(3, 1fr)">
            <div class="h-32 ${PULSE} rounded-lg border border-border shadow-md"></div>
            <div class="h-32 ${PULSE} rounded-lg border border-border shadow-md"></div>
            <div class="h-32 ${PULSE} rounded-lg border border-border shadow-md"></div>
          </div>
          <div class="grid gap-6" style="grid-template-columns: repeat(2, 1fr)">
            <div class="h-64 ${PULSE} rounded-lg border border-border shadow-md"></div>
            <div class="h-64 ${PULSE} rounded-lg border border-border shadow-md"></div>
          </div>
        </div>
      </main>
    </div>`.trim()
}

const MARKER_START = '<!-- BOOT_SKELETON -->'
const MARKER_END = '<!-- /BOOT_SKELETON -->'

export function bootSkeletonPlugin(): Plugin {
  return {
    name: 'wftdm-boot-skeleton',
    transformIndexHtml(html) {
      const startIdx = html.indexOf(MARKER_START)
      const endIdx = html.indexOf(MARKER_END)
      if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
        // Markers missing/malformed — leave index.html completely
        // untouched rather than guessing at a splice point. A real,
        // surfaced build-time signal (not a silent no-op): this plugin
        // is only useful when the marker pair exists.
        console.warn(
          'wftdm-boot-skeleton: BOOT_SKELETON marker pair not found in index.html — skeleton left as-is.',
        )
        return html
      }

      const primary = readDashboardRoot(resolve(process.cwd(), 'public/dashboard-config'))
      const demo = readDashboardRoot(resolve(process.cwd(), 'public/demo-dashboard-config'))

      // Same precedence as main.tsx's real boot sequence: tabs
      // CONCATENATE (deployer's own tabs first, demo tabs after —
      // `[...(await loadDashboards()), ...(await loadDashboards(demoRoot))]`),
      // branding fields resolve deployer-value ?? demo-value per field
      // (`primaryBranding.title ?? demoBranding.title`, etc.).
      const tabs = [...primary.tabs, ...demo.tabs]
      const branding: SkeletonBranding = {
        title: primary.branding.title ?? demo.branding.title,
        hasLogo: primary.branding.hasLogo || demo.branding.hasLogo,
      }

      const generated = `${MARKER_START}\n${buildSkeletonHtml(tabs, branding)}\n${MARKER_END}`
      return html.slice(0, startIdx) + generated + html.slice(endIdx + MARKER_END.length)
    },
  }
}

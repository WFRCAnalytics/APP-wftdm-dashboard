// 055-build-time-skeleton: generates the boot skeleton's real markup at
// BUILD TIME (not runtime — the skeleton paints before any JavaScript
// executes, so it structurally CANNOT read deployer config the normal
// browser-fetch way main.tsx's own site loader does). This plugin reads the exact same on-disk config files that
// loader fetches — public/dashboard-config/ (a real deployer's
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
// The site settings (title, logo, page list, assistant on/off) are read through src/config, the same pure schema and
// validator the browser uses, so there is no second parser. The page files themselves are read here with `fs`.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import yaml from 'js-yaml'
import type { Plugin } from 'vite'
import { getPath, validate } from '../src/config'

interface SkeletonTab {
  label: string
  hasIcon: boolean
}

interface SkeletonBranding {
  title?: string
  hasLogo: boolean
  /** `assistant: { enabled: false }` in dashboard-config.yaml (the deployment turned the AI assistant off). */
  assistantEnabled?: boolean
}

interface SkeletonRoot {
  tabs: SkeletonTab[]
  branding: SkeletonBranding
}

const EMPTY_ROOT: SkeletonRoot = { tabs: [], branding: { hasLogo: false } }

/**
 * Reads one config root's dashboard-config.yaml through the same pure schema the browser uses (src/config), so there is no
 * second parser to keep in step. Fails soft like the runtime: a missing or malformed file contributes nothing to the
 * skeleton and never fails the build.
 */
function readDashboardRoot(rootDir: string): SkeletonRoot {
  const configPath = resolve(rootDir, 'dashboard-config.yaml')
  if (!existsSync(configPath)) return EMPTY_ROOT

  let raw: unknown
  try {
    raw = yaml.load(readFileSync(configPath, 'utf-8'))
  } catch {
    return EMPTY_ROOT
  }
  const { settings } = validate(raw, { file: configPath })
  const pages = getPath(settings, 'pages')
  const filenames: unknown[] = Array.isArray(pages) ? pages : []
  const branding: SkeletonBranding = {
    title: typeof getPath(settings, 'title') === 'string' ? (getPath(settings, 'title') as string) : undefined,
    hasLogo: Boolean(getPath(settings, 'logo.light') || getPath(settings, 'logo.dark')),
    assistantEnabled: getPath(settings, 'assistant.enabled') as boolean | undefined,
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

// A neutral bar that reads on both the glass surfaces and the page background in either theme.
const BAR = 'animate-pulse bg-[color-mix(in_srgb,var(--ink)_12%,transparent)] motion-reduce:animate-none'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** One rail row of the collapsed floating nav (layout/navButton.tsx: 46px tall, 14px side padding, 20px icon). */
function tabRowHtml(tab: SkeletonTab): string {
  return `<div role="tab" aria-label="${escapeHtml(tab.label)}" class="flex h-[46px] w-full items-center rounded-[15px] px-[14px]"><div class="h-5 w-5 shrink-0 rounded-md ${BAR}"></div></div>`
}

/**
 * The boot skeleton: the real app shell in its resting state, taken from layout/shell.tsx, floatingNav.tsx, pageHeader.tsx
 * and dashboardRenderer.tsx rather than approximated: the collapsed floating glass nav (68px rail, 14px inset, 24px radius,
 * brand mark on top, one row per configured tab, the Show menu labels toggle, Settings and Theme at the bottom), then, at 96px in from the left, the page
 * header (title and subtitle at the left, the glass control bar at the right, with the 38px Assistant circle beside it unless the deployment turns the assistant off) and the page body (the hero KPI band, the dial row, the page-tabs strip, then a
 * row of two tiles). The nav is hidden and the content starts at the edge below 760px, where the real nav is a sheet.
 * Only the number of tab rows comes from the build's dashboard config, as before; the branding title/logo cannot show in a
 * collapsed rail so it no longer affects the markup.
 */
function buildSkeletonHtml(tabs: SkeletonTab[], assistant: boolean): string {
  const tabRows = tabs.map(tabRowHtml).join('')
  const kpiCell = (last: boolean) =>
    `<div class="flex h-[137px] flex-col gap-3 px-[22px] py-5 ${last ? 'max-[1100px]:col-span-2' : 'min-[1101px]:border-r min-[1101px]:border-[var(--glass-line)]'}"><div class="h-3 w-24 rounded-full ${BAR}"></div><div class="h-9 w-28 rounded-lg ${BAR}"></div><div class="h-4 w-36 rounded-full ${BAR}"></div></div>`
  // The dial row (valuebox with a ring): label, value and delta pill at the left, a half-circle dial at the right.
  const dialCell = (i: number) =>
    `<div class="relative flex h-[136px] flex-col gap-3 px-[22px] py-5 ${i < 2 ? 'min-[761px]:border-r min-[761px]:border-[var(--glass-line)]' : ''}"><div class="h-3 w-20 rounded-full ${BAR}"></div><div class="h-9 w-28 rounded-lg ${BAR}"></div><div class="h-4 w-40 rounded-full ${BAR}"></div><div class="absolute right-[22px] top-[26px] h-[44px] w-[88px] rounded-t-full ${BAR}"></div></div>`
  // The page-tabs strip (pill track of sections at the left, "Export all" at the right).
  const tabsStrip = `<div class="flex items-center justify-between"><div class="flex h-[38px] w-[400px] max-w-full items-center gap-2 rounded-full bg-[color-mix(in_srgb,var(--ink)_8%,transparent)] p-[3px]"><div class="h-8 w-[98px] rounded-full ${BAR}"></div><div class="h-3 w-20 rounded-full ${BAR}"></div><div class="h-3 w-20 rounded-full ${BAR}"></div><div class="h-3 w-12 rounded-full ${BAR}"></div></div><div class="h-4 w-20 rounded-full ${BAR} max-[759px]:hidden"></div></div>`
  const tile = `<div class="h-[320px] rounded-[22px] border border-[var(--glass-line)] bg-card p-[18px] shadow-[var(--sh1)]"><div class="h-4 w-40 rounded-full ${BAR}"></div><div class="mt-2 h-3 w-64 max-w-full rounded-full ${BAR}"></div></div>`

  return `
    <div role="status" aria-label="Loading dashboard" class="relative z-[1] min-h-screen">
      <span class="sr-only">Loading dashboard…</span>
      <nav aria-hidden="true" class="glass fixed bottom-[14px] left-[14px] top-[14px] z-40 flex w-[68px] flex-col overflow-hidden rounded-[24px] px-[10px] py-3 max-[759px]:hidden">
        <div class="mb-[14px] flex min-h-[46px] items-center px-[3px]"><div class="h-[38px] w-[38px] shrink-0 rounded-[13px] ${BAR}"></div></div>
        <div class="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">${tabRows}</div>
        <div class="mt-2 flex flex-col gap-1 border-t border-[var(--line)] pt-2">
          <div class="flex h-[46px] items-center px-[14px] max-[759px]:hidden"><div class="h-5 w-5 rounded-md ${BAR}"></div></div>
          <div class="flex h-[46px] items-center px-[14px]"><div class="h-5 w-5 rounded-md ${BAR}"></div></div>
          <div class="flex h-[46px] items-center px-[14px]"><div class="h-5 w-5 rounded-md ${BAR}"></div></div>
        </div>
      </nav>
      <main class="flex min-h-screen flex-col pl-[96px] max-[759px]:pl-0">
        <header class="flex flex-wrap items-center justify-between gap-x-5 gap-y-[14px] pb-3 pl-[14px] pr-7 pt-[26px]">
          <div class="flex min-w-0 items-center gap-3">
            <div class="hidden h-10 w-10 shrink-0 rounded-full ${BAR} max-[759px]:block"></div>
            <div class="min-w-0">
              <div class="h-10 w-[min(280px,60vw)] rounded-xl ${BAR}"></div>
              <div class="mt-[10px] h-4 w-[min(360px,70vw)] rounded-full ${BAR}"></div>
            </div>
          </div>
          <div class="flex w-[min(670px,100%)] items-center gap-2">
            <div class="glass flex h-[52px] min-w-0 flex-1 items-center gap-2 rounded-[26px] px-2">
              <div class="h-9 flex-1 rounded-full ${BAR}"></div>
              <div class="h-9 flex-1 rounded-full ${BAR}"></div>
              <div class="h-9 w-[120px] rounded-full ${BAR}"></div>
            </div>
            ${assistant ? `<div class="h-[38px] w-[38px] shrink-0 rounded-full ${BAR}"></div>` : ''}
          </div>
        </header>
        <div class="flex flex-col gap-[14px] pb-[60px] pl-[14px] pr-7 pt-2">
          <div class="grid grid-cols-5 rounded-[26px] border border-[var(--glass-line)] bg-[var(--tile-hi)] p-[6px] shadow-[var(--sh1)] max-[1100px]:grid-cols-2">
            ${[0, 1, 2, 3, 4].map((i) => kpiCell(i === 4)).join('')}
          </div>
          <div class="grid grid-cols-3 rounded-[26px] border border-[var(--glass-line)] bg-[var(--tile-hi)] p-[6px] shadow-[var(--sh1)] max-[760px]:grid-cols-1">
            ${[0, 1, 2].map(dialCell).join('')}
          </div>
          ${tabsStrip}
          <div class="grid grid-cols-2 gap-[14px] max-[900px]:grid-cols-1">${tile}${tile}</div>
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

      // Tabs concatenate like main.tsx's real boot sequence: the deployer's own first, then the demo's.
      const tabs = [...primary.tabs, ...demo.tabs]

      // The assistant's header button is on unless the deployment turns it off (the deployer's own config wins).
      const assistant = (primary.branding.assistantEnabled ?? demo.branding.assistantEnabled) !== false

      const generated = `${MARKER_START}\n${buildSkeletonHtml(tabs, assistant)}\n${MARKER_END}`
      return html.slice(0, startIdx) + generated + html.slice(endIdx + MARKER_END.length)
    },
  }
}

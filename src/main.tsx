// Boot sequence, per contracts/boot-sequence.md: initDuckDB() ->
// discoverScenarios() -> loadDashboards() -> render. 003-dashboard-shell-
// navigation is the first feature where this file actually renders
// anything — every prior feature left it a non-rendering stub.
import React from 'react'
import ReactDOM from 'react-dom/client'

import '@/styles/tokens.css'
import { configureVocab } from '@/charts/vocab'
import { configureMetrics } from '@/charts/lib/metrics'
import { configureUnits } from '@/charts/units'
import { configureExport } from '@/state/exportState'
import { configureLayout } from '@/state/layoutState'
import { setSiteSettings } from '@/state/siteSettings'
// 033-shadcn-default-theme: self-hosted Schibsted Grotesk / DM Mono font
// side-effecting imports — the real replacement for the old Google-Fonts-
// CDN runtime-injection module this project used to keep under
// src/lib/ (retired/deleted entirely, T024; quickstart.md Scenario 3's
// own grep sweep checks no literal reference to that old module's name
// remains anywhere in src/, so it's deliberately not spelled out here).
// A REAL finding during this task, not assumed: that old module's
// loader function was NEVER actually called from this file at all — its
// only real call site was the throwaway 002-design-tokens demo page's own
// mount effect (confirmed by direct grep before writing this comment) —
// so the real, production dashboard app never loaded the old WFRC brand
// typefaces from Google Fonts in the first place, despite tokens.css's
// own --font-* values naming them. This import is therefore a genuine,
// first-time wiring of real font loading into the production boot
// sequence, not a like-for-like mechanism swap.
import '@fontsource-variable/schibsted-grotesk'
import '@fontsource/dm-mono/400.css'
import '@fontsource/dm-mono/500.css'
import { toast } from 'sonner'

import { initDuckDB, setExtensionRepository } from './services/duckdb.ts'
import { discoverScenarios } from './services/scenarioDiscovery.ts'
import { bootCompareState } from './services/runResolution.ts'
import { setAssistantEnabled } from './state/assistantAvailability.ts'
import { allHidden, resolveSettingsTabs } from '@/config'
import { addProblems } from '@/state/configProblems'
import { configureSettingsTabs } from '@/state/settingsState'
import { configureAssistant } from '@/services/ai/assistantPolicy'
import { applyAssistantPolicy } from '@/state/aiState'
import { loadSite } from './services/siteConfig.ts'
import { configureNetwork, getExtensionRepository } from './services/networkPolicy.ts'
import { loadDashboards } from './services/yamlLoader.ts'
import { setDeployerScenarioPalette } from './panels/scenarioDisplay.ts'
import { setDeployerProtomapsSource } from './state/protomapsSourceState.ts'
import { setDeployerInterfaceColor } from './panels/interfaceColor.ts'
import { startAccentSync, startThemeSync } from './services/theme.ts'
import { parseDashboardConfig } from './layout/types.ts'
import { Shell } from './layout/shell.tsx'
import { FirstRun } from './layout/firstRun.tsx'
import { firstRunState } from './services/firstRun.ts'
import { Toaster } from './components/ui/sonner.tsx'
import { get as getFilter, set as setFilter } from './state/filterState.ts'

// Debug hook for manual/console verification (quickstart.md) and for the
// Playwright integration tests — not a requirement of the spec, an
// implementation convenience only. Shape matches exactly what's assigned
// below (duckdb.ts's exports spread flat, the rest namespaced).
export type WftdmDebugHook = typeof import('./services/duckdb.ts') & {
  appState: typeof import('./state/appState.ts')
  compareState: typeof import('./state/compareState.ts')
  filterState: typeof import('./state/filterState.ts')
  sqlExpander: typeof import('./services/sqlExpander.ts')
  yamlLoader: typeof import('./services/yamlLoader.ts')
  dashboards: import('./services/yamlLoader.ts').DashboardConfig[]
  branding: import('./services/yamlLoader.ts').DashboardBranding
}

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// 015-theme-toggle: one-shot pre-mount application of the OS-level
// prefers-color-scheme preference — closes a real, confirmed flash risk
// (research.md §3), not addressable from inside React at all: the boot
// sequence below (initDuckDB/discoverScenarios/loadDashboards) runs
// entirely before ReactDOM ever mounts, and index.html sets no background
// of its own, so a dark-preferring viewer would otherwise see the
// browser's plain white default for the whole boot duration. This line
// establishes NO ongoing tracking of its own — layout/settings/
// appearanceTab.tsx's own effect (020-settings-modal; relocated from
// layout/themeToggle.tsx, deleted by that feature) is what keeps the
// theme live-updated (and overridable) once it mounts, moments later.
document.documentElement.classList.toggle(
  'dark',
  window.matchMedia('(prefers-color-scheme: dark)').matches,
)

// 060-boot-notifications: mounted into its own root (index.html's
// #notifications, a sibling of #app — see that file's own comment) as
// the very first thing main.tsx does, before any boot step below starts.
// sonner's toast() calls only reach a Toaster that has already mounted
// and subscribed — a late-mounting one does not replay history — so this
// must happen before the first toast.loading() call a few lines down,
// not after the boot sequence like #app's own <Shell/> render is.
const notificationsEl = document.getElementById('notifications')
if (notificationsEl) {
  ReactDOM.createRoot(notificationsEl).render(
    <React.StrictMode>
      <Toaster />
    </React.StrictMode>,
  )
}

// Fire-and-forget — deliberately NOT awaited, unlike coi-serviceworker.js's
// own now-removed blocking reload-to-activate pattern (that one existed to
// inject COOP/COEP headers onto the document response itself, which only
// works if the worker already controlled the page before navigation
// started). This worker (public/asset-cache-serviceworker.js) never
// touches the document — only later fetches for a few specific, large,
// content-hashed DuckDB-WASM binaries — so it needs no such gate: the
// current page load proceeds exactly as it would with no service worker
// at all, and the worker installs in the background for the NEXT visit.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}asset-cache-serviceworker.js`)
    .catch(() => {})
}

// 060-boot-notifications: a loading->success/error toast per real boot
// phase (DuckDB-WASM init, then scenario/dashboard-config discovery),
// converted in place via sonner's id-based update (toast.success(text,
// {id}) restyles the SAME toast rather than stacking a second one) —
// the same toast.loading()-then-convert idiom gropaul/dash-ui's own real
// src/state/init.state.ts uses for its one connection-status toast,
// applied here across this app's own two real, already-existing boot
// phases rather than inventing new ones. Each also converts to an error
// toast on failure, then rethrows unchanged — this app previously had NO
// user-facing feedback at all for a boot-time failure (a silently frozen
// BOOT_SKELETON), a real, confirmed gap this closes for free without
// changing the actual fail-fast behavior below it.
const duckdbToastId = toast.loading('Connecting to DuckDB…')
try {
  await initDuckDB()
} catch (err) {
  toast.error('Failed to connect to DuckDB', { id: duckdbToastId, description: String(err) })
  throw err
}
toast.success('DuckDB connected', { id: duckdbToastId })

const scenariosToastId = toast.loading('Loading scenarios…')
let dashboards: Awaited<ReturnType<typeof loadDashboards>>
let site: Awaited<ReturnType<typeof loadSite>>
try {
  // The site settings (dashboard-config.yaml of the deployment's root, then, with the demo on, the demo root as the fallback) name
  // the page files: the deployment's pages first, then the demo's. Read before the runs are discovered (071-network-block): the extension
  // mirror must be set before the first Parquet read or extension install.
  site = await loadSite()
  configureNetwork(site.branding.network)
  try {
    await setExtensionRepository(getExtensionRepository())
  } catch (err) {
    // never blocks boot: DuckDB's own host stays
    addProblems([{ file: 'dashboard-config.yaml', path: 'network.duckdb_extensions', kind: 'invalid_value', message: `the extension address could not be set (${String(err)}); the database's own host is used` }])
  }
  await discoverScenarios()
  dashboards = []
  for (const source of site.pageSources) dashboards.push(...(await loadDashboards(source.baseUrl, source.pages)))
} catch (err) {
  toast.error('Failed to load scenarios', { id: scenariosToastId, description: String(err) })
  throw err
}
toast.success('Scenarios loaded', { id: scenariosToastId })

// Deployer-configurable settings (title, logos, colours, vocabularies, years, ...), in the shape the app reads.
const branding = site.branding
setAssistantEnabled(branding.assistantEnabled !== false)
// The assistant's providers and defaults from the site file (a deployer's list replaces the built-ins); then the form starts on them.
configureAssistant(branding.assistant)
applyAssistantPolicy()
// The Settings window's tabs and their order (`settings.tabs`); the assistant switch above wins over the list.
configureSettingsTabs(
  resolveSettingsTabs(branding.settingsTabs, { assistantEnabled: branding.assistantEnabled !== false }).map((n) => (n === 'assistant' ? 'ai' : n)),
)
// 063 redesign: this deployment's category vocabulary (modes, purposes, income groups) for the chart kinds.
configureVocab(branding.vocab)
configureMetrics(branding.metrics)
configureUnits(branding.units)
setSiteSettings(site.settings)
configureLayout(branding.layout)
configureExport({ footer: branding.exportFooter, title: branding.title })
// 063 redesign: model years, focus and Compare defaults (project-docs/redesign/03-state-and-compare.md §1.1). Needs the
// discovered runs and the merged config above; every tile and the control bar read the result.
bootCompareState(branding)
// 036-scenario-color-picker: semantic validation (is each entry a real
// CSS color) lives here, at the one real consumption point — the site loader
// itself stays a thin, format-only parse, matching its own existing
// convention for title/logoUrl/logoUrlDark. CSS.supports() is the real,
// standard browser API for this — no hand-rolled hex-only regex that
// would wrongly reject a legitimate rgb(...)/named-color entry (research.md §3).
// An entirely-invalid or empty result falls through to
// setDeployerScenarioPalette(undefined), which panels/scenarioDisplay.ts's
// own resolveDefaultScenarioColor() already treats as "use the shipped
// default" (FR-008 — never a broken/blank chart).
const validScenarioPalette = (branding.scenarioPalette ?? []).filter((entry) =>
  CSS.supports('color', entry),
)
setDeployerScenarioPalette(validScenarioPalette.length > 0 ? validScenarioPalette : undefined)
// 041-protomaps-pmtiles-basemap, revised: same real/demo-root precedence
// as every other DashboardBranding field above — set once, at boot,
// before any panel/Basemap-tab resolution could ever read it. A
// deployer's own hosted-API key wins over a self-hosted PMTiles URL when
// both happen to be set (a key needs no region/bbox prep and works for
// any zone geometry, so it's the more capable of the two) — this mirrors
// what the two fields' own doc comments on DashboardBranding already
// state as the intended precedence. No semantic validation of either
// value here (unlike scenarioPalette's CSS.supports() check above) — a
// bad/unreachable PMTiles URL is validated lazily, on first real use, by
// the pmtiles client library itself, and a bad/revoked API key simply
// fails the live tile request the same way any other unreachable basemap
// source does (FR-010's existing fail-soft-to-blank convention).
setDeployerProtomapsSource(
  branding.protomapsApiKey
    ? { kind: 'hosted-api', apiKey: branding.protomapsApiKey }
    : branding.protomapsPmtilesUrl
      ? { kind: 'pmtiles', url: branding.protomapsPmtilesUrl }
      : undefined,
)
// 061-appearance-controls: same real/demo-root precedence and
// CSS.supports() validation as scenarioPalette above. Applied to
// document.documentElement exactly ONCE, here, at boot — mirroring the
// theme-mode one-shot dark-class line above (a deployer's own
// configuration doesn't change during a session, so no ongoing tracking
// is needed at this call site). A viewer's own later session override is
// kept live by layout/settings/appearanceTab.tsx's own effect once it
// mounts — the identical division of responsibility theme-mode already
// established between this one-shot boot application and that later,
// reactive one.
for (const [role, value] of [
  ['primary', branding.primaryColor],
  ['secondary', branding.secondaryColor],
  ['accent', branding.accentColor],
  ['brand', branding.brandColor],
] as const) {
  if (value && CSS.supports('color', value)) {
    setDeployerInterfaceColor(role, value)
  }
}
// Derives --c-1..3 / --chart-* from the three data colors and --brand / --primary from the brand color (deployer default or viewer override) and keeps them
// current across theme and color changes (services/theme.ts).
startThemeSync()
startAccentSync()
// Sets the browser tab's own title — independent of whether the header
// renders it as visible text at all (shell.tsx only falls back to
// showing it inline when no logo is configured, see that file's own
// comment) — a configured title is always worth reflecting in the tab,
// regardless of the header's own logo/text choice.
if (branding.title) document.title = branding.title

// Parse failures are per-file and fail loud, not silent — a malformed
// dashboard-*.yaml is a config-authoring bug (contracts/
// dashboard-config-types.md), surfaced in the console rather than
// silently dropping that tab. FR-001 still holds for every file that did
// parse.
const parsedDashboards = dashboards.flatMap((d) => {
  try {
    return [parseDashboardConfig(d.raw, d.sourcePath)]
  } catch (err) {
    console.error(err)
    return []
  }
})

// Seeds every discovered filter's declared default value into
// filterState.ts before the tree ever mounts — synchronous, one-time,
// guaranteed to happen before any panel's own effect reads it. Doing this
// as a render-time or component-effect side effect instead would race:
// React runs child effects before parent effects, so a panel's own
// mount-time query could run before a parent component's seeding effect
// ever fired. First tab to declare a given filter id wins if two tabs
// happen to share one; get(id) !== undefined guards against re-seeding
// on hot reload.
for (const dashboard of parsedDashboards) {
  for (const filterDef of dashboard.filters) {
    if (getFilter(filterDef.id) === undefined) {
      setFilter(filterDef.id, filterDef.default)
    }
  }
}

// Every page hidden would leave an empty sidebar: reported once, and the shell then lists them all.
if (allHidden(parsedDashboards.map((d) => d.header))) {
  addProblems([{ file: 'dashboard-config.yaml', path: 'pages', kind: 'invalid_value', message: 'every page is hidden (header.hidden); all are listed instead' }])
}

// A page's documentation path needs the site's documentation address; without one it is ignored (reported once here).
if (!branding.docsUrl) {
  addProblems(
    parsedDashboards
      .filter((d) => d.header.docs)
      .map((d) => ({ file: `page "${d.header.tab}"`, path: 'header.docs', kind: 'invalid_value' as const, message: 'no documentation address (docs.url) is set; this path is ignored' })),
  )
}

// 070-demo-build-flag: with nothing to show (no site file, or no page that loaded) say so instead of rendering an empty shell.
const firstRun = firstRunState({
  siteFound: site.siteFound,
  listed: site.pageSources.reduce((n, source) => n + source.pages.length, 0),
  loaded: parsedDashboards.length,
  searched: site.searched,
})

const rootEl = document.getElementById('app')
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>{firstRun ? <FirstRun state={firstRun} /> : <Shell dashboards={parsedDashboards} branding={branding} />}</React.StrictMode>,
  )
}

if (typeof window !== 'undefined') {
  const duckdbService = await import('./services/duckdb.ts')
  const appState = await import('./state/appState.ts')
  const filterState = await import('./state/filterState.ts')
  const compareState = await import('./state/compareState.ts')
  const sqlExpander = await import('./services/sqlExpander.ts')
  const yamlLoader = await import('./services/yamlLoader.ts')
  window.__wftdm = {
    ...duckdbService,
    appState,
    compareState,
    filterState,
    sqlExpander,
    yamlLoader,
    dashboards,
    branding,
  }
}

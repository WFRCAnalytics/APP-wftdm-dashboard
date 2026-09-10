// Boot sequence, per contracts/boot-sequence.md: initDuckDB() ->
// discoverScenarios() -> loadDashboards() -> render. 003-dashboard-shell-
// navigation is the first feature where this file actually renders
// anything — every prior feature left it a non-rendering stub.
import React from 'react'
import ReactDOM from 'react-dom/client'

import '@/styles/tokens.css'
// 033-shadcn-default-theme: self-hosted Geist/Geist Mono variable-font
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
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import { initDuckDB } from './services/duckdb.ts'
import { discoverScenarios } from './services/scenarioDiscovery.ts'
import { loadDashboards, loadDashboardBranding, type DashboardBranding } from './services/yamlLoader.ts'
import { setDeployerScenarioPalette } from './panels/scenarioDisplay.ts'
import { parseDashboardConfig } from './layout/types.ts'
import { Shell } from './layout/shell.tsx'
import { get as getFilter, set as setFilter } from './state/filterState.ts'

// Debug hook for manual/console verification (quickstart.md) and for the
// Playwright integration tests — not a requirement of the spec, an
// implementation convenience only. Shape matches exactly what's assigned
// below (duckdb.ts's exports spread flat, the rest namespaced).
export type WftdmDebugHook = typeof import('./services/duckdb.ts') & {
  appState: typeof import('./state/appState.ts')
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

await initDuckDB()
await discoverScenarios()

// 026-activitysim-demo-content: dashboards from the new, git-tracked
// public/demo-dashboard-config/ content root are concatenated after the
// existing public/dashboard-config/ tabs — loadDashboards() itself needs
// no change at all, its existing `baseUrl` parameter already supports
// this second call (research.md #4).
const dashboards = [
  ...(await loadDashboards()),
  ...(await loadDashboards(`${import.meta.env.BASE_URL}demo-dashboard-config/`)),
]

// Deployer-configurable app-wide branding (title/logo) — same two-root
// read as `dashboards` above, but PRECEDENCE, not concatenation: a real
// deployment's own public/dashboard-config/index.json (gitignored,
// populated externally per deployment) wins per-field when it sets one,
// falling back to the git-tracked demo root's own real branding
// otherwise — the same "author choice, then a real default" precedence
// shape resolveEffectiveBasemap() already establishes for basemaps, not
// a new pattern invented here. In THIS repo's own demo/dev/CI
// environment, public/dashboard-config/ is either empty or fixture-only
// (gitignored, ephemeral — see CLAUDE.md's own Config file set section),
// so the demo root's real WFRC branding (public/demo-dashboard-config/
// index.json) is what actually shows up out of the box.
const [primaryBranding, demoBranding] = await Promise.all([
  loadDashboardBranding(),
  loadDashboardBranding(`${import.meta.env.BASE_URL}demo-dashboard-config/`),
])
const branding: DashboardBranding = {
  title: primaryBranding.title ?? demoBranding.title,
  logoUrl: primaryBranding.logoUrl ?? demoBranding.logoUrl,
  logoUrlDark: primaryBranding.logoUrlDark ?? demoBranding.logoUrlDark,
  scenarioPalette: primaryBranding.scenarioPalette ?? demoBranding.scenarioPalette,
}
// 036-scenario-color-picker: semantic validation (is each entry a real
// CSS color) lives here, at the one real consumption point — loadDashboardBranding()
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

const rootEl = document.getElementById('app')
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <Shell dashboards={parsedDashboards} branding={branding} />
    </React.StrictMode>,
  )
}

if (typeof window !== 'undefined') {
  const duckdbService = await import('./services/duckdb.ts')
  const appState = await import('./state/appState.ts')
  const filterState = await import('./state/filterState.ts')
  const sqlExpander = await import('./services/sqlExpander.ts')
  const yamlLoader = await import('./services/yamlLoader.ts')
  window.__wftdm = {
    ...duckdbService,
    appState,
    filterState,
    sqlExpander,
    yamlLoader,
    dashboards,
    branding,
  }
}

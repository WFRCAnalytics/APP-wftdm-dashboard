// Boot sequence, per contracts/boot-sequence.md: initDuckDB() ->
// discoverScenarios() -> loadDashboards() -> render. 003-dashboard-shell-
// navigation is the first feature where this file actually renders
// anything — every prior feature left it a non-rendering stub.
import React from 'react'
import ReactDOM from 'react-dom/client'

import '@/styles/tokens.css'
import { initDuckDB } from './services/duckdb.ts'
import { discoverScenarios } from './services/scenarioDiscovery.ts'
import { loadDashboards } from './services/yamlLoader.ts'
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
const dashboards = await loadDashboards()

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
      <Shell dashboards={parsedDashboards} />
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
  }
}

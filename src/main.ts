// Boot sequence stub — no rendering. Per contracts/boot-sequence.md, the
// fixed order is: initDuckDB() -> discoverScenarios() -> loadDashboards().
import { initDuckDB } from './services/duckdb.ts'
import { discoverScenarios } from './services/scenarioDiscovery.ts'
import { loadDashboards } from './services/yamlLoader.ts'

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

await initDuckDB()
await discoverScenarios()
const dashboards = await loadDashboards()
// FR-013/FR-021: loaded, not consumed — no layout/panel code exists in this
// slice to render `dashboards`. Exposed on the debug hook below for tests.

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

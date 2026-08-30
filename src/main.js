// Boot sequence stub — no rendering. Per contracts/boot-sequence.md, the
// fixed order is: initDuckDB() -> discoverScenarios() -> loadDashboards().
import { initDuckDB } from './services/duckdb.js'
import { discoverScenarios } from './services/scenarioDiscovery.js'
import { loadDashboards } from './services/yamlLoader.js'

await initDuckDB()
await discoverScenarios()
const dashboards = await loadDashboards()
// FR-013/FR-021: loaded, not consumed — no layout/panel code exists in this
// slice to render `dashboards`. Exposed on the debug hook below for tests.

// Expose a debug hook for manual/console verification (quickstart.md),
// matching the spec's own "verify via console or automated tests" framing.
// Not a requirement of the spec — an implementation convenience only.
if (typeof window !== 'undefined') {
  const duckdbService = await import('./services/duckdb.js')
  const appState = await import('./state/appState.js')
  const filterState = await import('./state/filterState.js')
  const sqlExpander = await import('./services/sqlExpander.js')
  const yamlLoader = await import('./services/yamlLoader.js')
  window.__wftdm = {
    ...duckdbService,
    appState,
    filterState,
    sqlExpander,
    yamlLoader,
    dashboards,
  }
}

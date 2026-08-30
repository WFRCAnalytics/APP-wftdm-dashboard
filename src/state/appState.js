// Scenario metadata/selection registry — distinct from services/duckdb.js's
// view registration. duckdb.js tracks *queryable Parquet views*; this module
// tracks *scenario metadata and selection state* (the Scenario entity in
// data-model.md). No pub/sub here (unlike filterState.js) — no FR requires
// it; reads are pull-based only. No persistence — in-memory only for the
// page's lifetime (constitution Principle VI: no Web Storage).
// See specs/001-data-state-layer/contracts/app-state.md.

/** @typedef {{ name: string, runDate?: string, color?: string, notes?: string,
 *   source: 'url'|'handle', pinned: boolean, active: boolean,
 *   status: 'registering'|'ready'|'failed' }} Scenario */

/** @type {Map<string, Scenario>} */
const scenarios = new Map()

/**
 * Adds a new Scenario entry with status: 'registering' and active: false —
 * always, regardless of metadata.pinned. `pinned` never auto-activates;
 * only an explicit setActive() call ever changes `active`. Registering an
 * already-registered name replaces the prior entry cleanly (no merge).
 * @param {string} name
 * @param {{ runDate?: string, color?: string, notes?: string,
 *   source: 'url'|'handle', pinned?: boolean }} metadata
 */
export function register(name, metadata) {
  scenarios.set(name, {
    name,
    runDate: metadata.runDate,
    color: metadata.color,
    notes: metadata.notes,
    source: metadata.source,
    pinned: Boolean(metadata.pinned),
    active: false,
    status: 'registering',
  })
}

/**
 * @param {string} name
 * @param {'ready'|'failed'} status
 */
export function setStatus(name, status) {
  const entry = scenarios.get(name)
  if (!entry) {
    throw new Error(`appState.setStatus: "${name}" was never registered`)
  }
  entry.status = status
}

/**
 * The only function that changes `active`. Callers are always responsible
 * for calling this explicitly — there is no implicit pinned-aware branching
 * here (see contracts/app-state.md).
 * @param {string} name
 * @param {boolean} active
 */
export function setActive(name, active) {
  const entry = scenarios.get(name)
  if (!entry) {
    throw new Error(`appState.setActive: "${name}" was never registered`)
  }
  entry.active = active
}

/**
 * @param {string} name
 * @returns {Scenario | undefined}
 */
export function get(name) {
  return scenarios.get(name)
}

/** @returns {Scenario[]} */
export function list() {
  return Array.from(scenarios.values())
}

/** @returns {Scenario[]} */
export function getActive() {
  return list().filter((s) => s.active)
}

/** @param {string} name */
export function unregister(name) {
  scenarios.delete(name)
}

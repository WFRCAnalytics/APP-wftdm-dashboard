// A fixed-size pool of throwaway DuckDB-WASM "loader" instances that
// register+fetch Parquet files IN PARALLEL, then hand each resolved
// buffer off to the app's one shared query-serving instance
// (services/duckdb.ts's registerBufferOnSharedInstance()). Built per
// 052-option3-implementation, implementing 051-scope-option3-pool-design's
// own now-complete, empirically-grounded design — see
// specs/051-scope-option3-pool-design/research.md for the real
// measurements behind every constant/decision below.
//
// WHY a pool of separate instances, not more connections on the shared
// one: confirmed empirically (050/051) that multiple AsyncDuckDBConnections
// against ONE AsyncDuckDB instance fund all queries through the same
// single Worker and buy ZERO real parallelism — only genuinely separate
// instances (their own Worker each) measurably parallelize file
// registration. See services/duckdb.ts's createLoaderInstance() and
// registerBufferOnSharedInstance() for the two touchpoints this module
// uses — every other direct AsyncDuckDB/AsyncDuckDBConnection call stays
// local to this file (the loader instances themselves are never the
// shared singleton, so there's no encapsulation concern using their own
// API directly here, unlike touching the shared instance).
import * as duckdb from '@duckdb/duckdb-wasm'
import { createLoaderInstance, registerBufferOnSharedInstance } from './duckdb.ts'

// 051 §1: swept pool sizes 1/2/3/4/6/8 against the real ~105-file/3-
// scenario shape AND simulated growth (140/175 files, ~4-5 scenarios).
// Pool sizes 6 and 8 were statistically tied at 105 files (2474ms vs
// 2471ms) — no measured benefit from the extra 2 concurrent Workers for
// today's real workload — and pool 6 stayed within ~11% of pool 8 even
// at simulated 5-scenario scale. A plain fixed constant, not a formula
// scaling with scenario/file count: the sweep didn't justify that added
// complexity for any realistic near-term deployment size (see that
// doc's own "Recommendation" section for the reasoning against an
// adaptive size).
const POOL_SIZE = 6

// Clamped to the real device's own core count when known, so a
// low-core viewer never gets more concurrent Workers than it has
// hardware for. NOT swept/measured (051's own sweep ran on one real
// machine) — a real, separate, cheap defensive floor/ceiling, not a
// substitute for the sweep-backed default of 6 above.
function resolvePoolSize(fileCount: number): number {
  const hwCap =
    typeof navigator !== 'undefined' && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : POOL_SIZE
  return Math.max(1, Math.min(POOL_SIZE, hwCap, fileCount))
}

// 051 §2: a failed file gets ONE retry, on the SAME loader instance —
// confirmed there's no reason to believe a different instance would
// succeed against the identical URL (the realistic failure mode for a
// real deployment's HTTP-served Parquet is a transient network blip or
// a genuinely missing/malformed file, neither of which a different
// engine instance changes). Cross-instance retry routing was
// deliberately not built — real complexity for no evidenced benefit.
const MAX_ATTEMPTS_PER_FILE = 2

export interface PoolFileSpec {
  /** The final, public view name this file must resolve to on the
   * SHARED instance once registration succeeds (e.g.
   * "activitysim-baseline__summary_kpis") — namespacing/uniqueness is
   * the caller's responsibility, matching services/duckdb.ts's own
   * registerFileURL() contract. */
  viewName: string
  url: string
}

export interface PoolRegistrationResult {
  /** viewNames that now exist, queryable, on the shared instance. */
  succeeded: string[]
  /** Files that failed after every retry — never surfaced as a thrown
   * exception (051 §2: one bad file must not abort the rest of the
   * pool's run); the caller decides what a partial result means for
   * scenario status (see scenarioDiscovery.ts's own registerSummaryFolder()). */
  failed: PoolFileSpec[]
}

/**
 * Registers `files` as views on the shared DuckDB-WASM instance, using a
 * fixed pool of separate loader instances for real parallelism. Resolves
 * once every file has either succeeded or exhausted its retries — never
 * rejects itself (per-file failure is isolated and reported in the
 * returned `failed` list, not thrown).
 */
export async function registerFilesViaPool(files: PoolFileSpec[]): Promise<PoolRegistrationResult> {
  if (files.length === 0) return { succeeded: [], failed: [] }

  const poolSize = resolvePoolSize(files.length)
  const queue = [...files]
  const succeeded: string[] = []
  const failed: PoolFileSpec[] = []

  await Promise.all(Array.from({ length: poolSize }, () => runLoader(queue, succeeded, failed)))

  return { succeeded, failed }
}

/**
 * One loader's own lifetime: boot a fresh instance, pull files off the
 * shared queue one at a time until it's empty, then tear down
 * immediately — NOT batched at the end of the whole pool's run.
 * Confirmed safe (051 §4): terminating a loader the instant its own
 * queue slice is exhausted, even while slower sibling loaders are still
 * working, does not race or corrupt an already-completed handoff — a
 * fast loader doesn't sit idle waiting for the pool's slowest member.
 */
async function runLoader(
  queue: PoolFileSpec[],
  succeeded: string[],
  failed: PoolFileSpec[],
): Promise<void> {
  const loader = await createLoaderInstance()
  try {
    const conn = await loader.connect()
    try {
      let next: PoolFileSpec | undefined
      // eslint-disable-next-line no-cond-assign
      while ((next = queue.shift())) {
        const ok = await registerOneFile(loader, conn, next)
        if (ok) succeeded.push(next.viewName)
        else failed.push(next)
      }
    } finally {
      await conn.close()
    }
  } finally {
    await loader.terminate()
  }
}

/**
 * Registers, validates, and hands off ONE file. Returns false (never
 * throws) once every attempt is exhausted — 051 §2's confirmed real
 * AsyncDuckDB behavior: `registerFileURL()` itself never throws on a
 * bad path (it only maps a name to a URL); the later query DOES throw,
 * but with a low-level, unusable Emscripten string ("_setThrew is not
 * defined") — never surfaced here, only logged for diagnostics. The
 * loader's own connection is confirmed NOT corrupted by a failed query
 * (051 §2), so the SAME connection is safely reused for this loader's
 * next file regardless of whether this one succeeded.
 *
 * Each ATTEMPT uses a distinct loader-local name
 * (`${viewName}::attempt${n}`), not the same name retried — a real,
 * previously-confirmed bug in this exact codebase's history
 * (031-all-panel-demo-content's own zoneGeometry.ts fallback: reusing a
 * name after a failed registerFileURL() leaves it "already registered,"
 * and the retry's own registerFileURL() call throws `File already
 * registered`). The loader-local name is scoped to this one loader
 * instance's own short lifetime and is never the file's final, public
 * viewName — only registerBufferOnSharedInstance()'s own call, below,
 * ever creates that.
 */
async function registerOneFile(
  loader: duckdb.AsyncDuckDB,
  conn: duckdb.AsyncDuckDBConnection,
  file: PoolFileSpec,
): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_FILE; attempt++) {
    const localName = `${file.viewName}::attempt${attempt}`
    try {
      await loader.registerFileURL(localName, file.url, duckdb.DuckDBDataProtocol.HTTP, false)
      // Validates the file is actually fetchable/well-formed BEFORE any
      // handoff is attempted — the same eager-validation role
      // services/duckdb.ts's own createViewOverParquet() plays for the
      // single-file registerFileURL() path (its own comment: this query
      // "is what makes registerFileURL() correctly reject on an
      // unreachable URL"). A throwaway view name is fine here — this
      // loader instance is terminated once its queue slice is empty,
      // never queried again after this.
      await conn.query(
        `CREATE OR REPLACE VIEW "${localName}" AS SELECT * FROM read_parquet('${localName}')`,
      )
      const buffer = await loader.copyFileToBuffer(localName)
      await registerBufferOnSharedInstance(file.viewName, buffer)
      return true
    } catch (err) {
      if (attempt === MAX_ATTEMPTS_PER_FILE) {
        console.warn(
          `duckdbLoaderPool: "${file.viewName}" (${file.url}) failed after ${attempt} attempt(s)`,
          err,
        )
        return false
      }
      // else: fall through and retry with a fresh attempt-scoped name.
    }
  }
  return false
}

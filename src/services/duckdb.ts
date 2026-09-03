// DuckDB-WASM service — the sole owner of the shared AsyncDuckDB instance.
//
// No separate duckdb.worker.ts exists (constitution Principle II, amended
// 1.2.0): DuckDB-WASM ships its own worker script. This module selects a
// bundle, instantiates that worker, and constructs AsyncDuckDB on the main
// thread to coordinate it — the actual SQL execution happens inside
// DuckDB-WASM's own worker, never on the main thread.
//
// Self-hosted bundle (Vite `?url` imports from node_modules), NOT
// duckdb.getJsDelivrBundles() — a CDN fetch for the query engine's own
// binaries would require internet access, breaking `wftdm-dashboard here`'s
// no-internet-required design. See research.md §3.
import * as duckdb from '@duckdb/duckdb-wasm'
import duckdb_wasm_mvp from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'

const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
  mvp: { mainModule: duckdb_wasm_mvp, mainWorker: mvp_worker },
  eh: { mainModule: duckdb_wasm_eh, mainWorker: eh_worker },
}

let dbPromise: Promise<duckdb.AsyncDuckDB> | null = null
let connectionPromise: Promise<duckdb.AsyncDuckDBConnection> | null = null

/** Every currently registered view name, however registered. */
const allViews = new Set<string>()

/**
 * Selects a bundle, instantiates DuckDB-WASM's own worker, and constructs
 * the shared AsyncDuckDB instance. Idempotent — calling this more than once
 * resolves against the same instance/connection, never creates a second one.
 *
 * Both `dbPromise` and `connectionPromise` are assigned synchronously
 * (before their first `await`), not behind an `if (!x) { x = await ... }`
 * check — that shape has a race: two concurrent callers can both pass the
 * check before either assignment lands, each awaiting its own `connect()`
 * and creating two connections. Assigning the pending promise itself first
 * means every caller — however many, however concurrent — awaits the exact
 * same promise, so only one `connect()` ever runs. Not reachable today
 * (main.ts is the only caller), but the contract requires idempotency
 * unconditionally, not just for the caller pattern that happens to exist.
 */
export async function initDuckDB(): Promise<void> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const bundle = await duckdb.selectBundle(MANUAL_BUNDLES)
      const worker = new Worker(bundle.mainWorker!)
      const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING)
      const db = new duckdb.AsyncDuckDB(logger, worker)
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
      return db
    })()
  }
  if (!connectionPromise) {
    connectionPromise = dbPromise.then((db) => db.connect())
  }
  await connectionPromise
}

async function getDB(): Promise<duckdb.AsyncDuckDB> {
  const db = await dbPromise
  if (!db) throw new Error('duckdb.ts: initDuckDB() must resolve before use')
  return db
}

async function getConnection(): Promise<duckdb.AsyncDuckDBConnection> {
  if (!connectionPromise) {
    throw new Error('duckdb.ts: initDuckDB() must resolve before querying')
  }
  return connectionPromise
}

// This is what makes registerFileURL() correctly reject on an unreachable
// URL — load-bearing for scenario-discovery.md's fail-soft behavior.
// db.registerFileURL() (the DuckDB-WASM library call, above) only registers
// a virtual filename -> URL mapping; it does no fetching itself and cannot
// fail on a 404. The actual HTTP request only happens here, when
// `CREATE VIEW ... AS SELECT * FROM read_parquet(...)` needs the file's
// footer to resolve the view's schema — that's the point a bad URL actually
// throws, which registerFileURL()'s own caller relies on to catch and mark
// the scenario 'failed' immediately at discovery time, rather than only
// failing later whenever some other code first queries the view. A future
// change to this function's query shape (e.g. skipping the eager
// read_parquet() call, deferring schema resolution) could silently break
// that eager failure detection with no test catching it until something
// downstream queries the view.
async function createViewOverParquet(viewName: string): Promise<void> {
  const conn = await getConnection()
  await conn.query(
    `CREATE OR REPLACE VIEW "${viewName}" AS SELECT * FROM read_parquet('${viewName}')`,
  )
  allViews.add(viewName)
}

// 004-panel-expand-dialog test instrumentation: records every SQL string
// passed to query(), so Playwright tests can assert a panel's query was
// not re-run (e.g. across an expand/collapse round trip) without racing a
// network delay against an already-cached fixture — DuckDB-WASM's httpfs
// tends to fully cache a small fixture Parquet file's bytes the first
// time any query touches it (schema resolution at view-creation time is
// often enough), so a subsequent SELECT against the same view can resolve
// with no new network request at all, making network-level delay
// unreliable for this specific assertion. Purely additive — every
// existing export's behavior/signature is unchanged (plan.md's Technical
// Context: services/duckdb.ts "consumed, none altered in contract").
const debugQueryLog: string[] = []
export function __debugQueryLog(): readonly string[] {
  return debugQueryLog
}

export async function query(sql: string): Promise<Record<string, unknown>[]> {
  debugQueryLog.push(sql)
  const conn = await getConnection()
  const table = await conn.query(sql)
  return table.toArray().map((row) => row.toJSON() as Record<string, unknown>)
}

/**
 * Returns the raw Arrow table (for callers doing columnar/large-result
 * work, or — 014-graphic-walker-panel — needing the Arrow schema itself,
 * not just row data). Pushes to the same debugQueryLog as query() above
 * (a real, confirmed gap found during 014's implementation: this export
 * has existed since 001 with zero callers until GraphicWalkerPanel.tsx —
 * its own __debugQueryLog()-based test instrumentation silently never
 * covered this path before now, since nothing had called it) — every
 * caller of either function is equally visible to that instrumentation.
 */
export async function queryArrow(sql: string) {
  debugQueryLog.push(sql)
  const conn = await getConnection()
  return conn.query(sql)
}

/**
 * Registers every summary/*.parquet file reachable from a local folder
 * handle (showDirectoryPicker() mode) as a view named `{name}__{fileStem}`.
 * Re-registering the same `name` replaces its prior views cleanly — no
 * leftover view from the earlier registration remains queryable.
 */
export async function registerScenario(
  name: string,
  dirHandle: FileSystemDirectoryHandle,
): Promise<void> {
  await unregisterScenario(name)
  const db = await getDB()
  const summaryDir = await dirHandle.getDirectoryHandle('summary')
  for await (const [fileName, handle] of summaryDir.entries()) {
    if (handle.kind !== 'file' || !fileName.endsWith('.parquet')) continue
    const fileHandle = handle as FileSystemFileHandle
    const file = await fileHandle.getFile()
    const buffer = new Uint8Array(await file.arrayBuffer())
    const stem = fileName.replace(/\.parquet$/, '')
    const viewName = `${name}__${stem}`
    await db.registerFileBuffer(viewName, buffer)
    await createViewOverParquet(viewName)
  }
}

/** Registers a single Parquet/GeoParquet file reachable by URL as a view. */
export async function registerFileURL(viewName: string, url: string): Promise<void> {
  const db = await getDB()
  await db.registerFileURL(viewName, url, duckdb.DuckDBDataProtocol.HTTP, false)
  await createViewOverParquet(viewName)
}

/**
 * Drops every `{name}__*` view. After this resolves, querying any of that
 * scenario's former views fails (view no longer exists).
 */
export async function unregisterScenario(name: string): Promise<void> {
  const prefix = `${name}__`
  const toDrop = Array.from(allViews).filter((v) => v.startsWith(prefix))
  if (toDrop.length === 0) return
  const conn = await getConnection()
  for (const viewName of toDrop) {
    await conn.query(`DROP VIEW IF EXISTS "${viewName}"`)
    allViews.delete(viewName)
  }
}

export async function distinctValues(view: string, column: string): Promise<unknown[]> {
  const rows = await query(
    `SELECT DISTINCT "${column}" AS value FROM "${view}" ORDER BY "${column}"`,
  )
  return rows.map((r) => r.value)
}

/** Every currently registered view name. */
export function listViews(): string[] {
  return Array.from(allViews)
}

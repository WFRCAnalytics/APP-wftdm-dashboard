// DuckDB-WASM service — the sole owner of the shared AsyncDuckDB instance.
//
// No separate duckdb.worker.js exists (constitution Principle II, amended
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

/** @type {duckdb.DuckDBBundles} */
const MANUAL_BUNDLES = {
  mvp: { mainModule: duckdb_wasm_mvp, mainWorker: mvp_worker },
  eh: { mainModule: duckdb_wasm_eh, mainWorker: eh_worker },
}

/** @type {Promise<duckdb.AsyncDuckDB> | null} */
let dbPromise = null

/** @type {Promise<duckdb.AsyncDuckDBConnection> | null} */
let connectionPromise = null

/** @type {Set<string>} every currently registered view name, however registered */
const allViews = new Set()

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
 * (main.js is the only caller), but the contract requires idempotency
 * unconditionally, not just for the caller pattern that happens to exist.
 * @returns {Promise<void>}
 */
export async function initDuckDB() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const bundle = await duckdb.selectBundle(MANUAL_BUNDLES)
      const worker = new Worker(bundle.mainWorker)
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

async function getDB() {
  const db = await dbPromise
  if (!db) throw new Error('duckdb.js: initDuckDB() must resolve before use')
  return db
}

async function getConnection() {
  if (!connectionPromise) {
    throw new Error('duckdb.js: initDuckDB() must resolve before querying')
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
async function createViewOverParquet(viewName) {
  const conn = await getConnection()
  await conn.query(
    `CREATE OR REPLACE VIEW "${viewName}" AS SELECT * FROM read_parquet('${viewName}')`,
  )
  allViews.add(viewName)
}

/**
 * @param {string} sql
 * @returns {Promise<Array<Object>>}
 */
export async function query(sql) {
  const conn = await getConnection()
  const table = await conn.query(sql)
  return table.toArray().map((row) => row.toJSON())
}

/**
 * @param {string} sql
 * @returns {Promise<import('apache-arrow').Table>}
 */
export async function queryArrow(sql) {
  const conn = await getConnection()
  return conn.query(sql)
}

/**
 * Registers every summary/*.parquet file reachable from a local folder
 * handle (showDirectoryPicker() mode) as a view named `{name}__{fileStem}`.
 * Re-registering the same `name` replaces its prior views cleanly — no
 * leftover view from the earlier registration remains queryable.
 * @param {string} name
 * @param {FileSystemDirectoryHandle} dirHandle
 */
export async function registerScenario(name, dirHandle) {
  await unregisterScenario(name)
  const db = await getDB()
  const summaryDir = await dirHandle.getDirectoryHandle('summary')
  for await (const [fileName, handle] of summaryDir.entries()) {
    if (handle.kind !== 'file' || !fileName.endsWith('.parquet')) continue
    const file = await handle.getFile()
    const buffer = new Uint8Array(await file.arrayBuffer())
    const stem = fileName.replace(/\.parquet$/, '')
    const viewName = `${name}__${stem}`
    await db.registerFileBuffer(viewName, buffer)
    await createViewOverParquet(viewName)
  }
}

/**
 * Registers a single Parquet/GeoParquet file reachable by URL as a view.
 * @param {string} viewName
 * @param {string} url
 */
export async function registerFileURL(viewName, url) {
  const db = await getDB()
  await db.registerFileURL(viewName, url, duckdb.DuckDBDataProtocol.HTTP, false)
  await createViewOverParquet(viewName)
}

/**
 * Drops every `{name}__*` view. After this resolves, querying any of that
 * scenario's former views fails (view no longer exists).
 * @param {string} name
 */
export async function unregisterScenario(name) {
  const prefix = `${name}__`
  const toDrop = Array.from(allViews).filter((v) => v.startsWith(prefix))
  if (toDrop.length === 0) return
  const conn = await getConnection()
  for (const viewName of toDrop) {
    await conn.query(`DROP VIEW IF EXISTS "${viewName}"`)
    allViews.delete(viewName)
  }
}

/**
 * @param {string} view
 * @param {string} column
 * @returns {Promise<Array>}
 */
export async function distinctValues(view, column) {
  const rows = await query(
    `SELECT DISTINCT "${column}" AS value FROM "${view}" ORDER BY "${column}"`,
  )
  return rows.map((r) => r.value)
}

/** @returns {Array<string>} every currently registered view name */
export function listViews() {
  return Array.from(allViews)
}

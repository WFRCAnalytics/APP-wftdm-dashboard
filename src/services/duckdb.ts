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
      // registerFileURL() otherwise ALWAYS downloads a registered Parquet
      // file in full, on first read, regardless of query selectivity or
      // file size — confirmed empirically (056's own follow-up
      // investigation, not assumed): a real, direct browser network
      // capture against this app's own registerFileURL() showed a
      // selective query against a real 24MB synthetic Parquet file over
      // HTTP still triggered exactly one plain GET, no Range header,
      // reading all 24MB. DuckDB-WASM's own HTTP range-request detection
      // (`runtime_browser.ts`'s openFile(), confirmed via its own source
      // map) is real but gated behind this exact `DuckDBFilesystemConfig`,
      // which this app never set before now. With it, the SAME 24MB file
      // + selective query instead issued 8 genuine range-scoped GETs
      // (~1.4MB total, ~94% less) — confirmed via the identical direct
      // capture technique. `allowFullHTTPReads: true` was tried and
      // REJECTED: confirmed, via a same-session clean A/B against the
      // identical capable server/file/query, that it does not merely add
      // a rare-case safety net — it disables range reads UNCONDITIONALLY,
      // even on a fully range-capable server, making it a no-op relative
      // to this app's prior (always-full-download) behavior. Cost at this
      // app's own real file scale (500B–90KB demo files) is real but
      // negligible — measured directly across 3 repeated runs of a
      // realistic 39-file batch under ~35ms simulated per-request
      // latency: 3844ms before vs 3816–3828ms after (noise, not a
      // regression) — dominated by this app's own per-file
      // `CREATE VIEW ... AS SELECT * FROM read_parquet(...)` schema-
      // resolution cost, not the extra HEAD probe.
      //
      // The real, confirmed trade-off `allowFullHTTPReads: false` accepts:
      // a server that genuinely cannot do HTTP range requests at all
      // throws a raw, unhelpful DuckDB error at query time
      // (`Failed to open file: <name>`, mentioning neither "range" nor
      // "HTTP" — confirmed live against a deliberately range-incapable
      // test server) instead of silently falling back. registerFileURL()
      // below catches exactly this failure and retries via a manual full
      // fetch()+registerFileBuffer() — real range reads as the default,
      // graceful (and clearly logged) degradation as the exception,
      // rather than accepting `allowFullHTTPReads: true`'s always-full
      // no-op. This app's own real HTTP-serving targets — vite dev/
      // preview and the built dist/docs output (GitHub Pages) — were all
      // directly `curl`-confirmed range-capable, so the fallback path is
      // not expected to be live in this app's own real deployments today.
      // query.castBigIntToDouble: true — the real, root-cause fix for a
      // bug independently found and ad hoc patched THREE times before
      // this: ZoneMapPanel.tsx's choropleth-value join
      // (031-all-panel-demo-content), GraphicWalkerPanel.tsx's whole-row
      // conversion (found live on the Explore tab, same root cause), and
      // a Recharts y-value silently rendering zero geometry
      // (040-test-suite-migration's rechartsPanel.spec.ts Batch B,
      // avoided by data-source substitution rather than patched). Every
      // DuckDB BIGINT column (any COUNT(*)-derived aggregate) arrives
      // over Arrow as a genuine JS `bigint` primitive, not `number` —
      // confirmed, via @duckdb/duckdb-wasm's own installed
      // DuckDBQueryConfig type and its own test suite
      // (packages/duckdb-wasm/test/bindings.test.ts), that this option
      // casts BIGINT to DOUBLE inside the query engine itself, before
      // Arrow ever serializes the result — so both query() and
      // queryArrow() receive real numbers uniformly, with no
      // per-consumer conversion needed. `gropaul/dash-ui` (the real UI
      // source already investigated elsewhere in this project, see
      // PIPELINE.md's "DuckDB 'Dash' extension" entry) confirms this is
      // a real, working pattern already in production use elsewhere,
      // not a hypothetical: its own duckdb-wasm-provider.ts sets this
      // (and the sibling cast options below) unconditionally on every
      // connection it opens. castTimestampToDate/castDurationToTime64/
      // castDecimalToDouble are deliberately NOT set here — this fix is
      // scoped to the one confirmed, three-times-independently-found
      // bigint problem; no timestamp/duration/decimal-typed column has
      // ever surfaced an equivalent issue in this app.
      await db.open({
        filesystem: { allowFullHTTPReads: false, reliableHeadRequests: true, forceFullHTTPReads: false },
        query: { castBigIntToDouble: true },
      })
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

// The exact, confirmed error text initDuckDB()'s own `allowFullHTTPReads:
// false` config produces when a file can't be opened via DuckDB-WASM's own
// HTTP range-detection path — reproduced live against a deliberately
// range-incapable test server. Confirmed (also live, same session) that a
// genuinely missing/404 file produces this SAME signature — this string
// alone doesn't distinguish "range unsupported" from "doesn't exist", which
// is why registerFileURLViaFullFetch() below re-derives the real answer via
// its own fetch() rather than trusting the match alone; the match's only
// job is deciding whether a fallback attempt is worth making at all.
function isRangeDetectionFailure(err: unknown, viewName: string): boolean {
  return err instanceof Error && err.message.includes(`Failed to open file: ${viewName}`)
}

// Manual fallback for a server DuckDB-WASM's own HTTP range-request
// detection can't read from at all (see initDuckDB()'s own db.open() call
// for the full story on why allowFullHTTPReads stays false rather than
// relying on DuckDB-WASM's own built-in fallback, which was confirmed to
// disable range reads unconditionally, not just as a rare-case safety net).
// A plain fetch() neither knows nor cares about server-side Range support —
// it's the same request path a real deployer's own <img>/<a> tag would use.
// A non-ok response (genuine 404, network failure, ...) rethrows a new
// error rather than silently swallowing it — registerFileURL()'s own
// callers (scenarioDiscovery.ts's fail-soft registration) still need a real
// missing/unreachable file to throw, exactly as before this fallback
// existed.
async function registerFileURLViaFullFetch(
  db: duckdb.AsyncDuckDB,
  viewName: string,
  url: string,
): Promise<void> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `registerFileURL: '${viewName}' failed HTTP range-request detection, and the fallback full fetch also failed (${response.status} ${response.statusText})`,
    )
  }
  const buffer = new Uint8Array(await response.arrayBuffer())
  // registerFileBuffer() TRANSFERS (does not copy) the underlying
  // ArrayBuffer to the worker (already documented, elsewhere in this
  // codebase, for registerBufferOnSharedInstance()'s identical case) — read
  // byteLength BEFORE the call, not after, or it reads 0 (confirmed live:
  // an earlier version of this exact line logged "(0 bytes)" every time).
  const byteLength = buffer.byteLength
  await db.dropFile(viewName)
  await db.registerFileBuffer(viewName, buffer)
  await createViewOverParquet(viewName)
  console.warn(
    `registerFileURL: '${viewName}' does not support HTTP range requests — fell back to a full download (${byteLength} bytes)`,
  )
}

// Concurrency limiter for the whole registerFileURL() operation below — a
// real, confirmed DuckDB-WASM limitation found investigating live reports
// of "Couldn't load this table" on tabs with many metrics (Tour/Mode
// Choice/Trip). Root cause, confirmed directly against the real deployed
// site (not assumed): GitHub Pages' Fastly CDN corrupts Range reads
// whenever gzip is negotiated (every real browser always does), so EVERY
// registerFileURL() call on the live site falls through to
// registerFileURLViaFullFetch()'s slower path below — an extra
// db.dropFile() + db.registerFileBuffer() + second CREATE VIEW round trip
// against the one shared connection/worker (see project-docs/PIPELINE.md's
// "GH Pages/Fastly corrupts HTTP Range requests" entry for the full CDN
// finding). services/tabDataLoader.ts's own tab-wide batch registers every
// metric a tab references via unbounded Promise.allSettled — firing dozens
// of these heavier operations at once (a large tab like Tour needs ~39)
// overwhelms the connection/worker: measured live, repeatedly, against the
// real deployed site — concurrency 4 already corrupts 11-37 of every 60
// calls, and once a call fails this way IT CANNOT BE RECOVERED by retrying
// (confirmed directly: retrying the same view name, a brand-new
// never-used view name, and a retry after a 5s drain all fail identically
// — the underlying connection/worker itself is left in a bad state, not
// just that one file). Concurrency 2-3 was confirmed failure-free across
// repeated live trials (0/60, twice) — MAX_CONCURRENT_FILE_REGISTRATIONS
// stays well under the observed cliff at 4. Never reached locally or on a
// real range-capable server, where the fast direct-range path is used
// throughout and this limiter is never a bottleneck.
const MAX_CONCURRENT_FILE_REGISTRATIONS = 3
let activeFileRegistrations = 0
const fileRegistrationQueue: (() => void)[] = []

function acquireRegistrationSlot(): Promise<void> {
  if (activeFileRegistrations < MAX_CONCURRENT_FILE_REGISTRATIONS) {
    activeFileRegistrations++
    return Promise.resolve()
  }
  return new Promise((resolve) => fileRegistrationQueue.push(resolve))
}

// Hands the freed slot directly to the next queued waiter (the count of
// concurrently-active registrations never changes in that case — one
// finished, one started) rather than decrementing and letting every
// waiter race acquireRegistrationSlot() again.
function releaseRegistrationSlot(): void {
  const next = fileRegistrationQueue.shift()
  if (next) {
    next()
  } else {
    activeFileRegistrations--
  }
}

/** Registers a single Parquet/GeoParquet file reachable by URL as a view. */
export async function registerFileURL(viewName: string, url: string): Promise<void> {
  const db = await getDB()
  await acquireRegistrationSlot()
  try {
    await db.registerFileURL(viewName, url, duckdb.DuckDBDataProtocol.HTTP, false)
    try {
      await createViewOverParquet(viewName)
    } catch (err) {
      if (!isRangeDetectionFailure(err, viewName)) throw err
      await registerFileURLViaFullFetch(db, viewName, url)
    }
  } finally {
    releaseRegistrationSlot()
  }
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

/**
 * O(1) existence check for a single view name — services/tabDataLoader.ts
 * uses this to recognize a view a DIFFERENT registration path already
 * created (scenario/scenarioManager.ts#registerScenario() eagerly
 * registers every file for a locally-loaded folder scenario in one pass,
 * outside tabDataLoader's own lazy per-pair tracking) before ever calling
 * registerFileURL() for it again — a real, confirmed bug this existence
 * check fixes: registerFileURL() throws "File already registered" for a
 * genuinely already-registered view, which tabDataLoader.ts previously had
 * no way to distinguish from a real registration failure.
 */
export function hasView(viewName: string): boolean {
  return allViews.has(viewName)
}

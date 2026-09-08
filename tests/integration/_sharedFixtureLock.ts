import { closeSync, openSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 030-sidebar-navigation — real, confirmed fix for a genuine race condition
// found during full-suite regression testing (not merely anticipated): a
// live `npx playwright test` run (no `--workers` override; this project's
// own `npm run test:integration` script doesn't set one either) reported
// "Running 291 tests using 10 workers" — real, confirmed cross-SPEC-FILE
// parallelism. `playwright.config.js`'s `fullyParallel: false` only
// serializes tests WITHIN one file; it does nothing to stop different spec
// FILES from running concurrently in different worker processes.
//
// sidebarNav.spec.ts and fullPagePanel.spec.ts both temporarily rewrite the
// SHARED `public/dashboard-config/index.json` (the same live path
// dashboardShell.spec.ts and many other specs read from) in their own
// file-scoped beforeAll/afterAll. 031-all-panel-demo-content's
// demoContentAllPanels.spec.ts does the equivalent for the sibling
// `public/demo-dashboard-config/index.json` — a different file, but one
// whose tabs render into the SAME combined tablist (main.ts concatenates
// both roots), so it's an equally real collision risk for anything that
// asserts on the full tab set. A live, reproduced full-suite run confirmed
// this concretely: dashboardShell.spec.ts's exact-3-tab assertion observed
// sidebarNav.spec.ts's own injected "Explore Fixture" tab AND
// demoContentAllPanels.spec.ts's real demo tabs all at once, and
// demoContentAllPanels.spec.ts's own `getByRole('tab', {name:'Explore'})`
// (non-exact — Playwright's accessible-name matching without `exact: true`
// matches by substring) resolved to BOTH "Explore Fixture" and "Explore"
// simultaneously for the same reason.
//
// Fixed with a real, cross-WORKER-PROCESS mutual-exclusion lock — a lock
// FILE, not an in-process mutex/boolean, since different spec files here
// can run in genuinely different OS processes with no shared memory.
// `openSync(path, 'wx')` is an atomic exclusive-create at the OS level
// (fails with EEXIST if another worker already holds it), avoiding the
// check-then-write race a plain `existsSync` + `writeFileSync` pair would
// have. Every spec file that reads OR mutates
// public/dashboard-config/index.json or public/demo-dashboard-config/
// index.json in a way that could be observed mid-mutation by another spec
// must acquire this ONE shared lock (both shared paths render into the
// same tablist, so one lock covers both) before doing so, and release it
// when done — see sidebarNav.spec.ts, fullPagePanel.spec.ts,
// demoContentAllPanels.spec.ts, and dashboardShell.spec.ts's own call
// sites.
const LOCK_PATH = path.resolve(__dirname, '../../.tmp-shared-fixture-index.lock')
const POLL_MS = 100
// demoContentAllPanels.spec.ts is this suite's own slowest file (~5+
// minutes) and holds the lock for its entire run — a generous ceiling
// avoids a false timeout under legitimate, expected contention; it exists
// only to catch a genuinely stuck/crashed lock holder, not real usage.
const MAX_WAIT_MS = 600_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Acquire the shared-fixture-index lock, waiting for any other spec file
 * (in any worker, any process) currently holding it. Call this BEFORE
 * reading or mutating public/dashboard-config/index.json or
 * public/demo-dashboard-config/index.json in a way another spec could
 * observe mid-mutation.
 */
export async function acquireSharedFixtureLock(): Promise<void> {
  const start = Date.now()
  for (;;) {
    try {
      const fd = openSync(LOCK_PATH, 'wx')
      closeSync(fd)
      return
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'EEXIST') throw err
      if (Date.now() - start > MAX_WAIT_MS) {
        throw new Error(
          `acquireSharedFixtureLock: timed out after ${MAX_WAIT_MS}ms waiting for ${LOCK_PATH} — ` +
            'a previous run may have crashed without releasing it; delete the file manually if so.',
        )
      }
      await sleep(POLL_MS)
    }
  }
}

/**
 * Release the shared-fixture-index lock. Always call this in a `finally`/
 * `afterAll` so a failing test still releases it — a stuck lock would hang
 * every other participant for the full MAX_WAIT_MS above.
 */
export function releaseSharedFixtureLock(): void {
  try {
    rmSync(LOCK_PATH, { force: true })
  } catch {
    // Best-effort — a missing lock file here is not an error.
  }
}

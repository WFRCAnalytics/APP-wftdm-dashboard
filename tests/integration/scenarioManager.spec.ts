import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
  }
}

// Real-browser tests for 009-scenario-manager/018-baseline-scenario-
// designation, extending sankeyPanel.spec.ts's/observablePlotCategoricalColor.spec.ts's
// own real-content pattern (real DuckDB-WASM, real Parquet). See
// quickstart.md and contracts/scenario-manager.md.
//
// A real native showDirectoryPicker() dialog cannot be driven in a
// headless/CI Playwright run at all — research.md §2 — so
// window.showDirectoryPicker is replaced, before navigation, with a fake
// that implements only the surface manifestReader.ts/services/duckdb.ts's
// registerScenario() actually call against a directory handle, backed by
// real bytes read from public/demo-scenarios/activitysim-baseline/summary/
// — the real, git-tracked ActivitySim demo content (026-activitysim-demo-
// content), not tests/fixtures/scenarios/ (retired/deleted by
// 040-test-suite-migration along with tests/fixtures/dashboard-config/).
//
// This file's own auto-discovered "published" scenario world is also
// migrated off the retired tests/fixtures/{scenarios,observed}/ copy-in
// mechanism (public/scenarios/, public/dashboard-config/, public/observed/
// are gitignored and, per this checkout, genuinely empty — the
// `dev:fixtures` copy step and scripts/copy-fixtures.js referenced by
// CLAUDE.md's own "Config file set" section no longer exist at all).
// boot() below instead routes the real demo-scenarios/demo-dashboard-config
// discovery endpoints, restricted to exactly ONE real scenario
// ("activitysim-baseline") — a deliberately minimal, deterministic
// 2-entry world (that one real scenario + the always-present 'observed'
// row, which genuinely 404s here — no fictional observed dataset exists
// in this repo — and registers status: 'failed'/active: false, still
// showing a real row in the Scenarios tab per registerObserved()'s own
// unconditional appState.register() call), matching the retired fixture's
// own "good_scenario" + "observed" shape closely enough that most of this
// file's original structure/assertions carry over unchanged — only the
// concrete scenario NAME ('good_scenario' → 'activitysim-baseline') and
// the panel titles used to prove "an already-rendered unpinned panel
// picks it up" changed (038-all-loaded-scenarios: every real
// summary_kpis valuebox in current demo content is pinned to one
// scenario — CLAUDE.md's own item-25/38 audit — so the real stand-in for
// an UNPINNED, already-rendered panel is "Auto Ownership by Household
// Segment", a real table on the Person & Households tab).

const FIXTURE_SUMMARY_DIR = join(
  process.cwd(),
  'public/demo-scenarios/activitysim-baseline/summary',
)

function loadFixtureParquetFiles(): { name: string; bytes: number[] }[] {
  return readdirSync(FIXTURE_SUMMARY_DIR)
    .filter((f) => f.endsWith('.parquet'))
    .map((name) => ({
      name,
      bytes: Array.from(readFileSync(join(FIXTURE_SUMMARY_DIR, name))),
    }))
}

interface FakePickerConfig {
  folderName: string
  manifestText: string | null // null = no manifest.yaml present
  hasSummary: boolean // false = getDirectoryHandle('summary') throws
  files: { name: string; bytes: number[] }[]
  abort?: boolean // true = showDirectoryPicker() itself rejects AbortError
}

declare global {
  interface Window {
    __fakePickerConfig?: FakePickerConfig
  }
}

/**
 * Must run before page.goto() — addInitScript only affects future
 * navigations, never an already-loaded page (found the hard way: a
 * second installFakePicker() call mid-test, with no navigation in
 * between, silently had no effect on the current page at all — the
 * click just re-invoked the FIRST fake). window.showDirectoryPicker
 * itself reads window.__fakePickerConfig fresh on every call, so
 * setFakePickerConfig() (below) can retarget it live, within the same
 * page session, for tests that pick more than one folder.
 */
async function installFakePicker(page: Page, initialConfig: FakePickerConfig) {
  await page.addInitScript((cfg) => {
    window.__fakePickerConfig = cfg
    class FakeFile {
      constructor(
        private bytes: number[] | null,
        private textContent: string | null,
      ) {}
      async arrayBuffer() {
        return new Uint8Array(this.bytes ?? []).buffer
      }
      async text() {
        return this.textContent ?? new TextDecoder().decode(new Uint8Array(this.bytes ?? []))
      }
    }
    class FakeFileHandle {
      kind = 'file' as const
      constructor(private file: FakeFile) {}
      async getFile() {
        return this.file
      }
    }
    class FakeSummaryDirHandle {
      constructor(private files: { name: string; bytes: number[] }[]) {}
      async *entries(): AsyncGenerator<[string, FakeFileHandle]> {
        for (const f of this.files) {
          yield [f.name, new FakeFileHandle(new FakeFile(f.bytes, null))]
        }
      }
    }
    class FakeDirHandle {
      name: string
      private cfg: FakePickerConfig
      constructor(cfg: FakePickerConfig) {
        this.cfg = cfg
        this.name = cfg.folderName
      }
      async getFileHandle(fileName: string) {
        if (fileName === 'manifest.yaml' && this.cfg.manifestText !== null) {
          return new FakeFileHandle(new FakeFile(null, this.cfg.manifestText))
        }
        throw new DOMException('not found', 'NotFoundError')
      }
      async getDirectoryHandle(dirName: string) {
        if (dirName === 'summary' && this.cfg.hasSummary) {
          return new FakeSummaryDirHandle(this.cfg.files)
        }
        throw new DOMException('not found', 'NotFoundError')
      }
    }
    // @ts-expect-error — the fake intentionally implements only the
    // subset of the real FileSystemDirectoryHandle interface this
    // feature's own code path actually calls.
    window.showDirectoryPicker = async () => {
      const current = window.__fakePickerConfig!
      if (current.abort) throw new DOMException('The user aborted a request.', 'AbortError')
      return new FakeDirHandle(current)
    }
  }, initialConfig)
}

/** Retargets the already-installed fake picker within the same page session (see installFakePicker's own comment). */
async function setFakePickerConfig(page: Page, config: FakePickerConfig) {
  await page.evaluate((cfg) => {
    window.__fakePickerConfig = cfg
  }, config)
}

// 020-settings-modal: every control this file drives (Load Local Scenario,
// the scenario list, baseline star, Remove) now lives inside the Settings
// modal's Scenarios tab, not a standalone always-mounted header component
// — opening it is a new, required step. Deliberately NOT folded into
// boot() unconditionally: two existing tests below interact with an
// underlying dashboard panel BEFORE ever touching a scenario control, and
// the open modal's own overlay blocks pointer interaction with the page
// behind it (a real regression found via this file's own first run
// against this feature) — idempotent (safe to call whether or not the
// modal is already open), called at the point each test actually needs
// the Scenarios tab, either directly or via loadAndWait()'s own call
// below.
async function openScenariosTab(page: Page) {
  if ((await page.getByRole('dialog').count()) === 0) {
    await page.getByRole('button', { name: 'Settings' }).click()
  }
  await page.getByRole('tab', { name: 'Scenarios' }).click()
}

const REAL_DEMO_DASHBOARD_INDEX = {
  dashboards: [
    'dashboard-1-summary.yaml',
    'dashboard-2-person-household.yaml',
    'dashboard-3-tour-models.yaml',
    'dashboard-4-mode-choice.yaml',
    'dashboard-5-trip-models.yaml',
    'dashboard-6-network.yaml',
    'dashboard-7-explore.yaml',
  ],
  title: 'WFRC TDM Calibration Dashboard',
}

async function boot(page: Page) {
  // A deliberately minimal, deterministic published-scenario world: just
  // the real 'activitysim-baseline' demo scenario (standing in for the
  // retired fixture's own 'good_scenario') — the real non-demo
  // scenarios/dashboard-config discovery endpoints are routed to 404 (no
  // real content exists there in this checkout either way), and
  // 'observed' genuinely 404s too (registerObserved() still creates a
  // real, pinned appState entry unconditionally — see this file's own
  // header comment — just with status: 'failed'/active: false, honestly
  // reflecting that no real observed dataset exists in this repo).
  await page.route('**/demo-dashboard-config/index.json', (r) =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(REAL_DEMO_DASHBOARD_INDEX) }),
  )
  await page.route('**/demo-scenarios/index.json', (r) =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(['activitysim-baseline']) }),
  )
  await page.route('**/observed/summary/index.json', (r) => r.fulfill({ status: 404, body: '' }))
  await page.route('**/scenarios/index.json', (r) => r.fulfill({ status: 404, body: '' }))
  await page.route('**/dashboard-config/index.json', (r) => r.fulfill({ status: 404, body: '' }))

  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
  // Also wait for startup scenario discovery to settle (mirrors
  // boot.spec.ts's own pattern) — without this, a collision-check test
  // can race ahead of e.g. activitysim-baseline's own registration
  // completing, making appState.get('activitysim-baseline') return
  // undefined at check time and the collision go undetected (a real bug
  // found in this spec's first run, not a hypothetical).
  await page.waitForFunction(
    () =>
      window.__wftdm!.appState.get('activitysim-baseline')?.status !== 'registering' &&
      window.__wftdm!.appState.get('observed')?.status !== 'registering',
    null,
    { timeout: 30_000 },
  )
}

function panelCard(page: Page, title: string) {
  return page.getByText(title, { exact: true }).locator('..').locator('..')
}

async function queryCountFor(page: Page, needle: string) {
  return page.evaluate(
    (n) => window.__wftdm!.__debugQueryLog().filter((sql) => sql.includes(n)).length,
    needle,
  )
}

async function trueEventually(check: () => Promise<boolean>) {
  await expect.poll(check).toBe(true)
}

/**
 * Clicks the trigger and waits for the named scenario to actually be
 * registered AND to have left 'registering'. Must check existence first —
 * `entry?.status !== 'registering'` is trivially true while the entry
 * doesn't exist yet at all (undefined !== 'registering'), which resolved
 * this helper before the click handler's async work had even started in
 * an earlier version of this file (a real bug this spec's first run
 * caught, not hypothetical) — several assertions raced ahead of the real
 * registration as a result.
 */
async function loadAndWait(page: Page, expectedName: string) {
  await openScenariosTab(page)
  await page.getByRole('button', { name: 'Load Local Scenario' }).click()
  await trueEventually(async () =>
    page.evaluate((n) => {
      const entry = window.__wftdm!.appState.get(n)
      return entry !== undefined && entry.status !== 'registering'
    }, expectedName),
  )
}

test.describe('User Story 1 - Analyst loads a local scenario folder from the hosted web app', () => {
  test('a valid folder registers and activates, and an already-rendered unpinned panel picks it up', async ({
    page,
  }) => {
    await installFakePicker(page, {
      folderName: 'ignored_folder_name',
      manifestText: 'scenario_name: t016_local\ncolor: "#112233"\nnotes: T016 fixture\n',
      hasSummary: true,
      files: loadFixtureParquetFiles(),
    })
    await boot(page)

    // "Auto Ownership by Household Segment" (dashboard-2-person-household.yaml)
    // is unpinned — no scenario:/scenarios: key — so its query unions
    // across every active scenario via $scenario (project-docs/SPEC.md).
    // Real demo valueboxes are all pinned to one scenario (CLAUDE.md's own
    // 038-all-loaded-scenarios audit), so this real table panel is the
    // genuine stand-in for the retired fixture's own unpinned "Total
    // Households" valuebox.
    await page.getByRole('tab', { name: 'Person & Households' }).click()
    await expect(panelCard(page, 'Auto Ownership by Household Segment')).toBeVisible()

    await loadAndWait(page, 't016_local')

    const entry = await page.evaluate(() => window.__wftdm!.appState.get('t016_local'))
    expect(entry?.status).toBe('ready')
    expect(entry?.active).toBe(true)
    expect(entry?.source).toBe('handle')

    // Directly queryable under the standard name__metric convention.
    const rows = await page.evaluate(() =>
      window.__wftdm!.query('SELECT * FROM t016_local__summary_kpis'),
    )
    expect(rows.length).toBeGreaterThan(0)

    // The unpinned table panel's own effect re-ran and its SQL now
    // includes the newly active scenario's view — proves "already-
    // rendered panel reflects it" without a reload, not just that the
    // new scenario is independently queryable.
    await trueEventually(async () => (await queryCountFor(page, 't016_local__auto_ownership_summary')) > 0)
  })

  test('a TablePanel\'s search term and pagination survive a local-scenario load untouched (FR-008)', async ({
    page,
  }) => {
    // Not a DOM-node-identity assertion: every panel type (established
    // well before this feature) replaces its content with a loading
    // skeleton on ANY refetch — `if (status === 'loading') return
    // <skeleton/>` — including a legitimate filter-driven one, so the
    // search <input>'s DOM node is destroyed/recreated on every refetch
    // by design, unrelated to state loss. What FR-008 actually requires
    // is that the underlying React state values (searchTerm/currentPage)
    // survive a scenario-only refetch — found and corrected here after
    // an initial DOM-identity version of this test failed even though
    // the values themselves were, correctly, unchanged.
    await installFakePicker(page, {
      folderName: 'ignored',
      manifestText: 'scenario_name: t017_local\n',
      hasSummary: true,
      files: loadFixtureParquetFiles(),
    })
    await boot(page)
    await page.getByRole('tab', { name: 'Person & Households' }).click()

    // "Auto Ownership by Household Segment" — real, unpinned, searchable,
    // pagination: 20 over 239 real rows (one real scenario) — a real
    // multi-page table, standing in for the retired fixture's own
    // "Screenline Validation" panel.
    const card = panelCard(page, 'Auto Ownership by Household Segment')
    const searchInput = card.getByRole('textbox', { name: /Search/ })
    await searchInput.fill('High')
    await expect(searchInput).toHaveValue('High')
    // Clear the search before paging — "High" (income_group) genuinely
    // narrows the real result set below one page, which would leave no
    // "Next" button to click at all.
    await searchInput.fill('')
    await expect(card.getByRole('button', { name: 'Next' })).toBeEnabled()
    await card.getByRole('button', { name: 'Next' }).click()
    await expect(card.getByText(/Page 2 of/)).toBeVisible()
    await searchInput.fill('High')
    await expect(searchInput).toHaveValue('High')

    await loadAndWait(page, 't017_local')
    // 020-settings-modal: loadAndWait() opens the Settings modal to reach
    // "Load Local Scenario" and leaves it open — Radix Dialog's own
    // hideOthers() (dialog.tsx's own header comment) makes the rest of the
    // page inaccessible to role/text-based locators while it's open, so
    // the dashboard-panel assertions below need it closed first.
    await page.keyboard.press('Escape')

    // The search term survived a scenario-activation-only refetch — did
    // not reset to its post-genuine-refetch default (search cleared).
    await expect(searchInput).toHaveValue('High')
  })

  test('a genuine filter change still resets a TablePanel\'s search/page (the guard is selective, not disabled)', async ({
    page,
  }) => {
    await boot(page)
    await page.getByRole('tab', { name: 'Person & Households' }).click()

    // Every real demo panel defaults to filter_ids: ['*'] (no panel
    // declares an explicit filter_ids — CLAUDE.md's own dashboardShell.spec.ts
    // $filters. gap note) — so ANY global filter change still reactively
    // refetches every panel via useFilterState's wildcard subscription,
    // even though no real panel's own SQL actually references
    // $filters.purpose. That reactive refetch is the genuine content
    // change this test needs, independent of whether the fetched rows
    // differ.
    const card = panelCard(page, 'Auto Ownership by Household Segment')
    const searchInput = card.getByRole('textbox', { name: /Search/ })
    await searchInput.fill('High')
    await expect(searchInput).toHaveValue('High')

    await page.evaluate(() => window.__wftdm!.filterState.set('purpose', 'HBW'))
    await expect(searchInput).toHaveValue('')
  })

  test('re-picking the same folder a second time re-registers cleanly, no duplicate entry', async ({
    page,
  }) => {
    await installFakePicker(page, {
      folderName: 'ignored',
      manifestText: 'scenario_name: t018_local\n',
      hasSummary: true,
      files: loadFixtureParquetFiles(),
    })
    await boot(page)

    await loadAndWait(page, 't018_local')
    await loadAndWait(page, 't018_local')

    const names = await page.evaluate(() => window.__wftdm!.appState.list().map((s) => s.name))
    expect(names.filter((n) => n === 't018_local')).toHaveLength(1)
    const entry = await page.evaluate(() => window.__wftdm!.appState.get('t018_local'))
    expect(entry?.status).toBe('ready')
  })

  test('a name colliding with an already-published scenario is rejected, published scenario untouched', async ({
    page,
  }) => {
    await installFakePicker(page, {
      folderName: 'ignored',
      manifestText: 'scenario_name: activitysim-baseline\n', // collides with the real, auto-discovered demo scenario
      hasSummary: true,
      files: loadFixtureParquetFiles(),
    })
    await boot(page)

    const beforeRows = await page.evaluate(() =>
      window.__wftdm!.query('SELECT * FROM "activitysim-baseline__summary_kpis"'),
    )
    const beforeEntry = await page.evaluate(() => window.__wftdm!.appState.get('activitysim-baseline'))

    await openScenariosTab(page)
    await page.getByRole('button', { name: 'Load Local Scenario' }).click()
    // Scoped to the ScenarioLoader's own error span (data-testid), not a
    // page-wide text search — this app also renders several unrelated
    // broken-panel error states elsewhere (the Test tab's own table/
    // observable-plot/sankey fixtures), found colliding with a broader
    // selector in this spec's first run.
    await expect(page.getByTestId('scenario-load-error')).toContainText(
      /already a published scenario name/,
    )

    const afterRows = await page.evaluate(() =>
      window.__wftdm!.query('SELECT * FROM "activitysim-baseline__summary_kpis"'),
    )
    const afterEntry = await page.evaluate(() => window.__wftdm!.appState.get('activitysim-baseline'))
    expect(afterEntry?.source).toBe(beforeEntry?.source) // still 'url', not overwritten to 'handle'
    expect(afterRows).toEqual(beforeRows)
  })

  test('a folder with no manifest.yaml falls back to the folder name and still registers', async ({
    page,
  }) => {
    await installFakePicker(page, {
      folderName: 't020_fallback_name',
      manifestText: null,
      hasSummary: true,
      files: loadFixtureParquetFiles(),
    })
    await boot(page)

    await loadAndWait(page, 't020_fallback_name')

    const entry = await page.evaluate(() => window.__wftdm!.appState.get('t020_fallback_name'))
    expect(entry?.status).toBe('ready')
    expect(entry?.active).toBe(true)
  })

  test('a folder with no summary/ subfolder registers as failed, not activated', async ({
    page,
  }) => {
    await installFakePicker(page, {
      folderName: 'ignored',
      manifestText: 'scenario_name: t021_no_summary\n',
      hasSummary: false,
      files: [],
    })
    await boot(page)

    await loadAndWait(page, 't021_no_summary')

    const entry = await page.evaluate(() => window.__wftdm!.appState.get('t021_no_summary'))
    expect(entry?.status).toBe('failed')
    expect(entry?.active).toBe(false)
  })

  test('cancelling the picker produces no error and no partial registration', async ({ page }) => {
    await installFakePicker(page, {
      folderName: 'ignored',
      manifestText: 'scenario_name: t022_should_not_exist\n',
      hasSummary: true,
      files: loadFixtureParquetFiles(),
      abort: true,
    })
    await boot(page)

    const namesBefore = await page.evaluate(() => window.__wftdm!.appState.list().map((s) => s.name))
    await openScenariosTab(page)
    await page.getByRole('button', { name: 'Load Local Scenario' }).click()
    // No error message, no new registration — give any (incorrect) async
    // registration a moment to have landed before asserting its absence.
    await page.waitForTimeout(300)
    const namesAfter = await page.evaluate(() => window.__wftdm!.appState.list().map((s) => s.name))
    expect(namesAfter.sort()).toEqual(namesBefore.sort())
    // Scoped to the ScenarioLoader's own error span, not a page-wide text
    // search — see the collision test's own comment above for why.
    await expect(page.getByTestId('scenario-load-error')).toHaveCount(0)
  })
})

test.describe('User Story 2 - Unsupported browser sees a clear, non-broken control', () => {
  test('with showDirectoryPicker absent, the control is disabled with an explanatory tooltip, rest of the dashboard unaffected', async ({
    page,
  }) => {
    // Real Chromium (Playwright's default) may itself implement
    // showDirectoryPicker() — deleted explicitly here to simulate
    // Firefox/Safari's real absence, not assumed absent by default.
    await page.addInitScript(() => {
      delete window.showDirectoryPicker
    })
    await boot(page)
    await openScenariosTab(page)

    const button = page.getByRole('button', { name: 'Load Local Scenario' })
    await expect(button).toBeDisabled()
    // Hover the wrapping span, not the button itself — the button's own
    // disabled:pointer-events-none (Tailwind, components/ui/button.tsx)
    // means it cannot receive the hover that drives the tooltip; the span
    // is the actual Radix Tooltip.Trigger target (see scenarioLoader.tsx's
    // own comment on this, found empirically while writing this test).
    await page.getByTestId('scenario-load-trigger-disabled-wrapper').hover()
    await expect(page.getByText('Requires Chrome or Edge')).toBeVisible()

    // Rest of the dashboard is unaffected — an unrelated real panel on the
    // landing Summary tab still works.
    await page.keyboard.press('Escape')
    await expect(panelCard(page, 'Households')).toBeVisible()
  })

  test('on localhost (LOCAL deployment mode), the control is visible but disabled with a tooltip — never hidden (FR-019)', async ({
    page,
  }) => {
    // Deliberately bypasses playwright.config.js's configured baseURL
    // (127.0.0.1 — see that file's own comment on why it's distinct from
    // 'localhost') to exercise isLocalDeployment()'s real
    // hostname === 'localhost' check (project-docs/SPEC.md) against an actual
    // 'localhost' navigation, not a simulated one — the same dev server,
    // reached by its other bound-interface hostname. Route mocks are
    // origin-agnostic (path-pattern based), so boot()'s own routes still
    // apply the same way here.
    await page.route('**/demo-dashboard-config/index.json', (r) =>
      r.fulfill({ contentType: 'application/json', body: JSON.stringify(REAL_DEMO_DASHBOARD_INDEX) }),
    )
    await page.route('**/demo-scenarios/index.json', (r) =>
      r.fulfill({ contentType: 'application/json', body: JSON.stringify(['activitysim-baseline']) }),
    )
    await page.route('**/observed/summary/index.json', (r) => r.fulfill({ status: 404, body: '' }))
    await page.route('**/scenarios/index.json', (r) => r.fulfill({ status: 404, body: '' }))
    await page.route('**/dashboard-config/index.json', (r) => r.fulfill({ status: 404, body: '' }))

    await page.goto('http://localhost:5199/APP-wftdm-dashboard/')
    await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 30_000 })
    await openScenariosTab(page)

    // 020-settings-modal (FR-019): corrected from "the whole control is
    // absent" — the previous standalone ScenarioLoader's own behavior —
    // to "visible but disabled, with an explanatory tooltip," matching the
    // treatment already used for the browser-capability case above. The
    // Settings modal and the rest of the Scenarios tab must stay fully
    // reachable in LOCAL mode.
    const trigger = page.getByTestId('scenario-load-trigger-disabled-wrapper')
    await expect(trigger).toBeVisible()
    await expect(trigger.getByRole('button')).toBeDisabled()
    await trigger.hover()
    await expect(page.getByText('This deployment already loads scenarios directly')).toBeVisible()

    // Rest of the Scenarios tab (list) and the rest of the dashboard still
    // work on this hostname too.
    await expect(page.getByTestId('scenario-load-list')).toBeVisible()
    await page.getByRole('button', { name: /^Close$/ }).click()
    await expect(panelCard(page, 'Households')).toBeVisible()
  })
})

test.describe('User Story 3 - Analyst manages multiple loaded local scenarios', () => {
  test('two distinct local folders can be loaded simultaneously, both active', async ({ page }) => {
    await installFakePicker(page, {
      folderName: 'ignored',
      manifestText: 'scenario_name: t031_local_a\n',
      hasSummary: true,
      files: loadFixtureParquetFiles(),
    })
    await boot(page)
    await loadAndWait(page, 't031_local_a')

    // Re-point the fake at a second, differently named folder before the
    // second pick — same underlying fixture bytes, a different registered
    // name is all registerScenario()/appState care about. setFakePickerConfig,
    // not a second installFakePicker (which would have no effect on this
    // already-loaded page — see installFakePicker's own comment).
    await setFakePickerConfig(page, {
      folderName: 'ignored',
      manifestText: 'scenario_name: t031_local_b\n',
      hasSummary: true,
      files: loadFixtureParquetFiles(),
    })
    await loadAndWait(page, 't031_local_b')

    const a = await page.evaluate(() => window.__wftdm!.appState.get('t031_local_a'))
    const b = await page.evaluate(() => window.__wftdm!.appState.get('t031_local_b'))
    expect(a?.active).toBe(true)
    expect(a?.status).toBe('ready')
    expect(b?.active).toBe(true)
    expect(b?.status).toBe('ready')

    // 020-settings-modal: a scenario's name is now shown via an editable
    // <input>'s `value`/`placeholder` (US4's own label-editing control,
    // scenariosTab.tsx), not plain text — an unlabeled scenario's name
    // lives in `placeholder`, invisible to `toContainText` (which reads
    // `textContent`, and neither an input's `value` nor its `placeholder`
    // attribute counts as child text). Scoped to each scenario's own
    // labeled input via its aria-label instead.
    await expect(page.getByRole('textbox', { name: 'Custom label for t031_local_a' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Custom label for t031_local_b' })).toBeVisible()
  })

  test('removing one loaded local scenario drops only its own views, leaves the other and auto-discovered scenarios unaffected', async ({
    page,
  }) => {
    await installFakePicker(page, {
      folderName: 'ignored',
      manifestText: 'scenario_name: t032_local_a\n',
      hasSummary: true,
      files: loadFixtureParquetFiles(),
    })
    await boot(page)
    await loadAndWait(page, 't032_local_a')

    await setFakePickerConfig(page, {
      folderName: 'ignored',
      manifestText: 'scenario_name: t032_local_b\n',
      hasSummary: true,
      files: loadFixtureParquetFiles(),
    })
    await loadAndWait(page, 't032_local_b')

    await page.getByRole('button', { name: 'Remove t032_local_a' }).click()
    await expect.poll(async () =>
      page.evaluate(() => window.__wftdm!.appState.get('t032_local_a')),
    ).toBeUndefined()

    // The other local scenario is untouched.
    const b = await page.evaluate(() => window.__wftdm!.appState.get('t032_local_b'))
    expect(b?.active).toBe(true)
    expect(b?.status).toBe('ready')
    const bRows = await page.evaluate(() =>
      window.__wftdm!.query('SELECT * FROM t032_local_b__summary_kpis'),
    )
    expect(bRows.length).toBeGreaterThan(0)

    // Every auto-discovered scenario is untouched too. 'observed' has no
    // real dataset in this repo (see boot()'s own comment) — genuinely
    // 'failed'/inactive, not the retired fixture's own always-active
    // placeholder; still a real, unaffected appState entry.
    const observed = await page.evaluate(() => window.__wftdm!.appState.get('observed'))
    const baseline = await page.evaluate(() => window.__wftdm!.appState.get('activitysim-baseline'))
    expect(observed?.status).toBe('failed')
    expect(baseline?.status).toBe('ready')

    // The removed scenario's own view is genuinely gone, not just
    // deactivated — querying it now rejects.
    await expect(
      page.evaluate(() => window.__wftdm!.query('SELECT * FROM t032_local_a__summary_kpis')),
    ).rejects.toThrow()
  })
})

// 018-baseline-scenario-designation. Reuses this file's own boot()/
// installFakePicker()/loadAndWait() helpers rather than a new spec file —
// baseline marking lives in the same ScenarioLoader component 009 already
// covers here, and boot()'s own minimal 2-entry world ('observed' pinned/
// failed, 'activitysim-baseline' published/non-pinned/ready) is exactly
// the shape User Story 2's automatic-default behavior needs to exercise
// for real, not synthetically.
test.describe('018-baseline-scenario-designation', () => {
  // 037-scenarios-tab-redesign, Part D replaced the Star control with a
  // single chip: the current baseline row shows a filled, non-interactive
  // "Baseline" Badge; every other row shows a clickable "Set as baseline"
  // button (aria-label "Mark {name} as baseline scenario", unchanged).
  function baselineStar(page: Page, name: string, currentlyBaseline: boolean) {
    return currentlyBaseline
      ? page.getByTestId(`baseline-chip-${name}`).getByText('Baseline', { exact: true })
      : page.getByRole('button', { name: `Mark ${name} as baseline scenario` })
  }

  test.describe('User Story 1 - Analyst marks a scenario as baseline via the UI', () => {
    test('marking a scenario moves the designation; re-marking the same one is a no-op', async ({
      page,
    }) => {
      await installFakePicker(page, {
        folderName: 'ignored',
        manifestText: 'scenario_name: t040_local\n',
        hasSummary: true,
        files: loadFixtureParquetFiles(),
      })
      await boot(page)
      await loadAndWait(page, 't040_local')

      await baselineStar(page, 't040_local', false).click()
      await expect.poll(() => page.evaluate(() => window.__wftdm!.appState.getBaseline())).toBe(
        't040_local',
      )
      await expect(baselineStar(page, 't040_local', true)).toBeVisible()

      // Marking the real published demo scenario instead moves the
      // designation — never both, never neither.
      await baselineStar(page, 'activitysim-baseline', false).click()
      await expect.poll(() => page.evaluate(() => window.__wftdm!.appState.getBaseline())).toBe(
        'activitysim-baseline',
      )
      await expect(baselineStar(page, 'activitysim-baseline', true)).toBeVisible()
      await expect(baselineStar(page, 't040_local', false)).toBeVisible()

      // Re-marking the current baseline is idempotent. Post-037 the
      // baseline row's own chip is a non-interactive status Badge (Part D,
      // FR-009) — there is no "re-mark from its own row" affordance to
      // click — so idempotency is asserted at the state level directly.
      await page.evaluate(() => window.__wftdm!.appState.setBaseline('activitysim-baseline'))
      await expect(page.evaluate(() => window.__wftdm!.appState.getBaseline())).resolves.toBe(
        'activitysim-baseline',
      )
    })
  })

  test.describe('User Story 2 - Automatic default baseline with zero clicks', () => {
    test('the first ready, non-pinned scenario is baseline automatically — never observed', async ({
      page,
    }) => {
      await boot(page)
      await openScenariosTab(page)

      // No explicit action taken at all — activitysim-baseline (published,
      // non-pinned) resolves as baseline automatically; observed (pinned,
      // and here genuinely 'failed' — no real dataset) never does, matching
      // research.md §1's real-registration-order finding either way.
      await expect
        .poll(() => page.evaluate(() => window.__wftdm!.appState.getBaseline()))
        .toBe('activitysim-baseline')
      await expect(baselineStar(page, 'activitysim-baseline', true)).toBeVisible()
      await expect(baselineStar(page, 'observed', false)).toBeVisible()
    })

    test('loading a further scenario does not move an already-resolved automatic default', async ({
      page,
    }) => {
      await installFakePicker(page, {
        folderName: 'ignored',
        manifestText: 'scenario_name: t041_local\n',
        hasSummary: true,
        files: loadFixtureParquetFiles(),
      })
      await boot(page)
      await expect
        .poll(() => page.evaluate(() => window.__wftdm!.appState.getBaseline()))
        .toBe('activitysim-baseline')

      await loadAndWait(page, 't041_local')
      await expect(page.evaluate(() => window.__wftdm!.appState.getBaseline())).resolves.toBe(
        'activitysim-baseline',
      )
    })
  })

  test.describe('User Story 3 - Removing the baseline scenario falls back cleanly', () => {
    test('removing the explicit baseline reverts to the automatic-default rule, not a dangling reference', async ({
      page,
    }) => {
      await installFakePicker(page, {
        folderName: 'ignored',
        manifestText: 'scenario_name: t042_local\n',
        hasSummary: true,
        files: loadFixtureParquetFiles(),
      })
      await boot(page)
      await loadAndWait(page, 't042_local')

      await baselineStar(page, 't042_local', false).click()
      await expect
        .poll(() => page.evaluate(() => window.__wftdm!.appState.getBaseline()))
        .toBe('t042_local')

      await page.getByRole('button', { name: 'Remove t042_local' }).click()
      await expect
        .poll(async () => page.evaluate(() => window.__wftdm!.appState.get('t042_local')))
        .toBeUndefined()

      // Falls back to the same automatic-default rule Phase 4 already
      // proves in isolation — activitysim-baseline, never left referencing
      // the now-removed local scenario.
      await expect
        .poll(() => page.evaluate(() => window.__wftdm!.appState.getBaseline()))
        .toBe('activitysim-baseline')
      await expect(baselineStar(page, 'activitysim-baseline', true)).toBeVisible()
    })

    test('removing a scenario that is NOT the current baseline leaves it unaffected', async ({
      page,
    }) => {
      await installFakePicker(page, {
        folderName: 'ignored',
        manifestText: 'scenario_name: t043_local\n',
        hasSummary: true,
        files: loadFixtureParquetFiles(),
      })
      await boot(page)
      await loadAndWait(page, 't043_local')

      // activitysim-baseline is already baseline via the automatic-default
      // rule (User Story 2) — no click needed to establish that here; this
      // test is specifically about removal NOT disturbing it.
      await expect
        .poll(() => page.evaluate(() => window.__wftdm!.appState.getBaseline()))
        .toBe('activitysim-baseline')
      await expect(baselineStar(page, 'activitysim-baseline', true)).toBeVisible()

      await page.getByRole('button', { name: 'Remove t043_local' }).click()
      await expect
        .poll(async () => page.evaluate(() => window.__wftdm!.appState.get('t043_local')))
        .toBeUndefined()
      await expect(page.evaluate(() => window.__wftdm!.appState.getBaseline())).resolves.toBe(
        'activitysim-baseline',
      )
    })
  })
})

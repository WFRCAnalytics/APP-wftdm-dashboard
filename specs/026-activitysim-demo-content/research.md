# Phase 0 Research: Real ActivitySim scenario content

All items below were resolved directly against real, installed source (this
project's own `python/wftdm_dashboard/postprocessor/expand.py`,
`services/scenarioDiscovery.ts`, `services/yamlLoader.ts`) or real generated
data from this session's earlier ActivitySim runs — not assumed from
`docs/GRAMMAR.md`'s prose alone, which was independently confirmed to contain
at least one illustrative-only (non-ActivitySim) column-naming convention
(spec.md Research Finding #3).

## 1. Real `sources:` filenames

**Decision**: `summarize.yaml`'s `sources:` block references the literal
`final_*.csv` filenames ActivitySim actually writes — `final_households.csv`,
`final_persons.csv`, `final_tours.csv`, `final_trips.csv`,
`final_land_use.csv` — not the shorter `households.csv`-style names
`docs/GRAMMAR.md`'s own worked example uses.

**Rationale**: `contracts/cli.md` (025-python-postprocessor) confirms
`sources:` paths are relative to `--input`, and `--input` is pointed directly
at each real ActivitySim run's own output directory, which contains exactly
the `final_`-prefixed files (confirmed by direct `ls` against
`wftdm-scenario-outputs/{baseline,density-variant,transit-variant}/output/`
this session). Renaming or copying them to shorter names before running the
CLI would be an unnecessary extra step with no benefit — the CLI takes any
real filename.

**Alternatives considered**: Symlinking/copying to `docs/GRAMMAR.md`-style
short names for cosmetic consistency with the doc's example — rejected as
pure busywork; the doc's own example names are already confirmed illustrative
in Research Finding #3, so there is no consistency worth preserving.

## 2. Real time-of-day period bucketing (`bins:` `manual_breaks`)

**Decision**: A `time_of_day_period` bin on `depart` with
`breaks: [0, 5, 9, 14, 18, 24]` and `labels: [EA, AM, MD, PM, EV]`.

**Rationale**: Read `_expand_manual_breaks()` in `expand.py` directly — the
generated SQL is `WHEN col < breaks[i+1] THEN labels[i]` for `i` in
`range(len(labels) - 1)`, plus `ELSE labels[-1]`. This means only
`breaks[1..len(labels)-1]` are ever actually used in the generated SQL;
`breaks[0]` (and any entry beyond `breaks[len(labels)-1]`) is purely
documentary. Confirming this against real code — rather than trusting
`docs/GRAMMAR.md`'s two worked examples, which use inconsistent
breaks-vs-labels lengths relative to each other — resolved which entries are
load-bearing before authoring this feature's own bin. The four load-bearing
boundaries (5, 9, 14, 18) are taken directly from this session's own
already-confirmed real `network_los.yaml` `periods: [0,3,5,9,14,18,24]` /
`labels: ['EA','EA','AM','MD','PM','EV']` — collapsing ActivitySim's own two
separate EA sub-periods (`[0,3)` and `[3,5)`) into one `EA` bucket, since both
already carry the same label in ActivitySim's own real config and the
`manual_breaks` grammar has no reason to expose a distinction ActivitySim
itself doesn't surface in any output column.

**Alternatives considered**: A `spaced_intervals`/`equal_intervals` bin —
rejected, since the real period boundaries are irregular (widths of 5, 4, 5,
4, 6 hours), not evenly spaced or data-driven; `manual_breaks` is the only one
of the four bin types built for exactly this shape.

## 3. Destination-zone join correctness (no independent geometry check available)

**Decision**: Join `trips_by_destination_zone`'s metric SQL as
`trips t ... JOIN land_use lu ON t.destination = lu.zone_id` (and the
equivalent for `tours.destination`).

**Rationale**: Checked directly against the real baseline output —
`final_land_use.csv`'s header (`DISTRICT,SD,county_id,TOTHH,TOTPOP,TOTACRE,
RESACRE,CIACRE,TOTEMP,AGE0519,RETEMPN,FPSEMPN,HEREMPN,OTHEMPN,AGREMPN,
MWTEMPN,PRKCST,OPRKCST,area_type,HSENROLL,COLLFTE,COLLPTE,TOPOLOGY,TERMINAL,
household_density,employment_density,density_index,is_cbd,zone_id`, 29
columns total, matching Research Finding #6) confirms the zone-id column is
literally named `zone_id` (its last column), and its first data row —
`...,zone_id=1` with `TOTEMP=27318, RETEMPN=224, FPSEMPN=21927,
HEREMPN=2137, OTHEMPN=2254, AGREMPN=18, MWTEMPN=758` — matches TAZ 1's own
already-documented real employment values exactly. `final_trips.csv`/
`final_tours.csv`'s `destination` columns are plain integers in the same 1–25
range. This resolves what spec.md's Edge Cases section flagged as needing a
direct check before the metric could be considered complete — Research
Finding #5 already established no zone-boundary geometry exists to
cross-validate this join independently, so confirming it directly against
the real CSV header/row was the only available correctness signal, and it
now positively confirms the join rather than leaving it assumed.

**Alternatives considered**: Guessing a `TAZ`- or `taz_id`-style column name
by analogy with the raw *input* `data/land_use.csv` (which does use `TAZ`) —
rejected once checked directly: ActivitySim's own pipeline renames it to
`zone_id` in `final_land_use.csv`, a real, confirmed input→output renaming
this feature would have gotten wrong without checking the actual generated
file.

## 4. New content-root discovery — additive code shape

**Decision**:
- `src/services/yamlLoader.ts` needs **zero changes** — `loadDashboards()`
  already accepts an optional `baseUrl` parameter (confirmed by direct read);
  `main.tsx` calls it a second time with `` `${import.meta.env.BASE_URL}demo-dashboard-config/` ``
  and concatenates the result with the existing call's result before parsing.
- `src/services/scenarioDiscovery.ts` gains one new function,
  `registerDemoScenarios()`, structurally identical to the existing
  `registerPublishedScenarios()` but pointed at
  `` `${base}demo-scenarios/${name}/summary` `` and a distinct namePrefix —
  called from `discoverScenarios()` alongside (not instead of) the existing
  `registerObserved()`/`registerPublishedScenarios()` calls.

**Rationale**: Confirmed by direct read of both files. `loadDashboards()` was
already designed generically (its `baseUrl` parameter has no existing caller
that needs it today, but the signature already supports exactly this use
case) — no risk of regressing its one existing caller, since that caller's
own invocation (no arguments, defaulting to the app's base URL) is untouched.
`registerPublishedScenarios()` has no such parameter, so the smallest-risk
change is a new sibling function rather than parameterizing and risking a
subtle behavior change to the existing, already-tested one — satisfying
FR-010's "additive, not a change to the existing path" requirement exactly.

**Alternatives considered**: Parameterizing `registerPublishedScenarios()`
itself (adding a `folderName`/`namePrefix` argument) and calling it twice —
rejected; touches a function every existing scenario-loading test already
exercises, for no benefit over a same-shape sibling function, and FR-010
specifically calls for the existing path to stay unmodified.

## 5. Manifest traceability back to the real raw dataset (FR-008)

**Decision**: Each of the three `wftdm-dashboard summarize` invocations
passes `--scenario-name` values that directly name which real raw dataset
produced them (`activitysim-baseline`, `activitysim-density-variant`,
`activitysim-transit-variant`), and `--notes` naming the specific applied
edit (e.g. `"TAZ 1 employment +40% (TOTEMP/RETEMPN/FPSEMPN/HEREMPN/OTHEMPN/AGREMPN/MWTEMPN)"`
for the density variant, `"AM/PM WLK_LOC_WLK_TOTIVT x0.80, WLK_LOC_WLK_IWAIT x0.50"`
for the transit variant) — both already-supported CLI flags, no new
capability needed.

**Rationale**: `manifest.yaml`'s `scenario_name`/`notes` fields already exist
and are exactly the "traceable back to which real raw dataset" mechanism
FR-008 asks for; the exact real edit magnitudes are already fully documented
from this session's earlier variant-design work and need no re-derivation.

**Alternatives considered**: A separate provenance file — rejected as an
unnecessary fourth config-adjacent file type when `manifest.yaml`'s existing
fields already carry this information.

## 6. Real, confirmed post-implementation finding: Playwright test isolation

**What happened**: after all content and additive TS code were in place, a
full `npm run test:integration` run produced 5 real failures — not
flakiness. `playwright.config.js`'s `webServer` runs `vite` directly against
the actual `public/` tree (confirmed by reading the config directly), and
`tests/global-setup.js`/`global-teardown.js` only ever swap fixture content
in/out of `public/observed`/`public/scenarios`/`public/dashboard-config`/
`public/geometry`. Every one of those four paths is gitignored and normally
absent except during a fixture-driven run or dev session — but `public/
demo-scenarios`/`public/demo-dashboard-config` (this feature's whole point)
are real, git-tracked, and *permanently* present, so they registered 3 extra
scenarios and 3 extra tabs during every Playwright run unconditionally,
breaking `scenarioNamesInOrder()`-based assertions in `settingsModal.spec.ts`
(US3 reorder tests, US4 label test) and a query-count assertion in
`dashboardShell.spec.ts`.

**Decision**: presented to the user directly (not silently resolved, given
FR-009's original "don't touch the test suite" wording) — chose to extend
`tests/global-setup.js`/`global-teardown.js` to temporarily blank
`public/demo-scenarios/index.json` and `public/demo-dashboard-config/
index.json` to `[]` for the duration of a Playwright run, restoring the
original content in teardown. `registerDemoScenarios()`/`loadDashboards()`
are both driven entirely by their own `index.json`, so an empty array
produces the exact same "nothing to discover" effect as the directories not
existing, with no change to any `.spec.ts` assertion, no change to
`tests/fixtures/`, and no change to `copy-fixtures.js`.

**Rejected first attempt**: renaming the whole `public/demo-scenarios/`/
`public/demo-dashboard-config/` directory trees out of the way (matching the
exact wording of the option initially chosen) instead of touching just their
`index.json` files. This failed **repeatedly and reproducibly** with a real
`EPERM: operation not permitted` on Node's `renameSync()` on Windows, even
behind a 5-attempt retry-with-backoff wrapper — while an identical `mv` from
a plain shell moments later always succeeded immediately. The most likely
real cause (not fully isolated, but consistent with the evidence): Windows
Defender/Search Indexer briefly holding a handle somewhere inside a tree of
several dozen just-written files, a window a fixed short retry couldn't
reliably outlast. Blanking two small, already-existing files avoids
directory-tree operations entirely and never failed once it was in place —
confirmed via a full, clean 230/230-passing re-run.

**Alternatives considered**: gating demo-content discovery behind an
explicit opt-in (e.g. a `?demo=1` URL param) instead of touching any
test-adjacent file — rejected by the user in favor of keeping the demo
unconditionally visible per FR-003's "discovered at startup" framing.

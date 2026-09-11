# Phase 1 Data Model: Test-suite migration

This feature has no runtime data schema. The "entities" are configuration files and harness state. Each is described by its shape, its lifecycle, and the rules that govern it.

---

## E-1: `dashboard-8-test.yaml`

**Location**: `public/demo-dashboard-config/dashboard-8-test.yaml` (git-tracked).

**Shape**: an ordinary `dashboard-*.yaml` — the exact grammar the seven real demo tabs use (`header`, optional `sections`, `layout` of named rows of panels). No new keys.

```
header:
  tab:   "Test"          # REQUIRED non-empty (parseDashboardConfig throws on ""); the real aria-label source
  title: "Test / Broken Panels"   # REQUIRED non-empty; only ever shown as the content-area <h1> during a test run
  blank_nav: true        # NEW (D-8) — sidebar entry renders blank: no icon, label hidden, aria-label only
  full_page: true        # deliberately paired with >1 panel below → misconfiguration case (D-6)
  # NOTE: `icon` is intentionally OMITTED — blank_nav forces no glyph anyway, and omitting it is the
  #       cleaner signal. Do NOT set `icon`.
layout:
  row_missing_metric:   [ … one panel per type with metric: __nonexistent__ … ]
  row_bad_chart_type:   [ recharts chart_type: pie ]
  row_bad_basemap:      [ flowmap + zonemap basemap: totally-made-up-preset-name ]
  row_broken_composition: [ flowmap basemap: { layers: [ unreachable-url ] } ]
  row_bad_gw_dataset:   [ graphic-walker dataset: __nonexistent__; graphic-walker dataset_picker: true + dataset: __nonexistent__ ]
  row_markdown_edge:    [ markdown XSS; markdown ""; markdown "   " ]
  row_valuebox_edge:    [ valuebox sparkline.metric __nonexistent__; valuebox baseline_trend missing expr ]
  row_bad_diff:         [ table comparison.diff.a/b unresolvable ]
  row_empty_result:     [ recharts + graphic-walker filter.primary_purpose __no_such_purpose__ ]
  row_basemap_precedence: [ panels with/without panel-level basemap: under a tab-level default_basemap: ]
```

Exact panel list is the contract in `contracts/dashboard-8-test.md`.

**Rules**:
- MUST use only existing grammar (Principle IV / VII). No synthetic Parquet (FR-005).
- Every panel binds to a real demo scenario (`activitysim-baseline` unless the case needs otherwise) and a real metric name — except where the *point* is a nonexistent metric/dataset/scenario.
- Sentinel strings (`__nonexistent__`, `__no_such_purpose__`, `totally-made-up-preset-name`) MUST be verified absent from the real Parquet / preset registry before use.

**Lifecycle**:

| Phase | `index.json` lists it? | Visible in app? |
|---|---|---|
| Committed / built / deployed | **No** | **No** — real users see 7 tabs (FR-002, SC-001) |
| During `npm run test:integration` | **Yes** (appended by `global-setup.js`) | 8th tab present, but its sidebar entry is **visually blank** (D-8); error/empty panel states asserted |
| Manual dev check (`npm run dev` + the entry manually added) | Yes | Same — blank sidebar entry, never a polished-looking nav item |
| After teardown | No (restored verbatim) | No |

---

## E-1b: `header.blank_nav` field (new, D-8)

**Where**: `DashboardTabConfig.header.blank_nav?: boolean` in `src/layout/types.ts`.

**Parsing** (`parseDashboardConfig`, fail-soft, identical shape to `full_page`):
`blank_nav: typeof header.blank_nav === 'boolean' ? header.blank_nav : undefined`

**Consumer**: `src/layout/sidebarNav.tsx` only. No query/data-layer code reads it.

**Rendering rule** — when `tab.header.blank_nav === true`:

| Aspect | Normal tab | `blank_nav` tab |
|---|---|---|
| icon glyph | `iconComponentFor(header.icon)` if set | never rendered (forced `undefined`) |
| label `<span>` | `truncate`, shown when sidebar expanded | rendered in both sidebar states with `truncate invisible` (layout box kept, no paint) |
| `SidebarMenuButton` `aria-label` | `undefined` (name from visible text) | `tab.header.tab` (the accessible name; `visibility:hidden` text is excluded from accname) |
| `role="tab"` / `aria-selected` / `onClick` | unchanged | unchanged — fully keyboard-navigable |
| collapsed icon-rail | shows icon | shows nothing (no icon, hidden label) — matches existing icon-less-tab behavior |

**Invariant**: `blank_nav` absent/`false` ⇒ every one of the seven real tabs renders exactly as before this feature (verified: `aria-label` stays `undefined`, label class stays `truncate`, icon path untouched).

**Grammar status**: an optional key on an existing type, added the same way `030-sidebar-navigation` added `header.icon` and `header.full_page` — not a new config file type (Principle VII).

---

## E-2: `public/demo-dashboard-config/index.json`

**Shape** (unchanged — 028-dashboard-branding rich form):

```json
{ "dashboards": [ "dashboard-1-summary.yaml", … "dashboard-7-explore.yaml" ],
  "title": "…", "logoUrl": "…", "logoUrlDark": "…" }
```

**State transitions** (the only mutation this feature performs on shipped content):

```
committed state:  dashboards = [7 real files]
      │  global-setup.js: save → index.json.original-during-tests; dashboards.push("dashboard-8-test.yaml")
      ▼
test-time state:  dashboards = [7 real files, "dashboard-8-test.yaml"]
      │  global-teardown.js: overwrite index.json from backup; delete backup
      ▼
committed state:  dashboards = [7 real files]
```

**Guard**: if `index.json.original-during-tests` already exists at `global-setup` time → throw (a prior run's teardown didn't fire). Same fail-loud check as today, re-pointed to this one file (FR-013).

`public/demo-scenarios/index.json` is **no longer touched** by the harness (was blanked to `[]` pre-migration).

---

## E-3: Real demo scenarios (the new scenario source of truth)

| name | `display_name` | manifest `color` | `status` in tests | `pinned` |
|---|---|---|---|---|
| `activitysim-baseline` | ActivitySim Baseline | `#59A14F` | `ready` (auto-active, 038) | `false` |
| `activitysim-density-variant` | ActivitySim: TAZ 1 Density +40% | `#BAB0AC` | `ready` (auto-active) | `false` |
| `activitysim-transit-variant` | ActivitySim: AM/PM Transit Service Increase | `#FF9DA7` | `ready` (auto-active) | `false` |
| `observed` | Observed Data | — | **`failed`** (no `public/observed/` content) | `true` |

Headline KPI values (baseline) migrated specs assert against: `total_households` 5000 · `total_persons` 8212 · `total_trips` 23583 · `total_tours` 9806 · `total_vmt` 15212.34 (renders `15,212`) · `trips_per_household` 4.7166. Cross-scenario divergence lives in `land_use_summary` (TAZ 1, density variant) and `mode_share_by_period` (WALK_LOC, transit variant) — see `research.md` D-5.

---

## E-4: `tests/fixtures/all-placeholders-config.yaml`

**Status**: retained, hand-maintained, unchanged location. The only fixture artifact that survives.

**Shape**: a single `summarize.yaml`-style config exercising every placeholder kind (`mappings:` / `bins:` (manual_breaks) / `sql_fragments:` / `$inputs` / `$scenario` / `$filters`). Not a rendered dashboard tab.

**Consumers**: `boot.spec.ts` (`yamlLoader.loadConfig('/APP-wftdm-dashboard/all-placeholders-config.yaml')`), `tests/unit/sqlExpander.test.ts` (Vitest — out of scope but shares the file).

**Lifecycle in tests**: `global-setup.js` copies it to `public/all-placeholders-config.yaml`; `global-teardown.js` deletes that copy. This is the **one** surviving copy line.

---

## E-5: Retired entities (deleted by this feature)

| Entity | Deletion |
|---|---|
| `tests/fixtures/dashboard-config/` (5 files) | `git rm` (FR-011) |
| `tests/fixtures/observed/` | `git rm` (D-1 / FR-016) |
| `tests/fixtures/scenarios/` (`good_scenario`, `broken_scenario`) | `git rm` (FR-016) |
| `tests/fixtures/geometry/` | `git rm` (FR-016) |
| `tests/fixtures/generate.py` | `git rm` (D-2 / FR-014) |
| `tests/integration/_sharedFixtureLock.ts` | `git rm` (D-4 / FR-009) |
| — (added, not retired) `src/layout/types.ts` + `src/layout/sidebarNav.tsx` | minimal extension for `header.blank_nav` (E-1b / D-8) — the one `src/` touch |
| `pretest:integration` npm script | removed from `package.json` (FR-014) |
| `dev:fixtures` npm script + `scripts/copy-fixtures.js` | removed, or reduced to "append `dashboard-8-test.yaml` for a manual `npm run dev`" (FR-015) |

---

## E-6: Harness state machine (post-migration)

```
                 ┌──────────────────── global-setup.js ────────────────────┐
clean checkout   │  1. cpSync all-placeholders-config.yaml → public/       │
(7 real tabs,    │  2. save demo-dashboard-config/index.json → *.original  │   test-time tree
 3 ready demo    │     (throw if *.original already present)               │  (8 tabs incl. Test,
 scenarios,      │  3. index.json.dashboards.push("dashboard-8-test.yaml") │   observed = failed,
 observed=404)   │  4. (demo-scenarios/index.json: untouched)              │   all-placeholders served)
                 └────────────────────────────────────────────────────────┘
                             │  playwright workers run  │
                 ┌────────────────── global-teardown.js ──────────────────┐
                 │  1. restore index.json from *.original; delete *.original│
                 │  2. rm public/all-placeholders-config.yaml               │
                 └─────────────────────────────────────────────────────────┘  → back to clean checkout
```

No `public/observed`, `public/scenarios`, `public/dashboard-config`, `public/geometry` directories are created or removed at any point.

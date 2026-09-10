# Quickstart / Validation Guide: All Loaded Scenarios Participate by Default

Runnable checks that prove the feature end-to-end. References
`contracts/discovery-activation.md` (DA-1..DA-8) and
`contracts/demo-panel-disposition.md` (the 41-panel edit list); does not repeat
their detail.

## Prerequisites

```bash
npm install                 # no new dependency added by this feature
npm run dev:fixtures        # copies tests/fixtures/{scenarios,dashboard-config,observed} into public/
```

Real demo content (`public/demo-scenarios/*`, `public/demo-dashboard-config/*`)
is already git-tracked; the three `activitysim-*` scenarios register `ready`.

## 1. Auto-activation rule (US2 / FR-001 / FR-002 / DA-1..DA-4)

```bash
npm run dev
```

- Open the app with **no `?s=` param**.
- Open the Scenarios tab (Settings → Scenarios).

**Expect**:
- The three `activitysim-*` rows each show their Switch **on**.
- `observed` (real demo: empty folder → `status failed`) shows its Switch
  **off** — and no panel anywhere shows a Catalog Error mentioning `observed`.
- In the console: `appState.getActive()` (via `window.__wftdm.appState`) returns
  exactly the three `activitysim-*` names.

Fixture context (Playwright / `npm run dev` after `dev:fixtures` with the fixture
`dashboard-config` as the active tabs): `observed` **and** `good_scenario` both
show Switch **on**; `broken_scenario` **off**.

## 2. Every unpinned panel is a multi-scenario comparison (US2 / SC-001)

On the running demo, no `?s=`:

- **Any tour-models table** (e.g. "Mandatory Tour Frequency by Person Type"):
  has a `scenario` column with three distinct values.
- **"Total Trips by Mode"** (recharts, Summary): three bars per mode, one per
  scenario, each in its resolved colour.
- **"Trip Departure Hour (Work Trips)"** (plotly, Trip Models): three traces,
  legend names = resolved scenario labels.
- **"Workplace Location Distance Distribution"** (observable-plot): three
  fill series.
- **KPI valueboxes** (Households, Persons, …): still a single number; their
  `description` now states "Baseline scenario …".
- **Zone choropleths / desire-line map**: unchanged single-scenario draw;
  `description` states the baseline scope.

Verify in **both** light and dark mode (toggle in Settings → Appearance).

## 3. Universal Switch control (US1 / FR-005 / SC-002)

On the running demo, three scenarios active:

1. Note the series/row counts on an unpinned chart on tab A (e.g. Mode Choice →
   "Total Trips by Mode": 3 bars/mode) and an unpinned table on tab B (e.g.
   Network → "Accessibility by Zone": N rows × 3 scenario groups).
2. Settings → Scenarios → flip **one** scenario's Switch **off**.
3. **Expect** (no page reload): tab A's chart now shows 2 bars/mode; tab B's
   table drops that scenario's row group. Every other unpinned panel on every tab
   likewise drops it.
4. Flip the Switch back **on** → every unpinned panel restores the third
   series/group.
5. A KEEP+NOTE panel (a zonemap, the flowmap, or a KPI valuebox) does **not**
   change in steps 2–4 — expected, not a bug (Acceptance Scenario US1.4).

## 4. Failed scenario causes no error state (SC-004 / DA-2 / DA-8)

- Real demo boot (`observed` empty): confirm zero panels show
  "Couldn't load this chart/value/map" attributable to `observed`.
- Temporarily point `public/demo-scenarios/index.json` at a non-existent folder
  name, boot: that scenario registers `failed`, is not active, and the unpinned
  panels render the remaining `ready` scenarios with no crash. Revert.

## 5. Automated suite

```bash
npm run typecheck
npm run test:unit
npx playwright test          # ONE invocation only — never run two concurrently
npm run build
```

**Expect**:
- `typecheck` / `build` clean.
- `test:unit` unchanged pass count (`appState` shape untouched).
- Playwright: green after the FR-012 remediation —
  - `boot.spec.ts` / `scenarioManager.spec.ts` / `settingsModal.spec.ts`
    active-set assertions updated to the fixture ready-set
    (`observed` + `good_scenario`).
  - Fixture `Total Households` / `Total Trips` / `Average Trip Distance`
    valueboxes pinned `scenarios: [observed]`.
  - `Scenario Split (*)` and `Free-form Visual Analytics (Multi-Scenario)`
    panels/tests unchanged (they already declare `?s=good_scenario`).
- New dual-theme spec: an unpinned demo plotly/recharts/observable-plot panel
  renders 3 theme-correct per-scenario series in both light and dark
  (`getComputedStyle()` assertions, per `wftdm-design-system`).

## Rollback

Revert the `scenarioDiscovery.ts` change and the `dashboard-*.yaml` edits — no
migration, no persisted state (`localStorage` is banned; active set is
in-memory).

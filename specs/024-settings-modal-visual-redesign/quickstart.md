# Quickstart: Validating the Settings Modal Visual Redesign

No new setup — this feature has no new dependency, no new config file, and
no new server. Use the existing dev workflow.

## Prerequisites

```sh
npm install
npm run dev
```

Open the app, let a scenario or two register (the existing dev fixture data
is enough — a mix of `ready`/`failed`/`registering` scenarios is most useful
for User Story 1; the local dashboard already ships a `broken_scenario`
fixture per `settingsModal.spec.ts`'s own existing setup).

## US1 — Scenarios tab status coloring

1. Open Settings → Scenarios.
2. Confirm a `ready` scenario's row shows a green status indicator, a
   `failed` scenario's row shows the same red/`--destructive` treatment
   already used for the "Couldn't load…" error text elsewhere in this tab,
   and any still-registering scenario shows a neutral/pending treatment.
3. Confirm reorder (▲/▼), baseline star, inline relabeling, and remove (✕,
   local scenarios only) all still work exactly as before.

Automated: `tests/integration/settingsModal.spec.ts`, "User Story 3"
describe block (Scenarios tab) — see `data-model.md`'s status→treatment
table for what a new assertion should check.

## US2 — Raster tile live preview

1. Open Settings → Basemap.
2. Scroll to Raster Tiles, select any provider from the dropdown (e.g. one
   with no variants, and one with variants via the `<optgroup>`).
3. Confirm the shared preview map above immediately shows real raster tiles
   for that provider — no "No live preview for raster providers" message.
4. Switch back to a vector-style entry (any of the first three sections);
   confirm the preview cleanly switches to that vector style.
5. Click Apply; confirm the raster provider becomes the live global basemap
   on an actual panel, exactly as it does today.
6. (Failure path) Temporarily block network access to the raster tile host
   in devtools and re-select the same provider; confirm the preview shows a
   distinct failure indication rather than a blank map.

Automated: extend the existing Basemap-tab test block in
`settingsModal.spec.ts` — see research.md §1 for the exact resolution path
being exercised (`loadBasemapStyle()`'s existing raster branch).

## US3 — Basemap catalog visual polish

1. Open Settings → Basemap.
2. Hover an unstaged entry — confirm a distinct hover state.
3. Confirm the staged entry is visually distinguishable at a glance (not
   only via `aria-checked`).
4. Confirm section headings are visually separated from their entries.
5. Confirm staging/preview/Apply behavior is unchanged from before this
   feature.

## US4 — Appearance tab as a real Tabs control

1. Open Settings → Appearance.
2. Click into the System/Light/Dark control, use ← → arrow keys to move
   between options; confirm focus moves the way it does in the dashboard's
   own top-level tab strip.
3. Select Light or Dark; switch to another Settings tab and back to
   Appearance; confirm the selection is still shown as selected (not reset
   to System) — this is the already-fixed tab-remount behavior and must not
   regress.
4. With DevTools' accessibility tree (or `page.getByRole('tablist', ...)`
   in a test), confirm there are exactly two distinguishable `tablist`
   regions while this tab is open: "Settings sections" (outer) and "Theme"
   (inner) — see research.md §3.

Automated: `tests/integration/settingsModal.spec.ts`'s existing
`role="button"`/`aria-pressed` assertions for System/Light/Dark must be
migrated to `role="tab"`/`aria-selected` (research.md §3) — run the full
suite (`npx playwright test settingsModal.spec.ts`) after the rebuild to
confirm no other test depended on the old button shape.

## Full regression pass

```sh
npm run typecheck
npm run test        # Vitest unit tests
npx playwright test # full integration suite
```

Per this project's own established flakiness-triage discipline (see
CLAUDE.md's own recorded history), re-run any single failing integration
test in isolation (`--repeat-each=3`) and the full suite serially
(`--workers=1`) before concluding a failure is a real regression from this
feature rather than pre-existing flakiness.

# Quickstart: Protomaps PMTiles Basemap Support

Validates the feature end-to-end once implemented. See `contracts/` for the exact shapes referenced below and `data-model.md` for the E-1..E-4 entities.

## Prerequisites

- `npm install` has pulled in `@protomaps/basemaps` `^5.7.2` and `pmtiles` `^4.5.0` (research.md R-1/R-2).
- A small, real, git-tracked test PMTiles fixture exists (research.md R-7) — e.g. `tests/fixtures/protomaps/tiny-test-area.pmtiles`.

## Scenario 1 — Deployer default, all 5 flavors (User Story 1 + 2)

1. Set `public/dashboard-config/index.json`'s (or the test-fixture equivalent) `protomapsPmtilesUrl` to the small test fixture's relative path.
2. `npm run dev`, open the app, open Settings → Basemap.
3. Confirm a "Protomaps" section appears directly above "Raster Tiles" (contracts/basemap-tab-ui.md).
4. Select each of the 5 flavor tiles (Light, Dark, White, Grayscale, Black) in turn; for each, confirm:
   - The preview map re-styles with visibly distinct colors per flavor.
   - Labels/roads render (not just a blank vector fill).
   - The attribution control shows the Protomaps + OpenStreetMap string (contracts/basemap-resolution.md).
5. Open the browser's network panel; switch between two flavors again. Confirm no new request for the archive's header/root-directory range (`bytes=0-16383`) fires on the second switch — only the first flavor ever opens the archive itself (FR-012/SC-005). A request for the currently-visible TILE bytes IS expected on every switch (the map engine recreates the tile layer on each `setStyle()` call, the same as any other basemap switch) — that is not what this check is about.

**Expected outcome**: all 5 flavors render correctly from one shared, deployer-configured source; SC-001, SC-002, SC-004 satisfied.

## Scenario 2 — External URL default behaves identically (User Story 2)

1. Change `protomapsPmtilesUrl` from the relative bundled path to a full `https://` URL pointing at the same fixture file hosted externally (or a second, equivalent small test host).
2. Repeat step 4 of Scenario 1.

**Expected outcome**: identical rendering to Scenario 1 — no code path difference between a relative path and an external URL (FR-004).

## Scenario 3 — Not configured (User Story 2, edge case)

1. Remove `protomapsPmtilesUrl` entirely (or point at a deployment with none set — e.g. this app's own real `public/demo-dashboard-config/index.json`, which per contracts/deployer-config.md ships without it).
2. Open Settings → Basemap → Protomaps section.

**Expected outcome**: the 5 tiles render disabled with a clear "not configured" message and a URL-entry field is shown — never five clickable-but-broken tiles (FR-010, SC-003).

## Scenario 4 — Viewer session override (User Story 3)

1. From the not-configured state (Scenario 3), enter the test fixture's URL into the override field and commit it.
2. Confirm the 5 tiles become enabled immediately, no reload.
3. Select a flavor, confirm it renders.
4. Reload the app entirely; return to Settings → Basemap → Protomaps.

**Expected outcome**: after reload, the section is back to "not configured" (or back to the deployer default, if one exists) — the override did not persist (FR-006).

## Scenario 5 — Invalid override is rejected gracefully (User Story 3, edge case)

1. From the not-configured state, enter a URL that is unreachable (e.g. a nonexistent path) into the override field and commit it.
2. Confirm a distinct error message appears (different wording from the "not configured" state) and the 5 tiles remain disabled.
3. Confirm no other part of the app (other basemap sections, any currently-rendering panel) is affected.

**Expected outcome**: FR-007/FR-011 satisfied — a bad source fails loudly and locally, never silently or app-wide.

## Automated coverage

- `tests/unit/protomapsStyle.test.ts` — pure `buildProtomapsStyle()` output shape, `isProtomapsFlavorName()` membership, attribution string exactness (contracts/basemap-resolution.md).
- `tests/integration/protomapsBasemap.spec.ts` — Scenarios 1, 3, 4, 5 above, in both light and dark app themes per this project's dual-theme verification standard (`wftdm-design-system` skill).

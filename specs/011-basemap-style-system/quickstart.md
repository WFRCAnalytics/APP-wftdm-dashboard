# Quickstart: Basemap Style System

Validation scenarios proving this feature end-to-end. Extends
`tests/integration/flowmapPanel.spec.ts`'s existing real-browser pattern
(real DuckDB-WASM, fixture Parquet, fixture dashboard-config) rather than
a separate test file — same panel type, same fixture boot sequence.

## Prerequisites

```bash
node scripts/extractLeafletProviders.mjs   # generates public/basemap/leaflet-providers.json
npm run test:unit                           # resolveEffectiveBasemap, resolveRasterProvider, loadBasemapStyle
npm run test:integration                    # Playwright, real browser
```

## Scenario 1 — Default basemap renders, paired to theme (US1, SC-001)

1. Boot the app with the fixture dashboard's flowmap panel, no
   `basemap:`/`default_basemap:` set anywhere.
2. Assert the panel's MapLibre style is `carto-positron`'s real style
   (check via `map.getStyle().name` or a known Positron-specific layer id
   — not just "not BLANK_STYLE," since a broken-but-non-blank state would
   otherwise falsely pass).
3. `page.evaluate(() => document.documentElement.classList.add('dark'))`.
4. Assert the style re-resolves to `carto-dark-matter`'s real style.

## Scenario 2 — `setStyle()`/`MapboxOverlay` empirical survival (research.md §1 — the FIRST-CLASS empirical test)

Full assertion list already specified in research.md §1; summarized here
as the quickstart checklist:

- [ ] Same DOM node (`canvas.maplibregl-canvas` AND `canvas#deckgl-overlay`) before/after the theme flip.
- [ ] `data-render-count`/`data-flow-count` unchanged (no spurious re-query).
- [ ] `overlayRef` (via `window.__flowmapTestOverlays`) still reports exactly one `FlowmapLayer`.
- [ ] The deck.gl canvas is not blank after the flip (`getImageData` non-uniformity check).
- [ ] A programmatic `map.panTo()` still fires a real `'moveend'`.
- [ ] Zero console messages matching `/duplicate|already exists/i` across the flip.

If any assertion fails: apply research.md §1's documented fallback
(explicit `overlay.setProps({ layers: [] })` before `setStyle()`,
re-populate inside `style.load`) and re-run this scenario before
proceeding to task breakdown — this is a gating check for the rest of the
feature, not a nice-to-have.

## Scenario 3 — Three-level precedence (US2, FR-006)

| Panel `basemap:` | Tab `default_basemap:` | Expected resolved style |
|---|---|---|
| unset | unset | app default (theme-paired) |
| unset | `openfreemap-bright` | `openfreemap-bright` |
| `carto-voyager` | `openfreemap-bright` | `carto-voyager` (panel wins) |

Each row is a separate fixture panel on the same fixture tab (mirroring
how `flowmapPanel.spec.ts` already uses two fixture panels — one
reactive, one intentionally-broken — for User Story 1 vs. User Story 3
coverage).

## Scenario 4 — Explicit pin does not re-pair on theme change (FR-011)

1. Boot with a panel whose `basemap: carto-voyager` is explicitly set.
2. Toggle `.dark` on `<html>`.
3. Assert the style is **still** `carto-voyager` — not re-paired to
   `carto-dark-matter`. Assert `map.setStyle()` was **not** called a
   second time (spy on `maplibregl.Map.prototype.setStyle` via
   `page.addInitScript`, matching this project's existing
   `__flowmapTestMapReadyDelayMs`-style test-only instrumentation
   pattern) — proving `basemapKey`'s stability-across-theme mechanism
   (research.md §2) actually prevents the redundant call, not just that
   the visible style happens to look unchanged.

## Scenario 5 — Uniform blank-style fallback (US1/US2/US3 edge cases, FR-010)

Three fixture panels, one per source category, each configured with a
deliberately-unreachable URL/name:
- `basemap: nonexistent-preset-name` (unrecognized name)
- `basemap: { layers: ['https://127.0.0.1:1/nope.json'] }` (unreachable composition layer)
- A raster provider name not present in `leaflet-providers.json`

All three MUST render `BLANK_STYLE` (background-only, matching the
existing "Flow Map Broken Panel (intentional)" fixture's own
error-doesn't-crash-the-panel precedent) and the flow-line overlay MUST
still render on top of it — the data-driven content is never blocked by a
broken basemap.

## Scenario 6 — Real multi-source composition proof case (US3, FR-012, SC-005)

Author a fixture panel with:

```yaml
basemap:
  layers:
    - https://tiles.arcgis.com/tiles/99lidPhWCzftIe9K/arcgis/rest/services/LiteBase/VectorTileServer/resources/styles/root.json
    - https://tiles.arcgis.com/tiles/99lidPhWCzftIe9K/arcgis/rest/services/LiteLabels/VectorTileServer/resources/styles/root.json
```

Real endpoints, confirmed reachable and MapLibre-spec-compatible by direct
fetch in this session's prior research (org `99lidPhWCzftIe9K`) — this is
the actual proof case, run against the real UGRC service in a live dev-
server check per spec.md's own User Story 3 requirement ("confirm it
actually renders correctly in a real dev-server check"), not mocked. This
string never appears in `panels/basemap/registry.ts` (FR-012) — it's a
fixture-only YAML value, same status as any other downstream author's own
composition would have.

**Two layers, not the originally-planned three**: `VectorHillshade`, the
third layer of UGRC's real Vector Lite Base Map, was dropped from this
proof case during implementation after being confirmed (research.md §7)
to trigger a real, reproducible incompatibility between its own vector
tile encoding and `maplibre-gl`'s vendored PBF parser — traced directly
to that library's own error message, not a bug in this feature's code,
and not something in scope to fix here. The composition mechanism itself
is still fully proven against two real, independently-hosted services.

1. Load the fixture panel.
2. Assert both layers' worth of sources appear in `map.getStyle().sources`
   (namespaced `layer0__*`/`layer1__*`).
3. Assert no broken-icon/broken-label visual regression — practically,
   assert `map.getStyle().sprite`/`.glyphs` resolved to real, non-relative
   (`https://...`) URLs, and that a direct `fetch()` of those resolved
   URLs (from the test, not the page) succeeds — proving the relative-
   path rewrite (research.md §6) produced genuinely fetchable absolute
   URLs, not just syntactically-absolute-looking ones.
4. Assert the composed state **stays non-empty** for a further ~1.5s
   after first appearing non-empty, not just that it appears non-empty
   once — two real, compounding bugs found during implementation
   (research.md §6/§7) both manifested as "composes correctly, then
   silently reverts to blank within about a second," which a single
   non-empty read does not catch.

## Scenario 7 — `wftdm-dashboard here` / fully offline (edge case)

With every built-in preset host unreachable (Playwright route-blocking
`carto.cdn`/`openfreemap.org`/leaflet-providers-catalog requests), confirm
every panel — default, pinned, and composed — still renders on
`BLANK_STYLE` with the flow-line overlay intact, no thrown error, no
infinite loading state. This is the same "zero requests to any external
tile server" test category `flowmapPanel.spec.ts` already has for the
pre-basemap `BLANK_STYLE`-only behavior, now re-run with an *intended*
non-blank basemap configured to prove the fallback path specifically
(rather than the absence of any basemap at all).

# Contract: Basemap tab — "Protomaps" section

Governs `layout/settings/basemapTab.tsx`. Enforces FR-001, FR-006, FR-007, FR-010, SC-002, SC-003.

## Section placement (FR-001)

Existing section order: OpenFreeMap Vector Tiles → CARTO Vector Tiles → UGRC Vector Tiles → Raster Tiles.

**New order**: OpenFreeMap Vector Tiles → CARTO Vector Tiles → UGRC Vector Tiles → **Protomaps** → Raster Tiles.

## Section content — configured state

When `resolveEffectivePmtilesSource()` (contracts/basemap-resolution.md) returns a value:

- 5 tiles, one per `PROTOMAPS_FLAVOR_NAMES` entry, same tile-grid visual treatment as the existing UGRC/CARTO/OpenFreeMap sections (icon + label, selected-tile accent pairing per `024-settings-modal-visual-redesign`'s established convention).
- Clicking a tile stages it (existing `stagedSelection` mechanism, unmodified) and drives the shared live preview map, same as every other vector-style entry.
- Apply behaves identically to every other entry — no Protomaps-specific Apply logic.

## Section content — "not configured" state (FR-010)

When NO source is available (no deployer default, no viewer override):

- The 5 flavor tiles render disabled (non-clickable, visually distinct from a normal tile — muted, no hover/selected states) — never silently omitted, so a viewer can see the capability exists.
- An inline explanatory message names the situation plainly (e.g. "No PMTiles source configured for this deployment.") — never a bare empty section.
- A text-entry field, labeled for entering a PMTiles URL, is shown directly in this state — this is the viewer session-override entry point (FR-006).

## Viewer override entry field (FR-006, FR-007)

- Plain text input, staged locally (component state) until the viewer commits it (matching this tab's own stage-then-apply discipline elsewhere) — committing validates the entered value (see below) before it becomes usable.
- On successful validation: the 5 tiles become enabled immediately, without a page reload; the override is written to the session-only state module (research.md R-4) — never to `dashboard-config/index.json`, never to any Web Storage (Constitution Principle VI).
- The override field remains visible and editable even once a deployer default exists — a viewer may still override it for their own session (E-2's precedence: viewer override always wins while set).
- A "reset to deployment default" affordance clears the override back to the deployer default (or back to "not configured" if there is none) — mirroring `036`'s existing scenario-color "Reset to default" pattern.

## Validation & error state (FR-007)

| Outcome | UI result |
|---|---|
| Source opens successfully (a real PMTiles archive, reachable) | Tiles enabled; override committed |
| Source unreachable (network failure, 404, wrong host) | Inline error text naming the failure, distinct wording from "not configured"; tiles remain disabled/unchanged; previous state (deployer default or prior override, if any) is preserved, not clobbered |
| Source reachable but not a valid PMTiles archive | Same distinct error treatment as above — a validation failure, not a network failure, but both surface as "this source doesn't work," never a silent fallback |

**MUST**: the "not configured" state (FR-010) and the "configured but validation failed" state (FR-007) MUST be visually and textually distinguishable — a viewer must be able to tell "nothing is set up here" apart from "something is set up here and it's broken."

## MUST NOT

- MUST NOT auto-apply a viewer-entered URL before validation completes.
- MUST NOT persist the viewer override across a reload (session-only, FR-006) — no `localStorage`/`sessionStorage`/cookie use (Constitution Principle VI).
- MUST NOT let an invalid/unreachable viewer-entered override silently replace a previously-working deployer default or prior override.

## Verification

```
# Playwright, tests/integration/protomapsBasemap.spec.ts (new):
# - configured-state: all 5 tiles selectable + render + correct attribution
# - not-configured-state: tiles disabled, message shown, override field present
# - viewer override: enter a valid test-fixture PMTiles path -> tiles become usable, no reload
# - viewer override: enter an unreachable URL -> distinct error, tiles remain in prior state
# - reload after setting an override -> override gone, reverts to deployer default / not-configured
```

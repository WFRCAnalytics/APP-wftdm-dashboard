# Contract: One-Time Geometry Script and ZoneMap Loader Fallback

## `scripts/build-demo-zone-geometry.py`

**Inputs**: none from the repository — this script's only input is a
live HTTP request to MTC's real, public FeatureServer (research.md §1's
exact query). No raw ActivitySim scenario data is read.

**Outputs**:
1. `public/demo-geometry/taz25.geoparquet` — written directly to disk,
   git-tracked (this repo commits it, per the same reasoning
   `026-activitysim-demo-content` already established for
   `public/demo-scenarios/`).
2. Stdout: a ready-to-paste YAML block for `summarize.yaml`'s
   `sql_fragments.zone_centroids` (data-model.md §1) — NOT written to
   any file automatically (research.md §2's own reasoning).

**Failure behavior**: if the real FeatureServer request fails or returns
fewer than 25 features, the script MUST exit with a non-zero status and
a clear error — MUST NOT fall back to writing partial or placeholder
geometry (FR-001, applied to this specific tool).

**Idempotency**: safe to re-run — MTC's real TAZ boundaries for these 25
zones are not expected to change; a re-run should produce byte-identical
(or negligibly-different, e.g. floating-point formatting) output. Not a
scheduled/automated job — run once, manually, by a developer, and the
resulting output is what's actually committed and used from then on.

**Verification requirement**: after running, the script's own printed
centroid values for TAZ 1, 6, 16, and 25 MUST match this session's
already-recorded, manually-verified values (research from `spec.md`'s
own Research Findings: TAZ 1 ≈ (37.792, -122.398), etc.) — a direct,
cheap regression check against already-established ground truth, run
once, before trusting the rest of the output.

## `zoneGeometry.ts` fallback (`resolveGeometryUrl`/`loadZoneGeometry`)

**Contract**:
1. Attempt `registerFileURL()` + the existing schema-resolving query
   against `${BASE_URL}geometry/${boundaries}` (unchanged default path),
   under the DuckDB view name `viewName`.
2. If that attempt throws (the file doesn't exist at that path — the
   real, current behavior for any `boundaries` filename not present
   under `public/geometry/`), retry against `${BASE_URL}demo-geometry/
   ${boundaries}` — but under a **distinct** DuckDB view name
   (`zonemap-geom-demo__${boundaries}`), NOT the same `viewName` reused.

   **Correction (found during implementation, not anticipated here)**:
   an earlier draft of this contract said the retry reuses the *identical*
   sequence, including the same view name — that is unsafe and was
   confirmed live to fail. `registerFileURL()` registers the
   filename→URL mapping immediately, before the view-creation query ever
   runs; the failed step-1 attempt already registered `viewName`, so
   step 2's own `registerFileURL()` call with the same name throws `File
   already registered` — a real, reproduced "No magic bytes found... File
   already registered" failure. The retry MUST use a fresh, distinct view
   name.
3. If BOTH fail, surface the existing error state exactly as today (no
   new error type/message shape) — a `zonemap` panel's existing
   `geometryStatus: 'error'` handling needs no change.

**What does NOT change**:
- Every existing fixture/production `zonemap` panel (whose `boundaries`
  file already exists under `public/geometry/`) succeeds on step 1,
  unchanged — the fallback is never reached, never adds latency to the
  already-working path.
- `ensureSpatialExtensionLoaded()`, the `cache` Map's key shape, and
  every other exported function/type in `zoneGeometry.ts` are unchanged.
- No `PanelConfig` field is added — a dashboard author authors
  `boundaries: taz25.geoparquet` exactly the same way any other
  `boundaries:` value is authored; which physical root it resolves
  against is entirely this module's own internal concern.

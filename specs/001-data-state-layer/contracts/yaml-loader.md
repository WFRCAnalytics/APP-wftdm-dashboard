# Contract: `services/yamlLoader.js`

Satisfies: FR-013. Constitution Principle IV (YAML parsed at runtime, never
baked in at build time).

## `loadConfig(url: string): Promise<DashboardConfig>`

Fetches `url` at call time (not import time) and parses it with `js-yaml`.
Returns `{ raw: <parsed object>, sourcePath: url }` (see `data-model.md`).

- **Given** a `dashboard-*.yaml` or `summarize.yaml`-shaped file reachable at
  `url`, **when** `loadConfig(url)` is called, **then** the returned
  `raw` object's structure matches the YAML's structure with no
  build-time transformation applied (FR-013 — "not pre-processed, inlined, or
  baked in at build time").
- **Given** a malformed YAML file, **when** `loadConfig(url)` is called,
  **then** it rejects with an error identifying `url` as the source.

## `loadDashboards(baseUrl?: string): Promise<DashboardConfig[]>`

Satisfies FR-021's "configuration loading" boot-sequence step (see
`contracts/boot-sequence.md`). Discovers the dashboard set at **runtime**,
the same way `scenarioDiscovery.js` discovers scenarios: fetches
`public/dashboard-config/index.json` — an array of filenames, e.g.
`["dashboard-1-summary.yaml", "dashboard-2-person.yaml", ...]` — then calls
`loadConfig()` for each listed filename, resolved as
`${baseUrl}/dashboard-config/{filename}`. `baseUrl` defaults to the app's own
served base path. **The filename list is not hardcoded anywhere in this
module or in `main.js`** — the count and names of tabs are whatever
`index.json` lists, mirroring `public/scenarios/index.json`'s pattern
exactly (see `contracts/scenario-discovery.md`). "Seven tabs" is what WFRC's
default templates (`python/wftdm_dashboard/templates/`, see
`docs/ARCHITECTURE.md`) happen to ship, not a constant this code assumes.

For each filename in the list, `loadConfig()` runs inside its own isolated
failure boundary: a 404 or parse failure is skipped, never thrown — mirroring
`scenario-discovery.md`'s per-scenario fail-soft pattern. If `index.json`
itself is unreachable (true for this repo today — nothing under
`public/dashboard-config/` exists yet, greenfield), `loadDashboards()`
resolves to `[]` rather than rejecting — the missing-index case is just
the n=0 case of the same fail-soft handling, not a separate code path.
Returns the successfully-loaded configs, in `index.json`'s listed order.

- **Given** `public/dashboard-config/index.json` is unreachable (true for
  this repo today), **when** `loadDashboards()` is called, **then** it
  resolves to `[]`, not a rejection.
- **Given** `index.json` lists three filenames and only one resolves to
  valid YAML, **when** `loadDashboards()` is called, **then** the returned
  array has exactly one entry — a bad or missing file among the list is
  skipped, not fatal to the whole call.
- **Given** `index.json` lists five filenames instead of the customary seven,
  **when** `loadDashboards()` is called, **then** it attempts exactly those
  five and nothing else — this module never assumes a specific count or set
  of names.

## `loadManifest(url: string): Promise<DashboardConfig>`

Same mechanics as `loadConfig`, kept as a distinct named export only for
call-site clarity (`manifest.yaml` vs. `dashboard-*.yaml`/`summarize.yaml`) —
no behavioral difference; both are runtime-fetched YAML.

## Non-goals for this slice

- No caching layer beyond what the browser's HTTP cache provides — repeat
  calls simply re-fetch. Caching, if ever needed, is a later optimization, not
  part of this contract.
- No schema validation of dashboard/panel semantics — only "is this valid
  YAML, fetched at runtime." Placeholder-name resolution is `sqlExpander.js`'s
  job, not this module's.

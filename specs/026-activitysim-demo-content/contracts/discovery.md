# Contract: new content-root discovery + CLI invocations

## New paths (git-tracked, never gitignored)

```
public/demo-scenarios/index.json
public/demo-scenarios/activitysim-baseline/manifest.yaml
public/demo-scenarios/activitysim-baseline/summary/*.parquet
public/demo-scenarios/activitysim-density-variant/manifest.yaml
public/demo-scenarios/activitysim-density-variant/summary/*.parquet
public/demo-scenarios/activitysim-transit-variant/manifest.yaml
public/demo-scenarios/activitysim-transit-variant/summary/*.parquet

public/demo-dashboard-config/index.json
public/demo-dashboard-config/dashboard-1-overview.yaml
public/demo-dashboard-config/dashboard-2-destination-choice.yaml
public/demo-dashboard-config/dashboard-3-transit-service.yaml
```

`.gitignore`'s existing blanket entries (`/public/scenarios/`,
`/public/dashboard-config/`, `/public/observed/`) are untouched — these new
`demo-*` paths simply aren't matched by any existing pattern, so no
`.gitignore` edit is needed at all (confirmed: the existing patterns are
exact directory names, not a wildcard that would also catch `demo-scenarios`).

## `public/demo-scenarios/index.json`

```json
["activitysim-baseline", "activitysim-density-variant", "activitysim-transit-variant"]
```

Order is load-bearing: `activitysim-baseline` MUST be listed first (FR-006).

## `public/demo-dashboard-config/index.json`

```json
["dashboard-1-overview.yaml", "dashboard-2-destination-choice.yaml", "dashboard-3-transit-service.yaml"]
```

## CLI invocations (three, offline — not part of the shipped app)

```sh
wftdm-dashboard summarize \
  --input  <baseline raw output dir> \
  --config summarize.yaml \
  --output public/demo-scenarios/activitysim-baseline \
  --scenario-name activitysim-baseline \
  --display-name "ActivitySim Baseline"

wftdm-dashboard summarize \
  --input  <density-variant raw output dir> \
  --config summarize.yaml \
  --output public/demo-scenarios/activitysim-density-variant \
  --scenario-name activitysim-density-variant \
  --display-name "ActivitySim: TAZ 1 Density +40%" \
  --notes "TAZ 1 employment +40% (TOTEMP/RETEMPN/FPSEMPN/HEREMPN/OTHEMPN/AGREMPN/MWTEMPN)"

wftdm-dashboard summarize \
  --input  <transit-variant raw output dir> \
  --config summarize.yaml \
  --output public/demo-scenarios/activitysim-transit-variant \
  --scenario-name activitysim-transit-variant \
  --display-name "ActivitySim: AM/PM Transit Service Increase" \
  --notes "AM/PM WLK_LOC_WLK_TOTIVT x0.80, WLK_LOC_WLK_IWAIT x0.50"
```

Per `contracts/cli.md` (025-python-postprocessor), each invocation exits `0`
only once every metric Parquet file and `manifest.yaml` are written; exit
`1` on any `PostprocessorError` (naming the specific offending source/
metric/placeholder). All three MUST exit `0` for this feature to be
considered done.

## Additive TypeScript (existing files, per research.md #4)

`src/services/scenarioDiscovery.ts` — new function, called from
`discoverScenarios()`:

```ts
async function registerDemoScenarios(): Promise<void> {
  let names: string[]
  try {
    names = await fetchJSON<string[]>(`${base}demo-scenarios/index.json`)
  } catch {
    return
  }
  for (const name of names) {
    const folderUrl = `${base}demo-scenarios/${name}/summary`
    appState.register(name, { source: 'url', path: folderUrl })
    try {
      await registerSummaryFolder(folderUrl, name)
      appState.setStatus(name, 'ready')
    } catch (err) {
      console.warn(`scenarioDiscovery: failed to register demo scenario "${name}"`, err)
      appState.setStatus(name, 'failed')
    }
  }
}

export async function discoverScenarios(): Promise<void> {
  await registerObserved()
  await registerPublishedScenarios()
  await registerDemoScenarios()   // NEW — additive only
  applyURLParams()
}
```

`src/main.tsx` — a second `loadDashboards()` call, no signature change:

```ts
const dashboards = [
  ...(await loadDashboards()),
  ...(await loadDashboards(`${import.meta.env.BASE_URL}demo-dashboard-config/`)),
]
```

## Invariants this contract MUST preserve

- `registerObserved()` and `registerPublishedScenarios()` (existing) are
  called with **zero changes** to their own bodies or call signatures
  (FR-010).
- `loadDashboards()` (existing) is called with **zero changes** to its own
  body or signature (research.md #4) — only a second call site, with an
  explicit `baseUrl` argument its existing signature already supports.
- If `public/demo-scenarios/index.json`/`public/demo-dashboard-config/
  index.json` are absent (e.g. a fresh checkout that hasn't fetched this
  feature's content yet), both new code paths fail soft — mirroring
  `registerPublishedScenarios()`'s and `loadDashboards()`'s own existing
  fail-soft behavior for a missing `index.json` — never throwing out of
  `discoverScenarios()`/the boot sequence.

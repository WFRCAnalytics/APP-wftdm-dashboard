# Research: Graphic Walker Exploration Panel

Phase 0 output for `014-graphic-walker-panel`. Everything below was
confirmed against real sources (npm registry, GitHub, this repo's own
files) during `/speckit-specify`, not assumed — see `spec.md`'s own
"Research findings this spec relies on" section for the user-facing
summary. This file adds the implementation-facing detail spec.md
intentionally left out (constitution-consistent: spec.md stays
implementation-agnostic).

## §1. Grammar shape and config surface

`project-docs/GRAMMAR.md`'s `type: graphic-walker` section (confirmed, full text
read) documents exactly:

```yaml
- type:    graphic-walker
  title:   Free-form Visual Analytics
  dataset: trip_mode_share      # which scenario__* view to query
  limit:   100000               # row limit passed to DuckDB before handoff
  height:  700
  width:   1.0
```

No `metric:`, `filter:`, `fields:` key appears in the documented example.
Per spec.md FR-004/FR-007, this feature adds two keys beyond the
documented example, both optional and both consistent with this
project's existing config vocabulary rather than inventing new syntax:

- `scenario?: string` — same name/meaning every other `DataBoundPanelConfigBase`
  panel type already gives this key (pins to one scenario's view,
  bypassing the `$scenario.` union).
- `fields?: GraphicWalkerFieldOverride[]` — author override for the
  auto-inferred field schema (§5 below), one entry per column that needs
  correcting.

`GraphicWalkerPanelConfig` does **not** extend `DataBoundPanelConfigBase`
— that base type requires `metric: string`, but this grammar's dataset
key is `dataset`, a different name with the same role. Reusing
`DataBoundPanelConfigBase` and just renaming its field would force every
other panel type's `.metric` accessor pattern onto a type that doesn't
share it; extending `PanelConfigBase` directly (title/height/width) and
declaring `dataset`/`scenario`/`limit`/`fields` itself, the same
structural choice `MarkdownPanelConfig` already made for its own
not-a-`DataBoundPanelConfigBase` reason, is the precedent-consistent
shape (data-model.md).

## §2. Package: reality-checked, not recalled

Checked directly against the npm registry (`registry.npmjs.org`) and
GitHub (`github.com/Kanaries/graphic-walker`), version by version — not
the package's own prose changelog, which is incomplete for several
releases:

| Version | react peer range | Notes |
|---|---|---|
| `0.4.50`–`0.4.82` | `>=17.0.0 <19.0.0` | React-18-compatible |
| `0.4.83`+, `0.5.0`–`0.5.2` (current `latest`) | `>=19.0.0` | Not compatible with this project's React `^18.3.1` |

`v0.4.80...v0.4.82` diff (GitHub compare view, fetched directly): six
commits, including two named fixes — `fix: arc` (arc/pie-mark
rendering) and `fix: text stack` (text-mark stacking) — landing in that
range with **no** peer-dependency change. This project pins
**`@kanaries/graphic-walker ^0.4.82`**: the last React-18-compatible
release, and provably not the buggier of the two React-18-compatible
candidates considered (`0.4.80` was checked first and rejected once this
diff surfaced — spec.md's own Assumptions record why).

License: Apache-2.0 (both the `0.4.82` and current `0.5.2` manifests).
No `arquero` dependency in either. `vega-webgl-renderer` is present as a
dependency in both — confirmed via `package.json` `dependencies`, not
just changelog prose — but it is Vega's own opt-in high-density-point
renderer (§4).

**Residual, explicitly-not-fully-closed gap** (spec.md's own third
"verify empirically" item): the `0.5.x` line's full commit/changelog
history was not completely retrievable through automated fetches during
this research pass. What *is* confirmed: no peer-dependency-unrelated
breaking change was found in the reachable `0.4.82`→`0.5.0` history, and
the two real, named bug fixes found are both already included in
`0.4.82`. What remains open: an exhaustive feature-parity diff against
`0.5.x`. Implementation should watch for any chart type or interaction
this feature actually exercises that behaves differently or is missing
in `0.4.82`, and record a finding if one surfaces — not re-litigate the
version choice preemptively without cause.

## §3. Data-input API: the `<GraphicWalker>` React component, NOT `embedGraphicWalker` — reversed post-completion, real bug found

**This section's original conclusion was wrong and has been reversed.**
The original plan used `embedGraphicWalker` (matching `CLAUDE.md`'s/
`project-docs/ARCHITECTURE.md`'s own pre-existing sketch, "no React ownership
required"). Post-completion, asked directly whether `embedGraphicWalker`
exposes any disposal/cleanup handle, its real, unminified installed
source was read directly (`node_modules/@kanaries/graphic-walker/dist/
vanilla.js`, not the `.d.ts` — which types the return as `any` and is
uninformative here):

```js
export function embedGraphicWalker(dom, props = {}) {
  ...
  const root = ReactDOM.createRoot(dom)
  root.render(React.createElement(GraphicWalker, { themeKey: "g2", ...props }))
  return   // (or implicit undefined on the other code path)
}
```

`root` is a fully local `const` — never returned, never attached to
`dom`, never exposed anywhere. There is no way for any caller of this
public API to ever call `.unmount()` on the React root it creates. This
is a real, confirmed, meaningful risk, not a theoretical one: the
compiled bundle registers 38 real `document`/`window.addEventListener`
calls (`grep -c` against `graphic-walker.es.js`), most following the
standard React `useEffect`-cleanup-on-unmount idiom, plus a MobX
`VizSpecStore` (`makeAutoObservable`). None of that gets torn down when
our own outer container is merely removed from the DOM — removing a DOM
node does not, by itself, trigger a *different, independent* React
root's own unmount lifecycle, since our own app's React instance has no
awareness that a second root was ever created inside a node it owns.
This app's own `shell.tsx` mounts only the ACTIVE tab's
`DashboardRenderer` (confirmed by reading it) — every tab switch
genuinely mounts and unmounts every panel on the outgoing tab, including
any `graphic-walker` panel, making this a real, accumulating leak over
an ordinary session, not a one-time cost.

**Fixed** by rendering the plain `<GraphicWalker>` React component
directly as JSX inside `GraphicWalkerPanel.tsx`'s own tree instead.
`embedGraphicWalker`'s own source (just quoted) proves this is exactly
equivalent in rendered output once `data`/`fields` are provided — it
does nothing but that same `React.createElement(GraphicWalker, {
themeKey: "g2", ...props })` call, no additional wrapping — so the only
actual difference is disposal correctness: our own single, unified React
tree's normal unmount reconciliation now handles it, with no manual
cleanup call needed at all (confirmed: the full `graphicWalkerPanel.spec.ts`
suite, and `dashboardShell.spec.ts`, both pass unchanged against the new
component — the rendered DOM is identical, as the source predicted).

This also makes `embedGraphicWalker`'s own original rationale ("no React
ownership required... GW bundles its own React tree") the wrong
tradeoff for this specific app: that framing is true and fine for a
consumer with no React tree of its own to nest into, but this app
already has one, and nesting into it is what makes correct disposal
possible at all — `CLAUDE.md`'s/`project-docs/ARCHITECTURE.md`'s own
pre-existing sketch predates this finding and has been corrected to
match.

## §4. Rendering technology and the WebGL-context question

`GraphicWalker`'s default chart renderer is Vega-Lite, drawing via
`vega-embed` (SVG/Canvas). `vega-webgl-renderer` is a real dependency in
the package tree (confirmed in `0.4.82`'s own manifest, not only
`0.5.x`'s) — but it is Vega's own opt-in path for very-high-density point
rendering, not GraphicWalker's default. Nothing in this panel type holds
a persistent `WebGLRenderingContext` the way `maplibregl.Map`/
`MapboxOverlay` do — there is no mount-lifetime GL object requiring
`012-webgl-context-management`'s interleaved-mode/context-loss machinery,
and none of that machinery is reused here.

**Residual verification item** (spec.md's first "verify empirically"
item): confirm no code path in this feature's own usage (the chart types
a `trip_mode_share`-shaped dataset naturally produces — bar/line/point/
area) silently triggers the WebGL renderer. This is an implementation-
time check (inspect the DOM for a `<canvas>` with a WebGL context vs. an
`<svg>`), not something resolvable from package research alone.

## §5. Field-schema inference (DuckDB/Arrow type → `IMutField`)

`<GraphicWalker>`'s `fields` prop is functionally required input to the
library — it does not auto-infer from an empty array (confirmed: no
package documentation describes auto-inference; CLAUDE.md/ARCHITECTURE.md's
own original sketch passed `config.fields ?? []`, which only works if the
library tolerates an empty list gracefully — untested assumption in the
original sketch, not to be trusted at face value here). This feature
therefore performs its own inference, in application code, from the same
query result already being fetched — no second query.

`services/duckdb.ts`'s existing `queryArrow(sql)` (unmodified, already
used by no current panel type directly, but exported since `001`) returns
an Arrow `Table` whose `.schema.fields` carries each column's `apache-arrow`
`DataType` (`apache-arrow` `^18.0.0` is already a project dependency —
`package.json`, confirmed). Mapping, using that library's own type
predicates (`DataType.isInt`/`isFloat`/`isUtf8`/`isDate`/`isTimestamp`/
`isBool`, all real static members of Arrow JS's `DataType` — to be
confirmed directly against the installed version's own `.d.ts` at
implementation time, not assumed from memory of the API shape):

| Arrow type predicate | `semanticType` | `analyticType` |
|---|---|---|
| `isInt` / `isFloat` | `quantitative` | `measure` |
| `isUtf8` / `isDictionary` | `nominal` | `dimension` |
| `isDate` / `isTimestamp` | `temporal` | `dimension` |
| `isBool` | `nominal` | `dimension` |
| (anything else) | `nominal` | `dimension` (fail-soft default) |

Each inferred entry's `fid`/`name` is the column name verbatim. An
author-supplied `fields:` entry (keyed by `fid`) overrides the
corresponding inferred entry's `semanticType`/`analyticType` wholesale —
no partial-merge logic, matching how every other panel type's own
`columns:`/optional-override lists already work (`TableColumnConfig`,
`config.fields` here is the direct analogue).

The `scenario` discriminator column (§6, when a multi-scenario union is
in play) is inferred exactly like any other `Utf8` column — `nominal`/
`dimension` — no special-casing needed; it is just another column in the
query result by the time inference runs.

## §6. Scenario/dataset query construction — reusing the existing `$scenario` mechanism

`panelQuery.ts`'s existing `buildPanelQuery`/`resolveActiveScenarios` are
written specifically against `DataBoundPanelConfigBase` (`config.metric`,
`config.scenario`/`.scenarios`) and are not reused as-is (§1 — this
config type doesn't extend that base). Rather than duplicate
`sqlExpander.ts`'s private `expandScenario()` UNION-ALL construction
(`SELECT *, '<name>' AS scenario FROM "<name>__<x>" ... UNION ALL ...`),
this feature builds a **bare SQL template string** containing the exact
same `$scenario.<x>` placeholder every other panel type's template
already uses, and hands it to the same, unmodified `sqlExpander.expand()`
— literal reuse of the existing mechanism, not a parallel
reimplementation:

```ts
// panels/panelQuery.ts, new exported function
export function buildGraphicWalkerQuery(config: GraphicWalkerPanelConfig): string {
  const source = config.scenario
    ? `"${config.scenario}__${config.dataset}"`
    : `($scenario.${config.dataset})`
  return `SELECT * FROM ${source} LIMIT ${config.limit ?? 100000}`
}
```

`GraphicWalkerPanel.tsx` then calls
`sqlExpander.expand(template, EMPTY_SUMMARIZE_CONFIG, NOOP_FILTER_STATE, activeScenarioNames)`
— `activeScenarioNames` from the existing `useActiveScenarios()` hook
(`009-scenario-manager`, unmodified), `NOOP_FILTER_STATE` a trivial
`{ get: () => undefined }` object satisfying `FilterStateLike` (the
template this function builds never contains a `$filters.`/`$inputs.`
placeholder, so the stub is never actually consulted — same duck-typed
contract every other caller already relies on). This is exactly
`sqlExpander.ts`'s own already-existing `expandScenario()` internal
UNION-ALL logic running unmodified, satisfying spec.md's Assumption
("reuses this project's existing multi-scenario UNION ALL expansion...
not a new one") literally, at the code level, not merely in spirit.

## §7. Panel-card / expand-dialog fit — confirmed generic, no special-casing

Read `layout/panelCard.tsx` directly (unmodified by every panel-type
feature since `004`): it looks up `registry[config.type]`, wraps whatever
resolves in the same `Card`/`CardHeader`/`CardTitle`/`CardContent` shell
and the same `usePanelExpandHost` call every other type gets, passing
only `config.title` and `config.height` through — nothing type-specific.
`GraphicWalkerPanelConfig`'s own `height`/`width` (already part of
`PanelConfigBase`) flow through this exact same, already-generic path;
**no change to `panelCard.tsx` or `panelExpandHost.tsx` is needed** —
confirming spec.md's FR-008 default was correct, not merely assumed.

**Residual verification item, since resolved**: whether the mounted chart
content reflows cleanly when `usePanelExpandHost`'s persistent portal
node relocates between the inline card anchor and the dialog anchor (the
same non-remounting relocation mechanism `010-flowmap-panel`'s own
research already found necessary for a `maplibregl.Map`'s mount-lifetime
state — research.md §11 there). Confirmed empirically via
`graphicWalkerPanel.spec.ts`'s own expand/collapse tests: it does,
cleanly, with no explicit resize call needed (Vega-Lite's own
responsive-width handling) — true both for the original
`embedGraphicWalker` version and the `<GraphicWalker>` JSX version this
section now uses (§3's post-completion correction) — the relocation
mechanism itself never cared which mount strategy produced the DOM
subtree it relocates.

## §8. Fixture data — no new fixture needed

`tests/fixtures/generate.py` already writes a `trip_mode_share.parquet`
table into the `good` scenario fixture (confirmed: `write_parquet(...,
good_summary / "trip_mode_share.parquet", ...)`), the exact same dataset
name `project-docs/GRAMMAR.md`'s own worked example already uses. Unlike
`013-zonemap-panel` (this project's first-ever geometry fixture need),
this feature needs **no new fixture file and no `generate.py` change** —
the integration test panel binds `dataset: trip_mode_share` directly
against the existing fixture.

## §9. Build config — new chunk needed

`@kanaries/graphic-walker` pulls in `vega`/`vega-lite`/`vega-embed`,
`mobx`/`mobx-react-lite`, `@radix-ui/*`, `@headlessui/react`,
`styled-components`, and more — a large, previously-absent dependency
tree, the same situation `plotly`/`maplibre-gl` were in when they each
got their own `vite.config.ts` `manualChunks` entry (`003`, `010`).
`vite.config.ts`'s own existing comments already anticipate this exact
addition (CLAUDE.md's documented sketch: `if (id.includes('graphic-walker'))
return 'graphic-walker'`) — this feature makes that real.

## §10. Constitution/reference-implementation check

Constitution Principle VIII's MUST-copy reference list (`ar-puuk/
omx-viewer`, `WFRCAnalytics/APP-Commute-Explorer`, `ar-puuk/
spatial-sql-explorer`, `ar-puuk/parquet-viewer`,
`WFRCAnalytics/APP-WFRC-Commute-Patterns`) covers DuckDB-WASM/Arrow
wiring, MapLibre/deck.gl overlays, and spatial-SQL/GeoParquet handling —
none of which this feature touches (no new DuckDB wiring beyond an
already-existing `queryArrow()` call, no map, no geometry). No reference
implementation applies; this section is genuinely N/A, not skipped.

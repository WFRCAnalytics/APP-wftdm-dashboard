# Diagnostic Results: 016-fix-ugrc-dark-mode

Recorded per `contracts/diagnostic-protocol.md` / `research.md` §5. One
entry per step, in execution order. Do not re-run a step already
recorded here.

## Step 0 — Extension check (already done, prior to this feature's planning)

- **Browser**: Edge, fresh Incognito window (extensions disabled by
  default; none explicitly allowed to run in Incognito for this
  profile)
- **Condition**: OS dark mode active
- **Result**: Corruption **still reproduced**.
- **Conclusion**: A browser extension is **ruled out** as the cause.
  Per research.md §3a, this does NOT clear step 2 (`#enable-force-dark`
  flag) or step 3 (OS-level color filter) — Incognito disables
  extensions only.

## Step 1 — Real-hardware `color-scheme` isolation (T002)

- **Environment**: real, hardware-accelerated WebGL — the same machine/
  browser where the defect is confirmed
- **Artifact**: the standalone, zero-app-code HTML artifact (MapLibre
  from CDN, the real composeStyles()-equivalent merge, the real UGRC
  endpoints) built during the same-day investigation
- **Sub-step 1 — `color-scheme` absent entirely**: renders correctly.
- **Sub-step 2 — `color-scheme: dark` set on an ancestor of the
  canvas**: **reproduces the corruption.**
- **Sub-step 3 — `color-scheme: light` override on that same
  ancestor**: renders correctly again.
- **Conclusion**: `color-scheme` is confirmed, on real hardware, as the
  actual causal mechanism — the one variable that, isolated, both
  turns the corruption on and off. This is the first test in this
  investigation's history run in an environment actually capable of
  showing the defect (research.md §2), and it is conclusive.

## Step 2 — Chromium force-dark flag

**Status**: Not run — not needed. Per research.md §5 step 1's own
instruction, a positive result at step 1 stops the protocol here; the
external-mechanism family (already downgraded, §3a) is moot once a
real, in-app, code-fixable cause is confirmed.

## Step 3 — OS-level color filter

**Status**: Not run — not needed, same reason as Step 2.

## T007 — real-hardware verification of the SHIPPED fix (in-app, not the standalone artifact)

**Result: FAILED.** With `.maplibregl-canvas { color-scheme: light; }` live in
`src/panels/mapControls.css` and the dev server rebuilt/reloaded, the user
confirmed on real hardware: every other panel works correctly in dark
mode, but **both `Flowmap UGRC Composition` and `Flowmap UGRC Outdoors
Composition` still render broken in dark mode.**

This is a real, serious discrepancy, not a minor detail: Step 1's
standalone artifact test isolated `color-scheme` as the variable that
turns the corruption on and off — three-for-three, both directions.
The identical CSS mechanism, applied to the identical class MapLibre
gives its own canvas in the real app, does **not** clear the same two
panels.

## Follow-up 1 — confirm the rule is actually taking effect

Selected the real `Flowmap UGRC Composition` panel's actual
`.maplibregl-canvas` element directly (verified by `className` output,
not guessed) and read its computed style:

```
canvas.className        → "maplibregl-canvas"   (confirmed correct element)
getComputedStyle(canvas).colorScheme → "light"   (rule IS applying)
```

Rules out a selector/specificity/build bug — the fix is live and taking
effect exactly as written, on exactly the right element. It's applying
and not being the actual lever, not "failing to apply."

## Follow-up 2 — live root-level toggle (inconclusive by design, see below)

```js
document.documentElement.style.setProperty('color-scheme', 'light')
```
run live, after the page/map/WebGL context already existed — panel
**still broken**. Not treated as conclusive on its own: if the
browser's relevant color-management decision is made once, at WebGL
context creation time, a live post-load change could never show
anything regardless of whether root-scoping is the right lever. Ruled
this ambiguity out with Follow-up 3.

## Follow-up 3 — root-scoped, static, present from page load (the conclusive test)

Temporarily removed `.dark`'s `color-scheme: dark;` in `tokens.css`
(leaving `:root`'s `color-scheme: light;` to win the cascade unopposed
while `.dark` otherwise stayed fully active) AND temporarily disabled
the canvas-scoped rule in `mapControls.css`, matching how the
standalone artifact itself was tested — present from the very first
paint, real hard reload, not a live DOM mutation. Real hardware, dark
mode from load.

**Result: still broken.** Both panels rendered exactly as broken as
before. This is the cleanest test run — same rigor as the artifact's
own confirmed-causal test — and still shows no effect.

**Conclusion: `color-scheme` is ruled out as the cause of the real,
in-app defect**, across three real-hardware variants (canvas-scoped/
static, root-scoped/live, root-scoped/static), the last of which
matches the artifact's own test discipline exactly and still failed.
Both temporary edits (`mapControls.css`, `tokens.css`) have been
reverted — confirmed via `git diff tokens.css` showing zero net change.
See `research.md` §7 for the new working theory (deck.gl `MapboxOverlay`/
`FlowmapLayer` interleaved rendering — a real, confirmed architectural
difference between the standalone artifact, which has none of it, and
every real flowmap panel in this app, which all render through it) and
the standing, not-yet-confirmed-significant observation that no
zonemap panel (pure MapLibre, no deck.gl at all) has ever been reported
broken.

## Follow-up 4 — deck.gl interleaved-rendering source review + missing `background` layer causation test (LIVE FIX CONFIRMED)

Read `@deck.gl/mapbox`'s real, installed source directly (`node_modules/
@deck.gl/mapbox/dist/{deck-utils,mapbox-overlay}.js`), not assumed:
`_onAddInterleaved()` grabs MapLibre's own already-created WebGL context
directly (`map.painter.context.gl`) and hands it to `new Deck({ gl,
... })` — no separate canvas, no color-scheme/colorSpace-aware code
anywhere in deck.gl's own interleaved-mode source. This weakens (not
strengthens) any theory that deck.gl itself reads/reacts to
`color-scheme` — consistent with `color-scheme` already being ruled
out above.

Separately confirmed, directly in `maplibre-gl`'s installed bundle: its
WebGL context is created with `alpha: true` (`{alpha:!0,stencil:!0,
depth:!0,...}`) — the canvas has a real, present alpha channel.
Web research surfaced two directly relevant, real, cited sources:

- MapLibre's own documentation: avoiding visual artifacts from
  transparent/semi-transparent backgrounds requires "having the first
  layer be a `background` layer with a `background-color`"
  ([maplibre/maplibre-gl-js#4036](https://github.com/maplibre/maplibre-gl-js/issues/4036)).
- ["Opacity blending without background causing colours to darken"
  (maplibre-native#3125)](https://github.com/maplibre/maplibre-native/issues/3125) —
  transparent regions get composited as if blended toward black when no
  explicit `background` layer exists beneath them.

This connects directly to something **already confirmed in this app's
own existing test suite**: the UGRC composition's own regression test
(`flowmapPanel.spec.ts`, `011-basemap-style-system — US3`) already
asserts `expect(style.layers.map(l => l.id)).not.toContain('background')`
— the UGRC composition genuinely has NO `background` layer.
`carto-dark-matter`/other never-reported-broken presets DO ship their
own (per `research.md`'s own prior finding on `BLANK_STYLE_LAYER_IDS`).
Every reported-broken panel lacks a background layer; every unaffected
one has one.

**Live causation test, real hardware, no reload** (the app exposes
`window.__flowmapTestMaps` unconditionally, not test-only):

```js
const map = window.__flowmapTestMaps['Flowmap UGRC Composition'];
const firstLayerId = map.getStyle().layers[0].id;
map.addLayer({ id: 'test-bg-fix', type: 'background', paint: { 'background-color': '#ffffff' } }, firstLayerId);
```

**Result: CONFIRMED FIXED.** Adding an opaque white `background` layer
as the bottom-most layer, live, immediately corrected `Flowmap UGRC
Composition`'s dark-mode rendering. This is the first genuinely
positive, causal, real-hardware result in this entire investigation —
not a rule-out.

**Confirmed on the second panel too** (`Flowmap UGRC Outdoors
Composition`, same live test, real hardware) — also fixed. Both
reported-broken panels, both fixed by the identical mechanism. Root
cause confirmed: missing `background` layer, not `color-scheme`, not
deck.gl.

**Why this is dark-mode-specific even though the underlying rendering
defect isn't theme-dependent at all**: the missing-background alpha-
blend-toward-black artifact (per the cited MapLibre issues) is present
in BOTH themes — it was never actually a dark-mode-only defect. In
light mode, a subtle blend-toward-black at antialiasing/tile-join gaps
on an already-mostly-light basemap reads as ordinary anti-aliasing —
invisible. In dark mode, against this app's own dark page chrome, the
exact same underlying defect becomes visually obvious. This resolves
the light-vs-dark asymmetry without needing dark mode itself to be
causally involved — consistent with why every `color-scheme`/theme-CSS
hypothesis tested came back negative: theme was never the lever, only
the thing that made a pre-existing, theme-independent rendering defect
visible or not.

## Fix Branch Decision

**RESOLVED — `branch-e-missing-background-layer` — root cause found,
confirmed live on real hardware on BOTH reported-broken panels, and
implemented.**

`branch-a-scoped-css` (`color-scheme`) is withdrawn — ruled out across
three real-hardware tests (above). The actual cause: `composeStyles()`
(`src/panels/basemap/loadBasemapStyle.ts`) never guaranteed a
`background`-typed layer in its output, and neither real UGRC service
(LiteBase/LiteLabels, OutdoorsBase/Outdoors_Labels) provides one of its
own — already indirectly confirmed by this app's own pre-existing test
suite (`not.toContain('background')`, `011-basemap-style-system`'s own
UGRC composition test). MapLibre's own documentation and a directly
matching real issue (cited in the Follow-up 4 entry above) describe
exactly this failure mode: without an explicit `background` layer,
alpha-blended regions of the canvas composite incorrectly ("as if
blended with black"). This was never actually dark-mode-specific — the
same underlying rendering defect is present in both themes; it only
became visually obvious against this app's own dark page chrome, while
the identical defect against an already-light page/basemap in light
mode reads as unremarkable anti-aliasing.

**Implemented**: `composeStyles()` now injects an opaque
`background`-typed layer (`{ id: 'background', type: 'background',
paint: { 'background-color': '#ffffff' } }`) at the bottom of the
composed stack whenever none of the composed layers already provides
one (checked by `type`, not `id`, so a real author's own namespaced
background — e.g. `layer0__background` — is respected and never
double-covered). General across every current and future composition
with the same gap, not scoped to these two panels by name or title
(FR-010). `tests/unit/loadBasemapStyle.test.ts` and
`tests/integration/flowmapPanel.spec.ts` both updated/extended to
cover the new behavior and the skip-when-already-present case; full
regression suite (`flowmapPanel.spec.ts` + `zonemapPanel.spec.ts`, 59
tests) and the full unit suite (209 tests) both pass; `npm run build`
clean.

## T007/T009/T012 — real-hardware confirmation of the SHIPPED fix (final)

**Result: CONFIRMED, all three.** On the same real hardware, a genuine
hard reload of the app (not the live console patch used above to
confirm causation) with the shipped `composeStyles()` fix in place,
dark mode active from load:

- **T007**: both `Flowmap UGRC Composition` and `Flowmap UGRC Outdoors
  Composition` render correctly in dark mode; light mode remains
  unaffected (FR-003).
- **T009**: both panels' surrounding chrome — card background, heading
  text, zoom/compass NavigationControl styling — remains dark-themed,
  unregressed (FR-006).
- **T012**: spot-checked another flowmap panel and a zonemap panel in
  dark mode — no new corruption introduced (FR-007).

This closes the gap the live console patches (Follow-up 4) couldn't:
those proved causation on an already-running page, not that the
persisted, shipped fix works from a genuine page load. Both are now
confirmed. SC-001 and SC-004 are satisfied on real hardware (SC-002
already satisfied via the automated suite, T010). This feature's
investigation and verification are complete.

Evidence (SC-003): the three-sub-step isolation test in Step 1,
reproducing and clearing the corruption purely by toggling
`color-scheme`'s computed value on the canvas's ancestor, on real
hardware, with every other variable held constant. Implementation:
`contracts/map-canvas-color-scheme-scope.md` — a scoped
`color-scheme: light` rule on MapLibre's own `.maplibregl-canvas`
class, general across every map panel (FR-010), leaving `tokens.css`'s
`:root`/`.dark` declarations untouched everywhere else (FR-005).

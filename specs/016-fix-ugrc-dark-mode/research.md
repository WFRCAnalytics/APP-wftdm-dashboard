# Phase 0 Research: Fix UGRC map compositions rendering incorrectly in dark mode

## §1. Confirmed facts carried forward (not re-investigated)

Per the feature spec's own instruction, these are treated as established:

- Deterministic and reproducible on real hardware-accelerated WebGL
  (NVIDIA Quadro RTX 4000, current driver), cross-browser (Chromium AND
  Firefox).
- **Never reproduces under Playwright's own SwiftShader software
  rendering** — zero exceptions observed across five investigation
  rounds.
- Ruled out with direct evidence: app-level CSS filters/opacity/
  mixBlendMode/stacking on the canvas and its full ancestor chain; any
  global `invert()`/`hue-rotate()` CSS rule (none exists anywhere in the
  codebase — the only `invert()` rule in the app is the NavigationControl
  icon fix, scoped to three specific icon classes); `setStyle()`
  re-application on theme switch (zero calls confirmed via
  instrumentation — FR-011 from `011-basemap-style-system` is working
  correctly); `composeStyles()` itself (confirmed theme-blind — no branch
  reads `color-scheme` or any theme state; produces byte-identical style
  data regardless of theme).
- `color-scheme` tested as an isolated variable, twice, both times inside
  the app itself with the real theme toggle: fully removed from both
  `:root` and `.dark` (resolves to `normal`) — no difference; removed
  from `.dark` only, leaving `.dark`'s class active while `:root`'s
  `color-scheme: light` wins the cascade unopposed (computed value
  confirmed `"light"` via `getComputedStyle`) — still no difference. Both
  UGRC panels rendered correctly in every one of these conditions.

## §2. The methodological gap this plan exists to close

Every rule-out test in §1 that touched CSS state (`color-scheme`,
filters, stacking) ran inside this project's own Playwright suite, which
launches Chromium/Firefox via SwiftShader. Per the confirmed fact above —
**the defect never reproduces under SwiftShader, full stop** — those
tests were run in an environment where nothing was broken *to begin
with*, regardless of what `color-scheme` was set to. A test that measures
"does removing `color-scheme` change the (already-correct) rendering in
an environment where the bug can't occur" cannot confirm or deny
`color-scheme`'s role in the *real*, hardware-triggered defect. Those two
rounds are honestly reported as inconclusive on the actual question, not
as a rule-out — this is a correction to how the prior session's own
findings should be weighted, not a new claim.

This reframes the investigation: further CSS-hypothesis testing inside
Playwright is not a productive next step (§2 of the feature spec's own
research requirements already anticipated this — "confirm or rule out
... with a genuinely isolated test," which by construction requires an
environment where the defect *can* occur). The isolated `color-scheme`
test still needs to happen — just on real hardware, not SwiftShader (see
§5's protocol).

## §3. New leading hypothesis: a browser- or extension-level forced/auto dark-mode feature, not this app's own code

Web research (search results and one direct source fetch, cited below)
surfaced a well-documented class of mechanism that fits every confirmed
fact in §1 better than any in-app CSS mechanism does:

**Chromium ships a real, user-facing "Auto Dark Mode for Web Contents"
feature** (`chrome://flags/#enable-force-dark` in Chrome; the same flag,
`edge://flags/#enable-force-dark`, in Edge — also Chromium-based), which
heuristically inverts/adjusts the colors of web page content it judges to
be "light-themed," running as a post-render compositor pass — entirely
outside this app's own DOM/CSS, and therefore invisible to every
`getComputedStyle()`/DevTools check the prior investigation rounds
performed. A real user report on Microsoft's own support forum
([Microsoft Q&A / Edge Insider Discussions, "Broken dark mode and
inverted colors"](https://techcommunity.microsoft.com/discussions/edgeinsiderdiscussions/broken-dark-mode-and-inverted-colors/3496309))
confirms this exact feature causes exactly this symptom — the reporter
traces it directly to `#enable-force-dark`, describing corrupted/
inverted colors across images, video thumbnails, and page UI, with a
partial mitigation ("Enabled with selective inversion of non-image
elements") that still doesn't fully resolve it. This is a real,
documented, currently-open class of bug in Chromium's own force-dark
heuristics, not a one-off.

Why this fits better than every hypothesis tested so far:

| Confirmed fact | In-app CSS hypothesis (tested, inconclusive/ruled out) | Browser/extension force-dark hypothesis |
|---|---|---|
| Never reproduces under Playwright/SwiftShader | Doesn't explain it — Playwright still applies the same page CSS | **Explains it directly** — Playwright launches a clean, extension-free profile with this flag off by default; nothing in this app's CSS/DOM changes between environments, but the compositor-level feature simply isn't present |
| Reproduces on Chromium AND Firefox | Doesn't distinguish — same CSS runs in both | Chromium's `#enable-force-dark` is Chromium-only (confirmed — Firefox has no built-in equivalent; see below), so a **pure browser-extension** (e.g. Dark Reader, installed in both browser profiles) fits the cross-browser spread better than the Chromium-only flag alone does |
| Only two specific, real-content vector-tile compositions are affected, not every basemap | No mechanism in `composeStyles()`/CSS to selectively target two panels | Force-dark features apply **per-element heuristics** (image/video/canvas exemptions, page-lightness detection) — a light-colored vector basemap (UGRC's Lite/Outdoors styles) is exactly the kind of "light, photo-like" content such heuristics target; an already-dark preset (`carto-dark-matter`) would not trigger the same heuristic, which is consistent with no report of it being affected |
| CSS `filter: invert()` was confirmed absent from the DOM (Round 3) | N/A (this rules out an in-app trick, correctly) | **Not contradicted** — a compositor-level force-dark pass runs after layout/paint, outside the DOM's own `filter` property entirely; a DOM-level check was never capable of seeing it |
| The `color-scheme` standalone-artifact test appeared to show a correlation | Never re-confirmed as the sole isolated variable | Several real force-dark implementations use a page's declared `color-scheme`/`meta name="color-scheme"` as one heuristic signal for "does this site already support dark mode, or should I intervene?" — toggling `color-scheme` in that artifact may have changed the *feature's own decision to intervene*, not the map's fundamental rendering — the same observed effect, a different mechanism at the CSS-value boundary |

Confirmed directly (not assumed): Firefox does not ship a built-in
equivalent to Chromium's `#enable-force-dark` (per Mozilla's own Nightly-
only, opt-in "Colors > Override" experiment and the ecosystem of
third-party Firefox extensions like Dark Reader / "Force Dark Mode" /
"Dark Mode Everywhere" that exist specifically because Firefox has no
stock feature for this). This means the cross-browser reproduction is
better explained by something that spans both browser profiles
independently of either browser's own built-in feature set — most
plausibly a browser extension installed in both profiles, or an
OS-level mechanism — than by Chromium's flag alone, which is Chromium-
specific.

A pure OS-level, whole-screen color filter (Windows 11 Settings →
Accessibility → Color filters; a DWM-level compositor effect) was also
considered and is judged a weaker fit: it inverts the entire visible
desktop uniformly, with no per-element granularity, which does not
explain why only two specific panels are reported as broken while
everything else on the same page (other basemap panels, Plotly panels,
app chrome) renders correctly. It is not ruled out outright — see the
diagnostic protocol below, which checks it alongside the leading
hypothesis — but the per-element force-dark/extension hypothesis fits
the "only these two panels" fact strictly better.

### §3a. Post-test reassessment — the extension explanation is now excluded, and this downgrades the whole hypothesis family

**A real test has already been run this session**, not merely proposed:
Edge, Incognito window (extensions disabled by default and confirmed
none were explicitly allowed to run there), OS dark mode active — the
corruption still reproduced. This conclusively rules out a browser
extension as the cause. It does **not** rule out `chrome://flags/
#enable-force-dark` or an OS-level color filter — Incognito/InPrivate
disables extensions specifically; it has no effect on either of those
(a `chrome://flags` value is a per-profile browser setting, not
extension state, and persists into Incognito; an OS-level filter is
entirely outside the browser). Those two remain genuinely untested.

But their own explanatory power needs to be honestly re-scored now that
the strongest candidate (extension) is gone, because each of the two
survivors has a real gap this research document already identified
elsewhere but hadn't yet connected to this specific question:

- **`#enable-force-dark`**: fits the per-element/"only two panels"
  fact well, but — as §3's own table already states — is Chromium-only.
  It cannot, by itself, explain the confirmed Firefox reproduction
  (Firefox has no built-in equivalent, and there's no evidence anyone
  independently configured Firefox's own `about:config` override to
  match). For this to be the actual, complete explanation, it would
  need to be true BY COINCIDENCE that a second, different mechanism
  independently causes the identical-looking symptom in Firefox — an
  increasingly strained reading, not a clean single-cause explanation.
- **OS-level color filter**: fits the cross-browser fact well (it's
  outside any browser entirely), but — as §3's own table already
  states — a DWM-level filter has no per-element granularity; it would
  invert the entire visible desktop, not two specific map panels while
  every other panel and all app chrome on the same page renders
  correctly. No evidence has been offered that anything else on screen
  is affected.

**Neither remaining candidate in the "external mechanism" family
explains the full set of confirmed facts on its own** — each explains
one axis (Chromium-only heuristic vs. cross-browser reach) at the cost
of failing the other axis this same document already flagged as a
requirement. This is a real weakness in the hypothesis family as a
whole, not just an open question about which specific candidate it is.
Both are still cheap to check and worth closing out for completeness
(§5 below), but neither should be treated as the leading explanation
anymore. The one genuinely unexplored hypothesis that hasn't hit an
explanatory gap like this is `color-scheme`, isolated on real hardware
(§6) — it was never actually tested in an environment capable of
showing the defect (§2), so "inconclusive" is a categorically different
status than "tested and doesn't fully fit," which is where both
external-mechanism survivors now sit. §7's decision table is reordered
accordingly.

## §4. Why this is not something `composeStyles()` or app CSS can be blamed for, if confirmed

If §3 is confirmed, there is genuinely no root-cause fix available in
this codebase — the mechanism runs after this app's own rendering is
complete, in the browser's own compositor or in third-party extension
code neither this app nor its maintainers control. This is not a
reason to stop investigating (the spec's research requirements are not
satisfied by a guess), but it does mean the diagnostic protocol in §5 is
the actual deliverable of Phase 0 research for this branch — a fast,
cheap, human-executable check that either confirms this (closing the
investigation with a real, cited external cause and no code change
needed or possible) or rules it out (in which case §6's still-untested
real-hardware `color-scheme` isolation becomes the next step).

## §5. Diagnostic protocol (human-executed, real hardware — cannot be automated in this repo's CI)

Reordered per §3a: the genuinely unexplored, potentially-conclusive test
(`color-scheme` on real hardware) now runs first, ahead of the two
external-mechanism checks that remain technically untested but are
already known to each have an explanatory gap. Total remaining time:
under five minutes. Report back the outcome of each numbered step.

0. **Already done, this session — not a pending step.** Edge, fresh
   Incognito window (extensions disabled, none explicitly allowed for
   that profile), OS dark mode active: **the corruption still
   reproduced.** This conclusively rules out a browser extension as the
   cause (§3a) — do not re-run this check. It does NOT clear step 2 or
   step 3 below (Incognito disables extensions only; it carries a
   profile's `chrome://flags` values through unchanged, and has no
   effect on anything outside the browser).
1. **Real-hardware `color-scheme` isolation** (promoted from former
   §6 — run this first): using the SAME standalone artifact built
   during the same-day investigation (MapLibre from CDN, the real UGRC
   endpoints, no app code), on the SAME real-hardware machine/browser
   where the defect is confirmed:
   1. Load the artifact with `color-scheme` absent entirely — confirm
      correct rendering (expected: yes, this is effectively "light
      mode").
   2. Set `color-scheme: dark` on an ancestor of the canvas, reload,
      observe.
   3. Set `color-scheme: light` on that same ancestor (overriding a
      `dark`-valued parent), reload, observe.
   This repeats the same variable-isolation discipline as the two
   in-app tests already run (research.md §1), but on hardware where the
   defect can actually occur — its result is conclusive in a way those
   two rounds were not (§2).
   - **If it reproduces**: `color-scheme` is confirmed as the real,
     hardware-triggered mechanism. Stop here — proceed straight to
     Branch A (§7). Steps 2–3 below are no longer needed; the
     external-mechanism family is moot once a real, in-app,
     code-fixable cause is confirmed.
   - **If it does NOT reproduce even here**: the isolated-artifact
     "reproduction" reported same-day was very likely a real-hardware
     GPU/driver-specific WebGL rendering artifact coincidentally
     observed in temporal proximity to a `color-scheme` change, not
     caused by it. Proceed to step 2 to close out the remaining
     (already-downgraded, §3a) external-mechanism candidates for
     completeness before falling back to Branch C.
2. **Check Chromium's own force-dark flag** (Chromium/Edge only —
   cheapest remaining check, no relaunch of anything but the browser
   itself): navigate to `chrome://flags/#enable-force-dark` (or
   `edge://flags/#enable-force-dark`) and confirm whether it is set to
   anything other than "Default." If enabled, set it to "Disabled,"
   relaunch, and re-test. Report the flag's prior value and whether
   disabling it fixes the panels. Per §3a, even a positive result here
   only explains the Chromium side — if this fixes Edge/Chrome but the
   defect independently reproduces in Firefox too (as already
   confirmed it does), this is at best a partial, coincidental
   explanation, not the complete cause; note that explicitly rather
   than treating a Chromium-side fix as closing the investigation.
3. **Check for an OS-level color filter** (only if step 2 found
   nothing): Windows Settings → Accessibility → Color filters — confirm
   whether a filter is currently turned on, and separately, whether the
   Win+Ctrl+C color-filter toggle shortcut is bound and possibly
   triggered accidentally. If one is active, turn it off and re-test.
   Report the result. Per §3a, this is the weaker-fit candidate (no
   per-element granularity — would be expected to affect the whole
   screen, not two specific panels) — check it for completeness, not
   because it's likely.
4. **If steps 1–3 all find nothing**: report that plainly. The entire
   "external mechanism" hypothesis family (§3, §3a) is now closed out —
   ruled out to the extent it's testable, and already established as
   unable to fully explain the confirmed facts even before testing.
   Branch C (the FR-008 fallback) is the only remaining path, since
   there is no further named, testable hypothesis left in the feature
   spec's own research requirements at that point.

## §6. *(folded into §5 step 1 above — kept as a heading only for continuity with earlier drafts of this document; see §5.)*

## §7. Decision summary feeding Phase 1

**Outcome, UPDATED (recorded, `diagnostic-results.md`) — `color-scheme`
RULED OUT on real hardware.** §5 step 1's standalone-artifact test
cleanly isolated `color-scheme` as causal (3/3, both directions) —
but that result did NOT transfer to the real, in-app defect. Three
real-hardware variants of a `color-scheme` fix were each implemented,
each confirmed actually applying (`getComputedStyle`), and each left
both panels exactly as broken as before:

1. Canvas-scoped (`.maplibregl-canvas { color-scheme: light }`,
   `mapControls.css`), static, present from page load — T007 failed.
2. Root-scoped (`document.documentElement.style.setProperty(...)`),
   live, applied after the page and map were already loaded — failed
   (though this variant alone is not fully conclusive on its own, since
   a context-creation-time-locked effect could make ANY live change
   appear to fail regardless of scoping).
3. Root-scoped, static, present from page load (`tokens.css`'s `.dark`
   `color-scheme: dark;` temporarily removed, matching how the
   standalone artifact itself was tested) — failed. This is the
   cleanest, most conclusive of the three: same rigor as the artifact
   test, still no effect.

**New working theory, not yet tested**: the standalone artifact (per
its own description — "MapLibre from CDN, the real composeStyles()-
equivalent merge, the real UGRC endpoints") includes no deck.gl/
`MapboxOverlay`/`FlowmapLayer` at all — a plain MapLibre map. Every
real flowmap panel in this app, including both UGRC panels, renders
through deck.gl's `MapboxOverlay` in `interleaved: true` mode
(`012-webgl-context-management`) — FlowmapLayer draws into the SAME
canvas/GL context MapLibre owns, but via a genuinely different
rendering pipeline. This is a real, confirmed architectural difference
between the artifact and every real panel that showed this bug, not a
guess: the artifact's own `color-scheme`-driven effect is very likely
real, but a DIFFERENT phenomenon than the one actually reported —
coincidentally similar-looking, not the same root cause. Also notable,
not yet confirmed as significant: `ZoneMapPanel` is "deliberately pure
MapLibre — no `MapboxOverlay`/deck.gl at all" (`CLAUDE.md`), and no
zonemap panel has been reported broken in dark mode by the user at any
point in this investigation — consistent with (not proof of) the
deck.gl-interleaved-rendering theory, since every reported-broken panel
is a flowmap panel and no pure-MapLibre panel has ever been reported
broken.

`branch-a-scoped-css` is **withdrawn** — no `color-scheme` fix remains
in the codebase (`mapControls.css`/`tokens.css` both reverted to their
pre-016 state, confirmed via `git diff`).

## §8. Root cause found and fixed — `branch-e-missing-background-layer`

Reading `@deck.gl/mapbox`'s real, installed interleaved-mode source
directly found no color-scheme-aware code at all (it reuses MapLibre's
own already-created WebGL context verbatim, `map.painter.context.gl`)
— weakening, not strengthening, the deck.gl-interleaved theory as
originally framed in §7 above. Separately, MapLibre's own WebGL context
is confirmed created with `alpha: true`. Web research from that thread
surfaced two directly relevant, real, cited sources:

- MapLibre's own documentation: avoiding visual artifacts from
  transparent/semi-transparent backgrounds requires "having the first
  layer be a `background` layer with a `background-color`"
  ([maplibre/maplibre-gl-js#4036](https://github.com/maplibre/maplibre-gl-js/issues/4036)).
- ["Opacity blending without background causing colours to darken"
  (maplibre-native#3125)](https://github.com/maplibre/maplibre-native/issues/3125) —
  transparent regions composite as if blended toward black without an
  explicit `background` layer beneath them.

This connects directly to something already confirmed in this app's
own pre-existing test suite: the UGRC composition's own regression test
already asserted `not.toContain('background')` — the composition
genuinely has no `background` layer, unlike `carto-dark-matter`/other
never-reported-broken presets (which ship their own, per the earlier
`BLANK_STYLE_LAYER_IDS` finding).

**Live, real-hardware causation test** (`window.__flowmapTestMaps`,
exposed unconditionally, not test-only): manually adding an opaque
white `background` layer to the ALREADY-RUNNING, already-broken map
instance, no reload, immediately corrected the rendering — confirmed
on BOTH `Flowmap UGRC Composition` and `Flowmap UGRC Outdoors
Composition` independently.

**Why dark-mode-specific, even though the defect itself isn't
theme-dependent**: the missing-background blend-toward-black artifact
is present in both themes. Against an already-light page/basemap in
light mode, it reads as unremarkable anti-aliasing — invisible. Against
this app's own dark page chrome in dark mode, the identical defect
becomes visually obvious. This is why every CSS/theme-property
hypothesis (§1–§7) came back negative: theme was never the causal
lever, only what made a pre-existing, theme-independent rendering
defect visible or not.

**Fix implemented**: `composeStyles()` (`loadBasemapStyle.ts`) now
injects `{ id: 'background', type: 'background', paint: {
'background-color': '#ffffff' } }` at the bottom of the composed
layer stack whenever none of the composed layers already provides one
(checked by `type`, not `id` — a real author's own namespaced
background, e.g. `layer0__background`, is respected). General across
every composition with this gap (FR-010), not scoped to these two
panels. See `diagnostic-results.md`'s Fix Branch Decision for full
verification status.


| Diagnostic outcome | Fix branch | Where |
|---|---|---|
| §5 step 1 confirms `color-scheme` on real hardware | **Branch A** — scope `color-scheme: light` (or `normal`) onto `.maplibregl-canvas`/`.maplibregl-map` in `mapControls.css`, general across every map panel, preserving the existing `:root`/`.dark` declarations everywhere else (FR-005, FR-010) | `contracts/map-canvas-color-scheme-scope.md`, quickstart.md Scenario 2 |
| §5 step 2 or 3 confirms a flag/OS mechanism, DESPITE §3a's identified explanatory gap (e.g., a second, independent cause happens to affect Firefox too) | **No code fix exists or is possible** — document the finding (SC-003) INCLUDING the gap it doesn't explain, close the investigation, advise the affected user to exclude this app's origin from the responsible flag/filter | `contracts/diagnostic-protocol.md`, quickstart.md Scenario 1 |
| §5 steps 1–3 all find nothing (the expected outcome, per §3a's reassessment) | **Branch C** — the FR-008 fallback: disable theme-reactivity for exactly these two panels' map-tile rendering (a named, narrow exception read in `FlowMapPanel.tsx`'s existing basemap-application effect), matching the precedent set by the VectorHillshade PBF-encoding issue (`tests/fixtures/dashboard-config/dashboard-3-basemaps.yaml` — a real, external, documented incompatibility accepted and narrowly scoped around, not silently worked around) | quickstart.md Scenario 3 |

`tasks.md` (next command, `/speckit-tasks`) will sequence these as
gated, human-checkpoint-driven tasks — §5 step 1 (real-hardware
`color-scheme` isolation) runs first, step 0's extension rule-out is
recorded as already-satisfied input (not a task), and only the branch
the full protocol's outcome selects gets implemented.

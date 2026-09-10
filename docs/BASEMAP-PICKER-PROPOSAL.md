# Basemap Tab Picker — UX Reconsideration (Research + Proposal Only)

**Status: research + proposal only. No code was changed to produce this document.** Everything below is for review and discussion; adopting any part of it is a separate, later `/speckit-specify`-sized decision (per-item, not all-or-nothing). Every "Do not" rule in `CLAUDE.md`, every already-shipped feature (`020`/`021`/`024`/`033`/`034`), and every rule in the `wftdm-design-system` skill remains in force until that decision is made.

**Date:** 2026-09-10
**Scope:** the Settings modal's **Basemap tab only** (`src/layout/settings/basemapTab.tsx` + the `panels/basemap/` registry it reads). Not the map panels themselves, not the resolution precedence chain (`resolveEffectiveBasemap.ts`), not `state/basemapState.ts`. This mirrors the `docs/UX-REDESIGN-PROPOSAL.md` research phase that preceded `030-sidebar-navigation` — research a bounded question openly, surface real tradeoffs, recommend, implement nothing.

**The question asked:** reconsider the Basemap tab's picker UI/UX, fully open-ended — in particular, re-check the constraint that killed the grid-plus-thumbnail option during `021-basemap-catalog-redesign` (no sourceable preview images, especially for the three UGRC compositions), and audit the tab against the current design system (`033`/`034`), which it has not been touched since.

---

## 1. What was researched, and how it was weighted

| Source | What it's good evidence for | How it was used here |
|---|---|---|
| **`021-basemap-catalog-redesign`'s own `spec.md` + `research.md`** (read in full) | The real, on-record prior reasoning: ArcGIS's `BasemapGallery` (grid + thumbnail + name) is the established convention; a per-entry-Popover-preview draft was built then discarded for allowing multiple simultaneous previews; the eventual design is one shared live preview + category-icon tiles + stage/Apply; thumbnails were ruled out for "no asset pipeline, no sourceable image for the UGRC compositions." | The baseline this proposal builds on and re-tests — §3 re-checks the thumbnail constraint directly; §4 keeps 021's shared-preview core and proposes adding to it, not replacing it. |
| **Esri `BasemapGallery` / Experience Builder docs** (`developers.arcgis.com`, `doc.arcgis.com`) | The purpose-built widget for exactly this problem. Confirmed directly: `thumbnailUrl` is a plain string to a **hand-supplied image file** (default 100×67px); **thumbnails are never auto-generated from basemap content**; "if no thumbnail is provided, the gallery will display a blank space." | Re-confirms 021's read — even the reference implementation assumes a static-asset pipeline someone has to feed. Named in §3/§4. |
| **"Made with MapLibre" Basemap Gallery** (`madewithmaplibre.com/basemaps/gallery/`) | A real, live, current gallery for this exact problem — ~50 vector/raster basemaps. Confirmed: it uses **static `.webp` thumbnails**, one per style, served from `/thumbnails/<style>.webp` — including `/thumbnails/openfreemap-liberty.webp` and the other four OpenFreeMap styles this app uses **by the same name**. No in-page documentation of how they're produced. | The cleanest real "grid + static thumbnail" example for this problem, and direct evidence that reusable OpenFreeMap thumbnails exist in the wild. §3/§4. |
| **`maplibre-gl-basemaps`** (`ka7eh`, in MapLibre's own plugin list) | A MapLibre `IControl` basemap switcher "with thumbnail previews," modelled on `Leaflet.Basemaps`. **Raster sources only**; developer supplies thumbnail images. | Corroborates "grid + static thumbnail" as the raster-switcher norm, and that it's raster-scoped in practice. §4. |
| **Mapbox Studio (2025–26 redesign)** (`mapbox.com/blog`, `docs.mapbox.com/console-tools/studio/`) | Where a well-resourced vendor took basemap selection recently: an **interactive city-preview widget** (the style at varying zoom / camera angle / 2D-3D), plus a separate visual Style Gallery. | Partial evidence *for* a live-preview surface over a frozen thumbnail — 021's shared-preview instinct is not outdated. §4. |
| **leaflet-providers preview page** (`leaflet-extras.github.io/leaflet-providers/preview/`) | The page 021's own "Explore options" link already points to. A wall of **live mini-maps**, one per provider/variant. | The "many small live maps" pattern — considered and not recommended in §4 (WebGL-context cost). |
| **QGIS Browser panel → XYZ Tiles** (`plugins.qgis.org`, community guides) | A widely-used pro GIS tool's basemap picker. | A **plain text tree, zero preview** — the "names only" pattern. Named in §4 as the floor, not a target. |
| **MapLibre static-render tooling** — `mbgl-renderer` (`consbio`), `pymgl` (`brendan-ward`, MapLibre GL **Native** Python static renderer), `mapgl-tile-renderer` (ConservationMetrics — "can optionally generate a thumbnail of your style"), plus the Puppeteer + MapLibre-GL-JS + `getCanvas().toDataURL()` screenshot approach (`simple-static-map-server`, `larryhudson.io/protomaps-maplibre-screenshot`) | Whether generating our **own** thumbnails offline, once, is realistic in 2026. | It clearly is — multiple maintained tools. §3 assesses which fits this repo. |
| **CARTO basemap status** (`docs.carto.com/faqs/carto-basemaps`, `carto.com/basemaps/apikey/`, home-assistant/core#180277) | Current licensing reality for `basemaps.cartocdn.com` — this app's `carto-*` presets and its `APP_DEFAULT`. | A **timely, adjacent correctness finding** — §2, flagged as not-strictly-picker-UX but surfaced by looking here. |
| **`src/layout/settings/scenariosTab.tsx` / `scenarioRow.tsx` / `scenarioStatusColor.ts`** (read directly) | The sibling tab in the same modal, redesigned recently (`036`/`037`) and well received. | The visual/interaction consistency reference in §5 — not a template to copy mechanically. |
| **`src/styles/tokens.css` (post-`033` "Nova" values), `components/ui/tabs.tsx`, `wftdm-design-system` skill** | The real, current token values and semantic-role rules the tab must be audited against. | §5's design-system audit — including a concrete selection-affordance regression the `033` token swap introduced. |

---

## 2. Current-state assessment — what the Basemap tab does today

Read directly from `basemapTab.tsx`, `settingsModal.tsx`, `panels/basemap/registry.ts`, `loadBasemapStyle.ts` before writing anything below.

**Layout today** (top to bottom, inside a `h-[600px]` vertical-rail modal tab):

- A **fixed header block** (never scrolls): one persistent `220px` `maplibregl.Map` preview + a one-line description + an **Apply** button.
- A **scrollable region** with four sections:
  - **UGRC Vector Tiles** — 3 tiles (Vector Lite / Hybrid / Outdoors), each a `lucide-react` category icon over a label, in a `grid-cols-[repeat(auto-fit,minmax(84px,1fr))]` grid.
  - **CARTO Vector Tiles** — 3 tiles (Positron / Dark Matter / Voyager).
  - **OpenFreeMap** — 5 tiles (Liberty / Bright / Positron / Dark / Fiord).
  - **Raster Tiles** — a native `<select>` (17 curated providers, several with `<optgroup>` variants) + an "Explore options" link to the leaflet-providers preview page. No live preview for raster (deliberate, `FR-008`).
- **Stage → Apply**: clicking any tile/option sets local `stagedSelection` (never touches `state/basemapState.ts`); only **Apply** calls `setGlobalBasemap()`. Closing the modal or switching Settings tabs discards an unapplied stage (the state simply unmounts).

**What works, genuinely — keep it:**

- **The single shared live preview is the right core idea.** It shows the *actually-resolved* style through the exact same `loadBasemapStyle()` every real panel uses — so a viewer sees the real UGRC multi-sprite handling (`017`), the real dark-background composite fix (`016`), the real raster-failure message (`024`). A frozen thumbnail cannot stay truthful to any of that. Mapbox Studio's own 2026 direction (an interactive preview widget) is independent confirmation this instinct is current, not dated.
- **Stage → Apply** is a correct, well-reasoned flow (`021` `research.md` §5) — no per-entry immediate-apply surprise, no state leaking before commit.
- **Category icons are honest.** The `Sun`/`Moon`/`Satellite`/`Mountain`/`Waves`/`Palette`/`Compass` per-entry glyphs are a *categorical* cue (light/dark/hybrid/outdoors/colorful), never a fake render — already aligned with `034-metric-panel-redesign`'s "never a fabricated preview" discipline. This part aged well.
- **The raster `<select>`** is a reasonable answer for 17 providers × many variants — a grid of 40+ tiles would be worse, and there's no thumbnail for raster today anyway.
- **Fail-soft everywhere** — loading skeleton, `PanelErrorState`, `PanelEmptyState` for the async raster list; blank-style fallback for an unreachable preview.

**What's showing strain:**

1. **You can only see one style at a time.** The single unmet need. Choosing between "Positron vs Voyager vs Liberty" is click → wait for tiles → click → wait → click. There is no at-a-glance comparison — the one thing a thumbnail grid is actually *for*. Every tile looks identical except its icon and label until you individually stage it.
2. **The "which tile is staged" signal nearly vanished under `033`.** The staged tile is `bg-accent text-accent-foreground`; a resting tile is `bg-card text-muted-foreground`. Post-`033` (Nova theme) `--accent` = `#f5f5f5` and `--card` = `#ffffff` in light mode — a **2–3% lightness difference**. In a grid of 11 near-identical tiles this is a real discoverability regression, not a nitpick. (Full detail + fix in §5. The same weak-accent issue affects `TabsTrigger`'s active state app-wide, but it bites hardest here because of the tile count.)
3. **`hostname`-adjacent: a CARTO-announced *future* risk (vector unaffected today).** Not strictly picker UX, but a re-look here surfaces it. **Directly verified 2026-09-10** (raw unauthenticated `curl` of the exact URLs, CARTO's own live docs, and the running app in headless Chromium): CARTO's **vector GL style endpoints** — the ones this app's `carto-*` presets actually use (`basemaps.cartocdn.com/gl/*-gl-style/style.json` plus their vector tiles / sprite / glyphs) — **return HTTP 200, keyless, and render with no watermark today.** The **"API KEY REQUIRED" watermark applies only to CARTO's separate *raster* PNG endpoints** (`basemaps.cartocdn.com/rastertiles/…`), which this app never requests; CARTO's own FAQ: *"Only the raster basemaps are watermarked today. Vector is unaffected."* The real concern is forward-looking and CARTO-documented, not present: CARTO has stated in writing that the key requirement *"is coming to the vector basemaps as well"* — **no date given**. **Resolved in this session:** `APP_DEFAULT` moved from `carto-voyager` to `openfreemap-positron` (a genuinely keyless, no-account service; see §6). The three `carto-*` presets stay available as explicit per-panel/per-tab pins; only the app-wide fallback moved.
4. **Sibling inconsistency with the Scenarios tab.** Same modal, redesigned four features later (`036`/`037`), visibly a different language: one bordered card surface, hairline-separated rows, a summary band, per-row status border + `color-mix()` wash. The Basemap tab is loose stacked sections + tile grids + a native `<select>`. Neither is wrong; they don't read as coming from the same design pass. (§5.)
5. **Preview slab is a fixed `220px` against a `max-h-[85vh]` modal.** On a ~700px-tall viewport the cap engages and `220px` preview + description + Apply + four section headers leaves the scroll region very short. Minor, but it's a fixed pixel value inside a viewport-relative box.

---

## 3. The thumbnail constraint, re-checked directly (the core question)

`021` ruled out per-entry thumbnails on two grounds: **(a)** no asset pipeline / precedent for bundled preview images in this repo, and **(b)** no sourceable preview image exists for the three UGRC compositions (and, implicitly, weak sourcing for the rest). Re-checking each, in 2026:

### 3a. Can we *source* ready-made thumbnails per provider?

| Catalog group | Ready-made thumbnail available? | Detail |
|---|---|---|
| **OpenFreeMap** (5) | **Partially — yes, in the wild.** | The "Made with MapLibre" gallery serves `/thumbnails/openfreemap-{liberty,bright,positron,dark,fiord}.webp` today — the exact five, by name. Reusing those images directly would need a license/permission check (the gallery repo's terms are not stated on the page). OpenFreeMap itself publishes **no** official preview-image endpoint. |
| **CARTO** (3) | **No.** | No dedicated preview-image endpoint ever existed. The obvious cheap substitute — a single raster tile from `basemaps.cartocdn.com/rastertiles/...` — now returns the **"API KEY REQUIRED" watermark** (§2, finding 3), so that shortcut is out. The vector styles themselves render fine keyless (verified 2026-09-10) and could be self-screenshotted (3b). |
| **UGRC compositions** (3) | **No — unchanged from `021`.** | Still no public preview image. Each entry is a **2-layer composite** (`LiteBase`+`LiteLabels`, `Esri.WorldImagery`+`Vector_Overlay`, `OutdoorsBase`+`Outdoors_Labels`) — even if an individual ArcGIS `VectorTileServer` item exposed an item thumbnail, it would show one layer, not the composite a viewer actually gets. This is the exact blocker `021` identified and it has **not** changed. |
| **Curated raster providers** (17) | **Yes, trivially — but not wired today.** | Every entry is an XYZ raster source by definition. A **single tile PNG** at a fixed `z/x/y` over the Wasatch Front is a legitimate (if crude, one-tile) thumbnail with **zero rendering pipeline** — this is literally what the leaflet-providers preview page renders as live mini-maps. Not currently used; the raster section is a plain `<select>`. |

**Conclusion on sourcing:** genuinely mixed. Raster is free. OpenFreeMap is available-with-a-license-question. **CARTO and UGRC still have no external source** — exactly the two that mattered in `021`. Sourcing alone does not unblock the grid-plus-thumbnail option.

### 3b. Can we *generate* our own thumbnails, once, offline?

This is the part that has genuinely changed since `021`. Static MapLibre rendering is now routine:

- **`pymgl`** — Python bindings to MapLibre GL **Native**, renders a style JSON to PNG. No browser.
- **`mbgl-renderer`** — CLI / HTTP / Node API, same idea, supports local tiles.
- **`mapgl-tile-renderer`** — Node/MapLibre-GL headless; *"can optionally generate a thumbnail of your style."*
- **Headless Chromium + MapLibre GL JS** — instantiate a real `maplibregl.Map`, wait for `idle`, `map.getCanvas().toDataURL()` (with `preserveDrawingBuffer: true`, or `map.redraw()` then read on `idle`). This is the `simple-static-map-server` / `larryhudson.io` pattern.

**Which fits this repo:** the headless-Chromium path, because it can **reuse `loadBasemapStyle()` unchanged** — the exact resolver the app already uses, so the thumbnail is guaranteed to match what the live preview and real panels render (UGRC multi-sprite, dark-background composite, all of it). A one-off script — `scripts/build-basemap-thumbnails.mjs` — would:

1. import `loadBasemapStyle` + the 11 vector preset names from `registry.ts`,
2. for each, launch a headless MapLibre map at `DEFAULT_CENTER` / `DEFAULT_ZOOM` (`[-111.89, 40.76]`, z9 — the Wasatch Front, the same extent the live preview already uses),
3. screenshot to `public/basemap/thumbnails/<preset>.webp` (~320×180, `webp`, a few KB each → ~30–60KB total for 11),
4. **print, not auto-write** a summary, and fail non-zero on an obviously-broken (all-one-color) capture — the exact discipline `scripts/build-demo-zone-geometry.py` already established for a checked-in offline asset.

**Precedent for checked-in `public/` static assets** (contra `021`'s "public/ holds only Parquet + coi-serviceworker" — already stale then, more so now): `public/basemap/leaflet-providers.json`, `public/coi-serviceworker.js`, `public/demo-geometry/**/*.geoparquet` (kept via a `.gitignore` negation). A `public/basemap/thumbnails/` directory is the same category — a small, real, git-tracked, regenerated-by-script asset set. It needs a `.gitignore` negation like `demo-geometry` got.

**Cost / downside, stated plainly:**
- A new dev dependency (`playwright` is already in the repo for tests — reusable — or `pymgl`/`mbgl-renderer` as a standalone script dep).
- The images are a **frozen snapshot** — if CARTO/OpenFreeMap restyle, or a UGRC service changes, the thumbnails drift until someone re-runs the script. Acceptable for "at-a-glance which one is roughly light vs. dark vs. imagery-backed"; **not** acceptable as the *only* truth surface — which is why §4 keeps the live preview.
- One-time author effort to build + verify the script (~half a day), plus a line in `CLAUDE.md` / a `docs/` note on when to re-run it.
- **`preserveDrawingBuffer` / WebGL** quirks (blank captures if timed wrong, dev-tools interference) are real but well-documented and a solved problem in the tools above.

### 3c. A third option `021` didn't consider: generate thumbnails in-browser, lazily

The Basemap tab already creates one live `maplibregl.Map`. On first open it *could* iterate the 11 vector styles, render each to an offscreen canvas via `getCanvas().toDataURL()`, and cache the data URLs in memory for the session — no checked-in assets, always current, no build step.

**Rejected as the primary approach** (named for completeness): 11 sequential `setStyle()` + tile fetches on first tab open is slow and network-heavy on a metered connection; `preserveDrawingBuffer: true` carries a standing perf cost on the one interactive preview map; and the thumbnails aren't present instantly (the first open is exactly when a viewer wants to scan). Viable as a *fallback* to hydrate a thumbnail whose checked-in file is missing, not as the mechanism.

---

## 4. Options, with real tradeoffs

None of these are drop-in. Each is scoped honestly, including what it costs and which shipped feature it touches.

### Option A — Keep the current design, fix only the `033` selection-affordance regression (lowest risk)

Change the staged-tile treatment from `bg-accent text-accent-foreground` (now near-invisible in light mode) to something that survives the Nova palette — `bg-primary text-primary-foreground` (near-black tile / white text in light; near-white tile / dark text in dark — strong, unambiguous), **or** keep the surface subtle but add `ring-2 ring-ring border-primary`. Optionally also: give the raster section a one-tile thumbnail (§3a, free), and add a summary line. Nothing else moves.

- **Pro:** Tiny, safe, closes the one concrete regression. No new dependency, no asset pipeline, no build step. Could ship in a single small feature.
- **Con:** Doesn't touch the actual unmet need — still one-style-at-a-time comparison. The tab still doesn't feel like the Scenarios tab's sibling.
- **When this is right:** if the appetite is "fix what regressed, don't expand scope."

### Option B — Hybrid: keep the shared live preview as the truth surface, add self-generated static thumbnails to the vector tiles (recommended)

Keep everything about the stage → Apply flow and the single live preview. **Add** a small static thumbnail (`~320×180 webp`) as the background/top of each of the **11 vector tiles** (CARTO ×3, OpenFreeMap ×5, UGRC ×3), generated by the offline `scripts/build-basemap-thumbnails.mjs` in §3b and checked into `public/basemap/thumbnails/`. The category icon stays (as a small overlay badge, or drops — a real thumbnail carries the light/dark/imagery cue better than a glyph). The **raster section keeps its dropdown** unchanged — optionally with the free single-tile thumbnail (§3a) as a later add. Clicking a tile still stages it; the shared preview still shows the *real* resolved style as the authoritative render.

This is precisely the hybrid the task hypothesized: *thumbnails for the vector/UGRC styles, the current no-preview treatment for the raster list.* The `021` blocker (no UGRC source) is dissolved by **generating** rather than sourcing.

- **Pro:** Delivers the actual missing capability — glance-and-compare across all 11 vector styles at once — while the live preview still guarantees truth for the staged pick (so a stale thumbnail is a cosmetic drift, never a wrong decision). Matches the strongest real reference (Made with MapLibre gallery) and the `BasemapGallery` convention `021` itself named, without the "someone must hand-draw 11 images" tax. Naturally fixes the selection-affordance problem too (a selected *photographic* tile with a ring reads unambiguously regardless of token values).
- **Con:** New offline script + a dev dependency (or reuse the repo's existing Playwright). Frozen-snapshot maintenance burden (re-run when a provider restyles — realistically once or twice a year). ~30–60KB of checked-in binary assets + a `.gitignore` negation. Larger feature than A.
- **When this is right:** if "make this picker genuinely good, and consistent with the Scenarios-tab redesign" is worth ~1–2 days of work.

### Option C — Full grid gallery, thumbnails only, drop the shared live preview

Go all the way to the `BasemapGallery` / Made-with-MapLibre shape: a single scrollable grid of thumbnail cards across all groups, no persistent live preview map at all; Apply still commits the staged pick.

- **Pro:** Simplest mental model, most "standard," removes the one always-mounted preview `maplibregl.Map` (a small WebGL-context saving). Closest to the widest-used reference.
- **Con:** **Loses the truth surface.** A viewer never sees the *real* resolved UGRC composite / dark-background fix / raster-failure message before Applying — the exact things `016`/`017`/`024` fixed and that a frozen thumbnail cannot show. Mapbox's own 2026 move is the opposite direction (toward a richer live preview). Raster still can't have meaningful thumbnails without extending the resolver. This throws away `021`'s best idea to gain tidiness.
- **When this is right:** only if the live preview is judged low-value in practice (worth checking with real users first) and WebGL-context budget is genuinely tight on the Settings modal (it isn't today — one non-interactive map).

### Considered and not recommended — a wall of live mini-maps (leaflet-providers-preview style)

One live `maplibregl.Map` per catalog entry, all rendered at once. Rejected for the same reason `021`'s per-entry-Popover-preview draft was: it multiplies WebGL contexts (`012-webgl-context-management` is the whole reason this app is careful here), and 11–28 simultaneous live maps in a modal is a real performance and context-exhaustion hazard for a marginal gain over static thumbnails + one shared live preview.

### Considered and not recommended — names only (QGIS style)

A plain labeled list, no visuals. It's the current tab minus the category icons and preview. Strictly worse than what's shipped; named only to bound the option space.

---

## 5. Design-system audit (`033` / `034`) — the Basemap tab has not been touched since `024`

Audited directly against `src/styles/tokens.css` (post-`033` Nova values), `components/ui/tabs.tsx`, and the `wftdm-design-system` skill.

### Real regressions / staleness

- **Selected-tile contrast collapsed under `033` (the significant one).** `basemapTab.tsx:428-430`: staged = `bg-accent text-accent-foreground`, resting = `bg-card text-muted-foreground`. Post-`033`: light-mode `--accent` `#f5f5f5` vs `--card` `#ffffff` — imperceptible; dark-mode `--accent` `#404040` vs `--card` `#171717` — visible but weak. This is exactly the "a token swap silently weakened an affordance, verify in *both* themes" failure the design-system skill's Dual-Theme section exists to catch. The skill's Color-Tokens section still says `accent` means "interactive hover/focus/selected background (…the selected tile in `basemapTab.tsx`…)" — that contract is now only weakly honoured by the values themselves. **Fix:** selected tile → `bg-primary text-primary-foreground` (or `border-2 border-primary ring-2 ring-ring` on the existing surface). Add a `tokenContrast.test.ts`-style or `getComputedStyle()` Playwright assertion in both themes, per the skill's standard technique.
- **`hover:bg-muted` on resting tiles** has the same near-invisibility in light mode (`--muted` `#f5f5f5` vs `--card` `#ffffff`). Acceptable as a *hover* hint, but it means selection and hover are currently signalled by two nearly-identical washes — reinforces the need to make *selection* categorically stronger (a ring, or `bg-primary`), not another wash.
- **Raster `<select>` is the one off-key primitive.** Everything else in this modal is a Radix/shadcn component; the raster picker is a bare native `<select>` (`basemapTab.tsx:475`). It inherits `color-scheme` theming (so it's *legible* in dark mode — `015` handled that), but it doesn't match the `Select` primitive shadcn shipped in `033-shadcn-default-theme` (`components/ui/select.tsx`, one of the seven new form primitives that feature added). Swapping to `<Select>` would make the section visually native to the modal. Low urgency, clean win.
- **`h-[220px]` fixed preview** inside a `max-h-[85vh]` modal — see §2 finding 5. Consider `aspect-video` + a `max-h` rather than a hard pixel height, or shrink to `~180px` on short viewports.

### Aged well — no change needed

- **Category icons** at `h-5 w-5` are exactly the design-system "Decorative / semi-prominent" tier (the skill's Iconography table even cites `basemapTab.tsx`'s tiles as the reference for that tier). Honest categorical cue, consistent with `034`'s "never a fabricated preview." If Option B adds thumbnails, the icon can become a small corner badge or be dropped — either is fine.
- **Section-label headings** (`font-heading text-xs font-semibold uppercase tracking-wide text-muted-foreground` + `border-b`) already *are* the design-system "Section label" role verbatim — the skill cites this file as the reference. No drift.
- **Loading / error / empty** states already reuse the shared `PanelErrorState` / `PanelEmptyState` + the canonical `animate-pulse rounded-md bg-muted` skeleton primitive. Correct.
- **`scrollbar-thin`** on the sections region — consistent with the rest of the modal.

### Sibling consistency with the Scenarios tab (`036` / `037`) — opportunities, not defects

The Scenarios tab now reads as: **one bordered card surface** (`rounded-xl border bg-card`) wrapping the whole list; a **summary band** at the top (`"N scenarios loaded · N need attention"`, muted, `border-b`); hairline `border-b` row separators inside; per-row status conveyed by a **left border + `color-mix()` background wash** (`scenarioStatusColor.ts`) using only `--success` / `--destructive` / `--muted-foreground`. The Basemap tab shares none of that container language. Concrete, optional alignment moves (each independently adoptable):

1. **A summary line** above the sections — e.g. `"11 vector styles · 17 raster providers · Applied: Voyager"` — mirrors the Scenarios tab's summary band and tells a viewer what's currently live without hunting.
2. **Wrap the four sections in one card surface** (`rounded-xl border bg-card`), sections as `border-b`-separated bands inside it, rather than four free-floating stacks — directly the Scenarios-tab container pattern.
3. If Option B is taken, a selected **thumbnail tile with a `ring` + a small check badge** is the natural parallel to the Scenarios tab's `Badge`-based "Baseline" chip — one clear, consistent "this is the chosen one" vocabulary across both tabs.

None of these change behaviour; they're the "make the two tabs in one modal feel like one design pass" layer.

---

## 6. Recommendation

**Primary: Option B (hybrid — keep the shared live preview, add self-generated static thumbnails to the 11 vector tiles).** It's the only option that closes the real unmet need (glance-and-compare) *and* keeps `021`'s genuinely-good live-preview truth surface *and* naturally resolves the `033` selection-affordance regression. The `021` blocker (no UGRC thumbnail source) is real but is dissolved by generating rather than sourcing — which is now routine tooling, wasn't clearly so in `021`'s timeframe, and has a direct in-repo precedent (`scripts/build-demo-zone-geometry.py`).

**If Option B is judged too big right now: Option A** (fix the staged-tile contrast against the Nova palette, in both themes, with a real computed-style test) is a genuinely worthwhile small feature on its own and should happen regardless — it's a shipped regression.

**Independent of which picker option:**
- **`APP_DEFAULT` — DONE (this session):** moved from `carto-voyager` to `openfreemap-positron`. Rationale: a muted grey reference style is the right fit for an app-wide fallback that sits under thematic data on every unconfigured `flowmap`/`zonemap` panel; measured as the lightest OpenFreeMap style by a wide margin (55 style layers / ~40 paint expressions, vs ~110–120 / ~90–100 for Liberty/Bright at this app's zoom levels); and OpenFreeMap is genuinely keyless/no-account, avoiding CARTO's announced-but-undated plan to extend its API-key requirement to vector (§2 finding 3). `resolveEffectiveBasemap()`'s precedence chain (panel > tab > global > app-default) needed no structural change — only the app-default tier's literal value. The `carto-*` presets remain fully supported as explicit per-panel/per-tab pins. Catalog section order also reordered: OpenFreeMap → CARTO → UGRC → Raster Tiles, with `openfreemap-positron` marked "recommended" in its section.
- **Swap the raster `<select>` for `components/ui/select.tsx`** (`033`'s shipped primitive) — small, makes the section native to the modal.
- **Adopt one or more of §5's sibling-consistency moves** (summary line, single card surface) so the Basemap and Scenarios tabs read as one design pass.

---

## 7. What this document does not decide

- Whether Option A, B, or C (or none) is adopted.
- Whether `scripts/build-basemap-thumbnails.mjs` is built, which rendering tool it uses, or whether it reuses the repo's existing Playwright vs. a standalone dep.
- Whether `public/basemap/thumbnails/` becomes a checked-in asset directory (with a `.gitignore` negation), or thumbnails are hydrated in-browser (§3c) instead.
- ~~Anything about `APP_DEFAULT` / the `carto-*` presets / CARTO key handling~~ — **decided and applied this session** (§6): `APP_DEFAULT` → `openfreemap-positron`, catalog sections reordered. Whether to add a CARTO key mechanism at all remains open (not needed while the default is off CARTO).
- Any change to `state/basemapState.ts`, the panel-level/tab-level `basemap:` grammar, or the `$baseline`/`comparison: diff` mechanisms — all explicitly out of scope, unchanged from `021`. (`resolveEffectiveBasemap.ts` itself is likewise untouched — the `APP_DEFAULT` change is a one-line constant swap in `registry.ts`, which that function already reads.)

Every item above is a real, separately-scoped `/speckit-specify`-sized decision, consistent with how this project's features have always been bounded.

---

## Appendix — Sources

- [Esri BasemapGallery / Experience Builder — thumbnailUrl](https://developers.arcgis.com/experience-builder/guide/basemap-gallery-widget/) · [API reference](https://gis.sanramon.ca.gov/arcgis_js_api/sdk/jsapi/basemapgallery-amd.html)
- [Made with MapLibre — Basemap Gallery](https://madewithmaplibre.com/basemaps/gallery/)
- [maplibre-gl-basemaps (ka7eh)](https://github.com/ka7eh/maplibre-gl-basemaps)
- [Mapbox Studio — Standard basemap redesign](https://www.mapbox.com/blog/from-vision-to-precision-the-next-evolution-of-mapbox-standard-is-here) · [Studio interface](https://docs.mapbox.com/console-tools/studio/studio-interface/)
- [leaflet-providers preview](https://leaflet-extras.github.io/leaflet-providers/preview/)
- [QGIS XYZ Tiles basemaps](https://plugins.qgis.org/plugins/xyz_tiles_basemap_loader/)
- [pymgl — MapLibre GL Native static renderer](https://github.com/brendan-ward/pymgl) · [mbgl-renderer](https://github.com/consbio/mbgl-renderer) · [mapgl-tile-renderer](https://github.com/ConservationMetrics/mapgl-tile-renderer)
- [MapLibre GL JS — screenshot / toDataURL discussion](https://github.com/maplibre/maplibre-gl-js/discussions/3900) · [MapOptions.preserveDrawingBuffer](https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/MapOptions/)
- [CARTO Basemaps FAQ (API key enforcement)](https://docs.carto.com/faqs/carto-basemaps) · [Request an API key](https://carto.com/basemaps/apikey/) · [home-assistant/core #180277 — "API KEY REQUIRED" watermark](https://github.com/home-assistant/core/issues/180277)
- [OpenFreeMap styles](https://github.com/hyperknot/openfreemap-styles)
- Internal: `specs/021-basemap-catalog-redesign/{spec,research}.md`, `src/layout/settings/basemapTab.tsx`, `src/panels/basemap/registry.ts`, `src/layout/settings/{scenariosTab,scenarioRow,scenarioStatusColor}.tsx`, `src/styles/tokens.css`, `.claude/skills/wftdm-design-system/SKILL.md`, `docs/UX-REDESIGN-PROPOSAL.md`

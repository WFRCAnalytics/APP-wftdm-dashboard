# UX/UI Redesign Proposal — Research Phase (Unconstrained)

**Status: research + proposal only. No code was changed to produce this document.** Everything below is for review and discussion; adopting any part of it is a separate, later decision (per-item, not all-or-nothing), and every "Do not" rule in `CLAUDE.md`, every already-shipped feature, and every rule in the `wftdm-design-system` skill remains in force until that decision is made.

**Date:** 2026-09-08
**Scope:** all ten panel types, the app shell (`shell.tsx`), `navBar.tsx`, `SettingsModal` (all four tabs), and the overall information architecture — not just visual tokens.

**Explicit framing carried through this whole document:** this pass was asked to NOT treat the current WFRC brand colors, the top-nav-with-tabs structure, or any other existing decision as fixed, and to research what would genuinely produce the best UX first. Where that leads somewhere that conflicts with `wftdm-design-system`'s existing Brand Identity rule or Phase 1/2/3's already-shipped work, this document says so explicitly rather than quietly steering back to the safe answer — but it does not itself change the rule. Section 7 is the reconciliation ledger.

---

## 1. What was researched, and how it was weighted

| Source | What it's actually good evidence for | How it was used here |
|---|---|---|
| **shadcn/ui's real `Sidebar` component + all 16 `sidebar-*` blocks** (`ui.shadcn.com/docs/components/sidebar`, `ui.shadcn.com/blocks/sidebar`) | The exact primitive this app would adopt if it moved off top-tabs — it's the same component family this app's `components/ui/*` already is. Confirmed API surface (`SidebarProvider`/`Sidebar`/`SidebarMenu`/`useSidebar`), the three `collapsible` modes (`offcanvas`/`icon`/`none`), and the collapsed-to-icon-rail interaction. | Primary structural reference for §3's Option B. |
| **Supabase Studio** — `apps/studio/components/layouts/` (`github.com/supabase/supabase`) + public docs/blog | A real, large, data-dense multi-product dashboard with the SAME domain shape this app has: connect to a data source, browse/query it, visualize results, manage settings. Confirmed a genuine **per-feature-area layout composition** (`AppLayout` → `ProjectLayout` → `{Database,TableEditor,SQLEditor,Storage,...}Layout`, each with its own `Navigation`/`Tabs`/`Scaffold`) — a left icon rail switches PRODUCT AREA, and each area then gets its own secondary nav/tabs. | Corroborates a two-tier IA (area switcher + within-area tabs) as a real, working pattern at scale — see §3 Option C. |
| **`gropaul/dash` / `gropaul/dash-ui`** (`github.com/gropaul/dash-ui`, `dash.builders/docs/dashboards`) | Already this project's own on-record design-inspiration source (`docs/PIPELINE.md`, `024-settings-modal-visual-redesign`) — went deeper this time into its actual INTERACTION model, not just its tokens. Confirmed: dashboards are **block-based, linear/freeform documents** (add a block via `+`/`/`, mix text+table+chart blocks), with **reactive input widgets** (`{{variable_name}}` templating — a query re-runs when a referenced input changes) as the filter mechanism. `src/components/` confirms dedicated `canvas/`, `relation/`, `workbench/`, `connections/`, `catalog/` directories — a genuinely different information model from a fixed row/panel grid. | Directly informs the "what NOT to import" list in §3 — see the explicit non-adoption call below. |
| **Vercel's dashboard** (`vercel.com/changelog/dashboard-navigation-redesign-rollout` — the Feb 2026 rollout — plus secondary design-pattern analysis) | Confirmed real, current, shipped structural facts: "horizontal tabs moved to a resizable sidebar that can be hidden," "projects as filters" (switch team/project scope without leaving the page), consistent tabs across both team- and project-level pages, a mobile floating bottom bar. Independent secondary analysis (`artofstyleframe.com`) converges on concrete numbers — 256px sidebar, 4-6 KPI cards, 12-column grid, skeleton states, dual themes shipped day one — for what "good 2026 dashboard design" tends to agree on across Linear/Stripe/Grafana/Vercel. | Primary evidence for §3 Option B's specific pixel values, and for the KPI-card/content-grid recommendations in §5 (ValueBoxPanel) and §4. |
| **SimWrapper** (`github.com/simwrapper/simwrapper`) | Already a "consider"-tier reference in this project's own constitution (Principle VIII) — the closest real domain peer (ABM/TDM output visualization). Confirmed its navigation is a **folder-browser** (`FolderBrowser.vue`) over a plugin/config tree, not tabs and not a product-area sidebar — a third, genuinely different IA pattern. | Named in §3 as a rejected-for-now fourth option, with reasoning. |
| **shadcn/ui primary reference status carried over from Phase 1** | Unchanged — this app already shares shadcn's component/token architecture directly, so its own patterns are the highest-weight evidence throughout this document, same as `wftdm-design-system`'s own Provenance section already states. | — |

**One explicit non-adoption, stated up front so it doesn't get silently proposed later:** `gropaul/dash`'s freeform block-canvas authoring model (drag/drop blocks, `+`/`/` menu, arbitrary block ordering as the primary UX) is **not** proposed anywhere in this document as a replacement for this app's YAML-authored `dashboard-*.yaml` row/panel grid. Two real reasons, not a style preference: (1) this app's whole config model (`CLAUDE.md`'s own "Config file set") is that a TDM analyst authors dashboards offline, in a file, alongside model-run scripts — there is no in-browser authoring UI anywhere in this app today, and building one is an entirely different, much larger feature than a visual redesign; (2) Dash's own reactive-variable filter mechanism (`{{variable}}` templating) is not a new capability this app needs to import — `services/sqlExpander.ts`'s `$filters`/`$inputs` placeholders already do the equivalent job, and `panels/observablePlotEncoding.ts`'s `PanelLocalInput` already gives individual panels their own reactive controls. What IS worth taking from Dash is narrower and already reflected in §5's per-panel notes: its real component anatomy for lists-with-status (`connections-view.tsx`, already reused for `scenariosTab.tsx`) and tile-grid pickers (`view-mode-picker.tsx`, already reused for `basemapTab.tsx`).

---

## 2. Current-state assessment — what the shell/nav/settings modal actually do today

Read directly from `shell.tsx`, `navBar.tsx`, `settingsModal.tsx`, `dashboardRenderer.tsx`, `panelCard.tsx` before writing anything below — not assumed from memory.

**What works, genuinely:**
- The `position: fixed` header with `ResizeObserver`-measured `paddingTop` compensation (`shell.tsx`) is a correct, carefully-debugged implementation — the border-box-vs-content-box bug it documents fixing is a real, subtle correctness win, not something to casually redo.
- `DashboardRenderer`'s CSS Grid row layout (fr-unit columns from each panel's `width` fraction) correctly solves a real flexbox gap-accounting bug the file documents hitting — this is sound, reusable machinery regardless of what visual language sits on top of it.
- `PanelCard`'s error boundary + `usePanelExpandHost` composition is genuinely panel-type-agnostic (confirmed: `registry[config.type]` resolution, zero per-type special-casing) — any IA change below can keep this layer completely untouched.
- `SettingsModal`'s four-tab, vertical-rail internal navigation (`021`/`024`) is already a small-scale rehearsal of exactly the "icon-adjacent vertical tab list" pattern §3's Option B would apply at the app's outer scale — it already works, and its own `basemapTab.tsx`/`scenariosTab.tsx` redesigns already directly incorporated `gropaul/dash`'s real component anatomy. This is the strongest existing evidence in the app that a sidebar-shaped navigation works well here.

**What doesn't work as well, or is showing real strain:**
- **The tab strip has no ceiling, and the app's own default template already has 7-9 tabs.** `navBar.tsx` renders one `TabsTrigger` per dashboard file with zero wrapping/scrolling logic — `NavBarProps`'s own comment says "no tab count or name is hardcoded here," which is a correctness win for the *data model* but an explicit UX gap: nothing in this component handles what happens once tab labels overflow the header's available width. The default WFRC template already ships seven tabs (`CLAUDE.md`'s Navigation model section); a deployer adding even 2-3 more (a real, expected use case — `index.json`-driven discovery exists specifically so tabs are addable with zero code change) has no defined behavior today beyond the browser's own text-overflow wrapping fighting the fixed-height header.
- **Two independent navigation levels are visually flattened into one row.** The header currently mixes three unrelated concerns at the same visual weight: brand identity (`DashboardBrand`), the actual page-level navigation (`NavBar`'s tabs), and dashboard-wide settings (`SettingsModal`'s trigger). A viewer scanning the header has no visual cue that "Summary / Person·HH / Tour / ..." is the primary navigation and "Settings" is a secondary, app-wide control — they're both just buttons in the same flex row.
- **The Settings modal bundles four conceptually different things behind one generic label.** Appearance (a personal preference), Scenarios (the actual DATA the whole app is currently showing), Basemap (a map-rendering default), and Documentation (a static link) have very different "how often does a viewer touch this" profiles — Scenarios in particular is arguably not a *settings* concern at all (it's closer to "which data am I looking at," the single most consequential choice in the whole app) but is filed one modal-open and one tab-click away from the content it controls.
- **No breadcrumb / "where am I" trail beyond the active tab highlight.** Once inside a panel's expand-to-dialog view (`004-panel-expand-dialog`), or scrolled deep into a long tab, there's no persistent indicator of which tab is active besides the (currently `position: fixed`, so at least persistently visible) `NavBar` itself — which is adequate today precisely because the header never scrolls away in `'fixed'` mode, but is exactly the piece the existing `'auto'` (hide-on-scroll) nav-bar mode removes. See §7 for the direct conflict this creates.
- **The panel grid has no larger structural unit than "row."** `dashboardRenderer.tsx`'s `Object.entries(tab.layout)` iteration renders every row as an independent CSS Grid with no shared column system across rows (each row's own `gridTemplateColumns` is computed purely from that row's own panel-width fractions) — functionally fine for what it does today, but it means there's no equivalent of the "12-column grid" convention research converges on (§1's Vercel/Grafana/Stripe evidence), which is what makes cross-row alignment (e.g., a KPI strip's cards lining up with a chart+table pair's column boundaries below it) a coincidence of authored `width` values rather than a structural guarantee.

---

## 3. Overall layout/navigation architecture — options with real tradeoffs

Three real options, plus one considered-and-rejected-for-now (SimWrapper's own pattern). None of these are drop-in — each is scoped honestly below, including which already-shipped feature it breaks (cross-referenced into §7's ledger).

### Option A — Keep top tabs, fix the strain points (lowest risk, smallest change)

Add a defined overflow behavior to `NavBar` once tabs exceed available width (a scrollable tab strip with fade-edge affordance — shadcn's own `Tabs` already composes with `overflow-x-auto` with no new primitive needed), and visually demote `SettingsModal`'s trigger relative to `NavBar` (smaller/ghost variant, or moved into a clearly secondary position) so the header's own visual hierarchy matches its actual information hierarchy. Everything else in `shell.tsx`/`dashboardRenderer.tsx` stays untouched.

- **Pro:** Zero risk to `010`/`012`/`027`'s WebGL/map lifecycle work, zero risk to the fixed-header measurement logic, zero risk to the hide-on-scroll nav mode (§7) — this option doesn't touch any of it.
- **Con:** Doesn't address the "Scenarios is buried inside Settings" issue at all, and a horizontally-scrolling tab strip is a real, if minor, discoverability regression versus every tab being visible at a glance (today's actual behavior for the default 7-tab template, which still fits).
- **When this is the right call:** if the org has no appetite for a structural nav change right now and just wants the two concretely-identified strain points closed.

### Option B — Left sidebar (shadcn `Sidebar`, `collapsible="icon"`), tabs become sidebar sections

Replace `NavBar`'s horizontal `Tabs` with a `shadcn Sidebar` in `icon`-collapsible mode: expanded, each dashboard tab is a labeled `SidebarMenuItem`; collapsed, the same items reduce to icon-only (each dashboard tab would need one new, author-supplied icon field — a real, small grammar addition, not free). `SidebarInset` becomes the new content wrapper `DashboardRenderer` renders into. Vercel's 2026 redesign (§1) is real, live evidence this exact "horizontal tabs → resizable/collapsible sidebar" move is a deliberate, current direction other serious dashboards are taking, not a speculative idea — and the 256px-expanded/64px-collapsed convention (§1, independently corroborated across Linear/Stripe/Grafana/Vercel) gives this option concrete, non-arbitrary sizing to start from.

Two structural benefits worth naming: (1) a left rail has no meaningful ceiling on tab COUNT the way a horizontal strip does — Option A's overflow-scroll fix becomes unnecessary; (2) `SettingsModal`'s trigger (and a promoted `Scenarios` entry, see below) can live in the sidebar's own `SidebarFooter`, visually distinct from the primary tab list by construction, not by convention.

- **Pro:** Directly and structurally fixes both of §2's top two "doesn't work" findings (no overflow ceiling; navigation vs. settings are now different DOM regions with different visual weight, not the same flex row).
- **Con — real, not hypothetical:** `shell.tsx`'s entire hide-on-scroll/`'fixed'` nav-bar mode (§7) is specifically about a HORIZONTAL header's vertical scroll relationship to page content; a vertical sidebar has no equivalent "hides on scroll down" behavior in any real reference researched (Vercel's own redesign collapses to icon-only via a manual toggle/keyboard shortcut, never an automatic scroll-triggered hide) — this mode would need to be either dropped entirely or reinterpreted as "auto-collapse to icon rail on scroll," a genuinely different feature, not a port. `DashboardBrand`'s current placement (inline in the horizontal header, `028-dashboard-branding`) would need to relocate into the sidebar's `SidebarHeader` — a real, if small, rework of that component's own layout assumptions. This is also the single largest visual departure from WFRC's current look of any option here — worth flagging plainly since brand-identity reconciliation (§7) is explicitly deferred, not resolved, by this document.
- **When this is the right call:** if the org is open to a genuinely new shell shape and values solving the tab-ceiling problem structurally, not just deferring it.

### Option C — Two-tier: icon rail (area) + horizontal tabs (within-area), Supabase-Studio-shaped

A hybrid: a slim, ALWAYS-icon-only left rail (never expands/collapses — Supabase Studio's own real pattern, confirmed via its `AppLayout`/`ProjectLayout` composition, §1) switches between a small number of top-level AREAS (e.g., "Dashboards" vs. a promoted "Scenarios" area vs. "Settings"), and within the "Dashboards" area, today's existing horizontal `NavBar`/`Tabs` strip continues to switch between the actual `dashboard-*.yaml` tabs exactly as it does today.

- **Pro:** The smallest structural change that still solves the "Scenarios is buried" problem specifically — it gets promoted to its own top-level area, not just a better-organized Settings tab — while leaving `NavBar`'s own horizontal-tab code, and therefore the tab-count assumption every existing test/screenshot/mental-model already has, completely untouched. The hide-on-scroll nav mode keeps applying to exactly the layer it already applies to (the horizontal within-area strip) with no reinterpretation needed.
- **Con:** Doesn't solve the tab-overflow ceiling at all (still Option A's problem, layered underneath) — would still want Option A's scroll-strip fix applied to the inner horizontal tabs. Adds a second navigation axis (rail + strip) a first-time viewer has to learn, versus Option B's single axis.
- **When this is the right call:** if promoting Scenarios out of the Settings modal is the one change worth making now, and the tab-overflow problem is judged lower-priority (Option A can still close it independently, later, without conflicting with this option).

### Considered and explicitly rejected for now — a SimWrapper-style folder/tree browser

SimWrapper's own real pattern (`FolderBrowser.vue`, §1) — a file-tree-shaped left sidebar mirroring the underlying config/data directory structure — was considered and set aside, for a reason specific to this app's own data model, not a general dismissal: this app's dashboards are a small, fixed, author-curated set (`CLAUDE.md`'s Navigation model — "today that's seven tabs," discovered via one flat `index.json` list, no nesting), not an open-ended directory of arbitrary simulation-run output files the way SimWrapper's own domain genuinely is. A tree-browser earns its complexity when the navigable set is large/nested/unpredictable; this app's navigable set is neither, so importing that pattern here would add UI complexity with no matching problem to solve. Worth re-considering only if a future feature genuinely grows the tab set into something large/hierarchical (not the case today).

**No recommendation is made here between A/B/C** — that's exactly the kind of decision this research-only task should surface with real tradeoffs, not make unilaterally.

---

## 4. Content grid, typography, color — where research suggests something different from Phase 1

Phase 1's `wftdm-design-system` skill already got the typography scale, spacing anchors, elevation tiers, and iconography sizing right against real, converging evidence (§1 confirms the same Vercel/Grafana sources again here, independently) — nothing below contradicts that work. What's new from going deeper this time:

- **A named 12-column content grid, on top of (not instead of) `dashboardRenderer.tsx`'s existing per-row `fr`-fraction Grid.** §2 already named the real gap: no structural guarantee that column boundaries line up across rows. Concretely: keep every row's own `gridTemplateColumns` computed from panel `width` fractions exactly as today (correct, gap-aware, already fixed a real flexbox bug), but round each panel's `width` to the nearest 1/12 when a `dashboard-*.yaml` author doesn't specify an exact fraction, and document the 1/12 unit in `docs/GRAMMAR.md` alongside the existing `width` field — the same "name what's already happening" formalization move `wftdm-design-system` itself made for spacing/shadow. This is authoring-time guidance, not a runtime change: `dashboardRenderer.tsx`'s grid math needs zero code change to already support it (any fraction already works).
- **A "Metric Strip" role for `ValueBoxPanel` rows specifically**, distinct from a generic panel row. §1's research (independently, across sources) converges on 4-6 KPI cards, 200-280px min-width, one primary number + one comparison + one visual element per card, `auto-fill, minmax(200px, 1fr)` sizing — this maps almost exactly onto what a `Summary` tab's `ValueBoxPanel` row already IS, just without a named layout convention. Concretely: when a `dashboard-*.yaml` row is composed entirely of `valuebox` panels, `dashboardRenderer.tsx` could switch that row's own `gridTemplateColumns` from the fraction-based system to `repeat(auto-fill, minmax(200px, 1fr))` — a small, scoped, panel-type-aware branch, not a system-wide change. (See §5's `ValueBoxPanel` entry for the same finding from the panel side.)
- **Color: the research does not suggest changing WFRC's own signature blue/yellow anywhere it's currently used as a brand-identity role (`--primary`/`--accent`).** This is worth stating plainly since the task deliberately asked not to treat brand color as fixed going in: every reference researched this round (shadcn's own default palette, Supabase's 12-step gray scale, Vercel/Geist's blue, Linear) was consulted the same way `wftdm-design-system`'s own Provenance section already frames Phase 1's references — for STRUCTURE (scale steps, sidebar sizing, grid conventions), never for hue. Nothing found this round changes that conclusion. The one place research DOES suggest a concrete, scoped color addition: a **neutral gray scale with more than the current handful of steps**, specifically for the kind of dense, structural chrome a sidebar-shaped nav (Option B/C) would introduce (rail background vs. content background vs. hover vs. active-but-not-selected — Supabase Studio's own 12-step scale exists for exactly this reason). This is additive (more steps in the *neutral* family, which already has no brand-identity role today) — not a reason to touch `--primary`/`--accent`.

---

## 5. Panel-by-panel assessment

Each entry: what works today, what doesn't, and a concrete proposal — grounded in this session's own direct reading of the real, current file (all ten were read in full for this task, not assumed from memory of prior phases).

### ValueBoxPanel
**Works:** The icon-circle + number-bar loading skeleton (Phase 3 Batch 1) is already correct and already matches the "Stat/display number" typography role.
**Doesn't:** No layout convention exists for a ROW of value boxes as a group — each one is just an equal-width grid column today, identical treatment to a chart or table panel in the same row.
**Proposal:** Apply §4's "Metric Strip" convention. Additionally, consider giving `ValueBoxPanelConfig` an optional `trend`/`comparison` field (a small delta number + up/down glyph next to the main stat) — every reference in §1 that discusses KPI cards names a comparison value as one of exactly three elements a good stat card carries (primary number, comparison, one visual). This app's `comparison: diff`/`$baseline` mechanism (`018`-`019`) already computes exactly this kind of value for other panel types; `ValueBoxPanel` is the one panel type that has never consumed it (confirmed: no `comparison`/`baseline` reference anywhere in the file) — a real, scoped gap, not a speculative addition.

### TablePanel
**Works:** Sort/search/pagination are all correct, keyboard-accessible (the real `<button>`-not-`<th>` fix), and the header-row+body-rows skeleton is properly shaped.
**Doesn't:** No sticky header on scroll for a long/expanded table — a real, common data-table need every reference researched treats as baseline (Supabase's own Table Editor, Grafana's dense tables). `PanelExpandHost`'s dialog view in particular can show a table tall enough that losing the column headers on scroll is a genuine usability cost.
**Proposal:** `position: sticky; top: 0` on the `<thead>`'s `<tr>` (a pure CSS addition, `bg-card` already available to prevent see-through) — low-risk, no new dependency, no layout-model change.

### MarkdownPanel
**Works:** Correctly has no loading state (confirmed, real reason — `config.content` is synchronous). Sanitized rendering with forced `target="_blank"` is solid.
**Doesn't:** Nothing structural found this round — it's a genuinely simple, low-surface-area panel type and stayed that way.
**Proposal:** No change proposed.

### PlotlyPanel
**Works:** `resolveThemeLayout()`'s token-resolved dark-mode fix is correct and well-tested; the theme-only re-render effect (no re-query on a theme flip) is a real, non-obvious performance win worth keeping regardless of any IA change.
**Doesn't:** Plotly's own legend is dense/small by default relative to this app's own type scale — not touched by any prior phase.
**Proposal:** No structural change — Plotly is explicitly staying as a supported engine (`docs/PIPELINE.md`'s five-tier charting direction). Worth a narrow, later pass applying `wftdm-design-system`'s Body/Caption type roles to Plotly's own `layout.legend.font`/`layout.font.size`, the same category of fix `resolveThemeLayout()` already makes for color — out of scope for this research document, named here so it isn't lost.

### ObservablePlotPanel
**Works:** `PanelLocalInput`'s reactive controls are a genuine, already-shipped example of exactly the "reactive widget" idea `gropaul/dash` was researched for (§1) — this app already has the capability, just scoped per-panel rather than dashboard-wide.
**Doesn't:** Nothing new found this round beyond what Phase 3 Batch 2 already fixed (label typography, skeleton shape).
**Proposal:** No change proposed.

### SankeyPanel
**Works:** The Phase 3 Batch 2 `fill="currentColor"` dark-mode fix, the two-node-column skeleton, and the shared `mapTooltip.ts` reuse (replacing the ~2s native-title hover delay) are all correct and load-bearing.
**Doesn't:** Nothing new found — this is a narrow, well-scoped panel type and audits clean.
**Proposal:** No change proposed. (Sankey is also the one real, confirmed gap in shadcn's own chart component per `docs/PIPELINE.md`'s existing research — an independent reason this panel type isn't a candidate for consolidation regardless of any IA change here.)

### RechartsPanel
**Works:** The v2→v3 upgrade (this session, earlier) re-verified all three prior fixes correctly; the bar-silhouette skeleton is shared with Plotly/Observable Plot per the skill's own "same shape regardless of mark type" reasoning.
**Doesn't:** shadcn's own `ChartLegendContent` has no click-to-toggle (a real, confirmed, closed-without-fix upstream gap, already documented) — worth restating here since it's directly relevant to any IA/UX proposal: a viewer used to Plotly's legend-click behavior on one tab and this panel type's non-interactive legend on another tab gets an inconsistent interaction model PURELY based on which chart engine a given panel happens to use, not anything the viewer did. This is a real UX inconsistency this document is naming for the record, not proposing to fix (the shadcn/Recharts-vs-Plotly-legend gap is already tracked in `docs/PIPELINE.md`'s deferred charting-consolidation entry).
**Proposal:** No new proposal beyond restating the above for visibility — the fix (a custom legend-content component with a real `onClick`) is already implicitly scoped by the existing PIPELINE.md entry, not new work this document is inventing.

### FlowMapPanel
**Works:** The map-silhouette skeleton (Phase 3 Batch 3), the `interleaved: true` WebGL-context-budget fix, and the hard-won `BLANK_STYLE`/multi-sprite/UGRC-background-layer fixes are all correct, load-bearing, and explicitly OUT OF SCOPE for this presentation-only research pass, per the task's own instruction.
**Doesn't:** MapLibre's `NavigationControl`/zoom/compass icons are library-owned CSS background-images this app can't restyle to match its own iconography tiers (already documented, `wftdm-design-system`'s "Map controls' own icons... deliberately exempt" section) — a real, accepted limitation, not something a redesign can fix without forking or replacing MapLibre's own control chrome, which is far outside this document's scope.
**Proposal:** No presentation-layer change proposed beyond what Phase 3 Batch 3 already did. If Option B/C (sidebar nav) is adopted, this panel's `ResizeObserver`-driven resize handling should transfer with zero change — it already reacts to container-size changes generically, not to the specific cause (confirmed: the observer watches the container element itself, not any nav-specific signal).

### ZoneMapPanel
**Works:** Same category of hard-won correctness as FlowMapPanel (the narrowed `transformStyle` fix, the scattered-zone-block skeleton) — correctly out of scope here.
**Doesn't:** Same MapLibre-owned-chrome limitation as FlowMapPanel for `NavigationControl`; the 3D toggle's own `ThreeDToggleControl` text label ("3D"/"2D") is a real, if minor, inconsistency against `lucide-react`'s otherwise-universal icon convention — already documented as a deliberate, MapLibre-`IControl`-chrome-constrained exception, not an oversight.
**Proposal:** No change proposed, same reasoning as FlowMapPanel.

### GraphicWalkerPanel
**Works:** The sidebar+canvas loading skeleton (Batch 3) genuinely does now reflect the library's own real top-level shape; the `DatasetPicker` (`028`) is a real, working example of exactly the kind of in-panel "switch what I'm looking at" control other panel types don't have.
**Doesn't:** This is the one panel type whose OWN internal shape (a field-list sidebar + canvas, confirmed via `graphicWalkerPanel.css`'s height-forcing rule and the skeleton's own two-pane structure) is structurally identical in miniature to Option B's proposed APP-level sidebar+content shape — worth naming as a real, existing precedent INSIDE this app for exactly the kind of layout Option B would introduce at the outer scale, not just an external reference. Also: `<GraphicWalker>`'s own internal "Data"/"Visualization" tab switcher uses `role="tab"` (already known — `dashboardShell.spec.ts`'s own query had to be scoped to avoid colliding with it, per `CLAUDE.md`'s file-tree history) — a second, real, already-encountered case of this app's OWN navigation vocabulary (tabs) recurring inside a third-party embedded component, worth keeping in mind for Option B/C: a viewer could end up with THREE nested tab-like navigation levels (app sidebar → dashboard tab → GraphicWalker's own internal tabs) on this one panel type specifically if Option B is adopted without deliberate visual differentiation between the levels.
**Proposal:** No change to the panel itself. Flagging the triple-nested-navigation risk above for whichever IA option is chosen, so it's designed against deliberately rather than discovered after the fact.

### Settings modal (all four tabs)
Already covered in depth in §2/§3 at the shell level. Per-tab notes not already covered there:
- **AppearanceTab:** simplest of the four, no findings.
- **ScenariosTab:** the `gropaul/dash`-derived connections-view row anatomy (status dot, two-line identity, trailing status word, actions cluster) is genuinely the strongest UI in this app today by the same standard §1's research applies elsewhere — worth treating as a template for OTHER list-shaped UI in this app, not just leaving it as this one tab's own bespoke pattern. No other list-shaped UI currently exists to apply it to, but if the sidebar option (B) is adopted and a tab list needs badges/status (e.g., a tab whose data failed to load), this row anatomy is the right thing to reach for first.
- **BasemapTab:** the `view-mode-picker.tsx`-derived tile grid (`grid-cols-[repeat(auto-fit,minmax(84px,1fr))]`) is likewise a strong, reusable pattern — already flagged in `wftdm-design-system` as worth reusing elsewhere; nothing new to add here.
- **DocumentationTab:** a static placeholder by design (`FR-014`) — no findings.

---

## 6. Cross-cutting typography/spacing/icon notes not already covered in §4

- Every panel type's title (`CardTitle`, Panel title role) currently renders at the same weight/size regardless of whether that panel sits in a "Metric Strip" row (§4) or a full chart row — if that convention is adopted, a metric-strip card's own title should likely drop to the Caption/meta role (matching §1's "one primary number, one comparison, minimal label text" KPI-card guidance) rather than keeping the full Panel-title treatment, which reads as oversized next to a single 30px stat number. This is a proposal, not something already decided.
- Control tooltips (`NavigationControl`, `ThreeDToggleControl`, `ResetViewControl`, `DatasetPicker`) were checked against the Iconography tiers in this pass: all four are already correctly documented as either using the Default (16px) tier or being deliberately exempt (map-library-owned chrome) — no new finding here beyond what `wftdm-design-system`'s existing "Map controls' own icons" section already states.

---

## 7. Reconciliation ledger — what gets affected or made obsolete by which proposal

| Existing, already-shipped feature | Affected by | How |
|---|---|---|
| **Hide-on-Scroll / Always-Visible nav bar mode** (`useNavBarVisibilityMode`, `shell.tsx`'s `translateY` toggle) | **Option B, directly; Option C, not at all; Option A, not at all.** | Option B replaces the horizontal header this feature's whole mechanism is built around with a vertical sidebar — "hide on scroll" has no direct equivalent for a sidebar in any reference researched (Vercel's own redesign uses a manual/keyboard-shortcut collapse, never scroll-triggered). Adopting Option B means either (a) dropping this feature's scroll-behavior entirely and keeping only its underlying `'fixed'`-vs-something-else *concept* reapplied to whether the sidebar is expanded/collapsed by default, or (b) building a genuinely new "auto-collapse-to-icon-rail on scroll" behavior — a new feature, not a port of the old one. This needs an explicit decision, not a silent carry-forward, if Option B is chosen. |
| **`DashboardBrand`** (`028-dashboard-branding`, rendered inside `shell.tsx`'s `<header>`) | **Option B.** | Its whole layout contract (title/logo sitting inline, left of the horizontal tab strip) assumes a horizontal header. Option B would relocate it into `SidebarHeader` — the component's own conditional-rendering logic (no logo → no image, no title → nothing) needs no change, but its container and sizing assumptions do. |
| **`SettingsModal`'s own internal vertical-tab-rail pattern** (`021`/`024`) | **All three options, positively — not broken by any of them.** | Already the smaller-scale rehearsal of exactly what Option B would do app-wide; nothing here needs to change regardless of which top-level option is chosen. |
| **`useActiveScenarios`/`useBaseline`/scenario-activation reactivity** | **None of the three options.** | Purely a data-layer/hook concern, entirely decoupled from where `ScenariosTab`'s UI physically lives (Settings-modal tab today, a promoted top-level area under Option C, or still a settings tab under A/B) — confirmed via direct read that `scenariosTab.tsx` only depends on `hooks/useScenarioList.ts` and `state/appState.ts`, neither of which has any notion of where it's rendered. |
| **004's generic panel expand-to-dialog mechanism** (`panelExpandHost.tsx`) | **None of the three options.** | Confirmed panel-type- and shell-position-agnostic already (`panelCard.tsx`'s own comment: "confirmed by direct read, not assumed, to already be fully generic across every panel type") — a nav/IA change at the shell level doesn't touch this layer at all. |
| **`dashboardRenderer.tsx`'s CSS Grid row math** | **§4's Metric Strip / 12-column proposals only — not the three IA options.** | The IA options (A/B/C) only change what's ABOVE `<main>`; `DashboardRenderer` itself is unaffected by any of them. §4's content-grid proposals are a separate, smaller, orthogonal change that could be adopted independently of which IA option (if any) is chosen. |
| **Brand Identity rule** (`wftdm-design-system`'s WFRC-blue-must-stay-the-accent rule) | **Not contradicted by anything in this document** (§4) — carried forward unchanged. | Explicitly re-confirmed, not silently revisited, per the task's own instruction to research freely but treat reconciliation as separate. |

---

## 8. What this document does not decide

- Whether A, B, or C (or none of them) gets adopted.
- Whether `dashboard-*.yaml`'s `width` field gains a documented 1/12-grid convention, or a `trend`/`comparison` field is added to `ValueBoxPanelConfig`.
- Whether the hide-on-scroll nav mode is dropped, reinterpreted, or kept as-is (only possible if Option A or C is chosen, per §7).
- Any color value beyond reaffirming the existing Brand Identity rule.

Every one of the above is a real, separate, small-to-medium `/speckit-specify`-sized decision once a direction is picked — consistent with how every other feature in this project's history has been scoped, per `CLAUDE.md`'s own stated discipline.

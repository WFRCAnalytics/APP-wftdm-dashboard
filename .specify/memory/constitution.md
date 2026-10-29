<!--
Sync Impact Report
- Version change: 2.8.0 → 2.8.1
- Modified principles: none
- Modified sections: references to `CONFIGURATION.md` (Principle VII and X
  status lines, the 2.8.0 report, Open Decisions) now read
  `project-docs/CONFIGURATION.md`, where the file was moved.
- PATCH: a path correction, no change in meaning.
-->

<!--
Sync Impact Report (2.8.0, superseded above)
- Version change: 2.7.0 → 2.8.0
- Modified principles:
  - IV (YAML Parsed at Runtime): adds `dashboard-config.yaml` to the list
    of files fetched and parsed at runtime.
  - V (Parquet-Only Browser Data I/O): wording unchanged; a pointer to the
    new "Open Decisions" section records that the data path (pre-processed
    Parquet versus the dashboard reading the model's raw output) is not
    final, and that this principle stands as written until it is.
  - VII (Minimal, Fixed Config File Set): was "exactly three" file types and
    named `dashboard-config.yaml` as forbidden. Now exactly four. The new
    `dashboard-config.yaml` is the single site-level settings file, in the
    manner of Quarto's `_quarto.yml`: site-wide deployer settings and the
    ordered page list, cascading down to each `dashboard-*.yaml` and then
    to each panel, the most specific setting winning. The old rule "app
    settings live in code and CLI args" is replaced: deployer settings live
    in `dashboard-config.yaml`; viewer preferences stay session-only
    (Principle VI: no Web Storage). `topsheet.yaml` and
    `summarize-preprocessor.yaml` stay forbidden. New site settings MUST
    NOT be added to `index.json`; those files remain generated discovery
    listings only (they never were one of the config types).
- Added principles:
  - X (Delivery Targets: Python Library and R Package): the dashboard ships
    as a static bundle plus YAML configuration, to be wrapped by a Python
    library and an R package. Neither may contain application logic.
- Added sections:
  - "Open Decisions (non-binding records)": the data path, undecided, with
    the plan to test both approaches on two branches against real WFRC
    activity-based model output; and the observed-data stream, not yet
    started and to be considered separately.
- Removed sections: none
- MINOR, not MAJOR: no principle is removed and nothing that was valid
  becomes invalid. A file that was forbidden becomes permitted, a principle
  is added, and a section records two undecided questions. Checked against
  this file's own versioning policy, not assumed.
- Follow-up: `CLAUDE.md`, `project-docs/GRAMMAR.md` and
  `project-docs/SPEC.md` repeat the old "exactly three" rule and the ban on
  `dashboard-config.yaml`; they are corrected in the same change. The file
  itself is specified in `project-docs/CONFIGURATION.md` and is built (066): it holds
  the site settings, and `index.json` no longer carries any.
- Deferred TODOs: the rest of `dashboard-config.yaml` (project-docs/CONFIGURATION.md, later phases); decide the data
  path after the two-branch test; decide how observed data fits; fix the R
  package's location when it is created.
-->

<!--
Sync Impact Report (2.7.0, superseded above)
- Version change: 2.6.0 → 2.7.0
- Modified principles: none
- Modified sections:
  - Technology Stack Reference, "Explore tab" row: was "Graphic Walker
    (`<GraphicWalker>` ...)"; now names the in-house chart builder
    (`065-chart-builder`): a grammar-of-graphics specification that the
    app's own compiler (`src/charts/builder/compile.ts`) draws as plain
    SVG, with DuckDB computing the groups, bins and statistics through the
    one shared connection (`services/duckdb.ts`, every statement
    authorized by `sqlGuard`). It replaces Graphic Walker as the Explore
    tab because Graphic Walker could not be styled to match the app's
    charts and its fixed UI did not fit the app's query-first workflow.
  - Technology Stack Reference: new row, "Charts — Explore builder".
    Observable Plot stays the default chart engine (Principle VI is
    untouched), but Plot has no dash channel, no hatch or pattern fills
    and no pie or polar marks, all of which the builder's channels
    require; the builder therefore draws its own SVG, the same class of
    gap the existing Sankey, Hierarchical and Pie/Radar rows document.
    **No new npm dependency**: no chart library was added, the compiler is
    plain TypeScript, icons are `lucide-react`, colours come only from the
    app's chart tokens.
  - Technology Stack Reference: new row, "Graphic Walker (retired from
    navigation)". The `graphic-walker` panel type stays registered and its
    code, tests and exact pin (`@kanaries/graphic-walker` 0.4.82, React
    peer range) stay in the repository, but the shipped demo and every
    deployer-facing navigation no longer open it. Whether to delete it is
    a separate, later decision; if it is deleted, dropping this row is a
    PATCH. It can be restored from git history (the commit that removes it,
    or the `v0.0.3` tag, which still contains it).
- MINOR, not PATCH: a Technology Stack Reference row is replaced and a new
  engine row is added, so existing binding guidance is materially changed,
  matching this file's precedent for the same class of change (2.4.2 →
  2.5.0, 2.5.0 → 2.6.0).
- Added principles: none
- Added sections: none
- Removed sections: none
- Deferred TODOs: removal of the Graphic Walker code and dependency, when
  the maintainers decide to.
-->

<!--
Sync Impact Report (2.6.0, superseded above)
- Version change: 2.5.0 → 2.6.0
- Modified principles: none
- Modified sections:
  - Technology Stack Reference: new row, "Charts — Pie/Radar | D3
    (`d3-shape`)" — added directly below the existing "Charts —
    Hierarchical" row by `060-radar-pie-charts`, which adds the app's
    thirteenth and fourteenth panel types (`pie`, `radar`). Confirmed
    directly (not assumed) that Observable Plot has no pie/arc mark and
    no polar coordinate system at all (a full source search of the
    installed `@observablehq/plot@0.6.17` package's own `src/marks/`
    directory lists every real mark — none is `arc`/`pie`, and no polar/
    radial coordinate system exists anywhere in the package) — the same
    class of gap the existing "Charts — Sankey"/"Charts — Hierarchical"
    rows already document for their own diagram types. Unlike those two
    prior amendments, this one introduces **no new npm dependency**:
    `d3-shape` is already a pinned, installed dependency (added by
    `058-hierarchical-chart-panels` for the sunburst renderer's
    `d3.arc()` calls) and already exports `d3.pie()` too, confirmed
    directly against the installed package. The radar chart needs no D3
    layout package at all — hand-rolled polar trigonometry (evenly-
    spaced angles + a linear radius scale), matching this project's own
    established "D3 layout math where a real algorithm exists, plain
    math/DOM otherwise" convention (no `d3-selection`/`d3-transition`
    added, same as the Sankey and Hierarchical rows).
- MINOR, not PATCH: a new named capability row added to the Technology
  Stack Reference table — existing guidance materially expanded (an
  already-pinned dependency reused for a new charting capability), not a
  non-semantic wording fix — matching this file's own established
  precedent for the identical class of change (2.4.2→2.5.0's
  Hierarchical-row addition; 2.3.0's own `@deck.gl/layers` addition).
- Added principles: none
- Added sections: none
- Removed sections: none
- Deferred TODOs: none
-->

<!--
Sync Impact Report (2.5.0, superseded above)
- Version change: 2.4.2 → 2.5.0
- Modified principles: none
- Modified sections:
  - Technology Stack Reference: new row, "Charts — Hierarchical | D3
    (`d3-hierarchy`/`d3-shape`)" — added directly below the existing
    "Charts — Sankey" row by `058-hierarchical-chart-panels`, which adds
    the app's first zoomable treemap/sunburst panel types. Confirmed
    directly (not assumed) that Observable Plot has no treemap/sunburst
    composition path of any kind (a full source search for "treemap"/
    "partition"/"pack" across the installed `@observablehq/plot`
    package returns zero matches, and it declares no `d3-hierarchy`
    dependency) — the same class of gap the existing "Charts — Sankey"
    row already documents for Sankey diagrams. `d3-shape` (for
    `d3.arc()` only, needed by the sunburst renderer) is named alongside
    `d3-hierarchy` — a real, implementation-time finding: the canonical
    zoomable-treemap/sunburst reference implementations also use
    `d3-selection`/`d3-transition`/`d3-scale`, none of which this
    amendment adds — those are reimplemented as plain functions/raw DOM
    manipulation instead, matching `SankeyPanel.tsx`'s own existing,
    established precedent of depending on a D3 layout package
    (`d3-sankey`) while building/updating its SVG via plain
    `document.createElementNS()` calls, never `d3-selection`/
    `d3-transition`.
- MINOR, not PATCH: a new named technology added for a new capability —
  existing guidance materially expanded, not a wording fix — matching
  this file's own established precedent for the identical class of
  change (2.2.0→2.3.0's `@deck.gl/layers` addition; the existing
  "Charts — Sankey" row's own original addition).
- Added principles: none
- Added sections: none
- Removed sections: none
- Deferred TODOs: none
-->

<!--
Sync Impact Report (2.4.2, superseded above)
- Version change: 2.4.1 → 2.4.2
- Modified principles: none
- Modified sections:
  - Technology Stack Reference: "Charts — default | the retired chart library" and
    "Charts — reactive inputs | Observable Plot (`@observablehq/plot`)"
    corrected — stale twice over. `029-shadcn-chart-panel` made the retired chart library
    "this app's new default/primary engine for bar/line/area charts"
    (CLAUDE.md's own entry) with no constitution amendment on record at
    the time; `057-observable-plot-conversion` then moved every real
    demo bar/distribution chart off the retired chart library onto Observable
    Plot, and that feature's own plan.md explicitly logged this same
    cell as stale a second time, recommending exactly this
    documentation-only PATCH (its "Non-blocking documentation note").
    "Charts — default" now reads "Observable Plot (`@observablehq/plot`)",
    naming the retired chart library/the retired chart library as the two remaining registered, supported
    (non-default) chart panel types. The old "Charts — reactive inputs"
    row (which named Observable Plot back when it was the secondary
    engine) is replaced with "Charts — Sankey" naming D3 (`d3-sankey`)
    directly — matching CLAUDE.md's own current Stack table shape; no
    genuine Observable Plot Sankey support exists (no mark/transform, no
    documented composition pattern, an unresolved upstream request since
    2022).
  - PATCH, not MINOR: the same reasoning the 2.4.0→2.4.1 amendment below
    already established for an identical class of change — a Technology
    Stack Reference cell corrected to match actual, already-shipped
    usage is a wording clarification, not a new or redefined principle;
    no Core Principle is touched, no binding constraint added or
    relaxed.
- Added principles: none
- Added sections: none
- Removed sections: none
- Deferred TODOs: none
-->

<!--
Sync Impact Report (2.4.1, superseded above)
- Version change: 2.4.0 → 2.4.1
- Modified principles: none
- Modified sections:
  - Technology Stack Reference: "Explore tab | Graphic Walker
    (`embedGraphicWalker`)" corrected to name the `<GraphicWalker>`
    component instead — `014-graphic-walker-panel`'s own implementation
    found, post-completion, that `embedGraphicWalker`'s real installed
    source (`node_modules/@kanaries/graphic-walker/dist/vanilla.js`, read
    directly) creates a second, independent `ReactDOM.createRoot()` it
    never exposes to the caller, so it can never be disposed — a real,
    confirmed leak (38 real `document`/`window` listeners plus a MobX
    store per mount, since this app's `shell.tsx` mounts only the active
    tab's panels and unmounts the rest on every tab switch). Rendering
    `<GraphicWalker>` directly as ordinary JSX — proven exactly
    equivalent in rendered output to what `embedGraphicWalker` does
    internally once data is provided (its own source shows no other
    wrapping happens) — fixes this by letting the app's own single React
    tree dispose it via normal unmount reconciliation. See
    `specs/014-graphic-walker-panel/research.md` §3 for the full finding.
  - PATCH, not MINOR: this file's own versioning policy names "wording
    clarifications... or other non-semantic refinements" as PATCH — this
    is exactly that: one Technology Stack Reference table cell corrected
    to name the actual API surface in use, no principle touched, no new
    binding constraint added or relaxed. Directly analogous to the
    1.1.0→1.2.0 `services/duckdb.worker.js` correction's own reasoning
    (a reference fixed to match the real, installed library's actual
    behavior, discovered during implementation) — that amendment was
    itself categorized MINOR only because it also rewrote a Core
    Principle's own title/body text (Principle II); this amendment
    touches no principle at all, so PATCH is the correct tier under this
    file's own rule, not that precedent's tier.
- Added principles: none
- Added sections: none
- Removed sections: none
- Deferred TODOs: none
-->

<!--
Sync Impact Report (2.4.0, superseded above)
- Version change: 2.3.0 → 2.4.0
- Modified principles:
  - VIII. Reuse Proven Reference Implementations — additive (MINOR), not a
    redefinition. Two changes, drafted at `specs/012-webgl-context-
    management/constitution-amendment-proposal.md` (which itself
    incorporated and superseded the still-unmerged `specs/011-basemap-
    style-system/constitution-amendment-proposal.md` — that file is now
    marked superseded, not merged separately, to avoid double-adding the
    same `APP-WFRC-Commute-Patterns` diff hunk):
    1. `WFRCAnalytics/APP-WFRC-Commute-Patterns` joins the existing
       mandate-tier reference table (real, production `setStyle()` +
       `transformStyle` basemap-switching pattern, confirmed reused
       directly by `011-basemap-style-system`'s own `FlowMapPanel.tsx`
       basemap-application effect, and named again in `012-webgl-context-
       management`'s own `plan.md` Phase 0 research). `WFRCAnalytics/
       APP-Commute-Explorer` was checked against the current table during
       this amendment and confirmed already present since v1.0.0 — not a
       gap, despite being flagged as one in the originating request.
    2. `simwrapper/simwrapper` (github.com/simwrapper/simwrapper) is added
       as a new, explicitly lighter-weight "consider" tier — confirmed
       real and active directly against the live repository (2,393+
       commits, ongoing issues, real production tool at simwrapper.app,
       built by VSP-TU-Berlin for ABM/TDM simulation-output
       visualization, TypeScript/Vue + deck.gl stack) before adding. Not
       folded into the existing MUST-copy list — that would have silently
       given it mandate weight it was never meant to carry — but added as
       its own paragraph: implementers MAY consult it for
       architectural/UX judgment on future panel/navigation features; it
       creates no new MUST, and does not relax Principle VI's fixed
       technology choices.
- Modified sections: none beyond Principle VIII's own text above
- MINOR, not PATCH or MAJOR: checked against this file's own versioning
  policy text directly, not assumed. Two new named reference sources plus
  a new consider/mandate weight sub-mechanism is existing guidance
  materially expanded, not a non-semantic wording fix (rules out PATCH);
  no principle is removed or redefined in a backward-incompatible way —
  the existing MUST-copy obligation on the original five repos is
  untouched (rules out MAJOR). Matches the precedent already set twice in
  this file's own history (2.2.0→2.3.0's `@deck.gl/layers` addition;
  011's own now-superseded single-repo draft, self-assessed MINOR under
  the identical "materially expanded" clause).
- Added principles: none
- Added sections: none
- Removed sections: none
- Deferred TODOs: none
-->

<!--
Sync Impact Report (2.3.0, superseded above)
- Version change: 2.2.0 → 2.3.0
- Modified principles: none
- Modified sections:
  - Technology Stack Reference: Pinned peer dependency versions gained
    `@deck.gl/layers` `^9.0.0` — a real, confirmed gap, not previously
    covered even implicitly. Found while verifying Principle VIII's
    `WFRCAnalytics/APP-Commute-Explorer` reference against the real repo
    (not assumed): both `APP-Commute-Explorer` (`github.com/WFRCAnalytics/
    APP-Commute-Explorer`, confirmed public/active/non-archived via the
    GitHub API, `pushed_at` 2026-06-30) and a related repo,
    `APP-WFRC-Commute-Patterns` (also confirmed real/active, `pushed_at`
    2026-08-29), independently pin `@deck.gl/layers` `^9.0.0` in their real
    `package.json` files, fetched directly (`raw.githubusercontent.com`),
    not summarized secondhand. `APP-Commute-Explorer`'s own pins otherwise
    match this constitution's existing ones exactly (`maplibre-gl`
    `^4.7.1`, `@deck.gl/core`/`@deck.gl/mapbox` `^9.0.0`, `@flowmap.gl/
    layers` `^9.3.0`) — the reference itself was already accurate; only
    the missing `@deck.gl/layers` entry needed adding. Principle VIII's
    reference table itself is unchanged — `APP-Commute-Explorer` is a
    real, current, non-stale repo, not a rename/404 case, so no reference
    swap was warranted despite that being the trigger condition this
    verification was checking for.
  - MINOR, not PATCH: unlike the 1.1.0→1.2.0 `services/duckdb.worker.js`
    correction (fixing a reference to match reality, no new binding
    constraint added), this adds a genuinely new pinned dependency version
    to the "must stay mutually compatible" list — existing guidance
    materially expanded, per this file's own versioning policy, not a
    non-semantic wording fix.
- Added principles: none
- Added sections: none
- Removed sections: none
- Deferred TODOs: none
-->

<!--
Sync Impact Report (2.2.0, superseded above)
- Version change: 2.1.1 → 2.2.0
- Modified principles: none
- Modified sections:
  - Development Workflow: panel pattern rewritten for React. It was written
    before React was adopted (`create(config, conn, filterState)` returning
    `{ element, destroy }` — a vanilla-JS factory-function contract);
    `002-design-tokens` has since adopted React, and panels are next to be
    built, so the pattern needed to match reality before any panel code is
    written against it. New shape: a React function component receiving a
    single `config` prop, reading filter values through a `useFilterState`
    hook (`src/hooks/useFilterState.ts`, wrapping `state/filterState.ts`'s
    existing pub/sub store with `useSyncExternalStore`) and querying
    `services/duckdb.ts` by direct import rather than an injected
    connection; registered in `panels/registry.tsx` as a panel-type-to-
    component map rather than a type-to-factory-function map.
  - MINOR, not MAJOR: no Core Principle (I-IX) is redefined — Principle I
    already permits React "when a UI feature genuinely needs it," and this
    is that permission being exercised for the panel layer, the same way
    `002-design-tokens` exercised it for the UI-primitives layer.
    Development Workflow sits outside the nine enumerated principles.
    Directly analogous to the 1.1.0→1.2.0 amendment (the
    `services/duckdb.worker.js` correction), which made a comparable
    technical-shape correction — to an actual Core Principle's text, a more
    structurally significant location than this change touches — and was
    itself categorized MINOR: the underlying policy intent is unchanged;
    only a concrete mechanism, written speculatively before the real
    technology was settled, is corrected to match it.
- Added principles: none
- Added sections: none
- Removed sections: none
- Deferred TODOs: none
-->

<!--
Sync Impact Report (2.1.1, superseded above)
- Version change: 2.1.0 → 2.1.1
- Modified principles:
  - I. TypeScript Throughout, React Permitted When Needed — PATCH wording
    fix, not a policy change: the rationale/body previously said React
    "MAY be introduced when a UI feature genuinely needs it — starting
    with the layout/panel layer." `002-design-tokens` (a design-token and
    shadcn/ui component foundation feature, planned before any layout/panel
    work) turned out to be the feature that actually needed React first,
    since shadcn/ui has no non-React form. Corrected to name no specific
    feature — "whichever UI feature first needs it" — so the wording
    doesn't go stale again the next time the actual trigger feature differs
    from whatever was guessed when this was written. The underlying policy
    (React adopted only when genuinely needed, no phase gate, no dedicated
    branch) is unchanged.
  - VI. Fixed Technology Choices — same wording fix, found while checking for
    the same mistake elsewhere in this file: its rationale also said the
    UI-layer stack was decided "ahead of the layout/panel layer's actual
    build." Generalized to "ahead of whichever feature first adopts React
    (Principle I)."
- Modified sections:
  - Technology Stack Reference: Build row's "arrives with the layout/panel
    layer" corrected to "arrives with whichever feature first needs it,"
    same reason.
  - Governance / Compliance review: "no React usage outside the layout/panel
    layer it's scoped to once adopted" — same stale assumption — replaced
    with "no React usage introduced speculatively ahead of an actual UI need
    (Principle I)," preserving the actual governance intent (React usage
    should be need-driven, not spread ad hoc) without naming a layer.
- Added principles: none
- Added sections: none
- Removed sections: none
- Deferred TODOs: none
-->

<!--
Sync Impact Report (2.1.0, superseded above)
- Version change: 2.0.0 → 2.1.0
- Modified principles:
  - VI. Fixed Technology Choices — additive (MINOR), not a redefinition:
    adds Tailwind CSS, shadcn/ui (Radix UI primitives), and `lucide-react`
    as the fixed UI-layer stack, joining the existing MapLibre/Vite/
    no-Web-Storage choices. Decided ahead of the layout/panel layer's
    actual build (Principle I — React itself isn't adopted yet), so that
    work starts on a settled foundation rather than a separate
    framework-choice debate once React lands.
- Modified sections:
  - Technology Stack Reference: Build row updated to name the UI-layer
    stack alongside the existing Vite/TypeScript/React-not-yet-adopted note.
- Added principles: none
- Added sections: none
- Removed sections: none
- Deferred TODOs: none
-->

<!--
Sync Impact Report (2.0.0, superseded above)
- Version change: 1.2.0 → 2.0.0
- Modified principles:
  - I. Phased Migration Discipline → I. TypeScript Throughout, React
    Permitted When Needed — MAJOR change: drops the sequential phase-gating
    requirement entirely. No more "Phase 1 (vanilla JS) fully verified
    before Phase 2 (TypeScript) begins," no more separate `feat/typescript`
    / `feat/react` branches merged only once confirmed working. TypeScript
    and React are now permitted directly on `main`; existing vanilla JS in
    001-data-state-layer was converted to TypeScript as part of this same
    amendment (see the accompanying `refactor:` commit). This is the
    MAJOR-version example the Governance section's own versioning policy
    already names ("dropping phase gating").
- Modified sections:
  - Technology Stack Reference: Build row updated from "Vite, plain
    JavaScript (ES2022) in Phase 1" to reflect TypeScript; React noted as
    not yet adopted (arrives with the panel/layout layer, not before).
  - Governance / Compliance review: "no TypeScript or React outside their
    designated phase/branch" removed — that constraint no longer exists —
    replaced with a standard reflecting the new policy.
- Added principles: none
- Added sections: none
- Removed sections: none
- Deferred TODOs: none
-->

<!--
Sync Impact Report (1.2.0, superseded above)
- Version change: 1.1.0 → 1.2.0
- Modified principles:
  - II. DuckDB-WASM Runs in a Web Worker, One Shared Instance → II. DuckDB-WASM
    Query Execution Off the Main Thread, One Shared Instance — dropped the
    literal `services/duckdb.worker.js` filename requirement. Verified against
    the installed `@duckdb/duckdb-wasm` package's own README/type
    definitions: its real API instantiates `AsyncDuckDB` on the main thread,
    handed a `Worker` built from the library's own bundled worker script
    (loaded by URL) — there is no app-authored worker file to write; writing
    one would not match how the library operates. The substantive guarantee
    — query execution never blocks the main thread, exactly one shared
    instance, owned solely by `services/duckdb.js` — is unchanged. Discovered
    while implementing 001-data-state-layer's User Story 1 against the real
    library, not a policy change.
- Added principles: none
- Added sections: none
- Removed sections: none
- Deferred TODOs: none
-->

<!--
Sync Impact Report (1.1.0, superseded above)
- Version change: 1.0.0 → 1.1.0
- Modified principles: none
- Added principles:
  - IX. Fixed Python/JS Source Split — package lives at python/wftdm_dashboard/;
    src/ is reserved exclusively for the JS app; src/wftdm_dashboard/ MUST NOT
    be recreated. Added following the path-consolidation cleanup that moved the
    Python package out of src/ (README.md, CLAUDE.md, pyproject.toml,
    .gitignore, .vscode/settings.json all reconciled to python/wftdm_dashboard/).
- Added sections: none
- Removed sections: none
- Deferred TODOs: none
-->

<!--
Sync Impact Report (1.0.0, superseded above)
- Version change: (none, initial scaffold) → 1.0.0
- Modified principles: n/a (initial ratification)
- Added sections:
  - Core Principles: I. Phased Migration Discipline, II. DuckDB-WASM Runs in a Web
    Worker (One Shared Instance), III. No eval() — SQL Fragments via String
    Replacement Only, IV. YAML Parsed at Runtime, V. Parquet-Only Browser Data I/O,
    VI. Fixed Technology Choices, VII. Minimal, Fixed Config File Set,
    VIII. Reuse Proven Reference Implementations
  - Technology Stack Reference (Section 2)
  - Development Workflow (Section 3)
  - Governance
- Removed sections: none (all template placeholders replaced)
- Deferred TODOs: none — RATIFICATION_DATE set to the date of this initial
  adoption since no prior constitution or documented ratification date exists.
-->

# WFRC TDM Calibration Dashboard Constitution

## Core Principles

### I. TypeScript Throughout, React Permitted When Needed
The JS app is TypeScript (`.ts`), not plain JavaScript — new work MUST NOT
add plain `.js` files to `src/` where a `.ts` file is expected. There is no
phase gate to clear first and no separate branch to merge from: TypeScript
work lands directly on `main`. React MAY be introduced when a UI feature
genuinely needs it — whichever feature that turns out to be, not a
predetermined one — but is not required before then, and (like TypeScript)
has no separate branch of its own once adopted; it lands directly on `main`
too.
**Rationale**: the original three-phase, branch-per-phase plan (vanilla JS →
TypeScript → React, each fully verified before the next began) isolated
migration risk at the cost of real process overhead; with working test
coverage already in place before any conversion, adopting types and a UI
framework incrementally and directly on `main` carries the same safety
without the branch-and-gate ceremony.

### II. DuckDB-WASM Query Execution Off the Main Thread, One Shared Instance
DuckDB-WASM query execution MUST NEVER run on the main thread, and exactly one
shared `AsyncDuckDB` instance MUST serve the whole app. That instance —
together with the `Worker` DuckDB-WASM itself provides via `bundle.mainWorker`
— MUST be owned entirely by `services/duckdb.ts`; no other module may
construct its own `AsyncDuckDB` or `Worker` instance, or its own connection.
There is no separate app-authored `services/duckdb.worker.ts` file: DuckDB-WASM
ships its own worker script, loaded by URL from the library's own package
bundle (never a CDN — see `services/duckdb.ts`'s contract and `research.md`
for why), and `services/duckdb.ts` alone is responsible for selecting a
bundle, instantiating that worker, and exposing `initDuckDB()` / `query()` /
`registerScenario()` / `registerFileURL()` / etc. to the rest of the app.
**Rationale**: keeps the UI and map rendering responsive while Parquet/Arrow-scale
queries run off the main thread, and a single shared instance avoids duplicated
memory and inconsistent registered views across panels. *(Amended 1.2.0: the
original wording named an app-authored `services/duckdb.worker.js` file: the
installed `@duckdb/duckdb-wasm` package's real API instantiates `AsyncDuckDB`
on the main thread and hands it a `Worker` built from the library's own
bundled script — there was never anything for the app to author into that
file. The behavioral guarantee itself — main thread never blocks on query
execution, exactly one shared instance — is unchanged.)*

### III. No eval() — SQL Fragments via String Replacement Only
Application code MUST NOT call `eval()` or any equivalent dynamic code execution.
SQL assembled from dashboard YAML (`$mappings`, `$bins`, `$sql`, `$filters`,
`$scenario` expansion in `services/sqlExpander.ts`) MUST be built through plain
string replacement/templating only.
**Rationale**: `eval()` over YAML- and filter-influenced content is an injection
risk and defeats static review of how SQL is constructed.

### IV. YAML Parsed at Runtime
`dashboard-config.yaml`, `dashboard-*.yaml`, `summarize.yaml`, and `manifest.yaml`
MUST be fetched and parsed at runtime with `js-yaml`. Dashboard structure and panel content MUST NOT
be pre-processed, inlined, or baked in at build time.
**Rationale**: lets model teams add or edit dashboards and scenarios without a
dashboard rebuild or redeploy.

### V. Parquet-Only Browser Data I/O
The browser MUST read only Parquet or GeoParquet files. CSV, OMX, GeoJSON, and
shapefile formats MUST NOT be read in the browser. Any conversion from those
formats happens offline in the Python post-processor before results are published
to `public/scenarios/` or `public/observed/`.
**Rationale**: bounds browser-side query performance and memory, and keeps the
Python pipeline the single authoritative place responsible for format
correctness.
**Status**: binding as written until the data-path decision recorded under
"Open Decisions" is made. That decision may change this principle.

### VI. Fixed Technology Choices
Maps MUST use MapLibre GL; Mapbox GL MUST NOT be used. The build tool is Vite;
Webpack MUST NOT be used. The app MUST NOT use `localStorage` or `sessionStorage`
for any state. The UI layer — once React is adopted per Principle I, not
before — MUST use Tailwind CSS for styling, shadcn/ui (built on Radix UI
primitives) for component primitives, and `lucide-react` for icons; no other
CSS framework, component library, or icon set MUST be introduced instead.
**Rationale**: MapLibre stays compatible with `@deck.gl/mapbox`'s
`MapboxOverlay` without Mapbox's licensing/token requirements; Vite is required
for the Web Worker (`format: 'es'`) and DuckDB-WASM wiring already validated in
this project; avoiding Web Storage keeps state explicit and inspectable in
`state/appState.ts` and `state/filterState.ts`; Tailwind + shadcn/ui + Radix +
`lucide-react` is decided now, ahead of whichever feature first adopts React
(Principle I), so that work starts on a settled foundation instead of a
separate framework-choice debate once React lands — `lucide-react` also already has
precedent in a sibling WFRCAnalytics-org repo (`APP-Project-Scoresheet`).

### VII. Minimal, Fixed Config File Set
Exactly four config file types exist:
- `dashboard-config.yaml` — the site-level file, in the manner of Quarto's
  `_quarto.yml`: deployer settings for the whole site (identity, defaults for
  viewer preferences, which Settings tabs show, the assistant, outside
  services, data meaning, app-wide limits) and the ordered list of pages.
  Settings cascade site → page → panel, the most specific winning: a key set
  in `dashboard-config.yaml` applies everywhere, a `dashboard-*.yaml` may
  override it for its page, and a panel may override it for itself.
- `dashboard-*.yaml` — tab layout and panels, with the first file listed in
  `dashboard-config.yaml` serving as the landing page.
- `summarize.yaml` — post-processor sources, mappings, bins, `sql_fragments`,
  metrics → Parquet.
- `manifest.yaml` — per-scenario metadata.

`topsheet.yaml`, `summarize-preprocessor.yaml`, and
`services/observedRegistry.ts` MUST NOT be created — join logic lives in
`summarize.yaml`'s `sql_fragments`, and observed-data plus scenario
registration lives in `services/scenarioDiscovery.ts`. New deployer settings
MUST be added to `dashboard-config.yaml` (or a panel's own keys), never to
`index.json` and never as a constant in code when a deployer could reasonably
want to choose the value. The `index.json` files are generated discovery
listings (a static host cannot list a folder), not config. A viewer's own
preferences stay session-only (Principle VI).
**Rationale**: prevents config sprawl and duplicated responsibility across files
that would otherwise do the same job. The site settings had grown into
`index.json`, an undocumented JSON file that was a fourth config file in
practice; naming it, putting it in YAML with the other three, and giving it a
cascade is more honest than leaving it hidden, and a single YAML file is easy
for a Python or R package to write.
**Status**: `dashboard-config.yaml` is built (066): one schema table in
`src/config/schema.ts` drives loading, validation, the cascade and the generated
`project-docs/CONFIG-REFERENCE.md`. `index.json` carries no setting any more. The
parts of `project-docs/CONFIGURATION.md` not yet built (panel defaults, the `network`
block, brand.yml, the check command) remain targets.

### VIII. Reuse Proven Reference Implementations
When implementing DuckDB-WASM/Arrow wiring, MapLibre + flowmap.gl/deck.gl
overlays, spatial-SQL/GeoParquet handling, or Vite + coi-serviceworker setup,
implementers MUST first look to copy the proven pattern from the designated
reference repositories rather than re-deriving the approach from scratch:
`ar-puuk/omx-viewer` (DuckDB-WASM init, Arrow handoff, Vite config,
coi-serviceworker, GH Actions), `WFRCAnalytics/APP-Commute-Explorer`
(MapboxOverlay + FlowmapLayer + MapLibre wiring, hover/pick pattern),
`ar-puuk/spatial-sql-explorer` (DuckDB spatial extension lazy-load, MapLibre
choropleth, basemap switching), `ar-puuk/parquet-viewer` (GeoParquet metadata
detection, `registerFileBuffer`, spatial extension fallback, buffer-pool
collision fix), and `WFRCAnalytics/APP-WFRC-Commute-Patterns` (real,
production `setStyle()` + `transformStyle` basemap switching alongside a
non-interleaved `MapboxOverlay`, confirmed to survive the switch without
explicit remove/re-add — the pattern `011-basemap-style-system`'s own
`FlowMapPanel.tsx` basemap-application effect reuses directly).

Separately, `simwrapper/simwrapper` (github.com/simwrapper/simwrapper) is a
standing reference to CONSIDER — not a mandate to adopt — for
architectural and UX decisions on future dashboard/panel features. It
solves the same domain problem this app does (ABM/TDM model-output
visualization) with different underlying data/storage technology (Vue, not
React; its own project/config-discovery convention, not this project's
DuckDB-WASM + Parquet + `dashboard-*.yaml` set), which makes it
architecturally comparable for panel-layout, navigation, and UX questions
even where its specific implementation choices diverge from this project's
own fixed ones (Principle VI). Implementers MAY consult it when a
design decision has more than one reasonable answer; nothing in this
principle requires copying any of its patterns, and it does not relax or
extend the MUST-copy requirement above, which applies only to the
first list.
**Rationale**: these patterns are already validated in production-like use;
re-deriving them risks reintroducing bugs (e.g., buffer-pool collisions) those
repos already fixed. `simwrapper/simwrapper` carries a different, lighter
weight deliberately: it is a proven production peer solving the same
domain problem, not a pattern validated against this project's own stack,
so it informs design judgment rather than supplying code to copy.

### IX. Fixed Python/JS Source Split
The Python package MUST live at `python/wftdm_dashboard/`. `src/` is reserved
exclusively for the JS dashboard app. `src/wftdm_dashboard/` (or any other Python
package code under `src/`) MUST NOT be recreated.
**Rationale**: the package previously lived at `src/wftdm_dashboard/` while
`CLAUDE.md` and other docs described `python/wftdm_dashboard/`, and the two
source layouts had already drifted (a stale `uv_build` default `module-root` of
`src/`, and gitignore/editor-exclude entries pointing at the wrong static-build
path). Fixing this once and pinning it here prevents the two trees from silently
re-diverging as new Python or JS files are added.

### X. Delivery Targets: Python Library and R Package
The dashboard is delivered as a **static bundle plus YAML configuration** (and
Parquet data), wrapped by two packages: a Python library
(`python/wftdm_dashboard/`, Principle IX) and an R package. Both are targets,
equally. Neither package may contain application logic: they place the bundle,
write or validate the YAML, run the data steps that exist, and serve or open
the result. The bundle MUST NOT depend on the URL it is served from (no
build-time base path in the shipped artifact), and configuration MUST be plain
YAML and JSON that either language can write. The R package does not exist yet;
its location is fixed when it is created, and it MUST NOT live under `src/`.
Today's build still sets a base path (`vite.config.ts`), which breaks the URL
rule; removing it is `project-docs/CONFIGURATION.md` phase A.
**Rationale**: the dashboard's users run their models from R as well as Python,
and one bundle with one configuration format avoids two diverging apps.

## Open Decisions (non-binding records)

These are questions the maintainers have deliberately left open. They record
the state of the thinking, so nobody builds on a guess. Nothing here changes a
principle until it is decided and this file is amended.

### Data path: pre-processed, or read directly from the model's output?
Today the Python post-processor reads the model's output, writes summary
Parquet, and the dashboard reads only that (Principles V and VII,
`summarize.yaml`). The alternative is for the dashboard to read the model's raw
output directly, with no pre-processing step before the dashboard.
- **Not decided.** The current design stays as it is.
- **Leaning**: direct reading, as simpler for a model team to use. It may be
  given up if it costs enough to make the dashboard unusable (load time,
  memory, formats the browser cannot read well).
- **How it will be decided**: once real WFRC activity-based model output is
  available, both approaches are built and tested on two branches, and one is
  chosen. Principle V, the post-processor, `summarize.yaml`, and the chart data
  adapters (`src/charts/data/adapt.ts`) are all affected, so none is to be
  reworked for either approach on `main` before then.
- A branch built for this test may break Principle V, because that is what it
  tests. This entry is the record of that. Nothing from such a branch merges
  to `main` without amending this constitution first.

### Observed data
Observed data (counts, surveys, the calibration targets) has not been worked
on. Its format, where it comes from and how it relates to model runs are not
known. `public/observed/` and the "observed" run kind exist as placeholders
only. To be considered separately, after or alongside the data-path decision,
and not designed here.

## Technology Stack Reference

The following choices are binding, not suggestions — deviating from any of them
requires amending this constitution first:

| Layer | Technology |
|---|---|
| Build | Vite, TypeScript (ES2022 target); React not yet adopted — arrives with whichever feature first needs it, styled with Tailwind CSS + shadcn/ui (Radix UI primitives), icons via `lucide-react` |
| Query — browser | DuckDB-WASM in a Web Worker |
| Query — offline | Python DuckDB (`uv run`) |
| Charts — default | Observable Plot (`@observablehq/plot`) — `057-observable-plot-conversion` moved every real demo bar/distribution chart off the retired chart library/the retired chart library onto it; both remain registered, supported panel types (the retired chart library/the retired chart library), just no longer used by real demo content |
| Charts — Sankey | D3 (`d3-sankey`) — no genuine Observable Plot Sankey support exists (no mark/transform, no documented composition pattern, an unresolved upstream request since 2022) |
| Charts — Hierarchical | D3 (`d3-hierarchy`/`d3-shape`) — no genuine Observable Plot treemap/sunburst support exists either (confirmed by direct source search, not assumed); SVG is built via plain `document.createElementNS()`, never `d3-selection`/`d3-transition`, matching the Sankey panel's own established convention |
| Charts — Pie/Radar | D3 (`d3-shape`) — no genuine Observable Plot pie/polar support exists either (confirmed by direct source search: no `arc`/`pie` mark, no polar coordinate system); the pie chart reuses the already-pinned `d3-shape` (`d3.pie()`/`d3.arc()`), the radar chart uses hand-rolled polar trigonometry with no D3 layout package at all — SVG built via plain `document.createElementNS()`, matching the Sankey/Hierarchical panels' own established convention |
| Explore tab | The in-house chart builder (`065-chart-builder`: `src/explore/`, with its pure core in `src/charts/builder/`) — a grammar-of-graphics spec the app's own compiler draws as SVG, with DuckDB computing the data through the one shared connection; no chart library is added |
| Charts — Explore builder | Plain TypeScript drawing SVG (`src/charts/builder/compile.ts`) — Observable Plot has no dash channel, no hatch/pattern fills and no pie or polar marks, which the builder's channels need; icons are `lucide-react`, colours are the app's chart tokens only, and `kind: custom` draws the same spec in a dashboard tile |
| Graphic Walker (retired from navigation) | `@kanaries/graphic-walker` pinned to `0.4.82`; the `graphic-walker` panel type stays registered and its code stays in the repository, but the shipped demo and navigation no longer open it. Removal is a later decision (restorable from git history, e.g. the `v0.0.3` tag) |
| Maps | MapLibre GL (never Mapbox) |
| O-D flows | `@flowmap.gl/layers` + `@deck.gl/mapbox` (`MapboxOverlay`) |
| Config parsing | js-yaml, at runtime |
| File format | Parquet / GeoParquet only in the browser |
| Geometry | DuckDB spatial extension (`ST_Read`, `ST_AsGeoJSON`) |

Pinned peer dependency versions (must stay mutually compatible):
`@deck.gl/core`, `@deck.gl/layers`, and `@deck.gl/mapbox` `^9.0.0`,
`@flowmap.gl/layers` `^9.3.0`, `maplibre-gl` `^4.7.1`.

## Development Workflow

`project-docs/ARCHITECTURE.md` and `project-docs/SPEC.md` MUST be read before writing any code
against this repository. The navigation model is fixed: the Summary tab
(`dashboard-1-summary.yaml`) renders on scenario load, reading first from
`summary_kpis.parquet`, with other tabs and charts loading progressively as
their Parquet files register. New panels MUST follow the established panel
pattern — a React function component receiving a single `config` prop,
reading filter values via the `useFilterState` hook (`src/hooks/
useFilterState.ts`, wrapping `state/filterState.ts`'s pub/sub store with
`useSyncExternalStore`), and querying `services/duckdb.ts` by direct import
rather than an injected connection — and MUST be registered in
`panels/registry.tsx` (a panel-type-to-component map) rather than wired ad
hoc into layout code. *(Amended 2.2.0: the pattern was originally a
vanilla-JS factory function — `create(config, conn, filterState)` returning
`{ element, destroy }` — written before React was adopted; corrected now
that panels are next to be built, per `002-design-tokens`'s adoption of
React.)*

## Governance

This constitution supersedes ad hoc practice for the areas it covers. `CLAUDE.md`
and `project-docs/ARCHITECTURE.md`/`project-docs/SPEC.md` carry the day-to-day implementation
detail and reference patterns; where any of them conflicts with a principle
here, this constitution's non-negotiables govern and the conflicting document
MUST be corrected.

**Amendment procedure**: propose the change, update the affected principles or
sections in this file, bump the version per the rule below, and record the
change in a Sync Impact Report comment at the top of this file before merging.

**Versioning policy** (semantic versioning): MAJOR — a principle is removed or
redefined in a backward-incompatible way (e.g., dropping phase gating, allowing
Mapbox); MINOR — a new principle or section is added, or existing guidance is
materially expanded; PATCH — wording clarifications, typo fixes, or other
non-semantic refinements.

**Compliance review**: pull requests and code reviews MUST verify there is no
violation of these principles — no new plain `.js` files in `src/` (TypeScript
is the standard), no React usage introduced speculatively ahead of an actual
UI need (Principle I), no `eval()`, no main-thread DuckDB-WASM use, no
forbidden config files, no Mapbox/Webpack/Web Storage usage. Any exception
requires a
prior amendment to this document, not a one-off waiver in review.

**Version**: 2.8.1 | **Ratified**: 2026-08-19 | **Last Amended**: 2026-10-28

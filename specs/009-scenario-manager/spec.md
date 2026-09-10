# Feature Specification: Scenario Manager (local folder loading)

**Feature Branch**: `009-scenario-manager`

**Created**: 2026-09-01

**Status**: Draft

**Input**: User description: "Add the manual 'load a local scenario folder' capability this project has deferred since 001-data-state-layer — services/duckdb.ts's registerScenario(name, dirHandle) has existed since that feature with zero callers anywhere in the codebase. Uses showDirectoryPicker() (Chrome/Edge). Once a folder is picked: read manifest.yaml from that folder, extract the scenario's display name/metadata, then call registerScenario(name, dirHandle) and appState's register()/setActive() to make the scenario show up and become active alongside auto-discovered ones. A 'Load Local Scenario' trigger needs a home in the UI near the tab bar. Handle real edge cases: name collision, missing manifest.yaml/summary/, multiple simultaneous local folders. Out of scope: locally-loaded scenarios can't be represented in a shareable ?s= URL. Does not include the wftdm-dashboard serve/here local-server mode — only the WEB/showDirectoryPicker() path."

## Documented behavior findings (pre-spec verification)

Verified directly against `project-docs/ARCHITECTURE.md`, `project-docs/SPEC.md`, and the real
`src/services/duckdb.ts` / `src/services/yamlLoader.ts` / `src/state/appState.ts` /
`src/services/scenarioDiscovery.ts` / `src/main.tsx` before writing this spec,
same discipline every panel-type feature since 005 has required — applied
here to a data/state-layer feature instead:

1. **The folder-picker trigger is a WEB-deployment-mode capability, not a
   universal one.** `project-docs/ARCHITECTURE.md`'s "Hosted web app" paragraph says
   "Analysts can additionally load local scenario folders via
   `showDirectoryPicker()` (Chrome/Edge)" — this sentence sits specifically
   under the hosted-web-app deployment mode, not the `wftdm-dashboard
   serve`/`here` modes. `project-docs/SPEC.md`'s deployment-detection snippet is
   explicit that the two modes use two different loading mechanisms
   entirely: `LOCAL` (`hostname === 'localhost'`) uses `registerFileURL()`
   against a local Python file server; `WEB` (hosted) uses
   `showDirectoryPicker()`. This resolves the feature description's own
   open question: the trigger MUST be hidden in `LOCAL` mode, not merely
   disabled-with-a-message — that mode already has its own file-serving path
   for reaching scenario data, and the File System Access API's
   folder-picker flow has no role to play there.
2. **No `LOCAL`/`WEB` deployment-mode detection exists anywhere in the
   codebase yet.** Confirmed by direct search — `src/main.tsx` and
   `src/services/scenarioDiscovery.ts` contain no `hostname`/`localhost`
   check at all. `project-docs/SPEC.md`'s deployment-detection snippet is
   documented intent, not yet-built code. This feature is the first to
   need it, and must add the check itself (a small, self-contained
   `hostname === 'localhost'` test) rather than assuming it already exists
   somewhere to import.
3. **`services/yamlLoader.ts`'s `loadConfig`/`loadManifest` cannot be reused
   as-is.** Both are `fetch(url)`-only (`export async function
   loadConfig(url: string)`); neither accepts a `FileSystemFileHandle` or
   any directory-handle-relative reading. A new function is required to
   read `manifest.yaml` via the picked directory handle's own file-reading
   API (`dirHandle.getFileHandle('manifest.yaml')` →
   `.getFile()` → `.text()`), then parse with the same `js-yaml` `load()`
   call `loadConfig` already uses — the parsing logic is shared, the I/O
   mechanism is not.
4. **`registerScenario(name, dirHandle)` (`services/duckdb.ts`) and
   `appState`'s `register()`/`setStatus()`/`setActive()` already exist,
   are already exported, and already document this exact call pattern in
   their own code comments** — confirmed by reading the real
   implementations, not assumed from the feature description's framing.
   `registerScenario`'s docstring literally says "(`showDirectoryPicker()`
   mode)". Both are reused completely unmodified; this feature's only new
   code is the UI trigger, the picker/manifest-reading glue, and the
   deployment-mode + collision decisions below.
5. **`appState.ts` is deliberately pull-based, not pub/sub** (its own file
   header: "No pub/sub here (unlike `filterState.ts`) — no FR requires it;
   reads are pull-based only"). Every existing panel type reads
   `appState.getActive()` **inside its data-fetch effect**, which only
   re-runs when that panel's `config`/`filters` dependency changes —
   confirmed by reading `PlotlyPanel.tsx`/`TablePanel.tsx`/
   `ValueBoxPanel.tsx`/`ObservablePlotPanel.tsx`/`SankeyPanel.tsx`, all of
   which call `appState.getActive()` the same way. **Activating a newly
   loaded local scenario does not, by itself, cause any already-mounted
   panel to re-query** — nothing today changes a panel's `config` or
   `filters` when `appState`'s active-scenario set changes. Without a
   deliberate fix, "the scenario becomes active" and "the scenario visibly
   shows up in already-open charts" are two different, decoupled outcomes.
   This is flagged explicitly here — as an FR, not left implicit — so it
   is decided during planning with real reasoning, not discovered later as
   a "why doesn't my loaded scenario show up" bug (the same discipline the
   008 self-loop correction required).
6. **No scenario-list/toggle UI exists anywhere yet.** `sidebar.tsx` and
   `scenario/scenarioManager.ts` are both listed in `CLAUDE.md`'s file tree
   as "not built yet — no feature has needed it." Today, the *only* way a
   scenario becomes active is: `observed` (always forced active at
   startup) or a published scenario named in a `?s=` URL param — there is
   no click-to-activate control anywhere in the running app. This feature
   does not need to build that general-purpose control (out of scope,
   still deferred — see Assumptions), but it does need *some* minimal,
   visible confirmation that a locally loaded folder registered
   successfully (or failed), since there is no pre-existing UI surface
   this feature could otherwise piggyback on.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Analyst loads a local scenario folder from the hosted web app (Priority: P1)

An analyst is viewing the hosted dashboard (not `localhost`) with a model run
on their own machine that hasn't been published to `public/scenarios/`. They
click a "Load Local Scenario" control near the tab bar, pick that run's
folder via the browser's native folder picker, and the dashboard reads its
`manifest.yaml`, registers its `summary/*.parquet` files as queryable views,
and makes it active — its data now appears in every panel that isn't scoped
to a single other scenario, without a page reload.

**Why this priority**: This is the entire reason this feature exists — the
capability `services/duckdb.ts`'s `registerScenario()` has been sitting
ready for since `001-data-state-layer`, with zero callers until now.

**Independent Test**: Can be fully tested by picking a fixture folder with a
valid `manifest.yaml` and `summary/*.parquet` files and confirming its name
appears as an active, queryable scenario, and that an already-rendered panel
whose `scenario:`/`scenarios:` config doesn't pin it to something else
updates to include the new scenario's data.

**Acceptance Scenarios**:

1. **Given** the hosted web app (non-`localhost`) with at least one other
   scenario already active, **When** the analyst clicks "Load Local
   Scenario" and picks a valid folder, **Then** the folder's
   `manifest.yaml`-declared name (or the folder's own name if
   `manifest.yaml` is missing/unreadable — see Edge Cases) appears as a new,
   active scenario, and panels not pinned to a specific scenario re-query to
   include it.
2. **Given** a folder whose `manifest.yaml` declares `scenario_name: foo`,
   **When** it finishes registering, **Then** its Parquet views are queryable
   under the `foo__*` naming convention, identical to a published scenario's.
3. **Given** the analyst cancels the native folder-picker dialog without
   choosing a folder, **When** the dialog closes, **Then** no scenario is
   registered and no error is shown — a cancellation is not a failure.

---

### User Story 2 - Unsupported browser sees a clear, non-broken control (Priority: P2)

An analyst opens the hosted dashboard in Firefox or Safari, neither of which
implements `showDirectoryPicker()`. The "Load Local Scenario" control is
visibly present but disabled, with an explanation — not a silent no-op,
not a thrown exception, not a control that looks clickable but does nothing.

**Why this priority**: `project-docs/ARCHITECTURE.md` documents this as a
Chrome/Edge-only capability; every other feature in this project treats a
known browser-support boundary as something to surface clearly, not paper
over (e.g. `MarkdownPanel`'s sanitization, `SankeyPanel`'s error state).

**Independent Test**: Can be fully tested by simulating the absence of
`window.showDirectoryPicker` and confirming the control renders in a
disabled state with an explanatory message, still leaving every other part
of the dashboard fully usable.

**Acceptance Scenarios**:

1. **Given** a browser without `showDirectoryPicker()` support, **When** the
   dashboard loads, **Then** the "Load Local Scenario" control is disabled
   and shows a tooltip/message naming the capability as Chrome/Edge-only,
   rather than being hidden entirely or throwing when clicked.
2. **Given** the same unsupported browser, **When** the analyst uses the rest
   of the dashboard (auto-discovered scenarios, tabs, panels), **Then**
   nothing else is affected — this is a localized, additive capability.

---

### User Story 3 - Analyst manages multiple loaded local scenarios (Priority: P3)

An analyst loads two different local scenario folders in the same session
for side-by-side comparison, sees both listed with their status, and can
remove one they no longer need without reloading the page or losing the
other.

**Why this priority**: The project's own README already documents that
"multiple scenarios can be loaded simultaneously for side-by-side or
overlaid comparison" — this story confirms that promise holds for locally
loaded scenarios specifically, and gives the analyst a way to undo a load
without a full page refresh (which would also lose every other in-memory
selection).

**Independent Test**: Can be fully tested by loading two distinct local
folders in one session, confirming both are simultaneously active and
queryable, then removing one and confirming its views are dropped while the
other remains untouched.

**Acceptance Scenarios**:

1. **Given** one local scenario already loaded and active, **When** the
   analyst loads a second, differently named local folder, **Then** both are
   simultaneously active — the first is not replaced or deactivated.
2. **Given** two locally loaded scenarios, **When** the analyst removes one
   via its listed control, **Then** its views are unregistered and it stops
   contributing to panel queries, while the other locally loaded scenario
   and every auto-discovered scenario are unaffected.

---

### Edge Cases

- **What happens when the picked folder's declared/derived name collides
  with an already-registered scenario?** Two distinct cases, resolved with
  different answers:
  - Collides with an already-registered **published** scenario
    (`source: 'url'`, from `public/scenarios/`) — **rejected.** The load
    MUST fail with a clear, visible error naming the conflict, and MUST NOT
    replace the published scenario's views or metadata. Silently
    overwriting a published, potentially currently-in-use scenario with an
    unrelated local folder that merely shares its name would be a silent
    data-integrity problem, not a convenience.
  - Collides with an already-registered **local** scenario of the same name
    (i.e. the analyst re-picks the same-named folder again) — **allowed,
    replaces cleanly.** This matches `appState.register()`'s and
    `services/duckdb.ts`'s `registerScenario()`'s own existing documented
    behavior ("re-registering the same name replaces the prior entry/views
    cleanly, no merge") — the natural "refresh this scenario's data" path,
    not a case those functions need to be changed to support.
- **What happens when the picked folder has no `manifest.yaml`, or it fails
  to parse?** Non-blocking — registration proceeds using the folder's own
  name (`dirHandle.name`) as the scenario's display name, with no
  `runDate`/`color`/`notes` metadata, and a console warning is logged. This
  mirrors `scenarioDiscovery.ts`'s existing fail-soft precedent for a
  per-scenario registration problem (`registerPublishedScenarios`'s
  `catch` block) rather than blocking the whole load over missing metadata
  that isn't required for the scenario's data to be queryable.
- **What happens when the picked folder has no `summary/` subfolder, or it
  contains no `.parquet` files?** Blocking for that scenario specifically —
  `registerScenario()` already throws when `summary/` doesn't exist; this
  is surfaced as a failed status on that scenario entry (visible, not
  silently dropped) rather than a page-level error, and the scenario is not
  activated. This is a harder failure than the missing-manifest case because
  there is no queryable data at all to fall back to.
- **Can multiple local folders be loaded simultaneously?** Yes (User Story
  3) — `appState`/`services/duckdb.ts` both already namespace exclusively by
  `name`, with no single-active-local-scenario constraint anywhere in
  either module.
- **Does a newly activated local scenario appear in already-rendered
  panels without a manual page reload?** MUST, yes — but this does not
  happen automatically today (see Documented behavior findings #5:
  `appState` is pull-based, panels only re-query on their own
  `config`/`filters` change). The specific mechanism used to make this true
  is a planning-phase decision — see Assumptions — but the requirement
  itself (FR-008) is fixed here, not left to be discovered as a gap later.
  **The mechanism is constrained, not open-ended**: it MUST NOT come at the
  cost of resetting a panel's own local UI state as a side effect (see
  FR-008 below) — a naive fix (e.g. remounting every panel on the active
  tab) would silently regress `004-panel-expand-dialog`'s and
  `007-observable-plot-panel`'s own hard-won guarantees that a panel's
  local state survives transitions unrelated to its own data (dialog
  expand/collapse, unrelated filter changes). Scenario activation is
  exactly that kind of unrelated transition from an individual panel's
  point of view.
- **What happens to a locally loaded scenario if the analyst reloads the
  page?** It is lost — there is no persistence layer (constitution
  Principle VI forbids Web Storage, and a `FileSystemDirectoryHandle`
  cannot be serialized into a shareable `?s=` URL param either way). The
  analyst must re-pick the folder. This is a known, accepted limitation,
  not a gap this feature solves (see Assumptions).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The dashboard MUST provide a "Load Local Scenario" control
  positioned near the tab bar (dashboard-wide, not inside any specific
  panel), visible only when the app is running in `WEB` deployment mode
  (`window.location.hostname !== 'localhost'`) — hidden entirely, not
  merely disabled, in `LOCAL` mode, since that mode has its own file-serving
  path already (Documented behavior findings #1).
- **FR-002**: In a browser without `showDirectoryPicker()` support, the
  control MUST render in a disabled state with an explanatory message
  naming the capability as Chrome/Edge-only, rather than being hidden or
  throwing when interacted with.
- **FR-003**: Clicking the control (where supported) MUST invoke
  `window.showDirectoryPicker()`. A user-cancelled picker MUST be treated
  as a no-op — no error shown, no partial registration.
- **FR-004**: On a folder selection, the system MUST attempt to read
  `manifest.yaml` from the picked directory handle directly (not via
  `fetch`) and extract its `scenario_name`/`run_date`/`color`/`notes`
  fields where present, using the same YAML-parsing logic
  `services/yamlLoader.ts` already uses for other config files.
- **FR-005**: If `manifest.yaml` is missing or fails to parse, the system
  MUST fall back to the picked folder's own name as the scenario's display
  name and proceed with registration using no further metadata, logging a
  console warning — this MUST NOT block registration (see Edge Cases).
- **FR-006**: The system MUST reject a load whose resolved scenario name
  collides with an already-registered **published** (`source: 'url'`)
  scenario, surfacing a clear, visible error and registering nothing. A
  collision with an already-registered **local** scenario of the same name
  MUST be allowed and replace that entry cleanly (see Edge Cases).
- **FR-007**: On a name that clears FR-006, the system MUST call
  `appState.register()` (with `source: 'handle'`), then attempt
  `services/duckdb.ts`'s existing `registerScenario(name, dirHandle)`. On
  success, it MUST call `appState.setStatus(name, 'ready')` followed by
  `appState.setActive(name, true)` — a locally loaded scenario is activated
  immediately, unlike a published scenario (which requires a `?s=` URL
  param today), because picking a folder is itself an explicit,
  one-scenario-at-a-time opt-in action. On failure (e.g. no `summary/`
  subfolder, no `.parquet` files within it), it MUST call
  `appState.setStatus(name, 'failed')` and MUST NOT call `setActive` —
  the entry remains registered and visibly marked failed, not silently
  dropped (see Edge Cases).
- **FR-008**: A local scenario transitioning to active MUST become visible
  in the data of every already-rendered panel on the currently active tab
  whose configuration doesn't pin it to other specific scenarios, without
  requiring a full page reload or a manual tab switch away and back, **and
  without discarding any other panel's own local UI state** (e.g.
  `TablePanel`'s current sort/search/page, `ObservablePlotPanel`'s
  panel-local `inputs:` values, an unrelated panel's own in-progress
  loading/error status) as a side effect of the refresh. The exact
  mechanism achieving this is a planning-phase decision (Documented
  behavior findings #5; Assumptions) — but a mechanism that satisfies the
  first half of this requirement by violating the second (e.g. a blanket
  remount of every panel on the tab) does not satisfy FR-008.
- **FR-009**: The system MUST provide a visible list of currently loaded
  local scenarios (name + status: registering/ready/failed) near the "Load
  Local Scenario" control, each with a control to remove it — removal MUST
  call `services/duckdb.ts`'s `unregisterScenario(name)` and
  `appState.unregister(name)`, dropping its views and metadata without
  affecting any other scenario (local or auto-discovered).
- **FR-010**: Locally loaded scenarios MUST NOT be representable in a
  shareable `?s=` URL — this is an inherent limitation of the File System
  Access API's handle model (a directory handle cannot be serialized into a
  URL), stated explicitly as out of scope rather than a gap to close.

### Key Entities

- **Locally loaded scenario**: a `Scenario` (existing `appState.ts` entity)
  whose `source` is `'handle'` — same shape, same registry, same
  `name__metric` view-naming convention as an auto-discovered scenario;
  distinguished only by how it entered the system (a picked
  `FileSystemDirectoryHandle`, not a fetched URL) and by being removable
  interactively (FR-009), which no existing scenario type currently
  supports.
- **Deployment mode**: `LOCAL` (`hostname === 'localhost'`) vs. `WEB`
  (everything else) — a new, small runtime check this feature introduces
  (Documented behavior findings #2), gating FR-001's control visibility.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An analyst on the hosted web app can load a local scenario
  folder and see its data reflected in an already-open, unpinned panel
  within one picker interaction — no page reload, no manual tab switch.
- **SC-002**: 100% of picker cancellations produce no error and no partial
  scenario registration.
- **SC-003**: In a browser without File System Access API support, the
  control is visibly disabled with an explanation, and every other
  dashboard capability remains fully functional.
- **SC-004**: Two distinct local scenario folders can be loaded in the same
  session and both remain simultaneously queryable; removing one leaves the
  other, and every auto-discovered scenario, unaffected.
- **SC-005**: A name collision with a published scenario is rejected with a
  visible error and zero mutation of the published scenario's views or
  metadata, in 100% of attempts.

## Assumptions

- **FR-008's exact reactivity mechanism (how an already-rendered panel
  comes to re-query after a local scenario activates) is a planning-phase
  design decision, not fixed here** — but planning MUST weigh both real
  candidates honestly against FR-008's no-side-effect-state-loss clause,
  not default to whichever needs the least new code:
  - **Key-based remount** (bump a scenario-generation counter, use it as
    part of the active tab's `key` so React unmounts/remounts every panel
    on that tab): requires zero `appState.ts` changes, but its real cost is
    not "simplicity" — it is a genuine regression against
    `004-panel-expand-dialog`'s and `007-observable-plot-panel`'s own
    hard-won "don't reset panel-local state on an unrelated transition"
    guarantees. A remount resets `TablePanel`'s sort/search/page,
    `ObservablePlotPanel`'s panel-local `inputs:` values, and any other
    panel's in-progress loading/error status on the whole tab — not just
    the panels whose data actually changed.
  - **`appState` pub/sub mirroring `filterState.ts`'s already-proven
    pattern** (a `subscribe(fn)`/notify-on-change addition to `appState.ts`,
    consumed via a hook modeled on `useFilterState`'s existing
    `useSyncExternalStore` shape): requires real, if small, changes to
    `appState.ts`'s contract and every panel's data-fetch effect
    (subscribing to scenario-set changes the same way panels already
    subscribe to filter changes), but preserves every panel's local state
    exactly — panels re-query without unmounting, the same guarantee
    `useFilterState` already provides for a filter change today. Every
    panel type already knows how to consume this shape (`useFilterState`'s
    `useSyncExternalStore` pattern is not new to write against), which
    weighs against "extending `appState.ts`" being treated as the more
    expensive option merely because it touches more files.
  
  Research.md MUST make this call with reasoning grounded in the above,
  not default to remount just because it requires no `appState.ts`
  changes — the same discipline `008-sankey-panel`'s self-loop correction
  required for a different kind of premise error.
- **This feature builds a minimal loaded-scenario list (FR-009), not a
  general-purpose scenario sidebar/toggle UI.** `sidebar.tsx` and
  `scenario/scenarioManager.ts`'s fuller intended scope (per `CLAUDE.md`'s
  file tree) remain explicitly deferred beyond this feature — this feature
  adds only what FR-009 requires (a name/status list with a remove
  control) as a home for locally loaded scenarios specifically, not a
  toggle for published/observed scenario activation, which still has no UI
  anywhere in the app and remains out of scope here.
- No persistence of locally loaded scenarios across a page reload —
  consistent with constitution Principle VI (no Web Storage) and the File
  System Access API's own handle model; the analyst must re-pick after a
  reload (see Edge Cases).
- The `wftdm-dashboard serve`/`here` local-server mode (`project-docs/SPEC.md`'s
  `LOCAL` branch) is unaffected and out of scope — this feature is the
  `WEB`/`showDirectoryPicker()` path only, per the feature description's
  own explicit scoping.
- `services/duckdb.ts`'s `registerScenario(name, dirHandle)` and
  `appState.ts`'s `register()`/`setStatus()`/`setActive()`/`unregister()`
  are reused completely unmodified (Documented behavior findings #4) — no
  change to either module's contract is anticipated by this feature.

# Feature Specification: WebGL Context Management for Multi-Map Dashboards

**Feature Branch**: `012-webgl-context-management`

**Created**: 2026-09-01

**Status**: Draft

**Input**: User description: "Fix a real, confirmed bug: a dashboard tab with multiple flowmap panels can exceed the browser's concurrent WebGL context limit, silently losing context on the earliest-mounted panels (their canvases render nothing, with no visible error). Chromium's real desktop limit is 16 contexts; this project's non-interleaved MapboxOverlay setup uses 2 real WebGL contexts per flowmap panel, so the real production ceiling is ~8 simultaneous panels on one tab. Research and design, in priority order: (1) deck.gl's native View system, which may let multiple panels share one deck.gl context; (2) interleaved mode, which halves context cost per panel but reopens the setStyle()-wipes-custom-layers risk 011 already solved for non-interleaved mode, needing its own empirical proof; (3) viewport-gated mounting (IntersectionObserver), which must be proven safe against 004's persistent-DOM-node expand/collapse mechanism; (4) webglcontextlost/webglcontextrestored detection, built regardless of what else is chosen, turning today's silent failure into an honest, distinct status. Whichever combination is chosen must be proven by a real empirical test against this project's own pinned versions, not assumed safe from design alone. Out of scope: switching away from MapLibre; building ZoneMapPanel itself."

---

**REMOVED (later, deliberate project decision — not a bug fix):** the
context-loss DETECTION/RECOVERY portion of this feature — item (4) above,
and everything it produced (`FlowMapPanel.tsx`'s `contextLost` state, its
`webglcontextlost`/`webglcontextrestored` listeners, the "Map context
lost" banner, and `layerRepopulateGeneration`'s context-restore-triggered
call site) — was removed entirely from `FlowMapPanel.tsx`. This was
**explicitly not** motivated by the separate flowmap line-jaggedness/
antialiasing investigation happening around the same time (see
`docs/PIPELINE.md`'s own entry on that investigation for the unrelated
finding it left on record). Item (2), interleaved mode itself, and
`layerRepopulateGeneration`'s other (basemap-switch) trigger, are
**unchanged** — neither ever depended on the removed recovery code. This
document, and the rest of this spec folder, are left as-is below as the
historical record of what this feature actually built at the time — see
`CLAUDE.md`'s own "Map panels" section and `FlowMapPanel.tsx`'s file-tree
entry for the fuller account of the removal itself.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Every configured map panel on a tab shows a working basemap (Priority: P1)

An analyst opens a dashboard tab that an author has configured with several flowmap panels (for example, six O-D desire-line panels comparing different trip purposes side by side). Today, once the tab has enough map panels, the browser silently discards the WebGL rendering context on the earliest-mounted panels — their canvases render nothing, with no error, no different from an intentionally blank basemap. With this feature, every map panel the author configured on that tab renders a working basemap, up to a documented capacity the app itself is designed for.

**Why this priority**: This is the actual production bug driving the feature. Without it, dashboard authors cannot reliably build a tab with more than a handful of map panels — the failure is silent and looks exactly like "the basemap feature (011) doesn't work," which erodes trust in a feature that, in isolation, already works correctly.

**Independent Test**: Configure a dashboard tab with a realistic multi-panel set of flowmap panels (matching the count already used in this project's own "Basemaps" fixture tab, and up to whatever higher capacity this feature's design settles on) and load it in a production build. Confirm every panel renders a working basemap — none render blank due to lost context.

**Acceptance Scenarios**:

1. **Given** a dashboard tab configured with multiple flowmap panels within the feature's documented capacity, **When** the tab is opened in a production build, **Then** every panel renders a working basemap, including the earliest-mounted ones.
2. **Given** the same tab, **When** the analyst switches away to a different tab and back, **Then** every panel still renders a working basemap on return, not just on first load.
3. **Given** a tab already at capacity, **When** the analyst also opens the panel-expand dialog (existing capability) on one of its panels, **Then** that panel's basemap and data overlay remain visible throughout the expand/collapse, with no other panel on the tab losing its own basemap as a side effect.

---

### User Story 2 - A lost map context is reported honestly, not confused with an intentionally blank basemap (Priority: P2)

A dashboard author or analyst encounters a map panel that isn't showing a basemap — either because the tab genuinely exceeds this feature's documented capacity, or because of an unrelated runtime hiccup. Today this looks identical to 011's own documented "unreachable basemap falls back to blank" behavior, so there's no way to tell "this is fine, no basemap was configured/reachable" apart from "something actually went wrong." With this feature, a panel whose map rendering context was lost shows a distinct, clearly-labeled status instead of silently matching the blank-style appearance.

**Why this priority**: This is the safety net for User Story 1 — even after raising the documented capacity, some deployment could still exceed it (more panels than anticipated, a lower-end device with a smaller browser context ceiling), and users need to be able to tell that case apart from ordinary, intentional blank-basemap behavior. Lower priority than User Story 1 because it's a diagnostic improvement, not the fix to the underlying capacity itself.

**Independent Test**: Force a map panel's rendering context to be lost (e.g., by exceeding the tab's panel capacity, or via a direct browser-level context-loss trigger in a test). Confirm the affected panel shows a distinct "context lost" status, visually and textually different from a panel whose basemap is blank by configuration or by an unreachable-source fallback (011).

**Acceptance Scenarios**:

1. **Given** a map panel whose rendering context is lost after having previously rendered successfully, **When** the loss occurs, **Then** the panel shows a distinct status indicating its map context was lost, not a silent blank canvas.
2. **Given** a map panel that is blank because no basemap was configured/reachable (011's own documented fallback), **When** compared side by side with a panel that lost its context, **Then** the two are visually and textually distinguishable from one another.
3. **Given** a panel showing the context-lost status, **When** the browser's own context-restoration mechanism fires for that panel, **Then** the panel recovers to a working basemap without requiring a full page reload, if the underlying browser/library behavior supports recovery; if it does not, the panel continues to show the honest lost-context status rather than reverting to a misleading blank appearance.

---

### User Story 3 - Expanding a map panel never regresses an already-working basemap (Priority: P3)

An analyst working with a multi-map-panel tab expands one panel into the existing full-size dialog view (004's own capability) to inspect it more closely, then collapses it back. Whatever mechanism this feature uses to fit more map panels onto one tab must not conflict with that existing expand/collapse capability — a panel that was rendering correctly before expansion must still be rendering correctly after collapsing back, and other panels on the same tab must be unaffected by one panel being expanded.

**Why this priority**: This is a regression-protection story, not new user-facing value on its own — 004 already shipped this guarantee for the expand/collapse mechanism itself. It's called out here because this feature's own design choices (specifically, if viewport-gated mounting is part of the chosen fix) create a new, specific risk of breaking that existing guarantee that didn't exist before this feature.

**Independent Test**: On a tab at or near this feature's documented panel capacity, expand a map panel into the dialog view, confirm it renders correctly there, collapse it, and confirm every panel on the tab (the one that was expanded, and every other one) still renders its basemap correctly afterward.

**Acceptance Scenarios**:

1. **Given** a map panel rendering correctly inline on its tab, **When** the analyst expands it into the dialog view, **Then** its basemap and data overlay continue rendering correctly inside the dialog, with no visible re-creation flicker or loss of the previously-rendered state.
2. **Given** a map panel expanded into the dialog view, **When** the analyst collapses it back to the inline card, **Then** it continues rendering correctly inline, and no other panel on the same tab is affected by the expand/collapse cycle.

---

### Edge Cases

- What happens when a tab is configured with more map panels than this feature's documented capacity? Panels beyond capacity MUST show the distinct context-lost/unavailable status from User Story 2 rather than a silent blank canvas indistinguishable from a working "no basemap configured" panel.
- What happens on a device or browser with a lower context ceiling than desktop Chromium's (e.g., a mobile browser)? The same context-loss detection and honest status reporting MUST apply uniformly — this feature does not special-case desktop vs. mobile capacity, only reports accurately for whatever ceiling the running browser actually enforces.
- What happens if a map panel loses its context while the analyst is actively interacting with it (panning/zooming)? The interaction MUST stop cleanly and the panel MUST show the context-lost status — no crash, no frozen/unresponsive panel, no error thrown to the rest of the tab.
- What happens when a panel that lost its context is on a tab the analyst then navigates away from and back to? Returning to the tab MUST give that panel a fresh opportunity to acquire a working context (subject to the same capacity constraints as any other panel mount), not permanently show the lost-context status for the rest of the session.
- What happens during rapid tab-switching that repeatedly mounts and unmounts several map panels in quick succession (if the chosen fix mounts/unmounts panels based on visibility)? This MUST NOT leak WebGL contexts over time — the number of concurrently held contexts after settling MUST match what's actually visible, not accumulate with each switch.
- What happens to a panel that already has an explicitly pinned basemap (011's own panel-/tab-level `basemap:`/`default_basemap:` precedence) when its context is lost and later recovered? It MUST come back with the same pinned basemap, not silently revert to the app's theme-paired default.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST detect when a map panel's rendering context is lost (whether due to exceeding the browser's concurrent context ceiling or any other cause) and distinguish that state from a panel that is blank because no basemap was configured or reachable (011's own documented fallback).
- **FR-002**: System MUST display a distinct, clearly-labeled status for a map panel in the context-lost state — visually and textually different from both a working basemap and an intentional blank-basemap panel.
- **FR-003**: System MUST reduce the number of concurrent WebGL rendering contexts consumed per map panel, per-panel cost, or overall tab-level footprint (the specific mechanism is a design decision for the planning phase, informed by the priority-ordered research directions already identified) such that a dashboard tab configured with at least as many map panels as this project's own existing multi-panel map fixture renders a working basemap on every one of them in a production build.
- **FR-004**: Whatever mechanism System uses to fit more concurrent map panels within the browser's context ceiling MUST NOT regress the existing panel-expand-to-dialog capability (a map panel's mounted rendering state MUST NOT be lost or recreated from scratch across an expand/collapse cycle).
- **FR-005**: Whatever mechanism System uses MUST NOT regress the existing basemap-style system (a map panel's basemap MUST continue to survive a light/dark theme switch, and pinned basemaps MUST continue to not be re-paired on theme change, exactly as already guaranteed).
- **FR-006**: Recovery from a lost context is not guaranteed in every case — whether it happens at all depends on which capacity-increasing mechanism is chosen and on the browser's own context-restoration behavior for causes outside this feature's control (User Story 2's own Acceptance Scenario 3). IF a map panel does recover from a lost context (whether through the browser's own context-restoration mechanism or through this feature's own re-mount mechanism), THEN System MUST re-apply that panel's correct effective basemap (its own pin, its tab's default, or the app's theme-paired default — the same three-level precedence already established) rather than silently falling back to a different basemap than the one that was showing before the loss. This requirement governs the correctness of a recovery when one occurs; it does not itself guarantee that recovery occurs.
- **FR-007**: System's chosen approach to reducing concurrent context usage (FR-003) MUST be validated by a real, automated test that exercises this project's own pinned map-rendering library versions and asserts the actual number of contexts in use and/or actual rendered basemap presence — not asserted as correct from design or documentation alone.
- **FR-008**: System MUST NOT change the base mapping library away from MapLibre, and MUST NOT require ZoneMapPanel (not yet built) to be built as part of this feature.

### Key Entities

- **Map Panel Rendering State**: The lifecycle state of one map-rendering panel's underlying rendering resources, now with a distinct "context lost" state alongside the existing "rendering," "loaded with basemap," and "blank by design/fallback" states (011).
- **Context Budget**: The practical ceiling on how many map panels a single dashboard tab can render simultaneously with a working basemap, given the browser's own enforced concurrent-WebGL-context limit and however many contexts this feature's chosen mechanism costs per panel. Not user-configurable; a property of the running browser and this feature's own design.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A dashboard tab configured with at least as many flowmap panels as this project's own existing multi-panel map fixture renders a working basemap on every one of those panels when opened in a production build — none render blank due to lost context.
- **SC-002**: When a map panel's context is lost for any reason, it is visually and textually distinguishable from a panel that is blank because no basemap was configured or reachable, in 100% of observed cases during testing. Separately, IF a panel does recover from a lost context during testing, its basemap after recovery correctly matches what it was showing before the loss, in 100% of observed recoveries — recovery itself is not guaranteed to occur in every case (FR-006); only its correctness when it does occur is measured here.
- **SC-003**: Expanding a map panel into the existing dialog view and collapsing it back never causes that panel, or any other panel on the same tab, to lose a previously-working basemap.
- **SC-004**: Toggling the dashboard's light/dark theme continues to correctly re-pair or preserve each map panel's basemap exactly as it did before this feature, with no new regression introduced by whatever context-reduction mechanism was chosen.
- **SC-005**: The chosen approach to reducing concurrent context usage is proven, before this feature is considered complete, by an automated test exercising the project's real pinned library versions — not merely asserted safe from design or third-party documentation alone.

## Assumptions

- **Capacity target is defined relative to this project's own existing fixture, not a fixed number chosen in the abstract**: the exact new panel-count ceiling this feature achieves depends on which of the researched mechanisms (deck.gl View consolidation, interleaved mode, viewport-gated mounting, or some combination) is actually selected during planning — each has a different theoretical context-cost-per-panel. This spec deliberately does not pre-commit to a specific number (e.g., "12" or "16") since that number is an output of the planning-phase research, not an input to it; SC-001 is phrased against this project's own existing multi-panel fixture as the concrete, testable floor every candidate mechanism must clear.
- **Context-loss detection (User Story 2 / FR-001 / FR-002) is built regardless of which capacity-increasing mechanism is chosen**: even a fully successful context-reduction mechanism does not eliminate the possibility of a tab exceeding capacity (an author could always configure more panels than any finite ceiling supports, and lower-end devices/browsers enforce a smaller ceiling than desktop Chromium's), so this diagnostic capability is treated as a required part of this feature, not an optional stretch contingent on how far capacity is raised.
- **Which of the three capacity-increasing mechanisms is actually implemented is a planning-phase decision, not fixed here**: the feature description names three candidate directions in priority order (deck.gl's View system, interleaved mode, viewport-gated mounting) precisely because investigating the first may make the others partially or fully unnecessary. This spec's functional requirements (FR-003, FR-004, FR-005) describe the required outcome and required non-regressions in mechanism-agnostic terms so the choice can be made with real evidence during `/speckit-plan`, not presupposed here.
- **"Production build" is the standard this feature is measured against, not the dev server**: this project's own established finding (confirmed this session) is that React 18 StrictMode's development-only effect double-invocation inflates apparent context usage during `npm run dev`/Playwright-against-dev-server testing, an artifact entirely absent from `npm run build` output. SC-001/FR-003 are scoped to production-build behavior; any empirical test built for FR-007/SC-005 must account for or explicitly control this dev-mode-only inflation rather than let it distort the measured capacity.
- **Existing 004 (expand/collapse) and 011 (basemap style system) guarantees are treated as regression floors, not features to re-design**: this feature must preserve them exactly as already specified and tested, not re-open their own design questions.
- **Out of scope, per the feature description**: switching the base mapping library away from MapLibre (already investigated and ruled out this session), and building ZoneMapPanel itself (a separate, not-yet-started feature that will consume whatever this feature produces, but isn't built here).

# Tasks: Appearance Settings Expansion

**Input**: Design documents from `specs/061-appearance-controls/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Included — `plan.md`'s own Technical Context commits to concrete
Vitest/Playwright coverage per piece, matching this project's established
per-feature convention (every prior panel/settings feature ships both).

**Organization**: Tasks are grouped by user story (spec.md's own P1–P4
priority order) so each of the four independent additions can be
implemented, tested, and shipped on its own, in any order, per spec.md's
own Assumptions.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an
  incomplete task in the same phase)
- **[Story]**: US1 (category color + colorblind-safe), US2 (text size),
  US3 (Primary/Secondary/Accent), US4 (fonts)
- Every task names an exact file path

## Path Conventions

Existing single-project layout (`src/`, `tests/` at repo root) — no new
top-level structure (plan.md's own Structure Decision).

---

## Phase 1: Setup

**Purpose**: Confirm a clean baseline before touching anything — no new
dependency, no scaffolding needed (research.md: every package this
feature uses is already pinned and installed).

- [X] T001 Run `npm run typecheck` and `npm run test:unit` to confirm a
      green baseline before starting; note the current passing count so
      the Polish-phase regression run (T042) has something real to
      compare against.

---

## Phase 2: Foundational

**No foundational tasks required.** Confirmed by spec.md's own
Assumptions ("All four additions are independent of one another and may
be implemented, tested, and shipped in any order without one blocking
another") and by direct design review (plan.md/data-model.md): no new
module, type, or config field is shared by more than one of the four user
stories. The only file all four stories touch is
`src/layout/settings/appearanceTab.tsx` (each adds its own control
group) — a sequencing note for a single implementer, not a blocking
prerequisite; see Dependencies & Execution Order below.

---

## Phase 3: User Story 1 - Category color consolidation & colorblind-safe preference (Priority: P1) 🎯 MVP

**Goal**: One shared category-color resolver (replacing three
near-duplicate modules) with a richer, real ColorBrewer-backed catalog,
plus a "prefer colorblind-safe palettes" toggle that changes only the
*default* tier of both the new category resolver and the separate,
untouched scenario-color chain.

**Independent Test**: Load a dashboard with a Sankey, a treemap/sunburst,
and a pie or radar panel, none with an explicit `color_scheme:`; confirm
all draw from the same default set. Toggle colorblind-safe mode; confirm
all shift live to `Set2`, a panel with an explicit scheme doesn't, and a
scenario-colored chart's own explicit override/deployer palette doesn't
either.

### Tests for User Story 1

- [X] T002 [P] [US1] Unit test `resolveNamedColorScheme`/
      `resolveCategoryFallbackColors` (existing 4 schemes + 5 new
      ColorBrewer schemes; colorblind-safe branch returns the `Set2` pool
      instead of `undefined`; fallback resolver accepts a caller-supplied
      token list/hex array unchanged from today's per-consumer behavior)
      in `tests/unit/chartColor.test.ts`
- [X] T003 [P] [US1] Extend `tests/unit/scenarioDisplay.test.ts` with
      cases for `resolveDefaultScenarioColor(index, colorblindSafe)` —
      colorblind pool cycled only when true AND no deployer palette is
      configured; deployer palette and explicit `colorOverride` both stay
      unaffected regardless of the flag
- [X] T004 [P] [US1] Unit test `state/colorPreferenceState.ts`'s
      subscribe/notify/get/set shape (default `false`, no persistence
      across a simulated reload) in `tests/unit/colorPreferenceState.test.ts`
- [X] T005 [US1] Playwright regression proof for SC-001 in
      `tests/integration/categoryColorConsolidation.spec.ts` — a Sankey,
      a treemap/sunburst, and a pie/radar panel each configured with an
      explicit, *different* `color_scheme:` render with the exact colors
      they render today (zero visible change from the consolidation)
- [X] T006 [US1] Playwright interactive coverage (US1 portion) in
      `tests/integration/appearanceSettings.spec.ts` — panels with no
      explicit scheme share one default set; toggling colorblind-safe
      mode live-recolors only those, plus a scenario-colored chart's own
      *default* cycling, leaving every explicit configuration (author
      `color_scheme:`, scenario `colorOverride`, deployer
      `scenarioPalette`) untouched (per `contracts/category-color-
      resolution.md`)

### Implementation for User Story 1

- [X] T007 [US1] Create `src/panels/chartColor.ts`: merge the three
      `NAMED_SCHEMES` tables into one (existing `Tableau10`/
      `Observable10`/`Category10`/`Set3` + new `Set1`/`Set2`/`Paired`/
      `Dark2`/`Accent`, all from the already-installed
      `d3-scale-chromatic`); export
      `resolveNamedColorScheme(colorScheme, opts?: { colorblindSafe?: boolean })`
      returning the matching scheme, or (when `colorScheme` is
      unset/unrecognized) the `Set2` array if `colorblindSafe` is true,
      else `undefined` (unchanged from today); export
      `resolveCategoryFallbackColors(el, tokenVarNames, fallbackHexColors)`
      generalizing the existing per-consumer `resolveFallbackColors()` to
      take the caller's own token/hex arrays instead of a hardcoded list
- [X] T008 [US1] Delete `src/panels/sankeyColor.ts`,
      `src/panels/hierarchyColor.ts`, `src/panels/polarChartColor.ts`
      (depends on T007)
- [X] T009 [P] [US1] Create `src/state/colorPreferenceState.ts`
      (`colorblindSafe: boolean`, default `false`; `subscribe()`/
      `notify()`/`getColorblindSafe()`/`setColorblindSafe()`; mirrors
      `src/state/themeState.ts` exactly, session-only)
- [X] T010 [P] [US1] Create `src/hooks/useColorblindSafePreference.ts`
      (`useSyncExternalStore` over `colorPreferenceState.ts`, mirrors
      `src/hooks/useThemeMode.ts`)
- [X] T011 [P] [US1] Update `src/panels/SankeyPanel.tsx`: import
      `resolveNamedColorScheme`/`resolveCategoryFallbackColors` from
      `panels/chartColor.ts` instead of `panels/sankeyColor.ts`; call
      `useColorblindSafePreference()` and pass it through; pass this
      panel's own existing 4-entry `FALLBACK_TOKEN_VARS`/
      `FALLBACK_HEX_COLORS` into `resolveCategoryFallbackColors()`
      unchanged (depends on T007, T010)
- [X] T012 [P] [US1] Update `src/panels/HierarchicalChartHost.tsx`: same
      import/wiring swap as T011, passing this file's own existing
      5-entry fallback arrays unchanged (depends on T007, T010)
- [X] T013 [P] [US1] Update `src/panels/PieChartPanel.tsx`: same
      import/wiring swap, its own existing 5-entry fallback arrays
      unchanged (depends on T007, T010)
- [X] T014 [P] [US1] Update `src/panels/RadarChartPanel.tsx`: same
      import/wiring swap, its own existing 5-entry fallback arrays
      unchanged (depends on T007, T010)
- [X] T015 [US1] Update `src/panels/scenarioDisplay.ts`: add a new
      `COLORBLIND_SAFE_DEFAULT_PALETTE` (the same `Set2` hex values, as
      literal strings, not `var()` references) and an optional 2nd
      parameter to `resolveDefaultScenarioColor(index, colorblindSafe?)` —
      cycle the colorblind pool only when true AND `deployerPalette` is
      unset; unchanged otherwise
- [X] T016 [US1] Update `src/hooks/useScenarioDisplay.ts`: call
      `useColorblindSafePreference()` alongside the existing
      `useColorScheme()` call, fold its value into the existing
      cache-invalidation check, and pass it through
      `resolveEffectiveDefault()` into `resolveDefaultScenarioColor()`
      (depends on T010, T015)
- [X] T017 [US1] Add a "Prefer colorblind-safe palettes" toggle to
      `src/layout/settings/appearanceTab.tsx` (a new labeled section
      below the existing Theme control), wired to
      `colorPreferenceState.ts`'s get/set via
      `useColorblindSafePreference()` (depends on T009, T010)

**Checkpoint**: User Story 1 is fully functional and independently
testable — every category-colored panel type shares one resolver, and the
colorblind-safe toggle works end-to-end with zero effect on any explicit
configuration.

---

## Phase 4: User Story 2 - Text size (Priority: P2)

**Goal**: A continuous slider scaling all standard interface text app-wide.

**Independent Test**: Drag the slider in Appearance settings; confirm
interface text throughout the app resizes live, stays legible at both
extremes, and resets to default on reload.

### Tests for User Story 2

- [X] T018 [P] [US2] Unit test `state/textSizeState.ts` (default `100`,
      clamped to `[80, 150]`, subscribe/notify, no persistence across a
      simulated reload) in `tests/unit/textSizeState.test.ts`
- [X] T019 [US2] Playwright coverage (US2 portion) in
      `tests/integration/appearanceSettings.spec.ts` — dragging the
      slider visibly resizes interface text outside the Settings modal
      live; both extremes remain legible with no hidden/overlapped
      control; a reload resets to default (per `contracts/text-size-
      preference.md`)

### Implementation for User Story 2

- [X] T020 [P] [US2] Create `src/state/textSizeState.ts` (`scale: number`,
      default `100`, `setScale()` clamps to `[80, 150]`;
      subscribe/notify/getScale; mirrors `state/themeState.ts`,
      session-only)
- [X] T021 [P] [US2] Create `src/hooks/useTextSize.ts` (mirrors
      `hooks/useThemeMode.ts`)
- [X] T022 [P] [US2] Create `src/components/ui/slider.tsx` — shadcn-
      pattern `React.forwardRef` wrapper over the already-installed
      `@radix-ui/react-slider` (this app's first standalone `Slider`
      primitive; `components/ui/color-picker.tsx`'s own inline Hue/Alpha
      sliders are untouched, kept pristine per that file's existing
      convention)
- [X] T023 [US2] Add a text-size control (using the new `Slider`) to
      `src/layout/settings/appearanceTab.tsx`, wired to
      `textSizeState.ts` via `useTextSize()`, plus an effect setting
      `document.documentElement.style.fontSize = `${scale}%`` on every
      change (depends on T020, T021, T022)

**Checkpoint**: User Stories 1 and 2 both independently functional.

---

## Phase 5: User Story 3 - Primary / Secondary / Accent colors (Priority: P3)

**Goal**: A two-tier (deployer default + viewer session override) color
picker for the Primary, Secondary, and Accent visual roles, with an
automatically computed legible foreground.

**Independent Test**: Configure a deployer default for one role; confirm
it applies for a viewer with no override. Set a viewer override via the
new picker; confirm it takes precedence live, with legible text. Clear
it; confirm it reverts to the deployer default.

### Tests for User Story 3

- [X] T024 [P] [US3] Unit test `panels/interfaceColor.ts` —
      `resolveInterfaceColor(role)`'s three-tier precedence (override >
      deployer default > `undefined`, meaning "use `tokens.css`'s
      existing value") and `computeForegroundFor(hex)` (via the already-
      installed `color` package's `.isLight()`) in
      `tests/unit/interfaceColor.test.ts`
- [X] T025 [P] [US3] Unit test `state/interfaceColorState.ts` (per-role
      set/clear, session-only) in `tests/unit/interfaceColorState.test.ts`
- [X] T026 [US3] Playwright coverage (US3 portion) in
      `tests/integration/appearanceSettings.spec.ts` — a configured
      deployer default applies with no viewer override; the picker's
      swatch/2D-area/hue/alpha/hex/RGB surfaces all write through to an
      immediate, live app-wide update; "Reset to default" reverts to the
      deployer default (or shipped default); an arbitrary chosen color
      always pairs with legible text; a reload clears the viewer override
      but keeps the deployer default (per `contracts/interface-color-
      roles.md`)

### Implementation for User Story 3

- [X] T027 [US3] Extend `DashboardBranding` (and its internal raw-shape
      type) in `src/services/yamlLoader.ts` with `primaryColor?: string`,
      `secondaryColor?: string`, `accentColor?: string`, parsed with the
      same `typeof parsed.X === 'string'` coercion `logoUrl` already uses
- [X] T028 [US3] Update `src/main.tsx`: merge the three new fields
      real-then-demo (`primaryBranding.X ?? demoBranding.X`, matching
      every existing `DashboardBranding` field), validate each with
      `CSS.supports('color', ...)` (same pattern as the existing
      `scenarioPalette` validation), and call a new
      `setDeployerInterfaceColor(role, value)` once per role (depends on
      T027, T029)
- [X] T029 [P] [US3] Create `src/panels/interfaceColor.ts`:
      `resolveInterfaceColor(role): string | undefined` (session override
      ?? deployer default ?? `undefined`), `computeForegroundFor(hex):
      '#000000' | '#ffffff'` (via `Color(hex).isLight()`),
      `setDeployerInterfaceColor(role, value)`/
      `getDeployerInterfaceColor(role)` (module-level, set once at boot,
      mirrors `scenarioDisplay.ts`'s `setDeployerScenarioPalette` shape)
- [X] T030 [P] [US3] Create `src/state/interfaceColorState.ts`
      (`{ primary?, secondary?, accent? }` viewer session overrides;
      `setInterfaceColorOverride(role, hex)`/
      `clearInterfaceColorOverride(role)`/subscribe/notify; mirrors
      `state/themeState.ts`, session-only)
- [X] T031 [US3] Create `src/hooks/useInterfaceColors.ts`
      (`useSyncExternalStore` + memoized cache resolving all three roles
      via `resolveInterfaceColor()` plus their `computeForegroundFor()`
      values; mirrors `hooks/useScenarioDisplay.ts`'s shape) (depends on
      T029, T030)
- [X] T032 [US3] Create `src/layout/settings/interfaceColorControl.tsx` —
      mirrors `layout/settings/scenarioColorControl.tsx` exactly
      (`Popover` + the adapted `ColorPicker`), parameterized by
      `role: 'primary' | 'secondary' | 'accent'` instead of a `Scenario`,
      writing through `setInterfaceColorOverride`/
      `clearInterfaceColorOverride`; `components/ui/color-picker.tsx`
      itself is not modified (depends on T031)
- [X] T033 [US3] Add an effect (in `appearanceTab.tsx`, alongside the
      other appearance effects) applying `useInterfaceColors()`'s
      resolved values live via
      `document.documentElement.style.setProperty('--primary', ...)`/
      `('--primary-foreground', ...)` (and the `secondary`/`accent`
      pairs) on every change (depends on T031)
- [X] T034 [US3] Add the three `InterfaceColorControl` swatches
      (Primary/Secondary/Accent), each with a conditional "Reset to
      default" button, to `src/layout/settings/appearanceTab.tsx`
      (depends on T032)

**Checkpoint**: User Stories 1, 2, and 3 all independently functional.

---

## Phase 6: User Story 4 - Fonts (Priority: P4)

**Goal**: A body/heading/monospace font picker defaulting to the existing
self-hosted typefaces, optionally overridable via a dynamically-loaded
Google Font, failing soft to the default if the font can't load.

**Independent Test**: Pick a Google Font for the body role; confirm body
text changes live. Simulate the font request failing (offline); confirm
the dashboard keeps rendering legibly in its existing default.

### Tests for User Story 4

- [X] T035 [P] [US4] Unit test `state/fontPreferenceState.ts` (per-role
      set/clear, session-only) in `tests/unit/fontPreferenceState.test.ts`
- [X] T036 [P] [US4] Unit test `panels/googleFontLoader.ts` —
      `ensureGoogleFontLoaded(role, name)` creates/updates the correct
      stable-`id`'d `<link>` per role with the correct CSS2 URL
      (`family=<name>:wght@400;500;600;700&display=swap`) and sets the
      matching `--font-<role>` custom property;
      `clearGoogleFont(role)` removes the link and the inline property
      in `tests/unit/googleFontLoader.test.ts`
- [X] T037 [US4] Playwright coverage (US4 portion) in
      `tests/integration/appearanceSettings.spec.ts` — selecting a font
      changes only that role's rendered text, live, with no reload;
      routing the Google Fonts request to fail (`page.route()` abort)
      leaves the dashboard rendering legibly in its existing default;
      reload clears every font selection (per `contracts/font-
      preference.md`)

### Implementation for User Story 4

- [X] T038 [P] [US4] Create `src/state/fontPreferenceState.ts`
      (`{ body?, heading?, mono? }` viewer session selections;
      `setFont(role, name)`/`clearFont(role)`/subscribe/notify; mirrors
      `state/themeState.ts`, session-only)
- [X] T039 [P] [US4] Create `src/hooks/useFontPreference.ts` (mirrors
      `hooks/useThemeMode.ts`, returning the current `{ body, heading,
      mono }` selection)
- [X] T040 [P] [US4] Create `src/panels/googleFontLoader.ts`:
      `ensureGoogleFontLoaded(role, name)` creates or updates a
      stable-`id`'d `<link rel="stylesheet">`
      (`google-font-body`/`google-font-heading`/`google-font-mono`)
      pointed at
      `https://fonts.googleapis.com/css2?family=<name>:wght@400;500;600;700&display=swap`,
      then sets `document.documentElement.style.setProperty('--font-body',
      `"${name}", sans-serif`)` (heading/mono use their own generic
      fallback); `clearGoogleFont(role)` removes the link and calls
      `style.removeProperty(...)`
- [X] T041 [US4] Add an effect (in `appearanceTab.tsx`) that calls
      `ensureGoogleFontLoaded`/`clearGoogleFont` whenever
      `fontPreferenceState.ts` changes for a given role (depends on T038,
      T039, T040)
- [X] T042 [US4] Add the three font picker controls (Body/Heading/
      Monospace) to `src/layout/settings/appearanceTab.tsx` — a
      free-text-capable combo box seeded with a small bundled shortlist
      (~30 well-known Google Font family names) per role (depends on
      T041)

**Checkpoint**: All four user stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T043 [P] Run the full regression suite: `npm run typecheck`,
      `npm run test:unit`, and
      `npm run test:integration -- appearanceSettings categoryColorConsolidation sankeyPanel hierarchicalChart pieChartPanel radarChartPanel settingsModal scenarioColorOverride`
      (per `quickstart.md`'s own regression list) — confirm zero
      regression against every existing spec these changes could plausibly
      touch
- [X] T044 [P] Execute `quickstart.md`'s manual validation steps for all
      four user stories end-to-end in a real `npm run dev` session
- [X] T045 Add a new Implementation-order entry to `CLAUDE.md` documenting
      this feature (module list, any real findings from implementation),
      following the established format of the existing numbered entries

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: None — explicitly empty (see above).
- **User Stories (Phase 3–6)**: Each depends only on Setup. All four are
  logically independent and may be implemented in any order or in
  parallel by different people — the priority order (P1→P4) is a
  recommended sequence, not a hard dependency.
- **Polish (Phase 7)**: Depends on however many of the four user stories
  have been completed.

### A real, single-file sequencing note (not a blocking dependency)

Every user story's final control-adding task (T017, T023, T034, T042)
edits the same file, `src/layout/settings/appearanceTab.tsx`. A single
implementer working through the stories in order will simply layer each
story's own new section into that file in turn — no conflict, since each
edit is additive. A team splitting the four stories across people should
coordinate merges into this one file, the only real cross-story contact
point in this entire feature.

### Within Each User Story

- Tests before implementation (write first, confirm they fail).
- New state module → new hook → consuming component, in that order where
  one depends on another (e.g. T009→T010→T017 for US1;
  T029/T030→T031→T032→T034 for US3).
- Each story's own Checkpoint marks a fully working, independently
  demonstrable increment.

### Parallel Opportunities

- All Setup tasks marked [P] (there is only one, T001, not parallel with
  itself).
- Within Phase 3 (US1): T002–T004 (unit tests) in parallel; T009–T010 in
  parallel; T011–T014 (the four consumer-file updates) in parallel with
  each other once T007/T010 are done.
- Within Phase 4 (US2): T018 parallel with nothing else in-phase (single
  test file); T020–T022 in parallel.
- Within Phase 5 (US3): T024–T025 in parallel; T029–T030 in parallel.
- Within Phase 6 (US4): T035–T036 in parallel; T038–T040 in parallel.
- Once Setup is done, all four user-story phases (3–6) can proceed in
  parallel across different people, modulo the single-file note above.
- T043–T044 in Phase 7 in parallel with each other.

---

## Parallel Example: User Story 1

```bash
# Tests, together:
Task: "Unit test chartColor.ts in tests/unit/chartColor.test.ts"
Task: "Extend tests/unit/scenarioDisplay.test.ts with colorblind-safe cases"
Task: "Unit test colorPreferenceState.ts in tests/unit/colorPreferenceState.test.ts"

# State + hook, together (after tests):
Task: "Create src/state/colorPreferenceState.ts"
Task: "Create src/hooks/useColorblindSafePreference.ts"

# Four consumer-file updates, together (after chartColor.ts + the hook exist):
Task: "Update src/panels/SankeyPanel.tsx"
Task: "Update src/panels/HierarchicalChartHost.tsx"
Task: "Update src/panels/PieChartPanel.tsx"
Task: "Update src/panels/RadarChartPanel.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 3: User Story 1 (category color consolidation +
   colorblind-safe toggle) — the requester's own most-emphasized concern,
   and the one with the clearest immediate accessibility payoff across
   every existing category-colored panel type.
3. **STOP and VALIDATE**: run `categoryColorConsolidation.spec.ts` and the
   US1 portion of `appearanceSettings.spec.ts`; confirm SC-001/SC-002.
4. Ship if ready — US1 delivers real value with zero dependency on US2–US4.

### Incremental Delivery

1. Setup → US1 (MVP) → validate → ship.
2. Add US2 (text size) → validate → ship.
3. Add US3 (Primary/Secondary/Accent) → validate → ship.
4. Add US4 (fonts) → validate → ship.
5. Phase 7 polish once all four are in.

### Parallel Team Strategy

With four available implementers, once Phase 1 is done: one person per
user story (Phase 3, 4, 5, 6), coordinating only on the shared edits to
`appearanceTab.tsx` noted above.

---

## Notes

- [P] tasks touch different files with no dependency on an incomplete
  task in the same phase.
- Every new state module in this feature mirrors `state/themeState.ts`'s
  exact shape (research.md §11) — no task should introduce a different
  pattern (async init, persistence, etc.).
- `components/ui/color-picker.tsx` and `components/ui/popover.tsx` are
  reused verbatim in US3 — no task modifies either file.
- Verify each story's tests fail before implementing, then pass after.
- Stop at any Checkpoint to validate a story independently before moving
  on.

# Quickstart: Validating Panel Expand-to-Dialog

**Feature**: `004-panel-expand-dialog`

## Prerequisites

- `001`, `002`, `003` already in place — this feature adds a trigger and
  dialog on top of `003`'s existing `panelCard.tsx`/panel registry; it does
  not stand alone.
- `npm install` run after this feature adds `@radix-ui/react-dialog` to
  `package.json`.
- `tests/fixtures/dashboard-shell-config.yaml` present and
  `tests/fixtures/generate.py`'s Parquet fixtures generated (same fixtures
  `003` already uses — no new fixture data is needed; this feature adds no
  new panel type and no new config key).

## Run the integration test

```bash
npm run test:integration -- panelExpand
```

Boots the app for real (Playwright, real DuckDB-WASM, fixture data — same
pattern as `dashboardShell.spec.ts`) and asserts, per
`contracts/panel-expand-host.md`'s Given/When/Then:

1. Expanding a `valuebox` panel and a `plotly` panel both work identically
   — no per-type exception (SC-002).
2. The expanded view shows the same data the card was already showing — no
   loading flash on open (SC-003, FR-007).
3. Escape, outside-click, and the explicit close control each close the
   dialog; focus returns to the trigger afterward (FR-004, FR-006).
4. Tab/Shift+Tab cycles only within the open dialog (FR-005, SC-005).
5. The panel's query fires exactly once across an expand→collapse round
   trip — asserted deterministically via `services/duckdb.ts`'s
   `__debugQueryLog()` (a small, purely additive debug instrumentation
   added for this test — no existing export's behavior changed), not a
   timing-based "catch it mid-flight" attempt: an earlier version of this
   test tried delaying network responses to catch a query in flight, but
   DuckDB-WASM's httpfs fully caches these tiny fixture files after the
   first touch, making that approach unreliable (FR-008).
6. An expanded chart panel's Plotly container is the *same* DOM node the
   card view was using (identity check via a marker attribute, not just a
   visual check) — proof the mechanism is a relocation, not a remount
   (research.md §1b, FR-009). This assertion is what actually caught
   research.md §1b's finding during implementation — the original
   `createPortal`-target-swap design lost the marker on every expand.
7. Clicking a rendered Plotly legend entry inside the expanded dialog
   toggles that trace's visibility and does **not** close the dialog —
   the specific Radix-vs-Plotly check research.md §2 flagged as
   required, not assumed.
8. A modal expanded view blocks background interaction — including
   switching tabs — until closed; spec.md's Edge Case anticipated needing
   to clean up an expanded view left open across a tab switch, but Radix's
   modal `disableOutsidePointerEvents` makes that scenario structurally
   unreachable in the first place (research.md §1a/§1b; `contracts/
   panel-expand-host.md`).
9. On a dashboard tab where no panel has ever been expanded, no
   `DialogContent` root exists in the DOM at all (`role="dialog"` count is
   0) — a named, explicit assertion, not folded into another test. This
   was a real, shipped bug during implementation: an earlier `forceMount`-
   based design (research.md §1a, since reverted) left every panel's
   dialog box permanently mounted, and a missing `data-[state=closed]:
   hidden` class left it permanently *visible* too — no single
   interaction-based test caught it, since every other assertion above
   only ever looks at the panel currently being interacted with.

## Manually verify

```bash
npm run dev
```

1. **Expand trigger present on every panel** — every panel card's header
   shows a small expand icon, including value-box panels.
2. **Expand shows the same data, large** — click it; confirm the same
   number/chart appears, just much bigger, filling most of the viewport.
3. **Chart resizes correctly** — for a `plotly` panel, confirm the chart
   genuinely redraws to fill the larger space (not left small with
   whitespace around it, not cut off).
4. **Close via all three paths** — Escape, clicking the dimmed backdrop
   outside the dialog, and the explicit close (×) control each close it;
   confirm the panel card looks exactly as it did before expanding, with
   no loading indicator.
5. **Keyboard-only pass** — Tab to a panel's expand trigger, press Enter to
   open it, Tab through whatever's inside, Escape to close, and confirm
   focus visibly lands back on that same trigger button.
6. **Legend click inside the dialog** — expand a `plotly` panel with a
   visible legend, click one legend entry, confirm the corresponding trace
   toggles off and the dialog stays open.
7. **No other panel affected** — with one panel expanded, confirm every
   other panel on the tab still looks exactly as it did before (still
   showing its data, no layout shift).
8. **Non-expanded card looks unchanged from pre-`004`** — screenshot a
   panel card that has never been expanded and compare against `003`'s
   already-captured before/after screenshots (or a fresh pre-`004`
   checkout) for the same fixture data. `panelExpandHost.tsx`'s inline
   slot has to visually sit inside `CardContent` while the host itself is
   placed in `CardHeader` (`contracts/panel-card.md`) — a plausible-looking
   but subtly wrong layout (extra spacing, a shifted title baseline) would
   pass every functional assertion above and still be a real regression;
   this step is the only one that actually catches that.

## Expected outcome

All of spec.md's SC-001 through SC-005 hold: any panel expands in one
click, uniformly across panel types; closing restores the exact prior
state with no extra loading; charts read clearly at the larger size; the
whole flow works keyboard-only. The two risks flagged before planning —
no reset/duplicate query on mount-relocation, and Radix's outside-click
detection not misfiring on Plotly's own legend interaction — are both
covered by dedicated, named assertions above, not left implicit.

**Confirmed, not just expected**: all 16 scenarios above pass as real
Playwright tests (`tests/integration/panelExpand.spec.ts`), alongside the
full pre-existing suite (`boot.spec.ts`, `dashboardShell.spec.ts` — 26
integration tests total, plus the 53 existing unit tests) — no
regression. Manual step 8's screenshot comparison was performed (pre-`004`
via `git stash` of the tracked source changes, post-`004` after
restoring) and confirmed identical spacing/card-size/title-baseline, the
only difference being the new expand icon.

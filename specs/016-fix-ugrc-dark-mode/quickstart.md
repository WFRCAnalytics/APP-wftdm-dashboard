# Quickstart: Fix UGRC map compositions rendering incorrectly in dark mode

This feature's validation is split across two kinds of checks — what CI
and Playwright can prove (SC-006: the fix is inert wherever the defect
never happens), and what only a human on real hardware can prove
(SC-001: the fix actually works). Don't treat a green Playwright run as
proof of SC-001 — see `plan.md`'s Technical Context / Constraints for why.

## Prerequisites

- `npm run dev:fixtures` (copies `tests/fixtures/{observed,scenarios,
  dashboard-config,geometry}` → `public/`)
- `npx vite --port 5199 --strictPort --host 127.0.0.1` (or any dev
  server) — the `Flowmap UGRC Composition` / `Flowmap UGRC Outdoors
  Composition` panels live on the Basemaps tab
  (`tests/fixtures/dashboard-config/dashboard-3-basemaps.yaml`)
- Real, hardware-accelerated WebGL for Scenario 1 and 2 below — a
  machine/browser where the defect has actually been observed. Scenario
  3 can run anywhere, including Playwright/SwiftShader.

## Scenario 1 — Diagnostic Protocol (run this first, always)

Follow `contracts/diagnostic-protocol.md` end to end. Step 0 (extension
check) is **already done** — Edge Incognito, OS dark mode active, the
corruption still reproduced, so an extension is ruled out; do not
re-run it. Execution starts at step 1: the real-hardware `color-scheme`
isolation test, now the leading hypothesis (research.md §3a) — steps 2
and 3 (Chromium's force-dark flag, an OS-level color filter) only run
if step 1 doesn't reproduce the defect. This is not optional or
skippable — it's what decides which of Scenario 2 or the "no fix
possible" outcome applies. Record the Fix Branch Decision.

**Expected outcome**: most likely `branch-a-scoped-css` (step 1
confirms `color-scheme` on real hardware, research.md §3a). Also
possible: `no-fix-possible` (step 2 or 3 confirms, despite each having a
known explanatory gap — see research.md §3a on why this is a weaker,
less-expected outcome now) or `branch-c-panel-fallback` (steps 1–3 all
find nothing). Whichever it is, record the specific evidence for it
(flag state, filter state, or the real-hardware `color-scheme` test
result) for SC-003.

## Scenario 2 — Verify the fix on real hardware (only if a code fix was implemented)

Skip this scenario entirely if Scenario 1 resolved to `no-fix-possible`
— there is nothing to verify because no code changed.

1. On the SAME real-hardware machine/browser used in Scenario 1, load
   the dashboard with dark mode active (either from first paint — set
   OS/browser dark mode before opening the tab — or by toggling the
   in-app theme control after light-mode load).
2. Navigate to the Basemaps tab.
3. Visually confirm both `Flowmap UGRC Composition` and `Flowmap UGRC
   Outdoors Composition` render with correct, non-corrupted colors
   (roads/water/terrain/labels match their intended appearance — the
   same content visible in light mode, not inverted or discolored).
4. Toggle to light mode without reloading — confirm both panels still
   render correctly (no regression to already-correct light-mode
   behavior, FR-003).
5. Spot-check at least one other flowmap panel (e.g. `Flowmap Dark
   Matter Preset`) and the zonemap panel(s) on another tab in dark mode
   — confirm no new corruption was introduced (FR-007, User Story 3).

**Expected outcome**: SC-001 and SC-004 confirmed directly. This is the
one part of this feature that cannot be automated — record it as done
by a human, not by a test run.

## Scenario 3 — Automated SC-006 check (inert where nothing was broken)

Runs in this repo's normal Playwright suite, SwiftShader included —
this is exactly the environment SC-006 asks to be checked in.

```bash
npx playwright test tests/integration/flowmapPanel.spec.ts tests/integration/zonemapPanel.spec.ts
```

Look for the dark-mode regression assertions already present (Navigation
Control background/icon-filter/divider, 3D-toggle text) plus whatever
Branch A/C-specific assertion `tasks.md` adds — all MUST still pass
unchanged. If Branch A was implemented, the new
`.maplibregl-canvas { color-scheme: light }` rule should produce **zero**
visible difference in a SwiftShader screenshot before/after (SC-006) —
add a before/after screenshot-diff or computed-style assertion for this
specifically, since it's the one thing this suite CAN prove about the
fix.

**Expected outcome**: 100% pass, zero new failures (SC-002), and (if
Branch A) a passing inert-on-SwiftShader assertion (SC-006).

## Done when

- Scenario 1 recorded a Fix Branch Decision with cited evidence (SC-003).
- If a code fix was implemented: Scenario 2 confirmed on real hardware
  (SC-001, SC-004) and Scenario 3 passes with zero regressions (SC-002)
  plus the inert-on-SwiftShader check (SC-006).
- If `no-fix-possible`: this is documented plainly as such (SC-005 is
  N/A — no fallback was needed because no fix was possible at all,
  which is a stronger, cleaner outcome than the fallback), and Scenario
  3 still passes (nothing changed, so nothing should regress).

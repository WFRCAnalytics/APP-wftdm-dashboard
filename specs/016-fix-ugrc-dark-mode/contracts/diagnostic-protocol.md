> **PARTIALLY SUPERSEDED — kept for historical record.** The protocol
> steps below were actually followed and correctly ruled out
> `color-scheme` on real hardware (§5 step 1, then Follow-ups 1–3 in
> `diagnostic-results.md` after the initial `branch-a-scoped-css`
> implementation failed T007). What's now inaccurate is this
> document's own **Output** table below: the real outcome was a
> FOURTH branch, `branch-e-missing-background-layer`, found through
> further source-reading and web research beyond this protocol's
> original three-branch decision table (research.md §7 originally
> enumerated only `branch-a-scoped-css` / `no-fix-possible` /
> `branch-c-panel-fallback`) — not one this contract anticipated. See
> `research.md` §8 and `diagnostic-results.md` for what actually
> happened. Preserved, not deleted or rewritten, per this project's own
> established convention for a superseded artifact.

# Contract: Diagnostic Protocol (human-executed, real hardware)

This is not a code interface — it's the "contract" between this feature's
automated work (which can be fully done in this repo) and the one part
that cannot: confirming which branch in research.md §7 applies. Treat it
the same as any other contract in this repo: a fixed input/output shape
downstream work depends on.

## Input

- A machine with real, hardware-accelerated WebGL where the defect has
  already been observed.
- The dashboard running (dev server or built app), dark mode active,
  navigated to the tab containing both `Flowmap UGRC Composition` and
  `Flowmap UGRC Outdoors Composition`.
- The exact numbered steps in `research.md` §5 — **step 0 (extension
  check) is already satisfied**: run this session in Edge Incognito
  (extensions disabled, none explicitly allowed) with OS dark mode
  active, the corruption still reproduced. Do not re-run it; start
  execution at step 1 (real-hardware `color-scheme` isolation).

## Output (what downstream tasks consume)

A single **Fix Branch Decision** (`data-model.md`) — exactly one of:

| Value | Meaning | Consumed by |
|---|---|---|
| `branch-a-scoped-css` | §5 step 1 confirmed `color-scheme` on real hardware — the expected leading outcome now that extension is ruled out and the other two external candidates each have a known explanatory gap (§3a) | `tasks.md`'s Branch A implementation task (`contracts/map-canvas-color-scheme-scope.md`) |
| `no-fix-possible` | §5 step 2 or 3 confirmed a flag/OS mechanism despite §3a's identified gap | `tasks.md`'s documentation task only — no code task is generated for this branch |
| `branch-c-panel-fallback` | §5 steps 1–3 all found nothing | `tasks.md`'s Branch C implementation task (FR-008 fallback, `FlowMapPanel.tsx`) |

Plus, regardless of which value: the raw per-step findings (extension
name if applicable, flag state, filter state, and the §6 artifact
results if run) — these get folded into this feature's completion notes
and, per SC-003, must be recorded with cited evidence, not left
unexplained even if the final answer is "external, no code fix."

## Failure modes

- **Ambiguous result** (e.g., disabling the force-dark flag in step 2
  "seems" to help but isn't confirmed by a clean re-test, or step 1's
  real-hardware `color-scheme` isolation gives an inconsistent result
  across repeated loads): do not guess a branch — re-run the specific
  step that was ambiguous once more before recording a Fix Branch
  Decision. A wrong branch selection wastes an entire implementation
  task on the wrong fix.
- **A flag/OS mechanism (step 2 or 3) "fixes" Chromium but Firefox
  reproduction wasn't re-checked**: per §3a, do not record
  `no-fix-possible` on a Chromium-only positive result alone — confirm
  the SAME fix (flag disabled / filter off) against Firefox too before
  concluding it's the complete explanation, since the whole reason
  these two candidates were downgraded is that neither alone accounts
  for both browsers.
- **Cannot access real hardware at all**: this feature cannot reach a
  Fix Branch Decision, and per Technical Context in `plan.md`, cannot be
  completed via CI/automation alone. `tasks.md` must not mark
  implementation tasks complete without this input.

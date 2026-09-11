# T001 — Integration-suite baseline

Captured 2026-09-10 on branch `040-test-suite-migration` @ `50847d5` (clean tree, no WIP), before any Phase 2 work.

```
npx playwright test          # tests/integration/, 1 project (chromium)
→ 350 passed, 8 failed  (9.6 min)
```

## The 8 pre-existing failures (NOT introduced by feature 040)

| Spec | Cause |
|---|---|
| `demoContentAllPanels.spec.ts:106` "exactly six primary tabs plus Explore" | Commit `50847d5` renamed the demo tabs ("Person/Household Models"→"Person & Households", "Tour Models"→"Tour", "Trip Models"→"Trip") but did not update this spec — it still hardcodes the old names (lines 115–118, 139–142, 173, 238, 253). |
| `demoContentAllPanels.spec.ts:133` "a real gap note … no error-state panel on any of the six tabs" | same tab-name regression (`clickDemoTab(page, 'Person/Household Models')` never resolves) |
| `demoContentAllPanels.spec.ts:160` "every one of the ten registered panel types renders" | same |
| `demoContentAllPanels.spec.ts:236` ZoneMap real data | same (`clickDemoTab(page, 'Trip Models')`) |
| `demoContentAllPanels.spec.ts:249` ZoneMap both themes | same |
| `demoMultiScenario.spec.ts:128` (light) "unpinned plotly/recharts/observable-plot render three per-scenario series" | same (`gotoTab(page, 'Person/Household Models')`, line 161) |
| `demoMultiScenario.spec.ts:128` (dark) | same |
| `flowmapPanel.spec.ts:717` deck.gl onHover tooltip | The long-standing real-hardware-timing-sensitive deck.gl hover flake documented repeatedly in `CLAUDE.md` (033/034/035/037 entries). Passes in isolation. |

## Consequence for feature 040

- The 7 tab-name failures land on `demoContentAllPanels.spec.ts` / `demoMultiScenario.spec.ts` — both explicitly in scope for **T016 / T017** (migrate the already-demo-based specs). They will be fixed there (update the hardcoded tab names to the real current ones) as part of US1.
- The flowmap flake is excluded from "regression" per tasks.md Dependencies — re-run in isolation before attributing any later failure to a migration.
- **Effective green target after the full feature: 358/358** (350 currently-green + the 7 tab-name specs once fixed + the flake treated as flake), plus the new spec files this feature adds (`testTabInvisibility.spec.ts`, `brokenPanelStates.spec.ts`) and minus `_sharedFixtureLock.ts`'s removed scaffolding.

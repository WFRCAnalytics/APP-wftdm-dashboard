# Quickstart: Left Sidebar Navigation, Accordion Sub-Sections, and a Chromeless Full-Page Panel Mode

All scenarios below are fully automatable (Vitest for
`dashboardLayout.ts`; Playwright for `sidebarNav.tsx`/`dashboardRenderer.tsx`/
the full-page path) — no manual/real-hardware step required. See
`contracts/sidebar-shell.md` and `contracts/dashboard-grammar.md` for the
full behavioral contract each scenario checks against; not duplicated
here.

## Prerequisites

```powershell
npm run dev:fixtures   # copies tests/fixtures/* into public/{observed,scenarios,dashboard-config}
npm run dev            # dev server, or npx vitest / npx playwright test directly
```

This feature's own fixture content (per spec.md's Assumptions) adds a
representative tab set exercising all four user stories — at minimum:
one tab with an `icon:`, one `full_page: true` tab with a single
`graphic-walker` panel (`Compass` icon), one tab with two or more
`sections:` entries spanning multiple real rows, and one Metric-Strip
(`valuebox`-only) row on an existing tab.

## Scenario 1 — Sidebar renders every discovered tab, no hardcoding (US1 / FR-001–FR-003)

```ts
// tests/integration/sidebarNav.spec.ts
await page.goto(BASE_URL)
const items = page.getByRole('link', { name: /.+/ }).and(page.locator('[data-sidebar="menu-button"]'))
await expect(items).toHaveCount(EXPECTED_FIXTURE_TAB_COUNT)
// Swap in a differently-sized fixture set (a second dashboard-config
// index.json with e.g. 9 entries instead of 7) and re-assert the count
// tracks it exactly, with no code change — proves FR-003 directly.
```

**Done when**: every discovered tab appears as a sidebar item, in
discovery order, and the count/labels track whatever `dashboard-config/
index.json` lists — verified against at least two differently-sized
fixture sets, not just the default one.

## Scenario 2 — Manual collapse only, never scroll-triggered (US1 / FR-002, FR-006)

```ts
await page.getByRole('button', { name: /collapse sidebar|toggle sidebar/i }).click()
await expect(page.locator('[data-sidebar="sidebar"]')).toHaveAttribute('data-state', 'collapsed')
await page.mouse.wheel(0, 2000) // scroll a long tab
await expect(page.locator('[data-sidebar="sidebar"]')).toHaveAttribute('data-state', 'collapsed') // unchanged by scroll
```

**Done when**: the sidebar's collapsed/expanded state changes only on
the manual trigger, never as a side effect of scrolling — and
`hooks/useNavBarVisibilityMode.ts`/`state/navBarVisibilityState.ts`/
`hooks/useScrollDirection.ts` no longer exist in the tree
(`git grep` returns nothing).

## Scenario 3 — Explore Data renders edge-to-edge, no chrome (US2 / FR-008, FR-009, FR-011)

```ts
await page.getByRole('link', { name: 'Explore Data' }).click()
await expect(page.getByRole('heading', { name: 'Explore Data' })).toHaveCount(0) // no redundant page title
await expect(page.locator('.rounded-lg.border.shadow-md')).toHaveCount(0)        // no Card chrome
await expect(page.getByRole('button', { name: /^Expand/ })).toHaveCount(0)       // no expand-to-dialog trigger

const box = await page.locator('.graphic-walker-panel-host').boundingBox()
const viewport = page.viewportSize()
expect(box.height).toBeGreaterThan(viewport.height * 0.9) // SC-002
```

**Done when**: the measured content-area height clears the 90%-of-
available-viewport bar from SC-002 — a direct, repeatable re-run of this
session's own live measurement technique, not a one-time manual check.

## Scenario 4 — Full-page height tracks a real viewport resize (US2 / FR-009)

```ts
await page.setViewportSize({ width: 1440, height: 900 })
const h1 = (await page.locator('.graphic-walker-panel-host').boundingBox()).height
await page.setViewportSize({ width: 1440, height: 700 })
const h2 = (await page.locator('.graphic-walker-panel-host').boundingBox()).height
expect(h2).toBeLessThan(h1) // tracks viewport, not a fixed 635px constant
```

**Done when**: the rendered height changes with the viewport — proves
this isn't still settling at the library's own fixed intrinsic default.

## Scenario 5 — Accordion sub-nav shows only for the active tab (US3 / FR-013–FR-017)

```ts
await page.getByRole('link', { name: 'Person/Household Models' }).click()
await expect(page.getByRole('link', { name: 'Auto Ownership' })).toBeVisible()
await expect(page.getByRole('link', { name: 'Work from Home' })).toBeVisible()

await page.getByRole('link', { name: 'Tour Models' }).click()
await expect(page.getByRole('link', { name: 'Auto Ownership' })).toHaveCount(0) // hidden, not just invisible
```

**Done when**: switching tabs immediately removes the previous tab's own
section sub-items — no residual/duplicate entries for an inactive tab
(SC-004).

## Scenario 6 — Section sub-item scrolls to its content (US3 / FR-016)

```ts
await page.getByRole('link', { name: 'Auto Ownership' }).click()
await page.waitForFunction(() => {
  const el = document.getElementById('section-auto_ownership')
  const r = el?.getBoundingClientRect()
  return r && r.top >= 0 && r.top < 100 // scrolled to (near) the top of the viewport
})
```

**Done when**: the target section's DOM anchor lands near the top of the
viewport after the click, with no full page navigation (`page.url()`
unchanged apart from a same-page anchor, if any).

## Scenario 7 — Collapsed sidebar shows no section sub-items (US3 / FR-017)

```ts
await page.getByRole('link', { name: 'Person/Household Models' }).click()
await page.getByRole('button', { name: /collapse sidebar|toggle sidebar/i }).click()
await expect(page.getByRole('link', { name: 'Auto Ownership' })).toHaveCount(0)
```

## Scenario 8 — Metric Strip row layout (US4 / FR-018)

```ts
// tests/unit/dashboardLayout.test.ts
import { isMetricStripRow } from '@/layout/dashboardLayout'
expect(isMetricStripRow([valueBoxA, valueBoxB, valueBoxC])).toBe(true)
expect(isMetricStripRow([valueBoxA, plotlyPanel])).toBe(false)
expect(isMetricStripRow([])).toBe(false)
```

```ts
// tests/integration — real rendered row
const strip = page.locator('[data-testid="row_kpis"]')
await expect(strip).toHaveCSS('display', 'grid')
// column count varies by viewport width (auto-fill) — assert card
// min-width instead of a fixed column count
const firstCard = strip.locator('> *').first()
expect((await firstCard.boundingBox()).width).toBeGreaterThanOrEqual(200)
```

## Scenario 9 — Existing, unmodified fixture content renders unchanged (FR-020)

```ts
// A pre-existing fixture tab with NO sections/icon/full_page authored,
// and a row with MIXED panel types (not all-valuebox) — confirm both
// its layout and its sidebar item (plain label, no icon, no sub-nav
// expand affordance) are pixel-for-pixel unchanged from this feature's
// own before/after screenshot pair, in both light and dark theme
// (FR-021).
```

## Full-suite regression (SC-007)

```powershell
npm run typecheck
npm run test:unit
npm run test:integration
```

**Done when**: the full suite passes at its pre-feature rate; any new
failure is traced to a real regression from this feature specifically
(via isolated re-run / `git stash` comparison, this project's own
established discipline), not accepted as incidental.

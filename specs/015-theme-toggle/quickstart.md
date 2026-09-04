# Quickstart: Light/Dark Theme Toggle

## Prerequisites

- **One new `package.json` dependency**, added after a real post-shipping
  control-shape revision (research.md §6): `@radix-ui/react-dropdown-menu`
  (`^2.1.2`), backing the new `components/ui/dropdown-menu.tsx` primitive.
  Confirmed already present transitively in `node_modules` and
  React-18-compatible before adding it as an explicit direct dependency;
  `npm install` resolved cleanly with no peer warning. `lucide-react`'s
  `Monitor`/`Sun`/`Moon` icons remain the only icon dependency (already
  installed).
- No new fixture data, no fixture dashboard-config change — this feature is
  chrome-level, not panel-level, so no dataset binding is involved.
- A `graphic-walker` panel already exists in the fixture dashboards
  (`014-graphic-walker-panel`) — reused here as the "does a real panel keep
  its own local state across a theme switch" check (contracts/
  theme-toggle.md's `useColorScheme()`-consumer scenario), not recreated.

## Manual verification (dev server, real browser or Playwright's `emulateMedia`)

1. With the OS/browser reporting `prefers-color-scheme: dark`, load the app
   fresh. Confirm `document.documentElement` carries the `dark` class and
   every visible surface (header, cards, borders) renders using the
   existing `.dark` token values — with no manual interaction (US1
   Scenario 1, FR-003).
2. Repeat with `prefers-color-scheme: light`. Confirm the `dark` class is
   absent and the `:root` (light) token values apply (US1 Scenario 2).
3. With the app already open and `mode === 'system'` (the default), change
   the OS-level preference (or, under Playwright, call
   `page.emulateMedia({ colorScheme: ... })` again post-load). Confirm the
   app's appearance updates live, no reload (US1 Scenario 3, FR-004) — this
   is the one item flagged for empirical confirmation below, since it
   depends on the browser actually firing `matchMedia`'s `'change'` event
   for an emulated, not real, preference switch.
4. Click the theme control (top-right of the header, next to "Load Local
   Scenario" — a single icon button showing the current mode's icon).
   Confirm a menu opens listing System/Light/Dark. Select "Light" while the
   OS reports dark (or vice versa). Confirm the app immediately switches to
   the explicitly selected appearance, overriding the OS preference, and
   the trigger's own icon updates to match (US2 Scenario 1, FR-005).
5. With "Dark" manually selected, change the OS-level preference again.
   Confirm the app's appearance does NOT change — the manual choice holds
   (US2 Scenario 2, FR-005).
6. On a tab with a `graphic-walker` panel, drag a field onto a shelf (an
   in-progress chart), then toggle the theme mode. Confirm the panel
   restyles (chrome flips light/dark) AND the field is still on the shelf
   — no state loss, no remount (US2 Scenario 3, FR-009/FR-011).
7. Select "System" again after a manual override. Confirm the app
   immediately reflects the current OS preference and resumes live-tracking
   further changes (US3 Scenario 1).
8. Inspect the control itself at each of the three states. Confirm the
   trigger's own icon (Monitor/Sun/Moon) always matches the current mode at
   a glance, and opening the menu shows exactly one item checked (US3
   Scenario 2, FR-008).
9. With "Dark" manually selected, reload the page. Confirm the trigger's
   icon resets to the System (Monitor) icon and the app shows whatever the
   OS preference resolves
   to now — the manual override does not survive the reload (Edge Cases,
   FR-006/FR-007). This is the feature's one real, accepted limitation
   (constitution Principle VI) — confirm it happens, don't treat a failure
   to reset as a bug to "fix" by adding persistence.
10. Open two tabs. Manually override the theme in one. Confirm the other
    tab is unaffected (Edge Cases — no cross-tab sync).
11. Switch dashboard tabs (a real mount/unmount of `DashboardRenderer`)
    while a manual theme override is active. Confirm the theme stays as
    selected — `ThemeToggle` itself lives in `shell.tsx`'s header, outside
    `DashboardRenderer`, so it never unmounts on a tab switch.

## Automated coverage (`tests/integration/themeToggle.spec.ts`)

Playwright, using `page.emulateMedia({ colorScheme })` before/after
navigation to control the reported OS preference deterministically (no
reliance on the CI machine's own real OS setting):

- Boot with `colorScheme: 'dark'` → assert `dark` class present pre- and
  post-mount.
- Boot with `colorScheme: 'light'` → assert `dark` class absent.
- Boot `'light'`, then call `emulateMedia({ colorScheme: 'dark' })` again
  post-load while `mode` is still `'system'` → assert the class updates
  without a reload. **Verify empirically first** whether Chromium actually
  fires `matchMedia`'s `'change'` event for a post-load `emulateMedia()`
  call (not just the initial media state) — if it does not in the pinned
  Playwright/Chromium version, this scenario needs a different, documented
  verification technique instead of being silently dropped.
- Open the menu (click the trigger button), select "Dark", then
  `emulateMedia({ colorScheme: 'light' })` → assert the class stays `dark`
  (manual override holds).
- Select "System" after a manual override → assert the class matches
  whatever `colorScheme` is currently emulated.
- Reload after a manual override → assert the trigger's `aria-label` reads
  `"Theme: System"` again and the class matches the current emulated
  preference.
- Drag a field onto a `graphic-walker` panel's shelf (reusing
  `graphicWalkerPanel.spec.ts`'s existing rbd-keyboard-drag technique,
  duplicated locally since the original helper isn't exported), toggle the
  theme via the menu, assert the field is still on the shelf.
- Assert the trigger's `aria-label` (`"Theme: <Mode>"`) matches `mode` at
  each of the three states; assert exactly one `menuitemradio`
  (`data-state="checked"`) inside the opened menu matches it too.

## Full regression (run after implementation, same discipline as every
prior feature)

- `npx tsc --noEmit`
- `npx vitest run` (no new unit tests expected for this feature —
  research.md's Testing note — but the full suite must still pass
  unchanged)
- `npx playwright test` — full suite, confirming zero regressions to any
  existing panel type or to `dashboardShell.spec.ts`'s own tab-navigation
  coverage now that the header layout has changed (`ScenarioLoader` +
  `ThemeToggle` sharing one wrapper `div`)

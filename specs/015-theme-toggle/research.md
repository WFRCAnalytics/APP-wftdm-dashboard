# Phase 0 Research: Light/Dark Theme Toggle

## 1. `useColorScheme()` needs zero changes

**Decision**: Consume `src/hooks/useColorScheme.ts` completely unmodified.

**Rationale**: Read directly — its `subscribe()` registers one
`MutationObserver` on `document.documentElement`, filtered to
`attributeFilter: ['class']`, and its `getSnapshot()` just re-reads
`classList.contains('dark')` on demand. Neither function has any dependency
on *what* changed the class or *how* — a `MutationObserver` fires on any
mutation of a watched attribute, full stop. A toggle that adds/removes
`.dark` via ordinary `classList` calls is therefore not a parallel or
competing write path; it is exactly the write-side counterpart this hook's
own header comment already names as the anticipated future feature:
"no real theme-toggle UI exists in the app yet ... the only place `.dark` is
toggled today is `src/demo/DesignTokenDemo.tsx`."

**Alternatives considered**: Extending `useColorScheme()` itself with a
`setColorScheme()` export was considered and rejected — it would blur a
hook that is deliberately read-only (`useSyncExternalStore`-shaped, matching
`useFilterState`/`useActiveScenarios`) with the toggle's own separate
concern (Theme Mode: System/Light/Dark, a superset of the two-value
`ColorScheme` type this hook returns). Keeping them separate also means
every existing `useColorScheme()` call site (currently only
`GraphicWalkerPanel.tsx`) needed literally zero review or change for this
feature.

## 2. Tailwind's `class` strategy gives no automatic OS-preference behavior — confirmed, not assumed

**Decision**: Application code must explicitly read
`window.matchMedia('(prefers-color-scheme: dark)')` to resolve System mode;
nothing in the existing Tailwind/CSS pipeline does this for free.

**Rationale**: `tailwind.config.js` sets `darkMode: ['class']`. Read
`src/styles/tokens.css` end to end: it defines `:root { ... }` (light) and a
separate `.dark { ... }` block, with no `@media (prefers-color-scheme:
dark)` block anywhere in the file. Under the `class` strategy, Tailwind
generates `.dark &`-scoped (here, plain `.dark` selector) rules only — it
never wires up the `prefers-color-scheme` media query itself; that only
happens under the alternative `darkMode: 'media'` strategy, which this
project does not use (and switching to it would be a `tailwind.config.js`
change this feature has no reason to make — `media` strategy has no
"manual override" story at all, which User Story 2/3 both require). A
project-wide search for `prefers-color-scheme` in `src/` turns up zero
matches outside one explanatory code comment already added during the
`014-graphic-walker-panel` theme fix — confirming this is genuinely
greenfield, not a rediscovery of dead code.

**Alternatives considered**: Switching `darkMode` to `'media'` and layering
a manual override on top via a second, higher-specificity class was
considered and rejected — Tailwind's own `class`-strategy is already the
constitution-fixed choice (Principle VI names shadcn/ui + Tailwind as a
fixed pairing), and `class` strategy already supports everything this
feature needs (both an OS-driven default and a manual override) once the
`.dark` class is driven by application code instead of the CSS engine —
no config change is actually necessary.

## 3. The real pre-mount flash risk, and why the fix belongs in `main.tsx`, not a React effect

**Decision**: Add one synchronous line at the very top of `main.tsx`,
before `await initDuckDB()`, that reads `matchMedia` and applies the `dark`
class immediately.

**Rationale**: Read `main.tsx`'s actual boot sequence: `await initDuckDB()`
→ `await discoverScenarios()` → `await loadDashboards()` all run *before*
`ReactDOM.createRoot(rootEl).render(...)` is ever called. Read `index.html`:
`<body>` contains only `<div id="app"></div>` with no background styling of
its own, so the browser paints its plain default background (white) for the
entire boot duration. For a dark-preferring viewer, that gap — DuckDB-WASM
initialization plus scenario/dashboard-config discovery, not instantaneous
— is a real, visible flash of the wrong theme, not a single-frame
imperceptible one. A `useLayoutEffect` inside `themeToggle.tsx` (or
anywhere else in the React tree) cannot fix this: `useLayoutEffect` only
guarantees synchronous application *before the browser paints React's own
first commit* — it has no influence at all over paints that happen before
React mounts in the first place, which is exactly where this flash's
duration is dominated. The fix has to run earlier than React, in plain
synchronous JS, which is exactly what the first line of `main.tsx` (running
before any `await`) is.

**Alternatives considered**:
- An inline `<script>` in `index.html`'s `<head>`, the most common pattern
  for this exact problem in static-site tooling (Next.js/Docusaurus-style
  "no-flash" snippets) — considered and rejected in favor of the `main.tsx`
  line specifically to avoid touching `index.html` at all: CLAUDE.md
  documents its two script tags explicitly, with the coi-serviceworker tag
  called out as "MUST BE FIRST"; adding a third inline script is a
  structural change to a file this project treats as fixed, for a problem
  the boot-sequence file (`main.tsx`) can solve just as effectively on its
  own, one line, no new file-structure precedent set.
- Doing nothing beyond the `themeToggle.tsx` component's own effect (i.e.,
  accepting the flash) — rejected because SC-002 explicitly calls for "no
  perceptible flash of incorrect-theme content," and the flash here is
  real and measurable (the full boot-sequence duration), not a
  theoretical single-frame concern.

## 4. Theme Mode lives as local `useState` inside `themeToggle.tsx`, not a new global store

**Decision**: No new file under `state/`; Theme Mode (`'system' | 'light' |
'dark'`) is `useState` local to the one `themeToggle.tsx` instance mounted
in `shell.tsx`'s header.

**Rationale**: This project's existing global stores (`state/appState.ts`,
`state/filterState.ts`) exist because more than one independent component
needs to read the same cross-cutting value (active scenarios, active
filters) — both already expose a `subscribe()`/`useSyncExternalStore`
pattern for exactly that reason. Theme Mode has no equivalent multi-reader
need: every other part of the app that cares about theme already reads the
*resolved effective theme* through the existing, unmodified
`useColorScheme()` hook (research.md §1) — not the *mode* that produced it.
Only the toggle control itself ever needs to know whether it's currently in
System, Light, or Dark. Introducing a new global store for a single-reader
value would be unwarranted complexity with no other consumer to justify it.

**Alternatives considered**: A `state/themeState.ts` pub/sub module
mirroring `filterState.ts` — rejected for the reason above; revisit only if
a second, independent component genuinely needs to read Theme Mode itself
in the future (not the resolved theme, which `useColorScheme()` already
serves).

## 5. `matchMedia` listener lifecycle — Decision formalized from `spec.md`'s Assumptions

**Decision**: A single `useEffect`, keyed on `[mode]`, both resolves and
applies the effective theme AND (only in the `'system'` branch) attaches a
`MediaQueryList` `'change'` listener, returned as that effect's own cleanup
function:

```ts
useEffect(() => {
  if (mode === 'system') {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => document.documentElement.classList.toggle('dark', mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }
  document.documentElement.classList.toggle('dark', mode === 'dark')
  return undefined
}, [mode])
```

The listener is attached only while Mode is System and is torn down by
React's own effect-cleanup mechanism on every transition away from System,
re-attached fresh (new `MediaQueryList` object, new closure) on any
transition back.

**Rationale** (restating and formalizing what `spec.md`'s Assumptions
already committed to, per the explicit instruction not to leave this
implicit):
- **Matches this project's own established effect-cleanup convention** —
  scope a subscription's lifetime to the condition that makes it valid via
  the dependency array and cleanup function, the same shape
  `FlowMapPanel.tsx`'s basemap-application effect and `panels/basemap`'s own
  resolution already follow (keyed on a value that changes, not an
  always-on listener gated by an internal check).
- **Avoids a stale-closure hazard the alternative would need extra
  machinery to dodge.** The rejected alternative — one long-lived listener
  attached once, with its callback checking current Mode before acting —
  would capture Mode by closure at attach time; since the listener is only
  ever attached once, that closure would keep reading whatever Mode was
  current *the first time System mode was ever entered*, not the live
  value, unless routed through a `ref` purely to work around that. The
  chosen approach needs no `ref` at all: each Mode transition gets a fresh
  effect invocation and therefore a fresh closure that always closes over
  the current `mode` by construction.

**Alternatives considered**: The long-lived-listener-with-no-op-guard shape
described above — rejected for the reasons above. A `ref`-based hybrid
(long-lived listener, `ref` tracking current mode) was also considered and
rejected as strictly more complex than the chosen approach for no behavioral
benefit — it would still need the same dependency-array-driven effect
machinery to keep the `ref` current, just with an extra layer of
indirection on top.

## 6. Control shape: icon-only `DropdownMenu` trigger — superseded from the original `Tabs` decision, real post-shipping revision

**Original decision (shipped, then reversed)**: The three-way control was
first built with the already-installed shadcn `Tabs`/`TabsList`/
`TabsTrigger` (`components/ui/tabs.tsx`) — three always-visible triggers,
each carrying an icon and a text label. This worked and was fully tested
(11/11 Playwright tests green), but was reversed immediately after shipping
based on real user feedback, not a defect: the header's right-hand group
also holds `ScenarioLoader`, which is variable-width in WEB deployment mode
(it grows by one chip per locally-loaded scenario, each with its own remove
button) — three permanently-visible buttons next to a control that can grow
unpredictably was flagged as a real crowding/wrapping risk on narrower
viewports, not a hypothetical one.

**Revised decision**: A single icon-only trigger `Button` (`variant="outline"
size="icon"`, matching `ScenarioLoader`'s own button styling) showing the
icon for the *current* mode (`Monitor`/`Sun`/`Moon`), opening a
`DropdownMenu` (new primitive, `components/ui/dropdown-menu.tsx`, wrapping
`@radix-ui/react-dropdown-menu`) containing a `DropdownMenuRadioGroup` of
the three modes, each with a checkmark (`DropdownMenuPrimitive
.ItemIndicator`) on the active one. `aria-label={`Theme: ${mode}`}` on the
trigger carries the current-mode information to assistive tech without a
`Tooltip` (see rejected alternative below).

**Rationale**:
- **Directly addresses the real crowding concern** — one button's width
  next to `ScenarioLoader` regardless of how many scenario chips are
  showing, instead of three permanently-reserved button widths.
- **Still fully satisfies FR-008** ("MUST visibly indicate which mode is
  currently active") — the trigger's own icon changes per mode at a glance
  (no click needed to see the *current* state), and the checkmark inside
  the opened menu shows it explicitly for anyone who opens it to change it.
- **A true Radix `Switch` was reconsidered and rejected again, more
  concretely this time**: it is strictly binary and has no third-state
  concept at all — using one would either drop "System" entirely (a real,
  larger redesign undoing spec.md's own three-state rationale — a
  two-state control can't distinguish "following the system" from "I
  overrode it and it happens to match," which matters even more given a
  manual override can't survive a reload) or require a non-standard,
  home-grown three-position variant with no Radix primitive backing it —
  neither is a better trade than the DropdownMenu shape already chosen.

**Alternatives considered** (this revision):
- **A single cycling icon button** (no menu at all — each click advances
  System → Light → Dark → System) — the most compact option, zero new
  dependency. Rejected in favor of the dropdown: less discoverable (a
  viewer has no way to see the other two options without clicking through
  them), and the dropdown's own footprint is already minimal (one button)
  with no real space cost over the cycling button once the menu itself is
  closed.
- **Keeping `Tabs` but dropping the text labels** (icon-only, still three
  buttons) — rejected: still reserves three buttons' worth of width at all
  times, the actual concern being addressed here, just narrower ones.
- **A `Tooltip` on the icon-only trigger** (matching `ScenarioLoader`'s own
  icon+`Tooltip` pattern for its disabled state) — considered and rejected
  again: `ScenarioLoader`'s own header comment already documents one real,
  empirically-found Radix composition hazard (`Tooltip.Root` throwing
  without an ancestor `Provider`); composing `Tooltip` around a
  `DropdownMenuTrigger` would be a second, unproven Radix-on-Radix
  composition (hover-triggered `Tooltip` state alongside a click-triggered
  `DropdownMenu` open state on the *same* element) this feature has no need
  to introduce when `aria-label` already satisfies the same accessibility
  need with zero composition risk.
- **The original `Tabs`-based shape itself** — reused, not reinstalled, if
  this decision is ever revisited again; kept here as the historical record
  of what shipped first and why it changed, per this project's own
  precedent of documenting a real post-shipping reversal rather than
  quietly rewriting history (`014-graphic-walker-panel`'s own
  `embedGraphicWalker` → `<GraphicWalker>` JSX reversal, research.md §3
  there).

**Real dependency consequence of this revision**: `@radix-ui/
react-dropdown-menu` (`^2.1.2`) added to `package.json` — confirmed already
present transitively in `node_modules` (React-18-compatible peer range:
`^16.8 || ^17.0 || ^18.0 || ^19.0`) before adding it as an explicit direct
dependency, matching the existing `@radix-ui/react-dialog`/`-tabs`/
`-tooltip` convention. `npm install` resolved cleanly with no peer warning.
`components/ui/tabs.tsx` itself is untouched — still used by `navBar.tsx`
and the demo page, just no longer by this feature.

**Final trigger styling chosen: `Button` `variant="ghost"`, not
`variant="outline"`.** Rather than guess at trigger styling, five real,
interactive prototypes were built as a standalone comparison artifact
(same real WFRC tokens, same `shell.tsx` header context including
`ScenarioLoader`'s own variable-width scenario chips, one shared Theme
Mode driving all five at once): a ghost icon dropdown, an icon+label
dropdown, an icon-only segmented group, a sliding pill switch, and a
single cycling button. The user picked the ghost icon dropdown — `Button`
`variant="ghost"` (`bg-transparent`, no border, `hover:bg-muted`) instead
of the originally-sketched `variant="outline"` (bordered at rest,
matching `ScenarioLoader`'s own button style). Rationale for the pick, as
reasoned during the comparison: it carries the least visual weight of the
compared options next to `ScenarioLoader`'s own bordered button — no
border at rest at all, only a hover background — which was judged to read
as the better fit for a secondary, dashboard-wide control sharing header
space with a primary, more frequently-used action. No other part of the
shape changed: same `DropdownMenu`/`DropdownMenuTrigger`/
`DropdownMenuContent`/`DropdownMenuRadioGroup`/`DropdownMenuRadioItem`
structure, same `aria-label`, same icon-per-mode trigger.

## 7. Placement: `shell.tsx`'s header, wrapping `ScenarioLoader` + the new control in one right-hand group

**Decision**: `shell.tsx`'s `<header className="flex items-center
justify-between ...">` keeps its existing two-item `justify-between` shape
(`NavBar` left, one right-hand group right) but the right-hand slot becomes
`<div className="flex items-center gap-3"><ScenarioLoader /><ThemeToggle
/></div>` instead of `ScenarioLoader` alone.

**Rationale**: Matches the user's own stated top-right preference exactly,
and mirrors `009-scenario-manager`'s own precedent for where a dashboard-
wide (not panel-specific) header control belongs — confirmed by reading
`shell.tsx` directly: `NavBar` and `ScenarioLoader` are already the header's
only two children, laid out via `justify-between`.

**Alternatives considered**: Making `ThemeToggle` a third top-level
`justify-between` child (three-column header) — rejected: `justify-between`
with three children spreads them across the full width (left/center/right),
which would visually detach the new control from `ScenarioLoader` rather
than placing it "alongside" it as requested; a nested right-hand group
keeps both controls visually grouped together in the top-right corner as
one unit.

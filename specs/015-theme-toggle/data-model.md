# Phase 1 Data Model: Light/Dark Theme Toggle

This feature has no persisted data, no DuckDB view, no config-file entity —
it introduces exactly two small, in-memory concepts, both scoped to one
component's lifetime.

## 1. `ThemeMode`

```ts
export type ThemeMode = 'system' | 'light' | 'dark'
```

- **Represents**: the viewer's currently selected control state (spec.md's
  "Theme Mode" Key Entity).
- **Held by**: `useState<ThemeMode>('system')` local to `layout/
  themeToggle.tsx` (research.md §4) — not exported as a shared/global value;
  no other module reads it directly.
- **Lifetime**: scoped to the mounted `ThemeToggle` component instance —
  i.e., the current page session/tab. Always initializes to `'system'` on
  mount (FR-003/FR-007); never persisted (constitution Principle VI).
- **Transitions**: any mode → any other mode, unconditionally, on viewer
  selection (`Tabs`' `onValueChange`). No invalid-transition case exists —
  it's a plain three-way radio, not a state machine with gated moves.

## 2. Effective theme (already modeled — reused, not redefined)

- **Represents**: the resolved `'light' | 'dark'` appearance actually
  applied to the DOM at any moment (spec.md's "Effective Theme" Key
  Entity) — equal to the live `matchMedia('(prefers-color-scheme: dark)')`
  result when `ThemeMode` is `'system'`, or equal to the explicit choice
  otherwise.
- **Already modeled by**: `useColorScheme()`'s existing `ColorScheme =
  'light' | 'dark'` return type (`src/hooks/useColorScheme.ts`) — this
  feature does not define a second, competing type for the same concept.
  `ThemeToggle` itself never needs to *read* this value (it only *writes*
  the `dark` class that produces it); every consumer that needs to read it
  already does so via `useColorScheme()`, unchanged.
- **Source of truth**: `document.documentElement`'s `dark` class — a single
  boolean, in the DOM itself, not duplicated into any React state. `Theme
  Mode` (§1) is the only new piece of state this feature adds; the
  *effective* theme is derived, not stored twice.

## Relationships

```text
ThemeMode (themeToggle.tsx local state)
   │
   │  resolves + applies (research.md §5's single effect)
   ▼
document.documentElement.classList "dark" ──observed by──▶ useColorScheme()
   ▲                                                              │
   │ live-tracks while mode === 'system'                         │
window.matchMedia('(prefers-color-scheme: dark)')                ▼
                                                          every consumer
                                                          (GraphicWalkerPanel,
                                                          any future one)
```

No entity in this feature is queried, persisted, validated against a schema,
or shared across components beyond the DOM class itself — the class *is*
the shared state, by design (research.md §1).

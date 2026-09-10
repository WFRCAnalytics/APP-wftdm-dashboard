# Data Model: Deployer Scenario Palette & Redesigned Color Picker

## §1. `DashboardBranding` (extended) — `services/yamlLoader.ts`

```ts
export interface DashboardBranding {
  title?: string
  logoUrl?: string
  logoUrlDark?: string
  /** 036-scenario-color-picker: an optional deployer-configured default
   * categorical palette for scenario colors — a list of CSS color
   * strings, cycled by each scenario's registration-order position when
   * no viewer colorOverride is set (spec.md FR-001/FR-002/FR-004). Same
   * discovery/precedence rules as the three existing fields above: the
   * real deployment root's dashboard-config/index.json wins per-field
   * over the git-tracked demo root's own. Entries are NOT validated here
   * — loadDashboardBranding() stays a thin format-only parse, matching
   * its own existing convention for the other three fields; semantic
   * validation (is this a real CSS color) happens once, in main.tsx,
   * where the resolved value is actually consumed (research.md §3). */
  scenarioPalette?: string[]
}
```

`DashboardIndexJson`'s object variant gains a matching optional
`scenarioPalette?: unknown` field; `loadDashboardBranding()`'s return
object gains:

```ts
scenarioPalette: Array.isArray(parsed.scenarioPalette)
  ? parsed.scenarioPalette.filter((c): c is string => typeof c === 'string')
  : undefined,
```

## §2. `panels/scenarioDisplay.ts` (extended) — palette resolution, still pure

```ts
/** The shipped default — this app's own real, WCAG-verified categorical
 * palette (--chart-1..5, 029-shadcn-chart-panel), referenced by CSS
 * custom-property name rather than a copied hex literal (research.md §1)
 * — a future tokens.css retheme carries through with zero change here. */
const DEFAULT_PALETTE: readonly string[] = [
  'var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)',
]

let deployerPalette: readonly string[] | undefined

/** Set once, at boot, from main.tsx — never a reactive store (the
 * deployer's own config is fixed for the session's lifetime). Passing
 * `undefined` (or an empty array) means "nothing configured," falling
 * through to DEFAULT_PALETTE. */
export function setDeployerScenarioPalette(palette: readonly string[] | undefined): void {
  deployerPalette = palette && palette.length > 0 ? palette : undefined
}

/** Cycles the effective palette (deployer-configured, else the shipped
 * default) by `index` — the scenario's stable registration-order
 * position, computed by the caller (hooks/useScenarioDisplay.ts). Still
 * fully DOM-free: a DEFAULT_PALETTE entry is a literal `var(--chart-N)`
 * STRING here, unresolved — research.md §4 covers where and how that
 * gets turned into a concrete value. */
export function resolveDefaultScenarioColor(index: number): string {
  const palette = deployerPalette ?? DEFAULT_PALETTE
  return palette[index % palette.length]
}
```

`ScenarioDisplay`/`ScenarioDisplayMap`/`resolveScenarioLabel()`/
`resolveScenarioColor()` are all confirmed UNCHANGED (spec.md FR-007) —
`ScenarioDisplay.color` still means "the fully-resolved, already-concrete
effective color," it just now gets there via a different fallback chain
one layer up.

## §3. `hooks/useScenarioDisplay.ts` (extended) — the one surgical resolution-chain change, plus its reactivity fix

```ts
export function useScenarioDisplay(): ScenarioDisplayMap {
  const colorScheme = useColorScheme()  // NEW (research.md §4)
  const cache = useRef<Map<string, ScenarioDisplay>>(new Map())
  const cachedColorScheme = useRef<ColorScheme>(colorScheme)

  const getSnapshot = useCallback(() => {
    const scenarios = list()
    const prev = cache.current
    let changed = scenarios.length !== prev.size || colorScheme !== cachedColorScheme.current
    if (!changed) {
      scenarios.forEach((s, index) => {
        const prevEntry = prev.get(s.name)
        const color = s.colorOverride ?? resolveEffectiveDefault(index)
        if (!prevEntry || prevEntry.label !== s.label || prevEntry.color !== color) changed = true
      })
    }
    if (changed) {
      const next = new Map<string, ScenarioDisplay>()
      scenarios.forEach((s, index) => {
        next.set(s.name, { label: s.label, color: s.colorOverride ?? resolveEffectiveDefault(index) })
      })
      cache.current = next
      cachedColorScheme.current = colorScheme
    }
    return cache.current
  }, [colorScheme])

  return useSyncExternalStore(subscribe, getSnapshot)
}

/** var(--x) -> a real, concrete getComputedStyle() value; anything else
 * (a deployer's own literal hex/rgb/named color) passes through as-is. */
function resolveEffectiveDefault(index: number): string {
  const raw = resolveDefaultScenarioColor(index)
  if (!raw.startsWith('var(')) return raw
  const tokenName = raw.slice(4, -1)
  return getComputedStyle(document.documentElement).getPropertyValue(tokenName).trim()
}
```

The ONLY change to this hook's pre-existing shape (data-model.md §3 of
`035`'s own spec) is: `s.color` (the manifest field) is replaced by
`resolveEffectiveDefault(index)`, and `colorScheme` is added as a second
axis of cache invalidation alongside the existing scenario-count/label/
color comparison. `subscribe` (still `appState.subscribe` alone) is
unchanged — `useColorScheme()`'s own independent subscription is what
actually triggers the re-render that makes this hook's `getSnapshot()` run
again on a theme flip (research.md §4's full reasoning).

## §4. `components/ui/color-picker.tsx` — adapted from `shadcnblocks/kibo`

Same public shape as the real source (`ColorPicker`, `ColorPickerSelection`,
`ColorPickerHue`, `ColorPickerAlpha`, `ColorPickerEyeDropper`,
`ColorPickerOutput`, `ColorPickerFormat`, plus the `useColorPicker()`
context hook) — adapted to this project's own conventions (`forwardRef`
where the real source uses a plain function component and needs one,
namespaced `@radix-ui/react-slider` import instead of the unified
`radix-ui` package, single quotes, no `"use client"`).

**The one deliberate behavioral change from the real source**:
`ColorPickerFormat`'s hex and RGB `Input`s lose their `readOnly` prop and
gain real `onChange` handlers:

- Hex mode: on a change, attempt `Color(value)` (the `color` package
  throws on an incomplete/invalid hex) — on success, call
  `setHue`/`setSaturation`/`setLightness`/`setAlpha` from the surrounding
  `useColorPicker()` context; on failure, leave the context's own state
  untouched (spec.md FR-014 — the last valid color stays in effect) while
  still letting the `Input`'s own displayed text reflect what the viewer
  is mid-typing (a local, uncommitted draft value), matching this
  project's own established "controlled input with a local
  not-yet-committed draft" pattern where a raw keystroke isn't always a
  valid value yet.
- RGB mode: each of the three number `Input`s clamps its own `onChange`
  value to `[0, 255]` (spec.md FR-015) before calling `Color.rgb(...)` and
  updating the shared hue/saturation/lightness state the same way.

## §5. `layout/settings/scenarioColorControl.tsx` (new)

```ts
interface ScenarioColorControlProps {
  scenario: Scenario  // state/appState.ts's existing type, unchanged
}
```

Renders: `Popover` → `PopoverTrigger` (a small `h-6 w-6` swatch button,
`style={{ backgroundColor: effectiveColor }}`, matching the row's existing
icon-button scale) → `PopoverContent` (the adapted `<ColorPicker
value={effectiveColor} onChange={([r,g,b]) => appState.setColorOverride(
scenario.name, Color.rgb(r, g, b).hex())}>` composition, plus a
conditional "Reset to default" button calling
`appState.clearColorOverride(scenario.name)`, shown only when
`scenario.colorOverride` is set). `effectiveColor` reads from the same
`useScenarioDisplay()` map every chart panel already reads from — the
Scenarios tab's own swatch and every chart's own rendered color are
guaranteed to agree, since both resolve through the identical hook.

## §6. `layout/settings/scenarioStatusColor.ts` (extended, Part C) — row-level treatment

No new entity — `ScenarioStatus`'s three real values (`ready`/`failed`/
`registering`, `state/appState.ts`, unchanged) are still the only input.
`ScenarioStatusTreatment`'s existing shape (`dotClassName`/`pulse`/
`label`) gains two fields, both derived from the SAME three tokens the
existing `dotClassName`s already reference (`--success`/`--destructive`/
`--muted-foreground`) — no new color is introduced anywhere in this
extension:

```ts
export interface ScenarioStatusTreatment {
  dotClassName: string
  pulse: boolean
  label: string
  /** NEW (Part C, FR-017). A Tailwind border-left utility applied to the
   * row's own outer container — `border-l-4 border-l-{token}`, one of the
   * SAME three tokens dotClassName already names per status. Deliberately
   * a plain utility class, not a slash-opacity form (e.g. NOT
   * `border-l-success/50`) — confirmed via the wftdm-design-system skill
   * that an opacity modifier against this app's plain-hex custom
   * properties generates no CSS at all; a solid border-left needs no
   * transparency to read as "prominent but not loud," so this constraint
   * costs nothing here (unlike rowBackgroundStyle below, which genuinely
   * needs partial transparency and therefore cannot use a plain utility
   * class at all). */
  rowBorderClassName: string
  /** NEW (Part C, FR-018). A real color-mix() background wash, as an
   * inline style object — never a Tailwind slash-opacity utility (the
   * same confirmed-zero-CSS-output limitation as rowBorderClassName's own
   * comment, this time for a case that actually needs transparency, so a
   * plain utility class cannot substitute). `undefined` for `registering`
   * — a pulsing dot already carries that state's own visual signal; a
   * background wash on a fast-changing/transient row would be motion-y
   * noise, not clarity (spec.md Assumptions). */
  rowBackgroundStyle: React.CSSProperties | undefined
}

const TREATMENTS: Record<ScenarioStatus, ScenarioStatusTreatment> = {
  ready: {
    dotClassName: 'bg-success',
    pulse: false,
    label: 'Ready',
    rowBorderClassName: 'border-l-4 border-l-success',
    rowBackgroundStyle: { backgroundColor: 'color-mix(in srgb, var(--success) 6%, transparent)' },
  },
  failed: {
    dotClassName: 'bg-destructive',
    pulse: false,
    label: 'Failed',
    rowBorderClassName: 'border-l-4 border-l-destructive',
    rowBackgroundStyle: { backgroundColor: 'color-mix(in srgb, var(--destructive) 6%, transparent)' },
  },
  registering: {
    dotClassName: 'bg-muted-foreground',
    pulse: true,
    label: 'Loading',
    rowBorderClassName: 'border-l-4 border-l-muted-foreground',
    rowBackgroundStyle: undefined,
  },
}
```

The 6% mix ratio is a design judgment call, not a value the skill
prescribes exactly (spec.md Assumptions) — chosen to read as a genuine
wash at a glance without competing with the row's own text contrast;
verified via `getComputedStyle()` in both themes during T0XX below, not
assumed correct from the ratio alone. `scenarioStatusTreatment()` itself
(the exported resolver function) is unchanged in signature — it still
takes a bare `ScenarioStatus` and returns one `ScenarioStatusTreatment`
object, now simply a richer one.

## §7. `state/appState.ts`'s `Scenario.active` (reused, unmodified, Part C)

No new field. `Scenario.active: boolean` and `setActive(name, active):
void` already exist (`009-scenario-manager`) and are read/written
completely as-is — `layout/settings/scenariosTab.tsx`'s new `Switch`
binds `checked={s.active}` / `onCheckedChange={(checked) =>
appState.setActive(s.name, checked)}` directly, no new state, no new
hook. `useScenarioList()` (`020-settings-modal`) already re-renders this
tab on any scenario field mutation including `active`, confirmed by
direct re-read of that hook before writing this section — no reactivity
gap exists for this control the way `035`'s original `colorOverride`
plumbing once had to be fixed (this feature's own prior finding, Part
A/B). `getBaseline()`'s resolution rule is unchanged and does not
consult `active` in either branch — toggling the current baseline
inactive does not clear or reassign the baseline (spec.md Edge Cases).

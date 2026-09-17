# Data Model: Appearance Settings Expansion

No database, no Parquet schema, no `summarize.yaml`/`dashboard-*.yaml`
grammar change (spec.md Assumptions) — every entity below is in-memory
application state or a small extension to an already-existing config
shape. Grouped by the four user stories.

## Shared: Session Preference (the common shape)

Every viewer-facing preference in this feature (colorblind-safe toggle,
text-size scale, three interface-color overrides, three font selections)
is a **Session Preference**: a module-level value with `subscribe()`/
`notify()`, no persistence across a page reload (research.md §11). This
is not a reusable generic class — each preference is its own small,
concrete module mirroring `state/themeState.ts`'s exact shape (consistent
with how `state/basemapState.ts`/`state/protomapsSourceState.ts` each
independently mirror it today rather than sharing an abstract base).

## US1 — Category Color Resolver & Colorblind-Safe Preference

**Named Color Scheme Catalog** (static, compile-time constant, in the new
`panels/chartColor.ts`):

| Field | Type | Notes |
|---|---|---|
| name | string | e.g. `"Tableau10"`, `"Set2"` — the string a `color_scheme:` YAML field names |
| colors | readonly string[] | hex values from `d3-scale-chromatic` |

Existing entries (`Tableau10`, `Observable10`, `Category10`, `Set3`)
unchanged; five new entries added (`Set1`, `Set2`, `Paired`, `Dark2`,
`Accent` — research.md §2). No entity instance is ever created at
runtime — this is a fixed lookup table.

**Colorblind-Safe Preference** (new `state/colorPreferenceState.ts`):

| Field | Type | Default | Notes |
|---|---|---|---|
| colorblindSafe | boolean | `false` | Session-only (research.md §11) |

Consumed by two independent resolvers, never merged into one entity
(spec.md FR-004 — the two mechanisms stay separate):
- `panels/chartColor.ts#resolveNamedColorScheme(colorScheme, { colorblindSafe })` —
  when `colorScheme` is undefined/unrecognized AND `colorblindSafe` is
  true, the *default* (no-explicit-scheme) fallback path resolves through
  `Set2` instead of the plain `--chart-N` token fallback.
- `panels/scenarioDisplay.ts#resolveDefaultScenarioColor(index, colorblindSafe?)` —
  when true AND no deployer `scenarioPalette` is configured, cycles a new
  `COLORBLIND_SAFE_DEFAULT_PALETTE` (the same `Set2` hex values, literal,
  not `var()` references) instead of `DEFAULT_PALETTE`.

Neither function's existing explicit-input branch (an author's own
`color_scheme:`, a scenario's own `colorOverride`/deployer
`scenarioPalette`) is touched — `colorblindSafe` only ever substitutes
which *default* pool an already-missing-explicit-value case falls back
to.

## US2 — Text Size Preference

New `state/textSizeState.ts`:

| Field | Type | Default | Range | Notes |
|---|---|---|---|---|
| scale | number | `100` | `80`–`150` (percent) | Session-only |

Applied by a new effect in `appearanceTab.tsx` (mirroring its existing
theme-mode effect):
`document.documentElement.style.fontSize = `${scale}%`` — every Tailwind
`rem`-based utility in this app scales proportionally with no
per-component change (research.md §10). Out of scope: any font-size
baked directly into a chart panel's own SVG/D3 render call (spec.md
FR-012) — those are untouched by this preference.

## US3 — Primary / Secondary / Accent Colors

**Interface Color Default** (deployer-configured, new fields on the
existing `DashboardBranding` shape in `services/yamlLoader.ts` —
research.md §5):

| Field | Type | Notes |
|---|---|---|
| primaryColor | string \| undefined | hex/rgb/named CSS color, `CSS.supports('color', ...)`-validated at the `main.tsx` consumption point, same as `scenarioPalette` |
| secondaryColor | string \| undefined | same |
| accentColor | string \| undefined | same |

Merged real-root-then-demo-root with `??` precedence in `main.tsx`
(identical to every other `DashboardBranding` field), then handed to a
new `panels/interfaceColor.ts#setDeployerInterfaceColor(role, value)`
per role — mirrors `setDeployerScenarioPalette`'s "set once at boot,
plain module state, never reactive" shape (a deployer's own config is
fixed for the session's lifetime).

**Interface Color Override** (viewer session, new
`state/interfaceColorState.ts`):

| Field | Type | Default | Notes |
|---|---|---|---|
| primary | string \| undefined | `undefined` (no override) | Session-only |
| secondary | string \| undefined | `undefined` | Session-only |
| accent | string \| undefined | `undefined` | Session-only |

**Resolution** (new `panels/interfaceColor.ts#resolveInterfaceColor(role)`,
pure given its two inputs — mirrors `resolveDefaultScenarioColor`'s
"deployer, else shipped default" shape but with a THIRD, higher tier since
this entity, unlike scenario color, has a real viewer override on top):

```
override(role) ?? deployerDefault(role) ?? <dashboard's current shipped value for role>
```

`computeForegroundFor(hex)` (research.md §4, same module) always derives
the paired `-foreground` value from whichever color wins this chain — no
separate foreground field is ever stored or configured, by anyone, for
any role (FR-017: automatic, not chosen).

**Applied by** `hooks/useInterfaceColors.ts` (new, mirrors
`useScenarioDisplay.ts`'s `useSyncExternalStore` + theme-aware
cache-invalidation shape) driving one effect that sets, per role:
`documentElement.style.setProperty('--primary', resolved)` and
`documentElement.style.setProperty('--primary-foreground',
computeForegroundFor(resolved))` (and the `secondary`/`accent`
equivalents) — live, on every change to either tier, no reload
(spec.md FR-019).

Explicitly **not** modeled as a fourth "brand" entity (spec.md's own
Assumptions) — these are three independent role resolutions, not one
combined "palette" object with internal relationships.

## US4 — Font Preference

New `state/fontPreferenceState.ts`:

| Field | Type | Default | Notes |
|---|---|---|---|
| body | string \| undefined | `undefined` (self-hosted Geist default) | Session-only |
| heading | string \| undefined | `undefined` | Session-only |
| mono | string \| undefined | `undefined` | Session-only |

Each non-`undefined` value is a Google Font family name (free-text or
picked from the bundled shortlist — research.md §9). A new
`panels/googleFontLoader.ts` (pure orchestration, one function per role
call) ensures a stable-`id`'d `<link>` tag exists for that role
(`google-font-body`/`google-font-heading`/`google-font-mono`) pointing at
`https://fonts.googleapis.com/css2?family=<name>:wght@400;500;600;700&display=swap`,
then sets `documentElement.style.setProperty('--font-body', `"${name}",
sans-serif`)` (etc.) — the existing self-hosted `--font-body`/
`--font-heading`/`--font-mono` `:root` values in `tokens.css` remain the
CSS-level default; the inline override only exists once a viewer has
actually chosen something (research.md §10). Clearing a role removes that
role's `<link>` tag and clears the inline `style.removeProperty(...)`,
reverting to the stylesheet default with no reload.

No loaded/error/pending status is modeled as durable state — a failed or
in-flight Google Font load simply means the inline `--font-*` override
either isn't set yet or resolves to a family the browser has no matching
`@font-face` for, in which case the browser's own ordinary generic-family
fallback (`sans-serif`/`monospace`, always appended) keeps text legible
in the existing default typeface's visual weight class without any
explicit "did it load" tracking needed (research.md §9's fail-soft-by-
construction finding).

## Cross-Cutting: Nothing Else Changes

Explicitly unmodified by every entity above — confirmed by direct source
read before this design was finalized (research.md §1, §3, §5, §6): the
scenario-color precedence chain's own three existing tiers
(`colorOverride`/`scenarioPalette`/shipped default) and their existing
write path (`appState.setColorOverride`), `panels/panelQuery.ts`/
`services/sqlExpander.ts` (no query-layer entity touched at all),
`components/ui/color-picker.tsx` (reused verbatim, zero changes), and
every panel type's own data-fetch/render lifecycle outside of how it
resolves a *color* or reads `document.documentElement`'s inline
`font-size`/`--font-*` styles.

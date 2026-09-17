# Contract: Category Color Resolution & Colorblind-Safe Preference

Internal UI/resolution contract (no external API/CLI surface) — governs
the consolidated category-color resolver and how the new colorblind-safe
preference reaches it and the separate scenario-color chain.

## Read path — any category-colored panel (Sankey / treemap / sunburst / pie / radar)

**Given** a panel config with a `color_scheme:` field set to a name the
catalog recognizes

**When** that panel resolves its colors via `panels/chartColor.ts#resolveNamedColorScheme(colorScheme, { colorblindSafe })`

**Then** the named scheme's own colors are returned, **regardless of the
`colorblindSafe` value** — an explicit author choice is never overridden
(FR-003, FR-008).

**Given** a panel config with no `color_scheme:` field (or one naming an
unrecognized scheme)

**When** that panel resolves its colors

**Then** `resolveNamedColorScheme` returns `undefined`, and the caller
falls back to `resolveCategoryFallbackColors(el, tokenVarNames)` — UNLESS
`colorblindSafe` is true, in which case the caller uses the `Set2`
colorblind-safe pool instead of the `--chart-N` token fallback (FR-006).

**Given** two different panel types (e.g. one Sankey, one pie), both with
no explicit `color_scheme:`

**When** both render on the same dashboard

**Then** both draw from the identical underlying default (either the same
`--chart-N` token fallback, or, with colorblind-safe mode on, the
identical `Set2` pool) — FR-001's "one shared mechanism" guarantee.

## Read path — scenario-colored panels (unaffected mechanism, same preference)

**Given** a scenario with no `colorOverride` and no deployer-configured
`scenarioPalette` entry

**When** `panels/scenarioDisplay.ts#resolveDefaultScenarioColor(index,
colorblindSafe)` is called

**Then**, with `colorblindSafe` true, it cycles the same `Set2` hex pool
(literal values, not `var()` references); with it false (or omitted), it
cycles `DEFAULT_PALETTE` exactly as today — FR-007.

**Given** a scenario WITH a `colorOverride` set, OR a deployer
`scenarioPalette` entry configured for it

**When** `colorblindSafe` is toggled on or off

**Then** that scenario's resolved color does not change at all — FR-008.
This is the same "explicit wins" rule as the category-color case above,
applied to the separate scenario mechanism independently — there is no
shared code path between the two beyond both reading the same
`colorblindSafe` boolean.

## Write path — the toggle itself

**Given** the Appearance tab's "Prefer colorblind-safe palettes" control

**When** a viewer toggles it

**Then** `state/colorPreferenceState.ts#setColorblindSafe(next)` is
called, `notify()` fires, and every already-mounted consumer
(`useColorblindSafePreference()` in `hooks/useScenarioDisplay.ts`, and
each category-colored panel's own re-render path) picks up the new value
on its next render — no reload (FR-009).

**Given** a fresh page load

**When** the app boots

**Then** `colorblindSafe` starts at `false` — no persistence across a
reload (FR-005's control is always available, but always starts off).

## Non-goals (explicitly unchanged by this contract)

- The `NAMED_SCHEMES` catalog's *content* beyond the five new named
  additions (research.md §2) — no existing scheme name's own color values
  change.
- `panels/panelQuery.ts`/`services/sqlExpander.ts` — no query-layer change
  of any kind; this contract governs color resolution only, after rows
  are already fetched.
- `state/appState.ts#setColorOverride`/`clearColorOverride` and
  `panels/scenarioDisplay.ts#resolveScenarioColor`/`resolveScenarioLabel` —
  the scenario override/label mechanisms themselves, untouched (only
  `resolveDefaultScenarioColor`'s own default-tier gains the new optional
  parameter).

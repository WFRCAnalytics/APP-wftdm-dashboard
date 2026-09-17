# Contract: Primary / Secondary / Accent Color Resolution & Picker

Internal UI/resolution contract (no external API/CLI surface) — governs
the three-tier color chain for the Primary, Secondary, and Accent visual
roles, and how the new Appearance-tab pickers read/write it. Deliberately
mirrors `specs/036-scenario-color-picker/contracts/scenario-color-
resolution.md`'s own shape, with one structural difference noted where it
occurs: this chain has three tiers (viewer override, deployer default,
shipped default), not two.

## Read path — every consumer of `--primary`/`--secondary`/`--accent`

**Given** `hooks/useInterfaceColors.ts`'s resolved value for a role,
built once per relevant render

**When** any consumer reads it (the Appearance tab's own swatch, or
simply the ordinary CSS cascade every `bg-primary`/`text-accent`
Tailwind utility already relies on)

**Then** the value in effect is always fully resolved and concrete,
per this precedence, evaluated independently per role:

1. `state/interfaceColorState.ts`'s viewer session override for that
   role, if set.
2. The deployer-configured default for that role
   (`DashboardBranding.primaryColor`/`secondaryColor`/`accentColor`), if
   configured.
3. The dashboard's own current, unconfigured token value for that role
   (`tokens.css`'s existing `--primary`/`--secondary`/`--accent`
   `:root`/`.dark` values — untouched, still theme-paired as they are
   today).

**Given** any color resolved for a role by tier 1 or tier 2 above

**When** it is applied

**Then** `panels/interfaceColor.ts#computeForegroundFor(hex)` also
computes and applies that role's paired `-foreground` value, automatically
— no deployer or viewer ever configures a foreground directly (FR-017).
Tier 3 needs no foreground computation — `tokens.css`'s own existing
`-foreground` values already apply unmodified via the ordinary stylesheet
cascade when no inline override exists for that role.

## Write path — the new Appearance-tab pickers

**Given** one of the three role swatch triggers in the Appearance tab

**When** a viewer clicks it

**Then** a `Popover` opens containing the same adapted `ColorPicker`
`scenarioColorControl.tsx` already uses (`components/ui/color-picker.tsx`,
unmodified), initialized to that role's current effective color (the same
value the read path above resolves).

**Given** the picker is open

**When** a viewer changes the color via any of its surfaces

**Then** `interfaceColorControl.tsx`'s own `onChange` converts
`[r, g, b, a]` to a hex string and calls
`state/interfaceColorState.ts#setInterfaceColorOverride(role, hex)` —
identical conversion to `scenarioColorControl.tsx`'s own proven write
path (research.md §6).

**Given** the picker is open and a viewer session override is currently
set for that role

**When** a viewer clicks "Reset to default"

**Then** `clearInterfaceColorOverride(role)` is called — the swatch and
every part of the interface using that role's tokens revert, immediately,
to the deployer-default tier's color (or the shipped default, if the
deployer configured none) — FR-018.

**Given** a viewer types an incomplete/invalid hex code or an
out-of-range RGB number

**When** the input is not yet a valid, complete color

**Then** the override is not updated — the last valid color stays in
effect, matching `scenarioColorControl.tsx`'s own already-proven
validation behavior exactly (no new validation logic — the same shared
`ColorPicker` component already enforces this).

## Non-goals (explicitly unchanged by this contract)

- `components/ui/color-picker.tsx` — zero changes; already role-agnostic.
- The scenario-color three-... two-tier chain (`colorOverride`/
  `scenarioPalette`/shipped default) — a structurally similar but
  entirely separate mechanism, unaffected.
- `tokens.css`'s own `:root`/`.dark` `--primary`/`--secondary`/`--accent`
  values — untouched; they remain the tier-3 fallback exactly as shipped
  today, still independently valued per theme (an inline override from
  tier 1/2, per spec.md's own Assumptions, is a single flat value applied
  identically in both themes — it simply outranks whichever of the two
  theme-specific stylesheet values would otherwise apply).

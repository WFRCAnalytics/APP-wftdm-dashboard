# Research: Appearance Settings Expansion

All items below were resolved by reading this codebase's real, current
source directly (not assumed from `CLAUDE.md`, which is shown to be stale
in at least one place — see §7) — file paths, exact function names, and
exact current behavior are quoted so Phase 1 design can build against
reality, not documentation.

## §1 — The three duplicated category-color modules, exactly

`src/panels/sankeyColor.ts`, `src/panels/hierarchyColor.ts`, and
`src/panels/polarChartColor.ts` each export a byte-for-byte identical
`NAMED_SCHEMES` lookup table (`Tableau10`/`Observable10`/`Category10`/
`Set3`, all from the already-installed `d3-scale-chromatic`) behind a
differently-named single function (`resolveNamedColorScheme`/
`resolveHierarchyColorScheme`/`resolvePolarColorScheme`), each with an
identical one-line doc comment about falling back to "the token-derived
default." `polarChartColor.ts`'s own header comment already names this
exact duplication and explains it was accepted a second time (for pie
*and* radar sharing one file) specifically to avoid a third and fourth
copy — this feature is the first to actually retire the first two copies.

The *fallback* logic (used when a panel has no `color_scheme` configured
at all) is a **second**, separate duplication, one level up — inside each
consuming component, not the `*Color.ts` modules:

| Consumer | Fallback token count | Tokens used |
|---|---|---|
| `SankeyPanel.tsx` | 4 | `--chart-1..4` |
| `HierarchicalChartHost.tsx` | 5 | `--chart-1..5` |
| `PieChartPanel.tsx` | 5 | `--chart-1..5` |
| `RadarChartPanel.tsx` | 5 (confirmed identical shape to `PieChartPanel.tsx`) | `--chart-1..5` |

Sankey's own comment (`SankeyPanel.tsx:48`) explains its 4-token choice as
a deliberate, already-verified-pairwise-distinct-and-accessible subset —
**not** a bug to fix. Consolidation must therefore parameterize the
fallback token *count*, not force all four callers to the same value —
collapsing Sankey to 5 tokens would be an uninstructed, out-of-scope
visual change (spec.md FR-003: "no visible regression").

**Decision**: One new module, `panels/chartColor.ts`, replaces all three
`*Color.ts` files and both duplicated shapes above:
- `resolveNamedColorScheme(colorScheme, { colorblindSafe }): readonly string[] | undefined` —
  one function, one `NAMED_SCHEMES` table, richer (see §2).
- `resolveCategoryFallbackColors(el, tokenVarNames): string[]` — takes the
  caller's own token list explicitly (so Sankey keeps passing its 4-entry
  array, the others their existing 5-entry array) rather than a hardcoded
  count, preserving each call site's exact current fallback set.

`sankeyColor.ts`/`hierarchyColor.ts`/`polarChartColor.ts` are deleted;
their four import sites are repointed at `panels/chartColor.ts`.

**Alternatives considered**: Leaving the three files in place and only
adding the new schemes to all three in parallel (rejected — perpetuates
the exact duplication the requester specifically asked to end, and
`polarChartColor.ts`'s own header already flags this as the wrong
direction). Forcing every consumer to the same 5-token fallback (rejected
— an uninstructed visual change to Sankey, see table above).

## §2 — A real, verified ColorBrewer catalog (no new dependency)

`d3-scale-chromatic` (already a direct, pinned dependency since
`008-sankey-panel`) exports every standard ColorBrewer qualitative scheme,
confirmed directly against the installed package's own source
(`node_modules/d3-scale-chromatic/src/index.js`) — not assumed from the
library's docs: `schemeAccent`, `schemeDark2`, `schemePaired`,
`schemePastel1`, `schemePastel2`, `schemeSet1`, `schemeSet2`, `schemeSet3`
(already used), alongside the two already-used non-ColorBrewer schemes
(`schemeCategory10`, `schemeObservable10`, `schemeTableau10`).

**Decision**: Add `Set1`, `Set2`, `Paired`, `Dark2`, `Accent` to
`NAMED_SCHEMES` (five new named options; `Pastel1`/`Pastel2` are skipped —
ColorBrewer's own published guidance flags pastel schemes as low-contrast
and not colorblind-safe, a poor fit for a dashboard's own accessibility
goals here). `d3-scale-chromatic` needs no version bump — every added
export already exists in the pinned version.

**Colorblind-safe pool**: ColorBrewer's own published colorblind-safe
qualitative schemes are exactly three: `Set2`, `Dark2`, and `Paired`
(ColorBrewer's own scheme metadata; `Set1`/`Set3`/`Accent`/`Pastel1`/
`Pastel2` are not flagged colorblind-safe). **Decision**: when "prefer
colorblind-safe palettes" is on, the *default* category scheme (used when
a panel specifies no explicit `color_scheme`) draws from `Set2` — a single
concrete, documented colorblind-safe choice — rather than a random pick
among the three, so behavior is deterministic and testable.

## §3 — Threading colorblind-safe mode into the *separate* scenario-color chain

`panels/scenarioDisplay.ts`'s `resolveDefaultScenarioColor(index)` already
implements exactly the two-tier "deployer palette, else shipped default"
chain spec.md's Assumptions say must stay untouched — it cycles
`deployerPalette ?? DEFAULT_PALETTE` (`DEFAULT_PALETTE` today is
`['var(--chart-1)', ..., 'var(--chart-5)']`, five `var()` REFERENCE
strings, resolved to concrete values later by
`hooks/useScenarioDisplay.ts`'s `resolveEffectiveDefault()` via
`getComputedStyle(document.documentElement)`).

**Decision**: Add one new, optional parameter:
`resolveDefaultScenarioColor(index, colorblindSafe?: boolean)`. When
`colorblindSafe` is true AND no `deployerPalette` is configured (deployer
configuration is already "explicit," per spec.md FR-008, and stays
untouched), return from a new `COLORBLIND_SAFE_DEFAULT_PALETTE` — the
same five real `Set2` hex values §2 resolved, as literal hex strings, not
`var()` references (there is no dedicated CSS token for this palette, and
none is needed — `resolveEffectiveDefault()`'s existing "anything that
isn't `var(...)` passes through as-is" branch already handles a literal
hex correctly with zero change to that function).

`useScenarioDisplay.ts` needs one small, precisely-scoped change: call a
new `useColorblindSafePreference()` hook (§5's session-state shape)
alongside its existing `useColorScheme()` call, and fold its value into
the same cache-invalidation check `colorScheme` already participates in
(the file's own existing pattern for "a value that affects the resolved
color must also affect when the memoized snapshot rebuilds").

**Alternatives considered**: Making `scenarioDisplay.ts` itself read the
preference directly (rejected — that module is deliberately DOM-and-
store-free/Vitest-safe per its own header comment; threading the value in
as a parameter from the one hook that's allowed to touch React/DOM state
keeps that guarantee intact, the same reason `resolveEffectiveDefault()`
already lives in the hook rather than the pure module).

## §4 — Auto-computed legible foreground: no new dependency

The `color` npm package (`^5.0.3`, already a direct dependency since
`036-scenario-color-picker`, used today for `Color.rgb(...).hex()`
conversions in `scenarioColorControl.tsx`) already ships a real
`.isLight()`/`.isDark()` pair, confirmed by direct execution against the
installed package:

```
Color('#3358be').isDark()   // true
Color('#3358be').luminosity() // 0.114...
```

**Decision**: `computeForegroundFor(hex: string): '#000000' | '#ffffff'`
(new, pure, in the same new module the Primary/Secondary/Accent resolver
lives in — see data-model.md) — `Color(hex).isLight() ? '#000000' :
'#ffffff'`. No WCAG contrast-ratio math needs to be hand-rolled; `color`'s
own `isLight()`/`isDark()` already implements the standard perceptive-
luminance split used for exactly this "pick a legible foreground" purpose,
and it is already a trusted, in-use dependency for color math in this
exact settings surface.

**Alternatives considered**: Implementing WCAG relative luminance and a
4.5:1 contrast search by hand (rejected — `color` already solves the
"black or white" binary case correctly and simply; a full WCAG contrast
search is warranted only if a non-binary foreground were needed, which
nothing here requires).

## §5 — Deployer config: extending the existing `DashboardBranding` shape

`src/services/yamlLoader.ts`'s `loadDashboardBranding()` already
establishes the exact pattern for every new deployer-configurable field
added since `028-dashboard-branding`: an internal `unknown`-typed raw
shape, a `typeof parsed.X === 'string'` (or array/Array.isArray) coercion
per field, `undefined` for anything malformed or absent — never a thrown
error (`protomapsPmtilesUrl`/`scenarioPalette` are the two most recent,
confirmed-real examples). `main.tsx` then merges the real and demo roots
with `primaryBranding.X ?? demoBranding.X` and, for `scenarioPalette`
specifically, performs its OWN semantic validation (`CSS.supports('color',
entry)`) at the one real consumption point, before calling
`setDeployerScenarioPalette(...)`.

**Decision**: Three new optional `DashboardBranding` fields —
`primaryColor?: string`, `secondaryColor?: string`, `accentColor?: string`
— parsed with the exact same `typeof === 'string'` coercion, merged in
`main.tsx` with the same `??` precedence, and validated the same way
(`CSS.supports('color', ...)`) before being handed to a new
`setDeployerInterfaceColor(role, value)` setter (mirroring
`setDeployerScenarioPalette`'s "set once at boot, never a reactive store"
shape — a deployer's own configuration is fixed for the session).

**Alternatives considered**: A single nested `interfaceColors: {primary,
secondary, accent}` object field (rejected — every other
`DashboardBranding` field is flat; introducing the app's first nested
field here for three fields that are handled completely independently
everywhere else in this feature buys no real benefit and breaks the
established flat-field scanning convention `loadDashboardBranding()`'s own
raw-shape type already uses).

## §6 — Reusing the exact scenario color picker UI

`src/layout/settings/scenarioColorControl.tsx` (real, shipped, `036`) is
the complete reference implementation for "a swatch that opens a Popover
hosting the adapted `ColorPicker`, writes a hex string on change, shows a
conditional Reset button": `Popover`/`PopoverTrigger`/`PopoverContent`
(`components/ui/popover.tsx`, already installed) wrapping `ColorPicker` +
`ColorPickerSelection`/`ColorPickerEyeDropper`/`ColorPickerHue`/
`ColorPickerAlpha`/`ColorPickerOutput`/`ColorPickerFormat`
(`components/ui/color-picker.tsx`, already installed, already fought-with
and fixed for its real HSL-alpha and circular-update-loop bugs per
`036`'s own record) — `onChange={([r, g, b]) =>
setOverride(Color.rgb(r, g, b).hex())}` is the exact, already-proven
conversion.

**Decision**: A new, parallel component (e.g.
`layout/settings/interfaceColorControl.tsx`) with the identical shape,
generalized over a `role: 'primary' | 'secondary' | 'accent'` prop instead
of a `Scenario` — reading from a new `useInterfaceColors()` hook (mirrors
`useScenarioDisplay()`'s shape, see data-model.md) instead of
`useScenarioDisplay()`, writing through a new `setInterfaceColorOverride`/
`clearInterfaceColorOverride` pair instead of `appState.setColorOverride`/
`clearColorOverride`. `components/ui/color-picker.tsx` itself needs **zero
changes** — it is already role-agnostic (its own header comment already
calls it "the shared primitive... stays scenario-agnostic").

## §7 — A real, stale-`CLAUDE.md` finding: `coi-serviceworker.js` does not exist in this checkout

`CLAUDE.md` describes `public/coi-serviceworker.js` loaded first in
`index.html`, "MUST BE FIRST." Confirmed directly, not assumed: this file
does not exist anywhere in the current tree (`public/` holds no such
file), and the real, current `index.html` has no `<script>` referencing
it at all — `index.html`'s only script tag is `<script type="module"
src="/src/main.tsx">`. `vite.config.ts`'s dev-server COOP/COEP headers are
explicitly commented "dev only," and no production mechanism (no
client-side polyfill, since the file doesn't exist) supplies those headers
on GitHub Pages. This means the real, deployed production app runs
**without** cross-origin isolation at all today — `@duckdb/duckdb-wasm`'s
own bundle-selection logic already handles this gracefully (it picks a
non-threaded bundle when `crossOriginIsolated` is false), so this is not
a defect this feature needs to fix, but it does retire one theoretical
risk this feature's own font-loading design might otherwise have worried
about (see §8) and is flagged here as a genuine, separate documentation
staleness this feature is not in scope to correct.

## §8 — Google Fonts loading is safe under this app's dev-only COEP, empirically confirmed

Even though §7 shows production has no COEP at all, the local dev server
still sets `Cross-Origin-Embedder-Policy: require-corp`
(`vite.config.ts`), which — if left unverified — could plausibly block a
dynamically injected cross-origin Google Fonts `<link>`/`@font-face`
fetch. Checked directly, not assumed, via a live HTTP request to the real
endpoints this feature will use:

```
$ curl -sI "https://fonts.googleapis.com/css2?family=Roboto&display=swap"
Access-Control-Allow-Origin: *
Cross-Origin-Resource-Policy: cross-origin
...
$ curl -sI "https://fonts.gstatic.com/s/roboto/.../....woff2"
Access-Control-Allow-Origin: *
Cross-Origin-Resource-Policy: cross-origin
...
```

Both the CSS stylesheet response (`fonts.googleapis.com`) and the actual
font-file response (`fonts.gstatic.com`) already carry
`Cross-Origin-Resource-Policy: cross-origin` — satisfying
`Cross-Origin-Embedder-Policy: require-corp`'s CORP check directly,
independent of the CORS-pass-through path font fetches also separately
qualify for. **Conclusion**: no special `crossorigin` attribute handling,
proxying, or COEP workaround is needed anywhere in this feature — a plain
dynamically-injected `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?...">`
loads correctly in every environment this app runs in today, dev or
production alike.

## §9 — Populating the font picker without a Google API key

The real Google Fonts Developer API (`www.googleapis.com/webfonts/v1/
webfonts`, which returns the full, current family listing as JSON) requires
an API key — this is a purely static frontend app with no secret-storage
mechanism, and embedding any key (even one Google's own docs describe as
non-secret/client-usable) was judged unnecessary complexity for what this
feature actually needs.

**Decision**: The picker is a combo box — free-text entry (any family
name the viewer types) seeded with a small, static, bundled shortlist of
~30 well-known Google Font family names for convenience/discoverability,
requiring no network call to populate. Loading is attempted for whatever
name is actually chosen (typed or picked), via the CSS2 endpoint
(`https://fonts.googleapis.com/css2?family=<Family+Name>:wght@400;500;600;700&display=swap`).
An invalid/nonexistent family name returns an empty-but-200 stylesheet
from Google's own endpoint (confirmed by the same `curl` check as §8 —
`Content-Length: 0` for a syntactically valid-but-unmatched request) —
the browser then simply has no matching `@font-face` rule to apply, and
the existing self-hosted default remains visually in effect with no error
surfaced, satisfying FR-024's fail-soft requirement as a natural
consequence of this design rather than bespoke error-handling code.

**Alternatives considered**: A live-fetched, exhaustive dropdown via the
real Developer API (rejected — needs a client-embedded API key for no
real behavioral gain over free-text entry, which already offers the exact
same "any Google Font" breadth FR-020 asks for). A hardcoded, closed list
with no free-text option (rejected — this is exactly the "curated
shortlist" alternative the requester explicitly chose *against* in favor
of true breadth, during this feature's own discussion phase).

## §10 — Where to apply live overrides: inline styles on `document.documentElement`

`layout/settings/appearanceTab.tsx`'s existing theme-mode effect already
establishes the pattern for a live, global, DOM-level appearance change:
`document.documentElement.classList.toggle('dark', ...)`. Inline custom
properties set via `document.documentElement.style.setProperty(...)` take
precedence over any `:root`/`.dark` stylesheet rule regardless of which
theme class is active (ordinary CSS cascade — inline `style` beats any
non-`!important` stylesheet rule), so this is the correct, minimal
mechanism for every live override this feature needs:

- `--primary`/`--primary-foreground` (and the `secondary`/`accent` pairs)
  → `documentElement.style.setProperty('--primary', hex)`.
- Text size → `documentElement.style.fontSize = '<percentage>%'` (Tailwind
  utilities are `rem`-based throughout this codebase, confirmed by
  `tokens.css`'s own convention and this app's existing Tailwind
  configuration — no per-component change needed for the scale to take
  effect app-wide).
- Fonts → `documentElement.style.setProperty('--font-body', ...)` (etc.),
  after ensuring the corresponding `<link>` for that Google Font exists
  (one stable-`id`'d `<link>` element per role — `google-font-body`/
  `google-font-heading`/`google-font-mono` — so re-selecting or clearing
  one role never disturbs another, and a re-selection simply updates that
  one `<link>`'s `href` rather than accumulating stale tags).

No new CSS mechanism, build step, or stylesheet is needed for any of the
three — confirmed by direct read of `tokens.css` and
`layout/settings/appearanceTab.tsx` before choosing this approach, not
assumed.

## §11 — Session-only state: the established module shape

`state/themeState.ts` (already read directly) is the exact, minimal
pattern every new preference in this feature reuses verbatim: a
module-level mutable value, a `Set<Subscriber>`, `subscribe()`/
`notify()`/a getter/a setter — explicitly **not** persisted across a
reload (`state/themeState.ts`'s own header comment: "Still no persistence
across a page RELOAD (constitution Principle VI unchanged)"). Every new
session preference this feature adds (colorblind-safe toggle, text-size
scale, the three interface-color overrides, the three font selections)
follows this identical shape — confirmed sufficient with no case needing
anything more complex (no async initialization, no cross-tab sync
requirement in spec.md).

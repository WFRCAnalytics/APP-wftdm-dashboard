# Research trail behind wftdm-design-system (Phase 1, 2026-09-06)

Real, direct fetches — not assumptions — against the reference set the user
specified, weighted as instructed (primary references weighted heavily;
secondary references used narrowly; GeoLibre treated as one weak data point,
flagged as likely AI-generated/vibecoded).

**Reweighting note (post-Phase-1 refinement, same day)**: the "PRIMARY
references" grouping below records Phase 1's own original, as-researched
weighting — Supabase Studio/Vercel-Geist/shadcn/gropaul-dash treated as
roughly co-equal. That was refined afterward, explicitly: **shadcn/ui is
this skill's actual primary reference**, not one of several — this app
already shares its exact component/token architecture, making it the most
directly authoritative source by construction, not just one strong data
point among equals. Supabase Studio is a secondary source from that point
on, drawn from specifically where its own pattern genuinely improves on
shadcn's (its 12-step gray scale, its `heading-*`/`text-*` semantic naming
convention), not a co-equal pillar. This file's own historical structure
below is left as originally written — an accurate record of what Phase 1
itself actually researched and how it was weighted at the time — rather
than silently rewritten; the SKILL.md's own "Provenance" section carries
the corrected, current weighting going forward.

## PRIMARY references (as originally weighted — see reweighting note above)

### Supabase Studio (open source)

Real source fetched directly from `github.com/supabase/supabase`:

- `packages/config/css/colors.css`: a **12-step** gray/neutral scale (100–1200,
  sourced from `@radix-ui/colors`), plus **14 distinct accent hue families**
  (Amber, Blue, Crimson, Gold, Green, Indigo, Orange, Pink, Purple, Red,
  Slate, Tomato, Violet, Yellow) — far more color surface area than this
  app needs or has (this app has one brand blue + yellow accent + semantic
  destructive/success). `--radius-panel: 6px` is a real, named token
  specifically for panel surfaces — directly relevant vocabulary for this
  app's own `PanelCard`.
- `packages/config/typography.css`: a real semantic naming convention worth
  copying the SHAPE of (not the literal names) — `heading-title` (`text-2xl`),
  `heading-section` (`text-xl`), `heading-subSection` (`text-base`),
  `heading-default` (`text-sm`), `heading-compact`/`heading-meta` (`text-xs`),
  `text-subTitle` (`text-lg`), `text-default` (`text-base`), `text-compact`
  (`text-xs`). Confirms a dense product's own "panel/section title" tier
  sits at `text-base`/16px, not `text-2xl`/24px — direct evidence behind
  this skill's own Panel Title recommendation.
- Studio's own `apps/studio` package has migrated to Tailwind v4's CSS-first
  config (no single `tailwind.config.ts` to point at) — confirmed via its
  real file tree before concluding this, not assumed from a 404.

### Vercel's own dashboard / Geist design system (closed-source dashboard;
Geist itself is Vercel's own published design system, used across
vercel.com and the Vercel dashboard)

Real values, cross-referenced across a search summary and a direct fetch of
a third-party CSS-extraction (`design-bites` project's `vercel.com/DESIGN.md`,
itself scraped directly from Vercel's own live site CSS — used here as the
closest available substitute for "real screenshots," since a raw screenshot
can't be visually inspected pixel-by-pixel through this tooling anyway):

- Font sizes: 12/13/14/16/32/48px named steps; `--text-xs: 12px` through
  `--text-display: 64px`.
- **Exactly three font weights: 400, 500, 600 — bold (700) deliberately
  excluded.** "Emphasis is communicated through size and spacing, not
  weight."
- Spacing: strictly 4px-multiple tokens `[4, 8, 12, 16, 24, 32, 48, 64,
  96, 128, 192, 256]`; **default card padding is 24px**.
- Border-radius: 6px default, 12px for cards.
- Shadows: a hairline `0 0 0 1px rgba(0,0,0,0.08)` border-shadow, plus
  layered menu/modal shadows (`0px 16px 24px -8px #0000000f` for menus,
  `0px 24px 32px -8px #0000000f` for modals) — a real precedent for THIS
  app's own low/default/high three-tier shadow ladder, just with different
  exact numbers.
- Grayscale: only **4 real steps** in active UI use (`#FAFAFA`/`#F2F2F2`/
  `#EBEBEB`/`#171717`, plus 2 secondary text grays) — much more restrained
  than Supabase's 12-step scale. One accent blue, used only for interactive/
  focus states, "and nothing else."

### shadc/ui's own `dashboard-01` block (`ui.shadcn.com/examples/dashboard`,
real source at `shadcn-ui/ui`)

Fetched `section-cards.tsx` directly — the most directly authoritative
reference, since this app is already built on the same shadcn primitives:

- `gap-4` grid gap, `px-4`/`lg:px-6` horizontal padding, `gap-1.5` footer
  spacing — all real Tailwind default-scale values, same family this app
  already uses.
- Card title: `text-2xl font-semibold` for a **metric/KPI number**
  specifically (a large stat display, analogous to this app's `ValueBoxPanel`,
  NOT a generic panel title) — confirms 24px/`text-2xl` is the right size
  for a big number, not for an ordinary panel header. This is the key
  distinction that resolves the CardTitle finding: shadcn's own
  `dashboard-01` reserves `text-2xl` for the number itself, using a
  smaller, separate label above/around it — not the pattern this app's
  `CardTitle` (used for a panel's plain title text) currently follows.
- `shadow-xs` on cards (shadcn's own newest, lightest shadow tier),
  `size-4` (16px) icons in footers — both align with this skill's own
  Default icon tier and reinforce that a "resting card" doesn't need heavy
  elevation.

### gropaul/dash (`gropaul/dash`, extension; UI served from `gropaul/dash-ui`)

Real `tailwind.config.ts` fetched directly from `gropaul/dash-ui`:

- Uses the **identical shadcn/Radix semantic-token architecture** this app
  already has — `background`/`foreground`/`card`/`popover`/`primary`/
  `secondary`/`accent`/`destructive`/`muted`, each with `DEFAULT`/
  `foreground`, referenced as `hsl(var(--*))`. Plus a `chart-1` through
  `chart-5` set for data-viz color roles this app doesn't currently name
  explicitly (worth considering in a future data-viz-specific token pass,
  out of scope for this phase).
- Border-radius: `lg`/`md`/`sm` all derived from one `--radius` variable via
  `calc()` — **the exact same pattern** this app's own `tailwind.config.js`
  already uses.
- No custom font-size or spacing scale at all — relies on Tailwind
  defaults, same as this app (once the Panel Title finding above is
  applied).

**Convergence finding**: three of the four primary references (this app
itself, gropaul/dash, and shadcn's own dashboard example, which dash-ui's
own component references were already partly modeled on per
`project-docs/PIPELINE.md`'s prior note) all sit on the literal same shadcn/Radix
token architecture. This strongly validates NOT reinventing the token
foundation — the redesign's job is refining scale VALUES within the
existing architecture, not replacing the architecture itself.

## SECONDARY references (narrower — used for specific corroboration, not
overall direction)

### Linear (closed source — design-teardown search only)

- Primary typeface Inter Variable; three-tier weight system **400/510/590**
  (near-identical in spirit to Vercel's 400/500/600 — independent
  convergence on "three weights, skip bold").
- Aggressive negative letter-spacing at display sizes (up to -1.58px at
  72px), relaxing toward normal below 24px — informs the `tracking-tight`
  already applied to this app's heading roles, not a reason to add more.

### Grafana (open source — real source fetched)

`packages/grafana-data/src/themes/createTypography.ts` and
`createSpacing.ts`, fetched directly:

- A real h1–h6 scale for a genuinely DENSE, metrics-heavy application (the
  closest domain analogue to this app of anything checked): h1 28px, h2
  24px, h3 22px, h4 18px, **h5 16px**, h6 14px, body 14px, bodySmall 12px.
  h5's 16px is the strongest single corroborating data point for this
  skill's own Panel Title recommendation (16px) — a dense dashboard
  product's own established "small heading" tier lands exactly there.
- Explicit constraint: "font size and line height should be integer
  multiples of 2."
- Spacing: **8px base grid** (`gridSize = 8`), scale `[0, 2, 4, 8, 12, 16,
  20, 24, 32, 40, 48, 64, 80]` — the same 24px anchor as Vercel/Geist,
  confirmed independently.

### Tremor (open source — real published values via search)

Real, documented type scale: `tremor-label` 12px, `tremor-default` 14px/
20px line-height, `tremor-title` 18px/28px, `tremor-metric` 30px/36px —
another independent data point putting a component library's own
"default body" at 14px and its "title" (a component-level heading, not a
page title) at 18px, both close to this skill's own choices.

### Metabase, Directus

No real, concrete source located (Metabase's design tokens aren't
published in an easily fetchable form; Directus wasn't separately
investigated given time spent on higher-priority primary sources). Not a
gap that changes any decision above — every decision already has at least
two independent corroborating sources without these.

## GeoLibre — explicitly weighted as ONE weak data point only

Per the user's own explicit instruction, not treated as a primary
influence (flagged as likely AI-generated/vibecoded). Its documentation
does describe a "dark-mode elevation ladder that separates canvas, panels,
dialogs, and menus by surface" and "theme-aware shadows that stay visible
in dark mode" — genuinely similar VOCABULARY to what `tokens.css` already,
independently, correctly implements (the `--shadow-ring` edge-highlight
mechanism, built well before this research and unrelated to GeoLibre).
Nothing was adopted FROM GeoLibre here — the vocabulary match is
coincidental convergence on a real problem (dark-mode shadow legibility),
not something copied, and this skill does not cite GeoLibre as a source
for any concrete value above.

## Vercel Web Interface Guidelines skill (installed this phase)

Installed via `npx skills add https://github.com/vercel-labs/agent-skills
--skill web-design-guidelines` (confirmed as the real, current, official
install command via direct web research before running it — not guessed).
Fetched its actual guidelines source
(`raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`)
directly: it is a **code-level QA/accessibility compliance checklist**
(keyboard handling, focus management, `tabular-nums`, curly quotes,
`scroll-margin-top`, `color-scheme`, ARIA on icon-only buttons, etc.), NOT
a visual design-token specification — it has no font-size/spacing/shadow
scale of its own to extract. It remains genuinely useful for Phase 2/3's
actual implementation work (a real compliance pass once components are
being built/edited), which is why it was installed now rather than
skipped — but it contributed no typography/spacing/elevation/color values
to this skill, and shouldn't be expected to.

## Anthropic `skill-creator` (installed this phase)

Installed via `claude plugin marketplace add anthropics/claude-plugins-official`
+ `claude plugin install skill-creator@claude-plugins-official` (confirmed
via direct web research as the real, current, official distribution
channel before running it). Confirmed enabled at the plugin-manager level,
but not yet active as an invocable skill in the same session it was
installed in (`claude plugin update`'s own documented "restart required to
apply" behavior appears to apply to fresh installs mid-session too, not
only updates). This skill (`wftdm-design-system`) was therefore
hand-authored directly against skill-creator's own real, installed
`SKILL.md` instructions (read directly from
`~/.claude/plugins/cache/claude-plugins-official/skill-creator/`) — same
frontmatter shape (`name`/`description`), same "explain the why, keep it
lean, use progressive disclosure with a `references/` directory" guidance
— rather than skill-creator's own full interactive eval/benchmark loop,
which is designed for skills with variable per-invocation output (a
PDF-extraction skill, a docx-builder) needing triggering-accuracy tuning
across many prompts. This skill is closer to a static reference document
(this project's own `project-docs/GRAMMAR.md` already sets that precedent) than a
task-execution skill, so that loop wasn't run. Available to actually run
(evals, description-triggering optimization) next session once the plugin
is active, if further iteration is wanted.

## Note on "already-available official frontend-design skill"

The request asked to confirm `/mnt/skills/public/frontend-design/SKILL.md`
is being consulted. That path does not exist on this machine — checked
directly (`ls` returns "No such file or directory") — it is not merely
unconsulted, it is **absent**. That path convention belongs to Claude.ai's
hosted sandboxed-container environment; this session runs in the local
Windows Claude Code CLI, which has no such bundled skill. This is recorded
here rather than silently assumed present. The Vercel skill installed this
phase (above) is this project's own real substitute for that reference
class going forward.

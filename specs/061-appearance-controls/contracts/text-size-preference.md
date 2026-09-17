# Contract: Text Size Preference

Internal UI contract (no external API/CLI surface).

## Read/apply path

**Given** `state/textSizeState.ts`'s current `scale` value (percent,
80–150, default 100)

**When** the Appearance tab is mounted, or `scale` changes

**Then** an effect sets `document.documentElement.style.fontSize =
`${scale}%`` — every Tailwind `rem`-based interface element resizes
proportionally through the ordinary CSS cascade, with no per-component
change (FR-010, FR-011).

**Given** any text drawn directly inside a chart panel's own SVG/D3
render call (Sankey/treemap/sunburst/pie/radar labels, axis text)

**When** `scale` changes

**Then** that text is unaffected — it uses hardcoded pixel font sizes set
by each panel's own renderer, entirely independent of
`document.documentElement`'s font size (FR-012, explicitly out of scope,
not a defect).

## Write path

**Given** the Appearance tab's text-size slider

**When** a viewer drags it

**Then** `state/textSizeState.ts#setScale(next)` is called continuously
(or on release — an implementation choice with no behavioral contract
either way, since both satisfy FR-011's "immediately, without reload"),
clamped to `[80, 150]`.

**Given** a fresh page load

**When** the app boots

**Then** `scale` starts at `100` — no persistence across a reload
(FR-013).

## Non-goals

- No per-panel or per-region text-size override — one global scale only.
- No interaction with the colorblind-safe preference, interface colors,
  or font preference — fully independent (spec.md's Edge Cases: changing
  one preference must never affect another).

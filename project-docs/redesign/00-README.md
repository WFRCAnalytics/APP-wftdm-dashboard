# Dashboard redesign — design specification (index)

Status: approved direction, ready to implement. Written 2026-10-20 after six prototype rounds.
Audience: any engineer or AI agent implementing the redesign in this repository. Assume no prior context.

This folder is the single source of truth for the redesign. Read the files in order. Every number, color,
size and behavior that matters is written down here. Where this spec and the prototype disagree, **this
spec wins** (the prototype has known shortcuts, listed in `08-prototype-guide.md`).

## 1. What we are building (one paragraph)

A new look, layout and interaction model for the existing WFRC TDM calibration dashboard. The data
pipeline (Parquet), query engine (DuckDB-WASM in a Web Worker) and maps (MapLibre GL) do **not change**.
Charts stay on Observable Plot and D3. The big ideas are:

1. **One question drives the page: focus on one scenario, or compare many.** A global *Compare* mode,
   a *reference*, and a *Values / Change / % change* switch apply to every tile. Each tile answers in the
   way that suits its chart type (overlay, difference, side by side, one at a time, swipe, synced maps).
2. **Every tile can change chart type and, where it makes sense, grouping.** Same data, different chart.
3. **Scale:** up to about 15 independent scenarios, 50+ calibration rounds, and six milestone model years.
4. **One tooltip for every chart** and **synced hover across side-by-side panels.**
5. **A bold, layered visual language** (dark first, light supported), with three user-adjustable colors.

## 2. The prototype

A working prototype lives in `project-docs/redesign/prototype/`:

- `corridor-pro.html` — open it in a browser. It is the visual and behavioral reference. It needs internet
  (D3, Observable Plot and Google Fonts load from CDNs).
- `src/` — the prototype source (plain JavaScript, not production code). See `08-prototype-guide.md`.

The prototype uses **sample data generated in code** and **stylised stand-ins for maps** (a Voronoi
drawing instead of real zones/tiles). Do not copy its data generators. Copy its *behavior and visuals*.

## 3. Reading order

| File | What it tells you |
|---|---|
| `01-visual-language.md` | Colors, type, spacing, elevation, motion, palettes, theming rules. Exact values. |
| `02-layout-and-components.md` | Page shell, navigation, control bar, tile anatomy, settings, every UI component. |
| `03-state-and-compare.md` | The state model, the compare framework, years, calibration rounds, formulas. |
| `04-chart-catalogue.md` | One entry per chart: data shape, visuals, interactions, tooltip content, compare behavior. |
| `05-tooltips-and-interaction.md` | The tooltip system and hover/click/keyboard behavior, with implementation contracts. |
| `06-data-and-config.md` | Parquet schemas, manifest additions, YAML grammar additions, deployer settings, observed data. |
| `07-implementation-plan.md` | Phased tasks, which repo files change, acceptance criteria, tests, risks. |
| `08-prototype-guide.md` | How to run the prototype, file and function index, gotchas found while building it. |

## 4. Non-negotiable constraints (carried over from `CLAUDE.md`)

These do not change. If a task seems to need breaking one, stop and ask.

- **Parquet / GeoParquet only** in the browser. No CSV, GeoJSON or OMX parsing in the browser.
- **DuckDB-WASM in a Web Worker**, one shared instance via `services/duckdb.ts`.
- **MapLibre GL**, never Mapbox. Overlays via `@deck.gl/mapbox` `MapboxOverlay` with `interleaved: true`.
- **React 18.3.1 + TypeScript.** No other UI framework. `services/` and `state/` stay plain `.ts`.
- **No `localStorage` / `sessionStorage`.** Session-only state lives in plain in-memory module state.
- **No `eval()`.** YAML is parsed at runtime.
- **Charts: Observable Plot first, D3 only where Plot cannot do it** (Sankey, hierarchy, chord, radar,
  pie/donut, waffle, ridgeline, maps). Recharts and Plotly are legacy: do not extend them. Do not add a
  new charting library.
- **Tailwind v4 via the `@config` bridge + shadcn/ui primitives** remain the styling stack.
- **Lazy, tab-scoped Parquet loading** (`tabDataLoader.ts`) stays. Never register every file at boot.

## 5. What the redesign replaces

- The WFRC-blue brand rules in the `wftdm-design-system` skill and `src/styles/tokens.css` are superseded
  by `01-visual-language.md`. Update that skill and `CLAUDE.md` when the work lands (task P9 in file 07).
- The top-level layout in `src/layout/shell.tsx` / `sidebarNav.tsx` / `panelCard.tsx` is replaced.
- The Scenarios, Basemap and Appearance settings tabs keep their **features** but get the new look and
  some new controls (see file 02).

## 6. Glossary (use these words in the UI and in code)

| Term | Meaning |
|---|---|
| **Scenario** | One model run, an independent alternative (for example "Frequent transit"). |
| **Alternative** | A scenario seen across model years. A scenario has a run for each model year. |
| **Model year** | One of the milestone years: 2023 base, 2027 opening, 2032 end of STIP, 2036 end of RTP Phase I, 2046 end of RTP Phase II, 2055 horizon. |
| **Calibration round** | One iteration of base-year calibration. 50 or more. An ordered series, not independent scenarios. |
| **Focus** | The one scenario every chart shows when Compare is off, and the one single-scenario charts show when it is on. |
| **Compare** | Global mode. Brings a *set* of scenarios and a *reference* into every tile. |
| **Compare set** | The scenarios currently ticked in the scenario picker. Also called the *active* set in code. |
| **Reference** | What differences are measured against: *Observed*, a specific scenario, or (new) the same scenario at the base year. |
| **Values / Change / % change** | Global display mode. Values = as is. Change = value minus reference. % change = relative difference. |
| **Tile** | One chart card on a page. |
| **View** | A chart type a tile can show (for example Treemap, Sunburst, Flow). |
| **Group by** | The variable a tile splits its data by (for example mode, purpose, income). |
| **Compare strategy** | How a tile shows a comparison: overlay, difference, side by side, one at a time, swipe. |
| **Observed** | Reference data from surveys and counts. Aggregates only, with source and sample size. |
| **Tolerance** | The calibration target band (for example ±1 point of mode share, 3% error). |

## 7. Writing rules for UI text

- Sentence case everywhere. Plain verbs. No filler words. No exclamation marks.
- A control says exactly what it does. "Compare", "Set as baseline", "Apply". A confirmation uses the same verb.
- Numbers: thousands separators, one decimal for shares, two for million-scale trips (`9.81M`), minus sign is
  the real minus character `−` (U+2212), never a hyphen.
- Errors say what went wrong and how to fix it. They never apologize.
- Empty states say what will appear and how to make it appear.

## 8. Definition of done for the whole redesign

The redesign is done when every item in `07-implementation-plan.md` section "Global acceptance checklist"
passes in both themes, at 1280, 1500 and 1920 px widths, with 1, 3 and 15 scenarios.

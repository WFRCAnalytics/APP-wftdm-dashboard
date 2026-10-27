# Contract: Builder UI

Follows `wftdm-design-system` and `project-docs/redesign/` (Corridor Pro): existing tokens, shadcn primitives
(`tabs select dropdown-menu popover badge button tooltip slider switch input textarea`), lucide icons, light **and** dark.
Never a hard-coded colour; WFRC blue stays the one signature accent (chrome uses `brandColor`; data uses the palette).

## Shell (`explore-builder` panel, chromeless full-page like the current Explore tab)

```
[ Scenario ▾ (multi) ] [ Table ▾ ]   | Data | Chart 1 | Chart 2 | +        [Import] 
```
- Scenario multi-select and Table select feed the Data tab only (raw-data browser). Tables listed are those present in
  every selected scenario; absent ones are disabled with "missing in: …".
- Tabs: `role="tablist"`; Data first and not closable; viz tabs renamable (double-click or F2), duplicable, closable
  (confirm when the tab has a customised chart); `+` adds a tab with the browser's current table as default source.

## Data tab

- Left/top: schema strip (name, type chip with override menu, nullable hint). Centre: preview table with page size
  derived from the container height (min 5), Prev/Next, "Rows x–y".
- SQL panel: `SqlEditor` (textarea), Run (Ctrl/Cmd+Enter), Cancel, status (Running… / N rows in T ms / error with
  position), "Use in query", Save as…, "Query builder" form (collapsible) in sync per `query-and-guard.md`.
- My tables list: name, status badge (ready/broken), rows, view/table, rename, delete, "Chart this".

## Viz tab layout

- **Field list** (left): relation columns with type chips, search, grouped by type; chips are drag sources and have a
  keyboard action ("Assign to…").
- **Shelves** (centre-top): only channels valid for the chosen mark; required ones marked; each is a drop zone with a
  visible accepted-types hint; refusal shows the reason in an inline live region.
- **Chart** (centre): `BuilderChartHost`, with tile-style legend row, tooltip, crosshair where applicable, expand-to-dialog
  and the standard Export menu (PNG, SVG, CSV, plus Export/Import configuration JSON).
- **Right rail** tabs: *Chart* (type picker with suggestions), *Style* (title/subtitle/source/note: text + size + weight +
  italic), *Axes & scales*, *Filters*, *Reference lines*.
- Chip popover: aggregate, bin/time unit, sort, stack (measure channel), type override (discrete ↔ continuous), remove.
- Toolbar: undo/redo, swap x/y, clear, duplicate tab.

## Chart picker

Each chart type is a button with an icon. States: **viable** (ranked, best first, "Suggested" on the top one),
**not viable** (greyed, tooltip = rule reason, e.g. "Needs 1 category and 1 number"), **coming soon** (disabled, tooltip
"Coming soon"). Choosing a chart first shows its required/optional slots. Changing the mark keeps compatible encodings
and lists any dropped ones in a dismissible notice.

## Re-query vs view-only

Field, aggregate, bin, time unit, filter, relation and row-limit edits re-run the compiled SQL (debounced 250 ms,
previous result stays visible with a "Updating…" overlay). Text, axis title/format, label angle, legend visibility,
reference lines and sizes re-render locally from the last rows without a query.

## States

Empty relation, zero rows, query error, chart error ("Can't draw this combination: <reason>"), loading skeleton using
`PanelLoadingState`, broken My table. All have text, none draw empty axes.

## Accessibility

Every control has an accessible name; drag has the keyboard assign path; shelves announce changes via a polite live
region; the chart region carries an `aria-label` summarising mark, fields and row count; focus is returned to the chip
after assignment; contrast verified in both themes; `prefers-reduced-motion` respected.

## Export/import

- Export menu: **PNG**, **SVG** (via `cardToSvg`/`svgToPng` in `exportTile.ts`, includes text blocks, legend and hatch
  patterns), **CSV** (the charted rows), **Configuration (JSON)**.
- Import: file picker or paste; validated by the schema; errors listed per path; missing scenarios/tables listed with
  Remap/Cancel; nothing is overwritten until confirmed (imports open as a new tab).

# Contract: Settings Modal Fixed Sizing and Vertical Tabs

## `layout/settingsModal.tsx`

- `DialogContent`'s className changes from
  `flex max-h-[85vh] w-[95vw] max-w-[720px] flex-col gap-4` to include a
  fixed target height alongside the existing viewport-relative caps —
  e.g. `flex h-[600px] max-h-[85vh] w-[95vw] max-w-[720px] flex-col gap-4`
  (exact pixel value is an implementation detail; the CONTRACT is: one
  fixed value, present on every render, never computed from which tab is
  active).
- `Tabs` gains `orientation="vertical"` and switches its own container
  from `flex-col` to `flex-row` (content now sits beside the tab list,
  not below it).
- `TabsList` becomes a vertical rail: `flex-col` instead of the default
  horizontal row, a fixed width, full height of its flex parent.
- `TabsContent` KEEPS its existing `overflow-y-auto` class from
  020-settings-modal, now correctly bounded by the fixed-height ancestor
  chain (`DialogContent` → `Tabs` (`flex-1 min-h-0`) → `TabsContent`).
- The four tab triggers' labels and `value`s (`appearance`, `scenarios`,
  `basemap`, `documentation`) are UNCHANGED — this is a layout-only
  change, no tab added, removed, or renamed.
- The Basemap tab's own content now includes a fixed-height live preview
  area (`contracts/basemap-catalog.md`) ABOVE its four sections, still
  inside the same `overflow-y-auto` `TabsContent` box every other tab
  uses — the preview area itself does not scroll (it's a map, not text)
  and does not grow/shrink; the sections below it remain within the
  existing scrollable region (research.md §7).

## `components/ui/tabs.tsx`

- `TabsList`'s className gains a `data-[orientation=vertical]:flex-col`
  (or equivalent) variant alongside its existing horizontal-row classes —
  Radix's `TabsPrimitive.List` sets `data-orientation` automatically based
  on the `Root`'s `orientation` prop, no new prop threading required.
- `TabsTrigger`'s className gains whatever `data-[orientation=vertical]:`
  adjustment the vertical rail needs (e.g. full-width, left-aligned text
  instead of centered) — exact classes are an implementation detail.
- `navBar.tsx` (the dashboard's own horizontal tab strip, unrelated to
  the Settings modal) passes no `orientation` prop and is therefore
  UNAFFECTED — Radix's own default (`"horizontal"`) continues to apply,
  and none of the new `data-[orientation=vertical]:` variants match.

## Behavioral guarantees (verified by `settingsModal.spec.ts`)

- Measuring the Settings modal's rendered `getBoundingClientRect().height`
  and `.width` immediately after opening, then again after switching to
  every other tab, MUST show no change, for all four tabs in any order
  (FR-019, SC-004).
- With the Documentation tab active (the shortest content), the modal's
  measured height MUST equal its measured height with the Basemap tab
  active (now the longest content — the preview area plus the sectioned
  catalog) — proof that the outer dialog never shrinks or grows per tab
  (FR-021).
- The four `TabsTrigger` elements' bounding boxes MUST be arranged in a
  vertical stack (each one's `top` strictly greater than the previous
  one's `bottom`, all sharing a comparable `left`) to the LEFT of the
  active `TabsContent`'s bounding box (FR-020).

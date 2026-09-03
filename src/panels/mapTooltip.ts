// 015-map-controls-polish — ONE shared hover-tooltip implementation both
// map panel types now use (FlowMapPanel.tsx's deck.gl picking hover,
// ZoneMapPanel.tsx's MapLibre mousemove hover), replacing two
// independently-drifting implementations (ZoneMapPanel.tsx's own
// unstyled `new maplibregl.Popup(...)`, FlowMapPanel.tsx having none at
// all). Deliberately NOT a React component: both real call sites fire
// OUTSIDE React's render cycle by design — MapLibre's own layer-scoped
// mousemove/mouseleave events for ZoneMapPanel, deck.gl's own
// FlowmapLayer onHover picking callback for FlowMapPanel (contracts/...)
// — so an imperative, plain-DOM element (same category as this
// codebase's other imperative map-adjacent DOM nodes: ZoneMapPanel.tsx's
// own hidden color-resolution `probe` element) is the natural fit, not a
// React tree this component would have to force a render into on every
// pointer move.
//
// Styled via literal Tailwind utility classes (matching
// PanelErrorState.tsx/PanelEmptyState.tsx's own visual language: border,
// shadow, rounded corners, font-body) — tailwind.config.js's `content`
// glob covers `./src/**/*.{ts,tsx}`, not just `.tsx`, so these classes
// are picked up from this plain `.ts` file's own source text exactly the
// same as if they were written in JSX.
const TOOLTIP_CLASS =
  'pointer-events-none absolute z-10 max-w-[240px] rounded-md border border-border bg-card px-2 py-1.5 text-sm font-body text-card-foreground shadow-md'

// A few pixels off the cursor so the tooltip never sits directly under
// the pointer, obscuring the exact feature being hovered.
const CURSOR_OFFSET_PX = 12

export interface MapTooltip {
  /** x/y — pixel coordinates relative to `container`'s own top-left
   * corner (MapLibre's MapMouseEvent.point and deck.gl's PickingInfo.x/y
   * are both already in this same coordinate space — no translation
   * needed at either call site). */
  show(x: number, y: number, html: string): void
  hide(): void
  /** Detaches the DOM node — call from the SAME effect's cleanup that
   * created it (mount-lifetime, same as the map instance itself). */
  destroy(): void
}

/**
 * Creates one tooltip element, appended once as a child of `container`.
 * `container` must already be a positioned element (`position: relative`
 * or stronger) for the tooltip's own `position: absolute` to anchor
 * correctly — true of the element passed to `new maplibregl.Map({
 * container })` in both panel types: MapLibre itself adds the
 * `maplibregl-map` class (which sets `position: relative`) directly to
 * that element, not a wrapper it creates — confirmed against the
 * installed maplibre-gl source, not assumed.
 */
export function createMapTooltip(container: HTMLElement): MapTooltip {
  const el = document.createElement('div')
  // A stable, semantic class name FIRST, Tailwind's own utility classes
  // second — a Playwright test locates this element by `.map-tooltip`,
  // independent of whatever the Tailwind utility list happens to be
  // (styling is free to change without breaking test selectors).
  el.className = `map-tooltip ${TOOLTIP_CLASS}`
  el.style.display = 'none'
  container.appendChild(el)

  return {
    show(x: number, y: number, html: string) {
      el.innerHTML = html
      el.style.left = `${x + CURSOR_OFFSET_PX}px`
      el.style.top = `${y + CURSOR_OFFSET_PX}px`
      el.style.display = 'block'
    },
    hide() {
      el.style.display = 'none'
    },
    destroy() {
      el.remove()
    },
  }
}

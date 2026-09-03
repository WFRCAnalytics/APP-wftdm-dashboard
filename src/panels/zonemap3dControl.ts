import type { IControl, Map as MapLibreMap } from 'maplibre-gl'

// 015-map-controls-polish — a genuine MapLibre custom control (the same
// IControl interface NavigationControl itself implements: onAdd/
// onRemove), replacing the previous absolutely-positioned React
// <Button> overlay. Rendered via map.addControl(), so it's stacked by
// MapLibre's OWN corner-positioning system alongside NavigationControl
// (both default to the 'top-right' corner) — not an independent overlay
// layered on top by this app's own CSS.
//
// A thin, presentation-only control with no application state of its
// own — same division of labor NavigationControl itself has (it doesn't
// own "the current zoom level," it just calls map.zoomIn()/zoomOut()).
// ZoneMapPanel.tsx's mount effect owns is3dRef/the actual layer-
// visibility and camera-pitch logic; this control only renders a button
// and reports clicks via the constructor callback, then reflects
// whatever state ZoneMapPanel.tsx tells it to via setActive().
//
// Styled with real design-token CSS custom properties (mapControls.css),
// not Tailwind utility classes — MapLibre's own control chrome
// (.maplibregl-ctrl-group's hardcoded #fff background, 29x29 button
// grid, mask-image icon convention) has assumptions Tailwind's utility
// classes don't compose cleanly against; overriding the SAME semantic
// slots (background/border/hover/pressed) with var(--card)/var(--border)/
// var(--muted)/var(--primary) keeps this control visually correct in
// both MapLibre's own layout system and this app's light/dark theme.
export class ThreeDToggleControl implements IControl {
  private container?: HTMLDivElement
  private button?: HTMLButtonElement
  private readonly onToggle: () => void

  constructor(onToggle: () => void) {
    this.onToggle = onToggle
  }

  // The `map` parameter is part of IControl's own required signature
  // (NavigationControl's real onAdd(map) stores it because IT calls
  // map.resetNorthPitch()/etc. — this control never touches the map
  // directly at all, ZoneMapPanel.tsx's own toggle handler does, via its
  // own mapRef), so it's intentionally unused here.
  onAdd(_map: MapLibreMap): HTMLElement {
    this.container = document.createElement('div')
    // maplibregl-ctrl/-ctrl-group — MapLibre's OWN structural classes
    // (corner-stacking, clear:both, the grouped-pill layout), reused
    // rather than reinvented; wftdm-3d-toggle-group is this control's
    // own hook for mapControls.css's token-driven color overrides.
    this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group wftdm-3d-toggle-group'

    this.button = document.createElement('button')
    this.button.type = 'button'
    this.button.className = 'wftdm-3d-toggle-button'
    // '3D' at rest — this design's own research (two independent real
    // precedents: Esri's own official "Switch view from 2D to 3D" sample,
    // developers.arcgis.com/javascript/latest/sample-code/
    // views-switch-2d-3d — button text flips between '2D' and '3D' to
    // name the DESTINATION view, not a static label; and
    // tobinbradley/mapbox-gl-pitch-toggle-control, a real, published
    // Mapbox-GL-style pitch-toggle control's own icon SVGs are literally
    // bold-centered '3D'/'2D' text, no pictogram — confirms setActive()
    // below must flip this text, not just aria-pressed).
    this.button.textContent = '3D'
    this.button.title = 'Toggle 3D extrusion'
    this.button.setAttribute('aria-label', 'Toggle 3D extrusion')
    this.button.setAttribute('aria-pressed', 'false')
    this.button.addEventListener('click', this.onToggle)

    this.container.appendChild(this.button)
    return this.container
  }

  onRemove(): void {
    this.button?.removeEventListener('click', this.onToggle)
    this.container?.remove()
    this.container = undefined
    this.button = undefined
  }

  /** Syncs the button's own pressed visual state AND its label — called
   * by ZoneMapPanel.tsx's toggle handler right after it flips
   * is3dRef.current — the actual is3d/pitch/layer-visibility state lives
   * there, not in this control. The label names the ACTION a click
   * performs (the destination view), not the current one — '3D' while
   * flat (click to go 3D), '2D' once active (click to go back) — per
   * this control's own onAdd() comment, matching the two real
   * precedents researched there. `aria-label`/`title` deliberately stay
   * the fixed, feature-naming "Toggle 3D extrusion" throughout — this
   * project's own Playwright coverage locates the control by that fixed
   * accessible name, and a feature-naming label ("what this button
   * does, generally") reads correctly regardless of the momentary
   * visible text, unlike an action-naming one would need to flip
   * alongside it. */
  setActive(active: boolean): void {
    this.button?.setAttribute('aria-pressed', String(active))
    if (this.button) this.button.textContent = active ? '2D' : '3D'
  }
}

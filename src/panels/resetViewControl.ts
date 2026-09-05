import type { IControl, Map as MapLibreMap } from 'maplibre-gl'

// data-model.md — the concrete camera position a panel is actually
// anchored to at a given moment: either the author's explicit config
// (captured once, at mount) or the RESOLVED center/zoom
// map.cameraForBounds() computed for the auto-fitted bounds (captured
// once, when auto-fit runs — see the "why a resolved camera, not a raw
// BoundsTuple" note at each auto-fit call site: MapLibre's own
// cameraForBounds()/fitBounds() compute their destination from the map's
// CURRENT transform at call time, so re-running fitBounds() against the
// same bounds from a DIFFERENT later camera position can land somewhere
// measurably different — confirmed empirically, not assumed). Storing
// the already-resolved destination once means reset always lands
// EXACTLY back on it via a plain easeTo(), regardless of where the
// viewer has since panned/zoomed/tilted to.  Exactly one write per panel
// instance, at most once (research.md §7) — read by this control's
// onReset callback at click time.
export type EffectiveView = { center: [number, number]; zoom: number }

// 027-map-auto-fit-and-reset — a genuine MapLibre custom control (the same
// IControl interface NavigationControl/ThreeDToggleControl themselves
// implement: onAdd/onRemove), added via map.addControl() into the SAME
// 'top-right' corner cluster those controls already occupy. Shared by
// BOTH map panel types (FlowMapPanel.tsx and ZoneMapPanel.tsx each
// construct their own instance) — unlike zonemap3dControl.ts's
// ThreeDToggleControl (zonemap-only, since only that panel type has a 3D
// mode), matching mapTooltip.ts's own "shared across both map panel
// types" precedent instead.
//
// A thin, presentation-only control with no application state of its own
// — same division of labor NavigationControl/ThreeDToggleControl already
// have (research.md §7): the owning panel's own appliedViewRef/mapRef are
// read by the `onReset` callback's closure at CLICK time, not captured by
// this class, so this control never goes stale regardless of how many
// times the owning panel's effects re-run.
//
// The icon is lucide-react's real, installed `Maximize` icon (this
// project's fixed, established icon set, constitution Principle
// VI/Technology Stack Reference — confirmed directly against the
// installed lucide-react@0.460.0 package's own
// dist/esm/icons/maximize.js, not guessed: its four corner-bracket paths
// are reproduced verbatim below) — the classic GIS "zoom to full extent"
// convention (ArcGIS/QGIS), replacing an earlier hand-drawn home icon
// that read as "go home", not "fit to bounds" (a real, confirmed mismatch
// between the icon's own metaphor and what this control actually does).
// lucide-react's icons are React components, not usable directly inside
// this plain-DOM/innerHTML IControl (matching ThreeDToggleControl's own
// non-React pattern) — its own real, installed `defaultAttributes.js`
// (viewBox 0 0 24 24, fill=none, stroke=currentColor, stroke-linecap/
// -linejoin=round) is reproduced by hand instead of adding lucide's
// separate raw-SVG distribution as a new dependency for four path
// strings. stroke-width kept at 2.5 (not lucide's own default of 2) to
// match this control's own already-established visual weight at this
// 15px render size (the icon this replaces used the same 2.5). Like its
// predecessor, stroke="currentColor" means the icon automatically
// inherits the button's own `color: var(--foreground)` (mapControls.css)
// in both themes — no dark-mode-specific CSS fix needed, unlike
// NavigationControl's own hardcoded-color icons.
const ZOOM_TO_EXTENTS_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`

export class ResetViewControl implements IControl {
  private container?: HTMLDivElement
  private button?: HTMLButtonElement
  private readonly onReset: () => void

  constructor(onReset: () => void) {
    this.onReset = onReset
  }

  // The `map` parameter is part of IControl's own required signature —
  // this control never touches the map directly at all, the owning
  // panel's `onReset` closure does, via its own mapRef — so it's
  // intentionally unused here, same as ThreeDToggleControl's own onAdd().
  onAdd(_map: MapLibreMap): HTMLElement {
    this.container = document.createElement('div')
    this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group wftdm-reset-view-group'

    this.button = document.createElement('button')
    this.button.type = 'button'
    this.button.className = 'wftdm-reset-view-button'
    this.button.innerHTML = ZOOM_TO_EXTENTS_ICON_SVG
    this.button.title = 'Zoom to extents'
    this.button.setAttribute('aria-label', 'Zoom to extents')
    // Starts disabled — spec.md FR-009: no effective view (author-config
    // or auto-fit) has been established yet at construction time. The
    // owning panel calls setEnabled(true) the moment one is.
    this.button.disabled = true
    this.button.addEventListener('click', this.onReset)

    this.container.appendChild(this.button)
    return this.container
  }

  onRemove(): void {
    this.button?.removeEventListener('click', this.onReset)
    this.container?.remove()
    this.container = undefined
    this.button = undefined
  }

  /** Toggles the button's own disabled state — called by the owning panel
   * the moment its appliedViewRef is first populated (mount-effect's
   * synchronous author-config branch, or the data-update effect's
   * auto-fit branch). */
  setEnabled(enabled: boolean): void {
    if (this.button) this.button.disabled = !enabled
  }
}

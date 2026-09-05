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
// The icon is the real, verbatim stroke="currentColor" home SVG confirmed
// directly in WFRCAnalytics/APP-WFRC-Commute-Patterns's own shipped
// src/map.js (constitution Principle VIII mandate tier — research.md §2),
// not redrawn. stroke="currentColor" means the icon automatically
// inherits the button's own `color: var(--foreground)` (mapControls.css)
// in both themes — no dark-mode-specific CSS fix needed, unlike
// NavigationControl's own hardcoded-color icons.
const HOME_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`

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
    this.button.innerHTML = HOME_ICON_SVG
    this.button.title = 'Reset view'
    this.button.setAttribute('aria-label', 'Reset view')
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

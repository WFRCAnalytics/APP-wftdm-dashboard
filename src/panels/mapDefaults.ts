// 042-boot-performance-fix: DEFAULT_CENTER/DEFAULT_ZOOM used to be defined
// only inside FlowMapPanel.tsx, imported directly from there by
// layout/settings/basemapTab.tsx's own preview-map effect. Since
// basemapTab.tsx is reachable unconditionally from Shell (shell.tsx ->
// SettingsModal -> BasemapTab, always mounted in the sidebar footer, never
// lazy), that import transitively pulled FlowMapPanel.tsx's own heavy
// dependencies (maplibre-gl, @deck.gl/*, @flowmap.gl/layers — the `maps`
// chunk) into the app's main entry graph regardless of
// panels/registry.tsx's own React.lazy() conversion (same 042 fix, see
// that file's header comment) — a real, second leak of the same class the
// 042 investigation flagged, found while implementing the registry fix
// (a direct grep for every static import of a registry.tsx panel
// component from outside registry.tsx itself), not by the investigation.
//
// Moved here, a dependency-free module with no imports of its own, so
// basemapTab.tsx no longer needs to import FlowMapPanel.tsx at all for
// these two plain literals. FlowMapPanel.tsx re-exports both from this
// module, preserving its own existing public surface (`export const
// DEFAULT_CENTER`/`DEFAULT_ZOOM` from FlowMapPanel.tsx, referenced in
// tests/integration/flowmapPanel.spec.ts's and settingsModal.spec.ts's
// own comments) for any other future caller that reaches it through the
// panel component itself.
export const DEFAULT_CENTER: [number, number] = [-111.89, 40.76]
export const DEFAULT_ZOOM = 9

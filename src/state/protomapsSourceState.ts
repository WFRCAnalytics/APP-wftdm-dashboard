// 041-protomaps-pmtiles-basemap, revised: the deployer-only Protomaps
// source configuration. Originally a two-tier viewer-override/deployer-
// default store (mirroring state/basemapState.ts's shape) — the viewer
// override was removed in a later revision: only a deployer can configure
// a Protomaps source now, never a viewer typing/validating their own URL
// in the Basemap tab. That removal also removes the only reason this
// module ever needed to be reactive (setViewerPmtilesOverride()/
// clearViewerPmtilesOverride() were the only notify() callers) — the
// remaining value is set exactly ONCE, at boot, from main.tsx, before any
// component that reads it has mounted (mirrors panels/scenarioDisplay.ts's
// setDeployerScenarioPalette() shape), so this is now a plain module-level
// value with no subscribe/notify plumbing at all.

/** Either form a deployer can configure (services/yamlLoader.ts's
 * DashboardBranding) — checked in that precedence order by main.tsx
 * (an API key needs no region/bbox prep and works for any zone geometry,
 * so it's preferred when both happen to be set). */
export type ProtomapsSource =
  | { kind: 'pmtiles'; url: string }
  | { kind: 'hosted-api'; apiKey: string }

let deployerSource: ProtomapsSource | undefined

/** Called once, at boot, from main.tsx — never called again after boot. */
export function setDeployerProtomapsSource(source: ProtomapsSource | undefined): void {
  deployerSource = source
}

/** The effective Protomaps source, or undefined ("not configured", FR-010
 * — the Basemap tab's 5 flavor tiles stay disabled). */
export function getEffectiveProtomapsSource(): ProtomapsSource | undefined {
  return deployerSource
}

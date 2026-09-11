# Contract: Deployer PMTiles source configuration

Governs `services/yamlLoader.ts`'s `DashboardIndexJson`/`DashboardBranding`/`loadDashboardBranding()`. Enforces FR-004, FR-005, FR-013.

## `dashboard-config/index.json` — new field

```json
{
  "dashboards": ["dashboard-1-summary.yaml", "..."],
  "title": "WFRC TDM Calibration Dashboard",
  "logoUrl": "...",
  "logoUrlDark": "...",
  "scenarioPalette": ["#4e79a7", "..."],
  "protomapsPmtilesUrl": "basemap/wasatch-front.pmtiles"
}
```

`protomapsPmtilesUrl` is OPTIONAL, added alongside the existing optional `title`/`logoUrl`/`logoUrlDark`/`scenarioPalette` fields — same object, no new file (Constitution Principle VII; matches CLAUDE.md's own `028-dashboard-branding`/`036-scenario-color-picker` precedent for this exact shape).

## `DashboardBranding` interface — after

```ts
export interface DashboardBranding {
  title?: string
  logoUrl?: string
  logoUrlDark?: string
  scenarioPalette?: string[]
  /** 041-protomaps-pmtiles-basemap: the deployer-level default PMTiles
   * source shared by all 5 Protomaps flavors. Either a path relative to
   * this app's own deployed assets (resolved against
   * import.meta.env.BASE_URL) or a full https:// URL — both forms behave
   * identically (FR-004). Absent -> no deployer default; the Protomaps
   * section is "not configured" unless a viewer sets a session override
   * (FR-010). MUST NOT default to any Protomaps-hosted demo/build/API
   * URL (FR-005) — this field is simply left undefined when a deployer
   * hasn't prepared their own extract; there is no fallback URL here to
   * omit. */
  protomapsPmtilesUrl?: string
}
```

## `loadDashboardBranding()` — parsing rule

Same fail-soft convention as every existing field on this interface:

```ts
protomapsPmtilesUrl:
  typeof parsed.protomapsPmtilesUrl === 'string' && parsed.protomapsPmtilesUrl.length > 0
    ? parsed.protomapsPmtilesUrl
    : undefined,
```

A non-string or empty-string value parses to `undefined` (same as `title`), never throws, never partially applies.

## MUST NOT

- `public/demo-dashboard-config/index.json` (this app's own real, git-tracked demo deployment) MUST NOT set `protomapsPmtilesUrl` to any real Protomaps-hosted URL (demo bucket, daily build, `api.protomaps.com`) — the demo ships with Protomaps genuinely unconfigured (research.md R-7), exercising the real FR-010 "not configured" path honestly.
- No literal Protomaps-hosted URL string of any kind (demo bucket, daily build host, `api.protomaps.com`) may appear anywhere in `src/` as a default/fallback value.

## Verification

```
grep -rniE "protomaps\.com/.*(daily|build)|api\.protomaps\.com|demo.*protomaps|protomaps.*demo" src/
  # -> no matches (no hardcoded Protomaps-hosted data/API URL as a default)
grep -n "protomapsPmtilesUrl" public/demo-dashboard-config/index.json
  # -> no match (demo ships unconfigured)
```

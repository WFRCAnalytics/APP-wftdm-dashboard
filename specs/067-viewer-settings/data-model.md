# Data model: Viewer-facing settings

## Settings (schema rows)

| Path | Where it is set | Type | Default | Cascades | Notes |
|---|---|---|---|---|---|
| `docs.url` | site file | url | unset | no | `http`/`https` only, no whitespace; unset means no icon |
| `docs.label` | site file | string | `Documentation` | no | text only; the icon's accessible name and tooltip |
| `settings.tabs` | site file | list of string | unset (all five) | no | cleaned by `clean`: unknown, repeated and empty-after-cleaning reported |
| `header.docs` | a page's `header:` | string | unset | no (`scope: 'page'`) | a relative path; appended to `docs.url`; may carry `#fragment` or `?query` |
| `header.hidden` | a page's `header:` | boolean | `false` | no (`scope: 'page'`) | not listed in the sidebar; still reachable |

## Extensions to `SettingDef`

```ts
scope?: 'page'                                           // set in a page's header:, not in the site file; never cascades
clean?: (value: unknown) => { value: unknown; messages: string[] }   // usable part of a value plus a message for each thing dropped
```

## Derived structures (pure, `src/config`)

### `SETTINGS_TAB_NAMES`

`['appearance', 'scenarios', 'basemap', 'assistant', 'documentation']`, the order of today's Settings window.

### `resolveSettingsTabs(list, { assistantEnabled })`

Input: the validated list (or undefined), the assistant switch. Output: an ordered list of config names to show.

- unset → all five names; then the assistant entry is dropped when `assistantEnabled` is false
- set → the list as given (already cleaned); the assistant entry dropped when disabled
- never returns an empty list: when the result would be empty (for example only `assistant`, switched off) it returns the default list

### `docsHref(url, path)`

Returns the destination string, or `undefined` when there is no usable address. `path` undefined, empty or refused → `url` unchanged. See research 4.

### `listedPages(headers)` and `landingIndex(headers)`

`headers` is the ordered list of `{ hidden?: boolean }`.

- `listedPages` → indices to show. Normally every non-hidden index; if all are hidden: every index (research 7).
- `landingIndex` → the first listed index (0 when the list is empty).
- `allHidden(headers)` → true when there is more than one page and all are hidden (the case reported).

## Settings state (module state, no Web Storage)

`state/settingsState.ts` gains `configureSettingsTabs(ids: SettingsTab[])`, set once at boot from the resolved list (converted `assistant` → `ai`). `getSettingsUi().tab` starts as the first listed tab; `openSettings(tab)` and `setSettingsTab(tab)` fall back to the first listed tab when `tab` is not shown.

## Branding additions (`DashboardBranding`)

`docsUrl?: string`, `docsLabel?: string`, `settingsTabs?: string[]` (config names, validated). `toBranding` maps `docs.url`, `docs.label`, `settings.tabs`.

## Page header additions (`DashboardTabConfig['header']`)

`hidden?: boolean`, `docs?: string`, both parsed fail-soft in `parseDashboardConfig` (a non-boolean or non-string value is left unset; the validator reports it).

## Problem catalogue

| Where | Kind | Path | Message (gist) |
|---|---|---|---|
| site | invalid_value | `docs.url` | not an `http` or `https` address |
| site | wrong_type | `docs.label` | expected text |
| site | invalid_value | `settings.tabs` | unknown tab "x" (one per name); repeated tab "x"; no usable tab, so all tabs are shown |
| site | not_allowed_here | `header.docs`, `header.hidden` | belongs in a page's header, not the site file |
| page | invalid_value | `header.docs` | must be a relative path (no address) |
| page | wrong_type | `header.hidden` | expected true or false |
| load, `check` | invalid_value | `header.docs` | set but the site has no `docs.url`; ignored |
| load, `check` | invalid_value | `pages` | every page is hidden; all are shown |

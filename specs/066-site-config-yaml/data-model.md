# Data Model: Site configuration

Types are described in plain terms; the code lives in `src/config/`.

## SettingDef (one row of the schema table)

| Field | Meaning |
|---|---|
| `path` | Dotted leaf path, for example `colors.primary` |
| `type` | `string`, `number`, `integer`, `boolean`, `color`, `url`, `enum`, `list`, `map` |
| `default` | Value used when unset; `undefined` means "no value" and keeps today's behaviour |
| `cascade` | `false` (site-only), or `{ merge: 'replace' }` / `{ merge: 'concat' }` for lists; scalars and maps use the fixed rules |
| `description` | One sentence, shown in the generated reference and in problem messages |
| `values` | Allowed values for an `enum` |
| `check` | Optional function for a structured value; returns a message or nothing |

Rules: paths are unique; a `cascade` entry never has `type: 'url'` secrets (no key holds a token, a hosted map key is the one domain-restricted exception); every path appears in the generated reference.

## SiteConfigFile (the authored YAML, all keys optional)

`version`, `pages[]`, `title`, `logo{light,dark}`, `mark{light,dark}`, `colors{primary,secondary,accent,brand}`, `scenario_palette[]`, `vocab{modes,purposes,incomes,autos,districts}`, `metrics{}`, `units{trips{divisor,suffix},transit_share_max}`, `years{list[],base,default}`, `compare{default,scenarios[],focus,reference}`, `layout{mode}`, `export{footer}`, `assistant{enabled}`, `basemap{default?, protomaps{pmtiles_url, api_key}}`. See [contracts/dashboard-config.md](contracts/dashboard-config.md).

## Level and ResolvedSettings

- **Level**: `'site' | 'page' | 'panel'` (an optional fourth, for `panel_defaults`, is left open).
- **ResolvedSettings**: the effective tree plus `source[path]` giving the Level that supplied each leaf.
- Transition: none; resolution is a pure function of its inputs.

## ConfigProblem

| Field | Meaning |
|---|---|
| `file` | The file the problem is in (`dashboard-config.yaml`, a page file) |
| `path` | Key path, for example `years.base`; empty for a whole-file problem |
| `message` | Plain sentence: unknown key, expected a number, not allowed here, file missing, and so on |
| `line` | 1-based, only for YAML syntax errors |
| `kind` | `unknown_key`, `wrong_type`, `invalid_value`, `not_allowed_here`, `duplicate`, `missing_file`, `syntax`, `moved` |

## Mapping to the app

`toBranding(settings)` returns today's `DashboardBranding`: `logo.light` → `logoUrl`, `logo.dark` → `logoUrlDark`, `mark.*` → `markUrl`/`markUrlDark`, `colors.*` → `primaryColor`…`brandColor`, `years.{list,base,default}` → `years`/`baseYear`/`defaultYear`, `compare.*` → `compareDefault`/`compareScenarios`/`compareFocus`/`compareReference`, `export.footer` → `exportFooter`, `assistant.enabled` → `assistantEnabled`, `basemap.protomaps.*` → `protomapsPmtilesUrl`/`protomapsApiKey`, and the rest by name.

## Relationships

SiteConfigFile 1 — n SettingDef (every authored key must match a row); Page 0..1 overrides cascading rows; Panel 0..1 overrides cascading rows; resolution of (SiteConfigFile, Page?, Panel?) yields one ResolvedSettings; validation of any of the three yields ConfigProblems.

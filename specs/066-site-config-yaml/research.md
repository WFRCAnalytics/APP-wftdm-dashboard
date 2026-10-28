# Research: Site configuration in dashboard-config.yaml

No `NEEDS CLARIFICATION` remained; these are the design decisions the code reading forced.

## 1. Keep `DashboardBranding` as the consumer shape

- **Decision**: The schema produces a settings tree; `toBranding.ts` maps it to the existing `DashboardBranding` object. `main.tsx` and every `configure*()` call keep reading that.
- **Rationale**: `DashboardBranding` has about 25 fields read by `main.tsx`, `runResolution`, `bootCompareState`, the export/layout/assistant states and the settings tabs. Replacing it would turn a config move into a refactor of the whole boot path.
- **Alternatives**: Rename it to `SiteSettings` and thread the new tree through (cleaner, but large and unrelated to the goal; can follow later).

## 2. Where the schema lives and who may import it

- **Decision**: `src/config/` with relative imports only, no `import.meta.env`, no `@/` alias, no DOM.
- **Rationale**: `scripts/viteBootSkeletonPlugin.ts` runs in Node at build time and today has a second, hand-written parser of the same keys. Importing the pure modules removes it (spec US4.3).
- **Alternatives**: Generate a JSON copy of the table for the plugin (a build step to keep in sync, the very thing being removed).

## 3. Row shape of the schema table

- **Decision**: One row per leaf path (for example `colors.primary`, `years.base`, `layout.mode`) with: `path`, `type` (`string`, `number`, `integer`, `boolean`, `color`, `url`, `enum`, `list`, `map`), `default`, `cascade` (`false`, or `{ merge: 'replace' | 'concat' }` for lists), `description`, and optional `values` (enums) and `check` (a function returning a message for structured values such as `vocab`, `metrics`, `years.list`).
- **Rationale**: Leaf rows give per-key typing and messages with real key paths. Structured values (vocab entries, metric overrides) already have shape code in `charts/vocab.ts` and `charts/lib/metrics.ts`; `check` hooks them in rather than re-describing them.
- **Alternatives**: A JSON Schema document (later, section 5 of CONFIGURATION.md; it can be generated from this table); a TypeScript type only (no runtime check, no docs).

## 4. Keys and shapes that change from `index.json`

- **Decision**: `years` becomes `{ list, base, default }` (it was a list beside flat `baseYear` and `defaultYear`). `logo` and `mark` become `{ light, dark }`; `colors` becomes `{ primary, secondary, accent, brand }`; the Protomaps keys become `basemap.protomaps.{pmtiles_url, api_key}`. `compare` and `layout`, `export`, `assistant` keep their inner names, snake_cased where needed.
- **Rationale**: Matches the draft in CONFIGURATION.md section 4 and the decided naming (snake_case, nested light/dark).
- **Note**: FR-012's key list in the spec names the old flat keys; `baseYear` and `defaultYear` fold into `years` and are listed there too.

## 5. The cascade and the existing page and panel keys

- **Decision**: The resolver takes plain objects per level. Existing page and panel keys are adapted into schema paths by a small table inside the resolver call site, with no new YAML syntax: a page's `header.layout_mode` → `layout.mode`, a tab's or panel's `default_basemap` → `basemap.default`, a panel's Explore keys → `explore.*`. Only these cascade: `layout.mode`, `basemap.default`, `export.footer`, `explore.limits`, `explore.features`, `explore.charts`, `explore.tables`, `explore.columns`, `explore.presets`.
- **Rationale**: Those are the keys CONFIGURATION.md already marks cascading and the ones that cascade by hand today. Everything else is site-only, so a page or panel that sets one is reported by `validate.ts`.
- **Merge rules** (spec FR-006): scalars replace; maps merge per key; `list` with `merge: 'replace'` (for example `explore.charts.allow`, `explore.tables.include`) replaces; `merge: 'concat'` (for example `explore.tables.exclude`, `explore.presets`) concatenates, higher level first; `false` and `[]` switch off; `null` is not special. The result carries `source: 'site' | 'page' | 'panel'` per leaf.
- **Out of scope**: `panel_defaults`; the resolver accepts an optional extra level so it can be added without changing callers.

## 6. Two roots and precedence

- **Decision**: Keep today's behaviour for now: the deployment root's `dashboard-config.yaml` wins per key over the demo root's, merged with the same rules (the demo is a base layer). This stays until the demo build flag (CONFIGURATION.md Phase A1, profiles) is decided.
- **Rationale**: Removing the demo fallback is a separate, already scoped step; mixing it in would change what an unconfigured build shows.

## 7. Reporting problems

- **Decision**: `validate.ts` returns `problems: { file, path, message, line? }[]`. The loader pushes them into `state/configProblems.ts` and `console.warn`s each; `layout/configNotice.tsx`, mounted once in the shell, shows one dismissible note with the list when it is non-empty. The Explore options' existing report wording ("a wrong value is reported and the default stays") is reused so the two read alike. Line numbers are given only for YAML syntax errors (`js-yaml` reports a mark); unknown keys carry a path only.
- **Rationale**: `js-yaml` discards positions for successfully parsed nodes, and adding a position-keeping parse is not worth it for a first version (spec says "where the parser gives one").
- **Missing file**: if `dashboard-config.yaml` is absent in the deployment root, the loader probes `index.json` once: if it carries the old keys the note says they moved, otherwise it says no site configuration was found. The probe only runs on that failure path.

## 8. Docs that cannot drift

- **Decision**: `scripts/gen-config-reference.ts` renders the table to `project-docs/CONFIG-REFERENCE.md` (`npm run docs:config`); a unit test regenerates it in memory and fails when the committed file differs.
- **Rationale**: Meets SC-007 with no extra tooling. The same table can later emit a JSON Schema for editors.

## 9. Test migration

- **Decision**: A helper `tests/integration/_siteConfig.ts#routeSiteConfig(page, patch)` fetches the real `dashboard-config.yaml`, parses it in Node, applies the patch and fulfils the request; `_testTab.ts` appends the Test tab to `pages` the same way. Each of the ~30 specs that faked `index.json` switches to it mechanically.
- **Rationale**: One place knows the file name and format, instead of 30 inline JSON objects.

## 10. Legacy `index.json`

- **Decision**: `public/dashboard-config/index.json` (and the demo, synthetic and legacy copies) is deleted; its page list and settings move into the YAML. `scenarios/index.json` and `observed/summary/index.json` are untouched.
- **Rationale**: Nothing else in `dashboard-config/index.json` needs to stay; keeping the file only for a deprecation note is what "no backward compatibility" excludes.

# Feature Specification: Site configuration in dashboard-config.yaml

**Feature Branch**: `066-site-config-yaml`

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: "Phase B core of project-docs/CONFIGURATION.md: site settings move from public/dashboard-config/index.json to a new dashboard-config.yaml, defined once in a table-driven schema, resolved by one pure site, page, panel cascade, with unknown keys and wrong values reported and the old index.json settings removed."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A deployer configures the whole site in one YAML file (Priority: P1)

A deployer (the person publishing the dashboard for their agency) writes one `dashboard-config.yaml` next to their page files. It lists the pages in order and sets the site's title, logos, colours, scenario palette, vocabularies, metric labels and units, years, compare defaults, layout mode, export footer, assistant on/off and Protomaps settings. They no longer touch a JSON file with undocumented keys.

**Why this priority**: This is the feature. Everything else (cascade, reporting, schema) serves a deployer who can describe a site in one readable file.

**Independent Test**: Replace the demo's site settings with a `dashboard-config.yaml` that sets every supported key, load the app, and confirm the title, logos, colours, pages and vocabularies match the file; with the file removed the app shows neutral defaults.

**Acceptance Scenarios**:

1. **Given** a `dashboard-config.yaml` listing three pages and a title, **When** the app loads, **Then** it shows exactly those pages in that order, with the first as the landing page, and that title.
2. **Given** a config that sets only `title`, **When** the app loads, **Then** every other setting has today's default and the app looks as an unconfigured deployment does.
3. **Given** a config that sets `colors`, `logo`, `mark` and `scenario_palette`, **When** the app loads, **Then** light and dark variants, the three data colours, the interface colour and the scenario colours follow the file.
4. **Given** a deployment with no `dashboard-config.yaml`, **When** the app loads, **Then** it shows a clear note that no site configuration was found, rather than a blank or broken page.

---

### User Story 2 - A mistake in the config is reported, never fatal (Priority: P1)

A deployer misspells a key, gives text where a number is expected, or sets a site-only setting on a page. The dashboard still loads, the affected setting keeps its default, and the problem is listed in a visible note (naming the file and the key path) and in the browser console.

**Why this priority**: Principle 4 of the configuration plan ("wrong values are reported, never fatal"). A config feature that breaks the site on a typo is worse than none.

**Independent Test**: Load a config with an unknown key, a wrong-typed value and a site-only key on a page; confirm the page renders, each setting is at its default, and exactly those three problems are listed with their key paths.

**Acceptance Scenarios**:

1. **Given** an unknown key `titel:`, **When** the app loads, **Then** the note lists it by path and the app still loads.
2. **Given** `years.base: "two thousand"`, **When** the app loads, **Then** the note says a number was expected, and the base year keeps its default.
3. **Given** a page that sets a site-only key (for example `title`), **When** the app loads, **Then** the note says "not allowed here" and the site value is used.
4. **Given** a config with no problems, **When** the app loads, **Then** no note is shown.
5. **Given** invalid YAML syntax, **When** the app loads, **Then** the note names the file and, where the parser gives one, the line, and the site runs on defaults.

---

### User Story 3 - A setting can be overridden lower down, by clear rules (Priority: P2)

A deployer sets the layout mode or export footer for the whole site, then overrides it for one page, and (where a panel supports it) for one panel. The most specific level wins, and the merge rules are the same for every setting.

**Why this priority**: The cascade is the agreed design, but today only a few settings need it, so the value is in having one mechanism ready.

**Independent Test**: Set `layout.mode` at site and page level and a list-valued setting at both levels; confirm the page wins for scalars, maps merge key by key, selection lists are replaced and accumulating lists are concatenated.

**Acceptance Scenarios**:

1. **Given** a site layout of `tabs` and a page layout of `scroll`, **When** that page is shown, **Then** it scrolls and other pages use tabs.
2. **Given** a site map `{a: 1, b: 2}` and a page map `{b: 3}`, **When** resolved for the page, **Then** the result is `{a: 1, b: 3}`.
3. **Given** a selection list set at both levels, **When** resolved, **Then** the lower level's list replaces the higher one; **Given** an accumulating list at both levels, **Then** they are joined, higher level first.
4. **Given** a lower level sets `false` or `[]` for something the site turned on, **When** resolved, **Then** it is switched off for that level (there is no `null` reset).
5. **Given** a resolved setting, **When** a maintainer asks where it came from, **Then** the resolver can say which level supplied each value.

---

### User Story 4 - A maintainer adds a setting by editing one place (Priority: P2)

A maintainer adding a new deployer setting declares it once, with its name, type, default, whether it cascades and a description. The loader, the cascade, the validation messages, the pre-boot skeleton and the reference documentation all pick it up from that one declaration.

**Why this priority**: Today a new key needs edits in four places plus a second parser; this is the maintenance cost the feature removes.

**Independent Test**: Add one test-only key to the declaration; confirm it loads, validates, cascades as declared and appears in the generated reference, with no other source file edited.

**Acceptance Scenarios**:

1. **Given** a new key declared in the schema table, **When** a config sets it, **Then** it is loaded, type-checked and available to consumers with no other code change in the loading path.
2. **Given** the schema table, **When** the reference documentation is generated, **Then** it lists every key with its type, default, cascade rule and description.
3. **Given** the pre-boot skeleton, **When** it needs the title or the page count, **Then** it reads them through the same schema, not a second parser.

---

### User Story 5 - The old index.json settings are gone (Priority: P3)

The site-setting keys in `public/dashboard-config/index.json` (and the demo and test copies) are removed. Only the generated listing of scenarios stays as `scenarios/index.json`. The demo, the synthetic demo and the test fixtures each get a `dashboard-config.yaml` with the same settings they had before.

**Why this priority**: Required to finish the move, but it is mechanical once the loader exists. There is no migration because the project has a single user.

**Independent Test**: Search the source for the old keys (`dashboards`, `logoUrl`, `markUrl`, `scenarioPalette`, `protomapsApiKey`, and so on); none is read. Run the demo and confirm it looks and behaves as before.

**Acceptance Scenarios**:

1. **Given** the demo, **When** it loads from its new `dashboard-config.yaml`, **Then** its title, logos, pages, vocabularies, metric labels, units, years, compare defaults and layout are the same as before this change.
2. **Given** an old-style `index.json` carrying site settings, **When** the app loads, **Then** those settings are ignored and the note says site settings now live in `dashboard-config.yaml`.
3. **Given** the scenario listing, **When** the app loads, **Then** scenarios are discovered exactly as before.

---

### Edge Cases

- `dashboard-config.yaml` is empty, or contains only `version`: the site runs on defaults with no note.
- `pages:` is missing or empty: the note says there are no pages, and nothing else is hidden.
- A listed page file does not exist or fails to parse: that page is reported and skipped, the others load.
- `version` is missing: treated as the current version. `version` is higher than the app supports: reported, and the file is still read as far as it can be.
- The same key appears twice, or YAML anchors/merge keys are used: the standard parser's behaviour applies and nothing crashes.
- A site-only key at page or panel level, or a cascading key at an unsupported level: reported as "not allowed here", the allowed level's value wins.
- A colour or URL that is syntactically invalid: reported, and the default is used.
- Very large vocabularies or metric maps: no limit beyond what the file system gives.
- Keys written in the old camelCase form (`logoUrl`): treated as unknown keys and reported.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST load site settings from a `dashboard-config.yaml` placed beside the page files, at startup, in the browser, with no rebuild.
- **FR-002**: The file MUST support these keys, all optional, all `snake_case`: `version`, `pages` (ordered list of page files, the first is the landing page), `title`, `logo` and `mark` (each `{light, dark}`), `colors` (`primary`, `secondary`, `accent`, `brand`), `scenario_palette`, `vocab`, `metrics`, `units`, `years`, `compare`, `layout`, `export`, `assistant` (`enabled`), and the Protomaps settings (a PMTiles URL, or a hosted-API key restricted to the site's domain).
- **FR-003**: Every supported key MUST be declared once, in one table giving its name, type, default, whether it may be overridden at page or panel level, and a description. The loader, the cascade resolver, the validation messages, the pre-boot skeleton and the generated reference MUST all read that table.
- **FR-004**: An unset key MUST leave behaviour exactly as it is today, and adding a key MUST NOT change an existing deployment.
- **FR-005**: One pure function MUST resolve effective settings for a given page and panel from the site, page and panel levels, and return both the values and the level each came from. It MUST have no dependency on the browser.
- **FR-006**: The cascade MUST apply these rules: the most specific level wins; scalars replace; maps merge key by key; selection lists replace; accumulating lists concatenate with the higher level first; there is no `null` reset, and `false` or `[]` switches a setting off.
- **FR-007**: Only keys marked as cascading in the table MAY be set below the site level. A site-only key set on a page or panel MUST be reported as not allowed there and ignored.
- **FR-008**: A page's identity keys (`header:`, including its tab name, title, icon and `slug`) MUST stay in the page file and MUST NOT cascade.
- **FR-009**: An unknown key, a value of the wrong type, an invalid colour or URL, a duplicate page slug, a missing page file and invalid YAML MUST each be reported with the file and key path (and the line where the parser provides it). The affected setting MUST keep its default and the app MUST keep loading.
- **FR-010**: Problems MUST appear both in a visible note for the deployer (one note, listing all problems) and in the browser console. With no problems, no note MUST be shown.
- **FR-011**: A missing `dashboard-config.yaml` MUST produce a visible note saying so; the app MUST still load with neutral defaults.
- **FR-012**: The site-setting keys in `index.json` (`dashboards`, `title`, `logoUrl`, `logoUrlDark`, `markUrl`, `markUrlDark`, `scenarioPalette`, `primaryColor`, `secondaryColor`, `accentColor`, `brandColor`, `protomapsPmtilesUrl`, `protomapsApiKey`, `vocab`, `metrics`, `units`, `years`, `compare`, `layout`, `export`, `assistant`) MUST no longer be read. Their values MUST move to `dashboard-config.yaml` with no compatibility layer. A site still carrying them MUST see a note that they have moved.
- **FR-013**: The generated scenario listing (`scenarios/index.json`) MUST stay and work as before.
- **FR-014**: The real demo, the synthetic demo and the legacy test fixtures MUST each have a `dashboard-config.yaml` carrying the settings they had in `index.json`, so each renders as before.
- **FR-015**: The reference documentation (`project-docs/GRAMMAR.md` or `CONFIGURATION.md`) MUST describe every key, and `CLAUDE.md` MUST be updated to name the new file and drop the old description of `index.json`.
- **FR-016**: Secrets MUST NOT be a config concept: no key holds a token. A map key is allowed only as the domain-restricted hosted key described in `CONFIGURATION.md` section 7.
- **FR-017**: The following MUST remain untouched by this feature: the list of scenarios and `dashboard-manifest.yaml`, `panel_defaults`, the `network` block, assistant providers and prompts, `settings.tabs`, the brand.yml reader, the docs link, the chart data adapters, the `check` command and the published JSON Schema.

### Key Entities

- **Site configuration**: the deployer's one authored file for site-wide settings; has a version, an ordered page list and the settings above.
- **Setting definition**: one row of the schema table: name (with its path), type, default, cascade rule (site-only, or cascading with a list-merge rule), and description.
- **Page**: a `dashboard-*.yaml` file listed in `pages`; carries its own identity (`header:`) and may override cascading settings.
- **Panel**: one tile on a page; may override the cascading settings its type supports.
- **Resolved setting**: the effective value for a page and panel together with the level that supplied it.
- **Config problem**: a reported issue with its file, key path, line when known, and message.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A deployer can describe a complete site (all keys in FR-002) in one file of under 100 lines and see it applied on the next page load with no rebuild.
- **SC-002**: The demo, the synthetic demo and every existing automated test that depends on site settings pass with their settings read from the new file, with no visual or behavioural difference.
- **SC-003**: For 100% of the failure cases listed in FR-009, the dashboard still loads, the affected setting keeps its default, and the problem is reported with its key path.
- **SC-004**: Adding a new setting needs a change in one place only (the schema table) plus the code that uses the value; no loader, validation, skeleton or documentation file is edited.
- **SC-005**: The cascade rules in FR-006 are covered by automated tests that run without a browser, one per rule.
- **SC-006**: No source file reads any of the old `index.json` site-setting keys.
- **SC-007**: The reference documentation lists every supported key, and an automated check fails if a key in the table is missing from it.

## Assumptions

- The project has a single user, so no backward compatibility is kept (decided in `CONFIGURATION.md` section 7); old keys are dropped, not migrated.
- Key names are `snake_case` with nested `logo`/`mark`/`colors`, as decided in section 7.
- `dashboard-config.yaml` lives at `public/dashboard-config/dashboard-config.yaml` (and the equivalent folder of each demo set), authored beside the pages; the build does not read it.
- The set of cascading keys is small at first: layout mode, default basemap, export, and the Explore options that already exist. The table records which, and other keys are site-only.
- `panel_defaults` is not built here, so the panel level only carries a panel's own existing keys; the resolver is written so that a later `panel_defaults` level can be added.
- The pre-boot skeleton keeps its build-time reading of the page files, but it reads the title and page list through the shared schema rather than its own parser.
- Settings the viewer controls (theme, font, text size, layout choice in Settings) stay above the cascade and are unchanged.
- Dependencies: the YAML parser already used for page files; the existing visible-note mechanism used for Explore option problems is reused for config problems.

# Feature Specification: Control the outside calls (the `network` block)

**Feature Branch**: `071-network-block`

**Created**: 2026-10-29

**Status**: Draft

**Input**: User description: "Phase D step 10 of project-docs/CONFIGURATION.md: the `network` block of dashboard-config.yaml, built on the site configuration from 066 to 070 and the design proposal in CONFIGURATION.md section 7, with its recommended answers: fonts bundled or any, a basemap allow-list, one DuckDB extension mirror, and no separate offline switch."

## What the app reaches today

An agency behind a firewall, or one that must not send a viewer's browser to outside hosts, cannot tell what the dashboard calls and cannot switch it off. The audit found three kinds of outside call that a deployer should control (the assistant's providers are already controlled by the 068 `assistant.providers` setting):

- **Fonts.** The default font is bundled. The Appearance tab offers three more cards (Geist and IBM Plex Sans load from Google Fonts, and System UI loads nothing), a free-text custom font, and a shortlist of Google fonts; two of the cards also load a preview font from Google as soon as the tab opens.
- **Basemaps.** The map background is a catalogue (CARTO, OpenFreeMap, the Utah vector tiles, Protomaps, and a curated dropdown of raster providers on dozens of hosts). The **default** basemap is OpenFreeMap's "positron" style, an outside host, so even an untouched deployment's maps call out. (The earlier design note that said the default is blank was wrong.)
- **Database extensions.** The first map or zone-map view downloads the spatial extension from DuckDB's own host, and the first use of the parquet reader needs a download too; there is no offline mode.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A deployer limits the basemaps a map can reach (Priority: P1)

A deployer must keep the dashboard inside the agency network. They list the basemaps that are allowed (for example their own tile files and nothing else) in `dashboard-config.yaml`. The Basemap tab shows only those, the maps start on an allowed one, and a viewer cannot pick or add any other. If their own default is not on the list, the app says so and uses the first allowed one instead of silently calling out.

**Why this priority**: Maps are the largest source of outside traffic and the only one a viewer can freely redirect. This is the part that matters most for a locked-down site.

**Independent Test**: Set an allow-list of patterns; open the Basemap tab: only matching entries (including the raster dropdown) are listed; open a map: it uses an allowed basemap and makes no request to a basemap host outside the list.

**Acceptance Scenarios**:

1. **Given** an allow-list matching two catalogue entries, **When** the Basemap tab opens, **Then** only those two are offered, in every group and in the raster dropdown, and nothing else can be added.
2. **Given** a list that does not include the app's own default, **When** a map opens, **Then** it shows the first allowed basemap, and the configuration note and `check` say the default was replaced.
3. **Given** a page or panel that names a basemap which is not allowed, **When** the page opens, **Then** that setting is reported the same way and the first allowed basemap is used.
4. **Given** a list that matches nothing in the catalogue, **When** a map opens, **Then** it shows the plain blank background (no tiles, no outside request) and the problem is reported.
5. **Given** no allow-list, or an empty one, **When** the app runs, **Then** every basemap is offered and the default is what it is today.

---

### User Story 2 - A deployer keeps fonts inside the bundle (Priority: P2)

A deployer sets the fonts to "bundled". The Appearance tab then offers only the fonts that ship with the app (the default font and the system font), the custom-font inputs and the Google shortlist disappear, and no request is made to Google Fonts, not even for the previews. A viewer cannot set a font that is not offered.

**Why this priority**: A small, well-bounded change that removes the other outside call every viewer can trigger. Lower than maps because it affects only a picker.

**Independent Test**: Set fonts to bundled; open Appearance: two cards, no custom inputs; the network log has no request to a font host. Unset it: today's four cards and inputs return.

**Acceptance Scenarios**:

1. **Given** fonts set to bundled, **When** the Appearance tab opens, **Then** only the default font and System UI are offered, the custom-font inputs and the shortlist are absent, and no font host is contacted.
2. **Given** fonts set to bundled, **When** a viewer has a session font preference for a hidden family (set earlier in the same session), **Then** it is ignored and the default font is used.
3. **Given** fonts unset or set to "any", **When** the Appearance tab opens, **Then** it behaves exactly as today.

---

### User Story 3 - A deployer hosts the database extensions themselves (Priority: P2)

A deployer sets one address for DuckDB's extension files. The app asks that address, not DuckDB's own host, the first time a map needs the spatial extension or a parquet read needs its extension. Viewers' own SQL cannot change it.

**Why this priority**: It is the last outside call a locked-down site cannot otherwise remove, but only matters to deployers who host files themselves.

**Independent Test**: Set the address to a test host that serves the extension; open a zone map; the request goes to that host and none to DuckDB's.

**Acceptance Scenarios**:

1. **Given** an extension address, **When** the first map view loads the spatial extension, **Then** the file is requested from that address.
2. **Given** an address that is not an http or https address, **When** the app loads, **Then** it is reported and ignored (DuckDB's own host is used, as today).
3. **Given** no address, **When** the app runs, **Then** it behaves as today.
4. **Given** the assistant or the Explore SQL tab, **When** a user writes a statement that tries to install, load or change settings, **Then** it is refused as today; the setting is applied only by the app itself.

---

### User Story 4 - A deployer sees what a configuration can still reach (Priority: P3)

A deployer who wants a fully offline site sets fonts to bundled, lists self-hosted basemaps and gives an extension address. They run the check command and read, in its explain output, the outside hosts that configuration can still reach (for example a basemap host from the catalogue, or the extension host), so they can see what is left. It is information, never an error.

**Why this priority**: It makes "offline" something a deployer can verify without a separate switch, but nothing breaks without it.

**Independent Test**: Run `check --explain` on a site with some outside hosts left and with none; the first lists them, the second says none are known.

**Acceptance Scenarios**:

1. **Given** a site with fonts bundled, an allow-list of two outside basemaps and no extension address, **When** `check --explain` runs, **Then** it lists those two basemaps' hosts and DuckDB's extension host.
2. **Given** a site with only self-hosted basemaps and an extension address, **When** it runs, **Then** it reports that no outside host is known.
3. **Given** `check` without `--explain`, **When** it runs, **Then** the listing is not shown and the exit code depends only on real problems, as before.

---

### User Story 5 - A deployer is told about mistakes and nothing breaks (Priority: P2)

A deployer writes an unknown font mode, a pattern list that is not a list, an allow-list entry that matches nothing, a default basemap that is not allowed, or an extension address that is not a web address. The app loads, each setting keeps its default, and each problem is listed once with its key path in the configuration note and by `check`.

**Why this priority**: The project rule that a wrong value is reported and never fatal.

**Independent Test**: Put one of each mistake in a site file; the app loads, behaves as today for each, and each is listed once in the note and by `check`.

**Acceptance Scenarios**:

1. **Given** an unknown font mode, **When** the app loads, **Then** it is reported and "any" is used.
2. **Given** an allow-list pattern that matches no catalogue entry, **When** the app loads or `check` runs, **Then** it is reported by its key path (the other patterns still apply).
3. **Given** the generated reference and editor schema, **When** compared with the settings, **Then** each new key appears with its description, values and default.

### Edge Cases

- A pattern that matches an id from the raster provider catalogue loaded at run time: the catalogue is read from the bundled provider file, so `check` can match against it too; an entry the check cannot know is reported as "matches nothing known" only when the whole list matches nothing.
- The viewer's own basemap pick made earlier in the session is for an entry that is no longer allowed: it is dropped and the default is used.
- A deployer's own PMTiles source or hosted-map key (from `basemap.protomaps`): Protomaps entries follow the allow-list like any other; the deployer's own tile file is the usual allowed entry.
- Fonts bundled while the deployment's colour or other appearance settings are set: unaffected.
- A very long allow-list: no limit is needed beyond ordinary YAML.
- The viewer's first screen: the first map is drawn after the allow-list is known (it is read at boot with the other site settings).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The site file MUST accept `network.fonts` with the values `bundled` and `any`; unset means `any` and today's behaviour.
- **FR-002**: With `bundled`, the Appearance tab MUST offer only the fonts that ship in the bundle (the default font and the system font), MUST NOT show the custom-font inputs or the Google shortlist, MUST NOT load any preview or other font from an outside host, and MUST ignore a session font preference for a font that is not offered.
- **FR-003**: The site file MUST accept `network.basemaps.allow`, a list of patterns (the `*` wildcard only, matched without regard to letter case, as for Explore tables) on basemap ids.
- **FR-004**: With a non-empty allow-list, the Basemap tab MUST list only the matching catalogue entries (built-in styles and the curated raster providers), and a viewer MUST have no way to use a basemap that does not match; an empty or absent list means every entry is allowed.
- **FR-005**: When the effective default basemap (the panel's, the page's, the site's, or the app's own default, in that order) is not allowed, the first allowed basemap MUST be used instead, or the plain blank background when nothing matches; each such case MUST be reported with its key path in the configuration note and by `check`.
- **FR-006**: The site file MUST accept `network.duckdb_extensions`, one web address; the app MUST use it as the database's extension repository before the first extension install and MUST apply it only from the app's own code, never from user-written SQL, which remains refused as today.
- **FR-007**: An extension address that is not an http or https address MUST be reported and ignored.
- **FR-008**: `check --explain` MUST list the outside hosts the configuration can still reach, where the app knows them (the allowed built-in basemaps' and raster providers' hosts, the extension host when no address is set, and Google Fonts when fonts are not bundled), as information only; without `--explain` nothing is added and the exit code is unchanged.
- **FR-009**: Every new key MUST be one row in the schema table, site-only, so the generated reference, the editor schema, the validator and `check` list it with its values and default; a wrong value MUST be reported with its key path, keep the default and never block the app.
- **FR-010**: With none of the new keys set, every font, basemap and extension request MUST be identical to today's.
- **FR-011**: No setting MAY weaken the SQL guard, the read-only behaviour of the assistant and the Explore tab, or the privacy choice; no secret MAY be added to the site file.
- **FR-012**: The documentation (the configuration plan, with its wrong statement about the default basemap corrected, the grammar note, the project instructions and the history) MUST describe the new keys and mark Phase D step 10 done.

### Key Entities

- **Network block**: the three optional settings `fonts`, `basemaps.allow`, `duckdb_extensions`.
- **Basemap id**: the name a catalogue entry has (for example `carto-positron`, `openfreemap-liberty`, `ugrc-vector-lite`, a Protomaps flavour, or a raster provider's id).
- **Outside host**: a web host the configuration can still reach, listed by `check --explain`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With an allow-list of self-hosted basemaps, fonts bundled and an extension address, opening every page and every map makes zero requests to any host other than the dashboard's own and the deployer's listed ones.
- **SC-002**: A viewer cannot select, add or load a basemap or font that the configuration does not allow, by any control the app offers.
- **SC-003**: A deployment that sets none of the new keys makes the same requests as before this change.
- **SC-004**: Each kind of mistake (unknown font mode, bad list, pattern matching nothing, default not allowed, bad extension address) is reported once with its key path in both the configuration note and `check`, and in every case the app loads.
- **SC-005**: A deployer can learn from one run of `check --explain` which outside hosts remain.

## Assumptions

- The recommended answers in CONFIGURATION.md section 7 are adopted: hide (not disable) the fonts and controls that bundled mode removes; match basemaps by catalogue id with `*` globs; one extension address with no per-extension override; no separate offline switch.
- The catalogue ids and their hosts are known to the app and to `check` from the bundled catalogue and provider file; a host that cannot be derived is not listed.
- The app's own default basemap stays as it is for deployments that set nothing; changing it to something neutral is a separate decision.
- The allow-list is applied once at boot, with the other site settings, before any map is drawn.
- The extension address is passed to the database by the app's own startup code, which is not subject to the user-SQL guard.

## Out of Scope

- A content-security-policy header, tile proxying, a per-scenario data host.
- The assistant's providers (already covered by 068).
- Per-user network settings, deleting the Google font code, translating text.
- Changing the default basemap for deployments that set nothing.

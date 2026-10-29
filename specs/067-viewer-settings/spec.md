# Feature Specification: Viewer-facing settings (Settings tabs, documentation link, hidden pages)

**Feature Branch**: `067-viewer-settings`

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: "Phase C of project-docs/CONFIGURATION.md (viewer-facing settings), built on the dashboard-config.yaml and schema table delivered in 066: a deployer chooses the order and visibility of the Settings tabs, links the dashboard to a separate documentation site (an icon at the foot of the left sidebar, with an optional per-page path), and can hide a page from the sidebar while keeping it reachable by its address. Draft pages are deferred."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A deployer links the dashboard to its documentation site (Priority: P1)

A deployer has a separate documentation site (for example a Quarto site) and wants viewers to reach it from the dashboard. They set a documentation address, and optionally a label, in `dashboard-config.yaml`. A documentation icon then appears at the foot of the left sidebar and opens that site in a new browser tab. A page may add its own path so the icon opens the section of the documentation that explains that page.

**Why this priority**: This is the one Phase C item a viewer sees on every page, and it is what lets documentation leave the app (CONFIGURATION.md section 7). The other two stories are refinements.

**Independent Test**: Set a documentation address in the site file, load the app, and confirm an icon at the foot of the sidebar opens that address in a new tab; add a path to one page and confirm the icon opens the longer address only on that page.

**Acceptance Scenarios**:

1. **Given** a site file with a documentation address, **When** the app loads, **Then** a documentation icon (named by the label, default "Documentation") is shown at the foot of the left sidebar on every page and opens the address in a new tab.
2. **Given** a documentation address and a page that sets its own documentation path, **When** that page is open, **Then** the icon opens the address with the page's path appended, and on every other page it opens the address unchanged.
3. **Given** no documentation address, **When** the app loads, **Then** no icon is shown and the in-app Documentation tab in Settings stays exactly as it is today.
4. **Given** the sidebar is collapsed to its narrow rail, **When** the page is shown, **Then** the icon is still reachable (icon only, with its label as a tooltip and as its accessible name).

---

### User Story 2 - A deployer chooses which Settings tabs viewers see, and in what order (Priority: P2)

A deployer wants a simpler Settings window: for example only Appearance and Scenarios, or the Scenarios tab first. They list the tabs they want, in order, in the site file. Tabs not listed are not shown. With nothing set, the Settings window is as it is today.

**Why this priority**: It trims what viewers can change and is independent of the other two stories, but it only matters once a deployer has a reason to simplify.

**Independent Test**: List two of the five tabs in a chosen order, open Settings, and confirm only those two appear, in that order, and the first listed is the one that opens.

**Acceptance Scenarios**:

1. **Given** a tab list of Scenarios then Appearance, **When** Settings is opened, **Then** exactly those two tabs are shown in that order and Scenarios is the one open.
2. **Given** no tab list, **When** Settings is opened, **Then** the tabs are the five of today, in today's order.
3. **Given** a tab list that includes the Assistant tab while the assistant is switched off for the deployment, **When** Settings is opened, **Then** the Assistant tab is not shown (the existing on/off setting wins).
4. **Given** a tab list containing a name that is not a tab, **When** the app loads, **Then** the name is reported in the configuration note and ignored, and the valid names still apply.

---

### User Story 3 - A deployer hides a page from the sidebar but keeps it reachable (Priority: P3)

A deployer has a page they do not want listed (a work in progress for reviewers, or a page reached only from a link in a report). They mark it hidden. It does not appear in the sidebar, but anyone with its address can open it.

**Why this priority**: Useful but narrow, and nothing else depends on it.

**Independent Test**: Mark one of three pages hidden, load the app, and confirm the sidebar lists two pages; open the hidden page's address directly and confirm it opens.

**Acceptance Scenarios**:

1. **Given** a hidden page, **When** the app loads, **Then** the sidebar does not list it and the landing page is the first page that is not hidden.
2. **Given** a hidden page, **When** a viewer opens its address (`#/<page address>`), **Then** the page opens and shows its own title; the sidebar shows no item selected, and no other page loses its place.
3. **Given** a site with exactly one page and that page is hidden, **When** the app loads, **Then** that page is the landing page.
4. **Given** every page is hidden and there is more than one, **When** the app loads, **Then** the problem is reported and all pages are listed as if none were hidden, so the dashboard is still usable.

---

### Edge Cases

- A documentation address that is not a web address (`http` or `https`), such as `javascript:...`, a file path or a bare word: reported, ignored, no icon.
- A page documentation path that is itself a full address, or is set while the site has no documentation address: reported, ignored.
- A tab list that is empty, or whose entries are all unknown: reported, and today's tabs are shown (a Settings window with no tabs is never produced).
- The same tab listed twice: the second is reported and ignored.
- A tab list that omits the Documentation tab while a documentation address is set: both are allowed; the deployer decides whether the in-app tab stays.
- `draft` on a page header: not recognised by this feature (see Out of Scope); it has no effect and is not reserved.
- A hidden page that is also the target of a shared link with a section: opens as any page would.
- Expanding a tile or opening Settings never changes the page address, as before.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A deployer MUST be able to set, in `dashboard-config.yaml`, a documentation address and an optional label. The address is a web address (`http` or `https`) with no spaces; the label defaults to "Documentation".
- **FR-002**: With a documentation address set, the app MUST show a documentation icon at the foot of the left sidebar that opens the address in a new browser tab without giving the opened site access to the dashboard window. The icon MUST have the label as its accessible name and, when the sidebar is collapsed, as its tooltip.
- **FR-003**: A page MUST be able to set a documentation path in its own `header:`. When the page is open the icon MUST open the site address with that path appended (exactly one `/` between them); on pages without a path, and on the Settings and chromeless pages, it opens the address unchanged.
- **FR-004**: With no documentation address, no icon is shown and the in-app Documentation tab MUST remain as today. With one, the in-app tab is unchanged unless the deployer leaves it out of the tab list (FR-007).
- **FR-005**: A page documentation path set while there is no site documentation address, or a path that is a full address, MUST be reported and ignored.
- **FR-006**: A deployer MUST be able to set an ordered list of Settings tabs in `dashboard-config.yaml`, naming any of `appearance`, `scenarios`, `basemap`, `assistant`, `documentation`.
- **FR-007**: When the list is set, Settings MUST show exactly the listed tabs, in the listed order, with the first listed tab open by default. When it is unset, Settings MUST show today's five tabs in today's order.
- **FR-008**: The assistant switch (`assistant.enabled`) MUST keep priority: with the assistant off, the Assistant tab is never shown, whether or not it is listed.
- **FR-009**: An unknown tab name, a repeated tab name, and an empty or wholly unknown list MUST be reported and ignored; in the last case today's tabs are shown.
- **FR-010**: A deployer MUST be able to mark a page hidden in its `header:`. A hidden page MUST NOT be listed in the sidebar (expanded, collapsed or the mobile sheet) and MUST remain reachable by its page address, opening with its own title and content.
- **FR-011**: The landing page MUST be the first page that is not hidden; when the only page is hidden it is the landing page. When every page of several is hidden, that MUST be reported and all pages MUST be listed as if none were hidden.
- **FR-012**: Every new key MUST be a row in the same schema table that already defines the site settings, so the generated reference, the published JSON Schema, the file validator and the `check` command all know it with no other source edit. Keys are `snake_case`. The documentation address, label and the Settings tab list are site-only; the page documentation path and the hidden flag belong to the page's `header:` and do not cascade.
- **FR-013**: Every problem named in this specification MUST be shown through the existing configuration note and the browser console, and MUST be reported by the `check` command with the file and key path, exiting non-zero.
- **FR-014**: The generated reference (`project-docs/CONFIG-REFERENCE.md`), the published JSON Schema, `GRAMMAR.md` (for the two page keys) and `CLAUDE.md` MUST describe the new keys.
- **FR-015**: A deployment that sets none of the new keys MUST look and behave exactly as before this feature.

### Key Entities

- **Documentation link**: an optional site address and label, plus an optional per-page path; produces the sidebar icon and its destination.
- **Settings tab list**: an ordered subset of five named tabs; absent means all five in today's order.
- **Hidden page**: a page marked not to be listed; still a full page with an address.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A deployer can add a working documentation link by writing one setting, and a viewer reaches the documentation from any page in one click, in a new tab.
- **SC-002**: On a page with its own documentation path, the icon's destination is the site address plus that path in 100% of cases tried (with and without trailing or leading slashes), and never another page's path.
- **SC-003**: With no new key set, every existing automated check of the dashboard passes unchanged, and the sidebar and Settings are identical to the previous release.
- **SC-004**: With a tab list set, the Settings window shows exactly the listed, valid tabs in order in 100% of cases, and never zero tabs.
- **SC-005**: A hidden page is absent from every form of the sidebar and opens from its address in 100% of cases; the landing page is never a hidden page unless it is the only page.
- **SC-006**: For every problem case listed in this specification (bad address, bad path, unknown or repeated or empty tab list, all pages hidden), the dashboard still loads, the setting keeps its default, and the problem is listed with its file and key path in both the page note and the `check` output.
- **SC-007**: Adding the new keys needs no edit outside the schema table for the reference, the JSON Schema, validation and `check` to know them (a test proves the generated files match the table).

## Assumptions

- The in-app Documentation tab is not removed by this feature; moving documentation out of the app is a later step when the separate site exists (CONFIGURATION.md section 7). A deployer who has one can drop the tab with the tab list.
- The `assistant` name in the tab list is the tab the Settings window calls "Assistant"; internal names do not matter to a deployer.
- A page's documentation path and hidden flag are read from the page file's `header:` (a page's own identity stays there, CONFIGURATION.md section 3), not from the site file and not from the cascade.
- The documentation address is not a secret and may be shown to viewers; the `check` command does not warn about it.
- Hiding is cosmetic navigation, not access control: anyone with the address can open a hidden page.
- When every page is hidden the safe behaviour (list them all) is chosen over an empty sidebar because an empty sidebar would leave a viewer with no way to navigate.

## Out of Scope

- **Draft pages are deferred** until the profiles design (CONFIGURATION.md topic 5, "development" versus "production" profiles) exists. This feature builds nothing for `draft` and reserves nothing: the key is not recognised, has no effect, and may later be defined however the profiles design needs.
- The assistant provider block, `panel_defaults`, the `network` block, brand.yml, hosting the documentation site itself, the demo build flag (Phase A1) and data-layer adapters.
- Deployer theme, font or text-size defaults (viewer preferences stay with the viewer) and custom CSS.
- Groups or external links in the sidebar.

# Feature Specification: Demo content only when asked for

**Feature Branch**: `070-demo-build-flag`

**Created**: 2026-10-29

**Status**: Draft

**Input**: User description: "Phase A1 of project-docs/CONFIGURATION.md (step 1, decided: an opt-in build flag), built on the site configuration from 066 to 069: a normal build ships no demo content and no WFRC fallbacks, so an unconfigured deployment is neutral; a demo flag turns the demo on for the GitHub Pages build, the dev server and the test suites."

## What happens today

Every build and every running copy of the app loads the deployer's own configuration folder and then always the git-tracked demo folder behind it: per setting the deployer's value wins and the demo's is the fallback, and the page lists and run lists are joined. The demo's title, logos, colours, map key, tabs, runs and zone geometry therefore appear in any deployment that leaves something unset, and the whole `public/demo-*` content (including an 11 MB synthetic data set) is copied into the build output that feeds the Python and R packages.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A deployer's build contains only the deployer's content (Priority: P1)

A deployer builds the dashboard for their agency (the build that feeds the Python library and the R package). They put their own site file, page files and runs in the deployment folders. The result shows their title, their pages and their runs, and nothing from the WFRC demo: not a leftover tab, not a fallback logo or colour, not a map key, not an example run. The build output contains no demo files.

**Why this priority**: This is the point of the change (principle 3: an unconfigured deployment is neutral). Shipping another organisation's demo content, key and 11 MB of data inside every package is the problem to remove.

**Independent Test**: Build without the demo flag with a small deployment folder (its own site file, one page, one run). Open it: only the deployer's title, page and run appear. List the build output: no file from the demo folders is there.

**Acceptance Scenarios**:

1. **Given** a normal build and a deployment folder with a site file naming two pages, **When** the app opens, **Then** exactly those two pages are listed and the landing page is the first of them.
2. **Given** a deployment site file that sets only a title, **When** the app opens, **Then** the title is theirs and every other setting is the app's neutral default (no WFRC logo, colour, map key or district names).
3. **Given** a normal build, **When** the build output is listed, **Then** it contains no file from the demo content folders and is smaller than the demo build by about the size of that content.
4. **Given** a deployment that already sets its own title, pages, runs and colours, **When** it moves to this version, **Then** it looks exactly as it did (nothing it set is lost).

---

### User Story 2 - A copy with no deployment configuration says so (Priority: P1)

Someone opens a normal build that has no deployment folder at all (a fresh install, a wrong path, an empty package). Instead of a crash, a blank page or the WFRC demo, they see a short first-run message that says no site configuration was found, where the app looked, and what to do (add a site file, or build with the demo to see an example).

**Why this priority**: Removing the silent fallback must not leave a confusing blank page; this is what the neutral default looks like.

**Independent Test**: Build without the flag and without any deployment folder; open it; read the message; confirm the browser console has no uncaught error and no demo content loads.

**Acceptance Scenarios**:

1. **Given** a normal build with no site file, **When** the app opens, **Then** a first-run message names the missing site configuration and the folder it looked in, and offers the next step.
2. **Given** that state, **When** the page is inspected, **Then** no request for a demo file is made and no error is reported beyond the message.
3. **Given** a site file that exists but lists no pages, **When** the app opens, **Then** the message says the site lists no pages (not "no configuration").

---

### User Story 3 - The demo is one switch away (Priority: P2)

A maintainer builds the GitHub Pages site, or starts the dev server, or runs the test suites. The demo content is available exactly as today: the Pages build is the demo (same tabs, runs and look), the dev server serves it, and every existing test project (legacy fixtures, synthetic redesign set, real demo) still finds its content. A maintainer can also build a package-style copy with the demo switched on to try the app.

**Why this priority**: Nothing that works today may stop working; the demo is how the project is shown and tested.

**Independent Test**: Build the Pages output with the flag and compare it to the output of the same build before this change (same pages, runs and files in `docs/`); run the existing test suites unchanged.

**Acceptance Scenarios**:

1. **Given** the Pages build, **When** it is built and opened, **Then** it shows the same demo as before this change.
2. **Given** the dev server and each test project, **When** they start, **Then** their demo content is present without any extra step and the existing specs pass.
3. **Given** a normal build, **When** a maintainer builds again with the demo flag, **Then** the demo content is included and works (the way to turn it on is documented).

---

### User Story 4 - The check command still works on any folder (Priority: P3)

A deployer runs the configuration check on their folder, with or without the demo. It reports the same problems as before, and never depends on the demo being present.

**Why this priority**: `check` already reads one folder at a time; it must not regress.

**Independent Test**: Run `check` on the demo folder and on a small deployer folder, from a normal build setup; both give the results they gave before.

**Acceptance Scenarios**:

1. **Given** the demo folder, **When** `check` runs on it, **Then** it reports no problems, as before.
2. **Given** a deployer folder, **When** `check` runs on it, **Then** it reports only that folder's problems.

### Edge Cases

- A deployer who relied on the demo as a fallback (an unset logo or colour showing the WFRC one): after this change that setting shows the neutral default. This is intended (no backward compatibility, CONFIGURATION.md section 7) and is stated in the docs.
- A deployment folder with a site file but no runs: the app loads with no data, as it does today for a deployer with no runs.
- The demo flag set while a deployer folder also exists: the deployer's values win per setting and the demo fills the rest, as today.
- The map key shipped in the demo site file: it is a demo setting, so a normal build has none and the hosted-map basemaps fall back as they do for any unconfigured key.
- The boot-time page skeleton shown while the app loads: a normal build builds it from the deployer's folder only, so it never flashes demo tabs.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A build without the demo flag MUST NOT include any file from the demo content folders in its output.
- **FR-002**: A build without the demo flag MUST NOT read the demo folders for any setting, page, run or geometry at run time, and MUST NOT use any WFRC value as a fallback (title, logos, colours, map key, district names, tab names).
- **FR-003**: With no site configuration found, the app MUST show a first-run message that states what is missing, which folder was searched and the next step, with no error escaping to the console, and MUST NOT show demo content.
- **FR-004**: With a site file that lists no pages, the app MUST say so, distinctly from a missing site file.
- **FR-005**: An opt-in demo flag MUST turn the demo content on for the build, including its files in the output and its use at run time, so the Pages build is the demo exactly as before.
- **FR-006**: The GitHub Pages build command MUST set the demo flag; the normal build command and the build that feeds the packages MUST NOT.
- **FR-007**: The dev server and the three test projects MUST keep serving their demo content with no extra step, and every existing spec MUST pass unchanged.
- **FR-008**: A deployer's settings, pages and runs MUST behave exactly as before in both modes (their value wins per setting; with the flag on the demo fills the rest as today).
- **FR-009**: The boot-time page skeleton MUST be built from the same sources as the running app (the deployer's folder only, or both when the flag is on).
- **FR-010**: The `check` command MUST keep working on any folder, independently of the flag.
- **FR-011**: The documentation (CONFIGURATION.md, the project instructions, the project's deployment notes and the history) MUST say how to turn the demo on, what a normal build contains, and that fallbacks to demo values no longer exist.
- **FR-012**: Removing the fallback MUST NOT change any file in the demo content folders; the demo content stays in the repository.

### Key Entities

- **Demo flag**: a build-time choice, off by default, that decides whether the demo content is in the output and used by the running app.
- **Deployment folder**: the deployer's own site file, page files and runs; the only content a normal build uses.
- **First-run state**: what the app shows when no usable site configuration exists.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The output of a build without the flag contains zero files from the demo folders, and is smaller than the demo build by at least the size of those folders (about 12 MB today).
- **SC-002**: An unconfigured copy shows zero WFRC-specific strings, logos or colours (title, tab names, run names, district names, map key).
- **SC-003**: The Pages build, the dev server and all three test projects behave as before: the full automated test run has no new failures compared with the run before this change.
- **SC-004**: A viewer who opens a copy with no site configuration understands what to do from one screen, with no console error.
- **SC-005**: A deployer whose own configuration set every value they care about sees no change in their dashboard after upgrading.

## Assumptions

- The flag is chosen at build time (and by the dev and test scripts), not by a viewer or at run time; a normal build can never reach demo content because it is not there.
- The dev server and test projects turn the demo on through their own start commands, so a maintainer's `npm run dev` stays the demo as today.
- "Neutral default" values are those already set in Phase A (neutral titles, no district names, neutral colour presets); this feature removes the remaining fallbacks to the demo folder only.
- Profiles (CONFIGURATION.md topic 5) may later replace the flag; this feature does not pre-empt them.
- A deployer who wants an example uses the demo build; no demo content is offered inside a normal build.

## Out of Scope

- Profiles, the network block, packaging into the Python and R packages, listing runs in the site file, the data layer.
- Deleting or moving the demo content.
- Any change to what the demo shows.

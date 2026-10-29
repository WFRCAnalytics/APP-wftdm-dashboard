# Feature Specification: Run the dashboard locally from the Python library (`here`, `init`, `serve`)

**Feature Branch**: `072-python-local-server`

**Created**: 2026-10-29

**Status**: Draft

**Input**: User description: "Phase G step 12 of project-docs/CONFIGURATION.md: the Python library's `here`, `serve` and `init` commands, so an analyst or deployer can start a dashboard from a folder with one command, write a starter site file, and use a local file server with a hosted copy of the app."

## What exists today

The Python library (`wftdm-dashboard`) has `summarize` (raw model output to Parquet) and `validate-observed`. The README and the architecture notes describe `here`, `serve` and `init`, but none is built: there is no server, no embedded copy of the app and no starter files. A deployer today needs Node, a build and the repository to see their own configuration in the app. The app itself is ready for this: a normal build contains no demo content, reads one site file (`dashboard-config.yaml`), the pages it lists and the runs it finds, and shows a first-run screen when there is nothing to show.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One command shows my dashboard (Priority: P1)

An analyst or deployer has a folder with a `dashboard-config.yaml`, the page files it lists and their scenario runs. They run `wftdm-dashboard here` in that folder (or give the folder). The library starts a local server, opens the browser and the dashboard appears with their title, pages and runs. Nothing is installed besides the library, no internet is needed for the app itself (the only outside downloads are DuckDB's own extensions, which the site file can point at a mirror), and the folder is never changed. Editing a file in the folder and reloading the page shows the change.

**Why this priority**: This is the whole point of the library for a deployer: see the dashboard without Node, a build or a web host, in one command. Everything else is a convenience around it.

**Independent Test**: Install the library into a clean environment, run `here` on a small folder (a site file, one page, one run), and confirm the browser shows that dashboard with its data and that no file in the folder was written.

**Acceptance Scenarios**:

1. **Given** a folder with a site file, pages and runs, **When** `here` runs, **Then** a local address is printed, the browser opens at it, and the dashboard shows the folder's title, pages and runs.
2. **Given** the running server, **When** a page file in the folder is edited and the browser reloaded, **Then** the change shows (no stale copy from a cache).
3. **Given** a folder with no site file, **When** `here` runs, **Then** the app's first-run screen appears, and the command also prints what is missing and the command that creates a starter (`init`).
4. **Given** the chosen address (a busy port, or a second `here` at the same time), **When** it starts, **Then** it uses the next free port (or the one asked for, or fails with a clear message when that one is taken) and says which.
5. **Given** a request for a file outside the folder (a path with `..`, an absolute path, a symbolic link out), **When** it is made, **Then** it is refused and nothing outside the folder is ever served.
6. **Given** the folder lists runs, **When** the app asks for the run list, **Then** it receives it (generated from the folders present) without the deployer writing one, and a run folder added later appears after a reload.

---

### User Story 2 - `init` writes a starter configuration (Priority: P2)

A deployer starting from nothing runs `wftdm-dashboard init` in an empty folder. It writes a starter `dashboard-config.yaml` (every setting listed with its description and its default, commented out so the file is valid and neutral as it stands, plus the line that gives an editor completion and checking) and one starter page, so `here` immediately shows something. It never overwrites a file that already exists, and says what it wrote and what it left alone.

**Why this priority**: It removes the blank-file problem and keeps the starter in step with the schema, but a deployer can already write the file by hand from the reference.

**Independent Test**: Run `init` in an empty folder, then `here`: a dashboard with one page opens. Run `init` again: nothing changes and the output says every file was kept.

**Acceptance Scenarios**:

1. **Given** an empty folder, **When** `init` runs, **Then** it writes the site file and one page and prints each file's name.
2. **Given** a folder that already has a site file, **When** `init` runs, **Then** that file is untouched and reported as kept, and only the missing files are written.
3. **Given** the written site file, **When** it is read by the app, **Then** it reports no problem (it validates as written).
4. **Given** the settings of the app change in a later version, **When** `init` is run with that version, **Then** the starter lists the new settings (it is generated from the same schema as the reference, never hand-copied).

---

### User Story 3 - `serve` offers the folder to a hosted copy of the app (Priority: P3)

A user who prefers a hosted copy of the app runs `wftdm-dashboard serve` in a folder. It serves only the folder's files, with cross-origin access enabled, so the hosted app can read them. The command says plainly that some browsers refuse a secure web page reading a local plain-HTTP address (mixed content, private network access) and that `here` is the way that always works.

**Why this priority**: It is documented from the start, but `here` covers the same need without the browser restrictions; this is the smallest possible version.

**Independent Test**: Run `serve` on a folder and fetch a file from a page served from a different origin: the file arrives with the cross-origin header and a range request works.

**Acceptance Scenarios**:

1. **Given** a running `serve`, **When** a page from another local origin requests a file in the folder, **Then** it is allowed and the file arrives.
2. **Given** a running `serve`, **When** the command starts, **Then** it prints the address and the limits of use with a hosted secure page.
3. **Given** a request outside the folder, **When** it is made, **Then** it is refused exactly as in `here`.

---

### User Story 4 - The package carries the app (Priority: P2)

A maintainer builds the library. The build embeds the dashboard app (the normal build, with no demo content) inside the package, built so it works from whatever address and port the server uses. A user who installs the library gets `here` working with no other step.

**Why this priority**: `here` cannot work without it, but it is a build step rather than something a viewer sees.

**Independent Test**: Build the package, install it into a clean environment, run `here` on a small folder and open the app: it loads from the printed address and port, whatever they are.

**Acceptance Scenarios**:

1. **Given** the build, **When** it finishes, **Then** the package contains the app and no demo content, and the embedded copy is not tracked in the repository.
2. **Given** an installed package, **When** `here` is run on two different ports in turn, **Then** the app loads and finds its data on both.
3. **Given** a repository checkout that has not built the app, **When** `here` is run, **Then** it stops with a message that says how to build it (not a stack trace).

### Edge Cases

- A folder that lists a page file that does not exist: the app reports it in its own configuration note (the server does not hide it).
- A folder with run subfolders but no `observed/`: fine, the folder is optional.
- A very large Parquet file: served in ranges, never read whole into memory.
- A file being written while it is served (the deployer saving): the response is whatever is on disk; no lock is taken.
- Browser cannot be opened (a headless machine): the address is printed and the server keeps running; `--no-browser` skips the attempt.
- A folder with spaces or non-ASCII names in its path or in file names: served correctly.
- Windows paths and path separators: served correctly (the library is used on Windows).
- `init` in a folder where only some of the starter files exist: it writes the rest and keeps the existing ones.
- Two commands on the same folder at once: both read-only, no conflict.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `here` MUST start a local server for a folder (the current folder by default), print its address, and open the default browser on it unless told not to.
- **FR-002**: The server MUST bind to the local machine only by default; reaching it from another machine MUST need an explicit option, and the command MUST say so when it is used.
- **FR-003**: `here` MUST serve the embedded app at the root and map the folder to the paths the app reads: the site file and its pages as the deployment configuration, the run folders as the scenarios, and an optional `observed` folder.
- **FR-004**: The run list the app needs MUST be generated by the server from the run folders present, and MUST NOT require the deployer to write one or change any file in the folder.
- **FR-005**: The server MUST support HTTP range requests (partial content), give the correct content type for the file types the app uses (web assembly, Parquet, GeoParquet, YAML, JSON, fonts, images), and send headers that make the browser re-check a file on every load, so an edit shows on reload.
- **FR-006**: The server MUST serve only files inside the chosen folder (and the embedded app): any request that resolves outside it, by `..`, an absolute path, an encoded path or a link, MUST be refused, on every operating system the library supports.
- **FR-007**: The server MUST be read-only: no request changes, creates or deletes a file.
- **FR-008**: With no site file in the folder, `here` MUST still start (the app shows its first-run screen) and MUST print what is missing and the `init` command.
- **FR-009**: When the chosen port is taken, `here` MUST use the next free one and say so, unless a port was asked for, in which case it MUST fail with a clear message.
- **FR-010**: `init` MUST write a starter `dashboard-config.yaml` and one starter page into the folder, MUST NOT overwrite any existing file, and MUST report each file as written or kept.
- **FR-011**: The starter site file MUST list every site setting with its description and default (set from the schema that the reference and the editor schema are generated from, never copied by hand), MUST be valid and neutral as written, and MUST include the line that gives an editor completion and checking.
- **FR-012**: `serve` MUST serve the folder only (not the app) with cross-origin access enabled, MUST print the limits of use with a hosted secure page, and MUST apply the same folder rules as `here` (FR-005 to FR-007).
- **FR-013**: The package build MUST embed the normal app build (no demo content) built so it works from any address and port, MUST NOT track the embedded copy in the repository, and a command run without it MUST stop with a message that says how to build it.
- **FR-014**: The commands MUST NOT contain dashboard logic: the app does the reading, checking and drawing; the library only serves files, lists run folders and writes starter files.
- **FR-015**: The commands MUST work with the existing dependencies and the supported Python versions, MUST pass the project's lint rules, and MUST be covered by automated tests (path safety, ranges, content types, run list, starter files, never overwriting).
- **FR-016**: A command-line check of a folder (the configuration check) is NOT part of this feature: where useful the commands MAY print the equivalent command of the app's own check and MUST say it is not available in the library yet.
- **FR-017**: The documentation (the README's deployment section, the architecture notes, the configuration plan, the project instructions and the history) MUST describe the commands as built, and MUST remove the "designed but not built" notice for the commands this feature builds.

### Key Entities

- **Site folder**: the folder given to a command: a site file, the page files it lists, the run folders, an optional observed folder.
- **Run folder**: a folder of one scenario run (its Parquet summary files and its manifest), listed by the server for the app.
- **Embedded app**: the app's normal build, carried inside the package and served at the root by `here`.
- **Starter files**: the site file and the page that `init` writes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From an installed library and a folder of a site file, one page and one run, a user sees their dashboard in the browser with one command and no other step, in under a minute on a normal machine.
- **SC-002**: An edit to a page or site file shows after a plain reload, 100% of the time, with no manual cache clearing.
- **SC-003**: Not one request outside the chosen folder is ever answered with a file, in every path-escape case the tests try (relative, absolute, encoded, linked), on every supported operating system.
- **SC-004**: A Parquet file of any size is read by the app through partial requests, and the server's memory use does not grow with the file size.
- **SC-005**: `init` then `here` in an empty folder shows a working dashboard page with zero configuration problems reported, and a second `init` changes nothing.
- **SC-006**: The starter site file lists 100% of the site settings of the version that wrote it.
- **SC-007**: The app loads and finds its data when `here` is started on any port.

## Assumptions

- The app already reads its configuration and runs from the paths named above (the deployment configuration folder, the scenarios folder with a run list, the optional observed folder); the server adapts the user's folder to those paths and the app is not changed except for a relative-base build.
- The app is the normal build (070): a folder with no site file gets the first-run screen, not demo content.
- The existing `init --scenario-dir` (a `summarize.yaml` scaffold for the model repository) is NOT part of this feature: it belongs to the post-processor workflow, and the description of `init` in the architecture notes is updated to say `init` writes the site starter here and the scenario scaffold stays a later step.
- Starter content is neutral: no organisation's name, colours or place names (the first principle of the configuration plan).
- A demo shortcut (a flag that serves the bundled demo for a quick look) is optional and is not required for this feature.
- Windows is a main platform; paths, content types and links are tested there.
- `check` is not built in the library until the core's packaging is decided (CONFIGURATION.md section 7).

## Out of Scope

- The R package (Phase G step 13) and publishing to PyPI.
- The data-path decision, summarising on launch, authentication, remote hosting and service installers.
- A configuration check inside the library (it needs the TypeScript core).
- The model repository scaffold (`init --scenario-dir`).

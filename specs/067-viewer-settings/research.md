# Research: Viewer-facing settings

Decisions taken before design. Each lists the choice, why, and what was rejected.

## 1. Page-scoped rows in the same schema table

**Decision**: add an optional `scope?: 'page'` to `SettingDef`. A page-scoped row (`header.docs`, `header.hidden`) is set in a page file's `header:`, is checked by `validate(.., { level: 'page' })`, is reported `not_allowed_here` if it appears in the site file, and is never taken by the cascade resolver (a page's identity does not cascade, CONFIGURATION.md section 3).

**Why**: FR-012 wants one table for the reference, JSON Schema, validator and `check`. A second table for page keys would split that.

**Rejected**: (a) a separate `PAGE_HEADER` table: two places to keep in step. (b) registering every existing `header.*` key (tab, title, icon, ...) now: it would start reporting unknown header keys in all existing fixtures, which is scope creep; `levels.ts#pageSettings` passes only `header.docs` and `header.hidden` to the validator, so other header keys stay unchecked exactly as today.

## 2. A `clean` hook for list values

**Decision**: a row may have `clean(value) => { value, messages }`. `validate` runs it after the type and `check` steps; each message is reported as `invalid_value` for that path and the returned `value` is kept (or the key left unset when `value` is undefined).

**Why**: `settings.tabs` must keep the valid names when one is unknown or repeated (FR-009). The existing `check` hook can only reject the whole value.

**Rejected**: reporting in the Settings modal instead of in `validate`: the problem would not reach the note, the JSON Schema or `check` consistently.

## 3. The `docs.url` scheme allow-list

**Decision**: the address must parse as a URL with protocol `http:` or `https:` and contain no whitespace; otherwise it is reported `invalid_value` and unset. The link uses `target="_blank"` with `rel="noopener noreferrer"`. The label is rendered as text.

**Why**: a deployer-supplied value ends up in an `href`; `javascript:` and `data:` addresses would run script in the dashboard's origin. The deployer is trusted, but a file edited by a script (the Python and R wrappers write it) or pasted from elsewhere should not be able to do that.

**Rejected**: allowing relative addresses (for a docs site hosted beside the dashboard): useful, but it would need the base-path rules; it can be added later as a separate decision (noted in the contract).

## 4. Joining the address and the page path

**Decision**: `docsHref(url, path)` returns `url` when `path` is empty, else the address with trailing slashes trimmed, one `/`, and the path with leading slashes trimmed. A path that has a scheme (`^[a-z][a-z0-9+.-]*:`) or starts with `//` is refused (reported, ignored). A path with a `#fragment` or `?query` is kept as given.

**Why**: SC-002 asks for correct joins with and without slashes. The fragment case is the natural way to point at a section of a Quarto page.

## 5. The tab names

**Decision**: config names are `appearance`, `scenarios`, `basemap`, `assistant`, `documentation`. The internal id of the Assistant tab stays `ai` (`SettingsTab`); a small map converts. Unset list means all five in today's order. With the assistant switched off the `assistant` entry is dropped from the resolved list silently (documented, FR-008), not reported.

**Why**: a deployer thinks in the labels they see; renaming the internal id would touch `openSettings('ai')` callers for no benefit.

## 6. Where hidden pages are filtered

**Decision**: `FloatingNav` keeps iterating the full `tabs` array (so `activeIndex` stays an index into it, as the shell comment requires) and skips entries for which `listedPages` says not listed. A hidden page that is active simply has no selected item. The shell computes the landing index with `landingIndex`, used for the initial state and for an address that names no page.

**Why**: the shell tracks the active page by array index (two config roots can repeat a tab name); filtering the array would shift indices and break addresses.

## 7. All pages hidden

**Decision**: `listedPages` returns every index when every page of more than one is hidden, and the problem is reported once (note, console, `check`). With exactly one page, hidden or not, that page is listed and is the landing page.

**Why**: an empty sidebar leaves a viewer stuck (spec assumption).

## 8. Where the cross-file problems are found

**Decision**: `header.docs` without a site `docs.url`, and all-pages-hidden, need both files. In the app they are reported at load by `loadDashboards`' caller (`main.tsx` has the site and the pages); in `check` by `checkSite`. Both call the same pure helpers.

**Why**: keeps `validate` single-file and pure, as in 066.

## 9. The docs link component

**Decision**: render an `<a>` with the same classes as `NavButton` (extract the class string; no behaviour change to `NavButton`), icon `BookOpen`, label text hidden when collapsed exactly like the other nav buttons, and `title={label}` plus an accessible name from the label when collapsed.

**Rejected**: `NavButton` with an `as` prop: a polymorphic change to a component used by Settings and Theme buttons for one caller.

## 10. Draft pages

**Decision**: nothing is built or reserved. `header.draft` is not read, not in the schema and not reported. The decision and the deferral are recorded in CONFIGURATION.md section 7.

## 11. Testing without a new project

**Decision**: the Playwright spec runs in the existing `chromium` project, which already has several pages and the sidebar, using `patchDemoConfig` for the site file and a `page.route` for one page's `header:`, the pattern `siteConfig.spec.ts` uses.

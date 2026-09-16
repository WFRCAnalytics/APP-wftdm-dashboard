# Feature Specification: Server-Side Sort, Filter & Pagination for TablePanel

**Feature Branch**: `059-server-side-pagination`

**Created**: 2026-09-16

**Status**: Draft

**Input**: User description: "Server-side (DuckDB-based) sort, filter, and pagination for TablePanel — move TablePanel's sort/search/pagination from client-side JS (fetch-everything-then-process) to real DuckDB SQL query building through panelQuery.ts/sqlExpander.ts, the same pipeline every other panel type already uses. Carries forward this session's own real, measured evidence (15,000-row and 2,000,000-row synthetic scale tests against the production DuckDB-WASM engine) rather than re-deriving it. Required research to resolve before design: mode-selection mechanism, keyset pagination's tie-breaker-key mechanics, the search-semantics risk (rendered vs. raw value matching), color-scale/domain interaction, comparison-diff (baseline) interaction, and a real, justified row-count threshold. Out of scope: column-visibility (067, already correctly client-side) and any other panel type's own query-building."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A viewer explores a large table without waiting (Priority: P1)

A dashboard viewer opens a table panel bound to a real, large dataset (today's smaller demo content, and — the reason this feature exists — the real, much larger MAZ-level and person/trip-level tables a production WFRC deployment will show). They click a column header to sort, type into the search box, and page through the results. Every one of those actions responds quickly, the same way it already does on today's smaller tables — the viewer never notices that a large table is being handled any differently than a small one, except that it doesn't stall.

**Why this priority**: This is the entire reason the feature exists — real, measured evidence from this same session shows today's approach costs several seconds on a real 2,000,000-row table (a multi-second fetch, plus another full second or more on every subsequent sort), while the proposed approach responds in well under a tenth of a second for the same actions. Without this story, the feature delivers no value.

**Independent Test**: Load a table panel bound to a metric with a very large real row count; sort by a column, search for a term, and page forward and backward. Each action completes quickly and shows correct results, with no dependency on any of the other user stories below.

**Acceptance Scenarios**:

1. **Given** a table panel bound to a metric with hundreds of thousands of rows or more, **When** the viewer clicks a column header to sort, **Then** the table re-orders and the first page of the new order appears quickly, without the browser needing to have already loaded every row.
2. **Given** the same large table, **When** the viewer pages forward repeatedly, including all the way to a page near the very end of the result set, **Then** each page appears about as quickly as the one before it — paging deep into the table is not noticeably slower than paging near the start.
3. **Given** the same large table, **When** the viewer types a search term, **Then** matching rows appear quickly without the browser having had to hold the entire table in memory first.

---

### User Story 2 - Search still finds what a viewer sees on screen (Priority: P2)

A viewer searches a table using the same kind of term they'd type today — including a formatted number exactly as it's displayed (for example, a comma-separated thousands value, or a percentage with a `%` sign). The search finds the same rows it would have found before this feature existed, on tables of any size. Nothing about how search behaves changes from the viewer's point of view.

**Why this priority**: Search already exists and already has documented, relied-upon behavior ("search what you can see," established when the table panel was first built). A change here would be a real, confusing regression if not handled correctly — high priority, but secondary to Story 1 because it protects existing behavior rather than adding new value.

**Independent Test**: On a table with a formatted numeric column (e.g., a thousands-separated count or a percentage), search using the exact displayed text (including its punctuation) and confirm the same rows match as would have matched before this feature, regardless of whether the table is small or large.

**Acceptance Scenarios**:

1. **Given** a table column displaying values with a thousands separator (e.g., "9,200"), **When** the viewer searches for the displayed text, **Then** the matching row(s) are found, the same as before this feature.
2. **Given** a table column displaying a percentage (e.g., "84.7%"), **When** the viewer searches for that displayed text, **Then** the matching row(s) are found.
3. **Given** a large table now using the new, faster query path, **When** the viewer performs the same two searches above, **Then** the results are identical to what a small table (still using today's approach) would show for the same search.

---

### User Story 3 - Every existing dashboard keeps working, unchanged (Priority: P3)

A dashboard author who has already published table panels does nothing differently. Every currently-working table panel — small or large, with or without column formatting, color-scale shading, or a baseline-comparison column — continues to render exactly as it does today, with no new YAML to write and no existing configuration to revisit.

**Why this priority**: This is a safety/compatibility story, not a new capability — real value only if nothing that already works gets quietly broken. Lower priority than Stories 1–2 because it's a "don't regress" bar rather than new value delivered, but it's a release-blocking bar all the same.

**Independent Test**: Re-run the full existing set of published table-panel dashboards (small tables, color-scaled columns, baseline-diff columns, searchable and non-searchable panels) and confirm every one renders identically to its pre-feature behavior.

**Acceptance Scenarios**:

1. **Given** a table panel with an author-specified color-scale range on one of its columns, **When** the panel renders at any scale (small or large), **Then** the cell shading reflects the same author-specified range as before — never a range computed only from whichever rows happen to be on the current page.
2. **Given** a table panel showing a baseline-comparison ("how does scenario A differ from scenario B") column, **When** that table reaches real large-table scale, **Then** it sorts, searches, and pages correctly, the same as an ordinary (non-comparison) table would.
3. **Given** any table panel that worked correctly before this feature existed, **When** this feature ships, **Then** that panel's on-screen behavior is unchanged.

---

### Edge Cases

- What happens when a viewer sorts a large table by a column whose values repeat many times over (e.g., a category with only a handful of distinct values across two million rows)? Row order must still be fully deterministic and every row must appear on exactly one page — never skipped, never duplicated, regardless of how many rows share the same sort value.
- What happens when a table's real row count sits right at the boundary between "small" and "large" handling — does the viewer ever see an obvious behavior seam (e.g., losing "jump to last page" mid-session)? The system decides once, at load, based on the table's real row count at that time; a table does not switch handling strategy while a viewer is actively interacting with it.
- What happens when a viewer changes the search term, sort column, or page size while a previous request for the same table is still in flight? The most recent action wins — a viewer must never see an out-of-date result silently replace a newer one, matching this table's own existing in-flight-request-cancellation behavior today.
- What happens when a large table's current sort column contains only null/empty values, or every row is identical? Pagination must still terminate correctly (every row reachable, no infinite scroll, no missing final page).
- What happens when a baseline-comparison ("diff") table has no valid baseline resolved? The existing "no baseline available" state is shown, exactly as it is today — this feature does not change when that state appears, only how a resolved diff table's own rows are paged through once a baseline does resolve.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST automatically decide, per table panel and without any new authoring step, whether a table's real result set is small enough to keep handling entirely in the browser (today's behavior, unchanged) or large enough to warrant the faster, query-driven approach — a dashboard author MUST NOT be required to declare this choice for it to work correctly.
- **FR-002**: For a result set that stays below the size threshold (FR-010), every existing behavior — fetch-once, sort/filter/paginate in the browser — MUST continue exactly as it does today, with no observable change.
- **FR-003**: For a result set at or above the size threshold, sorting by any column MUST be performed by the underlying query engine rather than by re-processing an already-fetched result set in the browser, so that sorting a very large table does not require the whole table to already be loaded.
- **FR-004**: For a result set at or above the size threshold, moving from one page to another MUST use a paging technique whose response time does not grow as a viewer moves deeper into the result set — paging to the last page of a very large table must not become measurably slower than paging to the second page.
- **FR-005**: Search MUST continue to match against the same human-readable, formatted text a viewer sees on screen (respecting each column's own configured display format — thousands separators, percentages, sign-forcing, and any other currently-supported format), not the underlying raw value, for a table of any size.
- **FR-006**: When the column currently being sorted contains repeated (non-unique) values, the system MUST still guarantee a fully deterministic, gap-free, duplicate-free page sequence across the whole result set — this determinism MUST be provided automatically by the system and MUST NOT require a dashboard author to add or guarantee a unique identifier column in their own data.
- **FR-007**: Cell color-scale shading, where an author has configured it, MUST continue to reflect only the author-specified value range — never a range silently computed from whatever subset of rows happens to be on the currently-visible page.
- **FR-008**: A baseline-comparison ("diff") table panel MUST support the same sort/filter/pagination behavior described above once its own real result set reaches the size threshold, with no separate configuration or behavior required from the dashboard author.
- **FR-009**: If a viewer triggers a new sort, search, or page action before a previous one has finished, the system MUST ensure only the result of the most recent action is ever shown — a stale, superseded result MUST NOT silently appear after a newer one.
- **FR-010**: The size threshold separating "small" (browser-handled) from "large" (query-driven) tables MUST be a real, evidence-based value — low enough that no real currently-published table crosses it needlessly, and high enough that the difference in viewer-perceived responsiveness below it is negligible. The specific number is intentionally not fixed by this specification (see Assumptions) and MUST be confirmed with additional real measurement before implementation.
- **FR-011**: Every table panel configuration that renders correctly today MUST continue to render correctly after this feature ships, with zero required changes to any already-published `dashboard-*.yaml`.

### Key Entities

- **Table Query Strategy**: the per-panel, per-load decision (browser-handled vs. query-driven) described in FR-001. Not visible to a dashboard author as a setting — an internal decision the system makes and a viewer never directly sees, only its effect (consistently fast interaction).
- **Page Position**: a viewer's "where am I in this table" state — a plain page number, identical in shape and behavior for a small (browser-handled) or a large (query-driven) table alike. A real, further planning-time finding (`research.md` §2) closed what an earlier draft of this specification expected to be a real difference here: because the query-driven path's own real, measured cost does not depend on which position is requested, a page number can be translated directly into the query engine's own request for that same position, with no separate "remembered cursor" concept needed at all.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A viewer sorting, searching, or paging through a table with hundreds of thousands of rows or more sees a response in a small fraction of a second — no multi-second wait, regardless of which page or search term is involved.
- **SC-002**: A viewer working with any of today's existing (real-world-sized) tables sees no measurable change in responsiveness or behavior compared to before this feature.
- **SC-003**: For a very large table, the time to reach the very last page of results is not meaningfully different from the time to reach the second page — response time does not grow with how deep into the table a viewer navigates.
- **SC-004**: A search term that matches a row's on-screen, formatted text (a comma-separated number, a percentage, a signed value) continues to find that row, on a table of any size, exactly as it did before this feature.
- **SC-005**: Every table panel across every currently-published dashboard renders and behaves identically before and after this feature ships — zero authoring changes required, zero regressions found in a full re-check of existing published content.
- **SC-006**: Cell color-scale shading on every existing color-scaled table column matches its pre-feature appearance exactly, at any table size.

## Assumptions

This feature was preceded, in this same session, by real measurement and real, direct investigation of this codebase's own current behavior — captured here as the working assumptions this specification is built on, not re-derived from scratch, per the input's own explicit instruction.

- **Mode selection is fully automatic, not author-configured.** No new `dashboard-*.yaml` field is introduced for choosing between the small-table and large-table strategies. This matches this project's own repeated, already-established pattern for internal query/loading optimizations that need no author involvement (e.g., lazy, tab-scoped data loading; the recently-shipped column-visibility feature) — the system checks the real row count once and proceeds accordingly.
- **A real, direct survey of this app's own current `summarize.yaml`, done this session, found that every real table-bound metric is a grouped/aggregated result with no natural, unique, per-row identifier column** (the one real exception, a deliberately ungrouped one-row-per-person profile, feeds the Explore tab's open-ended tool, not a `table` panel). This means the deterministic ordering FR-006 requires cannot rely on an author-provided unique column existing — it must be constructed by the system itself, automatically, at query time, for every table, without requiring any change to how metrics are authored.
- **A real, direct test against this app's own production query engine, done this session, confirmed that its formatted-value search behavior (FR-005) is achievable, not merely a best-effort approximation** — the underlying engine's own string-formatting capability was confirmed, directly, to reproduce this app's existing display-formatting rules (thousands separators, percentages, sign-forcing) exactly. Search parity with today's "search what you can see" behavior is therefore treated as a firm requirement (FR-005), not a disclosed compromise.
- **Color-scale shading's author-specified range requirement (FR-007) is already how this feature's target component works today** — a real, direct code check this session confirmed a color-scaled column's value range is always author-specified already, never computed from fetched rows. This feature introduces no new risk here; it simply must not accidentally change that existing behavior.
- **Baseline-comparison ("diff") tables (FR-008) already resolve to a single, self-contained query before reaching the part of the system this feature changes** — a real, direct code check this session confirmed the existing comparison/baseline-resolution step already produces one complete query result regardless of whether a panel is an ordinary table or a diff table, meaning this feature's own paging/sorting logic does not need a separate code path for diff tables.
- **The exact row-count threshold (FR-010) is deliberately left as a real number to be determined, not guessed, before implementation.** This session's own direct measurement confirmed two real data points — at roughly 15,000 rows the two approaches are indistinguishable to a viewer, and at roughly 2,000,000 rows the difference is large and unmistakable — but did not measure the range in between. Picking a specific number without that intermediate measurement would be an unjustified guess; gathering it is treated as necessary follow-up work before implementation begins, not a decision this specification makes.
- **Correction, made during planning, to this assumption's own original form**: an earlier draft of this assumption expected "jump directly to the last page" to be lost for a large, query-driven table, reasoning by analogy from a real, different pagination technique measured earlier in this session (one keyed off a table's own naturally unique physical column). Direct measurement of the actual technique this feature uses — see `research.md` §2 — found response time stays flat regardless of *which* position a viewer jumps to, including the very last page, because the real cost is a fresh, fixed-cost pass over the whole table on every page request rather than a cost proportional to how deep the target position is. Combined with the table's total row count already being known (FR-001's own size check reads it), "jump directly to the last page" is fully supported for a large table too — not lost. There is, in the end, no pagination-control difference for a viewer to notice at all between a small and a large table — the same page-number-based controls work identically either way.
- **This feature is scoped to `TablePanel` only.** Column-visibility (a separate, already-shipped, already-client-side feature) is explicitly unaffected — it does not depend on how many rows are loaded. No other panel type's own query-building is touched.

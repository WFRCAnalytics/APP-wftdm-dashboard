# Contract: `services/sqlExpander.js`

Satisfies: FR-013 (via `yamlLoader.js`, consumed here), FR-014, FR-015,
FR-016, FR-017. Constitution Principle III (string replacement only, no
`eval()`).

## `expand(sqlTemplate: string, config: DashboardConfig, filterState: FilterState, activeScenarios: string[]): string`

Pure function (no I/O) — takes literal SQL text containing zero or more
placeholders and returns literal SQL text containing none, built entirely by
string substitution.

| Placeholder syntax | Behavior |
|---|---|
| `$mappings.<name>` | Looks up `config.raw.mappings[name]` (an object of `source: target`); expands to a sequence of `WHEN 'source' THEN 'target'` lines for use inside a surrounding `CASE ... END` written by the caller's SQL. |
| `$bins.<name>` | Looks up `config.raw.bins[name]`; builds an expression per its `type` — `manual_breaks` (full `CASE...END` over `column`/`breaks`/`labels`), `quantiles` (`NTILE(bins) OVER (ORDER BY column)` — field is `bins`, per `docs/GRAMMAR.md`'s documented syntax, not `n`), `spaced_intervals` (fixed-width bucket expression over `column`/`interval`/`lower`, no query-time computation needed), or `equal_intervals` (data-driven equal-width buckets computed from the column's actual min/max via window functions at query time — `column`/`n`/optional `labels`; distinct from `spaced_intervals`' fixed, config-known width). |
| `$sql.<name>` | Looks up `config.raw.sql_fragments[name]`; substitutes its literal text verbatim (already-authored SQL, e.g. a join chain). |
| `$filters.<id>` | Looks up `filterState.get(id)`. If the value is the `'all'` sentinel, the **entire filter condition** referencing it is omitted (the caller's SQL template is written so omission is syntactically valid — e.g. the condition sits after `WHERE 1=1 AND ...`). Otherwise substitutes the literal value. |
| `$scenario.<metric>` | **Concrete convention, resolved during implementation** (the original wording — bare `$scenario` reproducing a whole surrounding `SELECT` clause per scenario — wasn't specific enough to implement as pure string substitution without knowing the metric name, which `expand()`'s signature has no separate parameter for). Dot-suffixed like every other placeholder: expands to `UNION ALL`-joined `SELECT *, '{name}' AS scenario FROM "{name}__{metric}"` clauses, one per name in `activeScenarios` (already includes `observed` if it's active — the caller passes the resolved list, not this function). An empty `activeScenarios` array is treated as an error (throws, naming the reference), not an empty-but-valid expansion — see the invariant below. |

**Invariant: `activeScenarios` is never legitimately empty in this slice.**
Per `contracts/app-state.md`, `observed` is pinned and this slice has no
`scenarioManager.js` yet to let a user deactivate it — so by the time
anything calls `expand()` with a `$scenario.<metric>` reference,
`appState.getActive()` (the caller's source for `activeScenarios`) should
always include at least `observed`. An empty array reaching `expand()`
therefore indicates a bug upstream (most likely `discoverScenarios()` not
having completed yet), not a normal "nothing selected" UI state — `expand()`
throws rather than silently producing a `UNION ALL` of zero clauses. Revisit
this invariant if/when a future slice ever allows deactivating `observed`
itself; at that point an empty array may become a legitimate state this
function needs to handle differently.

- **Given** a template using all five placeholder kinds, **when** `expand()`
  runs against a config containing matching definitions, **then** the
  returned string contains zero occurrences of `$mappings.`, `$bins.`,
  `$sql.`, `$filters.`, or `$scenario.` (SC-004).
- **Given** `$filters.purpose` where `filterState.get('purpose') === 'all'`,
  **when** expanded, **then** the produced SQL has no `purpose = '...'`
  condition rather than one that matches nothing (FR-016).
- **Given** `$mappings.does_not_exist`, **when** expanded, **then** `expand()`
  throws an error whose message names `"mappings.does_not_exist"` specifically
  (FR-017) — never returns partially-expanded SQL silently.
- **Given** any input, **when** `expand()` runs, **then** it never calls
  `eval()`, `Function()`, or any dynamic-code-execution API — verified by a
  unit test asserting output is produced via string operations only
  (Principle III is testable as "no such call appears in this module's
  source," enforced by code review / lint rule, not a runtime assertion).

## Non-goals for this slice

- No SQL *validation* (syntax correctness) — expansion only. A downstream
  `query()` call surfaces any resulting SQL error.

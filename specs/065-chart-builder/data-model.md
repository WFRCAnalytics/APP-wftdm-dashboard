# Data Model: Chart Builder

All state is in memory for the session (`src/state/exploreState.ts`); persistence is the exported JSON file only.
Types below are conceptual; exact TypeScript lives in `src/charts/builder/spec.ts`.

## ColumnType

`'nominal' | 'ordinal' | 'quantitative' | 'temporal' | 'geo' | 'complex'`

## Column

| Field | Notes |
|---|---|
| name | exact column name (quoted in SQL) |
| dbType | DuckDB type string from `DESCRIBE` |
| inferred | `ColumnType` from `columnTypes.ts` |
| override | optional `ColumnType` chosen by the user (never `complex`) |
| effective | `override ?? inferred` |

Rules: `complex` columns are listed but not draggable.

## Relation (a chart data source)

| Field | Notes |
|---|---|
| id | `src:<scenario>__<metric>` for a source table, `xb_<slug>` for a My table |
| kind | `'source' \| 'mine'` |
| scenarios | scenario names the relation reads (for export/import remap) |
| sql | defining SELECT (source relations: `SELECT * FROM "<view>"`) |
| columns | `Column[]` |
| status | `'ready' \| 'broken'` (broken = defining SQL no longer describes) |
| materialized | `boolean` (TEMP TABLE vs TEMP VIEW) |

Rules: names are unique (case-insensitive); `xb_` prefix reserved; a My table cannot be named like a protected app view.

## QueryModel (query-builder form)

`select: ColumnRef[]`, `from: {relation} | join` (`left`, `right`, `type: inner|left|right|full`, `keys: [{l,r}]`),
`union: {scenarios[], addScenarioColumn: true}`, `where: Condition[]` (AND-list: column, op, value),
`groupBy: ColumnRef[]`, `aggregates: [{fn: sum|mean|median|min|max|count|distinct, column, as}]`, `orderBy`, `limit`.
Invariant: `astToModel(json_serialize_sql(modelToSql(m)))` equals `m` for every supported model (unit-tested).
`astToModel` returns `null` for anything else (CTE, window, subquery, CASE, set operations other than the scenario union).

## ChartSpec

See `contracts/chart-spec.md`. Key parts: `version`, `data`, `mark`, `encoding` (13 channels), `filter`, `scales`, `axes`,
`refLines`, `text` (four blocks, each `{text,size,weight,italic}`), `layout`.

## VizTab

| Field | Notes |
|---|---|
| id | stable in session |
| name | user-editable, unique |
| relationId | the tab's data source |
| spec | `ChartSpec` |
| undo / redo | bounded stacks of specs (cap 50) |

## ExploreSession (module state)

`browse: { scenarios: string[], table?: string }` (the raw-data pickers), `tabs: VizTab[]`, `activeTab: 'data' | tabId`,
`mine: Relation[]`, `dataTab: { sql, model | null, modelDetached: boolean, page, pageSize, running }`.

## SuggestionRule

`chart`, `dims: [min,max]`, `measures: [min,max]`, `required: ColumnType[]`, `cardinality?: {lo|hi}`, `score`, `reason`
(shown when not viable), `slots: { required: Channel[]; optional: Channel[] }`. Ranking = highest score among viable rules,
ties by fixed chart order.

## State transitions

- Relation: `ready → broken` (re-describe fails) `→ ready` (re-describe succeeds) or `→ deleted`.
- Data tab run: `idle → running → (done | error | cancelled | timed-out | refused) → idle`; at most one `running`.
- SQL ↔ form: `in-sync → detached` (text edited beyond the model) `→ in-sync` (text re-parses to a supported model).

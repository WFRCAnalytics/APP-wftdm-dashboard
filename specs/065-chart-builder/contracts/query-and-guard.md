# Contract: User queries, temp relations and the guard

## Execution path

`SqlPanel` → `explore/sql/runUserSql.ts` → `authorize(sql, 'read-only', protectedNames())` → (optional second opinion:
`json_serialize_sql` rejects non-SELECT) → mutex → `queryArrow()` from `services/duckdb.ts`. Never a second connection.

```ts
runUserSql(sql: string, opts: { page: number; pageSize: number; signal?: AbortSignal }): Promise<UserQueryResult>
type UserQueryResult =
  | { outcome: 'ok'; columns: {name: string; dbType: string}[]; rows: unknown[][]; hasMore: boolean }
  | { outcome: 'refused' | 'error'; reason: string; position?: number }
  | { outcome: 'cancelled' | 'timed-out' }
```

## Rules

1. **Read-only user SQL.** Only statements `authorize` classifies as read (SELECT, WITH, VALUES, FROM, TABLE, DESCRIBE,
   SHOW, SUMMARIZE). Anything else is `refused` with the guard's reason. The user never submits CREATE/DROP.
2. **Paging by wrapping**, never string-appending: `SELECT * FROM (<sql without trailing ;>) AS q LIMIT <n+1> OFFSET <m>`.
   One extra row detects `hasMore`. Row count is on request only (`SELECT count(*) FROM (<sql>)`). A warning shows when
   the query has no `ORDER BY` (unstable paging).
3. **Mutex.** One Data-tab run at a time. A second run request queues behind it. The UI shows "Running…" and, when other
   dashboard queries are in flight, "Shared with the dashboard".
4. **Cancel and timeout.** Cancel button and a 60 s timer both call `cancelRunning()`; outcome `cancelled` / `timed-out`.
5. **Save as My table** (app-generated DDL): `CREATE OR REPLACE TEMP VIEW "xb_<slug>" AS <authorized SELECT>` (default) or
   `CREATE OR REPLACE TEMP TABLE …` (materialize; warns with row count above 1,000,000). The select body must have passed
   rule 1 first. Slug = lowercase `[a-z0-9_]`, unique, ≤ 48 chars.
6. **Delete** only objects whose name starts with `xb_` and that appear in the session's `mine` list:
   `DROP VIEW|TABLE IF EXISTS temp."xb_…"`.
7. **Never shadow app views.** `xb_` is reserved; the slug may not equal any `protectedNames()` entry (case-insensitive).
8. **Describe** a query without creating it: `DESCRIBE <authorized SELECT>`; a relation: `DESCRIBE "<name>"`.
9. **Use in query** inserts, for one scenario, `SELECT * FROM "<scenario>__<metric>"`; for several, a `UNION ALL` of the
   same-named metric across scenarios with `'<scenario>' AS scenario` prepended. Only tables present in every selected
   scenario are offered for union; others show "missing in: …".
10. **Lazy registration.** Before running, `ensureRegistered(viewsReferencedBy(sql, buildCatalog()))` as `runSql` does.

## Changes to existing code (small, test-covered)

- `services/ai/sqlRunner.ts#resetSessionData`: skip objects whose name starts with `xb_` (they belong to the builder).
- `services/ai/catalog.ts#protectedNames()` (or the assistant's modify-mode call): include names starting `xb_` so the
  assistant cannot drop or replace My tables. Unit test on both.
- No change to `authorize` itself is required; if S1/S2 reveal a gap (for example bare-name file table functions), the
  fix is added to `sqlGuard.ts` with a test and benefits the assistant too.

## SQL ↔ form sync

`modelToSql(model): string` is deterministic (fixed formatting, identifiers quoted). `parseToModel(sql): Promise<
{model: QueryModel} | {detached: true; reason: string}>` calls `json_serialize_sql` then `astToModel()`. Supported subset:
projection of columns and aliased aggregates (`sum|avg|min|max|count|median|count(DISTINCT)`), `FROM` a single relation
or one/many joins on equality keys, an AND-list of simple comparisons/IN/BETWEEN/LIKE/IS NULL, `GROUP BY` columns,
`ORDER BY`, `LIMIT`, and a top-level `UNION ALL` of identical projections (the scenario union). Everything else →
`detached`. Fallback if spike S1 fails: embedded `-- builder:v1 {json}` marker, honoured only while the body matches
`modelToSql(model)`.

## Test obligations

Unit: guard refuses each of INSTALL, LOAD, ATTACH, COPY, SET, PRAGMA, remote URL, DROP, CREATE, multi-statement abuse;
accepts WITH/SELECT; `xb_` protected from the assistant; slug rules; paging wrapper strips trailing `;` and comments;
`astToModel` fixtures (one per supported construct plus 5 unsupported); round trip property. Playwright: run → cancel →
timeout path, save → appears → chart from it → delete.

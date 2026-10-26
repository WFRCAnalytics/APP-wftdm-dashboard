# Contract: SQL guard (`services/ai/sqlGuard.ts`)

A pure module (no DuckDB, no DOM) so it can be unit tested exhaustively.

```ts
type Permission = 'read-only' | 'modify'

authorize(sql: string, mode: Permission, protectedNames: ReadonlySet<string>): GuardResult
```

## Lexing

Single pass over the text producing tokens: `word`, `quotedIdent` (`"…"`, with `""` escapes), `string` (`'…'`, with `''` escapes; also `$$…$$`), `punct`, `semicolon`. `--` line and `/* */` block comments (nested allowed by DuckDB, treated as nested) are discarded. An unterminated string/comment/identifier → refused ("could not read the statement"). Statements are split on `semicolon` tokens; empty statements are ignored; more than 10 statements → refused.

## Classification (first word, case-insensitive; `EXPLAIN [ANALYZE]` classifies by the inner statement and `ANALYZE` makes it non-read)

| Kind | Verbs |
|---|---|
| read | `SELECT`, `WITH` (with no data-modifying keyword in its tokens), `VALUES`, `FROM`, `DESCRIBE`, `SHOW`, `SUMMARIZE`, `PRAGMA table_info / database_list / show_tables` |
| ddl | `CREATE`, `DROP`, `ALTER`, `TRUNCATE`, `RENAME`, `COMMENT` |
| dml | `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `COPY`, `EXPORT`, `IMPORT` |
| external | `INSTALL`, `LOAD`, `FORCE`, `ATTACH`, `DETACH`, `CALL`, `SET`, `RESET`, `PRAGMA` (other than the read ones above), `USE`, `CHECKPOINT`, `VACUUM` |
| other / unknown | anything else |

Rules, evaluated per statement; the first failure refuses the **whole** request and no statement runs:

| # | Rule | Read-Only | Modify |
|---|---|---|---|
| 1 | kind must be `read` | required | not required |
| 2 | kind `external` | refused | refused (INSTALL, LOAD, FORCE, ATTACH, DETACH; `SET`/`PRAGMA` that touch extensions or external access) |
| 3 | kind `other` (unknown verb) | refused | refused |
| 4 | any `string` token that starts with `http:`, `https:`, `s3:`, `gcs:`, `gs:`, `hf:`, `az:`, `r2:`, `file:` or looks like an absolute/UNC path (`/`, `\\`, `C:\`) | refused | refused |
| 5 | kind `ddl`/`dml` and any `word`/`quotedIdent` token (case-insensitive) equals a protected name | n/a | refused ("it would change a dashboard view") |
| 6 | `WITH` whose tokens contain `INSERT`, `UPDATE`, `DELETE`, `CREATE`, `DROP`, `COPY`, `ALTER` | refused | allowed |
| 7 | `CREATE` targeting a protected name even with `TEMP`/`TEMPORARY`/`OR REPLACE` | n/a | refused (rule 5 covers it; a temp object would shadow the dashboard view) |
| 8 | `SET`/`PRAGMA` of memory, threads or other engine settings | refused | refused (no DoS of the shared engine) |

Read-Only second opinion (performed by `sqlRunner`, not by the pure guard): for statements classified `read` whose verb is `SELECT`/`WITH`/`FROM`/`VALUES`, `SELECT json_serialize_sql('<stmt>')` must succeed; a parser error is not a refusal (the statement then simply fails or is run), but a returned tree whose top-level node is not a SELECT node is a refusal.

## Result

```ts
type GuardResult =
  | { allowed: true; statements: { text: string; kind: Kind; verb: string }[] }
  | { allowed: false; reason: string; statementIndex?: number }
```

`reason` is plain language shown to the viewer ("This statement changes data, and the assistant is in Read-Only mode. Switch to Modify in Settings → AI to allow it.").

## Unit test matrix (tests/unit/aiSqlGuard.test.ts)

Allowed in Read-Only: `select 1`, `WITH a AS (SELECT 1) SELECT * FROM a`, `FROM t SELECT x`, `DESCRIBE "s__m"`, `SHOW TABLES`, `PRAGMA table_info('t')`, `SELECT 'drop table x'`, `SELECT 1 -- ; DROP TABLE x`, `SELECT ';'`.

Refused in Read-Only: `DROP VIEW a`, `SELECT 1; DELETE FROM t`, `/* hi */ create table x as select 1`, `WITH a AS (DELETE FROM t RETURNING *) SELECT * FROM a`, `COPY t TO 'x'`, `INSTALL spatial`, `PRAGMA threads=1`, `EXPLAIN ANALYZE INSERT …`, `SELECT * FROM read_csv('https://x/y.csv')`, an unterminated string.

Modify: allowed `CREATE TEMP TABLE x AS SELECT 1`, `INSERT INTO x VALUES (1)`, `DROP TABLE x`, `COPY x TO 'out.csv'`; refused `INSTALL httpfs`, `LOAD spatial`, `ATTACH 'a.db'`, `DROP VIEW "baseline__trip_mode_share"`, `CREATE OR REPLACE TEMP TABLE baseline__trip_mode_share AS SELECT 1`, `DELETE FROM baseline__trip_mode_share`, `SELECT * FROM read_parquet('https://x/y.parquet')`.

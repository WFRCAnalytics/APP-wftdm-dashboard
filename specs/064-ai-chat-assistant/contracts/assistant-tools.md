# Contract: Assistant tools and loop (`services/ai/tools.ts`, `agentLoop.ts`)

## Tools given to the model

### `describe_tables`

Purpose: get column names and types for views it intends to query. Triggers lazy registration of their Parquet files.

```json
{ "name": "describe_tables",
  "parameters": { "type": "object", "required": ["names"],
    "properties": { "names": { "type": "array", "items": { "type": "string" }, "maxItems": 12,
      "description": "View names as listed in the catalogue, e.g. baseline__trip_mode_share" } } } }
```

Behaviour: map each name to `{scenario, metric}` from the catalogue (unknown names are returned as `not found`), `await ensureRegistered(pairs)`, then `DESCRIBE` each view. Result (both privacy modes, since this is schema): `{ tables: [{ name, columns: [{name, type}] }], notFound: [] }`.

### `run_sql`

Purpose: run SQL. One or more statements allowed by the current permission mode.

```json
{ "name": "run_sql",
  "parameters": { "type": "object", "required": ["sql"],
    "properties": { "sql": { "type": "string", "description": "DuckDB SQL. Quote view names with double quotes." } } } }
```

Behaviour:
1. `sqlGuard.authorize(sql, mode, protectedNames)`; if refused, return `{ ok:false, refused:true, reason }` and record a `refused` attempt (nothing runs).
2. Ensure any referenced catalogue views are registered (`ensureRegistered`), so a query that skips `describe_tables` still works.
3. Execute through `services/duckdb.ts` on the shared connection (row statements wrapped in `LIMIT 1001`).
4. Result to the model, shaped by privacy:

| Privacy | Result given to the model |
|---|---|
| `schema-only` | `{ ok:true, columns:[{name,type}], rowCount, truncated, note:"Row values are hidden from you; the user sees the table." }` |
| `schema-and-results` | the above plus `rows` (≤ 50 rows, ≤ 8 KB JSON, arrays of values; excess dropped with `note`) |

Errors: `{ ok:false, error:"<DuckDB message>" }` (the model may fix and retry).

The UI always receives the full capped result (≤ 1000 rows) for display, independent of what the model receives.

## System prompt content (assembled per question)

1. Role and scope: answer questions about the dashboard's data using DuckDB SQL.
2. Naming rule: views are `{scenario}__{metric}`; quote with double quotes; use `describe_tables` before first use of a view.
3. Catalogue: scenarios (label, kind, year, active/baseline) and metric names.
4. Current permission mode, in plain words, and that the app enforces it (refused statements return `refused`).
5. Privacy note matching the active mode (values hidden vs. visible).
6. Style: short answer, state which scenarios/tables were used, never invent numbers, say when data is missing, do not claim to have seen values hidden by the privacy mode.

## Loop (`agentLoop.run(question, ctx, signal, onStep)`)

```
turns += user(question)
for i in 1..6:
  step("Thinking")        -> completion = provider.complete(...)
  if no toolCalls: finish with completion.text
  for each toolCall (in order):
     step("Looking up tables" | "Running query")
     result = dispatch(toolCall)
     turns += assistant(toolCalls), tool(result)
if cap reached: finish with a message that the question needed too many steps, keeping attempts shown
```

- Abort: the signal aborts the `fetch`; the running DuckDB statement is cancelled via the `services/duckdb.ts` cancel helper; the run ends with `stopped: true`.
- Conversation memory: prior user/assistant text and tool calls are replayed for context, with old tool result rows dropped (kept: columns, rowCount) to limit tokens.
- Only one run at a time; sending is disabled while running.

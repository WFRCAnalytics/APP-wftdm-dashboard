# Research: AI Chat Assistant

Findings come from reading this repo (`services/duckdb.ts`, `services/tabDataLoader.ts`, `layout/settingsModal.tsx`, `layout/shell.tsx`, `state/protomapsSourceState.ts`, the constitution) and from the Dash (`app.dash.builders`) assistant settings the user pasted: provider choice (OpenAI, Ollama, Deepseek), API token, model, Read-Only default ("only SELECT, cannot modify data"), and a "Check and Save" action. Dash's own source and docs show no further AI detail (checked README, dash-ui repo page, dash.builders).

## 1. How to call providers

- **Decision**: plain `fetch`, no SDK. Two clients: OpenAI-compatible (`POST {base}/chat/completions`, covers OpenAI, Deepseek, Ollama's `/v1`, and any gateway) and Anthropic (`POST /v1/messages`).
- **Rationale**: constitution forbids casually adding libraries; both wire formats are small; testable by mocking `fetch`; no bundle growth.
- **Alternatives**: Vercel AI SDK / provider SDKs (bundle weight, browser-support quirks); WebLLM in-browser (heavy download, out of scope).
- **Browser access notes** (to verify at implementation):
  - Anthropic needs the header `anthropic-dangerous-direct-browser-access: true` for browser calls, plus `x-api-key` and `anthropic-version`.
  - OpenAI allows browser CORS with a bearer token.
  - Ollama needs `OLLAMA_ORIGINS` to include the page origin; the error text should say so.
  - Deepseek's browser CORS behaviour is not confirmed; the editable base URL (FR-005) is the fallback via a gateway. Surface a CORS-specific message when `fetch` throws `TypeError`.

## 2. Tool calling shape

- **Decision**: two tools. `describe_tables(names[])` and `run_sql(sql)`. The system prompt carries only the catalogue (scenarios, metric names, naming rule `{scenario}__{metric}`), never column data.
- **Rationale**: matches the lazy-loading design (`ensureRegistered` only for what the question needs). Columns come on demand from `DESCRIBE`, so the prompt stays small even with 100+ metrics.
- **Alternatives**: dump every schema in the prompt (forces loading every file at first message, large prompts); a single `run_sql` tool where the model runs `DESCRIBE` itself (works, but unregistered views would simply not exist yet, so `describe_tables` is needed to trigger lazy registration).
- Loop bound: at most 6 model round trips per question; SQL errors go back to the model as tool results so it can retry (FR-011).

## 3. Streaming

- **Decision**: non-streaming in v1; show step status lines ("Looking up tables", "Running query", "Writing answer") for visible progress.
- **Rationale**: one request/response parser per protocol instead of two SSE parsers with tool-call delta assembly; far simpler to unit test.
- **Alternative**: SSE streaming of the final text. Deferred; the loop's provider interface is `complete(messages, tools) -> {text, toolCalls}`, so it can be added without touching callers.
- Effect on the spec: SC-003's "first visible response within 3 s" is met by the status line, not by model text.

## 4. Enforcing Read-Only and Modify in code

- **Decision**: a pure `sqlGuard`:
  1. Scan the text once, dropping `--` and `/* */` comments and the contents of `'…'`, `"…"` literals (keeping identifier and literal tokens separately), then split on top-level `;`.
  2. Classify each statement by its first keyword (after optional `EXPLAIN`).
  3. Read-Only: allow only `SELECT`, `WITH`, `VALUES`, `FROM` (DuckDB's FROM-first form), `DESCRIBE`, `SHOW`, `SUMMARIZE`, `EXPLAIN` (of a read), `PRAGMA table_info`/`database_list`. `WITH` also must not contain a data-modifying statement (scan for `INSERT/UPDATE/DELETE/CREATE/DROP/COPY` keywords outside literals). Any failing statement rejects the whole request (FR-016).
  3b. As a second opinion for Read-Only, DuckDB's own parser: `SELECT json_serialize_sql(?)` succeeds only for plain SELECT trees; use it to confirm `SELECT/WITH` statements, so a tokenizer miss cannot allow a write.
  4. Modify: allow any type, but reject `INSTALL`, `LOAD`, `FORCE`, `ATTACH`, `DETACH`, `SET`/`RESET`/`PRAGMA` that change extension or external-access settings, `CALL` of install/load functions.
  5. Both modes: reject string literals that are URLs or remote paths (`http:`, `https:`, `s3:`, `gcs:`, `hf:`, `file:`) so the assistant cannot read non-Parquet or external data (constitution V) via `read_csv('https://…')` or `COPY … FROM`.
- **Protected names** (FR-018): the guard receives the set of every `{scenario}__{metric}` name the dashboard may register (from appState's scenarios and their metric catalogues, not only the already-registered ones). Any `DROP`, `ALTER`, `CREATE … OR REPLACE`, `CREATE [TEMP] TABLE/VIEW`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `RENAME` whose token stream includes a protected name is rejected. This also blocks a TEMP table shadowing a dashboard view (temp catalogue wins name lookup in DuckDB), which would silently change what panels show.
- **Rationale**: the user's rule is "enforced in code, not by prompt". A tokenizer is deterministic and testable; the DuckDB parser check adds defence in depth for Read-Only only (it cannot classify DDL).
- **Alternatives**: regex on the raw text (fooled by comments, strings, `;` in literals); relying on DuckDB `access_mode=READ_ONLY` (not applicable to the in-memory WASM database with registered views; also it would break session helper tables in Modify mode).

## 5. Reset session data

- **Decision**: `resetSessionData()` lists user-created objects (`information_schema.tables` / `duckdb_views()` / `duckdb_tables()`, minus protected and internal names) and drops them; then re-runs `CREATE OR REPLACE VIEW` through `services/duckdb.ts` for any protected view found missing (cannot normally happen, since the guard blocks it, but a safeguard).
- **Rationale**: protected views are views over read-only Parquet, so INSERT/UPDATE/DELETE on them can't succeed; the only "changes" that exist are user-created objects. Reset = drop those.
- Requires small additions to `services/duckdb.ts` (the sole owner of the connection): `cancelRunning()` (calls the connection's `cancelSent()`), and a helper that executes a statement list and returns an Arrow table with columns, so the assistant needs no second connection.

## 6. Previews and result sizing

- **Decision**: for `SELECT/WITH/FROM/VALUES`, wrap as `SELECT * FROM (<stmt>) LIMIT 1001`, show 1000 rows plus "more rows exist". Non-row statements (DDL, DESCRIBE, SHOW) run as-is. Rows sent to the model (Schema and results mode): at most 50 rows and 8 KB of JSON, otherwise truncated with a note.
- **Rationale**: caps browser memory and tokens; avoids a COUNT(*) double-run; statement wrapping is safe once the guard has classified the statement.
- The BIGINT-to-number conversion is already done by `castBigIntToDouble` in `initDuckDB()`, so rows serialize to JSON without a BigInt error.

## 7. Privacy mode and the "blind SQL" risk

- **Decision**: Schema only → tool results to the model carry `{ok, columns:[name,type], rowCount}` and no row values; the system prompt says values are hidden and the answer is the table beneath. Schema and results → rows (capped) are included.
- **Known risk**: with no values, the model cannot discover category spellings (e.g., a purpose or mode label), so first-try SQL may filter on a wrong string and return 0 rows. Mitigations: empty results are reported to the model (`rowCount: 0`) so it can retry with `ILIKE`/broader filters; the Settings note explains the trade-off. Treating distinct category labels as "schema" would be a policy choice for the user, so it is not built in; flagged as an open question.
- Ollama: still honours the setting, but the note says data stays on the machine.

## 8. Settings, token, and persistence rules

- **Decision**: `state/aiState.ts` is a plain module store with `subscribe/get/set` (like `state/basemapState.ts`), session-only. Token is never serialized into logs, `__debugQueryLog`, error text or chat messages (scrub the token substring from any error string).
- "Check and Save": OpenAI-compatible → `GET {base}/models` (Ollama's `/v1/models` also works); Anthropic → `GET /v1/models`. Verify the chosen model appears in the list when the list is returned; if the list works but the model is absent, report "model not found" and do not save. Network or CORS failure → specific message.
- Defaults: OpenAI `https://api.openai.com/v1` + `gpt-4.1` (Dash's default); Anthropic `https://api.anthropic.com` + `claude-sonnet-5-5`; Deepseek `https://api.deepseek.com` + `deepseek-chat`; Ollama `http://localhost:11434/v1` + `llama3.1` (must be a tool-capable model; documented).
- Defaults are placeholders the viewer can edit; they live in code, not config (constitution VII).

## 9. UI placement

- **Decision**: eager `ChatLauncher` (fixed bottom-right button, `z` below the Settings dialog's 60) rendered in `Shell`; lazy `ChatPanel` as a right-side sheet that overlays (not docks) so tile layouts and fill-height tabs are not reflowed; Esc closes, focus returns to the launcher. Below 760px it is full width.
- Chat state lives in `state/chatState.ts`, so it survives tab switches (the `DashboardRenderer` remounts per tab; the shell does not) and panel close/open.
- Assistant text is rendered as plain escaped text (no markdown/HTML), so model output cannot inject markup.
- **Alternative**: docked panel (shifts content, conflicts with `h-dvh` tabbed layouts); a sidebar tab (rejected by the user in favour of the floating button).

## 10. Testing approach

- Vitest unit: `sqlGuard` (table of allowed/refused statements including comment/string/`;` tricks and protected names), provider clients with mocked `fetch`, agent loop with a fake provider and fake runner (retry on error, iteration cap, abort, privacy shaping).
- Playwright: route `https://api.openai.com/**` (and the model's tool calls) with canned responses; assert the SQL and table appear against the real demo data, Read-Only refusal, Modify create-table then Reset, and that nothing is in `localStorage`/`sessionStorage` after a configured conversation.
- No live provider call in CI.

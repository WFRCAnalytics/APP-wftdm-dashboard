# Data Model: AI Chat Assistant

All state is in memory for the page session (no Web Storage). Types live in `src/state/aiState.ts`, `src/state/chatState.ts` and `src/services/ai/*`.

## AiSettings (`state/aiState.ts`)

| Field | Type | Rules |
|---|---|---|
| `provider` | `'openai' \| 'anthropic' \| 'deepseek' \| 'ollama'` | default `openai` |
| `baseUrl` | string | preset per provider; editable; must be `http(s)://` |
| `apiKey` | string | never logged or serialized; optional only for `ollama` |
| `model` | string | non-empty; preset per provider |
| `permission` | `'read-only' \| 'modify'` | default `read-only` |
| `privacy` | `'schema-only' \| 'schema-and-results'` | default `schema-only` |
| `status` | `'unconfigured' \| 'checking' \| 'ready' \| 'error'` | `ready` only after a successful Check and Save |
| `statusMessage` | string | last check outcome |

Draft vs saved: the form edits a draft; Check and Save copies draft to saved only on success (a failed check keeps the previous saved settings). `permission` and `privacy` apply immediately on change, since they carry no credential.

Transitions: `unconfigured → checking → ready | error`; editing provider/URL/key/model after `ready` leaves the saved settings active until the next successful check.

## Conversation (`state/chatState.ts`)

| Field | Type | Notes |
|---|---|---|
| `open` | boolean | panel visibility |
| `messages` | `ChatMessage[]` | ordered |
| `run` | `{ state: 'idle' \| 'running'; step?: string; abort?: AbortController }` | one run at a time |

`clear()` empties `messages`. Reload clears everything.

## ChatMessage

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `role` | `'user' \| 'assistant'` | |
| `text` | string | plain text; empty while only attempts exist |
| `attempts` | `QueryAttempt[]` | assistant only |
| `error` | string? | provider/network failure shown inline with Retry |
| `stopped` | boolean? | user stopped the run |

## QueryAttempt

| Field | Type | Notes |
|---|---|---|
| `sql` | string | exactly what was submitted |
| `outcome` | `'ok' \| 'refused' \| 'error' \| 'cancelled'` | |
| `reason` | string? | refusal or DuckDB error text |
| `columns` | `{name: string; type: string}[]` | |
| `rows` | `unknown[][]` | at most 1000 |
| `truncated` | boolean | more rows existed |
| `tables` | string[] | views referenced (best effort, for display) |
| `mode` | `'read-only' \| 'modify'` | permission in force when run |

## Catalogue (`services/ai/catalog.ts`, derived, never stored)

Built per question from `state/appState.ts` (active scenarios, each scenario's available metrics) plus `services/duckdb.ts#hasView`.

| Part | Content |
|---|---|
| Scenario list | name, label, kind, year, active/baseline flags |
| Metric names | per scenario, view name = `{scenario}__{metric}` |
| Loaded flag | whether the view is already registered |
| Columns | only after `describe_tables` (name, type) |

## ProtectedNames (derived)

The set of every `{scenario}__{metric}` view name the dashboard may register (all scenarios × available metrics, active or not), plus anything already in `listViews()`. Recomputed on every guard call, so scenarios added later are covered.

## GuardResult (`services/ai/sqlGuard.ts`)

`{ allowed: true, statements: ClassifiedStatement[] } | { allowed: false, reason: string, statementIndex?: number }`

`ClassifiedStatement = { text: string; kind: 'read' | 'ddl' | 'dml' | 'other'; verb: string }`

## Relationships

`Conversation 1—* ChatMessage 1—* QueryAttempt`; `QueryAttempt` is authorized against `AiSettings.permission` and `ProtectedNames`; result shaping for the provider depends on `AiSettings.privacy`.

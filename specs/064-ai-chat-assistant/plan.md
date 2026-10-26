# Implementation Plan: AI Chat Assistant

**Branch**: `064-ai-chat-assistant` | **Date**: 2026-10-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/064-ai-chat-assistant/spec.md`

## Summary

Add a bring-your-own-model assistant: a Settings → **AI** tab (provider, token, model, Read-Only/Modify, privacy) and a floating chat button that opens a side panel on every tab. The assistant runs a small tool-calling loop against the provider (`describe_tables`, `run_sql`), executes SQL on the app's one shared DuckDB-WASM connection, and answers in words with the query and a result table shown in chat.

Approach (details in [research.md](./research.md)):

- **No new dependencies.** Providers are called with plain `fetch`: one OpenAI-compatible client (OpenAI, Deepseek, Ollama, any gateway) and one Anthropic Messages client. Non-streaming v1, with per-step progress lines.
- **Permissions enforced in code**, by a pure statement guard (`sqlGuard.ts`) that tokenizes the SQL (strips comments and string literals, splits statements, classifies each) and, for Read-Only, also confirms with DuckDB's own parser. Modify mode blocks only extension/attach/external-URL access and any statement touching the dashboard's protected view names.
- **Session-only state** in plain module stores (`state/aiState.ts`, `state/chatState.ts`) read via `useSyncExternalStore`; nothing in Web Storage.
- **Lazy data**: the model gets a catalogue of scenarios and metric names up front; `describe_tables` calls `ensureRegistered()` for just the views it asks about.
- **Lazy UI**: the launcher is eager and tiny; the panel is `React.lazy()` so boot cost is unchanged.

## Technical Context

**Language/Version**: TypeScript (ES2022), React 19-era app as already configured

**Primary Dependencies**: none new. Existing: `@duckdb/duckdb-wasm` via `services/duckdb.ts`, shadcn-pattern UI primitives (`components/ui/*`), `lucide-react`, Radix

**Storage**: none persistent. Session-only module state (constitution VI)

**Testing**: Vitest unit (`tests/unit/`) for guard, provider clients, agent loop, catalogue; Playwright (`tests/integration/`) with provider traffic mocked through `page.route`

**Target Platform**: Browser (the deployed static app and `vite dev`)

**Project Type**: Web application (static front end; Python post-processor untouched)

**Performance Goals**: progress visible within 3 s of sending; no main-thread SQL; boot bundle unchanged (panel lazy-loaded)

**Constraints**: no `localStorage`/`sessionStorage`; DuckDB only via `services/duckdb.ts`; one shared connection (assistant SQL queues behind panel queries); Parquet-only data, so no external file/URL reads

**Scale/Scope**: ~10 new source files, 1 small change each to `services/duckdb.ts`, `state/settingsState.ts`, `layout/settingsModal.tsx`, `layout/shell.tsx`

## Constitution Check

*GATE: passed before Phase 0; re-checked after Phase 1.*

| Principle | Status | Note |
|---|---|---|
| I. TypeScript, React | Pass | `.ts` for services/state, `.tsx` for UI |
| II. DuckDB off main thread, one shared instance | Pass | All SQL via `services/duckdb.ts`; one small addition there (`cancelRunning`, `listUserObjects`-style helpers), no second instance or connection |
| III. No `eval()` / string-replacement SQL | Pass | Assistant SQL is user/model-authored text, validated by the guard, never built from YAML; no dynamic code execution |
| IV. YAML at runtime | Pass | untouched |
| V. Parquet-only browser I/O | Pass | guard blocks external URL/file reads in both modes |
| VI. Fixed tech; no Web Storage | Pass | no new UI/CSS/icon library; token and chat held in memory only |
| VII. Three config files | Pass | no new config file. Deployer defaults are out of scope (spec Assumptions) |
| VIII. Reference implementations | Pass | `gropaul/dash-ui` Assistant settings (provider, token, model, read-only) used as the UX reference |
| IX. Python/JS split | Pass | JS only |

No violations; Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/064-ai-chat-assistant/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── settings-ui.md
│   ├── provider-wire.md
│   ├── assistant-tools.md
│   └── sql-guard.md
├── checklists/requirements.md
└── tasks.md                # /speckit-tasks (not created here)
```

### Source Code (repository root)

```text
src/
├── services/ai/
│   ├── providers.ts        # provider presets + OpenAI-compatible and Anthropic clients (fetch, tool calling), checkConnection()
│   ├── sqlGuard.ts         # pure: tokenize, split, classify, authorize(mode, protectedNames)
│   ├── catalog.ts          # scenarios/metrics catalogue text + describe_tables (ensureRegistered + DESCRIBE)
│   ├── sqlRunner.ts        # guard -> duckdb query -> capped preview; reset session data
│   ├── tools.ts            # tool schemas + dispatcher (privacy-aware result shaping)
│   └── agentLoop.ts        # system prompt, bounded tool loop, abort, retries on SQL error
├── state/
│   ├── aiState.ts          # settings + session token; subscribe/get/set (not persisted)
│   └── chatState.ts        # conversation, panel open flag, run status; subscribe/get
├── hooks/
│   ├── useAiSettings.ts
│   └── useChat.ts
├── layout/
│   ├── settings/aiTab.tsx  # the Settings -> AI tab
│   └── chat/
│       ├── chatLauncher.tsx   # floating button (eager)
│       ├── chatPanel.tsx      # side panel (lazy)
│       ├── chatMessage.tsx    # message + query attempt (SQL, table, error)
│       └── resultTable.tsx    # capped result table
└── (edits) services/duckdb.ts, state/settingsState.ts, layout/settingsModal.tsx, layout/shell.tsx

tests/
├── unit/aiSqlGuard.test.ts, aiProviders.test.ts, aiAgentLoop.test.ts, aiCatalog.test.ts
└── integration/aiChat.spec.ts
```

**Structure Decision**: follow the existing layout (`services/` plain `.ts`, `state/` pub/sub stores, `hooks/`, `layout/` UI). AI logic sits in `services/ai/` so it stays framework-free and unit-testable; the UI only reads stores and calls `agentLoop.run()`.

## Complexity Tracking

No constitution violations to justify.

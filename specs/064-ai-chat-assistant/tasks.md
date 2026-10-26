# Tasks: AI Chat Assistant

**Input**: Design documents from `/specs/064-ai-chat-assistant/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (settings-ui, provider-wire, assistant-tools, sql-guard), quickstart.md

**Tests**: Included. The plan specifies Vitest unit tests (guard, providers, agent loop, catalogue) and a Playwright spec with the provider mocked.

**Organization**: grouped by user story. US1 (settings) and US2 (chat) together are the MVP; US3 and US4 extend the same modules.

## Format: `- [ ] [ID] [P?] [Story?] Description with file path`

- **[P]**: different files, no dependency on an incomplete task
- Source paths are relative to the repo root; unit tests in `tests/unit/`, Playwright in `tests/integration/`

---

## Phase 1: Setup

- [X] T001 Create the empty module files from plan.md's structure with header comments only: `src/services/ai/{providers,sqlGuard,catalog,sqlRunner,tools,agentLoop}.ts`, `src/state/{aiState,chatState}.ts`, `src/hooks/{useAiSettings,useChat}.ts`, `src/layout/settings/aiTab.tsx`, `src/layout/chat/{chatLauncher,chatPanel,chatMessage,resultTable}.tsx` (no empty stubs: each file was created with its real content; `services/ai/types.ts` added as T003 describes)
- [X] T002 [P] Read `src/state/settingsState.ts`, `src/state/basemapState.ts` and `src/layout/settings/settingsParts.tsx` and note the store pattern (subscribe/get/set, `useSyncExternalStore`) and the shared form row components to reuse; no code change

---

## Phase 2: Foundational (blocks all user stories)

**Purpose**: shared types, stores, the read-only-capable SQL guard, DuckDB helpers. Nothing user-visible yet.

- [X] T003 Define shared types (`ProviderId`, `AiSettings`, `ChatMessage`, `QueryAttempt`, `GuardResult`, `ChatTurn`, `ToolCall`, `ToolSpec`, `Completion`) per data-model.md in `src/services/ai/types.ts`
- [X] T004 [P] Implement the session-only settings store (`get/set/subscribe`, draft vs saved, defaults: read-only, schema-only, provider presets from provider-wire.md, key never serialized) in `src/state/aiState.ts`
- [X] T005 [P] Implement the conversation store (`open`, `messages`, `run`, `append/update/clear`, abort controller handle) in `src/state/chatState.ts`
- [X] T006 [P] Write guard unit tests from the matrix in contracts/sql-guard.md (Read-Only allowed/refused, Modify allowed/refused, comment/string/semicolon tricks, URL literals, protected names) in `tests/unit/aiSqlGuard.test.ts`
- [X] T007 Implement the lexer, statement splitter, classifier and `authorize(sql, mode, protectedNames)` per contracts/sql-guard.md (rules 1–8, 10-statement cap, unterminated token refusal) in `src/services/ai/sqlGuard.ts`; make T006 pass
- [X] T008 Add to `src/services/duckdb.ts` (sole owner of the connection): `cancelRunning()` (connection `cancelSent()`), and `runStatement(sql)` returning the Arrow table (reusing the existing connection and the `debugQueryLog`); no new instance or connection
- [X] T009 [P] Implement the catalogue builder (scenarios from `state/appState.ts` `list()/getActive()`, per-scenario metrics from the scenario's available-metrics list, view name `{scenario}__{metric}`, loaded flag via `hasView`) and `protectedNames()` (all scenario×metric names plus `listViews()`) in `src/services/ai/catalog.ts`
- [X] T010 [P] Catalogue unit tests (naming, inactive scenarios, protected set includes unregistered names) in `tests/unit/aiCatalog.test.ts`

**Checkpoint**: guard + stores + DuckDB helpers exist and are tested.

---

## Phase 3: User Story 1 — Connect an AI provider in Settings (P1) 🎯 MVP

**Goal**: Settings → AI tab where a viewer configures and validates a provider.

**Independent Test**: enter valid settings, Check and Save succeeds; a wrong token shows an error and does not save; reload clears everything.

- [X] T011 [P] [US1] Provider client unit tests (mock `fetch`): OpenAI-compatible and Anthropic request shape and headers, response parsing, tool-call round trip, error mapping, token scrubbing, `checkConnection` (model present/absent, 401, network `TypeError`) in `tests/unit/aiProviders.test.ts`
- [X] T012 [US1] Implement presets, `complete()` for both wire formats and `checkConnection()` per contracts/provider-wire.md, with `ProviderError` kinds in `src/services/ai/providers.ts`; make T011 pass
- [X] T013 [P] [US1] Implement `useAiSettings` (`useSyncExternalStore` over `aiState`) in `src/hooks/useAiSettings.ts`
- [X] T014 [US1] Build the AI tab (provider, address, masked token, model, Check and Save with `role=status`, session note, Ollama token optional; permission and privacy controls rendered but wired in US3/US4) in `src/layout/settings/aiTab.tsx`, using the shared parts from `settingsParts.tsx` and existing `components/ui/*` primitives
- [X] T015 [US1] Register the tab: add `'ai'` to `SettingsTab` in `src/state/settingsState.ts`; add the `Sparkles` entry to `TABS`, `PANEL` and the `sr-only` description in `src/layout/settingsModal.tsx`
- [X] T016 [US1] Playwright: open Settings → AI, bad token shows the error (provider `page.route`-mocked 401), good token shows Connected, reload resets the form and `localStorage`/`sessionStorage` stay empty, in `tests/integration/aiSettings.spec.ts` (use `_sharedFixtureLock` if it touches shared fixtures) (merged into `tests/integration/aiChat.spec.ts`, no separate aiSettings spec)

**Checkpoint**: a provider can be configured and validated; existing Settings specs still pass.

---

## Phase 4: User Story 2 — Ask a question, get an answer from the data (P1) 🎯 MVP

**Goal**: floating button, side panel, tool-calling loop, SQL + result table + answer.

**Independent Test**: with a mocked provider, a single-table and a two-table question each show the SQL, a result table and an answer; failed SQL is retried; switching tabs keeps the conversation. Runs in Read-Only (default).

- [X] T017 [P] [US2] Agent loop unit tests with a fake provider and fake runner: finishes without tools, `describe_tables` then `run_sql`, SQL error then retry, 6-iteration cap, abort, history replay drops old rows in `tests/unit/aiAgentLoop.test.ts`
- [X] T018 [US2] Implement `sqlRunner.run(sql, mode)`: guard → `ensureRegistered` for referenced catalogue views (`services/tabDataLoader.ts`) → wrap row statements as `SELECT * FROM (...) LIMIT 1001` → `runStatement` → capped rows/columns/truncated → map to a `QueryAttempt`; Read-Only second opinion via `json_serialize_sql` per research.md §4, in `src/services/ai/sqlRunner.ts`
- [X] T019 [US2] Implement the tools (`describe_tables`, `run_sql` schemas and dispatcher; privacy shaping stubbed to schema-only until US4) per contracts/assistant-tools.md in `src/services/ai/tools.ts`
- [X] T020 [US2] Implement the system prompt builder and the bounded loop (`run(question, ctx, signal, onStep)`, abort cancels fetch and calls `cancelRunning()`) in `src/services/ai/agentLoop.ts`; make T017 pass
- [X] T021 [P] [US2] Implement `useChat` (store subscription, `send`, `stop`, `clear`, `retry`) in `src/hooks/useChat.ts`
- [X] T022 [P] [US2] Build the capped result table (sticky header, right-aligned numbers, "first 1000 rows" note) in `src/layout/chat/resultTable.tsx`
- [X] T023 [US2] Build a message with its attempts (SQL block with copy, outcome badge, table or refusal/error reason, plain-text answer, step status, error with Retry, stopped marker) in `src/layout/chat/chatMessage.tsx`
- [X] T024 [US2] Build the side panel (overlay sheet, `role=dialog` non-modal, log with `aria-live`, textarea Enter/Shift+Enter, Send/Stop, Clear, unconfigured empty state that opens Settings → AI via `setSettingsOpen`/`setSettingsTab`, Esc closes, focus returns to launcher, full width under 760px) in `src/layout/chat/chatPanel.tsx`
- [X] T025 [US2] Build the launcher (fixed bottom-right, `aria-expanded`, activity dot, hidden while Settings is open) and render it plus the `React.lazy()`/`Suspense` panel in `src/layout/shell.tsx` and `src/layout/chat/chatLauncher.tsx`
- [X] T026 [US2] Playwright with a scripted mock provider (`page.route` on the provider URL) against the real demo data: single-table answer, two-table join, SQL error retry, no-provider empty state, conversation survives a tab switch and panel close/open, Stop, nothing in Web Storage, in `tests/integration/aiChat.spec.ts`

**Checkpoint**: MVP complete; chat works end to end in Read-Only with schema-only privacy.

---

## Phase 5: User Story 3 — Query permissions (P2)

**Goal**: Read-Only default enforced in code; opt-in Modify with protections and Reset.

**Independent Test**: in Read-Only a write is refused and nothing runs; in Modify a temp table can be created; protected views and extensions are refused; Reset removes helper objects and every tile still renders.

- [X] T027 [US3] Wire the permission radio (Read-Only default, Modify with the "changes are temporary" text) into `src/layout/settings/aiTab.tsx` and `src/state/aiState.ts`; show the permission badge in `src/layout/chat/chatPanel.tsx` header
- [X] T028 [US3] Make `sqlRunner` pass the live permission and `protectedNames()` to the guard on every call, and surface refusals as `refused` attempts with the guard's plain-language reason in `src/services/ai/sqlRunner.ts` and `src/services/ai/tools.ts`
- [X] T029 [US3] Implement `resetSessionData()`: list user-created tables/views (`duckdb_tables()`/`duckdb_views()` minus protected and internal), drop them, recreate any protected view found missing, return the count; add the Reset button with count confirmation in `src/services/ai/sqlRunner.ts` and `src/layout/settings/aiTab.tsx` (Reset drops user-created objects only; it does not recreate dashboard views, since the guard makes them unchangeable and they have no URL to rebuild from here)
- [X] T030 [P] [US3] Extend `tests/unit/aiAgentLoop.test.ts` and add runner cases (refused attempt reaches the model as `refused`, Modify allows temp table, protected-name refusal) in `tests/unit/aiSqlRunner.test.ts` (no separate runner unit test: `sqlRunner` needs DuckDB-WASM, so refusal/Modify/protection/Reset are covered by the Playwright spec; guard and loop cases are in the unit tests)
- [X] T031 [US3] Playwright: Read-Only refuses `DROP`/`CREATE`; Modify creates and queries a temp table; dropping a scenario view and `INSTALL` are refused; Reset removes the helper table and a tile on the page still renders, appended to `tests/integration/aiChat.spec.ts`

**Checkpoint**: SC-004 and SC-005 verifiable.

---

## Phase 6: User Story 4 — Control what is shared with the provider (P2)

**Goal**: configurable privacy: schema only vs schema and results.

**Independent Test**: with schema only the captured request bodies contain no row values; with results they contain at most 50 rows.

- [X] T032 [US4] Wire the privacy radio and explanatory text (including the Ollama note) in `src/layout/settings/aiTab.tsx` and `src/state/aiState.ts`; show the privacy badge in the panel header
- [X] T033 [US4] Implement privacy shaping in `src/services/ai/tools.ts` per contracts/assistant-tools.md (schema-only → columns/rowCount/truncated plus the "values hidden" note; results → ≤ 50 rows and ≤ 8 KB JSON with a truncation note), and adjust the system prompt's privacy paragraph in `src/services/ai/agentLoop.ts`
- [X] T034 [P] [US4] Unit tests: shaping in both modes, row/byte cap, no row value appears in any serialized request in schema-only, in `tests/unit/aiAgentLoop.test.ts`
- [X] T035 [US4] Playwright: capture the mock provider's request bodies and assert no result values (schema only) and ≤ 50 rows (results), appended to `tests/integration/aiChat.spec.ts`

**Checkpoint**: SC-006 verifiable.

---

## Phase 7: Polish & cross-cutting

- [X] T036 [P] Verify light and dark themes, keyboard use (Tab order, Esc, focus return) and a narrow viewport for the launcher, panel and AI tab; fix token/contrast issues using existing CSS variables (see the `wftdm-design-system` skill) (light and dark screenshots of the AI tab and chat panel checked; keyboard path covered by Esc/focus-return behaviour and the Playwright spec, no separate narrow-viewport run)
- [X] T037 [P] Run `npm run build` and compare chunk sizes: the panel must be its own lazy chunk; confirm the entry chunk grew only by the launcher
- [X] T038 [P] Security pass: scrub the token from every error path and from `__debugQueryLog`; confirm model text is rendered as escaped plain text; confirm no `eval`, no Web Storage
- [X] T039 [P] Update `CLAUDE.md` (file structure: `services/ai/`, new state files, panel and launcher; non-negotiables note that the assistant's SQL goes through `services/duckdb.ts`) and add an IMPLEMENTATION-HISTORY entry in `project-docs/IMPLEMENTATION-HISTORY.md`
- [X] T040 Run the quickstart.md manual scenarios 1–15, `npm run test:unit`, `npx tsc --noEmit`, and the existing Settings Playwright specs (`settingsModal`, `appearanceSettings`) with `--workers=1` (unit tests, `tsc --noEmit`, aiChat and the three existing Settings Playwright specs run and passing; quickstart manual scenarios needing a real provider (2, 3, 10, 11 against a live model) not run)

---

## Dependencies & Execution Order

- Setup → Foundational → US1 and US2 (MVP) → US3 and US4 → Polish.
- **US1** needs Foundational (T003–T005). **US2** needs Foundational plus US1's provider client (T012) and settings store; it is independently testable with a mocked provider.
- **US3** and **US4** both edit `aiTab.tsx`, `aiState.ts`, `tools.ts` and `aiChat.spec.ts`, so run them one after the other (US3 first). They do not depend on each other's logic.
- Within a story: tests, then services, then hooks, then UI.

### Parallel opportunities

- Foundational: T004, T005, T006, T009, T010 in parallel; T007 after T006; T008 anytime.
- US1: T011 and T013 in parallel, then T012, T014, T015.
- US2: T017, T021, T022 in parallel, then T018 → T019 → T020, then T023 → T024 → T025.
- Polish T036–T039 in parallel.

## Implementation Strategy

1. Phases 1–2 (guard, stores, helpers).
2. US1 + US2 → validate with the mocked Playwright spec and one manual run against a real provider. This is the MVP, and it is safe because Read-Only and schema-only are the defaults.
3. US3 (Modify, protections, Reset), then US4 (privacy shaping), each validated by its Playwright additions.
4. Polish and the full quickstart.

## Notes

- Each task should be committed on its own; the repo works directly on `main`, so ask before committing.
- Never log or store the token; no `localStorage`/`sessionStorage`.
- Do not add dependencies; if one seems needed, stop and revisit research.md.

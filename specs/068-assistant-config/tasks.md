---

description: "Task list for 068 assistant settings"
---

# Tasks: Assistant settings in dashboard-config.yaml

**Input**: Design documents from `/specs/068-assistant-config/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/assistant-config.md, quickstart.md

**Tests**: Included. The project's convention is unit tests for every pure `src/config` module and a Playwright spec per user-visible behaviour (as in 066 and 067).

**Organization**: Grouped by user story. The generated reference and JSON Schema are regenerated at the end of each story (`npm run docs:config`), because a unit test fails when they drift from the schema table.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1 provider list, default and locked address; US2 prompt note and limits; US3 mistakes and secrets reported

## Path Conventions

Single web-app project: `src/`, `tests/`, `scripts/`, `project-docs/` at the repository root. `src/config/` stays pure (relative imports, no `import.meta.env`, no `@/` alias, no DOM).

---

## Phase 1: Setup

- [X] T001 Confirm the baseline on branch `068-assistant-config`: `npx tsc --noEmit` and `npx vitest run` are green before any change, and run the existing assistant unit tests once (`npx vitest run tests/unit/ai`) so a later failure is ours

---

## Phase 2: Foundational (blocks all three stories; nothing user-visible changes)

**Purpose**: the pure rules, the runtime policy and the protocol field, so each story only adds its keys and wiring. After this phase the app behaves exactly as before.

- [X] T002 Create `src/config/assistant.ts` (pure): `PROVIDER_ID_PATTERN` (lowercase letters, digits, `-`, `_`, 1 to 40), `ASSISTANT_LIMITS` (round_trips 1 to 12 default 6, preview_rows 100 to 5000 default 1000, model_rows 1 to 200 default 50), `MAX_PROMPT_ADDENDUM = 2000`, `isSecretLikeKey(name)` (research.md decision 8), `cleanProviders(value)` returning `{ value, messages }` per research.md decision 9 (id required, well formed and unique, label default id, `base_url` via `isWebAddress`, `models` list of non-empty strings, `needs_key` default true, `protocol` `openai` default or `anthropic`, other fields reported, secret-like ones with the secrets message that never includes the value; a bad entry skipped; an empty or all-invalid list returns `undefined` with a message), and `checkDefault(settings, builtinIds)` (the default names a listed provider, or a built-in id when there is no list); export from `src/config/index.ts`
- [X] T003 [P] Unit tests `tests/unit/configAssistant.test.ts`: every `cleanProviders` rule (valid entry kept and normalised, each bad field reported with its index path, duplicate id keeps the first, all-invalid and empty give `undefined`, secret-like field refused without echoing its value), `isSecretLikeKey` (`key`, `api_key`, `apiKey`, `token`, `Secret`, `password`, `authorization` match; `keyboard`, `monkey`, `tokenizer` do not), `checkDefault` cases, and the bounds table
- [X] T004 Create `src/services/ai/assistantPolicy.ts` (module state, no React): the built-in catalogue (moved from `PROVIDER_PRESETS` in `src/state/aiState.ts`, each entry gaining `id`, `protocol` and `locked: false`), `configureAssistant(config)` (resolves the catalogue, `locked`, default provider and model, note and limits; invalid input falls back to the defaults), getters `getProviderCatalogue()`, `isLocked()`, `getPromptNote()`, `getLimits()`, `isAddressAllowed(url)` (a request URL must start with a listed base address followed by `/` or its end, trailing slashes trimmed; always true when not locked) and `resetAssistantPolicy()`; defaults equal today's constants. Unit tests `tests/unit/assistantPolicy.test.ts` (defaults, a configured list replaces the built-ins, locked address matching incl. look-alike hosts such as `https://llm.example.org.evil.com`, reset)
- [X] T005 Widen `ProviderId` to `string` and add `protocol: 'openai' | 'anthropic'` to `ProviderConfig` in `src/services/ai/types.ts`; make `src/services/ai/providers.ts` branch on `cfg.protocol` for the headers, the base address, the Messages client and the exact-model check (the Ollama error text and the Demo provider stay keyed on the ids `ollama` and `demo`); extend `tests/unit/aiProviders.test.ts` so every built-in still produces the same request as before and a custom id with `protocol: 'anthropic'` uses the Anthropic format
- [X] T006 In `src/state/aiState.ts` build the presets and the first draft from `getProviderCatalogue()` and the policy's default (keep `PROVIDER_PRESETS` exported as the built-in map for existing imports), carry `protocol` into the draft and saved config, add `getProviderPresets()` for the tab, and make `startDemo`/`endDemo` no-ops when the catalogue has no `demo` entry; add `tests/unit/aiState.test.ts` (built-in catalogue unchanged, a configured catalogue gives the right first draft, switching provider refills address, model and protocol, Demo is guarded)

**Checkpoint**: nothing user-visible yet; `npx vitest run` is green and the Settings assistant tab is as before.

---

## Phase 3: User Story 1 - A deployer offers only the providers their agency allows (Priority: P1) 🎯 MVP

**Goal**: `assistant.providers` and `assistant.default` replace the provider list, fix the address and choose the starting provider and model.

**Independent Test**: list one provider in the site file, open Settings, Assistant: only it is offered, its address is read-only, its models are suggested, the default is selected; remove the list and the tab is as today.

- [X] T007 [US1] Add the rows `assistant.providers` (`list`, site-only, `clean: cleanProviders`), `assistant.default.provider` and `assistant.default.model` (`string`, site-only) to `SETTINGS` in `src/config/schema.ts`, with descriptions
- [X] T008 [US1] Add `DashboardBranding.assistant` (`providers`, `default`, later `promptAddendum`, `limits`) in `src/services/yamlLoader.ts` and map the three rows in `src/config/toBranding.ts`; extend `tests/unit/configToBranding.test.ts`; extend `tests/unit/configValidate.test.ts` (a valid list kept, each bad entry reported with the `assistant.providers` path and skipped, an unknown protocol reported)
- [X] T009 [US1] Call `configureAssistant(branding.assistant, { enabled })` once at boot in `src/main.tsx`, after `setAssistantEnabled`, before the first render
- [X] T010 [US1] In `src/services/ai/providers.ts#send` refuse a request whose URL is not allowed by `isAddressAllowed` (when locked) with `ProviderError('bad-request', 'This address is not allowed by the dashboard configuration.')` before `fetch`; unit tests in `tests/unit/aiProviders.test.ts` (an allowed address passes, another address and a look-alike host are refused and `fetch` is never called, nothing is refused when not locked)
- [X] T011 [US1] Update `src/layout/settings/aiTab.tsx`: list `getProviderPresets()` in order, show a locked provider's address read-only (not editable, still visible), hide the token field when `needsKey` is false, preselect the default provider and model when Settings opens, offer "Try the demo" only when the catalogue has `demo`, and keep everything identical when no list is set; check `src/layout/chat/chatPanel.tsx` for its use of `startDemo` and its `openSettings('ai')` button
- [X] T012 [US1] Make `saveDraft` and `setDraftProvider` in `src/state/aiState.ts` respect the lock: a draft whose address is not a listed provider's is not saved (the tab shows the refusal message); unit test in `tests/unit/aiState.test.ts`
- [X] T013 [P] [US1] Playwright spec `tests/integration/assistantConfig.spec.ts` (project `chromium`, `_siteConfig.ts` helpers, provider calls mocked with `page.route`): no list gives today's providers and an editable address; a list shows only the listed providers in order, the address field is read-only, suggested models are in the picker and another name can be typed, `needs_key: false` shows no token field, the default is selected; a Check and Save to a listed provider sends the OpenAI-compatible request (and the Anthropic one for `protocol: anthropic`), and no request ever goes to another address
- [X] T014 [US1] Run `npm run docs:config` and commit the regenerated `project-docs/CONFIG-REFERENCE.md` and `project-docs/dashboard-config.schema.json`

**Checkpoint**: US1 delivers a locked-down, deployer-chosen provider list. This is the MVP.

---

## Phase 4: User Story 2 - A deployer gives the assistant local context and tunes its limits (Priority: P2)

**Goal**: `assistant.prompt_addendum` and `assistant.limits` take effect.

**Independent Test**: set a note and lower each limit, run the agent loop against a fake provider, and see the note in the instructions and each limit honoured.

- [X] T015 [US2] Add the rows `assistant.prompt_addendum` (`string`, site-only, `check`: at most `MAX_PROMPT_ADDENDUM` characters, longer is reported and dropped) and `assistant.limits.round_trips`, `assistant.limits.preview_rows`, `assistant.limits.model_rows` (`integer`, site-only, `check`: within `ASSISTANT_LIMITS`) to `src/config/schema.ts`
- [X] T016 [US2] Map `promptAddendum` and `limits` in `src/config/toBranding.ts` and `DashboardBranding.assistant`; make `configureAssistant` store them; extend `tests/unit/configToBranding.test.ts`, `tests/unit/configValidate.test.ts` (each limit in and out of bounds, a 2000 and a 2001 character note) and `tests/unit/assistantPolicy.test.ts`
- [X] T017 [US2] In `src/services/ai/agentLoop.ts` read the round-trip limit from `getLimits()` (keep the exported `MAX_ROUND_TRIPS` as the default), make the privacy sentence use the configured row count, and append the note last in `buildSystemPrompt` (a blank line, `LOCAL CONTEXT (from the dashboard's deployer):`, the text); extend `tests/unit/aiAgentLoop.test.ts` (stops after the configured steps and says so, the note is last and the built-in text is untouched, no note when unset)
- [X] T018 [US2] Read the preview cap from `getLimits()` in `src/services/ai/sqlRunner.ts` (the query `LIMIT` and the truncation flag), the shared row count in `src/services/ai/toolSchema.ts#shapeForModel` (keep `MODEL_BYTE_LIMIT`), and the truncation sentence in `src/layout/chat/resultTable.tsx`; make the privacy help text in `src/layout/settings/aiTab.tsx` show the configured number; extend `tests/unit/aiAgentLoop.test.ts` (shape never exceeds the configured rows)
- [X] T019 [P] [US2] Playwright cases in `tests/integration/assistantConfig.spec.ts`: the privacy help shows the configured row count; with the gateway mocked to return one `run_sql` call then an answer, the model request contains the note and the configured number of rows; the note text appears nowhere in the chat
- [X] T020 [US2] Run `npm run docs:config` and commit the regenerated reference and JSON Schema

**Checkpoint**: US1 + US2 both work and each can be shipped alone.

---

## Phase 5: User Story 3 - A deployer is told about mistakes, and secrets are refused (Priority: P2)

**Goal**: every mistake in the block is reported in the note and by `check`, and a secret-like field is never read or echoed.

**Independent Test**: load a config with one of each mistake; the app loads, each setting is at its default, each problem is listed once with its path, and the secret's value appears nowhere.

- [X] T021 [US3] In `src/config/validate.ts` report an unknown key whose last path segment is secret-like (`isSecretLikeKey`) as `not_allowed_here` with "secrets are not configuration; viewers enter their own token" (the value is never included); declared rows such as `basemap.protomaps.api_key` are unaffected; unit tests in `tests/unit/configValidate.test.ts` (names `api_key`, `token`, `Password`, `authorization` under `assistant` and at the top level; the message never contains the value; `basemap.protomaps.api_key` still valid)
- [X] T022 [US3] Report the default naming an unlisted provider (`checkDefault`) in `src/services/siteConfig.ts#loadSite` (through `addProblems`) and in `src/config/check.ts#checkSite`, and make `configureAssistant` fall back to the first listed provider; extend `tests/unit/configCheck.test.ts` (default naming an unlisted provider, an empty list, a list with no valid entry, a secret-like field with its value absent from every problem text, exit-worthy problems listed once)
- [X] T023 [P] [US3] Playwright cases in `tests/integration/assistantConfig.spec.ts`: a config with an unknown protocol, a duplicate id, a limit out of range, a default naming an unlisted provider and `api_key: SECRET-123` loads; the note lists each path; `SECRET-123` is in neither the page text nor the console; the built-in providers are shown when no entry is valid; the valid entries still work when only some are bad
- [X] T024 [US3] Run `npm run docs:config` and commit the regenerated reference and JSON Schema

**Checkpoint**: all three stories work independently.

---

## Phase 6: Polish & cross-cutting

- [X] T025 [P] Update `project-docs/CONFIGURATION.md` (Phase D step 9 done with the 068 key shapes; step 10, the network block, still open and undesigned; section 4's draft matches the built keys incl. `protocol`), `project-docs/GRAMMAR.md` (the `assistant:` block), `CLAUDE.md` (the AI assistant section: the keys, the policy module, the lock and its limit, the secrets rule) and add a "068 assistant settings" entry to `project-docs/IMPLEMENTATION-HISTORY.md`
- [ ] T026 Confirm FR-014 (no new key set, nothing changes) and FR-009 (the SQL guard untouched): `npx tsc --noEmit`, `npx vitest run`, then the full Playwright run (`npx playwright test --reporter=line`); compare failures with the known ones in `CLAUDE.md` (`realDemo.spec.ts:19` and `:39`, `chartMaps:95`, load flakes) and re-run any other with `--workers=1` first, especially `aiChat.spec.ts` and the settings specs
- [ ] T027 Walk `quickstart.md` by hand (steps 2, 3 and 5 against the dev server and `npm run check`) and note the result at its foot
- [ ] T028 Rebuild `docs/` with `npm run build:pages` only after the user asks

---

## Dependencies and order

- Phase 1 → Phase 2 → the stories. T003 follows T002; T005 and T006 follow T004.
- **US1** depends on Phase 2. T007 and T008 first; T009 follows T008; T010 follows T004/T005; T011 follows T006 and T009; T012 follows T010 and T011; T013 follows T011.
- **US2** depends on Phase 2 only, but T015 to T018 edit files US1 also edits (`schema.ts`, `toBranding.ts`, `aiTab.tsx`, `main.tsx` is not touched again), so do them after US1 or merge carefully.
- **US3** depends on Phase 2 and on the rows of US1 (T021 needs no row; T022 needs `assistant.default`).
- Polish depends on the stories you ship.
- The three stories can otherwise proceed in any order after Phase 2; US1 is the MVP.

## Parallel examples

- Phase 2: T003 alongside T004 (different files) once T002 is done.
- US1: T013 once T011 is done.
- US2: T019 once T018 is done.
- US3: T023 once T022 is done.
- Polish: T025 alongside T026.

## Implementation strategy

1. **MVP = Phase 1 + 2 + US1**: a deployer's provider list, default and locked address work, and the generated reference knows them. Stop and verify with quickstart steps 2 and 3.
2. Add **US2**, then **US3**, each ending with the regenerated reference.
3. Polish, then merge to `main` when asked; rebuild `docs/` only when asked.

## Notes

- `CONFIG-REFERENCE.md` and `dashboard-config.schema.json` are generated; never hand-edit them (`npm run docs:config`).
- Nothing is built for the `network` block (undesigned; its own later spec).
- The `src/config` modules must stay pure; a Node `check` run is the quick proof that they are.
- A token or other secret must never reach the note, the console, `check` output or any message: tests assert this with a sentinel value.
- Shell note: heredocs containing apostrophes break in the Bash tool here; write files with the Write tool.

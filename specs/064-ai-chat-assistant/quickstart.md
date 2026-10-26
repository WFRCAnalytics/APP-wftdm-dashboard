# Quickstart: validating the AI Chat Assistant

## Prerequisites

- `npm install`, then the real demo data is served by the default dev server (`npm run dev`); the redesign/legacy fixtures are used by Playwright projects.
- For manual checks with a real model: an OpenAI/Anthropic/Deepseek key, or a local Ollama with a tool-capable model and `OLLAMA_ORIGINS` including the dev origin.

## Automated

```bash
npm run test:unit -- aiSqlGuard aiProviders aiAgentLoop aiCatalog
npx playwright test tests/integration/aiChat.spec.ts --workers=1
```

Playwright mocks the provider with `page.route` (no network, no key). Expected: all green.

## Manual validation scenarios

| # | Steps | Expected | Spec |
|---|---|---|---|
| 1 | Open the dashboard on any tab | A floating AI button is visible; clicking it opens the panel; the panel says the assistant isn't set up and links to Settings → AI | FR-006, FR-014 |
| 2 | Settings → AI, choose a provider, enter a wrong token, Check and Save | Clear "token rejected" message; status is not Ready | FR-003 |
| 3 | Enter a valid token and model, Check and Save | "Connected"; Read-Only and Schema only are selected | FR-001, FR-015, FR-021 |
| 4 | Ask a single-table question ("share of transit trips by purpose in the baseline") | Progress lines, then an answer with the SQL and a result table | FR-008, FR-010 |
| 5 | Ask a question needing two metrics joined | Answer, with a SQL block that joins both views | FR-008 |
| 6 | Ask the assistant to "delete all rows" / "create a table" in Read-Only | A refused attempt with an explanation; nothing runs | FR-016 |
| 7 | Switch to Modify; ask it to create a temp table of the result, then query it | Succeeds | FR-017 |
| 8 | In Modify, ask it to drop a scenario view, or to install an extension | Refused; dashboard panels unchanged | FR-017, FR-018 |
| 9 | Press Reset session data | The helper table is gone; every tile still renders | FR-019 |
| 10 | With Schema only, inspect the provider request body in dev tools | No result values in any `tool` message; the user still sees the table | FR-022 |
| 11 | Switch to Schema and results, ask again | Request includes up to 50 rows | FR-021, FR-023 |
| 12 | Switch tabs, close/reopen the panel | Conversation is still there; Clear empties it | FR-012 |
| 13 | Press Stop during an answer | The run ends, the message is marked stopped, panels still work | FR-007 |
| 14 | Reload the page | Token, settings and conversation are gone; `localStorage`/`sessionStorage` are empty | FR-004, SC-007 |
| 15 | Toggle light/dark theme and a narrow viewport | Launcher, panel and AI tab remain legible and usable by keyboard | FR-025 |

## Performance check

On the largest demo tab, with the panel open, switch tabs and confirm no visible slowdown; the initial page bundle should not grow by more than the launcher (the panel is a separate lazy chunk). Check with `npm run build` and the chunk listing.

## Regression check

`npm run test:unit` and the existing Playwright specs for the Settings modal (`settingsModal`, `appearanceSettings`) still pass, since a fifth tab was added to the Settings rail.

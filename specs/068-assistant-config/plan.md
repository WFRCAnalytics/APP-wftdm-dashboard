# Implementation Plan: Assistant settings in dashboard-config.yaml

**Branch**: `068-assistant-config` | **Date**: 2026-10-28 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/068-assistant-config/spec.md`

## Summary

Extend the site configuration with the rest of the `assistant` block: a deployer's provider list (replacing the built-ins), a default provider and model, a prompt note and three limits. Everything new is a row in the one schema table (`src/config/schema.ts`), so the generated reference, the JSON Schema, `validate` and `check` pick it up. The rules a row cannot express alone (each provider entry's fields, unique ids, the default naming a listed provider, secret-like names) live in one pure module, `src/config/assistant.ts`, which the schema rows, `loadSite` and `checkSite` all call.

In the app, a small **policy module** (`src/services/ai/assistantPolicy.ts`, plain module state like `assistantAvailability.ts`) holds what boot resolved: the provider catalogue (the deployer's list or the built-ins), whether the address is locked, the prompt note and the limits. The existing assistant code reads it instead of constants: `state/aiState.ts` builds its presets and first draft from the catalogue; `services/ai/providers.ts` branches on a new `protocol` field instead of the provider id and refuses any address that is not a listed provider's when the list is set; `agentLoop.ts`, `sqlRunner.ts`, `toolSchema.ts` and `resultTable.tsx` take the three limits; `buildSystemPrompt` appends the note. The Settings assistant tab shows the catalogue, locks a listed provider's address (read-only) and hides the token field for `needs_key: false`.

No key or token setting exists. Unknown, key-like names (`api_key`, `token`, `secret`, `password`, `authorization`) are reported as "not allowed" without echoing their values, anywhere in the file (the one defined exception, `basemap.protomaps.api_key`, is a declared row).

## Technical Context

**Language/Version**: TypeScript (ES2022 target), React 18

**Primary Dependencies**: none new

**Storage**: Static files fetched at runtime; no Web Storage (the viewer's token stays in-memory session state as today)

**Testing**: Vitest for the pure config module, the policy module, the agent loop with limits, the provider guard and the aiState catalogue; Playwright (`chromium` project) for the Settings tab with a deployer list, with the provider network calls mocked through `page.route`

**Target Platform**: Browser plus Node (`check`, the boot-skeleton plugin) through the pure `src/config` modules

**Project Type**: Web app (static SPA)

**Performance Goals**: No extra request; the chat's round trips and preview size are only bounded further, never raised past the documented maxima

**Constraints**: `src/config` stays pure (relative imports, no `import.meta.env`, no `@/` alias, no DOM); a deployment that sets none of the new keys behaves exactly as before (FR-014); a wrong value never blocks boot; the SQL guard, the Read-Only/Modify modes and the privacy choice are untouched (FR-009); a token or other secret never appears in the note, the console, `check` output or any message

**Scale/Scope**: ~12 new schema rows (`assistant.providers`, `assistant.default.{provider,model}`, `assistant.prompt_addendum`, `assistant.limits.{round_trips,preview_rows,model_rows}`) plus the changes in 9 existing assistant files and 2 new modules

## Constitution Check

*GATE: passes. Re-checked after Phase 1.*

| Principle | Status |
|---|---|
| I TypeScript throughout | Pass |
| III No eval | Pass: the note is plain text, no placeholders interpreted |
| IV YAML parsed at runtime | Pass |
| VI Fixed technology choices / no Web Storage | Pass: no dependency, no storage; the token stays session-only |
| VII Minimal fixed config file set (2.8.0) | Pass: new keys in `dashboard-config.yaml`; the deployer's file never holds a secret (section 7) |
| X Delivery targets | Pass: plain YAML, one pure schema, validation shared with `check` |
| AI assistant (064 non-negotiables) | Pass: SQL still authorized by `sqlGuard.authorize()` and run through the one shared connection; no second connection; no new dependency |
| Security | Pass: provider addresses are `http`/`https` only; with a list set the address is fixed and refused otherwise; secret-like keys are rejected unread and unechoed |

No violations, so no Complexity Tracking entries.

## Project Structure

### Documentation (this feature)

```text
specs/068-assistant-config/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── assistant-config.md
└── tasks.md                     # /speckit-tasks
```

### Source Code (repository root)

```text
src/config/
├── assistant.ts         # NEW, pure: cleanProviders(), checkDefault(), ASSISTANT_LIMITS (bounds), MAX_ADDENDUM, isSecretLikeKey()
├── schema.ts            # + rows: assistant.providers (clean), assistant.default.{provider,model}, assistant.prompt_addendum, assistant.limits.*
├── validate.ts          # unknown key that looks like a secret -> not_allowed_here with the secrets message (value never echoed)
├── toBranding.ts        # + DashboardBranding.assistant { providers, default, promptAddendum, limits }
├── check.ts             # + cross-key problems (default names an unlisted provider)
└── index.ts

src/services/siteConfig.ts          # + the same cross-key check, through addProblems
src/services/yamlLoader.ts          # DashboardBranding.assistant
src/services/ai/
├── assistantPolicy.ts  # NEW: catalogue, locked flag, note, limits; configureAssistant(), getters, isAddressAllowed()
├── types.ts            # ProviderId widens to string; ProviderConfig gains protocol
├── providers.ts        # branch on protocol, not id; refuse a non-listed address when locked
├── agentLoop.ts        # round trips and the prompt note/row count from the policy
├── sqlRunner.ts        # preview rows from the policy
└── toolSchema.ts       # model rows from the policy
src/state/aiState.ts    # presets and first draft from the catalogue; endDemo/startDemo guarded when Demo is not offered
src/layout/settings/aiTab.tsx   # catalogue list, locked address, token field only when needed, dynamic "up to N rows" text
src/layout/chat/resultTable.tsx # truncation text from the policy
src/main.tsx                    # configureAssistant(branding.assistant) at boot

tests/unit/
├── configAssistant.test.ts     # NEW
├── assistantPolicy.test.ts     # NEW
├── configValidate.test.ts      # (extended: secret-like names, new rows)
├── configToBranding.test.ts    # (extended)
├── configCheck.test.ts         # (extended)
├── aiAgentLoop.test.ts         # (extended: limits, note)
├── aiProviders.test.ts         # (extended: protocol, locked address)  [name per existing file]
└── aiState.test.ts             # (extended: catalogue) [name per existing file]
tests/integration/assistantConfig.spec.ts   # NEW (chromium project)
project-docs/CONFIG-REFERENCE.md, dashboard-config.schema.json   # regenerated (`npm run docs:config`)
```

**Structure Decision**: single web-app project as in 066 and 067. Pure rules in `src/config`, one small policy module beside the assistant services, wiring in the existing assistant files, nothing outside them.

## Phase 0: Research

See [research.md](research.md). Decisions: one pure `assistant.ts` shared by the schema, the loader and `check`; the policy module as the single runtime source; `protocol` replaces id-based branching; the address guard sits in the provider client's `send`; limits are read where used with the old constants kept as defaults; the note is appended last; secret-like names rejected generically in `validate`; a provider list that has no valid entry falls back to the built-ins.

## Phase 1: Design

- [data-model.md](data-model.md): the provider entry, the resolved policy and the problem catalogue.
- [contracts/assistant-config.md](contracts/assistant-config.md): the YAML keys, accepted values, defaults and every reported problem.
- [quickstart.md](quickstart.md): end-to-end validation.

Constitution re-check after design: unchanged, still passes.

## Complexity Tracking

None.

# Research: Assistant settings in dashboard-config.yaml

Decisions taken before design. Each lists the choice, why, and what was rejected.

## 1. One pure module for the assistant rules

**Decision**: `src/config/assistant.ts` holds everything a schema row cannot express alone: `cleanProviders(value)` (per-entry validation, normalisation, uniqueness), `checkDefault(settings)` (the default names a listed provider), the limit bounds, the note maximum and `isSecretLikeKey(name)`. The schema rows call the first through the existing `clean` hook; `loadSite` and `checkSite` call the second.

**Why**: the 067 `clean` hook already exists for "keep the usable part and report the rest", and `check` must run the same rules as the app (CONFIGURATION.md principle 8).

**Rejected**: validating inside the Settings tab: the problem would not reach the note, `check`, the JSON Schema or the reference.

## 2. The cross-key check is not a row hook

**Decision**: "the default names a listed provider" needs two keys, so it is a function (`checkDefault`) called after `validate`, the way 067 reports `header.docs` without `docs.url`.

**Why**: `validate` stays single-key and pure; no new hook shape.

## 3. A runtime policy module

**Decision**: `src/services/ai/assistantPolicy.ts` is plain module state set once at boot by `configureAssistant()`, read through getters (`getProviderCatalogue()`, `isLocked()`, `getPromptNote()`, `getLimits()`, `isAddressAllowed(url)`). Defaults equal today's constants (6, 1000, 50, no note, built-in catalogue).

**Why**: the same pattern as `assistantAvailability.ts` and `settingsState.configureSettingsTabs`; the services (`providers.ts`, `agentLoop.ts`, `sqlRunner.ts`, `toolSchema.ts`) must not import React state, and `aiState` can import the policy. Tests configure and reset it.

**Rejected**: threading the values through every function signature (the agent loop, runner and shaper are called from several places); reading the config inside each service (they would depend on the loader).

## 4. `protocol` instead of provider-id branching

**Decision**: `ProviderId` widens from the closed union to `string`; `ProviderConfig` gains `protocol: 'openai' | 'anthropic'`. `providers.ts` uses `protocol` for headers, base address, the Messages client and the exact-model check; the Ollama error text and the Demo provider stay keyed on the built-in ids `ollama` and `demo`.

**Why**: a deployer's provider has an arbitrary id but must use one of the two existing clients (spec FR-005). Today's behaviour is preserved because the built-ins carry the matching protocol.

**Rejected**: a third client or a plug-in format: out of scope.

## 5. The address guard

**Decision**: in `providers.ts#send`, before `fetch`, when the policy is locked and `isAddressAllowed(url)` is false, throw `ProviderError('bad-request', 'This address is not allowed by the dashboard configuration.')`. `isAddressAllowed` compares the request URL against each listed `base_url` (trailing slashes trimmed): the URL must start with the base followed by `/` or end. The Settings tab also makes the field read-only and `setDraftProvider` fills the listed address.

**Why**: one choke point covers `checkConnection`, `complete` and any future call; the UI lock alone could be bypassed by a stale draft.

**Honest limit**: this is a client-side guard; anyone with developer tools can bypass client code. It protects viewers from a mistaken or misleading form, not from a hostile browser extension. The spec's wording (no way within the page) is met; the contract says so.

## 6. Where the limits are read

**Decision**: each limit is read at its use site from `getLimits()`: the loop count in `runAgent`, the preview cap in `sqlRunner` (query `LIMIT` and the truncation flag), the shared row count in `shapeForModel` and the prompt text, and the truncation sentence in `resultTable.tsx`. The exported constants stay as the defaults so existing tests keep working. `MODEL_BYTE_LIMIT` (8 KB) is not configurable: with a high `model_rows` it may cut a result sooner, which the model is already told.

## 7. The prompt note

**Decision**: `buildSystemPrompt` gains the note as a final section: a blank line, `LOCAL CONTEXT (from the dashboard's deployer):`, then the text, after the STYLE paragraph. It never replaces or edits the built-in text. Plain text, maximum 2000 characters; longer is reported and dropped (not truncated), so a half-sentence never reaches the model.

**Why**: later position cannot weaken the earlier safety instructions in practice; the real safety is the SQL guard, which is unchanged (FR-009).

## 8. Secret-like names

**Decision**: `isSecretLikeKey(name)` matches `key`, `token`, `secret`, `password`, `passwd`, `authorization` (case-insensitive, as a whole word or a `_`/`-` separated part, so `api_key` and `apiKey` match but `keyboard` does not). `validate` uses it in the unknown-key branch: such a name is reported `not_allowed_here` with "secrets are not configuration; viewers enter their own token" instead of the generic unknown-key text. Inside a provider entry `cleanProviders` applies the same test. The message names the key, never its value. It applies file-wide because a secret in any published file is a leak; declared rows (`basemap.protomaps.api_key`, the domain-restricted exception) are unaffected because the unknown-key branch is not reached.

## 9. Provider entries

**Decision** (per entry, in `cleanProviders`): `id` required, lowercase letters, digits, `-` and `_`, 1 to 40 characters; `label` defaults to the id; `base_url` required and `http`/`https` only (`isWebAddress` from 067); `models` optional list of non-empty strings; `needs_key` boolean, default true; `protocol` `openai` (default) or `anthropic`; any other field reported (secret-like ones with the secrets message). A bad entry is reported and skipped; a repeated id keeps the first. If no valid entry remains, the whole list is dropped (the built-ins are used) and that is reported. An empty list is reported the same way.

## 10. The default

**Decision**: `assistant.default.provider` and `.model` are two string rows. `checkDefault` reports a provider that is not listed (when a list exists) and falls back to the first listed. With no list, a default provider must be one of the built-in ids or it is reported and ignored. The model needs no check (any name may be typed).

## 11. Demo provider

**Decision**: Demo is a built-in only. With a deployer list, `startDemo`/`endDemo` and the "Try the demo" control are not offered (the control checks the catalogue for an id `demo`).

## 12. Testing the provider paths

**Decision**: unit-test `providers.ts` with a stubbed `fetch` (headers, base address, the guard); the Playwright spec mocks the gateway with `page.route` as `aiChat.spec.ts` does, and uses the `chromium` project, which already has the sidebar and the Settings window.

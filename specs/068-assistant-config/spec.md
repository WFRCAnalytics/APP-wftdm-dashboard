# Feature Specification: Assistant settings in dashboard-config.yaml

**Feature Branch**: `068-assistant-config`

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: "Phase D (assistant half) of project-docs/CONFIGURATION.md, built on the site configuration, schema table, check command and JSON Schema from 066 and 067: a deployer lists the AI providers the Settings assistant tab offers (replacing the built-in list), chooses the default, adds a sentence of local context to the assistant's instructions, and tunes its limits; secrets are never configuration."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A deployer offers only the providers their agency allows (Priority: P1)

A deployer works at an agency that runs its own AI gateway and does not want viewers sending questions or tokens to public services. They list their provider(s) in `dashboard-config.yaml`, each with a name, an address, suggested models, and whether it needs a key, and say which one is the default. In the Settings assistant tab viewers then see only those providers; the address of a listed provider is fixed, so a viewer cannot point the assistant (and their token and data) somewhere else. Viewers still enter their own token for the session, as today.

**Why this priority**: This is the reason the block exists (CONFIGURATION.md section 4). It is the only part that changes where a viewer's token and query data can go, so it carries the security value; the rest is tuning.

**Independent Test**: List one provider with a fixed address in the site file, open Settings, and confirm the provider list shows only it, its address cannot be edited, its suggested models are offered, and the default is selected; remove the list and confirm the tab is exactly as today.

**Acceptance Scenarios**:

1. **Given** a deployer's list of two providers, **When** the Settings assistant tab opens, **Then** exactly those two are offered, in the listed order, and none of the built-in providers (including the offline Demo) appear.
2. **Given** a listed provider, **When** a viewer selects it, **Then** its address is shown but cannot be edited, its suggested models are offered (any other model name can still be typed), and a token field is shown only when the provider needs a key.
3. **Given** a default provider and model are configured, **When** Settings opens for the first time, **Then** that provider and model are selected.
4. **Given** no provider list, **When** the assistant tab opens, **Then** it offers today's providers with editable addresses, exactly as before.
5. **Given** a provider that speaks the Anthropic message format, **When** a viewer checks and saves the connection, **Then** the assistant talks to it in that format; any other provider uses the OpenAI-compatible format.

---

### User Story 2 - A deployer gives the assistant local context and tunes its limits (Priority: P2)

A deployer wants the assistant to know their vocabulary ("our zones are called TAZs") and to cap how much work it does per question. They add a short plain-text note and set limits for how many steps a question may take, how many rows a viewer sees in a result preview, and how many rows the model itself is shown when results are shared with it.

**Why this priority**: It improves answers and bounds cost and load, but nothing breaks without it.

**Independent Test**: Set a note and lower each limit, ask a question with a scripted provider, and confirm the model receives the note, stops after the configured number of steps, and the preview and model row counts follow the limits.

**Acceptance Scenarios**:

1. **Given** a prompt note, **When** the assistant is asked a question, **Then** the model's instructions contain the note after the built-in instructions, and the viewer is not shown the note.
2. **Given** a step limit of 3, **When** a question needs more steps, **Then** the assistant stops after 3 and says it did.
3. **Given** a preview limit of 200 rows, **When** a query returns more, **Then** the viewer sees 200 rows and is told the result is truncated.
4. **Given** a model-rows limit of 20 and the viewer's privacy setting set to share results, **When** a result is shared with the model, **Then** at most 20 rows are shared.
5. **Given** none of these settings, **When** the assistant runs, **Then** it behaves as today (6 steps, 1000 preview rows, 50 model rows, no note).

---

### User Story 3 - A deployer is told about mistakes, and secrets are refused (Priority: P2)

A deployer misspells a protocol, repeats a provider id, names a default that is not listed, sets a limit out of range, writes a note that is too long, or pastes an API key into the file. The dashboard still loads, the affected setting keeps its default, and each problem is listed in the configuration note and by the `check` command with its file and key path. A field that looks like a key or token is never read and is called out.

**Why this priority**: The plan's principle that a wrong value is reported and never fatal, plus the secrets decision (a deployer's file is published, so a secret in it is a leak). Cheap to deliver together with the keys.

**Independent Test**: Load a config with one of each mistake above; the app loads, each setting is at its default, and each problem is listed once with its key path in both the note and `check`.

**Acceptance Scenarios**:

1. **Given** a provider with no id, a duplicate id, an address that is not a web address, or an unknown protocol, **When** the app loads, **Then** that entry is reported and ignored, the other providers still work, and if none remain the built-in list is used.
2. **Given** a default naming a provider that is not listed, **When** the app loads, **Then** it is reported and the first listed provider is the default.
3. **Given** a limit outside its allowed range, **When** the app loads, **Then** it is reported and the default limit applies.
4. **Given** a note longer than the maximum, **When** the app loads, **Then** it is reported and no note is added.
5. **Given** a field named like a key, token, secret or password anywhere in the assistant block, **When** the app loads or `check` runs, **Then** the field is reported as not allowed ("secrets are not configuration; viewers enter their own token"), its value is never read, and it is never shown in the page note.
6. **Given** the provider list is present but empty, **When** the app loads, **Then** it is reported, the built-in list is used, and `assistant.enabled: false` remains the way to turn the assistant off.

---

### Edge Cases

- `assistant.enabled: false`: no assistant at all; the other assistant keys are still checked and reported, but have no effect.
- A listed provider with no models: the viewer types a model name; the default model, if any, still applies.
- A default model that is not among a provider's suggestions: allowed (any model name can be typed).
- A provider that does not need a key: no token field, as for the local provider today.
- A listed address using `http` (a local gateway): allowed; only `http` and `https` addresses are accepted.
- A deployer lists a provider with the same id as a built-in one (for example `openai`): it is the deployer's entry that is used, since the list replaces the built-ins.
- The offline Demo provider exists only in the built-in list; a deployer's list never includes it.
- A viewer who has already saved a connection when a list is present: only a connection to a listed provider is accepted.
- The note and the limits are site-wide; no page or panel can override them.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A deployer MUST be able to set, in `dashboard-config.yaml`, an ordered list of assistant providers, each with a unique `id`, a `label`, a `base_url`, an optional list of suggested `models`, an optional `needs_key` (default true) and an optional `protocol` (`openai`, the default, or `anthropic`).
- **FR-002**: When the list is set and valid, the Settings assistant tab MUST offer exactly the listed providers, in order, and no built-in provider. When it is unset, the tab MUST behave exactly as today.
- **FR-003**: For a listed provider the address MUST be shown but not editable, so a viewer cannot direct the token or query data elsewhere. A connection to any address other than a listed provider's MUST be refused when a list is set.
- **FR-004**: A provider that needs no key MUST NOT show a token field. A listed provider's suggested models MUST be offered in the model picker and any other model name MUST still be accepted.
- **FR-005**: A provider with the `anthropic` protocol MUST be reached in that message format and every other listed provider in the OpenAI-compatible format; no other format is added.
- **FR-006**: A deployer MUST be able to set a default provider and model; Settings MUST open with them selected. A default naming an unlisted provider MUST be reported and the first listed provider used.
- **FR-007**: A deployer MUST be able to set a plain-text note of at most 2000 characters; it MUST be added after the assistant's built-in instructions, MUST NOT replace or weaken them, and MUST NOT be shown to the viewer.
- **FR-008**: A deployer MUST be able to set three limits, each with documented bounds: steps per question (1 to 12, default 6), preview rows shown to the viewer (100 to 5000, default 1000) and rows shared with the model (1 to 200, default 50). A value outside its bounds MUST be reported and the default used.
- **FR-009**: The assistant's SQL safety rules, its read-only and modify modes and the viewer's privacy choice MUST NOT be changed or bypassed by any of these settings.
- **FR-010**: No key, token, secret or password setting MUST exist. A field in the assistant block whose name suggests one MUST be reported as not allowed, MUST NOT be read, and its value MUST NOT appear in the page note, the console or `check` output.
- **FR-011**: Every problem named in this specification (a provider with no id, a repeated id, an address that is not `http` or `https`, an unknown protocol, an unknown or empty provider list, a default naming an unlisted provider, a limit out of bounds, a note that is too long, a key-like field) MUST be shown in the existing configuration note and the browser console and reported by the `check` command with the file and key path, the latter exiting non-zero. The affected setting MUST keep its default, a bad provider entry MUST be skipped without affecting the others, and the app MUST keep loading.
- **FR-012**: Every new key MUST be a row in the schema table that already defines the site settings, so the generated reference, the published JSON Schema, the validator and `check` know it with no other source edit. Keys are `snake_case` and site-only (they do not cascade).
- **FR-013**: The generated reference, the JSON Schema, `GRAMMAR.md` and `CLAUDE.md` MUST describe the new keys and the secrets rule.
- **FR-014**: A deployment that sets none of the new keys MUST look and behave exactly as before this feature.

### Key Entities

- **Provider**: an entry a deployer offers: id, label, address, suggested models, whether it needs a key, and which of the two message formats it speaks.
- **Assistant defaults**: the provider and model selected when Settings first opens.
- **Prompt note**: a short plain-text addition to the assistant's instructions.
- **Assistant limits**: steps per question, preview rows and rows shared with the model.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With a provider list set, 100% of the providers a viewer can select are listed ones, and a viewer has no way, within the page, to send the assistant's requests to an address that is not listed.
- **SC-002**: A deployer can restrict the assistant to one internal gateway by writing one block of at most ten lines, and a viewer reaches a working connection by entering only a token.
- **SC-003**: With none of the new keys set, every existing automated check of the assistant passes unchanged, and the Settings assistant tab and the chat are identical to the previous release.
- **SC-004**: For every mistake listed in FR-011, the dashboard still loads, the setting keeps its default, and the problem is listed with its file and key path in both the page note and the `check` output.
- **SC-005**: A secret-like field is refused in 100% of tried names (key, api_key, token, secret, password, authorization, in any letter case), and its value appears in no output.
- **SC-006**: Each limit takes effect exactly: with a limit of N, no more than N steps, preview rows or shared rows occur, and the viewer is told when a result was truncated.
- **SC-007**: Adding the new keys needs no edit outside the schema table for the reference, the JSON Schema, validation and `check` to know them (a test proves the generated files match the table).

## Assumptions

- Only the two message formats the app already speaks are supported; a gateway that speaks neither is out of scope (a new format is a separate feature).
- A deployer's token is never stored by the deployer: viewers enter their own, for the session, as today (CONFIGURATION.md section 7).
- Suggested models are suggestions only; a viewer may still type any model name.
- The documented limit bounds (steps 1 to 12, preview rows 100 to 5000, model rows 1 to 200) and the 2000-character note were chosen to keep requests and pages bounded; they can be revisited.
- The note is plain text; no formatting or placeholders are interpreted, and it is not shown in the chat.
- The built-in Demo provider is for trying the chat out and exists only when no provider list is set.
- A `http` address is accepted so a local gateway works; whether a browser blocks it on an `https` page is the deployer's concern and is not handled here.
- A deployer is trusted with the list; the fixed address protects viewers from pointing the assistant elsewhere, not from a deployer's own choice of provider.

## Out of Scope

- The `network` block (fonts, the basemap allow-list, a mirrored DuckDB extension location): undesigned, its own later specification.
- Per-viewer prompt editing, new provider message formats, storing or distributing tokens, per-provider limits, page- or panel-level overrides.
- `brand.yml`, `panel_defaults`, the demo build flag (Phase A1) and the data-layer adapters.

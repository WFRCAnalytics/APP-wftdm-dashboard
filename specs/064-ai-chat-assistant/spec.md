# Feature Specification: AI Chat Assistant

**Feature Branch**: `064-ai-chat-assistant`

**Created**: 2026-10-26

**Status**: Draft

**Input**: User description: "AI Chat assistant for the dashboard, inspired by Dash (dash-ui) Assistant mode. A new AI tab in Settings (provider, API token, model, Check and Save, query permissions Read-Only/Modify, configurable privacy), and a floating button that opens a chat side panel on every tab. The assistant looks at the data tables available for the active scenarios, writes SQL, runs it against the dashboard's data, and answers the question, using one table or joining several."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connect an AI provider in Settings (Priority: P1)

A dashboard viewer opens Settings and finds a new **AI** tab. They choose a provider (OpenAI, Anthropic, Deepseek or Ollama), enter an API token (not required for Ollama) and a model name, and press **Check and Save**. The app confirms the settings work (or explains why not). Until a provider is saved, the chat explains that the assistant is not configured and points to Settings.

**Why this priority**: Nothing else works without a configured provider; it is the entry point and the smallest independently testable slice.

**Independent Test**: Open Settings → AI, enter valid settings for one provider, press Check and Save, and see a success confirmation; enter an invalid token and see a clear failure message and the settings not marked as saved.

**Acceptance Scenarios**:

1. **Given** no provider is configured, **When** the viewer opens Settings → AI, **Then** they see a provider selector, token field, model field, query-permission control, privacy control and a Check and Save button, with Read-Only selected.
2. **Given** a provider with valid credentials, **When** the viewer presses Check and Save, **Then** the app verifies the settings with the provider and shows a success state.
3. **Given** an invalid token or unreachable provider, **When** the viewer presses Check and Save, **Then** a clear error is shown and the previous working settings (if any) stay in effect.
4. **Given** Ollama is selected, **When** the viewer views the form, **Then** the token field is optional and a local server address is shown.
5. **Given** settings were saved, **When** the viewer reloads the page, **Then** the token and settings are gone and must be entered again (they are never written to browser storage).

---

### User Story 2 - Ask a question and get an answer from the data (Priority: P1)

From any tab, the viewer clicks a floating chat button, which opens a side panel. They type a question in plain language (for example, "Which scenario has the highest transit share for work trips?"). The assistant inspects the available data tables, writes a query, runs it, and replies with a plain-language answer. The reply also shows the query that was run and the result as a table. Questions may need one table or a join of several.

**Why this priority**: This is the feature's core value: answering data questions without writing queries.

**Independent Test**: With a provider configured, ask a question answerable from one table and another that requires combining two tables; each returns a correct answer with the query and result table visible.

**Acceptance Scenarios**:

1. **Given** a configured provider, **When** the viewer asks a question answerable from a single table, **Then** the assistant shows the query it ran, the result table and a plain-language answer.
2. **Given** a question that needs data from several tables, **When** the assistant answers, **Then** it joins the relevant tables and the result is correct.
3. **Given** the assistant's query fails, **When** the error is returned, **Then** the assistant may correct and retry, and the viewer sees the final outcome, including the failed attempt.
4. **Given** the viewer is on any tab, **When** they click the floating button, **Then** the side panel opens without leaving the page, and clicking it again (or a close control) hides it.
5. **Given** a conversation exists, **When** the viewer switches tabs and returns, **Then** the conversation is still there, until the page is reloaded or the viewer clears it.
6. **Given** no provider is configured, **When** the viewer sends a message, **Then** they are told to configure one in Settings → AI.

---

### User Story 3 - Query permissions: Read-Only by default, Modify opt-in (Priority: P2)

By default the assistant can only read data. A viewer who wants the assistant to create helper tables or views, or change in-session data, switches permissions to **Modify** in Settings → AI. In both modes the app, not the assistant's instructions, decides what may run.

**Why this priority**: Safety is essential, but the feature is already useful in Read-Only mode alone.

**Independent Test**: In Read-Only, ask the assistant to delete or create something and see the statement refused and not run; switch to Modify and see the same request succeed (for permitted statements).

**Acceptance Scenarios**:

1. **Given** Read-Only mode, **When** the assistant proposes a statement that is not a read (anything other than SELECT, WITH, DESCRIBE, SHOW, EXPLAIN or table-info pragma), **Then** it is refused, not executed, and the viewer is told why.
2. **Given** Read-Only mode, **When** a single request contains several statements and any is not permitted, **Then** none of them run.
3. **Given** Modify mode, **When** the assistant creates a table or view, inserts, updates, deletes, alters, drops or copies data, **Then** the statement runs, and its effect lasts only for the current session.
4. **Given** Modify mode, **When** a statement would install or load an extension, or attach an external file or URL, **Then** it is refused.
5. **Given** Modify mode, **When** a statement would drop or replace one of the dashboard's own scenario/metric views, **Then** it is refused so dashboard panels keep working.
6. **Given** the session's data has been altered, **When** the viewer presses **Reset session data**, **Then** everything the assistant created or changed is removed and the dashboard's own views are restored.
7. **Given** Modify mode is selected, **When** the viewer views the setting, **Then** it states that changes are temporary and the published data is not altered.

---

### User Story 4 - Control what is shared with the provider (Priority: P2)

Query results can contain data the organization may not want sent to an external provider. In Settings → AI the viewer chooses what is shared: **Schema only** (table and column names and types) or **Schema and results** (also query results or sample rows, so the assistant can write a plain-language answer). With Schema only, the assistant's answer is the result table itself, without a model-written summary of the values.

**Why this priority**: Important for trust and governance, and cheap to deliver, but not needed for the first useful answer.

**Independent Test**: Set Schema only, ask a question, and verify (from the request sent) that no result rows left the browser; set Schema and results and verify results are included.

**Acceptance Scenarios**:

1. **Given** Schema only, **When** the viewer asks a question, **Then** only schema information and the question are sent, and the viewer sees the result table without a model-written value summary.
2. **Given** Schema and results, **When** a query returns rows, **Then** the rows (limited in size) are sent so the assistant can answer in words.
3. **Given** the viewer opens the AI tab, **When** they look at the privacy control, **Then** a short note says what is sent for each option and that Ollama keeps data on the local machine.

---

### Edge Cases

- The provider is unreachable, rate-limited or returns an error mid-conversation: the chat shows a readable error, keeps the conversation, and lets the viewer retry.
- The assistant's query returns thousands of rows: the table shows a limited preview with the total count and is never sent to the provider in full.
- No scenarios are active, or a table is not yet loaded: the assistant loads the data it needs on demand, or says what is unavailable.
- Two scenarios have the same table: the assistant can tell scenarios apart in its queries and answers.
- The viewer changes which scenarios are active during a conversation: the assistant uses the current set for new questions.
- The viewer sends a question while a previous answer is still being produced: the viewer can stop the running answer; new messages wait or are blocked clearly.
- The model answers without running a query, or asks a clarifying question: this is shown as a normal chat reply.
- The assistant tries a destructive or multi-statement request through a comment or odd formatting: the permission check still applies.
- The page is reloaded: token, settings and chat are cleared.
- A browser-based provider call is blocked (for example, a local model server not allowing the page's address): the error explains the likely cause.
- Dark and light themes, narrow screens and keyboard-only use: the button, panel and settings remain usable and legible.

## Requirements *(mandatory)*

### Functional Requirements

**Settings**

- **FR-001**: Settings MUST include an **AI** tab with provider selection (OpenAI, Anthropic, Deepseek, Ollama), API token, model name, query permissions, privacy and a **Check and Save** action.
- **FR-002**: The token field MUST be masked, and MUST be optional for Ollama.
- **FR-003**: Check and Save MUST verify the settings against the provider and report success or a specific failure reason; failed verification MUST NOT replace working settings.
- **FR-004**: The API token and AI settings MUST be kept only for the current page session and MUST NOT be written to any persistent browser storage.
- **FR-005**: Each provider MUST have a sensible default address and suggested model, and the viewer MUST be able to override the address (for example, an internal gateway or a non-default local server).

**Chat**

- **FR-006**: A floating chat button MUST be available on every tab and open and close a side panel without navigating away or reloading data.
- **FR-007**: The viewer MUST be able to send a natural-language question, see the running state, and stop an answer in progress.
- **FR-008**: The assistant MUST be given the structure (tables, columns, types) of the data available for the currently active scenarios, and MUST be able to answer from a single table or by joining several.
- **FR-009**: Data needed by a question MUST be made available on demand, consistent with how the rest of the dashboard loads data, without loading everything up front.
- **FR-010**: Each assistant reply that ran a query MUST show the query text and the result as a table, with a row limit and a total row count for large results.
- **FR-011**: When a query fails, the assistant MUST be able to see the error and try again a bounded number of times, and the viewer MUST see the attempts.
- **FR-012**: The conversation MUST persist across tab switches and panel open/close for the session, and the viewer MUST be able to clear it.
- **FR-013**: Queries MUST run against the same data the dashboard panels use, and MUST NOT block the page while running.
- **FR-014**: When no provider is configured, the chat MUST say so and link to Settings → AI.

**Permissions**

- **FR-015**: Query permissions MUST default to **Read-Only** and MUST be enforced by checking each statement in the app before it runs, not by instructions to the assistant.
- **FR-016**: In Read-Only mode only reading statements (SELECT, WITH, DESCRIBE, SHOW, EXPLAIN, table-info pragma) MUST be allowed; a request containing any other statement MUST be refused in full with an explanation.
- **FR-017**: In Modify mode, statements MUST NOT be restricted by type, except that installing or loading extensions and attaching external files or URLs MUST be refused.
- **FR-018**: In either mode, the dashboard's own scenario and metric views MUST be protected from being dropped, replaced or altered.
- **FR-019**: A **Reset session data** action MUST remove everything the assistant created or changed and restore the dashboard's own views.
- **FR-020**: Changes made in Modify mode MUST affect only the current session and MUST NOT alter published data files.

**Privacy**

- **FR-021**: Settings MUST let the viewer choose between sharing **schema only** and **schema plus results** with the provider; the default MUST be schema only.
- **FR-022**: With schema only, no result values MUST be sent to the provider, and the viewer MUST still receive the result table.
- **FR-023**: Shared result data MUST be capped to a small number of rows and size.
- **FR-024**: The AI tab MUST state in plain words what is sent under each option.

**Quality**

- **FR-025**: The feature MUST work in light and dark themes and with keyboard navigation, use the app's existing interface components, and add no new charting library.
- **FR-026**: If the feature is never configured, the dashboard MUST behave exactly as it does today apart from the visible chat button and AI tab.

### Key Entities

- **AI Settings**: provider, address, token, model, query permission mode, privacy mode; session-only.
- **Conversation**: ordered messages for the session.
- **Message**: author (viewer or assistant), text, and for assistant replies zero or more query attempts.
- **Query Attempt**: the query text, whether it was allowed, its outcome (result preview, row count, or error) and which tables it used.
- **Data Catalogue**: the tables and columns available for the active scenarios, as shown to the assistant.
- **Protected Views**: the dashboard's own scenario and metric views that assistant statements cannot drop or replace.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A viewer can configure a provider and ask a first question in under 2 minutes.
- **SC-002**: At least 90% of a prepared set of 20 representative questions (single-table and multi-table) return a correct answer within two attempts.
- **SC-003**: Typical questions show a first visible response within 3 seconds and a complete answer within 15 seconds, excluding provider outages.
- **SC-004**: In Read-Only mode, 100% of a prepared set of write, extension, attach and multi-statement attempts are refused and none change any data.
- **SC-005**: In Modify mode, 100% of attempts to drop or replace the dashboard's own views are refused, and after Reset session data every dashboard panel renders as before.
- **SC-006**: With Schema only selected, an inspection of outgoing requests shows zero result values over a full conversation.
- **SC-007**: After a reload, no token or setting is retained anywhere in the browser.
- **SC-008**: Opening and closing the chat, or switching tabs during a conversation, never loses the conversation and never slows the dashboard noticeably.

## Assumptions

- Viewers supply their own provider account and token; the app does not provide or pay for model access.
- The browser contacts the provider directly. Providers that block browser requests need a gateway address the viewer or deployer supplies, and the app surfaces that failure clearly.
- Deployer-supplied default keys or gateway addresses in dashboard configuration are out of scope for this version; only session entry in Settings is included.
- "Modify" affects in-memory session data only, since published data files are read-only in the browser.
- The assistant sees schema for tables of active scenarios and observed data, not other files.
- Charts generated by the assistant, adding answers as dashboard tiles, and saving conversations across reloads are out of scope for this version.
- Query results shown in chat are previews; exporting them is out of scope.
- English is the only supported chat language for the interface text.

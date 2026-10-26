# Contract: Settings → AI tab and chat panel UI

## Settings → AI tab (`layout/settings/aiTab.tsx`)

Tab id `ai`, label "AI", icon `Sparkles` (lucide). Added to `SettingsTab` in `state/settingsState.ts`, to `TABS`/`PANEL` and the `sr-only` description in `layout/settingsModal.tsx`.

| Control | Behaviour |
|---|---|
| Provider | radio/select: OpenAI, Anthropic, Deepseek, Ollama. Changing it fills preset base URL and model (only if the viewer has not edited them) |
| Server address | text, preset per provider, editable |
| API token | `type=password`, `autocomplete=off`; hidden for no one, but marked optional for Ollama |
| Model | text, preset per provider |
| Check and Save | disabled while checking; shows spinner then a status line (`role=status`): "Connected" / specific error |
| Query permissions | two-option radio: **Read-Only** (default) — "The assistant can only run read queries." / **Modify** — "The assistant may create and change tables and views for this session. Changes are temporary; published data is never altered." |
| Privacy | two-option radio: **Schema only** (default) — "Only table and column names/types and your question are sent. Results stay in your browser." / **Schema and results** — "Also sends up to 50 result rows per query so the assistant can answer in words." Note: "Ollama runs on your machine; nothing leaves it." |
| Reset session data | button, visible in Modify mode (enabled always); confirms with a count of removed objects |
| Session note | "Your token is kept only until you close or reload this page." |

Permission and Privacy radios apply immediately. Everything else applies on successful Check and Save.

## Floating launcher (`layout/chat/chatLauncher.tsx`)

- Fixed bottom-right button, `aria-label="Open AI assistant"`, `aria-expanded`, `aria-controls` the panel. Hidden while the Settings dialog is open (dialog `z-[60]`).
- Always rendered by `Shell`, on every tab including chromeless full-page tabs.
- Shows a small dot when a run is in progress while the panel is closed.

## Chat panel (`layout/chat/chatPanel.tsx`, lazy)

- Right-side sheet, overlay (does not reflow the page), `role="dialog"` non-modal (`aria-modal` false), Esc closes and returns focus to the launcher; full width below 760px.
- Header: title, permission badge (Read-Only / Modify), privacy badge, Clear, Close.
- Body: message list (`role="log"`, `aria-live="polite"`), each assistant message shows: step status while running, answer text, then each attempt as a collapsible block with the SQL (monospace, copy button), outcome badge, and a result table or the refusal/error reason.
- Footer: textarea (Enter sends, Shift+Enter newline), Send (becomes Stop while running).
- Unconfigured state: empty-state with "Set up the AI assistant" button that opens Settings on the AI tab.
- Theme: only design tokens/CSS variables already used in `settingsModal.tsx` (`--surface`, `--ink`, `--mute`, `--line`, `--brand-text`); verified in light and dark.
- Result table: sticky header, max 1000 rows, horizontal scroll, numbers right-aligned.

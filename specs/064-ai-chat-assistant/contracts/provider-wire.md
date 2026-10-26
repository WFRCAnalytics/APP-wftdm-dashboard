# Contract: Provider clients (`services/ai/providers.ts`)

## Internal interface

```ts
type ProviderId = 'openai' | 'anthropic' | 'deepseek' | 'ollama'

interface ProviderConfig { provider: ProviderId; baseUrl: string; apiKey: string; model: string }

type ChatTurn =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; toolCalls: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string }

interface ToolCall { id: string; name: string; args: unknown }
interface ToolSpec { name: string; description: string; parameters: JsonSchema }

interface Completion { text: string; toolCalls: ToolCall[] }

complete(cfg, system: string, turns: ChatTurn[], tools: ToolSpec[], signal: AbortSignal): Promise<Completion>
checkConnection(cfg, signal): Promise<{ ok: true } | { ok: false; message: string }>
```

Errors are thrown as `ProviderError { kind: 'auth' | 'rate-limit' | 'model' | 'network' | 'cors' | 'server' | 'abort'; message }`. The api key is removed from every message.

## OpenAI-compatible (openai, deepseek, ollama)

- `POST {baseUrl}/chat/completions`, header `Authorization: Bearer <key>` (omitted if no key), `Content-Type: application/json`.
- Body: `{ model, messages: [{role:'system',content}, …], tools: [{type:'function', function:{name,description,parameters}}], tool_choice:'auto', stream:false }`.
- Assistant tool calls round-trip as `tool_calls: [{id, type:'function', function:{name, arguments: '<json string>'}}]`; results as `{role:'tool', tool_call_id, content}`.
- Parse: `choices[0].message.content` and `choices[0].message.tool_calls`; `arguments` is JSON-parsed, a parse failure is returned to the model as a tool error rather than thrown.
- Check: `GET {baseUrl}/models`; success when 2xx; if the body lists models and `model` is absent → `kind:'model'`.
- Presets: openai `https://api.openai.com/v1`; deepseek `https://api.deepseek.com`; ollama `http://localhost:11434/v1`.

## Anthropic

- `POST {baseUrl}/v1/messages` with headers `x-api-key`, `anthropic-version: 2023-06-01`, `anthropic-dangerous-direct-browser-access: true`, `Content-Type: application/json`.
- Body: `{ model, max_tokens: 2048, system, messages, tools: [{name, description, input_schema}] }`.
- Assistant tool calls are `tool_use` content blocks (`id`, `name`, `input`); results go back in a user message as `tool_result` blocks (`tool_use_id`, `content`). Consecutive tool results are merged into one user message.
- Parse: concatenate `text` blocks, collect `tool_use` blocks.
- Check: `GET {baseUrl}/v1/models` (same headers).
- Preset base URL: `https://api.anthropic.com`.

## Error mapping

| Situation | kind | User text (example) |
|---|---|---|
| 401/403 | auth | "The provider rejected the token." |
| 404 with model message | model | "Model 'x' was not found." |
| 429 | rate-limit | "Rate limit reached; try again shortly." |
| `fetch` throws `TypeError` | cors/network | "Could not reach the server. For Ollama, allow this page's origin with OLLAMA_ORIGINS; for other providers check the address or use a gateway." |
| 5xx | server | "The provider had an error (status)." |
| `AbortError` | abort | no message; run marked stopped |

## Safety

- No provider response is rendered as HTML.
- Requests contain: system prompt (catalogue + rules), conversation turns (user text, assistant text, tool calls, shaped tool results). They never contain the token in the body.
- No retry on 4xx; one retry on network error is not performed in v1 (the viewer presses Retry).

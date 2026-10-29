// 064-ai-chat-assistant: shared types. See specs/064-ai-chat-assistant/data-model.md.

/** A provider's id: one of the built-ins (`openai`, `anthropic`, `deepseek`, `ollama`, `demo`) or the id a deployer gave it. */
export type ProviderId = string
export type Permission = 'read-only' | 'modify'
export type PrivacyMode = 'schema-only' | 'schema-and-results'

export type ProviderProtocol = 'openai' | 'anthropic'

export interface ProviderConfig {
  provider: ProviderId
  /** Which of the two message formats the provider speaks. Absent: `anthropic` for the built-in Anthropic, else OpenAI-compatible. */
  protocol?: ProviderProtocol
  baseUrl: string
  apiKey: string
  model: string
}

export type StatementKind = 'read' | 'ddl' | 'dml' | 'external' | 'other'

export interface ClassifiedStatement {
  text: string
  kind: StatementKind
  verb: string
}

export type GuardResult =
  | { allowed: true; statements: ClassifiedStatement[] }
  | { allowed: false; reason: string; statementIndex?: number }

export interface ToolCall {
  id: string
  name: string
  args: unknown
}

export interface ToolSpec {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export type ChatTurn =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; toolCalls: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string }

export interface Completion {
  text: string
  toolCalls: ToolCall[]
}

export interface ColumnInfo {
  name: string
  type: string
}

export interface QueryAttempt {
  sql: string
  outcome: 'ok' | 'refused' | 'error' | 'cancelled'
  reason?: string
  columns: ColumnInfo[]
  rows: unknown[][]
  truncated: boolean
  mode: Permission
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  attempts: QueryAttempt[]
  error?: string
  stopped?: boolean
}

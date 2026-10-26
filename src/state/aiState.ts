// 064-ai-chat-assistant: the assistant's settings. Session-only module state like every other store here
// (constitution VI: no Web Storage): the token is lost on reload, deliberately. The token is only ever read through
// getSavedConfig() by services/ai/providers.ts; nothing here logs or serializes it.
import type { Permission, PrivacyMode, ProviderConfig, ProviderId } from '@/services/ai/types'

export interface ProviderPreset {
  label: string
  baseUrl: string
  model: string
  /** Ollama runs locally and needs no token. */
  needsKey: boolean
  /** Suggested models for the searchable picker; any other model name can still be typed. */
  models: string[]
}

export const PROVIDER_PRESETS: Record<ProviderId, ProviderPreset> = {
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1', needsKey: true, models: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o', 'gpt-4o-mini', 'o4-mini', 'o3'] },
  anthropic: { label: 'Anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-5-5', needsKey: true, models: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'] },
  deepseek: { label: 'Deepseek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', needsKey: true, models: ['deepseek-chat', 'deepseek-reasoner'] },
  // Scripted replies for trying the chat out: no network, no key (services/ai/demoScript.ts).
  demo: { label: 'Demo (offline)', baseUrl: 'demo://local', model: 'scripted', needsKey: false, models: ['scripted'] },
  ollama: { label: 'Ollama', baseUrl: 'http://localhost:11434/v1', model: 'llama3.1', needsKey: false, models: ['llama3.1', 'llama3.2', 'qwen2.5', 'qwen3', 'mistral-nemo', 'mistral', 'gpt-oss'] },
}

export type AiStatus = 'unconfigured' | 'checking' | 'ready' | 'error'

export interface AiSettings {
  /** The form's current values (not yet verified). */
  draft: ProviderConfig
  /** What the assistant actually uses: set only by a successful Check and Save. */
  saved: ProviderConfig | undefined
  permission: Permission
  privacy: PrivacyMode
  status: AiStatus
  statusMessage: string
}

function presetDraft(provider: ProviderId): ProviderConfig {
  const p = PROVIDER_PRESETS[provider]
  return { provider, baseUrl: p.baseUrl, apiKey: '', model: p.model }
}

const INITIAL: AiSettings = {
  draft: presetDraft('openai'),
  saved: undefined,
  permission: 'read-only',
  privacy: 'schema-only',
  status: 'unconfigured',
  statusMessage: '',
}

let state: AiSettings = INITIAL
const subscribers = new Set<() => void>()

function commit(next: AiSettings): void {
  state = next
  for (const fn of subscribers) fn()
}

export function subscribe(fn: () => void): () => void {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

export function getAiSettings(): AiSettings {
  return state
}

/** The verified configuration the assistant may use, or undefined until a Check and Save has succeeded. */
export function getSavedConfig(): ProviderConfig | undefined {
  return state.saved
}

/** Switching provider refills the address and model from that provider's preset, and clears the token. */
export function setDraftProvider(provider: ProviderId): void {
  if (provider === state.draft.provider) return
  commit({ ...state, draft: presetDraft(provider) })
}

export function patchDraft(patch: Partial<Pick<ProviderConfig, 'baseUrl' | 'apiKey' | 'model'>>): void {
  commit({ ...state, draft: { ...state.draft, ...patch } })
}

export function setCheckState(status: AiStatus, statusMessage: string): void {
  commit({ ...state, status, statusMessage })
}

/** Called only after a successful check; the previous saved configuration stays in effect on failure. */
export function saveDraft(): void {
  commit({ ...state, saved: { ...state.draft }, status: 'ready', statusMessage: 'Connected.' })
}

/** "Try the demo": selects the scripted Demo provider and marks it ready, with no token and no check. */
export function startDemo(): void {
  const p = PROVIDER_PRESETS.demo
  const config: ProviderConfig = { provider: 'demo', baseUrl: p.baseUrl, apiKey: '', model: p.model }
  commit({ ...state, draft: config, saved: config, status: 'ready', statusMessage: 'Connected.' })
}

/** Leaves demo mode: back to "not set up" (a real provider's settings were never saved over by the demo). */
export function endDemo(): void {
  if (state.saved?.provider !== 'demo') return
  commit({ ...state, draft: presetDraft('openai'), saved: undefined, status: 'unconfigured', statusMessage: '' })
}

// Permission and privacy carry no credential, so they apply the moment they are chosen.
export function setPermission(permission: Permission): void {
  commit({ ...state, permission })
}

export function setPrivacy(privacy: PrivacyMode): void {
  commit({ ...state, privacy })
}

/** Test helper: back to a fresh session. */
export function __resetAiSettings(): void {
  commit(INITIAL)
}

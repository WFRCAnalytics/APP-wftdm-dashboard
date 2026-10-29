// 068: what the deployment decided about the assistant, resolved once at boot (dashboard-config.yaml `assistant:`) and read by
// the assistant's services and the Settings tab: which providers are offered, whether their addresses are locked, the note added
// to the instructions and the three limits. Plain module state, no React, like assistantAvailability.ts. With nothing configured
// every value is what it was before this existed (the built-in providers, 6 steps, 1000 preview rows, 50 shared rows, no note).
import { ASSISTANT_LIMITS, type ProviderEntry, type ProviderProtocol } from '../../config/assistant'
import type { ProviderId } from './types'

export interface ProviderPreset {
  id: ProviderId
  label: string
  baseUrl: string
  model: string
  /** Ollama runs locally and needs no token. */
  needsKey: boolean
  /** Suggested models for the searchable picker; any other model name can still be typed. */
  models: string[]
  protocol: ProviderProtocol
  /** A deployer's provider: its address is fixed (shown, not editable). */
  locked: boolean
}

// The providers offered when the deployer lists none: the order here is the order in the Settings tab.
export const BUILTIN_PRESETS: readonly ProviderPreset[] = [
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1', needsKey: true, models: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o', 'gpt-4o-mini', 'o4-mini', 'o3'], protocol: 'openai', locked: false },
  { id: 'anthropic', label: 'Anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-5-5', needsKey: true, models: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'], protocol: 'anthropic', locked: false },
  { id: 'deepseek', label: 'Deepseek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', needsKey: true, models: ['deepseek-chat', 'deepseek-reasoner'], protocol: 'openai', locked: false },
  // Scripted replies for trying the chat out: no network, no key (services/ai/demoScript.ts).
  { id: 'demo', label: 'Demo (offline)', baseUrl: 'demo://local', model: 'scripted', needsKey: false, models: ['scripted'], protocol: 'openai', locked: false },
  { id: 'ollama', label: 'Ollama', baseUrl: 'http://localhost:11434/v1', model: 'llama3.1', needsKey: false, models: ['llama3.1', 'llama3.2', 'qwen2.5', 'qwen3', 'mistral-nemo', 'mistral', 'gpt-oss'], protocol: 'openai', locked: false },
]

export interface AssistantLimits {
  roundTrips: number
  previewRows: number
  modelRows: number
}

/** What `toBranding` hands over (all optional; each part is checked again here, so a wrong value cannot reach the services). */
export interface AssistantInput {
  providers?: ProviderEntry[]
  default?: { provider?: string; model?: string }
  promptAddendum?: string
  limits?: Partial<AssistantLimits>
}

const DEFAULT_LIMITS: AssistantLimits = {
  roundTrips: ASSISTANT_LIMITS.round_trips.default,
  previewRows: ASSISTANT_LIMITS.preview_rows.default,
  modelRows: ASSISTANT_LIMITS.model_rows.default,
}

let catalogue: readonly ProviderPreset[] = BUILTIN_PRESETS
let locked = false
let defaultId: ProviderId = BUILTIN_PRESETS[0].id
let note: string | undefined
let limits: AssistantLimits = DEFAULT_LIMITS

const inRange = (v: unknown, b: { min: number; max: number }): v is number => typeof v === 'number' && Number.isInteger(v) && v >= b.min && v <= b.max

/** Resolves the policy. Called once at boot; called with nothing it restores the built-in behaviour. */
export function configureAssistant(input?: AssistantInput): void {
  const listed = input?.providers && input.providers.length > 0 ? input.providers : undefined
  const wanted = input?.default
  const base: readonly ProviderPreset[] = listed
    ? listed.map((p) => ({ id: p.id, label: p.label, baseUrl: p.base_url, model: p.models[0] ?? '', needsKey: p.needs_key, models: p.models, protocol: p.protocol, locked: true }))
    : BUILTIN_PRESETS
  const first = base[0]
  const chosen = base.find((p) => p.id === wanted?.provider) ?? first
  // the configured default model applies to the default provider (not to the first one when the named provider is unknown)
  const model = wanted?.model && (wanted.provider === undefined || wanted.provider === chosen.id) ? wanted.model : undefined
  catalogue = model ? base.map((p) => (p.id === chosen.id ? { ...p, model } : p)) : base
  locked = listed !== undefined
  defaultId = chosen.id
  const text = input?.promptAddendum
  note = typeof text === 'string' && text.trim() !== '' ? text.trim() : undefined
  const l = input?.limits
  limits = {
    roundTrips: inRange(l?.roundTrips, ASSISTANT_LIMITS.round_trips) ? l.roundTrips : DEFAULT_LIMITS.roundTrips,
    previewRows: inRange(l?.previewRows, ASSISTANT_LIMITS.preview_rows) ? l.previewRows : DEFAULT_LIMITS.previewRows,
    modelRows: inRange(l?.modelRows, ASSISTANT_LIMITS.model_rows) ? l.modelRows : DEFAULT_LIMITS.modelRows,
  }
}

export function resetAssistantPolicy(): void {
  configureAssistant()
}

/** The providers the Settings tab offers, in order: the deployer's list, or the built-ins. */
export function getProviderCatalogue(): readonly ProviderPreset[] {
  return catalogue
}

/** The provider Settings starts on. */
export function getDefaultProvider(): ProviderPreset {
  return catalogue.find((p) => p.id === defaultId) ?? catalogue[0]
}

/** True when the deployer's list is in force: addresses are fixed and any other address is refused. */
export function isLocked(): boolean {
  return locked
}

export function getPromptNote(): string | undefined {
  return note
}

export function getLimits(): AssistantLimits {
  return limits
}

const trim = (url: string) => url.trim().replace(/\/+$/, '').toLowerCase()

/**
 * Whether a request may go to `url`. Always true until a deployer's list is in force; then only an address under a listed
 * provider's address (the same address, or that address followed by `/`), so a look-alike host such as
 * `https://llm.example.org.evil.com` is not accepted.
 */
export function isAddressAllowed(url: string): boolean {
  if (!locked) return true
  const target = trim(url)
  return catalogue.some((p) => {
    const base = trim(p.baseUrl)
    return target === base || target.startsWith(`${base}/`)
  })
}

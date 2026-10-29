// 064-ai-chat-assistant: the assistant's settings. Session-only module state like every other store here
// (constitution VI: no Web Storage): the token is lost on reload, deliberately. The token is only ever read through
// getSavedConfig() by services/ai/providers.ts; nothing here logs or serializes it.
import { BUILTIN_PRESETS, getDefaultProvider, getProviderCatalogue, isAddressAllowed, isLocked, type ProviderPreset } from '@/services/ai/assistantPolicy'
import type { Permission, PrivacyMode, ProviderConfig, ProviderId } from '@/services/ai/types'

// The providers on offer (the deployer's list or the built-ins) are resolved once at boot into services/ai/assistantPolicy.ts.
export type { ProviderPreset }

/** The built-in providers, by id (what the Settings tab offers when the deployer lists none). */
export const PROVIDER_PRESETS: Record<string, ProviderPreset> = Object.fromEntries(BUILTIN_PRESETS.map((p) => [p.id, p]))

/** The providers the Settings tab offers now, in order. */
export function getProviderPresets(): readonly ProviderPreset[] {
  return getProviderCatalogue()
}

/** One offered provider by id; the default provider when the id is not offered. */
export function getPreset(id: ProviderId): ProviderPreset {
  return getProviderCatalogue().find((p) => p.id === id) ?? getDefaultProvider()
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
  const p = getPreset(provider)
  return { provider: p.id, protocol: p.protocol, baseUrl: p.baseUrl, apiKey: '', model: p.model }
}

function initial(): AiSettings {
  return {
    draft: presetDraft(getDefaultProvider().id),
    saved: undefined,
    permission: 'read-only',
    privacy: 'schema-only',
    status: 'unconfigured',
    statusMessage: '',
  }
}

let state: AiSettings = initial()
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
  // with a deployer's list the address is the listed provider's and cannot be changed
  const { baseUrl, ...rest } = patch
  commit({ ...state, draft: { ...state.draft, ...(isLocked() ? rest : { ...rest, ...(baseUrl !== undefined ? { baseUrl } : {}) }) } })
}

export function setCheckState(status: AiStatus, statusMessage: string): void {
  commit({ ...state, status, statusMessage })
}

/** Called only after a successful check; the previous saved configuration stays in effect on failure. */
export function saveDraft(): void {
  if (!isAddressAllowed(state.draft.baseUrl)) {
    commit({ ...state, status: 'error', statusMessage: 'This address is not allowed by the dashboard configuration.' })
    return
  }
  commit({ ...state, saved: { ...state.draft }, status: 'ready', statusMessage: 'Connected.' })
}

/** After the deployment's assistant settings are known (boot): the form starts on the default provider and model. */
export function applyAssistantPolicy(): void {
  commit(initial())
}

/** "Try the demo": selects the scripted Demo provider and marks it ready, with no token and no check. Only when Demo is offered. */
export function startDemo(): void {
  const p = getProviderCatalogue().find((x) => x.id === 'demo')
  if (!p) return
  const config: ProviderConfig = { provider: 'demo', protocol: p.protocol, baseUrl: p.baseUrl, apiKey: '', model: p.model }
  commit({ ...state, draft: config, saved: config, status: 'ready', statusMessage: 'Connected.' })
}

/** Leaves demo mode: back to "not set up" (a real provider's settings were never saved over by the demo). */
export function endDemo(): void {
  if (state.saved?.provider !== 'demo') return
  commit({ ...state, draft: presetDraft(getDefaultProvider().id), saved: undefined, status: 'unconfigured', statusMessage: '' })
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
  commit(initial())
}

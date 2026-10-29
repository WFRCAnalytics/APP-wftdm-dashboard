// The assistant settings' own rules (dashboard-config.yaml, `assistant:`), pure: what a single schema row cannot say. The
// provider list (each entry's fields, unique ids), the default naming a listed provider, the limit bounds, the note length
// and which key names are secrets. The schema rows, the loader and the `check` command all call this file.
import { getPath, isTree, type Tree } from './paths'
import { isWebAddress } from './viewer'

export type ProviderProtocol = 'openai' | 'anthropic'
export const PROVIDER_PROTOCOLS: readonly ProviderProtocol[] = ['openai', 'anthropic']

/** One provider a deployer offers, as written in the file (snake_case) after cleaning. */
export interface ProviderEntry {
  id: string
  label: string
  base_url: string
  models: string[]
  needs_key: boolean
  protocol: ProviderProtocol
}

/** An id: lowercase letters, digits, `-` and `_`, 1 to 40 characters. */
export const PROVIDER_ID_PATTERN = /^[a-z0-9_-]{1,40}$/

export const MAX_PROMPT_ADDENDUM = 2000

/** The three limits: their bounds and what they are when unset (today's constants). */
export const ASSISTANT_LIMITS = {
  round_trips: { min: 1, max: 12, default: 6 },
  preview_rows: { min: 100, max: 5000, default: 1000 },
  model_rows: { min: 1, max: 200, default: 50 },
} as const

type LimitName = keyof typeof ASSISTANT_LIMITS

/** The schema `check` for one limit: an integer inside its bounds (the type check has already seen a whole number). */
export function limitCheck(name: LimitName): (value: unknown) => string | undefined {
  const { min, max, default: dflt } = ASSISTANT_LIMITS[name]
  return (value) => (typeof value === 'number' && value >= min && value <= max ? undefined : `must be between ${min} and ${max}; ${dflt} is used`)
}

/** The schema `check` for the prompt note: not longer than the maximum (it is dropped, never cut short). */
export function addendumCheck(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > MAX_PROMPT_ADDENDUM ? `the note is ${value.length} characters; the most allowed is ${MAX_PROMPT_ADDENDUM}, so no note is added` : undefined
}

export const SECRETS_MESSAGE = 'secrets are not configuration; viewers enter their own token'

const SECRET_PARTS = new Set(['key', 'keys', 'token', 'tokens', 'secret', 'secrets', 'password', 'passwords', 'passwd', 'authorization', 'apikey', 'bearer'])

/** The ids of the built-in providers (assistantPolicy.ts has the full presets; a unit test keeps the two in step). */
export const BUILTIN_PROVIDER_IDS: readonly string[] = ['openai', 'anthropic', 'deepseek', 'demo', 'ollama']

/**
 * Whether a field name looks like it holds a secret: a separate part of the name (split on `_`, `-`, spaces and camelCase) is a
 * secret word. `api_key` and `apiKey` match; `keyboard`, `monkey` and `tokenizer` do not.
 */
export function isSecretLikeKey(name: string): boolean {
  const parts = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .map((p) => p.toLowerCase())
  return parts.some((p) => SECRET_PARTS.has(p))
}

const PROVIDER_FIELDS = ['id', 'label', 'base_url', 'models', 'needs_key', 'protocol'] as const

/**
 * The schema's `clean` for `assistant.providers`: keeps each valid entry in order, normalised, and reports every problem by entry
 * number. A bad entry is skipped; a repeated id keeps the first; no value is ever echoed into a message (a secret might be one).
 * With nothing valid left (or an empty list) the value is dropped, so the built-in providers stay.
 */
export function cleanProviders(value: unknown): { value: unknown; messages: string[] } {
  const messages: string[] = []
  const list = Array.isArray(value) ? value : []
  const kept: ProviderEntry[] = []
  const seen = new Set<string>()

  list.forEach((raw, index) => {
    const n = index + 1
    const where = `provider ${n}`
    if (!isTree(raw)) {
      messages.push(`${where}: expected a map with an id and a base_url; skipped`)
      return
    }
    let skip = false
    const bad = (message: string) => {
      messages.push(`${where}: ${message}`)
      skip = true
    }

    for (const key of Object.keys(raw)) {
      if ((PROVIDER_FIELDS as readonly string[]).includes(key)) continue
      if (isSecretLikeKey(key)) messages.push(`${where}: field "${key}" is not allowed: ${SECRETS_MESSAGE}`)
      else messages.push(`${where}: unknown field "${key}"`)
    }

    const id = raw.id
    if (typeof id !== 'string' || id === '') bad('an id is required; skipped')
    else if (!PROVIDER_ID_PATTERN.test(id)) bad(`id "${id}" must be 1 to 40 lowercase letters, digits, - or _; skipped`)
    else if (seen.has(id)) bad(`id "${id}" is already used by an earlier provider; skipped`)

    const baseUrl = raw.base_url
    if (typeof baseUrl !== 'string' || baseUrl === '') bad('a base_url is required; skipped')
    else if (!isWebAddress(baseUrl)) bad('base_url must be an http or https address; skipped')

    let protocol: ProviderProtocol = 'openai'
    if (raw.protocol !== undefined) {
      if ((PROVIDER_PROTOCOLS as readonly unknown[]).includes(raw.protocol)) protocol = raw.protocol as ProviderProtocol
      else bad(`unknown protocol (known: ${PROVIDER_PROTOCOLS.join(', ')}); skipped`)
    }
    if (skip) return

    let label = id as string
    if (raw.label !== undefined) {
      if (typeof raw.label === 'string' && raw.label.trim() !== '') label = raw.label.trim()
      else messages.push(`${where}: label must be text; the id is used`)
    }
    let models: string[] = []
    if (raw.models !== undefined) {
      if (Array.isArray(raw.models) && raw.models.every((m) => typeof m === 'string' && m.trim() !== '')) models = (raw.models as string[]).map((m) => m.trim())
      else messages.push(`${where}: models must be a list of model names; none suggested`)
    }
    let needsKey = true
    if (raw.needs_key !== undefined) {
      if (typeof raw.needs_key === 'boolean') needsKey = raw.needs_key
      else messages.push(`${where}: needs_key must be true or false; true is used`)
    }

    seen.add(id as string)
    kept.push({ id: id as string, label, base_url: (baseUrl as string).trim(), models, needs_key: needsKey, protocol })
  })

  if (kept.length === 0) {
    messages.push(list.length === 0 ? 'the provider list is empty, so the built-in providers are used' : 'no usable provider, so the built-in providers are used')
    return { value: undefined, messages }
  }
  return { value: kept, messages }
}

/**
 * The default provider must be listed (or, with no list, one of the built-in ids). Returns a message for the problem, none
 * when it is fine or unset. The model needs no check: any model name can be typed.
 */
export function checkDefault(settings: Tree, builtinIds: readonly string[] = BUILTIN_PROVIDER_IDS): string[] {
  const provider = getPath(settings, 'assistant.default.provider')
  if (typeof provider !== 'string') return []
  const listed = getPath(settings, 'assistant.providers')
  const ids = Array.isArray(listed) && listed.length > 0 ? (listed as ProviderEntry[]).map((p) => p.id) : [...builtinIds]
  if (ids.includes(provider)) return []
  return [`the default provider "${provider}" is not one of the offered providers (${ids.join(', ')}); the first one is used`]
}

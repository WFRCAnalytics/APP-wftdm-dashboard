import { describe, expect, it } from 'vitest'

import { ASSISTANT_LIMITS, checkDefault, cleanProviders, isSecretLikeKey, MAX_PROMPT_ADDENDUM, PROVIDER_ID_PATTERN, SECRETS_MESSAGE, type ProviderEntry } from '../../src/config'

const entry = (extra: Record<string, unknown> = {}) => ({ id: 'gw', base_url: 'https://llm.example.org/v1', ...extra })
const kept = (r: { value: unknown }) => r.value as ProviderEntry[]

describe('cleanProviders', () => {
  it('keeps a valid entry, normalised, with the defaults filled', () => {
    const r = cleanProviders([entry()])
    expect(r.messages).toEqual([])
    expect(kept(r)).toEqual([{ id: 'gw', label: 'gw', base_url: 'https://llm.example.org/v1', models: [], needs_key: true, protocol: 'openai' }])
  })

  it('keeps every field of a full entry and the order of the list', () => {
    const r = cleanProviders([
      entry({ id: 'a', label: ' Agency ', models: [' m1 ', 'm2'], needs_key: false, protocol: 'anthropic' }),
      entry({ id: 'b', base_url: 'http://localhost:11434/v1' }),
    ])
    expect(r.messages).toEqual([])
    expect(kept(r).map((p) => p.id)).toEqual(['a', 'b'])
    expect(kept(r)[0]).toEqual({ id: 'a', label: 'Agency', base_url: 'https://llm.example.org/v1', models: ['m1', 'm2'], needs_key: false, protocol: 'anthropic' })
  })

  it('skips an entry with no id, a badly formed id or no base_url, and says which one', () => {
    const r = cleanProviders([{ base_url: 'https://x.org' }, entry({ id: 'Bad Id' }), { id: 'c' }, entry({ id: 'ok' })])
    expect(kept(r).map((p) => p.id)).toEqual(['ok'])
    expect(r.messages).toEqual([
      expect.stringContaining('provider 1: an id is required'),
      expect.stringContaining('provider 2: id "Bad Id"'),
      expect.stringContaining('provider 3: a base_url is required'),
    ])
  })

  it('refuses addresses that are not http or https', () => {
    for (const url of ['javascript:alert(1)', 'ftp://x.org', 'llm.example.org', 'https://exa mple.org']) {
      const r = cleanProviders([entry({ base_url: url }), entry({ id: 'ok' })])
      expect(kept(r).map((p) => p.id), url).toEqual(['ok'])
      expect(r.messages[0], url).toContain('base_url must be an http or https address')
    }
  })

  it('keeps the first of a repeated id and reports the repeat', () => {
    const r = cleanProviders([entry({ label: 'first' }), entry({ label: 'second' })])
    expect(kept(r)).toHaveLength(1)
    expect(kept(r)[0].label).toBe('first')
    expect(r.messages).toEqual([expect.stringContaining('provider 2: id "gw" is already used')])
  })

  it('refuses an unknown protocol and keeps the other entries', () => {
    const r = cleanProviders([entry({ protocol: 'soap' }), entry({ id: 'ok', protocol: 'anthropic' })])
    expect(kept(r).map((p) => p.id)).toEqual(['ok'])
    expect(r.messages[0]).toContain('unknown protocol')
  })

  it('keeps a good entry whose optional fields are wrong, using the defaults, and says so', () => {
    const r = cleanProviders([entry({ label: 3, models: 'x', needs_key: 'yes' })])
    expect(kept(r)[0]).toMatchObject({ label: 'gw', models: [], needs_key: true })
    expect(r.messages).toHaveLength(3)
  })

  it('reports an unknown field, and a secret-like field with the secrets message and never its value', () => {
    const r = cleanProviders([entry({ extra: 1, api_key: 'SECRET-123', Token: 'SECRET-456', authorization: 'Bearer SECRET-789' })])
    expect(kept(r)).toHaveLength(1)
    expect(r.messages).toHaveLength(4)
    expect(r.messages.filter((m) => m.includes(SECRETS_MESSAGE))).toHaveLength(3)
    expect(r.messages.some((m) => m.includes('unknown field "extra"'))).toBe(true)
    expect(JSON.stringify(r)).not.toContain('SECRET-')
    expect(JSON.stringify(r)).not.toContain('Bearer')
  })

  it('drops the value for an empty list, for no valid entry and for a non-list, so the built-ins stay', () => {
    for (const value of [[], [{ id: 'x' }], 'gw', {}]) {
      const r = cleanProviders(value)
      expect(r.value, JSON.stringify(value)).toBeUndefined()
      expect(r.messages.at(-1)).toContain('built-in providers are used')
    }
  })

  it('does not accept a non-map entry', () => {
    const r = cleanProviders(['gw', entry()])
    expect(kept(r)).toHaveLength(1)
    expect(r.messages[0]).toContain('provider 1: expected a map')
  })
})

describe('isSecretLikeKey', () => {
  it('matches a separate secret word in any case or style', () => {
    for (const name of ['key', 'api_key', 'apiKey', 'api-key', 'API_KEY', 'token', 'access_token', 'Secret', 'client_secret', 'password', 'passwd', 'authorization', 'apikey', 'bearer_token']) {
      expect(isSecretLikeKey(name), name).toBe(true)
    }
  })

  it('does not match a name that only contains the letters', () => {
    for (const name of ['keyboard', 'monkey', 'tokenizer', 'passport', 'base_url', 'models', 'needs_key_hint'.replace('key', 'kay')]) {
      expect(isSecretLikeKey(name), name).toBe(false)
    }
  })
})

describe('checkDefault', () => {
  const builtin = ['openai', 'anthropic', 'ollama']
  const listed = { assistant: { providers: [{ id: 'gw' }, { id: 'two' }] } }

  it('is fine when unset, or when it names a listed provider', () => {
    expect(checkDefault({}, builtin)).toEqual([])
    expect(checkDefault({ assistant: { ...listed.assistant, default: { provider: 'two' } } }, builtin)).toEqual([])
    expect(checkDefault({ assistant: { default: { provider: 'ollama' } } }, builtin)).toEqual([])
  })

  it('reports a provider that is not offered, naming the offered ones', () => {
    const m = checkDefault({ assistant: { ...listed.assistant, default: { provider: 'openai' } } }, builtin)
    expect(m).toEqual([expect.stringContaining('"openai" is not one of the offered providers (gw, two)')])
    expect(checkDefault({ assistant: { default: { provider: 'nope' } } }, builtin)[0]).toContain('(openai, anthropic, ollama)')
  })
})

describe('bounds', () => {
  it('state today\'s values as the defaults, inside the bounds', () => {
    expect(ASSISTANT_LIMITS.round_trips.default).toBe(6)
    expect(ASSISTANT_LIMITS.preview_rows.default).toBe(1000)
    expect(ASSISTANT_LIMITS.model_rows.default).toBe(50)
    for (const b of Object.values(ASSISTANT_LIMITS)) {
      expect(b.min).toBeLessThanOrEqual(b.default)
      expect(b.default).toBeLessThanOrEqual(b.max)
    }
    expect(MAX_PROMPT_ADDENDUM).toBe(2000)
    expect(PROVIDER_ID_PATTERN.test('agency-gateway_2')).toBe(true)
    expect(PROVIDER_ID_PATTERN.test('x'.repeat(41))).toBe(false)
  })
})

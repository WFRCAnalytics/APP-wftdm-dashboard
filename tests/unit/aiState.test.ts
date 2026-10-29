import { afterEach, describe, expect, it } from 'vitest'

import type { ProviderEntry } from '../../src/config'
import { configureAssistant, resetAssistantPolicy } from '../../src/services/ai/assistantPolicy'
import {
  __resetAiSettings,
  applyAssistantPolicy,
  endDemo,
  getAiSettings,
  getPreset,
  getProviderPresets,
  patchDraft,
  PROVIDER_PRESETS,
  saveDraft,
  setDraftProvider,
  startDemo,
} from '../../src/state/aiState'

afterEach(() => {
  resetAssistantPolicy()
  __resetAiSettings()
})

const gw = (extra: Partial<ProviderEntry> = {}): ProviderEntry => ({ id: 'gw', label: 'Gateway', base_url: 'https://llm.example.org/v1', models: ['m1'], needs_key: true, protocol: 'openai', ...extra })

describe('the built-in catalogue (nothing configured)', () => {
  it('starts on OpenAI with its address and model, as before', () => {
    expect(getAiSettings().draft).toEqual({ provider: 'openai', protocol: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4.1' })
    expect(getProviderPresets().map((p) => p.id)).toEqual(['openai', 'anthropic', 'deepseek', 'demo', 'ollama'])
    expect(Object.keys(PROVIDER_PRESETS)).toEqual(['openai', 'anthropic', 'deepseek', 'demo', 'ollama'])
  })

  it('switching provider refills the address, model and protocol and clears the token', () => {
    setDraftProvider('anthropic')
    expect(getAiSettings().draft).toEqual({ provider: 'anthropic', protocol: 'anthropic', baseUrl: 'https://api.anthropic.com', apiKey: '', model: 'claude-sonnet-5-5' })
  })

  it('the demo starts and ends as before', () => {
    startDemo()
    expect(getAiSettings().saved).toMatchObject({ provider: 'demo', baseUrl: 'demo://local', model: 'scripted' })
    expect(getAiSettings().status).toBe('ready')
    endDemo()
    expect(getAiSettings().saved).toBeUndefined()
    expect(getAiSettings().draft.provider).toBe('openai')
  })
})

describe('a configured catalogue', () => {
  it('starts on the default provider and model once the policy is applied', () => {
    configureAssistant({ providers: [gw(), gw({ id: 'two', base_url: 'https://two.example.org', protocol: 'anthropic', models: ['x'] })], default: { provider: 'two', model: 'typed' } })
    applyAssistantPolicy()
    expect(getAiSettings().draft).toEqual({ provider: 'two', protocol: 'anthropic', baseUrl: 'https://two.example.org', apiKey: '', model: 'typed' })
    expect(getProviderPresets().map((p) => p.id)).toEqual(['gw', 'two'])
  })

  it('switching provider fills that provider\'s address, model and protocol', () => {
    configureAssistant({ providers: [gw(), gw({ id: 'two', base_url: 'https://two.example.org', protocol: 'anthropic', models: ['x'] })] })
    applyAssistantPolicy()
    setDraftProvider('two')
    expect(getAiSettings().draft).toMatchObject({ provider: 'two', protocol: 'anthropic', baseUrl: 'https://two.example.org', model: 'x' })
  })

  it('an id that is not offered gives the default provider', () => {
    configureAssistant({ providers: [gw()] })
    expect(getPreset('openai').id).toBe('gw')
  })

  it('the demo cannot be started when it is not offered', () => {
    configureAssistant({ providers: [gw()] })
    applyAssistantPolicy()
    startDemo()
    expect(getAiSettings().saved).toBeUndefined()
    expect(getAiSettings().draft.provider).toBe('gw')
  })
})

describe('the address lock in the form state', () => {
  it('ignores an address edit while a list is in force, and still takes a model and a token', () => {
    configureAssistant({ providers: [gw()] })
    applyAssistantPolicy()
    patchDraft({ baseUrl: 'https://evil.example.org', model: 'typed', apiKey: 'tok' })
    expect(getAiSettings().draft).toMatchObject({ baseUrl: 'https://llm.example.org/v1', model: 'typed', apiKey: 'tok' })
  })

  it('takes an address edit as before when no list is in force', () => {
    patchDraft({ baseUrl: 'https://my.proxy.example.org/v1' })
    expect(getAiSettings().draft.baseUrl).toBe('https://my.proxy.example.org/v1')
  })

  it('does not save a draft whose address is not a listed provider\'s', () => {
    configureAssistant({ providers: [gw()] })
    applyAssistantPolicy()
    // a stale draft (as if from before the list) pointing elsewhere
    setDraftProvider('gw')
    ;(getAiSettings().draft as { baseUrl: string }).baseUrl = 'https://evil.example.org'
    saveDraft()
    expect(getAiSettings().saved).toBeUndefined()
    expect(getAiSettings().status).toBe('error')
  })

  it('saves a draft on a listed address', () => {
    configureAssistant({ providers: [gw()] })
    applyAssistantPolicy()
    saveDraft()
    expect(getAiSettings().saved).toMatchObject({ provider: 'gw', baseUrl: 'https://llm.example.org/v1' })
    expect(getAiSettings().status).toBe('ready')
  })
})

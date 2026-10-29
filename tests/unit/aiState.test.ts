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
  PROVIDER_PRESETS,
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

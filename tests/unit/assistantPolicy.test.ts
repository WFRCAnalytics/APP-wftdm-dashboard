import { afterEach, describe, expect, it } from 'vitest'

import type { ProviderEntry } from '../../src/config'
import {
  BUILTIN_PRESETS,
  configureAssistant,
  getDefaultProvider,
  getLimits,
  getProviderCatalogue,
  getPromptNote,
  isAddressAllowed,
  isLocked,
  resetAssistantPolicy,
} from '../../src/services/ai/assistantPolicy'

afterEach(() => resetAssistantPolicy())

const gw = (extra: Partial<ProviderEntry> = {}): ProviderEntry => ({ id: 'gw', label: 'Gateway', base_url: 'https://llm.example.org/v1', models: ['m1', 'm2'], needs_key: true, protocol: 'openai', ...extra })

describe('with nothing configured', () => {
  it('is what the assistant always was', () => {
    expect(getProviderCatalogue().map((p) => p.id)).toEqual(['openai', 'anthropic', 'deepseek', 'demo', 'ollama'])
    expect(getDefaultProvider().id).toBe('openai')
    expect(isLocked()).toBe(false)
    expect(getPromptNote()).toBeUndefined()
    expect(getLimits()).toEqual({ roundTrips: 6, previewRows: 1000, modelRows: 50 })
    expect(isAddressAllowed('https://anything.example.org/x')).toBe(true)
  })

  it('keeps the built-in protocols, so Anthropic keeps its own message format', () => {
    expect(Object.fromEntries(BUILTIN_PRESETS.map((p) => [p.id, p.protocol]))).toEqual({ openai: 'openai', anthropic: 'anthropic', deepseek: 'openai', demo: 'openai', ollama: 'openai' })
    expect(BUILTIN_PRESETS.every((p) => !p.locked)).toBe(true)
  })

  it('applies a default provider and model to the built-ins', () => {
    configureAssistant({ default: { provider: 'ollama', model: 'qwen3' } })
    expect(getDefaultProvider()).toMatchObject({ id: 'ollama', model: 'qwen3' })
    expect(isLocked()).toBe(false)
  })
})

describe('with a deployer list', () => {
  it('replaces the built-ins, in order, locked, with the first listed provider as the default', () => {
    configureAssistant({ providers: [gw(), gw({ id: 'two', base_url: 'https://two.example.org', needs_key: false, protocol: 'anthropic', models: [] })] })
    expect(getProviderCatalogue().map((p) => p.id)).toEqual(['gw', 'two'])
    expect(getProviderCatalogue().every((p) => p.locked)).toBe(true)
    expect(isLocked()).toBe(true)
    expect(getDefaultProvider()).toMatchObject({ id: 'gw', model: 'm1', baseUrl: 'https://llm.example.org/v1', needsKey: true, protocol: 'openai' })
    expect(getProviderCatalogue()[1]).toMatchObject({ needsKey: false, protocol: 'anthropic', model: '' })
  })

  it('uses the configured default provider and model, and falls back to the first for an unknown one', () => {
    configureAssistant({ providers: [gw(), gw({ id: 'two', base_url: 'https://two.example.org' })], default: { provider: 'two', model: 'typed-model' } })
    expect(getDefaultProvider()).toMatchObject({ id: 'two', model: 'typed-model' })
    expect(getProviderCatalogue().find((p) => p.id === 'gw')?.model).toBe('m1')
    configureAssistant({ providers: [gw()], default: { provider: 'nope', model: 'x' } })
    expect(getDefaultProvider()).toMatchObject({ id: 'gw', model: 'm1' })
  })

  it('treats an empty list as no list', () => {
    configureAssistant({ providers: [] })
    expect(isLocked()).toBe(false)
    expect(getProviderCatalogue()).toBe(BUILTIN_PRESETS)
  })

  it('allows only an address under a listed provider, and refuses look-alike hosts', () => {
    configureAssistant({ providers: [gw()] })
    expect(isAddressAllowed('https://llm.example.org/v1/chat/completions')).toBe(true)
    expect(isAddressAllowed('https://llm.example.org/v1')).toBe(true)
    expect(isAddressAllowed('https://llm.example.org/v1/')).toBe(true)
    expect(isAddressAllowed('HTTPS://LLM.EXAMPLE.ORG/v1/models')).toBe(true)
    for (const url of [
      'https://api.openai.com/v1/chat/completions',
      'https://llm.example.org/v1evil/x',
      'https://llm.example.org.evil.com/v1/x',
      'https://llm.example.org@evil.com/v1/x',
      'http://llm.example.org/v1/x',
      'https://llm.example.org/v2/x',
      '',
    ]) {
      expect(isAddressAllowed(url), url).toBe(false)
    }
  })
})

describe('note and limits', () => {
  it('trims the note and ignores an empty one', () => {
    configureAssistant({ promptAddendum: '  Our zones are called TAZs.  ' })
    expect(getPromptNote()).toBe('Our zones are called TAZs.')
    configureAssistant({ promptAddendum: '   ' })
    expect(getPromptNote()).toBeUndefined()
  })

  it('takes a limit inside its bounds and the default for anything else', () => {
    configureAssistant({ limits: { roundTrips: 3, previewRows: 200, modelRows: 20 } })
    expect(getLimits()).toEqual({ roundTrips: 3, previewRows: 200, modelRows: 20 })
    configureAssistant({ limits: { roundTrips: 99, previewRows: 5, modelRows: 2.5 } })
    expect(getLimits()).toEqual({ roundTrips: 6, previewRows: 1000, modelRows: 50 })
    configureAssistant({ limits: { roundTrips: 12, previewRows: 5000, modelRows: 200 } })
    expect(getLimits()).toEqual({ roundTrips: 12, previewRows: 5000, modelRows: 200 })
  })

  it('goes back to the defaults on reset', () => {
    configureAssistant({ providers: [gw()], promptAddendum: 'x', limits: { roundTrips: 2 } })
    resetAssistantPolicy()
    expect(isLocked()).toBe(false)
    expect(getPromptNote()).toBeUndefined()
    expect(getLimits().roundTrips).toBe(6)
  })
})

describe('the built-in provider ids', () => {
  it('are the same in the pure config module and the runtime presets', async () => {
    const { BUILTIN_PROVIDER_IDS } = await import('../../src/config')
    expect([...BUILTIN_PROVIDER_IDS]).toEqual(BUILTIN_PRESETS.map((p) => p.id))
  })
})

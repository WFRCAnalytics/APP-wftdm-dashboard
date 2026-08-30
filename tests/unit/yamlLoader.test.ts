import { describe, it, expect, vi, afterEach } from 'vitest'
import { loadConfig, loadManifest } from '../../src/services/yamlLoader.ts'

interface FakeResponse {
  ok: boolean
  status: number
  text: () => Promise<string>
}

function mockFetch(response: FakeResponse): void {
  globalThis.fetch = vi.fn().mockResolvedValue(response) as unknown as typeof fetch
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('yamlLoader.loadConfig', () => {
  it('fetches at call time and parses YAML into the raw object structure', async () => {
    mockFetch({ ok: true, status: 200, text: async () => 'foo:\n  bar: 1\n  baz: two\n' })

    const result = await loadConfig('https://example.test/dashboard-1-summary.yaml')

    expect(result.raw).toEqual({ foo: { bar: 1, baz: 'two' } })
    expect(result.sourcePath).toBe('https://example.test/dashboard-1-summary.yaml')
  })

  it('rejects with an error identifying the URL on malformed YAML', async () => {
    mockFetch({ ok: true, status: 200, text: async () => 'foo: [unterminated' })

    await expect(loadConfig('https://example.test/bad.yaml')).rejects.toThrow(
      /https:\/\/example\.test\/bad\.yaml/,
    )
  })

  it('rejects when the fetch itself fails (non-ok response)', async () => {
    mockFetch({ ok: false, status: 404, text: async () => '' })

    await expect(loadConfig('https://example.test/missing.yaml')).rejects.toThrow(/404/)
  })
})

describe('yamlLoader.loadManifest', () => {
  it('has the same fetch+parse mechanics as loadConfig', async () => {
    mockFetch({ ok: true, status: 200, text: async () => 'scenario_name: observed\n' })

    const result = await loadManifest('https://example.test/manifest.yaml')

    expect(result.raw).toEqual({ scenario_name: 'observed' })
  })
})

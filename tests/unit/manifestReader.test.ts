// T014 (009-scenario-manager): readManifest()'s ManifestReadResult —
// distinguishes "no manifest.yaml file" from "manifest.yaml exists but
// failed to parse" all the way out (the bug fixed during contract review —
// contracts/scenario-manager.md's header), not just internally.
import { describe, expect, it } from 'vitest'
import { readManifest } from '../../src/scenario/manifestReader.ts'

/** Minimal FileSystemDirectoryHandle/FileSystemFileHandle stand-in — only
 * the surface readManifest() actually calls (research.md §2's own testing
 * strategy: a plain JS object literal satisfies the shape). */
function fakeDirHandle(name: string, manifestText: string | null): FileSystemDirectoryHandle {
  return {
    name,
    async getFileHandle(fileName: string) {
      if (fileName !== 'manifest.yaml' || manifestText === null) {
        throw new DOMException('not found', 'NotFoundError')
      }
      return {
        async getFile() {
          return { async text() { return manifestText } } as unknown as File
        },
      } as unknown as FileSystemFileHandle
    },
  } as unknown as FileSystemDirectoryHandle
}

describe('manifestReader.readManifest', () => {
  it('returns status: ok with the parsed fields for a valid manifest', async () => {
    const dirHandle = fakeDirHandle(
      'good_scenario',
      'scenario_name: good_scenario\nrun_date: 2026-06-15\ncolor: "#4e79a7"\nnotes: Fixture\n',
    )
    const result = await readManifest(dirHandle)
    expect(result).toEqual({
      status: 'ok',
      manifest: {
        scenarioName: 'good_scenario',
        runDate: '2026-06-15',
        color: '#4e79a7',
        notes: 'Fixture',
      },
    })
  })

  it('returns status: ok with only the present fields for a partial manifest', async () => {
    const dirHandle = fakeDirHandle('partial', 'scenario_name: partial\n')
    const result = await readManifest(dirHandle)
    expect(result).toEqual({
      status: 'ok',
      manifest: { scenarioName: 'partial', runDate: undefined, color: undefined, notes: undefined },
    })
  })

  it('returns status: missing when manifest.yaml is not present', async () => {
    const dirHandle = fakeDirHandle('no_manifest', null)
    const result = await readManifest(dirHandle)
    expect(result).toEqual({ status: 'missing' })
  })

  it('returns status: invalid with a real, non-empty message on malformed YAML', async () => {
    const dirHandle = fakeDirHandle('broken', 'scenario_name: [unterminated')
    const result = await readManifest(dirHandle)
    expect(result.status).toBe('invalid')
    if (result.status === 'invalid') {
      expect(result.message).toBeTruthy()
      expect(typeof result.message).toBe('string')
    }
  })

  it('returns status: invalid when the YAML parses to a non-object (e.g. a bare scalar)', async () => {
    const dirHandle = fakeDirHandle('scalar_only', 'just_a_string\n')
    const result = await readManifest(dirHandle)
    expect(result.status).toBe('invalid')
  })

  it('the missing and invalid variants are distinguishable, not both null-equivalent', async () => {
    const missing = await readManifest(fakeDirHandle('a', null))
    const invalid = await readManifest(fakeDirHandle('b', 'not: [valid'))
    expect(missing.status).not.toBe(invalid.status)
  })
})

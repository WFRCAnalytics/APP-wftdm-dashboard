// 009-scenario-manager: reads manifest.yaml directly from a picked
// FileSystemDirectoryHandle (not a URL fetch — services/yamlLoader.ts's
// loadConfig/loadManifest are fetch-only, research.md §4). See
// contracts/scenario-manager.md.
import { parseYAMLText } from '@/services/yamlLoader'

export interface ParsedManifest {
  scenarioName?: string
  runDate?: string
  color?: string
  notes?: string
}

/**
 * Distinguishes "no manifest.yaml file" from "manifest.yaml exists but
 * failed to parse (or didn't parse to an object)" — collapsing these into
 * one null/undefined return was a real bug found and fixed during this
 * feature's contract review (contracts/scenario-manager.md's header): the
 * caller needs the specific parse-error message to produce an actionable
 * console warning, not just "unreadable."
 */
export type ManifestReadResult =
  | { status: 'ok'; manifest: ParsedManifest }
  | { status: 'missing' }
  | { status: 'invalid'; message: string }

/**
 * Reads manifest.yaml directly from a picked directory handle. Never
 * throws — every failure path returns a ManifestReadResult variant;
 * scenarioManager.ts's caller falls back to the folder's own name on
 * either 'missing' or 'invalid' (FR-005), but logs a different, specific
 * message for each.
 */
export async function readManifest(
  dirHandle: FileSystemDirectoryHandle,
): Promise<ManifestReadResult> {
  let text: string
  try {
    const fileHandle = await dirHandle.getFileHandle('manifest.yaml')
    const file = await fileHandle.getFile()
    text = await file.text()
  } catch {
    return { status: 'missing' }
  }

  let raw: unknown
  try {
    raw = parseYAMLText(text, `${dirHandle.name}/manifest.yaml`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { status: 'invalid', message }
  }

  if (typeof raw !== 'object' || raw === null) {
    return { status: 'invalid', message: 'manifest.yaml did not parse to an object' }
  }
  const obj = raw as Record<string, unknown>
  return {
    status: 'ok',
    manifest: {
      scenarioName: typeof obj.scenario_name === 'string' ? obj.scenario_name : undefined,
      runDate: asDateString(obj.run_date),
      color: typeof obj.color === 'string' ? obj.color : undefined,
      notes: typeof obj.notes === 'string' ? obj.notes : undefined,
    },
  }
}

/**
 * js-yaml's default schema parses an unquoted `run_date: 2026-06-15` value
 * (docs/SPEC.md's/CLAUDE.md's own manifest.yaml examples are written
 * exactly this way, unquoted) as a native JS Date, not a string — found by
 * this feature's own manifestReader.test.ts against that real example
 * shape, not assumed. YAML 1.1 date-only timestamps are defined as UTC
 * midnight, so slicing toISOString()'s first 10 characters round-trips
 * back to the original "YYYY-MM-DD" with no timezone drift. A quoted
 * manifest.yaml value (already a string) passes through unchanged either
 * way.
 */
function asDateString(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return undefined
}

// 009-scenario-manager: closes services/duckdb.ts's registerScenario()'s
// zero-callers gap (open since 001-data-state-layer). See
// specs/009-scenario-manager/contracts/scenario-manager.md.
import { registerScenario, unregisterScenario } from '@/services/duckdb'
import * as appState from '@/state/appState'
import { readManifest } from '@/scenario/manifestReader'

/** WEB vs LOCAL deployment mode (docs/SPEC.md) — research.md §5. */
export function isLocalDeployment(): boolean {
  return window.location.hostname === 'localhost'
}

/**
 * Chrome/Edge only (docs/ARCHITECTURE.md) — feature-detected, not
 * assumed. Used by scenarioLoader.tsx's US2 disabled/tooltip branch.
 */
export function supportsLocalFolderLoading(): boolean {
  return typeof window.showDirectoryPicker === 'function'
}

export type LoadResult =
  | { outcome: 'registered'; name: string }
  | { outcome: 'collision'; name: string }
  | { outcome: 'cancelled' }
  | { outcome: 'failed'; name: string; reason: unknown }

/**
 * FR-006's collision rule, factored out as a pure decision (not inlined in
 * loadLocalScenario()) so it's Vitest-testable without a real
 * showDirectoryPicker() call (research.md §2's own testing-strategy
 * reasoning, applied here too — not just to the Playwright-vs-unit split
 * for the full flow). A collision with an already-registered *published*
 * scenario is rejected — silently overwriting a possibly-in-use published
 * scenario with an unrelated local folder that merely shares its name
 * would be a data-integrity problem, not a convenience. A collision with
 * an already-loaded *local* scenario of the same name is allowed to
 * proceed — appState.register()'s/registerScenario()'s own existing
 * "replace cleanly" behavior handles that refresh case with no new code.
 */
export function classifyCollision(name: string): 'reject' | 'proceed' {
  const existing = appState.get(name)
  if (existing && existing.source === 'url') return 'reject'
  return 'proceed'
}

/**
 * Runs the full pick -> read manifest -> collision check -> register ->
 * activate flow (FR-003 through FR-007). A user-cancelled picker resolves
 * to {outcome: 'cancelled'} — showDirectoryPicker() rejects with an
 * AbortError in that case, distinguished here from a real failure.
 */
export async function loadLocalScenario(): Promise<LoadResult> {
  if (!window.showDirectoryPicker) {
    // Defensive — scenarioLoader.tsx only calls this from the
    // supportsLocalFolderLoading()-gated path, but this function makes no
    // assumption about its own caller.
    return { outcome: 'failed', name: '(unknown)', reason: new Error('showDirectoryPicker unsupported') }
  }

  let dirHandle: FileSystemDirectoryHandle
  try {
    dirHandle = await window.showDirectoryPicker()
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { outcome: 'cancelled' }
    }
    return { outcome: 'failed', name: '(unknown)', reason: err }
  }

  const manifestResult = await readManifest(dirHandle)
  if (manifestResult.status === 'missing') {
    console.warn(`scenarioManager: "${dirHandle.name}" has no manifest.yaml — using folder name`)
  } else if (manifestResult.status === 'invalid') {
    // Distinct, specific message (the fix required during this feature's
    // own contract review) — an analyst debugging their own malformed
    // manifest.yaml needs the actual parse error, not just "unreadable."
    console.warn(
      `scenarioManager: "${dirHandle.name}"'s manifest.yaml failed to parse (${manifestResult.message}) — using folder name`,
    )
  }
  const manifest = manifestResult.status === 'ok' ? manifestResult.manifest : undefined
  const name = manifest?.scenarioName ?? dirHandle.name

  if (classifyCollision(name) === 'reject') {
    return { outcome: 'collision', name }
  }

  appState.register(name, {
    runDate: manifest?.runDate,
    color: manifest?.color,
    notes: manifest?.notes,
    source: 'handle',
  })

  try {
    await registerScenario(name, dirHandle)
    appState.setStatus(name, 'ready')
    appState.setActive(name, true) // FR-007 — immediate, unlike published scenarios
    return { outcome: 'registered', name }
  } catch (err) {
    appState.setStatus(name, 'failed')
    console.warn(`scenarioManager: failed to register "${name}"`, err)
    return { outcome: 'failed', name, reason: err }
  }
}

/** FR-009's remove control. */
export async function removeLocalScenario(name: string): Promise<void> {
  await unregisterScenario(name)
  appState.unregister(name)
}

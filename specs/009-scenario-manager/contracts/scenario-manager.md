# Contract: Scenario Manager (local folder loading)

Full-body code for every new/modified module. Not illustrative pseudocode —
this is the actual shape `tasks.md`/implementation should produce, per this
project's established contract discipline (008's contracts file was
rewritten to this same standard after two real bugs were found in an
earlier, sketch-shaped draft — see `specs/008-sankey-panel/contracts/
sankey-panel.md`'s own header for that precedent).

**Fixed during this contract's own review, before `tasks.md`**:
`manifestReader.ts`'s `readManifest()` originally collapsed "no
`manifest.yaml` file" and "`manifest.yaml` exists but failed to parse"
into the same `null` return, even though the two `catch` blocks already
distinguished them internally — the parse-failure branch had a real,
specific `Error` message available (`parseYAMLText`'s own contextualized
message) and discarded it. `scenarioManager.ts`'s `console.warn` then
always reported "no readable manifest.yaml" even when the real problem
was a malformed file with a diagnosable cause — actively misleading for
an analyst debugging their own `manifest.yaml`. Fixed below by replacing
the `ParsedManifest | null` return with a discriminated
`ManifestReadResult`, so the two failure modes stay distinguishable all
the way out to the console warning.

## `state/appState.ts` (MODIFIED — additive only)

```ts
// ... existing exports (register/setStatus/setActive/get/list/getActive/
// unregister) unchanged in signature and behavior ...

export type ScenarioSubscriber = () => void
export type Unsubscribe = () => void

const subscribers = new Set<ScenarioSubscriber>()

function notify(): void {
  for (const fn of subscribers) fn()
}

/**
 * Registers `fn` to be called (with no arguments — callers re-read via
 * getActive() themselves, mirroring filterState.ts's own id-based
 * subscribers) after any register()/setStatus()/setActive()/unregister()
 * call. No per-scenario-id targeting (unlike filterState.ts's subscribe)
 * — every existing consumer of getActive() reads the whole active list as
 * one unit (research.md §1), so a single wildcard subscriber set is the
 * right granularity, not a gap relative to filterState.ts's richer shape.
 */
export function subscribe(fn: ScenarioSubscriber): Unsubscribe {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}
```

Each of `register`, `setStatus`, `setActive`, `unregister` gets one added
line, `notify()`, as its last statement — no other change to any of the
four. The file's header comment ("No pub/sub here... no FR requires it")
is corrected to note FR-008 (`009-scenario-manager`) is the first FR that
does, per research.md §1's reasoning.

## `hooks/useActiveScenarios.ts` (NEW)

```ts
import { useCallback, useRef, useSyncExternalStore } from 'react'

import { getActive, subscribe } from '@/state/appState'

/**
 * Subscribes to appState's active-scenario set and returns the current
 * list of active scenario names, re-rendering only when that list
 * actually changes (by content, not by getActive() call identity — it
 * builds a new array every call). Mirrors useFilterState.ts's exact
 * memoized-snapshot-over-useSyncExternalStore shape (research.md §1) —
 * deliberately the same pattern applied to a second store, not a new one.
 */
export function useActiveScenarios(): string[] {
  const cache = useRef<string[]>([])

  const getSnapshot = useCallback(() => {
    const next = getActive().map((s) => s.name)
    const prev = cache.current
    const changed =
      next.length !== prev.length || next.some((name, i) => name !== prev[i])
    if (changed) cache.current = next
    return cache.current
  }, [])

  return useSyncExternalStore(subscribe, getSnapshot)
}
```

## `services/yamlLoader.ts` (MODIFIED — one factored-out export)

```ts
// ... existing imports unchanged ...

/**
 * Parses `text` as YAML, throwing a contextualized error naming
 * `sourceLabel` on failure. Factored out of loadConfig (research.md §4)
 * so manifestReader.ts's handle-based reading path can share the same
 * parse-with-context behavior instead of duplicating it.
 */
export function parseYAMLText(text: string, sourceLabel: string): unknown {
  try {
    return parseYAML(text)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`parseYAMLText: malformed YAML at ${sourceLabel}: ${message}`)
  }
}

export async function loadConfig(url: string): Promise<DashboardConfig> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`loadConfig: ${url} -> ${res.status}`)
  }
  const text = await res.text()
  const raw = parseYAMLText(text, url)
  return { raw, sourcePath: url }
}

// loadManifest, loadDashboards unchanged.
```

## `src/scenario/manifestReader.ts` (NEW)

```ts
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
 * one null/undefined return was a real bug found during this contract's
 * own review (see this file's header): the caller needs the specific
 * parse-error message to produce an actionable console warning, not just
 * "unreadable."
 */
export type ManifestReadResult =
  | { status: 'ok'; manifest: ParsedManifest }
  | { status: 'missing' }
  | { status: 'invalid'; message: string }

/**
 * Reads manifest.yaml directly from a picked directory handle (not a URL
 * fetch — research.md §4). Never throws — every failure path returns a
 * ManifestReadResult variant; scenarioManager.ts's caller falls back to
 * the folder's own name on either 'missing' or 'invalid' (FR-005), but
 * logs a different, specific message for each.
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
      runDate: typeof obj.run_date === 'string' ? obj.run_date : undefined,
      color: typeof obj.color === 'string' ? obj.color : undefined,
      notes: typeof obj.notes === 'string' ? obj.notes : undefined,
    },
  }
}
```

## `src/scenario/scenarioManager.ts` (NEW)

```ts
import { registerScenario } from '@/services/duckdb'
import * as appState from '@/state/appState'
import { readManifest } from '@/scenario/manifestReader'

export type LoadResult =
  | { outcome: 'registered'; name: string }
  | { outcome: 'collision'; name: string }
  | { outcome: 'cancelled' }
  | { outcome: 'failed'; name: string; reason: unknown }

/** WEB vs LOCAL deployment mode (project-docs/SPEC.md) — research.md §5. */
export function isLocalDeployment(): boolean {
  return window.location.hostname === 'localhost'
}

export function supportsLocalFolderLoading(): boolean {
  return typeof window.showDirectoryPicker === 'function'
}

/**
 * Runs the full pick -> read manifest -> collision check -> register ->
 * activate flow (FR-003 through FR-007). A user-cancelled picker resolves
 * to {outcome: 'cancelled'} — showDirectoryPicker() rejects with an
 * AbortError in that case, distinguished here from a real failure.
 */
export async function loadLocalScenario(): Promise<LoadResult> {
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
    console.warn(
      `scenarioManager: "${dirHandle.name}" has no manifest.yaml — using folder name`,
    )
  } else if (manifestResult.status === 'invalid') {
    // Distinct, specific message (the fix this contract review required) —
    // an analyst debugging their own malformed manifest.yaml needs the
    // actual parse error, not just "unreadable."
    console.warn(
      `scenarioManager: "${dirHandle.name}"'s manifest.yaml failed to parse (${manifestResult.message}) — using folder name`,
    )
  }
  const manifest = manifestResult.status === 'ok' ? manifestResult.manifest : undefined
  const name = manifest?.scenarioName ?? dirHandle.name

  // FR-006: collision handling (research.md §3).
  const existing = appState.get(name)
  if (existing && existing.source === 'url') {
    return { outcome: 'collision', name }
  }
  // existing?.source === 'handle' -> allowed, replaces cleanly below
  // (appState.register()/registerScenario()'s own existing behavior).

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
  const { unregisterScenario } = await import('@/services/duckdb')
  await unregisterScenario(name)
  appState.unregister(name)
}
```

## `src/layout/scenarioLoader.tsx` (NEW)

**Two things this sketch's original draft got wrong, found and fixed
during implementation (not caught in review — see research.md §6)**:
1. Radix's `Tooltip.Root` (installed `@radix-ui/react-tooltip`) throws
   without a `TooltipProvider` ancestor — confirmed empirically via an
   uncaught error crashing the whole React tree in Playwright (no error
   boundary around `Shell`). The disabled-branch `<Tooltip>` below MUST be
   wrapped in a locally scoped `<TooltipProvider>`.
2. The disabled `Button`'s own `disabled:pointer-events-none` (Tailwind,
   `components/ui/button.tsx`) means the button itself cannot receive the
   hover that drives the tooltip — the wrapping `<span>` is the real
   hoverable/`asChild` target and needs a `data-testid` so tests can hover
   it specifically, not the inert button inside it.

```tsx
import { useState } from 'react'
import { FolderOpen, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  isLocalDeployment,
  loadLocalScenario,
  removeLocalScenario,
  supportsLocalFolderLoading,
} from '@/scenario/scenarioManager'
import { useActiveScenarios } from '@/hooks/useActiveScenarios'
import * as appState from '@/state/appState'

// Mounted in shell.tsx's header, alongside NavBar (FR-001) — dashboard-
// wide, not panel-specific. Hidden entirely (not disabled) in LOCAL
// deployment mode (research.md §1 of spec.md's Documented behavior
// findings): that mode has its own file-serving path already.
export function ScenarioLoader() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Re-renders when the active set changes (any scenario, not just local
  // ones) so a locally loaded entry's status reflects promptly — cheap,
  // since this component itself holds no per-panel query state to lose.
  useActiveScenarios()

  if (isLocalDeployment()) return null

  const localScenarios = appState.list().filter((s) => s.source === 'handle')
  const supported = supportsLocalFolderLoading()

  async function handleClick() {
    setBusy(true)
    setError(null)
    const result = await loadLocalScenario()
    setBusy(false)
    if (result.outcome === 'collision') {
      setError(`"${result.name}" is already a published scenario name`)
    } else if (result.outcome === 'failed') {
      setError(`Couldn't load "${result.name}"`)
    }
    // 'registered' and 'cancelled' need no message (FR-003).
  }

  return (
    <div className="flex items-center gap-2">
      {supported ? (
        <Button variant="outline" size="sm" onClick={handleClick} disabled={busy}>
          <FolderOpen className="h-4 w-4" />
          Load Local Scenario
        </Button>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button variant="outline" size="sm" disabled>
                <FolderOpen className="h-4 w-4" />
                Load Local Scenario
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Requires Chrome or Edge</TooltipContent>
        </Tooltip>
      )}
      {error && <span className="text-sm text-destructive">{error}</span>}
      {localScenarios.map((s) => (
        <div key={s.name} className="flex items-center gap-1 rounded-md border px-2 py-1 text-sm">
          <span>{s.name}</span>
          <span className="text-muted-foreground">({s.status})</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => removeLocalScenario(s.name)}
            aria-label={`Remove ${s.name}`}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}
    </div>
  )
}
```

`shell.tsx`'s header gains `<ScenarioLoader />` as a sibling to `<NavBar
.../>`, inside the existing `<header>` element — no change to `NavBar`
itself.

## Panel diff (representative — identical mechanical change across all
five data-bound panel types)

`PlotlyPanel.tsx` (others: `ValueBoxPanel.tsx`, `TablePanel.tsx`,
`ObservablePlotPanel.tsx`, `SankeyPanel.tsx` — same three-line shape each):

```diff
+import { useActiveScenarios } from '@/hooks/useActiveScenarios'
-import * as appState from '@/state/appState'

 export function PlotlyPanel({ config }: { config: PlotlyPanelConfig }) {
   const filterIds = extractGlobalFilterIds(config.filter)
   const filters = useFilterState(filterIds.length ? filterIds : ALL_FILTERS)
+  const activeScenarioNames = useActiveScenarios()
   const containerRef = useRef<HTMLDivElement>(null)
   const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')

   useEffect(() => {
     let cancelled = false
     setStatus('loading')

     const template = buildPanelQuery(config, filters)
-    const activeScenarios = resolveActiveScenarios(
-      config,
-      appState.getActive().map((s) => s.name),
-    )
+    const activeScenarios = resolveActiveScenarios(config, activeScenarioNames)
     const sql = sqlExpander.expand(template, EMPTY_SUMMARIZE_CONFIG, filterState, activeScenarios)

     query(sql)
       // ... unchanged ...

     return () => {
       cancelled = true
     }
-  }, [config, filters])
+  }, [config, filters, activeScenarioNames])
```

`appState` import is removed only where it was solely used for
`getActive()` — any panel also using another `appState` export keeps the
import. `panelQuery.ts`'s `resolveActiveScenarios` signature is unchanged
— it already accepts a plain `string[]`, so it doesn't care whether that
array came from `appState.getActive()` directly or from the new hook.

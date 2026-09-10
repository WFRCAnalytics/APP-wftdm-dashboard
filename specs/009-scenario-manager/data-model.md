# Phase 1 Data Model: Scenario Manager (local folder loading)

No new persisted entity — this feature adds one new field-shape (the
parsed manifest data), reuses the existing `Scenario` entity
(`state/appState.ts`) unmodified in shape, and adds behavior (a
subscription mechanism) to that same module. There is no database/storage
layer involved (constitution Principle VI — in-memory only).

## `Scenario` (existing — `state/appState.ts`, unchanged shape)

```ts
export type ScenarioSource = 'url' | 'handle'
export type ScenarioStatus = 'registering' | 'ready' | 'failed'

export interface Scenario {
  name: string
  runDate?: string
  color?: string
  notes?: string
  source: ScenarioSource
  pinned: boolean
  active: boolean
  status: ScenarioStatus
}
```

A locally loaded scenario is a `Scenario` with `source: 'handle'`,
`pinned: false` — no field addition needed. `source: 'handle'` already
existed as a documented union member since `001-data-state-layer`, with
zero producers until this feature.

## `ParsedManifest` / `ManifestReadResult` (new — `src/scenario/manifestReader.ts`)

The subset of `manifest.yaml`'s documented fields (`project-docs/SPEC.md`) this
feature actually consumes:

```ts
export interface ParsedManifest {
  scenarioName?: string   // manifest.yaml's `scenario_name`
  runDate?: string        // `run_date`
  color?: string          // `color`
  notes?: string          // `notes`
}
```

`engine` (also documented in `manifest.yaml`'s example) is not read by
this feature — no requirement consumes it, matching how `appState.ts`'s
existing `ScenarioMetadata` doesn't carry it either.

`readManifest()`'s actual return is a discriminated `ManifestReadResult`,
not a bare `ParsedManifest | null` — a real gap found and fixed during
contract review (see `contracts/scenario-manager.md`'s header): a missing
file and a malformed file are distinguishable failure modes with
different, actionable console warnings, not one collapsed "unreadable"
outcome.

```ts
export type ManifestReadResult =
  | { status: 'ok'; manifest: ParsedManifest }
  | { status: 'missing' }
  | { status: 'invalid'; message: string }
```

## `LoadResult` (new — internal return shape of `scenarioManager.ts`'s
load flow, not a persisted entity)

```ts
export type LoadResult =
  | { outcome: 'registered'; name: string }
  | { outcome: 'collision'; name: string }
  | { outcome: 'cancelled' }
  | { outcome: 'failed'; name: string; reason: unknown }
```

Drives `scenarioLoader.tsx`'s status list and error messaging (FR-006,
FR-007, US1 Scenario 3) without the UI component needing to know
`appState`'s internal status enum directly — `scenarioManager.ts` is the
single place that decides which `LoadResult` variant a given attempt
produced.

## Relationships

```
FileSystemDirectoryHandle (from showDirectoryPicker())
        │
        ▼  manifestReader.ts (new)
ManifestReadResult ('ok' | 'missing' | 'invalid')
        │
        ▼  scenarioManager.ts (new) — collision check against
        │   appState.get(name), per §3 research.md
        ▼
appState.register()/setStatus()/setActive()  (existing, unmodified)
        +
services/duckdb.ts registerScenario()         (existing, unmodified)
        │
        ▼  appState.ts's new subscribe() notifies (§1 research.md)
        ▼
hooks/useActiveScenarios.ts (new)  ──consumed by──▶  every data-bound
                                                       panel component
                                                       (5 files, mechanical
                                                       diff — see
                                                       contracts/)
```

## State transitions (`Scenario.status`, unchanged enum, new producer)

```
(none) ──register()──▶ registering ──setStatus('ready')──▶ ready
                            │
                            └──setStatus('failed')──▶ failed
```

Identical to `scenarioDiscovery.ts`'s existing transition shape for
published scenarios — this feature is a second producer of the same
state machine, not a new one.

# Contract: Dataset picker for `GraphicWalkerPanel` (`src/panels/GraphicWalkerPanel.tsx`)

Satisfies: FR-001 through FR-013. Additive on top of
`specs/014-graphic-walker-panel/contracts/graphic-walker-panel.md` — that
contract's shape is unchanged for any panel that doesn't set
`dataset_picker: true`.

## Config grammar (`dashboard-*.yaml`)

```yaml
- type: graphic-walker
  dataset: trip_mode_share   # unchanged — still required; the initial
                             # selection when dataset_picker is true
  dataset_picker: true       # NEW — opt-in; absent/false = 014's
                             # original fixed-dataset behavior, unchanged
  scenario: abm_2026         # unchanged, still optional; when set, the
                             # picker lists that one scenario's own
                             # datasets only (research.md §5)
  limit: 100000              # unchanged
```

## New pure module: `src/panels/graphicWalkerDatasets.ts`

```ts
/**
 * Every metric name backed by a real `{scenario}__{metric}` view for
 * EVERY name in `scenarioNames` (intersection — research.md §3), never
 * including a view whose prefix isn't one of `scenarioNames` (excludes
 * `zonemap-geom__*` and any future non-metric view family the same way —
 * research.md §2). Pure — no I/O of its own; callers pass listViews()'s
 * current output and the scenario name(s) to intersect against.
 */
export function listSelectableDatasets(
  viewNames: readonly string[],
  scenarioNames: readonly string[],
): string[]

/**
 * Addendum, found during implementation (research.md §3a) — narrows
 * listSelectableDatasets()'s existence-based candidates to those whose
 * real columns also match across every scenario, closing a confirmed gap
 * a view can exist for a metric in every scenario while its columns still
 * differ, which would make sqlExpander.ts's existing $scenario. UNION ALL
 * throw the moment it's selected. A no-op (returns candidates unchanged)
 * when scenarioNames.length <= 1 — no UNION is ever built for a single
 * scenario, so nothing can mismatch.
 */
export function filterSchemaConsistent(
  candidates: readonly string[],
  scenarioNames: readonly string[],
  columnsByScenario: ReadonlyMap<string, ReadonlyMap<string, string>>,
): string[]
```

Contract (`listSelectableDatasets`):
- Returns `[]` if `scenarioNames` is empty (no active scenario to derive
  anything from — Edge Case in spec.md).
- Returns names sorted alphabetically (deterministic — FR-011, SC output
  never depends on `viewNames`'/`Set` iteration order).
- A metric present for a strict superset of `scenarioNames` (e.g. also
  available in some OTHER, non-active scenario) is still included — only
  the given `scenarioNames` are consulted, never every scenario the app
  has ever registered.
- Never returns a name that doesn't decompose as `{aScenarioName}__{rest}`
  for every name in `scenarioNames` — a metric present in only some of
  `scenarioNames` is excluded entirely (intersection, not union).

Contract (`filterSchemaConsistent`): a candidate is kept only if
`columnsByScenario.get(scenarioName)?.get(candidate)` is defined AND
identical (string equality) for every name in `scenarioNames`; the whole
function is a no-op returning `candidates` unchanged when
`scenarioNames.length <= 1`.

## `GraphicWalkerPanel.tsx` shape (delta from 014's contract)

```tsx
import { listSelectableDatasets } from '@/panels/graphicWalkerDatasets'
import { listViews, query } from '@/services/duckdb'
// ...014's existing imports unchanged...

export function GraphicWalkerPanel({ config }: { config: GraphicWalkerPanelConfig }) {
  // ...014's existing status/rows/fields state unchanged...
  const activeScenarioNames = useActiveScenarios()
  const [selectedDataset, setSelectedDataset] = useState(config.dataset)

  // Async, not useMemo (research.md §3a — a real gap found during
  // implementation): filterSchemaConsistent() needs each in-scope
  // scenario's REAL column names, fetched via one
  // information_schema.columns query per scenario — skipped entirely when
  // scenarioScope.length <= 1 (a single pinned scenario never builds a
  // UNION, so nothing can mismatch).
  const [availableDatasets, setAvailableDatasets] = useState<string[]>([])
  useEffect(() => {
    let cancelled = false
    if (!config.dataset_picker) return setAvailableDatasets([]), undefined
    const scenarioScope = config.scenario ? [config.scenario] : activeScenarioNames
    const candidates = listSelectableDatasets(listViews(), scenarioScope)
    if (scenarioScope.length <= 1 || candidates.length === 0) {
      return setAvailableDatasets(candidates), undefined
    }
    Promise.all(
      scenarioScope.map(async (scenarioName) => {
        /* one information_schema.columns query per scenario — see the
           real implementation for the full SQL and column-signature
           extraction */
        return [scenarioName, new Map<string, string>()] as const
      }),
    ).then((entries) => {
      if (!cancelled) setAvailableDatasets(filterSchemaConsistent(candidates, scenarioScope, new Map(entries)))
    })
    return () => { cancelled = true }
  }, [config.dataset_picker, config.scenario, activeScenarioNames])

  // Data fetch — identical to 014's existing effect, except the template
  // is built from an EFFECTIVE config whose `dataset` is the current
  // selection, not always config.dataset. Still runs once per
  // (effective dataset, scenario, limit, activeScenarioNames) change —
  // still NEVER reacts to global filters (FR-009).
  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    const effectiveConfig = { ...config, dataset: selectedDataset }
    const template = buildGraphicWalkerQuery(effectiveConfig)
    const sql = sqlExpander.expand(template, EMPTY_SUMMARIZE_CONFIG, NOOP_FILTER_STATE, activeScenarioNames)
    queryArrow(sql)
      .then((table) => { /* identical to 014's existing handling */ })
      .catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [selectedDataset, config.scenario, config.limit, config, activeScenarioNames])

  // ...014's existing error/empty/loading branches unchanged...

  return (
    <div className="graphic-walker-panel-host" style={{ height: '100%' }}>
      {config.dataset_picker && (
        <DatasetPicker
          current={selectedDataset}
          options={availableDatasets}
          onSelect={setSelectedDataset}
        />
      )}
      <GraphicWalker data={rows} fields={fields} themeKey="g2" appearance={colorScheme} />
    </div>
  )
}
```

The illustrative effect above elides the real `information_schema.columns`
query body and column-signature extraction — see
`src/panels/GraphicWalkerPanel.tsx` for the actual implementation.

## `DatasetPicker` control (new, small — exact file TBD at `/speckit-tasks`)

- Built on `components/ui/dropdown-menu.tsx` (`DropdownMenu`,
  `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuRadioGroup`,
  `DropdownMenuRadioItem`) — no new dependency (research.md §7).
- Renders only when `config.dataset_picker` is true and `options.length > 0`;
  when `options.length === 0` (Edge Case — no shared dataset across active
  scenarios), renders a plain disabled-looking label communicating that,
  never a broken/empty dropdown.
- Selecting an entry calls `onSelect(name)` and nothing else — all
  side effects (re-query, chart reset via fresh `data`/`fields` props) are
  handled by the existing effect reacting to `selectedDataset` changing,
  not by this control itself.

## What does NOT change

- `services/sqlExpander.ts` — zero changes, `expandScenario()` untouched.
- `panels/panelQuery.ts`'s `buildGraphicWalkerQuery()` — zero changes; only
  called with a different effective `dataset` value.
- `panels/graphicWalkerFields.ts`'s `inferFields()` — zero changes, already
  generic (014's own design intent, now actually exercised a second time
  per config change instead of once per mount).
- Every `GraphicWalkerPanelConfig` that omits `dataset_picker` — identical
  behavior to before this feature existed (FR-002).
- Every other panel type — untouched.

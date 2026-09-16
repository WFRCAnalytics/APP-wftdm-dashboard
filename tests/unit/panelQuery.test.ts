import { describe, expect, it } from 'vitest'

import {
  buildComparisonDiffQuery,
  buildGraphicWalkerQuery,
  buildPanelQuery,
  buildRowCountQuery,
  buildSearchPredicate,
  buildSearchRowCountQuery,
  buildSparklineQuery,
  buildTableDrivenPageQuery,
  buildValueBoxBaselineTrendQuery,
  escapeSqlLiteral,
  isComparisonDiff,
  resolveActiveScenarios,
  resolveComparisonScenarioName,
  resolveTableQueryMode,
  extractGlobalFilterIds,
  TABLE_QUERY_MODE_THRESHOLD,
} from '@/panels/panelQuery'
import type { ResolvedColumn } from '@/panels/tableLogic'
import type {
  GraphicWalkerPanelConfig,
  ObservablePlotPanelConfig,
  PlotlyPanelConfig,
  ValueBoxPanelConfig,
} from '@/layout/types'

const valueBoxConfig: ValueBoxPanelConfig = {
  type: 'valuebox',
  title: 'Total Trips',
  metric: 'summary_kpis',
  column: 'total_trips',
  format: '{:,.0f}',
}

const plotlyConfig: PlotlyPanelConfig = {
  type: 'plotly',
  title: 'Mode Share by Purpose',
  metric: 'trip_mode_share',
  filter: '$filters.purpose',
  traces: [{ type: 'bar', x: '$metric.purpose', y: '$metric.share' }],
}

describe('buildPanelQuery', () => {
  it('emits a bare $scenario.<metric> reference with no WHERE clause when filter is unset', () => {
    const sql = buildPanelQuery(valueBoxConfig, {})
    expect(sql).toBe('SELECT "total_trips" FROM ($scenario.summary_kpis)')
  })

  it('selects a single column for a valuebox panel', () => {
    const sql = buildPanelQuery(valueBoxConfig, {})
    expect(sql).toContain('SELECT "total_trips"')
  })

  it('selects * for a non-valuebox panel', () => {
    const sql = buildPanelQuery({ ...plotlyConfig, filter: undefined }, {})
    expect(sql).toContain('SELECT *')
  })

  it('places $filters.x alone on its own line, per the all-sentinel line-omission rule', () => {
    const sql = buildPanelQuery(plotlyConfig, {})
    const lines = sql.split('\n')
    const filterLine = lines.find((l) => l.includes('$filters.purpose'))
    expect(filterLine).toBeDefined()
    expect(filterLine!.trim()).toBe(`AND "purpose" = '$filters.purpose'`)
  })

  it('bypasses the $scenario.x union entirely when scenario (singular) is set', () => {
    const sql = buildPanelQuery({ ...valueBoxConfig, scenario: 'good_scenario' }, {})
    expect(sql).toBe('SELECT "total_trips" FROM "good_scenario__summary_kpis"')
    expect(sql).not.toContain('$scenario')
  })

  it('does not include a WHERE clause when config.filter is not a $filters.x reference', () => {
    const sql = buildPanelQuery({ ...valueBoxConfig, filter: 'literal-not-a-placeholder' }, {})
    expect(sql).not.toContain('WHERE')
  })

  // 007-observable-plot-panel, research.md §1: filter: also accepts an
  // inline Record<string,string> map — one column-name key per entry,
  // independent of that entry's own placeholder id.
  it('emits one AND line per entry when config.filter is a Record<string,string> map', () => {
    const sql = buildPanelQuery(
      { ...plotlyConfig, filter: { purpose: '$filters.purpose', mode: '$inputs.mode_select' } },
      {},
    )
    const lines = sql.split('\n').map((l) => l.trim())
    expect(lines).toContain(`AND "purpose" = '$filters.purpose'`)
    expect(lines).toContain(`AND "mode" = '$inputs.mode_select'`)
  })

  it('binds a map entry\'s column name independently of its placeholder id', () => {
    const sql = buildPanelQuery(
      { ...plotlyConfig, filter: { income_category: '$inputs.income_filter' } },
      {},
    )
    expect(sql).toContain(`AND "income_category" = '$inputs.income_filter'`)
  })

  it('emits no WHERE clause for an empty filter map', () => {
    const sql = buildPanelQuery({ ...plotlyConfig, filter: {} }, {})
    expect(sql).not.toContain('WHERE')
  })

  // 007-observable-plot-panel: a multiselect-type $inputs.<id> reference
  // gets an IN (...) shape — "any of the selected values" cannot be a
  // single-value equality comparison.
  const observablePlotConfig: ObservablePlotPanelConfig = {
    type: 'observable-plot',
    title: 'Mode Share by Purpose',
    metric: 'trip_mode_share',
    mark: 'barY',
  }

  it('emits an IN (...) shape (no surrounding quotes) for a multiselect-type $inputs.<id> reference', () => {
    const config: ObservablePlotPanelConfig = {
      ...observablePlotConfig,
      filter: { mode: '$inputs.mode_select' },
      inputs: [{ id: 'mode_select', label: 'Mode', type: 'multiselect', column: 'mode', default: 'SOV' }],
    }
    const sql = buildPanelQuery(config, {})
    expect(sql).toContain(`AND "mode" IN ($inputs.mode_select)`)
    expect(sql).not.toContain(`AND "mode" = '$inputs.mode_select'`)
  })

  it('keeps the ordinary = shape for a select-type $inputs.<id> reference, even when config.inputs is present', () => {
    const config: ObservablePlotPanelConfig = {
      ...observablePlotConfig,
      filter: { mode: '$inputs.mode_select' },
      inputs: [{ id: 'mode_select', label: 'Mode', type: 'select', column: 'mode', default: 'SOV' }],
    }
    const sql = buildPanelQuery(config, {})
    expect(sql).toContain(`AND "mode" = '$inputs.mode_select'`)
  })

  it('keeps the ordinary = shape for $filters.<id>, even when config.inputs declares a same-named multiselect id', () => {
    const config: ObservablePlotPanelConfig = {
      ...observablePlotConfig,
      filter: { purpose: '$filters.purpose' },
      inputs: [{ id: 'purpose', label: 'Purpose', type: 'multiselect', column: 'purpose', default: 'HBW' }],
    }
    const sql = buildPanelQuery(config, {})
    expect(sql).toContain(`AND "purpose" = '$filters.purpose'`)
  })
})

describe('extractGlobalFilterIds', () => {
  it('returns [] for undefined', () => {
    expect(extractGlobalFilterIds(undefined)).toEqual([])
  })

  it('extracts the single id from a bare $filters.x string', () => {
    expect(extractGlobalFilterIds('$filters.purpose')).toEqual(['purpose'])
  })

  it('returns [] for a non-placeholder literal string', () => {
    expect(extractGlobalFilterIds('literal-not-a-placeholder')).toEqual([])
  })

  it('extracts every $filters.<id> from a map with only $filters. entries', () => {
    expect(
      extractGlobalFilterIds({ purpose: '$filters.purpose', mode: '$filters.mode' }),
    ).toEqual(['purpose', 'mode'])
  })

  it('excludes $inputs.<id> entries from a mixed map — only $filters. ids are returned', () => {
    expect(
      extractGlobalFilterIds({ purpose: '$filters.purpose', mode: '$inputs.mode_select' }),
    ).toEqual(['purpose'])
  })

  it('returns [] for a map with only $inputs. entries', () => {
    expect(extractGlobalFilterIds({ mode: '$inputs.mode_select' })).toEqual([])
  })
})

describe('resolveActiveScenarios', () => {
  it('returns globallyActive unchanged when neither scenario nor scenarios is set', () => {
    expect(resolveActiveScenarios(valueBoxConfig, ['observed', 'good_scenario'])).toEqual([
      'observed',
      'good_scenario',
    ])
  })

  it('returns config.scenarios verbatim, ignoring globallyActive, when set', () => {
    const config = { ...valueBoxConfig, scenarios: ['good_scenario'] }
    expect(resolveActiveScenarios(config, ['observed', 'good_scenario'])).toEqual([
      'good_scenario',
    ])
  })

  it('scenario (singular) short-circuits the $scenario placeholder in buildPanelQuery\'s own SQL text', () => {
    const config = { ...valueBoxConfig, scenario: 'good_scenario', scenarios: ['observed'] }
    const sql = buildPanelQuery(config, {})
    expect(sql).not.toContain('$scenario')
    expect(sql).toContain('"good_scenario__summary_kpis"')
  })

  // 059-server-side-pagination — a real, confirmed, pre-existing bug this
  // test replaces (see resolveActiveScenarios()'s own doc comment for the
  // full story): a prior version of this file asserted the OPPOSITE of
  // what's tested below — that resolveActiveScenarios()'s own return
  // value is simply "unused" once `config.scenario` (singular) is set.
  // That was true for buildPanelQuery()'s own SQL text (the test above),
  // but resolveQueryAndPairs()'s `pairs` field also depends on this
  // function's return value, unconditionally — and a wrong, overly-broad
  // return value there means ensureRegistered() tries to register a
  // pinned metric under every globally-active scenario, not just the one
  // it's actually bound to, a real, confirmed registration failure the
  // moment that metric doesn't exist under every other active scenario.
  it('scenario (singular) takes priority over both scenarios and globallyActive — the real registration-pairs bug this fixes', () => {
    const config = { ...valueBoxConfig, scenario: 'good_scenario', scenarios: ['observed'] }
    expect(resolveActiveScenarios(config, ['observed', 'a_third_scenario'])).toEqual(['good_scenario'])
  })

  it('scenario (singular) alone, with neither scenarios nor globallyActive relevant, resolves to just that one scenario', () => {
    const config = { ...valueBoxConfig, scenario: 'good_scenario' }
    expect(resolveActiveScenarios(config, ['observed', 'a_third_scenario'])).toEqual(['good_scenario'])
  })
})

// 013-zonemap-panel: regression test for a real bug found via Playwright
// during implementation — ZoneMapPanelConfig's own `column` field
// (project-docs/GRAMMAR.md's real grammar) was being caught by the same
// `'column' in config` check written for ValueBoxPanelConfig, silently
// dropping `metric_id` from the generated SELECT and breaking every
// zone-id join (every zone rendered as "no data").
describe('buildPanelQuery — zonemap column/metric_id disambiguation', () => {
  it('uses SELECT * (not a single-column SELECT) for a config with both column and metric_id', () => {
    const zonemapLikeConfig = {
      type: 'zonemap',
      title: 'VMT',
      metric: 'vmt_by_home_taz',
      scenario: 'good_scenario',
      boundaries: 'taz.geoparquet',
      boundaries_id: 'TAZ_ID',
      metric_id: 'taz_id',
      column: 'vmt_per_capita',
    }
    const sql = buildPanelQuery(zonemapLikeConfig, {})
    expect(sql).toContain('SELECT *')
    expect(sql).not.toContain('SELECT "vmt_per_capita"')
  })

  it('still uses the single-column SELECT for a config with column but no metric_id (valuebox)', () => {
    const sql = buildPanelQuery(valueBoxConfig, {})
    expect(sql).toContain('SELECT "total_trips"')
  })
})

// 013-zonemap-panel, research.md §7 (corrected during implementation —
// no upfront "active scenario" validation, matching config.scenario
// singular's own zero-validation convention above).
//
// 019-baseline-diff-consumption: generalized from
// buildComparisonDiffQuery(config: ZoneMapPanelConfig, diff) to plain
// parameters (metric, aScenario, bScenario, compareOn, expr) — every call
// below updated to the new signature, with compareOn: ['taz_id'] standing
// in for zonemap's own metric_id (research.md §2). Assertions unchanged —
// direct proof this generalization produces the identical SQL shape.
describe('buildComparisonDiffQuery', () => {
  it('interpolates a/b as literal view-name prefixes and copies expr verbatim', () => {
    const sql = buildComparisonDiffQuery(
      'vmt_by_home_taz',
      'observed',
      'good_scenario',
      ['taz_id'],
      'b.vmt_per_capita - a.vmt_per_capita',
    )
    expect(sql).toContain('"observed__vmt_by_home_taz" a')
    expect(sql).toContain('"good_scenario__vmt_by_home_taz" b')
    expect(sql).toContain('(b.vmt_per_capita - a.vmt_per_capita) AS diff_value')
    expect(sql).toContain('a."taz_id" = b."taz_id"')
  })

  it('never evaluates expr in JS — an arbitrary non-arithmetic string still passes through verbatim', () => {
    // Proves this is plain string substitution, not eval() or any JS-side
    // expression evaluation (constitution Principle III) — the function
    // has no opinion about what expr actually contains.
    const sql = buildComparisonDiffQuery(
      'vmt_by_home_taz',
      'observed',
      'good_scenario',
      ['taz_id'],
      'CASE WHEN b.vmt_per_capita > a.vmt_per_capita THEN 1 ELSE 0 END',
    )
    expect(sql).toContain(
      '(CASE WHEN b.vmt_per_capita > a.vmt_per_capita THEN 1 ELSE 0 END) AS diff_value',
    )
  })

  it('does not validate a/b existence — an unresolvable name still produces a well-formed query', () => {
    // The resulting query fails naturally at DuckDB query time (a real
    // "table does not exist" error), not here — same as config.scenario
    // singular referencing a nonexistent scenario.
    const sql = buildComparisonDiffQuery(
      'vmt_by_home_taz',
      'nonexistent_scenario_xyz',
      'good_scenario',
      ['taz_id'],
      'b.vmt_per_capita - a.vmt_per_capita',
    )
    expect(sql).toContain('"nonexistent_scenario_xyz__vmt_by_home_taz" a')
  })

  it('joins/selects on every compare_on column when more than one is given (research.md §2/§3)', () => {
    const sql = buildComparisonDiffQuery(
      'trip_mode_share',
      'abm_2026',
      'base_tbm',
      ['purpose', 'mode'],
      'b.share - a.share',
    )
    expect(sql).toContain('a."purpose" AS "purpose"')
    expect(sql).toContain('a."mode" AS "mode"')
    expect(sql).toContain('a."purpose" = b."purpose" AND a."mode" = b."mode"')
  })

  it('produces byte-for-byte identical SQL to the pre-generalization zonemap-only shape for a single compare_on column (regression, FR-005/SC-004)', () => {
    // The exact same inputs/assertions as the original 013-zonemap-panel
    // test above (compareOn: ['taz_id'] standing in for the old
    // config.metric_id argument) — confirms the generalization changed
    // nothing about zonemap's own existing single-column case.
    const sql = buildComparisonDiffQuery(
      'vmt_by_home_taz',
      'observed',
      'good_scenario',
      ['taz_id'],
      'b.vmt_per_capita - a.vmt_per_capita',
    )
    expect(sql).toBe(
      [
        'SELECT a."taz_id" AS "taz_id", (b.vmt_per_capita - a.vmt_per_capita) AS diff_value',
        'FROM "observed__vmt_by_home_taz" a',
        'JOIN "good_scenario__vmt_by_home_taz" b ON a."taz_id" = b."taz_id"',
      ].join('\n'),
    )
  })
})

// 019-baseline-diff-consumption
describe('isComparisonDiff', () => {
  it('is true for the diff shape', () => {
    expect(isComparisonDiff({ type: 'diff', a: 'x', b: 'y', expr: 'b.v - a.v' })).toBe(true)
  })

  it('is false for side_by_side, undefined, and anything else', () => {
    expect(isComparisonDiff('side_by_side')).toBe(false)
    expect(isComparisonDiff(undefined)).toBe(false)
  })
})

describe('resolveComparisonScenarioName', () => {
  it('resolves the $baseline sentinel to the given baseline scenario', () => {
    expect(resolveComparisonScenarioName('$baseline', 'abm_2026')).toBe('abm_2026')
  })

  it('passes an ordinary hardcoded scenario name through unchanged, ignoring baseline entirely', () => {
    expect(resolveComparisonScenarioName('base_tbm', 'abm_2026')).toBe('base_tbm')
    expect(resolveComparisonScenarioName('base_tbm', undefined)).toBe('base_tbm')
  })

  it('returns undefined when $baseline is used but no baseline is currently resolved (FR-011)', () => {
    expect(resolveComparisonScenarioName('$baseline', undefined)).toBeUndefined()
  })
})

// 014-graphic-walker-panel, research.md §6/quickstart.md's own unit test
// list: buildGraphicWalkerQuery() produces a bare SQL template containing
// the same $scenario.<x> placeholder every other panel type's own template
// already uses (or a literal "<scenario>__<dataset>" FROM-clause when
// scenario: is set) — handed to the existing, unmodified
// sqlExpander.expand() by the caller, not expanded here.
describe('buildGraphicWalkerQuery', () => {
  const graphicWalkerConfig: GraphicWalkerPanelConfig = {
    type: 'graphic-walker',
    title: 'Free-form Visual Analytics',
    dataset: 'trip_mode_share',
  }

  it('emits a $scenario.<dataset> placeholder when scenario is unset', () => {
    const sql = buildGraphicWalkerQuery(graphicWalkerConfig)
    expect(sql).toBe('SELECT * FROM ($scenario.trip_mode_share) LIMIT 100000')
  })

  it('emits a literal "<scenario>__<dataset>" FROM-clause when scenario is set', () => {
    const sql = buildGraphicWalkerQuery({ ...graphicWalkerConfig, scenario: 'good_scenario' })
    expect(sql).toBe('SELECT * FROM "good_scenario__trip_mode_share" LIMIT 100000')
    expect(sql).not.toContain('$scenario')
  })

  it('defaults limit to 100000 when omitted', () => {
    const sql = buildGraphicWalkerQuery(graphicWalkerConfig)
    expect(sql).toContain('LIMIT 100000')
  })

  it('uses config.limit verbatim when set', () => {
    const sql = buildGraphicWalkerQuery({ ...graphicWalkerConfig, limit: 5000 })
    expect(sql).toContain('LIMIT 5000')
  })

  it('never emits a $filters. or $inputs. placeholder — this panel type has no filter binding', () => {
    const sql = buildGraphicWalkerQuery(graphicWalkerConfig)
    expect(sql).not.toContain('$filters')
    expect(sql).not.toContain('$inputs')
  })
})

// 034-metric-panel-redesign — data-model.md §5, research.md §2.
describe('buildSparklineQuery', () => {
  it('delegates to buildPanelQuery() with a synthetic object carrying sparkline.metric, no column key — SELECT *', () => {
    const sql = buildSparklineQuery(
      { filter: undefined, scenario: 'activitysim-baseline', scenarios: undefined },
      { metric: 'trip_mode_share', x: 'major_trip_mode', y: 'trips' },
      {},
    )
    expect(sql).toBe('SELECT * FROM "activitysim-baseline__trip_mode_share"')
  })

  it('uses the SAME filter the panel\'s own primary value resolves through, not the sparkline\'s own dataset name', () => {
    const sql = buildSparklineQuery(
      { filter: '$filters.purpose', scenario: undefined, scenarios: undefined },
      { metric: 'trip_mode_share', x: 'major_trip_mode', y: 'trips' },
      {},
    )
    expect(sql).toContain('AND "purpose" = \'$filters.purpose\'')
  })

  it('unions over $scenario.<sparkline metric> when no scenario is pinned, same as any other panel query', () => {
    const sql = buildSparklineQuery(
      { filter: undefined, scenario: undefined, scenarios: undefined },
      { metric: 'trip_mode_share', x: 'major_trip_mode', y: 'trips' },
      {},
    )
    expect(sql).toBe('SELECT * FROM ($scenario.trip_mode_share)')
  })
})

// 034-metric-panel-redesign — data-model.md §5, research.md §3.
describe('buildValueBoxBaselineTrendQuery', () => {
  it('produces the exact documented SELECT/cross-join shape', () => {
    const sql = buildValueBoxBaselineTrendQuery(
      'summary_kpis',
      'auto_share',
      'activitysim-baseline',
      'activitysim-density-variant',
      '(a.auto_share - b.auto_share) / NULLIF(b.auto_share, 0)',
    )
    expect(sql).toBe(
      [
        'SELECT a."auto_share" AS current_value, b."auto_share" AS baseline_value, ((a.auto_share - b.auto_share) / NULLIF(b.auto_share, 0)) AS diff_value',
        'FROM "activitysim-baseline__summary_kpis" a, "activitysim-density-variant__summary_kpis" b',
      ].join('\n'),
    )
  })

  it('interpolates expr verbatim — plain string substitution only, never eval()\'d', () => {
    const sql = buildValueBoxBaselineTrendQuery('m', 'c', 'x', 'y', 'a.c * 2')
    expect(sql).toContain('(a.c * 2) AS diff_value')
  })

  it('is a real, independent sibling to buildComparisonDiffQuery() — never calls it, never requires compare_on', () => {
    // No compare_on/join-key argument exists on this function's own
    // signature at all (research.md §3's own resolution to the real
    // structural gap: a scalar metric has no per-row identity column to
    // join on) — a plain comma cross join, correct because both sides
    // are guaranteed exactly one row.
    const sql = buildValueBoxBaselineTrendQuery('m', 'c', 'x', 'y', 'a.c')
    expect(sql).toContain('FROM "x__m" a, "y__m" b')
    expect(sql).not.toContain('JOIN')
    expect(sql).not.toContain(' ON ')
  })
})

// 059-server-side-pagination — see specs/059-server-side-pagination/
// {research.md,contracts/query-shapes.md}. T004/T011/T013/T015/T019.
describe('resolveTableQueryMode', () => {
  it('resolves to "client" for a real row count below the threshold', () => {
    expect(resolveTableQueryMode(0)).toBe('client')
    expect(resolveTableQueryMode(99_999)).toBe('client')
    expect(resolveTableQueryMode(TABLE_QUERY_MODE_THRESHOLD - 1)).toBe('client')
  })

  it('resolves to "query-driven" at and above the real, measured threshold — a real boundary test, not just mid-range', () => {
    expect(resolveTableQueryMode(TABLE_QUERY_MODE_THRESHOLD)).toBe('query-driven')
    expect(resolveTableQueryMode(100_001)).toBe('query-driven')
    expect(resolveTableQueryMode(2_000_000)).toBe('query-driven')
  })
})

describe('buildRowCountQuery', () => {
  it('wraps the inner query in a COUNT(*) subquery, per contracts/query-shapes.md §1', () => {
    expect(buildRowCountQuery('SELECT * FROM "trips"')).toBe('SELECT COUNT(*) AS cnt FROM (SELECT * FROM "trips") t')
  })
})

describe('buildTableDrivenPageQuery', () => {
  const base = { innerSql: 'SELECT * FROM "trips"', sortColumn: 'trip_distance', page: 0, pageSize: 20 }

  it('produces the ROW_NUMBER()/WHERE __rn/ORDER BY/LIMIT shape for ASC, per contracts/query-shapes.md §2', () => {
    const sql = buildTableDrivenPageQuery({ ...base, direction: 'asc' })
    expect(sql).toContain('ROW_NUMBER() OVER (ORDER BY "trip_distance" ASC) AS __rn')
    expect(sql).toContain('FROM (SELECT * FROM "trips") t')
    expect(sql).toContain('WHERE __rn > 0')
    expect(sql).toContain('ORDER BY __rn')
    expect(sql).toContain('LIMIT 20')
  })

  it('produces DESC when requested', () => {
    const sql = buildTableDrivenPageQuery({ ...base, direction: 'desc' })
    expect(sql).toContain('ORDER BY "trip_distance" DESC) AS __rn')
  })

  it('computes the correct row-number cursor for a non-first page', () => {
    const sql = buildTableDrivenPageQuery({ ...base, direction: 'asc', page: 5, pageSize: 20 })
    expect(sql).toContain('WHERE __rn > 100')
  })

  it('falls back to an empty OVER() — natural/scan order — when no sort column is known yet', () => {
    const sql = buildTableDrivenPageQuery({ ...base, sortColumn: null, direction: 'asc' })
    expect(sql).toContain('ROW_NUMBER() OVER () AS __rn')
    expect(sql).not.toContain('ORDER BY "trip_distance"')
  })

  it('omits the WHERE clause inside the ROW_NUMBER() subquery when no search predicate is given', () => {
    const sql = buildTableDrivenPageQuery({ ...base, direction: 'asc' })
    // Only the outer "WHERE __rn > 0" should appear — no inner WHERE at all.
    expect(sql.match(/WHERE/g)).toHaveLength(1)
  })

  it('splices a search predicate INSIDE the same subquery that computes __rn — before the window function runs, per research.md §2\'s live-verified evaluation order', () => {
    const sql = buildTableDrivenPageQuery({ ...base, direction: 'asc', searchPredicate: '"purpose" ILIKE \'%work%\'' })
    const rnIndex = sql.indexOf('ROW_NUMBER()')
    const predicateIndex = sql.indexOf('"purpose" ILIKE')
    const outerWhereIndex = sql.indexOf('WHERE __rn >')
    expect(predicateIndex).toBeGreaterThan(-1)
    // The predicate's own WHERE sits between the ROW_NUMBER() computation's
    // own SELECT and the outer WHERE __rn > ... — i.e. inside the same
    // subquery, not appended after it closes.
    expect(predicateIndex).toBeGreaterThan(rnIndex)
    expect(predicateIndex).toBeLessThan(outerWhereIndex)
    expect(sql.match(/WHERE/g)).toHaveLength(2)
  })
})

describe('escapeSqlLiteral', () => {
  it('leaves a plain term unchanged', () => {
    expect(escapeSqlLiteral('work')).toBe('work')
  })

  it('doubles an embedded single quote — the real, verified case (research.md §6)', () => {
    expect(escapeSqlLiteral("O'Brien")).toBe("O''Brien")
  })

  it('doubles every occurrence, not just the first', () => {
    expect(escapeSqlLiteral("a'b'c")).toBe("a''b''c")
  })
})

describe('buildSearchPredicate', () => {
  const numberFormatted: ResolvedColumn = { field: 'trips', label: 'Trips', valueType: 'number', format: ',.0f' }
  const numberPlain: ResolvedColumn = { field: 'count', label: 'Count', valueType: 'number' }
  const percentFormatted: ResolvedColumn = { field: 'pct', label: 'Pct', valueType: 'number', format: '.1%' }
  const stringCol: ResolvedColumn = { field: 'purpose', label: 'Purpose', valueType: 'string' }
  const boolCol: ResolvedColumn = { field: 'flag', label: 'Flag', valueType: 'boolean' }
  const unknownCol: ResolvedColumn = { field: 'diff_value', label: 'Diff', valueType: 'unknown' }

  it('returns null for an empty search term, matching filterRows()\'s own short-circuit', () => {
    expect(buildSearchPredicate([stringCol], '')).toBeNull()
  })

  it('a string column matches its raw value directly, no format() wrapping', () => {
    const predicate = buildSearchPredicate([stringCol], 'work')
    expect(predicate).toBe('"purpose" ILIKE \'%work%\'')
  })

  it('a number column with a configured format wraps the value in format(), per contracts/query-shapes.md §3', () => {
    const predicate = buildSearchPredicate([numberFormatted], '1,234')
    expect(predicate).toContain("format('{:,.0f}', CAST(\"trips\" AS DOUBLE))")
    expect(predicate).toContain("ILIKE '%1,234%'")
  })

  it('a percent-formatted number column multiplies by 100 and appends a literal % suffix, mirroring formatValue.ts', () => {
    const predicate = buildSearchPredicate([percentFormatted], '84.7%')
    expect(predicate).toContain("format('{:.1f}', (CAST(\"pct\" AS DOUBLE) * 100))")
    expect(predicate).toContain("|| '%'")
  })

  it('a number column with no configured format falls back to a plain VARCHAR cast', () => {
    const predicate = buildSearchPredicate([numberPlain], '42')
    expect(predicate).toBe('CAST("count" AS VARCHAR) ILIKE \'%42%\'')
  })

  it('a boolean column matches via a plain VARCHAR cast', () => {
    const predicate = buildSearchPredicate([boolCol], 'true')
    expect(predicate).toBe('CAST("flag" AS VARCHAR) ILIKE \'%true%\'')
  })

  it('an unknown-typed (all-null) column is omitted entirely — it can never contain a real match', () => {
    expect(buildSearchPredicate([unknownCol], 'anything')).toBeNull()
    // Confirmed by omission even when mixed with a real column too:
    const predicate = buildSearchPredicate([unknownCol, stringCol], 'work')
    expect(predicate).not.toContain('diff_value')
  })

  it('OR-joins multiple visible columns, matching filterRows()\'s own "any column matches" semantics', () => {
    const predicate = buildSearchPredicate([stringCol, numberPlain], 'x')!
    expect(predicate).toContain('"purpose" ILIKE')
    expect(predicate).toContain('OR')
    expect(predicate).toContain('CAST("count" AS VARCHAR) ILIKE')
  })

  it('escapes an embedded single quote in the search term itself', () => {
    const predicate = buildSearchPredicate([stringCol], "O'Brien")!
    expect(predicate).toContain("O''Brien")
  })
})

describe('buildSearchRowCountQuery', () => {
  it('wraps the inner query with the search predicate as a WHERE clause, per contracts/query-shapes.md §4', () => {
    const sql = buildSearchRowCountQuery('SELECT * FROM "trips"', '"purpose" ILIKE \'%work%\'')
    expect(sql).toBe('SELECT COUNT(*) AS cnt FROM (SELECT * FROM "trips") t WHERE ("purpose" ILIKE \'%work%\')')
  })
})

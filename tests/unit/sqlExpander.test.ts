import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { expand, type FilterStateLike } from '../../src/services/sqlExpander.ts'
import type { DashboardConfig } from '../../src/services/yamlLoader.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

const config: DashboardConfig = {
  sourcePath: 'test-fixture',
  raw: {
    mappings: {
      major_mode: { SOV: 'Drive', HOV: 'Drive', Transit: 'Transit' },
    },
    bins: {
      share_bucket: {
        column: 'share',
        type: 'manual_breaks',
        breaks: [0, 0.1, 0.3, 1],
        labels: ['Low', 'Medium', 'High'],
      },
      income_quintile: {
        column: 'income',
        type: 'quantiles',
        bins: 5,
      },
      trip_length_quartile: {
        column: 'distance',
        type: 'equal_intervals',
        n: 4,
        labels: ['Shortest', 'Short', 'Long', 'Longest'],
      },
    },
    sql_fragments: {
      base_table: 'good_scenario__trip_mode_share',
    },
  },
}

function fakeFilterState(values: Record<string, unknown>): FilterStateLike {
  return { get: (id: string) => values[id] }
}

describe('sqlExpander.expand', () => {
  it('expands every placeholder kind with zero markers remaining (SC-004)', () => {
    const filterState = fakeFilterState({ purpose: 'HBW' })
    const template = `
SELECT
  purpose,
  CASE mode $mappings.major_mode END AS major_mode,
  $bins.share_bucket AS share_bucket
FROM (SELECT * FROM $sql.base_table)
WHERE 1=1
  AND purpose = '$filters.purpose'
`.trim()

    const result = expand(template, config, filterState, ['good_scenario'])

    expect(result).not.toMatch(/\$mappings\./)
    expect(result).not.toMatch(/\$bins\./)
    expect(result).not.toMatch(/\$sql\./)
    expect(result).not.toMatch(/\$filters\./)
    expect(result).not.toMatch(/\$scenario\./)
    expect(result).toContain("WHEN 'SOV' THEN 'Drive'")
    expect(result).toContain('good_scenario__trip_mode_share')
    expect(result).toContain("purpose = 'HBW'")
  })

  it('expands $scenario.<metric> into a UNION ALL over active scenarios', () => {
    const filterState = fakeFilterState({})
    const result = expand('$scenario.summary_kpis', config, filterState, ['observed', 'good_scenario'])

    expect(result).toContain(
      `SELECT *, 'observed' AS scenario FROM "observed__summary_kpis"`,
    )
    expect(result).toContain(
      `SELECT *, 'good_scenario' AS scenario FROM "good_scenario__summary_kpis"`,
    )
    expect(result).toContain('UNION ALL')
  })

  it("omits the entire line when a \$filters value is the 'all' sentinel (FR-016)", () => {
    const filterState = fakeFilterState({ purpose: 'all' })
    const template = "SELECT * FROM t\nWHERE 1=1\n  AND purpose = '\$filters.purpose'\n"

    const result = expand(template, config, filterState, [])

    expect(result).not.toContain('$filters.purpose')
    expect(result).not.toContain('AND purpose =')
    expect(result).toContain('SELECT * FROM t')
  })

  it('expands $bins quantiles using the `bins` field, not `n` (regression: field-name bug)', () => {
    const filterState = fakeFilterState({})
    const result = expand('$bins.income_quintile', config, filterState, [])

    expect(result).toBe('NTILE(5) OVER (ORDER BY "income")')
    // The bug produced NTILE(4) (the old n-based default) instead — assert
    // the default-fallback value is absent so this actually catches it.
    expect(result).not.toContain('NTILE(4)')
  })

  it('expands $bins equal_intervals into a data-driven, min/max-based bucket expression', () => {
    const filterState = fakeFilterState({})
    const result = expand('$bins.trip_length_quartile', config, filterState, [])

    expect(result).toContain('MIN("distance") OVER ()')
    expect(result).toContain('MAX("distance") OVER ()')
    expect(result).toContain('FLOOR(')
    // Distinct from spaced_intervals: no fixed interval/lower literal —
    // the bucket width comes from the column's own min/max, not config.
    expect(result).not.toMatch(/interval/i)
    // Labels, when supplied, map bucket index -> label via CASE.
    expect(result).toContain("WHEN 0 THEN 'Shortest'")
    expect(result).toContain("WHEN 3 THEN 'Longest'")
  })

  it('throws naming the specific unresolved reference (FR-017)', () => {
    const filterState = fakeFilterState({})
    expect(() =>
      expand('$mappings.does_not_exist', config, filterState, []),
    ).toThrowError(/mappings\.does_not_exist/)
  })

  // A real, if latent, gap (pre-dates 007-observable-plot-panel, fixed
  // alongside it): an embedded single quote in a $filters.<id> value must
  // be escaped (SQL's standard doubling escape) before being substituted
  // into the template's own surrounding '...' quotes, or the value breaks
  // out of the string literal it's meant to sit inside.
  it("escapes an embedded single quote in a \$filters.<id> value (SQL doubling escape)", () => {
    const filterState = fakeFilterState({ mode: "Driver's Ed" })
    const result = expand("SELECT * FROM t WHERE mode = '\$filters.mode'", config, filterState, [])
    expect(result).toContain(`mode = 'Driver''s Ed'`)
  })

  // 007-observable-plot-panel, research.md §2: $inputs.<id> mirrors
  // $filters.<id>'s treatment exactly, resolved via a separate inputState
  // param rather than merged into filterState.
  it('expands $inputs.<id> via the new inputState param', () => {
    const filterState = fakeFilterState({})
    const inputState = fakeFilterState({ mode_select: 'SOV' })
    const result = expand(
      "SELECT * FROM t WHERE mode = '\$inputs.mode_select'",
      config,
      filterState,
      [],
      inputState,
    )
    expect(result).toContain("mode = 'SOV'")
    expect(result).not.toMatch(/\$inputs\./)
  })

  it('throws naming the specific unresolved $inputs reference when no inputState is passed (mirrors $filters behavior)', () => {
    const filterState = fakeFilterState({})
    expect(() =>
      expand('$inputs.mode_select', config, filterState, []),
    ).toThrowError(/inputs\.mode_select/)
  })

  it('expands a multiselect $inputs.<id> array value into a comma-joined, quoted list for an IN (...) slot', () => {
    const filterState = fakeFilterState({})
    const inputState = fakeFilterState({ mode_select: ['SOV', 'HOV'] })
    const result = expand(
      "SELECT * FROM t WHERE mode IN (\$inputs.mode_select)",
      config,
      filterState,
      [],
      inputState,
    )
    expect(result).toContain("mode IN ('SOV','HOV')")
  })

  it("escapes an embedded single quote in a scalar \$inputs.<id> value (SQL doubling escape)", () => {
    const filterState = fakeFilterState({})
    const inputState = fakeFilterState({ mode_select: "Driver's Ed" })
    const result = expand(
      "SELECT * FROM t WHERE mode = '\$inputs.mode_select'",
      config,
      filterState,
      [],
      inputState,
    )
    expect(result).toContain(`mode = 'Driver''s Ed'`)
  })

  it('escapes embedded single quotes in each element of a multiselect $inputs.<id> array value', () => {
    const filterState = fakeFilterState({})
    const inputState = fakeFilterState({ mode_select: ["Driver's Ed", 'SOV'] })
    const result = expand(
      "SELECT * FROM t WHERE mode IN (\$inputs.mode_select)",
      config,
      filterState,
      [],
      inputState,
    )
    expect(result).toContain(`mode IN ('Driver''s Ed','SOV')`)
  })

  it("omits the entire line when an \$inputs value is the 'all' sentinel, mirroring \$filters", () => {
    const filterState = fakeFilterState({})
    const inputState = fakeFilterState({ mode_select: 'all' })
    const template = "SELECT * FROM t\nWHERE 1=1\n  AND mode = '\$inputs.mode_select'\n"

    const result = expand(template, config, filterState, [], inputState)

    expect(result).not.toContain('$inputs.mode_select')
    expect(result).not.toContain('AND mode =')
    expect(result).toContain('SELECT * FROM t')
  })

  it('never calls eval() or Function() — string substitution only (Principle III)', () => {
    const source = readFileSync(join(__dirname, '../../src/services/sqlExpander.ts'), 'utf-8')
    // Strip line comments first so descriptive mentions of "eval()" in
    // comments (like this module's own header) don't false-positive.
    const code = source.replace(/\/\/.*$/gm, '')
    expect(code).not.toMatch(/\beval\s*\(/)
    expect(code).not.toMatch(/\bnew Function\s*\(/)
  })
})

// 018-baseline-scenario-designation: $baseline.<metric> — resolves to a
// single bare view reference ("{scenario}__{metric}"), NOT a UNION ALL
// like $scenario.x above (quickstart.md Scenario 4, FR-007-FR-009).
describe('sqlExpander.expand — $baseline.<metric>', () => {
  it('resolves to the correct single-scenario view reference', () => {
    const filterState = fakeFilterState({})
    const result = expand(
      'SELECT * FROM $baseline.trip_mode_share',
      config,
      filterState,
      [],
      undefined,
      'abm_2026',
    )
    expect(result).toBe('SELECT * FROM "abm_2026__trip_mode_share"')
    expect(result).not.toContain('UNION ALL')
  })

  it('the same authored template tracks a later change to the baseline scenario', () => {
    const filterState = fakeFilterState({})
    const template = 'SELECT * FROM $baseline.trip_mode_share'

    const first = expand(template, config, filterState, [], undefined, 'abm_2026')
    expect(first).toContain('"abm_2026__trip_mode_share"')

    const second = expand(template, config, filterState, [], undefined, 'base_tbm')
    expect(second).toContain('"base_tbm__trip_mode_share"')
    expect(second).not.toContain('abm_2026')
  })

  it('throws clearly when no baseline scenario is resolved (FR-009)', () => {
    const filterState = fakeFilterState({})
    expect(() =>
      expand('SELECT * FROM $baseline.trip_mode_share', config, filterState, []),
    ).toThrow(/unresolved placeholder "baseline\.trip_mode_share \(no baseline scenario\)"/)
  })

  it('does not require a leading FROM keyword, matching $sql.x\'s own bare-reference convention', () => {
    const filterState = fakeFilterState({})
    const result = expand(
      'JOIN $baseline.trip_mode_share b ON a.taz_id = b.taz_id',
      config,
      filterState,
      [],
      undefined,
      'abm_2026',
    )
    expect(result).toBe('JOIN "abm_2026__trip_mode_share" b ON a.taz_id = b.taz_id')
  })

  it('every existing call site remains unaffected — omitting the new 6th param changes nothing else', () => {
    // Direct proof of research.md §5's "zero-touch on every existing
    // caller" finding: the exact same expansion this file's very first
    // test (SC-004) already asserted still holds byte-for-byte when
    // called with the pre-existing 4/5-argument shape.
    const filterState = fakeFilterState({ purpose: 'HBW' })
    const template = `
SELECT
  purpose,
  CASE mode $mappings.major_mode END AS major_mode,
  $bins.share_bucket AS share_bucket
FROM (SELECT * FROM $sql.base_table)
WHERE 1=1
  AND purpose = '$filters.purpose'
`.trim()

    const result = expand(template, config, filterState, ['good_scenario'])

    expect(result).not.toMatch(/\$mappings\./)
    expect(result).not.toMatch(/\$baseline\./)
    expect(result).toContain("WHEN 'SOV' THEN 'Drive'")
    expect(result).toContain('good_scenario__trip_mode_share')
    expect(result).toContain("purpose = 'HBW'")
  })
})

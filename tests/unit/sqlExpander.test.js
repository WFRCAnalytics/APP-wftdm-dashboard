import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { expand } from '../../src/services/sqlExpander.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const config = {
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

function fakeFilterState(values) {
  return { get: (id) => values[id] }
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

  it('omits the entire line when a $filters value is the \'all\' sentinel (FR-016)', () => {
    const filterState = fakeFilterState({ purpose: 'all' })
    const template = 'SELECT * FROM t\nWHERE 1=1\n  AND purpose = \'$filters.purpose\'\n'

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

  it('never calls eval() or Function() — string substitution only (Principle III)', () => {
    const source = readFileSync(join(__dirname, '../../src/services/sqlExpander.js'), 'utf-8')
    // Strip line comments first so descriptive mentions of "eval()" in
    // comments (like this module's own header) don't false-positive.
    const code = source.replace(/\/\/.*$/gm, '')
    expect(code).not.toMatch(/\beval\s*\(/)
    expect(code).not.toMatch(/\bnew Function\s*\(/)
  })
})

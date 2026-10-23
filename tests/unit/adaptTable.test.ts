import { afterEach, describe, expect, it } from 'vitest'
import { adaptTable, regroup, withShare, type RawSource } from '../../src/charts/data/adapt.ts'
import { configureVocab } from '../../src/charts/vocab.ts'
import type { Row } from '../../src/charts/types.ts'

// What a real deployment's tables will throw at the adapters: a different vocabulary, several raw values per label,
// values the vocabulary does not list, missing or empty tables, junk numbers.

function source(tables: Record<string, Row[]>): RawSource {
  return { has: (t) => t in tables, rows: async (t) => tables[t] ?? [] }
}
const byKey = (rows: Row[] | null, key: string) => Object.fromEntries((rows ?? []).map((r) => [String(r[key]), r]))

afterEach(() => configureVocab(undefined))

describe('a deployment vocabulary with raw ids', () => {
  const vocab = {
    modes: [
      { label: 'Drive alone', ids: ['SOV'] },
      { label: 'Shared ride', ids: ['HOV2', 'HOV3'] },
      { label: 'Transit', ids: ['WALK_TRANSIT', 'DRIVE_TRANSIT'] },
    ],
    purposes: [
      { label: 'Work', ids: ['work'] },
      { label: 'Other', ids: ['shop', 'othmaint'] },
    ],
  }

  it('sums raw modes that share a label and shares add up to one', async () => {
    configureVocab(vocab)
    const rows = await adaptTable(
      'trip_mode_share',
      source({
        trip_mode_share: [
          { major_trip_mode: 'SOV', trips: 600 },
          { major_trip_mode: 'HOV2', trips: 100 },
          { major_trip_mode: 'HOV3', trips: 100 },
          { major_trip_mode: 'WALK_TRANSIT', trips: 150 },
          { major_trip_mode: 'DRIVE_TRANSIT', trips: 50 },
        ],
      }),
    )
    const m = byKey(rows, 'major_trip_mode')
    expect(Object.keys(m).sort()).toEqual(['Drive alone', 'Shared ride', 'Transit'])
    expect(m['Shared ride'].trips).toBe(200)
    expect(m.Transit.share).toBeCloseTo(0.2)
    expect((rows ?? []).reduce((s, r) => s + (r.share as number), 0)).toBeCloseTo(1)
  })

  it('leaves out raw values the vocabulary does not list, and shares are over what is left', async () => {
    configureVocab(vocab)
    const rows = await adaptTable(
      'trip_mode_share',
      source({ trip_mode_share: [{ major_trip_mode: 'SOV', trips: 90 }, { major_trip_mode: 'TNC', trips: 10 }] }),
    )
    expect(rows).toHaveLength(1)
    expect(rows![0]).toMatchObject({ major_trip_mode: 'Drive alone', share: 1 })
  })

  it('maps both dimensions of the purpose to mode flow and derives share within each purpose', async () => {
    configureVocab(vocab)
    const rows = await adaptTable(
      'trip_mode_share_by_purpose',
      source({
        purpose_mode_flow: [
          { primary_purpose: 'work', major_trip_mode: 'SOV', trips: 75 },
          { primary_purpose: 'work', major_trip_mode: 'WALK_TRANSIT', trips: 25 },
          { primary_purpose: 'shop', major_trip_mode: 'SOV', trips: 10 },
          { primary_purpose: 'othmaint', major_trip_mode: 'SOV', trips: 30 },
        ],
      }),
    )
    const other = (rows ?? []).filter((r) => r.primary_purpose === 'Other')
    expect(other).toHaveLength(1)
    expect(other[0]).toMatchObject({ trips: 40, share: 1 })
    expect((rows ?? []).find((r) => r.primary_purpose === 'Work' && r.major_trip_mode === 'Transit')?.share).toBeCloseTo(0.25)
  })

  it('maps auto ownership and income when the table is in raw codes', async () => {
    configureVocab({ autos: [{ label: '0 cars', ids: [0] }, { label: '1+ cars', ids: [1, 2, 3] }], incomes: [{ label: 'Low', ids: ['low'] }] })
    const rows = await adaptTable(
      'auto_ownership_summary',
      source({
        auto_ownership_summary: [
          { auto_ownership: 0, income_group: 'low', households: 5 },
          { auto_ownership: 1, income_group: 'low', households: 7 },
          { auto_ownership: 3, income_group: 'low', households: 3 },
        ],
      }),
    )
    expect(byKey(rows, 'auto_ownership')['1+ cars'].households).toBe(10)
  })
})

describe('tables already in the chart vocabulary, empty or missing', () => {
  it('passes a published table through untouched', async () => {
    const rows = [{ major_trip_mode: 'SOV', trips: 3, share: 1 }]
    expect(await adaptTable('trip_mode_share', source({ trip_mode_share: rows }))).toEqual(rows)
  })
  it('returns null for a table the run lacks and for an unknown one', async () => {
    expect(await adaptTable('trip_mode_share', source({}))).toBeNull()
    expect(await adaptTable('anything_else', source({}))).toBeNull()
    expect(await adaptTable('zone_transit_share', source({}))).toBeNull()
    expect(await adaptTable('population_age_sex', source({}))).toBeNull()
    expect(await adaptTable('trips_by_hour', source({}))).toBeNull()
  })
  it('an empty table gives no rows, never NaN', async () => {
    configureVocab({ modes: [{ label: 'Transit', ids: ['T'] }] })
    expect(await adaptTable('trip_mode_share', source({ trip_mode_share: [] }))).toEqual([])
    expect(await adaptTable('summary_kpis', source({ summary_kpis: [] }))).toEqual([])
  })
  it('purpose to mode distance flow falls back to the purpose to mode flow', async () => {
    const rows = await adaptTable('purpose_mode_distance_flow', source({ purpose_mode_flow: [{ primary_purpose: 'Work', major_trip_mode: 'Walk', trips: 4 }] }))
    expect(rows).toEqual([{ primary_purpose: 'Work', major_trip_mode: 'Walk', trips: 4 }])
  })
})

describe('junk numbers', () => {
  it('regroup counts a blank, null or text count as zero', () => {
    const rows = regroup(
      [{ g: 'a', n: 5 }, { g: 'a', n: null }, { g: 'a', n: '' }, { g: 'a', n: 'x' }, { g: 'b', n: undefined }],
      [{ column: 'g', dimension: 'district' }],
      ['n'],
    )
    expect(byKey(rows, 'g').a.n).toBe(5)
    expect(byKey(rows, 'g').b.n).toBe(0)
  })
  it('withShare gives zero, not NaN, when a group totals zero', () => {
    const rows = withShare([{ g: 'a', n: 0 }, { g: 'a', n: 0 }, { g: 'b', n: 2 }], 'n', ['g'])
    expect(rows.map((r) => r.share)).toEqual([0, 0, 1])
  })
})

describe('trip scheduling to the time-of-day tables', () => {
  const scheduling = [
    { primary_purpose: 'Work', depart_hour: 7, trips: 10 },
    { primary_purpose: 'Work', depart_hour: 7, trips: 5 },
    { primary_purpose: 'Other', depart_hour: 23, trips: 4 },
  ]
  it('gives every purpose all 24 hours, zeros included', async () => {
    const rows = (await adaptTable('trips_by_hour_purpose', source({ trip_scheduling: scheduling })))!
    expect(rows).toHaveLength(48)
    expect(rows.find((r) => r.primary_purpose === 'Work' && r.hour === 7)?.trips).toBe(15)
    expect(rows.find((r) => r.primary_purpose === 'Work' && r.hour === 8)?.trips).toBe(0)
    expect(rows.find((r) => r.primary_purpose === 'Other' && r.hour === 23)?.trips).toBe(4)
  })
  it('keeps the hours when the deployment configures district aliases', async () => {
    configureVocab({ districts: [{ label: 'Weber', ids: ['1'] }, { label: 'Davis', ids: ['2'] }] })
    const rows = (await adaptTable('trips_by_hour_purpose', source({ trip_scheduling: scheduling })))!
    expect(rows.find((r) => r.primary_purpose === 'Work' && r.hour === 7)?.trips).toBe(15)
  })
  it('trips_by_hour ignores hours outside 0..23 and junk', async () => {
    const rows = (await adaptTable(
      'trips_by_hour',
      source({ trip_scheduling: [...scheduling, { depart_hour: -1, trips: 99 }, { depart_hour: 24, trips: 99 }, { depart_hour: 'x', trips: 99 }] }),
    ))!
    expect(rows).toHaveLength(24)
    expect(rows.reduce((s, r) => s + (r.trips as number), 0)).toBe(19)
  })
  it('a scheduling table without a depart_hour column still gives a full, empty day', async () => {
    const rows = (await adaptTable('trips_by_hour', source({ trip_scheduling: [{ trips: 5 }] })))!
    expect(rows.reduce((s, r) => s + (r.trips as number), 0)).toBe(0)
  })
})

describe('summary KPIs', () => {
  it('derives the shares and the average trip length when the table lacks them', async () => {
    const rows = (await adaptTable(
      'summary_kpis',
      source({
        summary_kpis: [{ trips: 100 }],
        trip_mode_share: [
          { major_trip_mode: 'Drive alone', trips: 60 },
          { major_trip_mode: 'Transit', trips: 10 },
          { major_trip_mode: 'Walk', trips: 20 },
          { major_trip_mode: 'Bike', trips: 10 },
        ],
        trip_distance_by_purpose: [
          { trips: 30, avg_distance_miles: 10 },
          { trips: 10, avg_distance_miles: 2 },
        ],
      }),
    ))!
    expect(rows[0]).toMatchObject({ drive_share: 0.6, transit_share: 0.1 })
    expect(rows[0].active_share).toBeCloseTo(0.3)
    expect(rows[0].avg_trip_length_miles).toBeCloseTo(8)
  })
  it('keeps the values the table already has and survives a distance table with no trips', async () => {
    const rows = (await adaptTable(
      'summary_kpis',
      source({ summary_kpis: [{ transit_share: 0.5, avg_trip_length_miles: 3 }], trip_mode_share: [{ major_trip_mode: 'Transit', trips: 1 }], trip_distance_by_purpose: [{ trips: 0, avg_distance_miles: 9 }] }),
    ))!
    expect(rows[0]).toMatchObject({ transit_share: 0.5, avg_trip_length_miles: 3 })
    const none = (await adaptTable('summary_kpis', source({ summary_kpis: [{ trips: 1 }], trip_distance_by_purpose: [{ trips: 0, avg_distance_miles: 9 }] })))!
    expect(none[0].avg_trip_length_miles).toBeUndefined()
  })
})

describe('zone transit share from trip ends', () => {
  it('is the transit share of each zone, with residents from the land use table', async () => {
    configureVocab({ modes: [{ label: 'Transit', ids: ['WT', 'DT'] }, { label: 'Drive alone', ids: ['SOV'] }] })
    const rows = (await adaptTable(
      'zone_transit_share',
      source({
        trip_ends_by_zone_mode: [
          { zone_id: 1, major_trip_mode: 'WT', trips: 10, district: 'Davis' },
          { zone_id: 1, major_trip_mode: 'SOV', trips: 30 },
          { zone_id: 2, major_trip_mode: 'SOV', trips: 5 },
        ],
        land_use_summary: [{ zone_id: 1, TOTPOP: 800 }],
      }),
    ))!
    const z = byKey(rows, 'taz_id')
    expect(z['1']).toMatchObject({ transit_share: 0.25, residents: 800, district: 'Davis' })
    expect(z['2']).toMatchObject({ transit_share: 0, residents: 0 })
  })
  it('works without a land use table and with a zone that has no trips counted', async () => {
    const rows = (await adaptTable('zone_transit_share', source({ trip_ends_by_zone_mode: [{ zone_id: '7', major_trip_mode: 'Transit', trips: 0 }] })))!
    expect(rows).toEqual([{ taz_id: 7, transit_share: 0, residents: 0, district: '' }])
  })
})

describe('population by age and sex', () => {
  const persons = (rows: Row[]) => adaptTable('population_age_sex', source({ person_household_profile: rows }))
  it('makes 17 five-year bands with 80+ on top, in both sexes', async () => {
    const rows = (await persons([{ age: 0, sex: 1 }, { age: 79, sex: 2 }, { age: 80, sex: 1 }, { age: 104, sex: 2 }]))!
    expect(rows).toHaveLength(34)
    const get = (band: string, sex: string) => rows.find((r) => r.age_band === band && r.sex === sex)?.persons
    expect(get('0-4', 'Male')).toBe(1)
    expect(get('75-79', 'Female')).toBe(1)
    expect(get('80+', 'Male')).toBe(1)
    expect(get('80+', 'Female')).toBe(1)
  })
  it('does not count a person with a missing age or an unknown sex code', async () => {
    const rows = (await persons([{ age: 30, sex: 1 }, { age: undefined, sex: 1 }, { age: 'x', sex: 2 }, { age: 30, sex: 0 }, { age: 30, sex: undefined }, { age: null, sex: 1 }, { age: '', sex: 2 }, { age: -3, sex: 1 }]))!
    expect(rows.reduce((s, r) => s + (r.persons as number), 0)).toBe(1)
    expect(rows.find((r) => r.age_band === '30-34' && r.sex === 'Female')?.persons).toBe(0)
  })
})

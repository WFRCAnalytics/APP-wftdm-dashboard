import { describe, expect, it } from 'vitest'
import { Bool, DateDay, Field, Float64, Int32, TimestampMillisecond, Utf8 } from 'apache-arrow'

import { inferFields } from '@/panels/graphicWalkerFields'

// 014-graphic-walker-panel, research.md §5: Arrow DataType predicate ->
// semanticType/analyticType mapping, confirmed directly against the real,
// installed apache-arrow API (not assumed) before this file was written.
describe('inferFields', () => {
  it('maps an Int32 column to quantitative/measure', () => {
    const fields = inferFields([new Field('total_trips', new Int32())])
    expect(fields).toEqual([
      { fid: 'total_trips', name: 'total_trips', semanticType: 'quantitative', analyticType: 'measure' },
    ])
  })

  it('maps a Float64 column to quantitative/measure', () => {
    const fields = inferFields([new Field('share', new Float64())])
    expect(fields[0]).toMatchObject({ semanticType: 'quantitative', analyticType: 'measure' })
  })

  it('maps a Utf8 column to nominal/dimension', () => {
    const fields = inferFields([new Field('mode', new Utf8())])
    expect(fields[0]).toMatchObject({ semanticType: 'nominal', analyticType: 'dimension' })
  })

  it('maps a Bool column to nominal/dimension', () => {
    const fields = inferFields([new Field('is_transit', new Bool())])
    expect(fields[0]).toMatchObject({ semanticType: 'nominal', analyticType: 'dimension' })
  })

  it('maps a Date column to temporal/dimension', () => {
    const fields = inferFields([new Field('survey_date', new DateDay())])
    expect(fields[0]).toMatchObject({ semanticType: 'temporal', analyticType: 'dimension' })
  })

  it('maps a Timestamp column to temporal/dimension', () => {
    const fields = inferFields([new Field('logged_at', new TimestampMillisecond())])
    expect(fields[0]).toMatchObject({ semanticType: 'temporal', analyticType: 'dimension' })
  })

  it('uses the column name verbatim for both fid and name when no override applies', () => {
    const fields = inferFields([new Field('purpose', new Utf8())])
    expect(fields[0].fid).toBe('purpose')
    expect(fields[0].name).toBe('purpose')
  })

  it('replaces a matching fid override wholesale, leaving unrelated fields untouched', () => {
    const fields = inferFields(
      [new Field('taz_id', new Int32()), new Field('mode', new Utf8())],
      [{ fid: 'taz_id', semanticType: 'nominal', analyticType: 'dimension' }],
    )
    expect(fields).toEqual([
      { fid: 'taz_id', name: 'taz_id', semanticType: 'nominal', analyticType: 'dimension' },
      { fid: 'mode', name: 'mode', semanticType: 'nominal', analyticType: 'dimension' },
    ])
  })

  it('applies an override-supplied name when present', () => {
    const fields = inferFields(
      [new Field('taz_id', new Int32())],
      [{ fid: 'taz_id', name: 'TAZ', semanticType: 'nominal', analyticType: 'dimension' }],
    )
    expect(fields[0].name).toBe('TAZ')
  })

  it('never applies an override naming a fid absent from the actual columns — no error', () => {
    const fields = inferFields(
      [new Field('mode', new Utf8())],
      [{ fid: 'nonexistent_column', semanticType: 'quantitative', analyticType: 'measure' }],
    )
    expect(fields).toEqual([
      { fid: 'mode', name: 'mode', semanticType: 'nominal', analyticType: 'dimension' },
    ])
  })

  it('returns [] for an empty schema', () => {
    expect(inferFields([])).toEqual([])
  })
})

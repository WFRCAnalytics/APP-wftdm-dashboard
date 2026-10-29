import { describe, expect, it } from 'vitest'

import { getPath, renderReference, resolve, SETTINGS, validate, type SettingDef } from '../../src/config'

// One new row is the whole change: it loads, validates, cascades and is documented with no other source edit.
const extra: SettingDef = { path: 'footer.note', type: 'string', cascade: true, default: 'hello', description: 'A test-only setting.' }
const schema = [...SETTINGS, extra]

describe('adding a setting is one row', () => {
  it('validates it, applies its default and rejects a wrong type', () => {
    expect(getPath(validate({}, { file: 'x', schema }).settings, 'footer.note')).toBe('hello')
    expect(getPath(validate({ footer: { note: 'a' } }, { file: 'x', schema }).settings, 'footer.note')).toBe('a')
    expect(validate({ footer: { note: 3 } }, { file: 'x', schema }).problems.map((p) => p.path)).toEqual(['footer.note'])
    expect(validate({ footer: { note: 'a' } }, { file: 'x' }).problems.map((p) => p.kind)).toEqual(['unknown_key'])
  })

  it('cascades it by its own rule', () => {
    const r = resolve({ site: { footer: { note: 'site' } }, page: { footer: { note: 'page' } } }, schema)
    expect(getPath(r.values, 'footer.note')).toBe('page')
    expect(r.source['footer.note']).toBe('page')
  })

  it('documents it', () => {
    expect(renderReference(schema)).toContain('`footer.note`')
    expect(renderReference()).not.toContain('`footer.note`')
  })
})

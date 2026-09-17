import { afterEach, describe, expect, it } from 'vitest'

import {
  computeForegroundFor,
  getDeployerInterfaceColor,
  resolveInterfaceColor,
  setDeployerInterfaceColor,
} from '@/panels/interfaceColor'

describe('resolveInterfaceColor', () => {
  afterEach(() => {
    setDeployerInterfaceColor('primary', undefined)
  })

  it('a viewer override always wins over the deployer default', () => {
    setDeployerInterfaceColor('primary', '#111111')
    expect(resolveInterfaceColor('primary', '#222222')).toBe('#222222')
  })

  it('falls back to the deployer default when no override is set', () => {
    setDeployerInterfaceColor('primary', '#111111')
    expect(resolveInterfaceColor('primary', undefined)).toBe('#111111')
  })

  it('returns undefined (use the shipped tokens.css value) when neither is set', () => {
    expect(resolveInterfaceColor('primary', undefined)).toBeUndefined()
  })

  it('clearing the deployer default restores undefined', () => {
    setDeployerInterfaceColor('primary', '#111111')
    expect(getDeployerInterfaceColor('primary')).toBe('#111111')
    setDeployerInterfaceColor('primary', undefined)
    expect(getDeployerInterfaceColor('primary')).toBeUndefined()
  })

  it('each role is independent', () => {
    setDeployerInterfaceColor('primary', '#111111')
    expect(getDeployerInterfaceColor('secondary')).toBeUndefined()
    expect(getDeployerInterfaceColor('accent')).toBeUndefined()
  })
})

describe('computeForegroundFor', () => {
  it('returns black for a light background', () => {
    expect(computeForegroundFor('#ffffff')).toBe('#000000')
    expect(computeForegroundFor('#f5f5f5')).toBe('#000000')
  })

  it('returns white for a dark background', () => {
    expect(computeForegroundFor('#000000')).toBe('#ffffff')
    expect(computeForegroundFor('#171717')).toBe('#ffffff')
  })
})

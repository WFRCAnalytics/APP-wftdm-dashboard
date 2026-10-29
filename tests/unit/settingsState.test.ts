import { afterEach, describe, expect, it } from 'vitest'

import { configureSettingsTabs, getSettingsUi, getShownSettingsTabs, openSettings, setSettingsTab } from '../../src/state/settingsState'

afterEach(() => configureSettingsTabs(['appearance', 'scenarios', 'basemap', 'ai', 'documentation']))

describe('settings tab list', () => {
  it('starts with today\'s five tabs, in order', () => {
    expect(getShownSettingsTabs()).toEqual(['appearance', 'scenarios', 'basemap', 'ai', 'documentation'])
  })

  it('opens on the first listed tab when the open one is not listed', () => {
    configureSettingsTabs(['scenarios', 'appearance'])
    expect(getSettingsUi().tab).toBe('scenarios')
  })

  it('falls back to the first listed tab when asked for one that is not shown', () => {
    configureSettingsTabs(['scenarios', 'appearance'])
    openSettings('ai')
    expect(getSettingsUi().tab).toBe('scenarios')
    setSettingsTab('documentation')
    expect(getSettingsUi().tab).toBe('scenarios')
    setSettingsTab('appearance')
    expect(getSettingsUi().tab).toBe('appearance')
  })

  it('never takes an empty list', () => {
    configureSettingsTabs([])
    expect(getShownSettingsTabs()).toHaveLength(5)
  })
})

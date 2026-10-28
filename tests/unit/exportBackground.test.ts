// @vitest-environment jsdom
// The image background of every export: the choice is shared, and white or transparent in the dark theme shows the light theme only
// for the moment of the capture, then puts the dark theme back.
import { afterEach, describe, expect, it } from 'vitest'

import { getExportBackground, setExportBackground, withExportBackground } from '@/services/exportBackground'

afterEach(() => {
  document.documentElement.classList.remove('dark')
  document.body.innerHTML = ''
  setExportBackground('theme')
})

describe('the shared choice', () => {
  it('starts on Match theme and is one value for every export', () => {
    expect(getExportBackground()).toBe('theme')
    setExportBackground('transparent')
    expect(getExportBackground()).toBe('transparent')
  })
})

describe('withExportBackground', () => {
  it('hands the job the theme fill, white, or nothing', async () => {
    expect(await withExportBackground('theme', '#141922', async (f) => f)).toBe('#141922')
    expect(await withExportBackground('white', '#141922', async (f) => f)).toBe('#ffffff')
    expect(await withExportBackground('transparent', '#141922', async (f) => f)).toBeNull()
  })
  it('leaves the theme alone for Match theme', async () => {
    document.documentElement.classList.add('dark')
    await withExportBackground('theme', '#141922', async () => {
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })
  })
  it('shows the light theme behind a cover while a dark page is captured, then restores it', async () => {
    document.documentElement.classList.add('dark')
    let during = { dark: true, covered: false }
    await withExportBackground('transparent', '#141922', async () => {
      during = { dark: document.documentElement.classList.contains('dark'), covered: !!document.querySelector('[data-export-skip][role="status"]') }
    })
    expect(during).toEqual({ dark: false, covered: true })
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.querySelector('[data-export-skip][role="status"]')).toBeNull()
  })
  it('does not switch a page that is already light', async () => {
    let covered = true
    await withExportBackground('white', '#fff', async () => { covered = !!document.querySelector('[role="status"]') })
    expect(covered).toBe(false)
  })
  it('restores the dark theme even when the capture fails', async () => {
    document.documentElement.classList.add('dark')
    await expect(withExportBackground('white', '#141922', async () => { throw new Error('boom') })).rejects.toThrow('boom')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.querySelector('[data-export-skip]')).toBeNull()
  })
})

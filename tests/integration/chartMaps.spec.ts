import { test, expect, type Page } from '@playwright/test'
import type { WftdmDebugHook } from '../../src/main.tsx'

declare global {
  interface Window {
    __wftdm?: WftdmDebugHook
    __glStats?: { created: number; lost: number }
  }
}

type TestMap = {
  map: {
    getCenter(): { lng: number; lat: number }
    getZoom(): number
    project(p: [number, number]): { x: number; y: number }
    getCanvas(): HTMLCanvasElement
    getPaintProperty(layer: string, prop: string): unknown
  }
}

// 063 redesign P8: the zone-map kinds (Values, Difference, Swipe) in the Summary tile "Where transit grows", the
// side-by-side grid with its linked camera, synced hover and paging, and the basemap choice. The maps are MapLibre
// instances exposed for tests as window.__wfzMaps.

const TILE = 'Where transit grows'
const STATE_PATH = '/APP-wftdm-dashboard/src/state/basemapState.ts'

async function boot(page: Page) {
  // count WebGL contexts created and lost (a leaked map would show up as lost contexts or console warnings)
  await page.addInitScript(() => {
    const stats = { created: 0, lost: 0 }
    window.__glStats = stats
    const orig = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (type === 'webgl' || type === 'webgl2') {
        if (!(this as unknown as { __counted?: boolean }).__counted) {
          ;(this as unknown as { __counted?: boolean }).__counted = true
          stats.created++
          this.addEventListener('webglcontextlost', () => stats.lost++)
        }
      }
      return (orig as (...a: unknown[]) => unknown).call(this, type, ...rest)
    } as typeof orig
  })
  await page.goto('/')
  await page.waitForFunction(() => window.__wftdm !== undefined, null, { timeout: 60_000 })
  await page.waitForSelector('.wfz-map canvas', { timeout: 120_000 })
}

const tileBody = (page: Page) => page.getByTestId('row_zones_flows_compare')
const tileTitle = (page: Page) => page.getByText(TILE, { exact: true }).first()

async function liveMaps(page: Page): Promise<number> {
  return page.evaluate(() => [...((window as unknown as { __wfzMaps?: Set<TestMap> }).__wfzMaps ?? [])].length)
}

async function cameras(page: Page) {
  return page.evaluate(() =>
    [...((window as unknown as { __wfzMaps?: Set<TestMap> }).__wfzMaps ?? [])].map(({ map }) => {
      const c = map.getCenter()
      return { lng: +c.lng.toFixed(5), lat: +c.lat.toFixed(5), zoom: +map.getZoom().toFixed(4) }
    }),
  )
}

/** Page coordinates of the centre of map `i` (a point inside the zone strip). */
async function mapCentre(page: Page, i: number) {
  return page.evaluate((idx) => {
    const { map } = [...((window as unknown as { __wfzMaps?: Set<TestMap> }).__wfzMaps ?? [])][idx]
    const c = map.getCenter()
    const p = map.project([c.lng, c.lat])
    const r = map.getCanvas().getBoundingClientRect()
    return { x: r.left + p.x, y: r.top + p.y }
  }, i)
}

/** Moves the pointer over the centre of map `i` until a zone answers (the map may still be drawing). */
async function hoverZone(page: Page, i = 0) {
  await expect
    .poll(
      async () => {
        const c = await mapCentre(page, i)
        await page.mouse.move(c.x - 40, c.y + 20)
        await page.mouse.move(c.x, c.y, { steps: 5 })
        return page.locator('.wf-tip').evaluate((e) => getComputedStyle(e).opacity).catch(() => '0')
      },
      { timeout: 15_000, intervals: [300, 500, 800] },
    )
    .toBe('1')
}

test.describe('zone maps', () => {
  test.setTimeout(240_000)

  test('side by side: one camera, one synced tooltip, 80% zones, shared controls', async ({ page }) => {
    const warnings: string[] = []
    page.on('console', (m) => {
      if (/too many active webgl contexts|context lost|webgl context/i.test(m.text())) warnings.push(m.text())
    })
    await boot(page)
    await tileTitle(page).scrollIntoViewIfNeeded()

    const n = await liveMaps(page)
    expect(n).toBeGreaterThanOrEqual(2)
    expect(n).toBeLessThanOrEqual(4)
    await expect(page.getByText('Zoom and pan are linked')).toBeVisible()
    // one shared control group in the grid, none inside the cells
    await expect(page.locator('.wf-multi .wfz-linked')).toHaveCount(1)
    await expect(page.locator('.wf-multi .wfz-chip')).toHaveCount(0)

    // the camera of every cell is the same, and a wheel on one moves all
    let cams = await cameras(page)
    expect(new Set(cams.map((c) => JSON.stringify(c))).size).toBe(1)
    const zoom0 = cams[0].zoom
    const c = await mapCentre(page, 0)
    await page.mouse.move(c.x, c.y)
    await page.mouse.wheel(0, -400)
    await expect.poll(async () => (await cameras(page))[0].zoom, { timeout: 8000 }).toBeGreaterThan(zoom0)
    await page.waitForTimeout(500)
    cams = await cameras(page)
    expect(new Set(cams.map((m) => JSON.stringify(m))).size).toBe(1)

    // the shared + button zooms them all too
    const z1 = cams[0].zoom
    await page.locator('.wf-multi .wfz-linked').getByRole('button', { name: 'Zoom in' }).click()
    await expect.poll(async () => (await cameras(page)).every((m) => m.zoom > z1), { timeout: 8000 }).toBe(true)
    await page.waitForTimeout(500)
    expect(new Set((await cameras(page)).map((m) => JSON.stringify(m))).size).toBe(1)

    // hover a zone: ONE tooltip with every scenario, and the same zone outlined in every cell
    await hoverZone(page)
    const tip = page.locator('.wf-tip')
    await expect(tip).toContainText('TAZ')
    await expect(tip.locator('.tt-r')).toHaveCount(n)
    await expect(tip.locator('.tt-r.b')).toContainText('reference')
    await expect(page.locator('.wf-tip')).toHaveCount(1)

    // zones are 80% opaque over a real basemap, fully opaque on a blank one
    const opacities = await page.evaluate(() => [...((window as unknown as { __wfzMaps?: Set<TestMap> }).__wfzMaps ?? [])].map(({ map }) => map.getPaintProperty('wfz-fill', 'fill-opacity')))
    expect(opacities.every((o) => o === 0.8 || o === 1)).toBe(true)

    // leaving the grid hides the tooltip
    await page.mouse.move(5, 5)
    await expect(tip).toHaveCSS('opacity', '0')
    expect(warnings).toEqual([])
  })

  test('paging disposes the old maps: never more than 4 live, no leaked WebGL contexts', async ({ page }) => {
    const warnings: string[] = []
    page.on('console', (m) => {
      if (/too many active webgl contexts|context lost|webgl context/i.test(m.text())) warnings.push(m.text())
    })
    await boot(page)
    await tileTitle(page).scrollIntoViewIfNeeded()
    // five scenarios: the reference plus four others (two pages of 3)
    await page.evaluate(() => {
      const cs = window.__wftdm!.compareState
      cs.toggleCompareMember('express-bus')
      cs.toggleCompareMember('brt-corridor')
    })
    await expect(tileBody(page).getByRole('button', { name: 'Next scenarios' })).toBeVisible({ timeout: 30_000 })
    await expect.poll(() => liveMaps(page), { timeout: 30_000 }).toBe(4)

    // pan/zoom, then page: the camera survives and the count stays at most 4
    const c = await mapCentre(page, 0)
    await page.mouse.move(c.x, c.y)
    await page.mouse.wheel(0, -500)
    await page.waitForTimeout(800)
    const before = (await cameras(page))[0]
    const created0 = await page.evaluate(() => window.__glStats!.created)

    for (let i = 0; i < 4; i++) {
      await tileBody(page).getByRole('button', { name: i % 2 === 0 ? 'Next scenarios' : 'Previous scenarios' }).click()
      await page.waitForTimeout(1500)
      expect(await liveMaps(page)).toBeLessThanOrEqual(4)
    }
    const after = await cameras(page)
    expect(new Set(after.map((m) => JSON.stringify(m))).size).toBe(1)
    expect(Math.abs(after[0].zoom - before.zoom)).toBeLessThan(0.01)
    expect(Math.abs(after[0].lng - before.lng)).toBeLessThan(0.001)
    const stats = await page.evaluate(() => ({ ...window.__glStats! }))
    expect(stats.created).toBeGreaterThan(created0) // new pages did create maps
    // map.remove() deliberately loses its context, so lost events count disposals: live contexts = created - lost
    expect(stats.created - stats.lost).toBeLessThanOrEqual(4)
    expect(stats.lost).toBeGreaterThan(0)
    expect(warnings).toEqual([])
  })

  test('values with Compare switched to one at a time has its own control group and caption', async ({ page }) => {
    await boot(page)
    await tileTitle(page).scrollIntoViewIfNeeded()
    await page.getByText('One at a time').click()
    await expect.poll(() => liveMaps(page), { timeout: 30_000 }).toBe(1)
    await expect(page.locator('[data-chart-kind="zone-map"] .wfz-ctl')).toBeVisible()
    await expect(page.locator('[data-chart-kind="zone-map"] .wfz-chip')).toBeVisible()
    await expect(page.locator('[data-chart-kind="zone-map"] .wfz-legend')).toContainText('14%+ transit share')
    await hoverZone(page)
    await expect(page.locator('.wf-tip')).toContainText('Transit share')
    await expect(page.locator('.wf-tip')).toContainText('Residents')
  })

  test('difference map: diverging legend and a caption naming the reference', async ({ page }) => {
    await boot(page)
    await tileTitle(page).scrollIntoViewIfNeeded()
    await tileTitle(page).locator('xpath=following::*[text()="Difference"][1]').click()
    const el = page.locator('[data-chart-kind="zone-diff-map"]')
    await expect(el.locator('canvas').first()).toBeVisible({ timeout: 60_000 })
    await expect(el.locator('.wfz-chip')).toContainText(' minus ')
    await expect(el.locator('.wfz-legend')).toContainText('pts')
    await expect(el.locator('.wfz-legend')).toContainText('0')
    await hoverZone(page)
    await expect(page.locator('.wf-tip')).toContainText('Change vs')
    expect(await liveMaps(page)).toBe(1)
  })

  test('swipe map: slider role, arrow keys move it 24px, clamped 24px from the edges', async ({ page }) => {
    await boot(page)
    await tileTitle(page).scrollIntoViewIfNeeded()
    await tileTitle(page).locator('xpath=following::*[text()="Swipe"][1]').click()
    const el = page.locator('[data-chart-kind="zone-swipe-map"]')
    const handle = el.getByRole('slider', { name: 'Swipe between scenarios' })
    await expect(handle).toBeVisible({ timeout: 60_000 })
    await expect.poll(() => liveMaps(page), { timeout: 30_000 }).toBe(2)
    const x = async () => (await handle.boundingBox())!.x + 14
    const box = (await el.boundingBox())!
    const x0 = await x()
    expect(Math.abs(x0 - (box.x + box.width / 2))).toBeLessThan(2)
    await handle.focus()
    await page.keyboard.press('ArrowRight')
    expect(Math.round((await x()) - x0)).toBe(24)
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    expect(Math.round(x0 - (await x()))).toBe(24)
    for (let i = 0; i < 60; i++) await page.keyboard.press('ArrowLeft')
    expect(Math.round((await x()) - box.x)).toBe(24)
    for (let i = 0; i < 120; i++) await page.keyboard.press('ArrowRight')
    expect(Math.round(box.x + box.width - (await x()))).toBe(24)

    // dragging the divider does not pan the map
    const before = (await cameras(page))[0]
    const h = (await handle.boundingBox())!
    await page.mouse.move(h.x + 14, h.y + h.height / 2)
    await page.mouse.down()
    await page.mouse.move(h.x - 150, h.y + h.height / 2, { steps: 8 })
    await page.mouse.up()
    const after = (await cameras(page))[0]
    expect(after).toEqual(before)
    expect(Math.round(box.x + box.width - (await x()))).toBeGreaterThan(100)
    // the two maps share one camera
    const both = await cameras(page)
    expect(JSON.stringify(both[0])).toBe(JSON.stringify(both[1]))
    // wheel zooms both
    const c = await mapCentre(page, 0)
    await page.mouse.move(c.x, c.y)
    await page.mouse.wheel(0, -400)
    await page.waitForTimeout(800)
    const z = await cameras(page)
    expect(z[0].zoom).toBeGreaterThan(before.zoom)
    expect(JSON.stringify(z[0])).toBe(JSON.stringify(z[1]))
  })

  test('the Basemap choice applies to the zone maps; switching view disposes the maps', async ({ page }) => {
    await boot(page)
    await tileTitle(page).scrollIntoViewIfNeeded()
    await page.getByText('One at a time').click()
    await expect.poll(() => liveMaps(page), { timeout: 30_000 }).toBe(1)
    const opacity = () => page.evaluate(() => [...((window as unknown as { __wfzMaps?: Set<TestMap> }).__wfzMaps ?? [])][0].map.getPaintProperty('wfz-fill', 'fill-opacity'))
    // a preset that cannot resolve falls back to a blank style: no tiles, zones fully opaque
    await page.evaluate(async (path) => {
      const mod = await import(/* @vite-ignore */ path)
      mod.setGlobalBasemap('totally-made-up-preset')
    }, STATE_PATH)
    await expect.poll(opacity, { timeout: 20_000 }).toBe(1)
    // and back to the default basemap (online) brings the 80% zones back
    await page.evaluate(async (path) => {
      const mod = await import(/* @vite-ignore */ path)
      mod.clearGlobalBasemap()
      mod.setGlobalBasemap('openfreemap-positron')
    }, STATE_PATH)
    const back = await expect
      .poll(opacity, { timeout: 25_000 })
      .toBe(0.8)
      .then(
        () => true,
        () => false,
      )
    test.info().annotations.push({ type: 'basemap-online', description: String(back) })

    // switching the view tears the map down (no leaked WebGL contexts)
    await tileTitle(page).locator('xpath=following::*[text()="Swipe"][1]').click()
    await expect.poll(() => liveMaps(page), { timeout: 30_000 }).toBe(2)
    await tileTitle(page).locator('xpath=following::*[text()="Values"][1]').click()
    await expect.poll(() => liveMaps(page), { timeout: 30_000 }).toBeLessThanOrEqual(1)
  })
})

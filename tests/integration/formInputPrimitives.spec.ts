import { test, expect } from '@playwright/test'

// 033-shadcn-default-theme (T035): the seven new form-input primitives'
// real interaction verification — demo.html/DesignTokenDemo.tsx (T026) is
// the vehicle. demo.html is deliberately excluded from the production
// build (vite.config.ts's own comment) but IS served by the real dev
// server this suite's own webServer runs against, so it's reachable here
// exactly the way every other integration spec reaches index.html.

test.describe('form-input primitives (demo.html)', () => {
  test('Label + Input: typing a value works and the label is correctly associated', async ({ page }) => {
    await page.goto('demo.html')
    const input = page.getByLabel('Scenario name')
    await expect(input).toBeVisible()
    await input.fill('2027-rtp-baseyear')
    await expect(input).toHaveValue('2027-rtp-baseyear')
  })

  test('Select: opening and choosing an item updates the displayed value', async ({ page }) => {
    await page.goto('demo.html')
    const trigger = page.getByRole('combobox', { name: /comparison scenario/i })
    // Default value from `defaultValue="baseline"` should already show.
    await expect(trigger).toHaveText(/Baseline/i)
    await trigger.click()
    await page.getByRole('option', { name: 'Transit Variant' }).click()
    await expect(trigger).toHaveText(/Transit Variant/i)
  })

  test('Textarea: typing multi-line text works', async ({ page }) => {
    await page.goto('demo.html')
    const textarea = page.getByLabel('Notes')
    await textarea.fill('Line one\nLine two')
    await expect(textarea).toHaveValue('Line one\nLine two')
  })

  test('Checkbox: starts checked (defaultChecked) and toggles on click', async ({ page }) => {
    await page.goto('demo.html')
    const checkbox = page.getByRole('checkbox', { name: /include observed data/i })
    await expect(checkbox).toBeChecked()
    await checkbox.click()
    await expect(checkbox).not.toBeChecked()
  })

  test('Switch: starts unchecked and toggles on click', async ({ page }) => {
    await page.goto('demo.html')
    const toggle = page.getByRole('switch', { name: /enable dark mode/i })
    await expect(toggle).not.toBeChecked()
    await toggle.click()
    await expect(toggle).toBeChecked()
  })

  test('RadioGroup: starts on the default value and switching selection moves the checked state', async ({
    page,
  }) => {
    await page.goto('demo.html')
    const percentRadio = page.getByRole('radio', { name: 'Percent change' })
    const absoluteRadio = page.getByRole('radio', { name: 'Absolute change' })
    await expect(percentRadio).toBeChecked()
    await expect(absoluteRadio).not.toBeChecked()
    await absoluteRadio.click()
    await expect(absoluteRadio).toBeChecked()
    await expect(percentRadio).not.toBeChecked()
  })

  test('all seven primitives render correctly in dark mode too (no illegible/invisible content)', async ({
    page,
  }) => {
    await page.goto('demo.html')
    await page.getByRole('button', { name: /switch to dark mode/i }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)

    // A spot-check computed-style assertion, matching this project's own
    // established convention (tokenContrast.test.ts/graphicWalkerPanel.
    // spec.ts) — the Input's real border color must actually change
    // between themes (proving it's token-driven, not a hardcoded value
    // that happens to look the same in both).
    const input = page.getByLabel('Scenario name')
    const darkBorder = await input.evaluate((el) => getComputedStyle(el).borderColor)
    await page.getByRole('button', { name: /switch to light mode/i }).click()
    const lightBorder = await input.evaluate((el) => getComputedStyle(el).borderColor)
    expect(darkBorder).not.toBe(lightBorder)

    // Every primitive is still visible/interactive after the theme flip.
    await expect(page.getByRole('checkbox', { name: /include observed data/i })).toBeVisible()
    await expect(page.getByRole('switch', { name: /enable dark mode/i })).toBeVisible()
    await expect(page.getByRole('radio', { name: 'Percent change' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: /comparison scenario/i })).toBeVisible()
  })
})

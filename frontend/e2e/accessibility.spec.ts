import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { bar, expect, startLivePresentation, test } from './fixtures'

/** Runs axe (WCAG 2.1 A and AA rules) and returns serious or critical violations. */
async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.help} -> ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`)
}

test.describe('accessibility (axe, WCAG 2.1 AA)', () => {
  test('every page, with results shown, has no serious violations', async ({ page }) => {
    await page.goto('/')
    expect(await seriousViolations(page)).toEqual([])

    await page.goto('/workspace')
    await page.getByRole('button', { name: 'Run greedy, exact and QAOA' }).click()
    await expect(page.getByRole('heading', { name: 'Who was served' })).toBeVisible()
    expect(await seriousViolations(page)).toEqual([])

    await page.goto('/compare')
    await page.getByRole('button', { name: 'Run greedy, exact and QAOA' }).click()
    await expect(page.getByRole('table', { name: /Recorded benchmark/ })).toBeVisible()
    expect(await seriousViolations(page)).toEqual([])

    await page.goto('/data')
    await expect(page.getByRole('table', { name: /Data inputs/ })).toBeVisible()
    expect(await seriousViolations(page)).toEqual([])

    await page.goto('/lab')
    await page.getByRole('button', { name: 'Run QAOA on this scenario' }).click()
    await expect(page.getByRole('img', { name: /QAOA circuit/ })).toBeVisible()
    expect(await seriousViolations(page)).toEqual([])
  })

  test('narrow screens, where tables scroll sideways, have no serious violations', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/workspace')
    await page.getByRole('button', { name: 'Run greedy, exact and QAOA' }).click()
    await expect(page.getByRole('heading', { name: 'Who was served' })).toBeVisible()
    expect(await seriousViolations(page)).toEqual([])
    await page.goto('/data')
    await expect(page.getByRole('table', { name: /Data inputs/ })).toBeVisible()
    expect(await seriousViolations(page)).toEqual([])
  })

  test('the preflight dialog, presentation bar and presenter view have no serious violations', async ({ page, context }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Present', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Start with the live engine' })).toBeEnabled({ timeout: 60_000 })
    expect(await seriousViolations(page)).toEqual([])
    await page.getByRole('button', { name: 'Cancel' }).click()

    await startLivePresentation(page, '1')
    await bar(page).getByRole('button', { name: 'Presenter notes' }).click()
    expect(await seriousViolations(page)).toEqual([])

    const presenter = await context.newPage()
    await presenter.goto('/presenter')
    await expect(presenter.getByRole('status')).toContainText('Linked to the main window')
    expect(await seriousViolations(presenter)).toEqual([])
  })
})

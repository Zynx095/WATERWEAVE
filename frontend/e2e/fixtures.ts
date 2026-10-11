import { expect, test as base, type Page } from '@playwright/test'

/**
 * Every test records console errors, uncaught page errors and failed
 * requests; `expectClean` fails the test if any appeared that the test did
 * not provoke on purpose.
 */
export const test = base.extend<{ problems: string[] }>({
  problems: async ({ page }, use) => {
    const problems: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') problems.push(`console: ${msg.text()}`)
    })
    page.on('pageerror', (error) => problems.push(`page error: ${error.message}`))
    page.on('requestfailed', (request) => {
      const reason = request.failure()?.errorText ?? ''
      // Requests the app cancels on purpose (navigation, superseded runs) are not failures.
      if (!reason.includes('ERR_ABORTED')) problems.push(`request failed: ${request.url()} ${reason}`)
    })
    await use(problems)
  },
})

export { expect }

export function expectClean(problems: string[], allowed: RegExp[] = []) {
  const unexpected = problems.filter((p) => !allowed.some((re) => re.test(p)))
  expect(unexpected, unexpected.join('\n')).toEqual([])
}

export async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, 'page should not scroll sideways').toBeLessThanOrEqual(0)
}

export const bar = (page: Page) => page.getByRole('region', { name: 'Presentation controls' })

/** Opens the preflight, waits for its checks and starts with the live engine. Pace 0.2 is "Quick check". */
export async function startLivePresentation(page: Page, pace = '0.2') {
  await page.getByRole('button', { name: 'Present', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Before you present' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('combobox', { name: 'Pace' }).selectOption(pace)
  const start = dialog.getByRole('button', { name: 'Start with the live engine' })
  await expect(start).toBeEnabled({ timeout: 60_000 })
  await start.click()
  await expect(bar(page)).toBeVisible()
}

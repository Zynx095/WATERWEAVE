import { bar, expect, expectClean, startLivePresentation, test } from './fixtures'

const TITLES = [
  'The problem',
  'The scenario',
  'The rules',
  'Classical solvers',
  'Quantum optimisation',
  'Results and fairness',
  'Data integrity',
  'Honest comparison',
  'Conclusion',
]

const where = (page: import('@playwright/test').Page) => bar(page).locator('.present-bar__where')

test.describe('guided presentation', () => {
  test('plays every step on its own with real results, then finishes', async ({ page, problems }) => {
    await page.goto('/')
    await startLivePresentation(page, '0.2')
    for (const [i, title] of TITLES.entries()) {
      await expect(where(page)).toHaveText(`Step ${i + 1} of 9 ${title}`, { timeout: 30_000 })
      await expect(bar(page).getByRole('alert')).toHaveCount(0)
      if (title === 'Classical solvers') {
        await expect(bar(page)).toContainText(/Exact search checked all 128 plans in .*: best score 6/)
      }
      if (title === 'Quantum optimisation') {
        await expect(page.getByRole('article', { name: 'QAOA' })).toBeVisible()
        await expect(bar(page)).toContainText(/QAOA simulated a 12-qubit circuit and scored/)
      }
      if (title === 'Data integrity') await expect(page).toHaveURL(/\/data$/)
      if (title === 'Honest comparison') {
        await expect(bar(page)).toContainText(/random sampling with the same budget: 15 of 15/i)
      }
    }
    await expect(bar(page)).toContainText('End of the guided presentation', { timeout: 30_000 })
    await expect(bar(page).getByRole('button', { name: 'Restart', exact: true })).toBeVisible()
    expectClean(problems)
  })

  test('pause stops progression, resume continues, and the presenter can step and restart', async ({ page, problems }) => {
    await page.goto('/')
    await startLivePresentation(page, '0.2')
    await expect(where(page)).toHaveText('Step 2 of 9 The scenario', { timeout: 15_000 })

    await bar(page).getByRole('button', { name: 'Pause' }).click()
    await expect(bar(page)).toContainText('Paused')
    await page.waitForTimeout(8000) // longer than a step at this pace
    await expect(where(page)).toHaveText('Step 2 of 9 The scenario')

    await bar(page).getByRole('button', { name: 'Resume' }).click()
    await expect(bar(page)).toContainText('Playing')
    await expect(where(page)).toHaveText('Step 3 of 9 The rules', { timeout: 15_000 })

    await bar(page).getByRole('button', { name: 'Pause' }).click()
    await bar(page).getByRole('button', { name: 'Next step' }).click()
    await expect(where(page)).toHaveText('Step 4 of 9 Classical solvers')
    await expect(page.getByRole('article', { name: 'Exact search' })).toBeVisible()
    await page.keyboard.press('ArrowLeft')
    await expect(where(page)).toHaveText('Step 3 of 9 The rules')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await expect(where(page)).toHaveText('Step 5 of 9 Quantum optimisation')

    await bar(page).getByRole('button', { name: 'Restart from the beginning' }).click()
    await expect(where(page)).toHaveText('Step 1 of 9 The problem')
    await expect(page).toHaveURL(/\/$/)
    await expect(bar(page)).toContainText('Playing')
    expectClean(problems)
  })

  test('exit restores normal use of the app', async ({ page, problems }) => {
    await page.goto('/')
    await startLivePresentation(page, '1')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('article', { name: 'Exact search' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(bar(page)).toHaveCount(0)
    await expect(page.locator('[data-spotlight]')).toHaveCount(0)
    const present = page.getByRole('button', { name: 'Present', exact: true })
    await expect(present).toBeEnabled()

    // The app works normally afterwards.
    await page.getByRole('checkbox', { name: 'Include QAOA in the run' }).check()
    await page.getByRole('button', { name: 'Run greedy, exact and QAOA' }).click()
    await expect(page.getByRole('article', { name: 'QAOA' })).toBeVisible()
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Classical vs quantum' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Does the quantum solver help?' })).toBeVisible()
    expectClean(problems)
  })

  test('a failing solver step pauses with the reason and Retry recovers', async ({ page, problems }) => {
    await page.goto('/')
    await startLivePresentation(page, '1')
    let fail = true
    await page.route('**/api/solve', (route) =>
      fail
        ? route.fulfill({ status: 503, json: { detail: 'Another solver run is still in progress. Try again in a moment.' } })
        : route.continue(),
    )
    await bar(page).getByRole('button', { name: 'Go to step 4: Classical solvers' }).click()
    await expect(bar(page).getByRole('alert')).toContainText('Another solver run is still in progress')
    await expect(bar(page)).toContainText('Paused')
    fail = false
    await bar(page).getByRole('button', { name: 'Retry' }).click()
    await expect(bar(page).getByRole('alert')).toHaveCount(0)
    await expect(page.getByRole('article', { name: 'Exact search' })).toBeVisible()
    expectClean(problems, [/status of 503/])
  })

  test('the presenter view in a second window follows and controls the show', async ({ page, context, problems }) => {
    await page.goto('/')
    await startLivePresentation(page, '1')
    const presenter = await context.newPage()
    await presenter.goto('/presenter')
    await expect(presenter.getByRole('status')).toContainText('Linked to the main window')
    await expect(presenter.getByRole('heading', { level: 2, name: 'The problem' })).toBeVisible()
    await presenter.getByRole('button', { name: /^Next/ }).click()
    await expect(where(page)).toHaveText('Step 2 of 9 The scenario')
    await expect(presenter.getByRole('heading', { level: 2, name: 'The scenario' })).toBeVisible()
    await presenter.getByRole('button', { name: 'Pause' }).click()
    await expect(bar(page)).toContainText('Paused')
    await presenter.getByRole('button', { name: '4. Classical solvers' }).click()
    await expect(page.getByRole('article', { name: 'Exact search' })).toBeVisible()
    await presenter.getByRole('button', { name: 'Exit presentation' }).click()
    await expect(bar(page)).toHaveCount(0)
    expectClean(problems)
  })

  test('without the API the walkthrough runs on the labelled recorded run', async ({ page, problems }) => {
    await page.route('**/api/**', (route) => route.abort('connectionrefused'))
    await page.goto('/')
    await page.getByRole('button', { name: 'Present', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Before you present' })
    await expect(dialog.getByText('API reachable').locator('..')).toContainText('Failed')
    await expect(dialog.getByRole('button', { name: 'Start with the live engine' })).toBeDisabled()
    await dialog.getByRole('button', { name: 'Start with the recorded run' }).click()
    await expect(page.getByText(/Nothing is being executed now/)).toBeVisible()
    await bar(page).getByRole('button', { name: 'Go to step 5: Quantum optimisation' }).click()
    const qaoa = page.getByRole('article', { name: 'QAOA' })
    await expect(qaoa).toContainText('Recorded run')
    await expect(qaoa).toContainText('12 simulated qubits')
    await bar(page).getByRole('button', { name: 'Go to step 7: Data integrity' }).click()
    await expect(page.getByRole('row', { name: /Rainfall, Bengaluru/ })).toContainText('Not fetched')
    await expect(bar(page).getByRole('alert')).toHaveCount(0)
    expectClean(problems, [/request failed: .*\/api\//, /Failed to load resource/])
  })
})

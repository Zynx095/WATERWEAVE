import { bar, expect, expectClean, noHorizontalOverflow, test } from './fixtures'

test.describe('application', () => {
  test('overview explains the problem with numbers from the engine', async ({ page, problems }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Seven deliveries requested. Water for four.')
    await expect(page.getByRole('table', { name: 'Requests for one day' })).toBeVisible()
    await expect(page.getByText('Engine connected')).toBeVisible()
    for (const q of ['What is WATERWEAVE?', 'How does it decide?', 'Which data is real?', 'Does the quantum approach win?']) {
      await expect(page.getByText(q)).toBeVisible()
    }
    await expect(page.getByText(/QAOA found an equally good plan in 14 of 15 runs/)).toBeVisible()
    expectClean(problems)
  })

  test('workspace edits the scenario and runs the real solvers', async ({ page, problems }) => {
    await page.goto('/')
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Workspace' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Workspace' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Start from' })).toHaveValue('default')
    await expect(page.getByText(/needs 12 qubits/)).toBeVisible()

    await page.getByRole('button', { name: 'Run greedy, exact and QAOA' }).click()
    const exact = page.getByRole('article', { name: 'Exact search' })
    await expect(exact).toContainText('Best possible score for this scoring')
    await expect(exact.locator('.solver__score dd')).toHaveText('6')
    const qaoa = page.getByRole('article', { name: 'QAOA' })
    await expect(qaoa).toContainText('12 simulated qubits, circuit depth 17')
    await expect(qaoa).toContainText(/of them followed the rules/)
    await expect(page.getByRole('table', { name: /Share of each neighborhood/ })).toBeVisible()

    // Configure: add a request for Market in the evening and run greedy and exact only.
    await page.getByRole('button', { name: 'Market evening request' }).click()
    await expect(page.getByText(/changed after this run/)).toBeVisible()
    await expect(page.getByText(/needs \d+ qubits/)).toBeVisible()
    await page.getByRole('checkbox', { name: 'Include QAOA in the run' }).uncheck()
    await page.getByRole('button', { name: 'Run greedy and exact' }).click()
    await expect(exact.locator('dd').filter({ hasText: /of 8$/ })).toBeVisible()
    await expect(page.getByText('QAOA was not included in this run.')).toBeVisible()
    await expect(page.getByText(/changed after this run/)).toHaveCount(0)

    await page.getByRole('button', { name: 'Reset to Default scarcity' }).click()
    await expect(page.getByRole('button', { name: 'Market evening request' })).toHaveAttribute('aria-pressed', 'false')
    expectClean(problems)
  })

  test('typed input is validated before it reaches the engine', async ({ page, problems }) => {
    await page.goto('/workspace')
    const weight = page.getByRole('textbox', { name: 'Hillview priority weight' })
    await weight.fill('99')
    await weight.press('Enter')
    await expect(page.getByRole('alert').filter({ hasText: 'Use a value from 0.5 to 10.' })).toBeVisible()
    await weight.fill('2.5')
    await weight.press('Enter')
    await expect(weight).toHaveValue('2.5')
    await expect(page.getByText('Edited')).toBeVisible()
    expectClean(problems)
  })

  test('comparison runs all three solvers on one scenario and shows the recorded benchmark', async ({ page, problems }) => {
    await page.goto('/compare')
    await page.getByRole('button', { name: 'Run greedy, exact and QAOA' }).click()
    const live = page.getByRole('table', { name: 'Solver results on the same scenario and objective' })
    await expect(live.getByRole('row', { name: /Exact search/ })).toContainText('Optimal')
    await expect(live.getByRole('row', { name: /Deliver nothing/ })).toContainText('Fairness score 1')
    const bench = page.getByRole('table', { name: /Recorded benchmark/ })
    await expect(bench.getByRole('row', { name: /Random sampling/ })).toContainText('15 of 15 runs')
    await expect(page.getByRole('region', { name: 'What this shows, and what it does not' })).toContainText(
      'at least as often as QAOA',
    )
    expectClean(problems)
  })

  test('data sources label each input; offline view skips the network', async ({ page, problems }) => {
    await page.goto('/data')
    const ledger = page.getByRole('table', { name: /Data inputs/ })
    await expect(ledger.getByRole('row', { name: /Rainfall, Bengaluru/ })).toContainText('Not fetched')
    await expect(ledger.getByText('Illustrative', { exact: true })).toHaveCount(4)
    await expect(ledger.getByRole('row', { name: /Reservoir levels/ })).toContainText('No public source')
    await expect(page.getByText(/rainfall-to-supply heuristic is off/)).toBeVisible()
    expectClean(problems)
  })

  test('a failed live weather fetch is reported, and nothing else breaks', async ({ page, problems }) => {
    await page.route('**/api/data-sources?live=true*', async (route) => {
      const response = await route.fetch({ url: route.request().url().replace('live=true', 'live=false') })
      const body = await response.json()
      body.requested_live = true
      body.skipped = []
      body.observations.unshift({
        provider: { id: 'open_meteo', name: 'Open-Meteo Weather API', organization: 'Open-Meteo', url: 'https://open-meteo.com/' },
        dataset_id: 'current_weather',
        geographic_level: 'city',
        geographic_id: 'bengaluru',
        variable: 'rainfall_mm',
        value: null,
        unit: 'mm',
        source_timestamp: null,
        retrieval_timestamp: new Date().toISOString(),
        source_age_seconds: null,
        retrieval_age_seconds: 0,
        served_from_cache: false,
        quality: { status: 'ERROR', missing: true, error_details: 'Network error: simulated outage' },
      })
      await route.fulfill({ response, json: body })
    })
    await page.goto('/data')
    await page.getByRole('button', { name: 'Fetch live weather' }).click()
    await expect(page.getByRole('alert')).toContainText('Open-Meteo could not be reached: Network error: simulated outage')
    await expect(page.getByRole('row', { name: /Rainfall, Bengaluru/ })).toContainText('Unavailable')

    // The API itself failing is explained too.
    await page.route('**/api/data-sources?live=false*', (route) => route.fulfill({ status: 500, body: 'boom' }))
    await page.getByRole('button', { name: 'Show without the network' }).click()
    await expect(page.getByText(/The API answered with HTTP 500/)).toBeVisible()

    // Solvers still work.
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Workspace' }).click()
    await page.getByRole('button', { name: 'Run greedy, exact and QAOA' }).click()
    await expect(page.getByRole('article', { name: 'Exact search' })).toContainText('Best possible score')
    expectClean(problems, [/status of 500/])
  })

  test('quantum lab draws the circuit the solver ran', async ({ page, problems }) => {
    await page.goto('/lab')
    await expect(page.getByRole('img', { name: /QUBO coefficients for 12 binary variables/ })).toBeVisible()
    await expect(page.getByText(/scores that plan 29/)).toBeVisible()
    await page.getByRole('button', { name: 'Run QAOA on this scenario' }).click()
    await expect(page.getByRole('img', { name: /QAOA circuit on 12 qubits, depth 17, 1 layer\(s\): 39 RZZ/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Chosen sample' })).toBeVisible()
    expectClean(problems)
  })

  test('keyboard users can skip to content and reach every page', async ({ page, problems }) => {
    await page.goto('/')
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to content' })
    await expect(skip).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('#main')).toBeFocused()
    const nav = page.getByRole('navigation', { name: 'Main' })
    await nav.getByRole('link', { name: 'Quantum lab' }).focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/lab$/)
    await expect(page).toHaveTitle('Quantum lab | WATERWEAVE')
    expectClean(problems)
  })

  test('the API being down is explained and the recorded run takes over', async ({ page, problems }) => {
    await page.route('**/api/**', (route) => route.abort('connectionrefused'))
    await page.goto('/workspace')
    await expect(page.getByRole('alert')).toContainText('python -m waterweave.api')
    await page.getByRole('button', { name: 'Show recorded run' }).click()
    await expect(page.getByText(/Nothing is being executed now/)).toBeVisible()
    await page.getByRole('button', { name: 'Run greedy, exact and QAOA' }).click()
    await expect(page.getByRole('article', { name: 'Exact search' })).toContainText('Recorded run')
    expectClean(problems, [/request failed: .*\/api\//, /Failed to load resource/])
  })
})

const VIEWPORTS = [
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'phone', width: 390, height: 844 },
]

for (const vp of VIEWPORTS) {
  test(`layout holds at ${vp.name} size (${vp.width}x${vp.height})`, async ({ page, problems }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    for (const path of ['/', '/workspace', '/compare', '/data', '/lab']) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await noHorizontalOverflow(page)
    }
    await page.goto('/workspace')
    const run = page.getByRole('button', { name: 'Run greedy, exact and QAOA' })
    await run.scrollIntoViewIfNeeded()
    await expect(run).toBeEnabled()
    await run.click()
    await expect(page.getByRole('article', { name: 'QAOA' })).toBeVisible()
    await noHorizontalOverflow(page)
    if (vp.width < 1100) {
      const menu = page.getByRole('button', { name: 'Menu' })
      await menu.click()
      await expect(menu).toHaveAttribute('aria-expanded', 'true')
      await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Data sources' }).click()
      await expect(page).toHaveURL(/\/data$/)
    }
    // The presentation controls fit as well.
    await page.goto('/')
    await page.getByRole('button', { name: 'Present', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Before you present' })
    await expect(dialog.getByRole('button', { name: 'Start with the live engine' })).toBeEnabled({ timeout: 60_000 })
    await dialog.getByRole('button', { name: 'Start with the live engine' }).click()
    await expect(bar(page).getByRole('button', { name: 'Pause' })).toBeVisible()
    await expect(bar(page).getByRole('button', { name: 'Exit presentation' })).toBeVisible()
    await noHorizontalOverflow(page)
    await bar(page).getByRole('button', { name: 'Exit presentation' }).click()
    expectClean(problems)
  })
}

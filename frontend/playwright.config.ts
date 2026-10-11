import { defineConfig, devices } from '@playwright/test'

/*
 * End-to-end tests against the real API and the built frontend, served by one
 * process exactly as on stage: `python -m waterweave.api`.
 *
 *   npm run e2e
 *
 * WATERWEAVE_PYTHON  Python interpreter with the project installed (default: python).
 * PLAYWRIGHT_CHANNEL Browser channel, e.g. msedge or chrome, to use an installed
 *                    browser instead of Playwright's download.
 * E2E_PORT           Port for the test server (default 8799).
 */
const PORT = Number(process.env.E2E_PORT ?? 8799)
const PYTHON = process.env.WATERWEAVE_PYTHON ?? 'python'
const channel = process.env.PLAYWRIGHT_CHANNEL

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, ...(channel ? { channel } : {}) },
    },
  ],
  webServer: {
    command: `"${PYTHON}" -m waterweave.api --port ${PORT}`,
    cwd: '..',
    env: { PYTHONPATH: 'src' },
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})

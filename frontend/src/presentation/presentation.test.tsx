import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../App'
import { json, mockApi, renderWithStore } from '../test/utils'
import { STEPS } from './steps'

const bar = () => screen.getByRole('region', { name: 'Presentation controls' })
const where = () => bar().querySelector('.present-bar__where')!.textContent

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

async function startPresentation() {
  renderWithStore(<AppRoutes />, '/')
  await flush()
  fireEvent.click(screen.getByRole('button', { name: 'Start the guided presentation' }))
  await flush()
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('guided presentation', () => {
  it('starts on the problem with a caption built from the scenario', async () => {
    mockApi()
    await startPresentation()
    expect(where()).toBe(`Step 1 of ${STEPS.length} The problem`)
    expect(bar()).toHaveTextContent(/0:2\d left, 3:5\d total/)
    expect(bar()).toHaveTextContent('Seven deliveries are requested, but there is water for four. Who gets it?')
    expect(document.body.dataset.presenting).toBe('true')
    expect(document.querySelector('[data-spotlight="true"]')?.getAttribute('data-present-id')).toBe('problem')
  })

  it('advances on its own, pauses at once and resumes where it stopped', async () => {
    mockApi()
    await startPresentation()
    await flush(STEPS[0].durationMs + 300)
    expect(where()).toContain('The scenario')
    expect(screen.getByRole('heading', { level: 1, name: 'Workspace' })).toBeInTheDocument()

    await flush(5000)
    fireEvent.click(within(bar()).getByRole('button', { name: 'Pause' }))
    expect(bar()).toHaveTextContent('Paused')
    await flush(120_000)
    expect(where()).toContain('The scenario')

    fireEvent.click(within(bar()).getByRole('button', { name: 'Resume' }))
    await flush(STEPS[1].durationMs - 5000 - 400)
    expect(where()).toContain('The scenario')
    await flush(800)
    expect(where()).toContain('The rules')
  })

  it('moves with buttons and keys, restarts and exits back to normal navigation', async () => {
    mockApi()
    await startPresentation()
    fireEvent.click(within(bar()).getByRole('button', { name: 'Next step' }))
    await flush()
    expect(where()).toContain('The scenario')
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    await flush()
    expect(where()).toContain('The rules')
    fireEvent.keyDown(window, { key: 'PageUp' })
    await flush()
    expect(where()).toContain('The scenario')
    fireEvent.keyDown(window, { key: ' ' })
    expect(bar()).toHaveTextContent('Paused')
    fireEvent.keyDown(window, { key: 'Home' })
    await flush()
    expect(where()).toContain('The problem')
    expect(bar()).toHaveTextContent('Playing')

    fireEvent.keyDown(window, { key: 'Escape' })
    await flush()
    expect(screen.queryByRole('region', { name: 'Presentation controls' })).not.toBeInTheDocument()
    expect(document.body.dataset.presenting).toBeUndefined()
    expect(document.querySelector('[data-spotlight]')).toBeNull()
    fireEvent.click(screen.getByRole('link', { name: 'Data sources' }))
    await flush()
    expect(screen.getByRole('heading', { level: 1, name: 'Where the numbers come from' })).toBeInTheDocument()
  })

  it('runs the real solvers on the classical step and holds the clock until they answer', async () => {
    let answer: (r: Response) => void = () => {}
    const fetchMock = mockApi({
      '/api/solve': () => new Promise<Response>((resolve) => (answer = resolve)),
    })
    await startPresentation()
    fireEvent.click(within(bar()).getByRole('button', { name: 'Go to step 4: Classical solvers' }))
    await flush()
    expect(bar()).toHaveTextContent('Waiting for the engine')
    expect(bar()).toHaveTextContent('Running greedy and exact search on the engine.')
    const call = fetchMock.mock.calls.find(([url]) => String(url) === '/api/solve')!
    expect(JSON.parse(String((call[1] as RequestInit).body)).settings.include_qaoa).toBe(false)

    await flush(90_000 - 1000) // longer than the step, shorter than the request timeout
    expect(where()).toContain('Classical solvers')

    const { fixtures } = await import('../test/utils')
    answer(json(fixtures.solve_classical))
    await flush()
    expect(bar()).toHaveTextContent(/Exact search checked all 128 plans in .*: best score 6\. Greedy scored 7\./)
    expect(screen.getByRole('article', { name: 'Exact search' })).toBeInTheDocument()
    await flush(STEPS[3].durationMs + 400)
    expect(where()).toContain('Quantum optimisation')
  })

  it('pauses on a failed step with the reason, and Retry runs it again', async () => {
    let calls = 0
    mockApi({
      '/api/solve': () => {
        calls++
        return json({ detail: 'Another solver run is still in progress.' }, 503)
      },
    })
    await startPresentation()
    fireEvent.click(within(bar()).getByRole('button', { name: 'Go to step 4: Classical solvers' }))
    await flush()
    expect(within(bar()).getByRole('alert')).toHaveTextContent('Another solver run is still in progress.')
    expect(bar()).toHaveTextContent('Paused')
    fireEvent.click(within(bar()).getByRole('button', { name: 'Retry' }))
    await flush()
    expect(calls).toBe(2)
    fireEvent.click(within(bar()).getByRole('button', { name: 'Next step' }))
    await flush()
    expect(where()).toContain('Quantum optimisation')
  })

  it('shows presenter notes on demand', async () => {
    mockApi()
    await startPresentation()
    fireEvent.click(within(bar()).getByRole('button', { name: 'Presenter notes' }))
    expect(screen.getByRole('heading', { name: 'Presenter notes' })).toBeInTheDocument()
    expect(bar()).toHaveTextContent('Today: 7 requests and 4 units of water, so 3 requests cannot be met.')
    expect(bar()).toHaveTextContent('Next: The scenario')
    fireEvent.keyDown(window, { key: 'n' })
    expect(screen.queryByRole('heading', { name: 'Presenter notes' })).not.toBeInTheDocument()
  })

  it('goes to the step page again after the presenter wanders off', async () => {
    mockApi()
    await startPresentation()
    fireEvent.click(screen.getByRole('link', { name: 'Quantum lab' }))
    await flush()
    expect(screen.getByRole('heading', { level: 1, name: 'Quantum lab' })).toBeInTheDocument()
    expect(bar()).toBeInTheDocument()
    fireEvent.click(within(bar()).getByRole('button', { name: 'Next step' }))
    await flush()
    expect(screen.getByRole('heading', { level: 1, name: 'Workspace' })).toBeInTheDocument()
  })

  it('finishes after the last step and offers a restart', async () => {
    mockApi()
    await startPresentation()
    fireEvent.click(within(bar()).getByRole('button', { name: `Go to step ${STEPS.length}: Conclusion` }))
    await flush()
    fireEvent.click(within(bar()).getByRole('button', { name: 'Next step' }))
    await flush()
    expect(bar()).toHaveTextContent('End of the guided presentation')
    expect(within(bar()).getByRole('button', { name: 'Next step' })).toBeDisabled()
    fireEvent.click(within(bar()).getByRole('button', { name: /^Restart$/ }))
    await flush()
    expect(where()).toContain('The problem')
  })

  it('leaves no timers running when the app unmounts mid-presentation', async () => {
    mockApi()
    renderWithStore(<AppRoutes />, '/')
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'Start the guided presentation' }))
    await flush()
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    const { cleanup } = await import('@testing-library/react')
    cleanup()
    await flush()
    expect(vi.getTimerCount()).toBe(0)
  })
})

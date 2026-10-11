import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SolveResponse } from '../api/types'
import { useStore } from '../state/store'
import { fixtures, json, mockApi, offlineApi, renderWithStore } from '../test/utils'
import { WorkspacePage } from './WorkspacePage'

afterEach(() => vi.unstubAllGlobals())

const quantum = fixtures.solve_quantum as unknown as SolveResponse

function withQaoa(change: Partial<SolveResponse['results'][number]>): SolveResponse {
  return {
    ...quantum,
    results: quantum.results.map((r) => (r.key === 'qaoa' ? { ...r, ...change } : r)),
  }
}

async function runSolvers(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('button', { name: 'Hillview morning request' })
  await user.click(screen.getByRole('button', { name: 'Run greedy, exact and QAOA' }))
}

describe('WorkspacePage', () => {
  it('loads the default scenario and states its rules', async () => {
    mockApi()
    renderWithStore(<WorkspacePage />)
    expect(await screen.findByRole('combobox', { name: 'Start from' })).toHaveValue('default')
    const rules = screen.getByRole('complementary', { name: 'Rules every plan must follow' })
    expect(rules).toHaveTextContent('Morning: 4 requested, 2 available.')
    expect(rules).toHaveTextContent('Riverside asked for 2 but can store only 1.')
    expect(rules).toHaveTextContent('7 decisions, 128 possible plans')
    expect(await screen.findByText(/needs/)).toHaveTextContent('12 qubits')
  })

  it('runs the real solvers and shows each plan with its score', async () => {
    const fetchMock = mockApi()
    const user = userEvent.setup()
    renderWithStore(<WorkspacePage />)
    await runSolvers(user)

    const exact = await screen.findByRole('article', { name: 'Exact search' })
    expect(within(exact).getByText('Score (lower is better)').nextSibling).toHaveTextContent('6')
    expect(within(exact).getByText(/Best possible score/)).toBeInTheDocument()
    const greedy = screen.getByRole('article', { name: 'Greedy' })
    expect(greedy.querySelector('.gap')).toHaveTextContent('1 worse than exact search.')
    const qaoa = screen.getByRole('article', { name: 'QAOA' })
    expect(within(qaoa).getByText('Same score as exact search.')).toBeInTheDocument()
    expect(within(qaoa).getByText(/12/, { selector: '.num' })).toBeInTheDocument()

    const solveCall = fetchMock.mock.calls.find(([url]) => String(url) === '/api/solve')!
    const body = JSON.parse(String((solveCall[1] as RequestInit).body))
    expect(body.settings).toMatchObject({ include_qaoa: true, fairness_weight: 2, p: 1, shots: 1024, seed: 42 })
    expect(body.scenario.name).toBe('synthetic-4x2')

    const chart = screen.getByRole('table', { name: /Share of each neighborhood/ })
    expect(within(chart).getByRole('rowheader', { name: /Market/ }).closest('tr')).toHaveTextContent('0%')
    const note = document.querySelector('.service__reference') as HTMLElement
    expect(note).toHaveTextContent('worse than every plan above')
    // The note must not scroll sideways with the table on a phone.
    expect(screen.getByRole('region', { name: 'Share of requests met' })).not.toContainElement(note)
  })

  it('reports a failed QAOA run without substituting another result', async () => {
    mockApi({
      '/api/solve': () =>
        json(
          withQaoa({
            status: 'error',
            error: 'RuntimeError: simulator crashed',
            allocation: null,
            objective_value: null,
            metrics: null,
            feasible: false,
            circuit: null,
            samples: null,
          }),
        ),
    })
    const user = userEvent.setup()
    renderWithStore(<WorkspacePage />)
    await runSolvers(user)
    const qaoa = await screen.findByRole('article', { name: 'QAOA' })
    expect(within(qaoa).getByRole('alert')).toHaveTextContent('QAOA failed. RuntimeError: simulator crashed')
    expect(within(qaoa).queryByRole('table')).not.toBeInTheDocument()
    expect(within(qaoa).queryByText('Score (lower is better)')).not.toBeInTheDocument()
    // The chart only includes solvers that produced a plan.
    expect(screen.getByRole('table', { name: /Share of each/ })).not.toHaveTextContent('QAOA')
  })

  it('says when there was nothing to decide', async () => {
    const empty = {
      ...quantum,
      scenario: {
        ...quantum.scenario,
        neighborhoods: quantum.scenario.neighborhoods.map((n) => ({ ...n, demand_by_slot: { morning: 0, evening: 0 } })),
      },
      results: quantum.results.map((r) =>
        r.key === 'qaoa'
          ? { ...r, objective_value: 0, metadata: { solver_type: 'quantum_approximate', num_qubits: 0, layers_p: 1, shots: 1024 }, circuit: null, samples: null }
          : r,
      ),
    }
    mockApi({ '/api/solve': () => json(empty) })
    const user = userEvent.setup()
    renderWithStore(<WorkspacePage />)
    await runSolvers(user)
    const qaoa = await screen.findByRole('article', { name: 'QAOA' })
    expect(qaoa).toHaveTextContent('Nothing was requested, so the circuit had nothing to decide.')
    expect(qaoa).not.toHaveTextContent('simulated qubits')
  })

  it('explains a skipped QAOA run', async () => {
    mockApi({
      '/api/solve': () =>
        json(
          withQaoa({
            status: 'skipped',
            error: 'Not run: this scenario needs 18 qubits (8 decisions + 10 slack).',
            allocation: null,
            objective_value: null,
            metrics: null,
          }),
        ),
    })
    const user = userEvent.setup()
    renderWithStore(<WorkspacePage />)
    await runSolvers(user)
    const qaoa = await screen.findByRole('article', { name: 'QAOA' })
    expect(within(qaoa).getByRole('status')).toHaveTextContent('needs 18 qubits')
  })

  it('shows the API error when a run is rejected', async () => {
    mockApi({ '/api/solve': () => json({ detail: 'Another solver run is still in progress.' }, 503) })
    const user = userEvent.setup()
    renderWithStore(<WorkspacePage />)
    await runSolvers(user)
    expect(await screen.findByText('Another solver run is still in progress.')).toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('marks results as out of date after the scenario changes', async () => {
    mockApi()
    const user = userEvent.setup()
    renderWithStore(<WorkspacePage />)
    await runSolvers(user)
    await screen.findByRole('article', { name: 'Exact search' })
    expect(screen.queryByText(/changed after this run/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Market evening request' }))
    expect(screen.getByText(/changed after this run/)).toBeInTheDocument()
    expect(screen.getByText('Edited')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reset to Default scarcity' }))
    expect(screen.queryByText(/changed after this run/)).not.toBeInTheDocument()
  })

  it('cancels a run in progress', async () => {
    mockApi({
      '/api/solve': (init) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))),
        ),
    })
    const user = userEvent.setup()
    renderWithStore(<WorkspacePage />)
    await runSolvers(user)
    expect(await screen.findByText(/The quantum simulation takes about a second/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Running' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByText('Not run yet. Results appear below.')).toBeInTheDocument()
  })

  it('serves the recorded run only for the scenario it covers', async () => {
    offlineApi()
    const user = userEvent.setup()
    function SwitchToRecording() {
      const { actions } = useStore()
      return (
        <button type="button" onClick={() => void actions.switchToRecording()}>
          use recording
        </button>
      )
    }
    renderWithStore(
      <>
        <SwitchToRecording />
        <WorkspacePage />
      </>,
    )
    await user.click(screen.getByRole('button', { name: 'use recording' }))
    await runSolvers(user)
    const exact = await screen.findByRole('article', { name: 'Exact search' })
    expect(within(exact).getByText('Recorded run')).toBeInTheDocument()
    expect(screen.getByText(/It was not executed now/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Market evening request' }))
    await user.click(screen.getByRole('button', { name: 'Run greedy, exact and QAOA' }))
    await waitFor(() => expect(screen.getByText(/recorded run only covers the default scenario/)).toBeInTheDocument())
  })
})

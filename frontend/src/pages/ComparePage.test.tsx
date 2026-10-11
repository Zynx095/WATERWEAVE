import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BenchmarkResponse } from '../api/types'
import { fixtures, json, mockApi, renderWithStore } from '../test/utils'
import { ComparePage } from './ComparePage'

afterEach(() => vi.unstubAllGlobals())

const bench = fixtures.benchmark as BenchmarkResponse

describe('ComparePage', () => {
  it('lists the recorded benchmark with the random-sampling control', async () => {
    mockApi()
    renderWithStore(<ComparePage />)
    const table = await screen.findByRole('table', { name: /Recorded benchmark/ })
    const row = (name: string | RegExp) => within(table).getByRole('rowheader', { name }).closest('tr')!
    expect(row('QAOA, 1 layer')).toHaveTextContent('4 of 5 runs')
    expect(row('QAOA, 2 layers')).toHaveTextContent('5 of 5 runs')
    expect(row(/Random sampling/)).toHaveTextContent('15 of 15 runs')
    // 3 optimal plans out of 128: the exact chance for a uniform sample.
    expect(row(/Random sampling/)).toHaveTextContent('2.3%')
    expect(screen.getByText(/6 of 6 independent checks passed/)).toBeInTheDocument()
  })

  it('states only what the numbers support', async () => {
    mockApi()
    renderWithStore(<ComparePage />)
    const honest = await screen.findByRole('region', { name: 'What this shows, and what it does not' })
    expect(honest).toHaveTextContent('QAOA reached the best plan in 14 of 15 recorded runs.')
    expect(honest).toHaveTextContent('found the best plan in 15 of 15 runs, at least as often as QAOA')
    expect(honest).toHaveTextContent('1 of 3 depths beat random guessing (2.3% per sample)')
    expect(honest).toHaveTextContent('A speed-up.')
  })

  it('changes its wording when the control does worse than QAOA', async () => {
    const altered = structuredClone(bench)
    const control = altered.default!.summary.find((r) => r.solver_name.startsWith('Uniform'))!
    control.hit_optimum_rate = 0.2
    mockApi({ '/api/benchmark': () => json(altered) })
    renderWithStore(<ComparePage />)
    const honest = await screen.findByRole('region', { name: 'What this shows, and what it does not' })
    expect(honest).toHaveTextContent('QAOA found the best plan more often than random sampling here')
    expect(honest).not.toHaveTextContent('at least as often as QAOA')
  })

  it('runs the three solvers on the same scenario and compares them', async () => {
    mockApi()
    const user = userEvent.setup()
    renderWithStore(<ComparePage />)
    await user.click(await screen.findByRole('button', { name: 'Run greedy, exact and QAOA' }))
    const table = await screen.findByRole('table', { name: 'Solver results on the same scenario and objective' })
    const row = (name: string) => within(table).getByRole('rowheader', { name }).closest('tr')!
    expect(row('Exact search')).toHaveTextContent('Optimal')
    expect(row('Greedy')).toHaveTextContent('+1')
    expect(row('QAOA')).toHaveTextContent('Same')
    expect(row('Deliver nothing')).toHaveTextContent('Fairness score 1')
    expect(document.querySelector('.callout')).toHaveTextContent(/about \d+ times as long as checking every plan/)
    expect(document.querySelector('.callout')).toHaveTextContent('says nothing about how fast quantum hardware would be')
  })
})

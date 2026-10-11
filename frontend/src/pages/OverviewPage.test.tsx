import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BenchmarkResponse, ScenarioSpec } from '../api/types'
import { benchmarkFacts } from '../lib/benchmark'
import { numberWord, scenarioFacts } from '../lib/scenario'
import { fixtures, mockApi, offlineApi, renderWithStore } from '../test/utils'
import { OverviewPage } from './OverviewPage'

afterEach(() => vi.unstubAllGlobals())

const scenario = (fixtures.solve_quantum as unknown as { scenario: ScenarioSpec }).scenario

describe('scenario and benchmark facts', () => {
  it('counts requests, supply, plans and binding limits of the default scenario', () => {
    const facts = scenarioFacts(scenario)
    expect(facts.requests).toBe(7)
    expect(facts.supply).toBe(4)
    expect(facts.plans).toBe(128)
    expect(facts.storageLimited).toEqual([{ id: 'N2', name: 'Riverside', requested: 2, storage: 1 }])
    expect(facts.scarceSlots.map((s) => s.slot)).toEqual(['morning', 'evening'])
  })

  it('reads hit counts off the recorded benchmark summary', () => {
    const facts = benchmarkFacts((fixtures.benchmark as BenchmarkResponse).default!)
    expect(facts.qaoaRuns).toBe(15)
    expect(facts.qaoaHits).toBe(14)
    expect(facts.controlHits).toBe(15)
    expect(facts.controlRuns).toBe(15)
    expect(facts.pValues).toEqual([1, 2, 3])
  })

  it('spells small numbers out', () => {
    expect(numberWord(7, true)).toBe('Seven')
    expect(numberWord(4)).toBe('four')
    expect(numberWord(40)).toBe('40')
  })
})

describe('OverviewPage', () => {
  it('states the problem with the scenario numbers and shows the requests', async () => {
    mockApi()
    renderWithStore(<OverviewPage />)
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Seven deliveries requested. Water for four.' }),
    ).toBeInTheDocument()
    const weave = screen.getByRole('table', { name: 'Requests for one day' })
    expect(within(weave).getAllByText('Requested').length).toBeGreaterThan(0)
    expect(screen.getByText('Synthetic')).toBeInTheDocument()
  })

  it('answers the key questions, with benchmark counts taken from the recorded results', async () => {
    mockApi()
    renderWithStore(<OverviewPage />)
    for (const q of [
      'What is WATERWEAVE?',
      'What problem does it solve?',
      'Why is that hard?',
      'How does it decide?',
      'What does quantum computing do here?',
      'How is fairness measured?',
      'Which data is real?',
      'Does the quantum approach win?',
    ]) {
      expect(screen.getByText(q)).toBeInTheDocument()
    }
    expect(await screen.findByText(/14 of 15 runs/)).toBeInTheDocument()
    expect(screen.getByText(/did so in 15 of/)).toBeInTheDocument()
    expect(screen.getByText(/128 possible plans/)).toBeInTheDocument()
  })

  it('still explains the project when the API is down', async () => {
    offlineApi()
    renderWithStore(<OverviewPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Who gets water when there is not enough?' })).toBeInTheDocument()
    expect(await screen.findByText(/loaded from the API, which is not reachable/)).toBeInTheDocument()
    expect(screen.getByText(/exact classical search is faster and certain/)).toBeInTheDocument()
  })
})

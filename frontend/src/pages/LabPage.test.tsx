import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CircuitInfo, SolveResponse } from '../api/types'
import { layoutCircuit } from '../components/CircuitDiagram'
import { fixtures, json, mockApi, renderWithStore } from '../test/utils'
import { LabPage } from './LabPage'

afterEach(() => vi.unstubAllGlobals())

const quantum = fixtures.solve_quantum as unknown as SolveResponse
const circuit = quantum.results.find((r) => r.key === 'qaoa')!.circuit as CircuitInfo

describe('layoutCircuit', () => {
  it('places every gate in prepare, cost and mixer phases without overlaps', () => {
    const { gates, phases } = layoutCircuit(circuit)
    expect(gates).toHaveLength(circuit.gates.length)
    expect(phases.map((p) => p.label)).toEqual(['Prepare', 'Cost 1', 'Mix 1'])
    expect(phases[1].detail).toBe(`γ = ${Number(circuit.gammas[0].toFixed(3))}`)
    const byColumn = new Map<number, [number, number][]>()
    for (const g of gates) {
      const span: [number, number] = [Math.min(...g.qubits), Math.max(...g.qubits)]
      for (const [lo, hi] of byColumn.get(g.column) ?? []) {
        expect(span[1] < lo || span[0] > hi).toBe(true)
      }
      byColumn.set(g.column, [...(byColumn.get(g.column) ?? []), span])
    }
  })

  it('starts a new layer after each mixer', () => {
    const twoLayers: CircuitInfo = {
      ...circuit,
      layers: 2,
      gammas: [0.1, 0.2],
      betas: [0.3, 0.4],
      gates: [...circuit.gates, ...circuit.gates.filter((g) => g.name !== 'h')],
    }
    expect(layoutCircuit(twoLayers).phases.map((p) => p.label)).toEqual(['Prepare', 'Cost 1', 'Mix 1', 'Cost 2', 'Mix 2'])
  })
})

describe('LabPage', () => {
  it('walks from decisions to spins with values from the engine', async () => {
    mockApi({
      '/api/evaluate': () =>
        json({
          metrics: { ...quantum.reference.deliver_nothing.metrics, storage_violation_units: 1, feasible: 0 },
          objective_value: 29,
          fairness_weight: 2,
          penalty_weight: 15,
        }),
    })
    renderWithStore(<LabPage />)
    const decisions = await screen.findByRole('heading', { name: 'Yes-or-no decisions' })
    const step = decisions.closest('li')!
    expect(step).toHaveTextContent('7 questions, so 128 possible plans')
    expect(step).toHaveTextContent('Hillview morning')
    expect(await screen.findByText(/scores that plan/)).toHaveTextContent('Giving Riverside both deliveries')
    expect(screen.getByText(/scores that plan/)).toHaveTextContent('29')
    expect(screen.getByRole('img', { name: /QUBO coefficients for 12 binary variables/ })).toBeInTheDocument()
    expect(screen.getByText(/Largest field/)).toHaveTextContent('Largest field |h| = 22, largest coupling |J| = 8.25')
  })

  it('draws the circuit QAOA actually ran and decodes its samples', async () => {
    mockApi()
    const user = userEvent.setup()
    renderWithStore(<LabPage />)
    await user.click(await screen.findByRole('button', { name: 'Run QAOA on this scenario' }))
    expect(await screen.findByRole('img', { name: /QAOA circuit on 12 qubits, depth 17/ })).toBeInTheDocument()
    const chosen = screen.getByRole('heading', { name: 'Chosen sample' }).parentElement!
    const md = quantum.results.find((r) => r.key === 'qaoa')!.metadata
    expect(chosen).toHaveTextContent(String(md.best_bitstring))
    expect(chosen).toHaveTextContent('with qubit 0 on the right')
    const items = within(chosen).getAllByRole('listitem')
    expect(items).toHaveLength(12)
    // Shown in qubit order: Qiskit's string read from right to left.
    const shown = items.map((li) => li.querySelector('.bits__value')!.textContent).join('')
    expect(shown).toBe([...String(md.best_bitstring)].reverse().join(''))
    expect(items[0]).toHaveTextContent('Hillview morning')
  })
})

describe('LabPage with an old run', () => {
  it('does not draw a circuit that was run for another scenario', async () => {
    mockApi()
    const user = userEvent.setup()
    const { useStore } = await import('../state/store')
    function Edit() {
      const { actions } = useStore()
      return (
        <button type="button" onClick={() => actions.selectPreset('drought')}>
          choose drought
        </button>
      )
    }
    renderWithStore(
      <>
        <Edit />
        <LabPage />
      </>,
    )
    await user.click(await screen.findByRole('button', { name: 'Run QAOA on this scenario' }))
    expect(await screen.findByRole('img', { name: /QAOA circuit on 12 qubits/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'choose drought' }))
    expect(await screen.findByText(/different scenario or different settings/)).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /QAOA circuit on/ })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Chosen sample' })).toBeNull()
  })
})

describe('LabPage without the API', () => {
  it('shows the recorded model and circuit, labelled as recorded', async () => {
    const { offlineApi } = await import('../test/utils')
    const { useStore } = await import('../state/store')
    offlineApi()
    const user = userEvent.setup()
    function UseRecording() {
      const { actions } = useStore()
      return (
        <button type="button" onClick={() => void actions.switchToRecording()}>
          use recording
        </button>
      )
    }
    renderWithStore(
      <>
        <UseRecording />
        <LabPage />
      </>,
    )
    await user.click(screen.getByRole('button', { name: 'use recording' }))
    expect(await screen.findByRole('img', { name: /QUBO coefficients for 12 binary variables/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Run QAOA on this scenario' }))
    expect(await screen.findByRole('img', { name: /QAOA circuit on 12 qubits/ })).toBeInTheDocument()
    expect(screen.getByText(/in the recorded run/)).toBeInTheDocument()
  })
})

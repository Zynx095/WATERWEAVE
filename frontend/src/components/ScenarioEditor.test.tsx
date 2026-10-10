import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ModelDetails, ScenarioSpec, SolveResponse } from '../api/types'
import { DEFAULT_SETTINGS } from '../state/store'
import { fixtures } from '../test/utils'
import { NumberStepper } from './NumberStepper'
import { ScenarioEditor } from './ScenarioEditor'
import { SettingsForm } from './SettingsForm'

const scenario = (fixtures.solve_quantum as unknown as SolveResponse).scenario

function EditorHarness({ onScenario }: { onScenario: (s: ScenarioSpec) => void }) {
  const [s, setS] = useState(scenario)
  return (
    <ScenarioEditor
      scenario={s}
      onChange={(update) => {
        const next = update(s)
        setS(next)
        onScenario(next)
      }}
    />
  )
}

describe('NumberStepper', () => {
  it('steps within bounds and disables the buttons at the limits', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<NumberStepper label="morning supply" value={0} min={0} max={4} onChange={onChange} />)
    expect(screen.getByRole('button', { name: 'Decrease morning supply' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Increase morning supply' }))
    expect(onChange).toHaveBeenCalledWith(1)
  })

  it('rejects typed values that are out of range or not numbers', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<NumberStepper label="storage" value={1} min={0} max={2} onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: 'storage' })
    await user.clear(input)
    await user.type(input, '7{Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent('Use a value from 0 to 2.')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    await user.clear(input)
    await user.type(input, 'abc{Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a number.')
    await user.clear(input)
    await user.type(input, '2{Enter}')
    expect(onChange).toHaveBeenCalledWith(2)
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})

describe('ScenarioEditor', () => {
  it('toggles a request when its crossing is selected', async () => {
    const user = userEvent.setup()
    const onScenario = vi.fn()
    render(<EditorHarness onScenario={onScenario} />)
    const cell = screen.getByRole('button', { name: 'Market evening request' })
    expect(cell).toHaveAttribute('aria-pressed', 'false')
    await user.click(cell)
    expect(cell).toHaveAttribute('aria-pressed', 'true')
    const market = onScenario.mock.calls.at(-1)![0].neighborhoods.find((n: { id: string }) => n.id === 'N3')
    expect(market.demand_by_slot).toEqual({ morning: 1, evening: 1 })
  })

  it('edits supply, weight and storage within the limits the API accepts', async () => {
    const user = userEvent.setup()
    const onScenario = vi.fn()
    render(<EditorHarness onScenario={onScenario} />)
    await user.click(screen.getByRole('button', { name: 'Increase morning supply' }))
    expect(onScenario.mock.calls.at(-1)![0].supply_by_slot).toEqual({ morning: 3, evening: 2 })
    await user.click(screen.getByRole('button', { name: 'Increase Lakeside priority weight' }))
    const lakeside = onScenario.mock.calls.at(-1)![0].neighborhoods.find((n: { id: string }) => n.id === 'N4')
    expect(lakeside.priority_weight).toBe(2.5)
    // Storage cannot exceed the number of slots, the most one neighborhood can receive.
    expect(screen.getByRole('button', { name: 'Increase Hillview storage' })).toBeDisabled()
  })
})

describe('SettingsForm', () => {
  const model = { status: 'ready', data: fixtures.model_default as ModelDetails, error: null, source: 'live' } as const

  it('explains the model size in plain words', () => {
    render(<SettingsForm settings={DEFAULT_SETTINGS} onChange={() => {}} model={model} />)
    expect(screen.getByText(/needs/)).toHaveTextContent('12 qubits')
    expect(screen.getByText(/needs/)).toHaveTextContent('5 slack qubits')
  })

  it('reports setting changes and disables QAOA settings when QAOA is excluded', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(<SettingsForm settings={DEFAULT_SETTINGS} onChange={onChange} model={model} />)
    await user.click(screen.getByRole('radio', { name: '2' }))
    expect(onChange).toHaveBeenCalledWith({ p: 2 })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Samples (shots)' }), '2048')
    expect(onChange).toHaveBeenCalledWith({ shots: 2048 })
    await user.click(screen.getByRole('checkbox', { name: 'Include QAOA in the run' }))
    expect(onChange).toHaveBeenCalledWith({ include_qaoa: false })
    rerender(<SettingsForm settings={{ ...DEFAULT_SETTINGS, include_qaoa: false }} onChange={onChange} model={model} />)
    expect(screen.getByRole('combobox', { name: 'Samples (shots)' })).toBeDisabled()
  })

  it('warns when the scenario is too large for live QAOA', () => {
    const big = { ...model, data: { ...model.data, n_vars: 18, qaoa_within_budget: false } }
    render(<SettingsForm settings={DEFAULT_SETTINGS} onChange={() => {}} model={big} />)
    expect(screen.getByText(/QAOA will be skipped/)).toBeInTheDocument()
  })
})

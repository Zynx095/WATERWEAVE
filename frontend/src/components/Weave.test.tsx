import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ScenarioSpec, SolveResponse } from '../api/types'
import { fixtures } from '../test/utils'
import { cellState, Weave } from './Weave'

const quantum = fixtures.solve_quantum as unknown as SolveResponse
const scenario = quantum.scenario as ScenarioSpec
const exact = quantum.results.find((r) => r.key === 'exact')!

function cell(row: string, column: number) {
  const header = screen.getByRole('rowheader', { name: new RegExp(row) })
  const cells = within(header.closest('tr')!).getAllByRole('cell')
  return cells[column]
}

describe('cellState', () => {
  it('distinguishes delivered, unmet, unrequested and over-delivered crossings', () => {
    expect(cellState(1, 1)).toBe('delivered')
    expect(cellState(1, 0)).toBe('unmet')
    expect(cellState(0, 0)).toBe('none')
    expect(cellState(0, 1)).toBe('over')
    expect(cellState(1, null)).toBe('requested')
    expect(cellState(0, null)).toBe('none')
  })
})

describe('Weave', () => {
  it('is a table with neighborhoods as rows and slots as columns', () => {
    render(<Weave scenario={scenario} allocation={exact.allocation} caption="Exact allocation" />)
    const table = screen.getByRole('table', { name: 'Exact allocation' })
    expect(within(table).getAllByRole('rowheader').map((h) => h.textContent)).toEqual([
      expect.stringContaining('Hillview'),
      expect.stringContaining('Riverside'),
      expect.stringContaining('Market'),
      expect.stringContaining('Lakeside'),
      'Units used',
    ])
    expect(within(table).getByRole('columnheader', { name: /Morning/ })).toHaveTextContent('2 units available')
  })

  it('states every crossing in text, matching the solver allocation', () => {
    render(<Weave scenario={scenario} allocation={exact.allocation} caption="Exact allocation" />)
    for (const n of scenario.neighborhoods) {
      scenario.slots.forEach((slot, i) => {
        const demand = n.demand_by_slot[slot]
        const given = exact.allocation![n.id][slot]
        const expected = demand === 0 ? 'No request' : given ? 'Delivered' : 'Requested, not delivered'
        expect(cell(n.name.split(' ')[0], i)).toHaveTextContent(expected)
      })
    }
  })

  it('totals served units per neighborhood and used supply per slot', () => {
    render(<Weave scenario={scenario} allocation={exact.allocation} caption="Exact allocation" />)
    expect(cell('Market', 2)).toHaveTextContent('1 of 1')
    expect(screen.getByText('4 of 7 requested')).toBeInTheDocument()
    expect(screen.getAllByText('2 of 2')).toHaveLength(2)
  })

  it('shows requests only when there is no allocation yet', () => {
    render(<Weave scenario={scenario} allocation={null} caption="Requests" />)
    expect(cell('Hillview', 0)).toHaveTextContent('Requested')
    expect(cell('Market', 1)).toHaveTextContent('No request')
    expect(screen.getByText('7 in total')).toBeInTheDocument()
  })

  it('flags supply and storage violations of an infeasible allocation', () => {
    const everything = Object.fromEntries(
      scenario.neighborhoods.map((n) => [n.id, { ...n.demand_by_slot }]),
    )
    render(<Weave scenario={scenario} allocation={everything} caption="Everything" />)
    expect(screen.getByText('4 of 2')).toHaveTextContent('over supply')
    expect(cell('Riverside', 2)).toHaveTextContent('storage exceeded')
  })
})

import { describe, expect, it } from 'vitest'
import type { SolveResponse } from '../api/types'
import { fixtures } from '../test/utils'
import { agreesWithMetrics, disparity, fairnessScore, serviceShares } from './service'

const runs = [fixtures.solve_classical, fixtures.solve_quantum] as unknown as SolveResponse[]

describe('service shares', () => {
  it('agree with the API fairness score and disparity for every recorded result', () => {
    let checked = 0
    for (const run of runs) {
      for (const result of run.results) {
        if (result.status !== 'ok') continue
        const rows = serviceShares(run.scenario, result.allocation!)
        expect(agreesWithMetrics(rows, result.metrics!)).toBe(true)
        checked++
      }
      const nothing = run.reference.deliver_nothing
      expect(agreesWithMetrics(serviceShares(run.scenario, nothing.allocation), nothing.metrics)).toBe(true)
    }
    expect(checked).toBe(5)
  })

  it('caps served units at the request and skips neighborhoods with no request', () => {
    const scenario = runs[0].scenario
    const rows = serviceShares(scenario, { N1: { morning: 1, evening: 1 }, N3: { morning: 1, evening: 1 } })
    expect(rows.find((r) => r.id === 'N1')).toMatchObject({ requested: 2, served: 2, share: 1 })
    expect(rows.find((r) => r.id === 'N3')).toMatchObject({ requested: 1, served: 1, share: 1 })
    const none = serviceShares({ ...scenario, neighborhoods: scenario.neighborhoods.map((n) => ({ ...n, demand_by_slot: { morning: 0, evening: 0 } })) }, {})
    expect(none.every((r) => r.share === null)).toBe(true)
    expect(fairnessScore(none)).toBe(1)
    expect(disparity(none)).toBe(0)
  })

  it('matches the documented hand calculation for the exact optimum', () => {
    // docs/VALIDATION.md: shares (0.5, 0.5, 1, 0.5) -> fairness 0.5, disparity 0.75
    const rows = serviceShares(runs[0].scenario, {
      N1: { morning: 0, evening: 1 },
      N2: { morning: 0, evening: 1 },
      N3: { morning: 1, evening: 0 },
      N4: { morning: 1, evening: 0 },
    })
    expect(rows.map((r) => r.share)).toEqual([0.5, 0.5, 1, 0.5])
    expect(fairnessScore(rows)).toBe(0.5)
    expect(disparity(rows)).toBeCloseTo(0.75, 12)
  })
})

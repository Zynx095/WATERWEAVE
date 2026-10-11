import { describe, expect, it } from 'vitest'
import type { SolveResponse } from '../api/types'
import { fixtures } from '../test/utils'
import { STEPS, type StepContext } from './steps'

const run = fixtures.solve_classical as unknown as SolveResponse
const base: StepContext = { facts: null, run, bench: null, data: null }
const step = (id: string) => STEPS.find((s) => s.id === id)!

describe('step wording follows where the data came from', () => {
  it('does not tell the presenter a recorded run is live', () => {
    const live = step('classical').notes({ ...base, mode: 'live' }).join(' ')
    const recorded = step('classical').notes({ ...base, run: { ...run, source: 'recorded' }, mode: 'recorded' }).join(' ')
    expect(live).toContain('computed live')
    expect(recorded).toContain('recorded run')
    expect(recorded).not.toContain('computed live')
  })

  it('describes the data step as recorded, not as an unavailable live feed', () => {
    const caption = step('data').caption({ ...base, mode: 'recorded' })
    expect(caption).toMatch(/Recorded run/)
    expect(caption).not.toMatch(/unavailable right now/)
  })
})

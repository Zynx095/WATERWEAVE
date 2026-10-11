import { describe, expect, it } from 'vitest'
import { initialState, reducer } from './store'

describe('store reducer', () => {
  it('drops the previous model when a new model cannot be built', () => {
    const withModel = reducer(initialState, {
      type: 'slice/ready',
      key: 'model',
      data: { n_decision: 7 } as never,
      source: 'live',
    })
    expect(withModel.model.data).not.toBeNull()
    const failed = reducer(withModel, { type: 'slice/error', key: 'model', error: 'too many decisions' })
    expect(failed.model.status).toBe('error')
    expect(failed.model.data).toBeNull()
  })

  it('keeps earlier results on screen when only a re-run fails, so the error sits beside them', () => {
    const withRun = reducer(initialState, { type: 'slice/ready', key: 'run', data: { run_id: 'a' } as never, source: 'live' })
    const failed = reducer(withRun, { type: 'slice/error', key: 'run', error: 'boom' })
    expect(failed.run.status).toBe('error')
    expect(failed.run.error).toBe('boom')
  })
})

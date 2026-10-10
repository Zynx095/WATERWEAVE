import { describe, expect, it } from 'vitest'
import {
  createReducer,
  initialPresentation,
  remaining,
  totalDuration,
  type PresentationEvent,
  type PresentationState,
} from './machine'

const config = { durations: [1000, 2000, 3000] }
const reduce = createReducer(config)
const run = (events: PresentationEvent[], from: PresentationState = initialPresentation) => events.reduce(reduce, from)
const started = () => run([{ type: 'START' }])

describe('presentation machine', () => {
  it('starts at the first step, running, with a new token', () => {
    const s = started()
    expect(s).toMatchObject({ status: 'running', index: 0, elapsedMs: 0, token: 1 })
    expect(run([{ type: 'START', index: 2 }]).index).toBe(2)
    expect(run([{ type: 'START', index: 9 }]).index).toBe(0)
  })

  it('ignores controls before it starts', () => {
    for (const type of ['PAUSE', 'RESUME', 'TOGGLE', 'NEXT', 'PREV'] as const) {
      expect(reduce(initialPresentation, { type })).toBe(initialPresentation)
    }
    expect(reduce(initialPresentation, { type: 'TICK', deltaMs: 5000 })).toBe(initialPresentation)
  })

  it('advances automatically when a step has run its duration', () => {
    let s = run([{ type: 'TICK', deltaMs: 600 }], started())
    expect(s).toMatchObject({ index: 0, elapsedMs: 600 })
    s = reduce(s, { type: 'TICK', deltaMs: 400 })
    expect(s).toMatchObject({ index: 1, elapsedMs: 0, token: 2, status: 'running' })
  })

  it('moves at most one step per tick, even after a long gap', () => {
    const s = run([{ type: 'TICK', deltaMs: 60_000 }], started())
    expect(s.index).toBe(1)
  })

  it('finishes after the last step instead of wrapping around', () => {
    const s = run([{ type: 'GOTO', index: 2 }, { type: 'TICK', deltaMs: 3000 }], started())
    expect(s).toMatchObject({ status: 'finished', index: 2 })
    expect(reduce(s, { type: 'TICK', deltaMs: 1000 })).toBe(s)
    expect(reduce(s, { type: 'NEXT' })).toBe(s)
  })

  it('pauses immediately and resumes from the same elapsed time', () => {
    let s = run([{ type: 'TICK', deltaMs: 700 }, { type: 'PAUSE' }], started())
    expect(s.status).toBe('paused')
    s = run([{ type: 'TICK', deltaMs: 10_000 }], s)
    expect(s).toMatchObject({ status: 'paused', index: 0, elapsedMs: 700 })
    s = run([{ type: 'RESUME' }, { type: 'TICK', deltaMs: 299 }], s)
    expect(s).toMatchObject({ status: 'running', index: 0, elapsedMs: 999 })
    s = reduce(s, { type: 'TICK', deltaMs: 1 })
    expect(s.index).toBe(1)
  })

  it('toggles between playing and paused', () => {
    const paused = reduce(started(), { type: 'TOGGLE' })
    expect(paused.status).toBe('paused')
    expect(reduce(paused, { type: 'TOGGLE' }).status).toBe('running')
  })

  it('steps forwards and backwards manually, keeping play or pause', () => {
    let s = run([{ type: 'TICK', deltaMs: 500 }, { type: 'NEXT' }], started())
    expect(s).toMatchObject({ index: 1, elapsedMs: 0, status: 'running' })
    s = run([{ type: 'PAUSE' }, { type: 'NEXT' }], s)
    expect(s).toMatchObject({ index: 2, status: 'paused' })
    s = reduce(s, { type: 'PREV' })
    expect(s).toMatchObject({ index: 1, status: 'paused' })
    expect(reduce(run([{ type: 'PREV' }], started()), { type: 'PREV' }).index).toBe(0)
  })

  it('finishes when Next is pressed on the last step, and Previous resumes paused', () => {
    let s = run([{ type: 'GOTO', index: 2 }, { type: 'NEXT' }], started())
    expect(s.status).toBe('finished')
    s = reduce(s, { type: 'PREV' })
    expect(s).toMatchObject({ status: 'paused', index: 1 })
  })

  it('restarts from the first step and plays', () => {
    const s = run([{ type: 'NEXT' }, { type: 'NEXT' }, { type: 'PAUSE' }, { type: 'RESTART' }], started())
    expect(s).toMatchObject({ status: 'running', index: 0, elapsedMs: 0 })
  })

  it('exits to idle, keeping pace and auto preferences', () => {
    const s = run([{ type: 'SET_PACE', pace: 1.5 }, { type: 'SET_AUTO', auto: false }, { type: 'NEXT' }, { type: 'EXIT' }], started())
    expect(s).toMatchObject({ status: 'idle', index: 0, pace: 1.5, auto: false })
    expect(s.token).toBeGreaterThan(started().token)
  })

  it('does not advance on its own in manual mode', () => {
    const s = run([{ type: 'SET_AUTO', auto: false }, { type: 'TICK', deltaMs: 10_000 }], started())
    expect(s).toMatchObject({ index: 0, elapsedMs: 0, status: 'running' })
    expect(reduce(s, { type: 'NEXT' }).index).toBe(1)
  })

  it('scales step durations by the pace and rejects unknown paces', () => {
    let s = reduce(started(), { type: 'SET_PACE', pace: 1.5 })
    s = reduce(s, { type: 'TICK', deltaMs: 1499 })
    expect(s.index).toBe(0)
    expect(reduce(s, { type: 'TICK', deltaMs: 1 }).index).toBe(1)
    expect(reduce(s, { type: 'SET_PACE', pace: 7 })).toBe(s)
  })

  it('holds the clock while the step action is pending', () => {
    let s = started()
    s = reduce(s, { type: 'ACTION_STARTED', token: s.token })
    s = reduce(s, { type: 'TICK', deltaMs: 5000 })
    expect(s).toMatchObject({ index: 0, elapsedMs: 0, action: { status: 'pending' } })
    s = reduce(s, { type: 'ACTION_DONE', token: s.token })
    s = reduce(s, { type: 'TICK', deltaMs: 1000 })
    expect(s.index).toBe(1)
  })

  it('ignores action results from a step the presenter has left', () => {
    let s = started()
    const oldToken = s.token
    s = reduce(s, { type: 'ACTION_STARTED', token: oldToken })
    s = reduce(s, { type: 'NEXT' })
    const after = reduce(s, { type: 'ACTION_DONE', token: oldToken })
    expect(after).toBe(s)
    expect(reduce(s, { type: 'ACTION_FAILED', token: oldToken, error: 'late' })).toBe(s)
  })

  it('pauses on an action failure and records the error; Next still works', () => {
    let s = started()
    s = reduce(s, { type: 'ACTION_STARTED', token: s.token })
    s = reduce(s, { type: 'ACTION_FAILED', token: s.token, error: 'API offline' })
    expect(s).toMatchObject({ status: 'paused', action: { status: 'failed', error: 'API offline' } })
    s = reduce(s, { type: 'NEXT' })
    expect(s).toMatchObject({ index: 1, action: { status: 'none', error: null } })
  })

  it('retries a step by going to it again, which issues a new token', () => {
    const s = run([{ type: 'NEXT' }], started())
    const again = reduce(s, { type: 'GOTO', index: 1 })
    expect(again.index).toBe(1)
    expect(again.token).toBe(s.token + 1)
  })

  it('reports remaining time for the step and the whole presentation', () => {
    const s = run([{ type: 'TICK', deltaMs: 250 }], started())
    expect(remaining(config, s)).toEqual({ stepMs: 750, totalMs: 750 + 2000 + 3000 })
    expect(totalDuration(config, 1)).toBe(6000)
    expect(totalDuration(config, 0.2)).toBe(1200)
  })
})

/*
 * The guided presentation as a pure state machine. Nothing here touches
 * timers, the DOM or the network: the provider feeds TICK events with real
 * elapsed time, starts step actions, and reports their outcome back with the
 * token of the step that started them. Every transition is unit-tested.
 */

export type PresentationStatus = 'idle' | 'running' | 'paused' | 'finished'
export type ActionStatus = 'none' | 'pending' | 'done' | 'failed'

export interface PresentationState {
  status: PresentationStatus
  /** Index of the current step. */
  index: number
  /** Time spent in the current step while playing; frozen while paused or while its action runs. */
  elapsedMs: number
  /** Multiplier for every step's duration. */
  pace: number
  /** Automatic progression; when false the presenter moves on by hand. */
  auto: boolean
  /** Changes on every step entry, so results of earlier steps can be recognised and ignored. */
  token: number
  action: { status: ActionStatus; error: string | null }
}

export type PresentationEvent =
  | { type: 'START'; index?: number }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'TOGGLE' }
  | { type: 'NEXT' }
  | { type: 'PREV' }
  | { type: 'GOTO'; index: number }
  | { type: 'RESTART' }
  | { type: 'EXIT' }
  | { type: 'TICK'; deltaMs: number }
  | { type: 'SET_PACE'; pace: number }
  | { type: 'SET_AUTO'; auto: boolean }
  | { type: 'ACTION_STARTED'; token: number }
  | { type: 'ACTION_DONE'; token: number }
  | { type: 'ACTION_FAILED'; token: number; error: string }

export const PACES = [0.2, 0.75, 1, 1.25, 1.5] as const

export const initialPresentation: PresentationState = {
  status: 'idle',
  index: 0,
  elapsedMs: 0,
  pace: 1,
  auto: true,
  token: 0,
  action: { status: 'none', error: null },
}

export interface MachineConfig {
  /** Base duration of each step in milliseconds; its length is the step count. */
  durations: readonly number[]
}

export const stepDuration = (config: MachineConfig, state: PresentationState, index = state.index) =>
  Math.round((config.durations[index] ?? 0) * state.pace)

/** Enter a step: fresh clock, fresh token, no action yet. */
function enter(state: PresentationState, index: number, status: PresentationStatus): PresentationState {
  return {
    ...state,
    status,
    index,
    elapsedMs: 0,
    token: state.token + 1,
    action: { status: 'none', error: null },
  }
}

export function createReducer(config: MachineConfig) {
  const last = config.durations.length - 1
  const valid = (i: number) => Number.isInteger(i) && i >= 0 && i <= last

  return function reduce(state: PresentationState, event: PresentationEvent): PresentationState {
    switch (event.type) {
      case 'START': {
        if (state.status === 'running' || state.status === 'paused') return state
        const index = event.index !== undefined && valid(event.index) ? event.index : 0
        return enter(state, index, 'running')
      }

      case 'PAUSE':
        return state.status === 'running' ? { ...state, status: 'paused' } : state

      case 'RESUME':
        return state.status === 'paused' ? { ...state, status: 'running' } : state

      case 'TOGGLE':
        // In manual mode no clock runs, so pausing would change nothing.
        if (!state.auto) return state
        if (state.status === 'running') return { ...state, status: 'paused' }
        if (state.status === 'paused') return { ...state, status: 'running' }
        return state

      case 'NEXT':
        if (state.status === 'idle' || state.status === 'finished') return state
        if (state.index >= last) return { ...state, status: 'finished' }
        return enter(state, state.index + 1, state.status)

      case 'PREV':
        if (state.status === 'idle' || state.index === 0) return state
        // Going back from the end resumes in a paused state on the previous step.
        return enter(state, state.index - 1, state.status === 'finished' ? 'paused' : state.status)

      case 'GOTO':
        if (state.status === 'idle' || !valid(event.index)) return state
        return enter(state, event.index, state.status === 'finished' ? 'paused' : state.status)

      case 'RESTART':
        // Starting is START's job (after the preflight); a stray Home key or
        // a presenter window must not begin a show that was never started.
        if (state.status === 'idle') return state
        return enter(state, 0, 'running')

      case 'EXIT':
        return { ...initialPresentation, pace: state.pace, auto: state.auto, token: state.token + 1 }

      case 'TICK': {
        if (state.status !== 'running' || !state.auto || event.deltaMs <= 0) return state
        // The clock holds while the step's action (a solver run, a fetch) is in flight.
        if (state.action.status === 'pending') return state
        const elapsedMs = state.elapsedMs + event.deltaMs
        if (elapsedMs < stepDuration(config, state)) return { ...state, elapsedMs }
        // At most one step per tick, even after a long gap (e.g. a hidden tab).
        if (state.index >= last) return { ...state, elapsedMs: stepDuration(config, state), status: 'finished' }
        return enter(state, state.index + 1, 'running')
      }

      case 'SET_PACE':
        if (!PACES.includes(event.pace as (typeof PACES)[number])) return state
        return { ...state, pace: event.pace }

      case 'SET_AUTO':
        return { ...state, auto: event.auto }

      case 'ACTION_STARTED':
        if (event.token !== state.token || state.status === 'idle') return state
        return { ...state, action: { status: 'pending', error: null } }

      case 'ACTION_DONE':
        if (event.token !== state.token || state.status === 'idle') return state
        return { ...state, action: { status: 'done', error: null } }

      case 'ACTION_FAILED':
        if (event.token !== state.token || state.status === 'idle') return state
        // Stop on a failure so the presenter notices; Next or Retry continue.
        return {
          ...state,
          status: state.status === 'running' ? 'paused' : state.status,
          action: { status: 'failed', error: event.error },
        }

      default:
        return state
    }
  }
}

/** Milliseconds left in the current step and in the whole presentation. */
export function remaining(config: MachineConfig, state: PresentationState) {
  const step = Math.max(0, stepDuration(config, state) - state.elapsedMs)
  let total = step
  for (let i = state.index + 1; i < config.durations.length; i++) total += stepDuration(config, state, i)
  return { stepMs: state.status === 'finished' ? 0 : step, totalMs: state.status === 'finished' ? 0 : total }
}

export function totalDuration(config: MachineConfig, pace: number) {
  return config.durations.reduce((sum, d) => sum + Math.round(d * pace), 0)
}

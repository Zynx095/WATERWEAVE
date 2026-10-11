/*
 * Messages between the audience window (which runs the presentation) and the
 * presenter view in a second window, over a same-origin BroadcastChannel.
 * The presenter only sends commands; the audience window owns the state.
 * Both sides validate what they receive.
 */
import type { PresentationEvent, PresentationState } from './machine'

export const CHANNEL_NAME = 'waterweave-presentation'

export interface PresenterSnapshot {
  /** Identifies the app window that sent this; commands must name it as their target. */
  tabId: string
  state: PresentationState
  steps: { id: string; title: string }[]
  caption: string
  notes: string[]
  next: { title: string; caption: string } | null
  remaining: { stepMs: number; totalMs: number }
  actionLabel: string | null
  mode: 'live' | 'recorded'
}

export type AudienceMessage = { kind: 'snapshot'; snapshot: PresenterSnapshot }
/** A command is for exactly one app window: the one the presenter view is pinned to. */
export type PresenterMessage = { kind: 'hello' } | { kind: 'command'; target: string; event: PresentationEvent }

/** Commands a presenter may send. Clock ticks and action results never come from outside. */
const COMMANDS = new Set(['START', 'PAUSE', 'RESUME', 'TOGGLE', 'NEXT', 'PREV', 'GOTO', 'RESTART', 'EXIT', 'SET_PACE', 'SET_AUTO'])

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

export function parsePresenterMessage(data: unknown): PresenterMessage | null {
  if (!isObject(data)) return null
  if (data.kind === 'hello') return { kind: 'hello' }
  if (data.kind !== 'command' || !isObject(data.event)) return null
  if (typeof data.target !== 'string' || data.target === '') return null
  const event = data.event
  if (typeof event.type !== 'string' || !COMMANDS.has(event.type)) return null
  if (event.type === 'GOTO' && !Number.isInteger(event.index)) return null
  if (event.type === 'SET_PACE' && typeof event.pace !== 'number') return null
  if (event.type === 'SET_AUTO' && typeof event.auto !== 'boolean') return null
  if (event.type === 'START' && event.index !== undefined && !Number.isInteger(event.index)) return null
  return { kind: 'command', target: data.target, event: event as unknown as PresentationEvent }
}

export function parseAudienceMessage(data: unknown): AudienceMessage | null {
  if (!isObject(data) || data.kind !== 'snapshot' || !isObject(data.snapshot)) return null
  const s = data.snapshot
  if (typeof s.tabId !== 'string' || !isObject(s.state) || !Array.isArray(s.steps) || !Array.isArray(s.notes) || typeof s.caption !== 'string') {
    return null
  }
  return { kind: 'snapshot', snapshot: s as unknown as PresenterSnapshot }
}

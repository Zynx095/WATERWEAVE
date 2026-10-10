/*
 * Connects the presentation state machine to the real app: it runs the clock,
 * navigates to each step's page, scrolls to and highlights its element, and
 * triggers the step's real action (solver runs, data fetch) through the same
 * store the pages use. Keyboard shortcuts and timers live here and are
 * cleaned up when the presentation ends or the provider unmounts.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate } from 'react-router'
import { benchmarkFacts } from '../lib/benchmark'
import { scenarioFacts } from '../lib/scenario'
import { DEFAULT_SETTINGS, useStore, type StoreActions } from '../state/store'
import {
  createReducer,
  initialPresentation,
  type PresentationEvent,
  type PresentationState,
} from './machine'
import { STEP_DURATIONS, STEPS, type StepAction, type StepContext } from './steps'

export const MACHINE_CONFIG = { durations: STEP_DURATIONS }
const reducer = createReducer(MACHINE_CONFIG)
const TICK_MS = 200

export interface PresentationValue {
  state: PresentationState
  dispatch: (event: PresentationEvent) => void
  context: StepContext
  /** Whether the data step should contact live providers (set by preflight). */
  liveData: boolean
  setLiveData: (live: boolean) => void
  preflightOpen: boolean
  openPreflight: () => void
  closePreflight: () => void
  notesOpen: boolean
  setNotesOpen: (open: boolean) => void
}

const PresentationContext = createContext<PresentationValue | null>(null)

/** Runs a step's action; resolves to an error message, or null on success or cancellation. */
async function runAction(
  action: StepAction,
  actions: StoreActions,
  signal: AbortSignal,
  liveData: boolean,
): Promise<string | null> {
  switch (action) {
    case 'load-default':
      actions.selectPreset('default')
      actions.updateSettings(DEFAULT_SETTINGS)
      return null
    case 'run-classical':
      return (await actions.runSolvers({ includeQaoa: false, signal, label: 'Running greedy and exact search.' })).error
    case 'run-quantum':
      return (
        await actions.runSolvers({
          includeQaoa: true,
          settings: { ...DEFAULT_SETTINGS },
          signal,
          label: 'Running greedy, exact search and QAOA. The quantum simulation takes about a second.',
        })
      ).error
    case 'fetch-data':
      return (await actions.fetchDataSources({ live: liveData, refresh: liveData, signal })).error
    case 'load-benchmark':
      return (await actions.loadBenchmark({ signal })).error
  }
}

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el || !el.tagName) return false
  return ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) || el.isContentEditable
}

export function PresentationProvider({ children }: { children: ReactNode }) {
  const { state: store, actions } = useStore()
  const [state, dispatch] = useReducer(reducer, initialPresentation)
  const [liveData, setLiveData] = useState(true)
  const [preflightOpen, setPreflightOpen] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const active = state.status !== 'idle'
  const step = STEPS[state.index]

  // Latest values for effects that must not re-run when they change.
  const latest = useRef({ actions, liveData })
  latest.current = { actions, liveData }

  // Clock: real elapsed time while playing, nothing while paused or in manual mode.
  useEffect(() => {
    if (state.status !== 'running' || !state.auto) return
    let last = Date.now()
    const id = window.setInterval(() => {
      const now = Date.now()
      dispatch({ type: 'TICK', deltaMs: now - last })
      last = now
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [state.status, state.auto])

  // Step entry: go to the step's page and run its action once.
  useEffect(() => {
    if (!active) return
    if (location.pathname !== step.route) navigate(step.route)
    if (!step.action) return
    const token = state.token
    const controller = new AbortController()
    dispatch({ type: 'ACTION_STARTED', token })
    runAction(step.action, latest.current.actions, controller.signal, latest.current.liveData).then(
      (error) => {
        if (controller.signal.aborted) return
        dispatch(error ? { type: 'ACTION_FAILED', token, error } : { type: 'ACTION_DONE', token })
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          dispatch({ type: 'ACTION_FAILED', token, error: error instanceof Error ? error.message : String(error) })
        }
      },
    )
    return () => controller.abort()
    // Runs once per step entry: the token changes on every entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.token, active])

  // Scroll to and highlight the step's element, again when its content arrives.
  useEffect(() => {
    if (!active || location.pathname !== step.route) return
    let tries = 0
    let element: HTMLElement | null = null
    let timer = 0
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const find = () => {
      element = document.querySelector<HTMLElement>(`[data-present-id="${step.target}"]`)
      if (element) {
        element.setAttribute('data-spotlight', 'true')
        element.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
      } else if (tries++ < 30) {
        timer = window.setTimeout(find, 150)
      }
    }
    find()
    return () => {
      window.clearTimeout(timer)
      element?.removeAttribute('data-spotlight')
    }
  }, [active, state.token, state.action.status, location.pathname, step.route, step.target])

  // Room for the presentation bar while presenting.
  useEffect(() => {
    if (!active) return
    document.body.dataset.presenting = 'true'
    return () => {
      delete document.body.dataset.presenting
    }
  }, [active])

  // Keyboard shortcuts while presenting (presentation clickers send Page Up/Down).
  useEffect(() => {
    if (!active) return
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || isTypingTarget(event.target)) return
      if (document.querySelector('dialog[open]')) return
      const keys: Record<string, () => void> = {
        ' ': () => dispatch({ type: 'TOGGLE' }),
        k: () => dispatch({ type: 'TOGGLE' }),
        ArrowRight: () => dispatch({ type: 'NEXT' }),
        PageDown: () => dispatch({ type: 'NEXT' }),
        ArrowLeft: () => dispatch({ type: 'PREV' }),
        PageUp: () => dispatch({ type: 'PREV' }),
        Home: () => dispatch({ type: 'RESTART' }),
        Escape: () => dispatch({ type: 'EXIT' }),
        n: () => setNotesOpen((open) => !open),
      }
      const handler = keys[event.key]
      if (!handler) return
      // Space on a button would also click it; the shortcut takes over.
      event.preventDefault()
      handler()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  const context = useMemo<StepContext>(
    () => ({
      facts: store.scenario ? scenarioFacts(store.scenario) : null,
      run: store.run.status === 'ready' ? store.run.data : null,
      bench: store.benchmark.data?.default ? benchmarkFacts(store.benchmark.data.default) : null,
      data: store.dataSources.status === 'ready' ? store.dataSources.data : null,
    }),
    [store.scenario, store.run, store.benchmark.data, store.dataSources],
  )

  const openPreflight = useCallback(() => setPreflightOpen(true), [])
  const closePreflight = useCallback(() => setPreflightOpen(false), [])

  const value = useMemo<PresentationValue>(
    () => ({
      state,
      dispatch,
      context,
      liveData,
      setLiveData,
      preflightOpen,
      openPreflight,
      closePreflight,
      notesOpen,
      setNotesOpen,
    }),
    [state, context, liveData, preflightOpen, openPreflight, closePreflight, notesOpen],
  )

  return <PresentationContext.Provider value={value}>{children}</PresentationContext.Provider>
}

export function usePresentation(): PresentationValue {
  const value = useContext(PresentationContext)
  if (!value) throw new Error('usePresentation must be used inside <PresentationProvider>')
  return value
}

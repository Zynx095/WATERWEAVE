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
import { CHANNEL_NAME, parsePresenterMessage, type AudienceMessage, type PresenterSnapshot } from './channel'
import {
  createReducer,
  initialPresentation,
  remaining,
  stepDuration,
  type PresentationEvent,
  type PresentationState,
} from './machine'
import { STEP_DURATIONS, STEPS, type StepAction, type StepContext } from './steps'

export const MACHINE_CONFIG = { durations: STEP_DURATIONS }
const reducer = createReducer(MACHINE_CONFIG)
const TICK_MS = 200
/** Fraction of a step after which a target too tall for the screen is scrolled to its end. */
const REVEAL_AT = 0.5

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
  /** A presenter view in another window has been heard from recently. */
  presenterLinked: boolean
  /** Audience view: hides navigation and controls, leaving content and caption. */
  cleanView: boolean
  setCleanView: (clean: boolean) => void
}

const PresentationContext = createContext<PresentationValue | null>(null)

/** Runs a step's action; resolves to an error message, or null on success or cancellation. */
async function runAction(
  action: StepAction,
  actions: StoreActions,
  signal: AbortSignal,
  liveData: boolean,
  hasQuantumResults: boolean,
): Promise<string | null> {
  switch (action) {
    case 'ensure-results':
      if (hasQuantumResults) return null
      return runAction('run-quantum', actions, signal, liveData, false)
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

/**
 * Scrolls so the element sits in the space above the caption bar: centred if
 * it fits, otherwise with its top in view.
 */
function frameAboveBar(element: HTMLElement, reduceMotion: boolean) {
  const gap = 24
  const barHeight = document.querySelector('.present-bar')?.getBoundingClientRect().height ?? 0
  const room = window.innerHeight - barHeight - 2 * gap
  const rect = element.getBoundingClientRect()
  const centring = rect.height < room ? (room - rect.height) / 2 : 0
  window.scrollTo({
    top: Math.max(0, window.scrollY + rect.top - gap - centring),
    behavior: reduceMotion ? 'auto' : 'smooth',
  })
}

/**
 * For an element taller than the space above the bar: scrolls on until its
 * end sits just above the bar, so nothing stays hidden behind the caption.
 */
function revealEnd(element: HTMLElement, reduceMotion: boolean) {
  const gap = 24
  const barTop = document.querySelector('.present-bar')?.getBoundingClientRect().top ?? window.innerHeight
  const hidden = element.getBoundingClientRect().bottom - (barTop - gap)
  if (hidden <= 1) return
  window.scrollTo({ top: window.scrollY + hidden, behavior: reduceMotion ? 'auto' : 'smooth' })
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
  const [cleanView, setCleanView] = useState(false)
  const [presenterLinked, setPresenterLinked] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const active = state.status !== 'idle'
  const step = STEPS[state.index]

  // Latest values for effects that must not re-run when they change.
  const run = store.run.status === 'ready' ? store.run.data : null
  const hasQuantumResults = Boolean(
    run?.settings.include_qaoa && run.results.some((r) => r.key === 'exact' && r.status === 'ok'),
  )
  const latest = useRef({ actions, liveData, hasQuantumResults })
  latest.current = { actions, liveData, hasQuantumResults }

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
    runAction(
      step.action,
      latest.current.actions,
      controller.signal,
      latest.current.liveData,
      latest.current.hasQuantumResults,
    ).then(
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
        frameAboveBar(element, reduceMotion)
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

  // Halfway through a step that plays on its own, show the rest of a target too tall for the screen.
  // Paused or manual presenters scroll themselves, so nothing moves under them.
  const revealDue =
    state.status === 'running' &&
    state.auto &&
    state.action.status !== 'pending' &&
    state.elapsedMs >= stepDuration(MACHINE_CONFIG, state) * REVEAL_AT
  const revealedToken = useRef(0)
  useEffect(() => {
    if (!revealDue || revealedToken.current === state.token) return
    revealedToken.current = state.token
    const element = document.querySelector<HTMLElement>('[data-spotlight]')
    if (element) revealEnd(element, window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [revealDue, state.token])

  // Room for the presentation bar while presenting.
  useEffect(() => {
    if (!active) return
    document.body.dataset.presenting = 'true'
    return () => {
      delete document.body.dataset.presenting
    }
  }, [active])

  // The clean audience view ends with the presentation.
  useEffect(() => {
    if (!active) setCleanView(false)
  }, [active])

  useEffect(() => {
    if (!cleanView) return
    document.body.dataset.cleanView = 'true'
    return () => {
      delete document.body.dataset.cleanView
    }
  }, [cleanView])

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
        h: () => setCleanView((clean) => !clean),
      }
      const handler = keys[event.key]
      if (!handler) return
      // Space on a page control (a crossing, a stepper button) presses that
      // control; only the presentation bar and plain content take it as pause.
      const target = event.target as HTMLElement | null
      if (
        event.key === ' ' &&
        target?.closest?.('button, a[href], summary, [role="button"], [role="switch"], [role="checkbox"]') &&
        !target.closest('.present-bar')
      ) {
        return
      }
      // Space on a button would also click it; the shortcut takes over.
      event.preventDefault()
      handler()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  const defaultScenario = store.presets.data?.find((p) => p.id === 'default')?.scenario ?? null
  const context = useMemo<StepContext>(
    () => ({
      facts: store.scenario ? scenarioFacts(store.scenario) : null,
      run: store.run.status === 'ready' ? store.run.data : null,
      bench: store.benchmark.data?.default ? benchmarkFacts(store.benchmark.data.default) : null,
      data: store.dataSources.status === 'ready' ? store.dataSources.data : null,
      introFacts: defaultScenario ? scenarioFacts(defaultScenario) : null,
      mode: store.mode,
    }),
    [store.scenario, store.run, store.benchmark.data, store.dataSources, store.mode, defaultScenario],
  )

  // Presenter view in another window: publish a snapshot, accept commands.
  const snapshot = useMemo<PresenterSnapshot>(() => {
    const next = STEPS[state.index + 1]
    return {
      state,
      steps: STEPS.map((s) => ({ id: s.id, title: s.title })),
      caption: step.caption(context),
      notes: step.notes(context),
      next: next ? { title: next.title, caption: next.caption(context) } : null,
      remaining: remaining(MACHINE_CONFIG, state),
      actionLabel: step.actionLabel ?? null,
      mode: store.mode,
    }
  }, [state, step, context, store.mode])
  const channel = useRef<BroadcastChannel | null>(null)
  const isActive = useRef(false)
  const sentActive = useRef(false)
  isActive.current = active
  const latestSnapshot = useRef(snapshot)
  latestSnapshot.current = snapshot

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const ch = new BroadcastChannel(CHANNEL_NAME)
    channel.current = ch
    const publish = () => ch.postMessage({ kind: 'snapshot', snapshot: latestSnapshot.current } satisfies AudienceMessage)
    // Any open tab of the app shares this channel. A tab that is not
    // presenting answers only while it is the one in front, and only to
    // a hello, so a background tab neither talks over nor obeys the presenter.
    const inFront = () => document.visibilityState !== 'hidden'
    let presenterSeenAt = 0
    ch.onmessage = (event: MessageEvent) => {
      const message = parsePresenterMessage(event.data)
      if (!message) return
      if (!isActive.current && !inFront()) return
      presenterSeenAt = Date.now()
      setPresenterLinked(true)
      if (message.kind === 'hello') publish()
      else dispatch(message.event)
    }
    // Heartbeats in both directions tell each window whether the other is still there.
    const heartbeat = window.setInterval(() => {
      if (isActive.current) publish()
      if (presenterSeenAt && Date.now() - presenterSeenAt > 5000) setPresenterLinked(false)
    }, 1000)
    return () => {
      window.clearInterval(heartbeat)
      ch.close()
      channel.current = null
    }
  }, [])

  useEffect(() => {
    // Active tabs publish every change; a tab that has just stopped presenting
    // publishes once more so the presenter view sees that the show ended.
    if (isActive.current || sentActive.current) {
      channel.current?.postMessage({ kind: 'snapshot', snapshot } satisfies AudienceMessage)
    }
    sentActive.current = isActive.current
  }, [snapshot])

  // Keyboard focus follows the show: onto the bar when it starts, back to
  // the opener when it ends, instead of falling to the page body.
  const wasActive = useRef(false)
  useEffect(() => {
    if (active && !wasActive.current) {
      window.setTimeout(() => document.querySelector<HTMLElement>('.present-btn--main')?.focus(), 0)
    } else if (!active && wasActive.current) {
      window.setTimeout(() => document.querySelector<HTMLElement>('[data-present-opener]')?.focus(), 0)
    }
    wasActive.current = active
  }, [active])

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
      presenterLinked,
      cleanView,
      setCleanView,
    }),
    [state, context, liveData, preflightOpen, openPreflight, closePreflight, notesOpen, presenterLinked, cleanView],
  )

  return <PresentationContext.Provider value={value}>{children}</PresentationContext.Provider>
}

export function usePresentation(): PresentationValue {
  const value = useContext(PresentationContext)
  if (!value) throw new Error('usePresentation must be used inside <PresentationProvider>')
  return value
}

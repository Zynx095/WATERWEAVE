/*
 * Application state shared by the pages and the presentation controller.
 * Every result held here came from the API, or from the bundled recording
 * when the user chose it; `source` records which.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react'
import { api, ApiError, isAbortError } from '../api/client'
import type {
  BenchmarkResponse,
  DataSourcesResponse,
  HealthResponse,
  ModelDetails,
  Preset,
  RunSource,
  ScenarioSpec,
  SolveResponse,
  SolveSettings,
} from '../api/types'
import { loadRecording, type Recording } from '../data/recorded'

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface Slice<T> {
  status: LoadStatus
  data: T | null
  error: string | null
  source: RunSource | null
}

const emptySlice = <T,>(): Slice<T> => ({ status: 'idle', data: null, error: null, source: null })

export type ConnectionStatus = 'checking' | 'online' | 'offline'
export type Mode = 'live' | 'recorded'

export const DEFAULT_SETTINGS: SolveSettings = {
  include_qaoa: true,
  fairness_weight: 2,
  p: 1,
  shots: 1024,
  maxiter: 25,
  seed: 42,
}

export interface StoreState {
  connection: { status: ConnectionStatus; health: HealthResponse | null; error: string | null }
  mode: Mode
  recording: Recording | null
  presets: Slice<Preset[]>
  presetId: string | null
  scenario: ScenarioSpec | null
  scenarioEdited: boolean
  settings: SolveSettings
  run: Slice<SolveResponse> & { label: string | null }
  model: Slice<ModelDetails>
  dataSources: Slice<DataSourcesResponse>
  benchmark: Slice<BenchmarkResponse>
}

export const initialState: StoreState = {
  connection: { status: 'checking', health: null, error: null },
  mode: 'live',
  recording: null,
  presets: emptySlice(),
  presetId: null,
  scenario: null,
  scenarioEdited: false,
  settings: DEFAULT_SETTINGS,
  run: { ...emptySlice(), label: null },
  model: emptySlice(),
  dataSources: emptySlice(),
  benchmark: emptySlice(),
}

type SliceKey = 'presets' | 'model' | 'dataSources' | 'benchmark' | 'run'

export type Action =
  | { type: 'connection'; status: ConnectionStatus; health?: HealthResponse | null; error?: string | null }
  | { type: 'mode'; mode: Mode; recording?: Recording | null }
  | { type: 'slice/loading'; key: SliceKey; label?: string | null }
  | { type: 'slice/ready'; key: SliceKey; data: unknown; source: RunSource }
  | { type: 'slice/error'; key: SliceKey; error: string }
  | { type: 'slice/clear'; key: SliceKey }
  | { type: 'scenario/preset'; presetId: string; scenario: ScenarioSpec }
  | { type: 'scenario/edit'; scenario: ScenarioSpec }
  | { type: 'settings'; settings: Partial<SolveSettings> }

export function reducer(state: StoreState, action: Action): StoreState {
  switch (action.type) {
    case 'connection':
      return {
        ...state,
        connection: {
          status: action.status,
          health: action.health ?? (action.status === 'online' ? state.connection.health : null),
          error: action.error ?? null,
        },
      }
    case 'mode':
      return { ...state, mode: action.mode, recording: action.recording ?? state.recording }
    case 'slice/loading':
      return {
        ...state,
        [action.key]: {
          ...state[action.key],
          status: 'loading',
          error: null,
          ...(action.key === 'run' ? { label: action.label ?? null } : {}),
        },
      }
    case 'slice/ready':
      return {
        ...state,
        [action.key]: { ...state[action.key], status: 'ready', data: action.data, error: null, source: action.source },
      }
    case 'slice/error':
      return { ...state, [action.key]: { ...state[action.key], status: 'error', error: action.error } }
    case 'slice/clear':
      return { ...state, [action.key]: action.key === 'run' ? { ...emptySlice(), label: null } : emptySlice() }
    case 'scenario/preset':
      return { ...state, presetId: action.presetId, scenario: action.scenario, scenarioEdited: false }
    case 'scenario/edit':
      return { ...state, scenario: action.scenario, scenarioEdited: true }
    case 'settings':
      return { ...state, settings: { ...state.settings, ...action.settings } }
    default:
      return state
  }
}

const message = (error: unknown) =>
  error instanceof ApiError ? error.message : error instanceof Error ? error.message : String(error)

export interface RunOptions {
  includeQaoa?: boolean
  settings?: Partial<SolveSettings>
  signal?: AbortSignal
  label?: string
}

export interface StoreActions {
  checkConnection: () => Promise<ConnectionStatus>
  switchToRecording: () => Promise<void>
  switchToLive: () => Promise<void>
  selectPreset: (id: string) => void
  editScenario: (update: (scenario: ScenarioSpec) => ScenarioSpec) => void
  updateSettings: (settings: Partial<SolveSettings>) => void
  runSolvers: (options?: RunOptions) => Promise<SolveResponse | null>
  fetchDataSources: (options: { live: boolean; refresh?: boolean; signal?: AbortSignal }) => Promise<DataSourcesResponse | null>
  loadBenchmark: (options?: { signal?: AbortSignal }) => Promise<BenchmarkResponse | null>
}

interface StoreValue {
  state: StoreState
  actions: StoreActions
}

const StoreContext = createContext<StoreValue | null>(null)

function sameScenario(a: ScenarioSpec | null, b: ScenarioSpec | null) {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function StoreProvider({ children, autoConnect = true }: { children: ReactNode; autoConnect?: boolean }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const stateRef = useRef(state)
  stateRef.current = state
  const runCounter = useRef(0)
  const dataCounter = useRef(0)

  const applyPresets = useCallback((presets: Preset[], source: RunSource) => {
    dispatch({ type: 'slice/ready', key: 'presets', data: presets, source })
    const current = stateRef.current
    if (!current.scenario || current.presetId === null) {
      const first = presets.find((p) => p.id === 'default') ?? presets[0]
      if (first) dispatch({ type: 'scenario/preset', presetId: first.id, scenario: first.scenario })
    }
  }, [])

  const checkConnection = useCallback(async (): Promise<ConnectionStatus> => {
    dispatch({ type: 'connection', status: 'checking' })
    try {
      const health = await api.health()
      dispatch({ type: 'connection', status: 'online', health })
      if (stateRef.current.presets.source !== 'live') {
        dispatch({ type: 'slice/loading', key: 'presets' })
        try {
          applyPresets(await api.presets(), 'live')
        } catch (error) {
          dispatch({ type: 'slice/error', key: 'presets', error: message(error) })
        }
      }
      return 'online'
    } catch (error) {
      dispatch({ type: 'connection', status: 'offline', error: message(error) })
      return 'offline'
    }
  }, [applyPresets])

  const switchToRecording = useCallback(async () => {
    const recording = await loadRecording()
    dispatch({ type: 'mode', mode: 'recorded', recording })
    applyPresets(recording.presets, 'recorded')
    const fallback = recording.presets.find((p) => p.id === 'default')
    if (fallback) dispatch({ type: 'scenario/preset', presetId: fallback.id, scenario: fallback.scenario })
    dispatch({ type: 'slice/clear', key: 'run' })
    dispatch({ type: 'slice/clear', key: 'dataSources' })
  }, [applyPresets])

  const switchToLive = useCallback(async () => {
    dispatch({ type: 'mode', mode: 'live' })
    dispatch({ type: 'slice/clear', key: 'run' })
    dispatch({ type: 'slice/clear', key: 'dataSources' })
    if (stateRef.current.benchmark.source === 'recorded') dispatch({ type: 'slice/clear', key: 'benchmark' })
    await checkConnection()
  }, [checkConnection])

  const selectPreset = useCallback((id: string) => {
    const preset = stateRef.current.presets.data?.find((p) => p.id === id)
    if (preset) dispatch({ type: 'scenario/preset', presetId: preset.id, scenario: preset.scenario })
  }, [])

  const editScenario = useCallback((update: (scenario: ScenarioSpec) => ScenarioSpec) => {
    const current = stateRef.current.scenario
    if (current) dispatch({ type: 'scenario/edit', scenario: update(current) })
  }, [])

  const updateSettings = useCallback((settings: Partial<SolveSettings>) => {
    dispatch({ type: 'settings', settings })
  }, [])

  const runSolvers = useCallback(async (options: RunOptions = {}): Promise<SolveResponse | null> => {
    const current = stateRef.current
    const scenario = current.scenario
    if (!scenario) return null
    const settings: SolveSettings = {
      ...current.settings,
      ...options.settings,
      ...(options.includeQaoa === undefined ? {} : { include_qaoa: options.includeQaoa }),
    }
    const id = ++runCounter.current
    dispatch({ type: 'slice/loading', key: 'run', label: options.label ?? null })

    if (current.mode === 'recorded') {
      const rec = current.recording
      const recorded = settings.include_qaoa ? rec?.quantum : rec?.classical
      const matches =
        recorded &&
        sameScenario(scenario, recorded.scenario) &&
        settings.fairness_weight === recorded.settings.fairness_weight &&
        (!settings.include_qaoa ||
          (settings.p === recorded.settings.p &&
            settings.shots === recorded.settings.shots &&
            settings.maxiter === recorded.settings.maxiter &&
            settings.seed === recorded.settings.seed))
      if (!recorded || !matches) {
        dispatch({
          type: 'slice/error',
          key: 'run',
          error:
            'The recorded run only covers the default scenario with the default settings. Start the API to solve this scenario.',
        })
        return null
      }
      dispatch({ type: 'slice/ready', key: 'run', data: recorded, source: 'recorded' })
      return recorded
    }

    try {
      const response = await api.solve(scenario, settings, { signal: options.signal })
      if (id !== runCounter.current) return null // a newer run superseded this one
      dispatch({ type: 'slice/ready', key: 'run', data: response, source: 'live' })
      return response
    } catch (error) {
      if (id !== runCounter.current) return null
      if (isAbortError(error)) {
        dispatch({ type: 'slice/clear', key: 'run' })
        return null
      }
      dispatch({ type: 'slice/error', key: 'run', error: message(error) })
      return null
    }
  }, [])

  const fetchDataSources = useCallback(
    async (options: { live: boolean; refresh?: boolean; signal?: AbortSignal }) => {
      const id = ++dataCounter.current
      const current = stateRef.current
      dispatch({ type: 'slice/loading', key: 'dataSources' })
      if (current.mode === 'recorded' && current.recording) {
        dispatch({ type: 'slice/ready', key: 'dataSources', data: current.recording.dataSources, source: 'recorded' })
        return current.recording.dataSources
      }
      try {
        const data = await api.dataSources({ live: options.live, refresh: options.refresh }, { signal: options.signal })
        if (id !== dataCounter.current) return null
        dispatch({ type: 'slice/ready', key: 'dataSources', data, source: 'live' })
        return data
      } catch (error) {
        if (id !== dataCounter.current) return null
        if (isAbortError(error)) {
          dispatch({ type: 'slice/clear', key: 'dataSources' })
          return null
        }
        dispatch({ type: 'slice/error', key: 'dataSources', error: message(error) })
        return null
      }
    },
    [],
  )

  const loadBenchmark = useCallback(async (options: { signal?: AbortSignal } = {}) => {
    const current = stateRef.current
    if (current.benchmark.status === 'ready' && current.benchmark.data) return current.benchmark.data
    dispatch({ type: 'slice/loading', key: 'benchmark' })
    if (current.mode === 'recorded' && current.recording) {
      dispatch({ type: 'slice/ready', key: 'benchmark', data: current.recording.benchmark, source: 'recorded' })
      return current.recording.benchmark
    }
    try {
      const data = await api.benchmark({ signal: options.signal })
      dispatch({ type: 'slice/ready', key: 'benchmark', data, source: 'live' })
      return data
    } catch (error) {
      if (isAbortError(error)) {
        dispatch({ type: 'slice/clear', key: 'benchmark' })
        return null
      }
      dispatch({ type: 'slice/error', key: 'benchmark', error: message(error) })
      return null
    }
  }, [])

  // Model size for the scenario being edited (debounced, live mode only).
  const scenarioKey = JSON.stringify([state.scenario, state.settings.fairness_weight])
  useEffect(() => {
    const current = stateRef.current
    if (!current.scenario) return
    if (current.mode === 'recorded') {
      const rec = current.recording
      const sameWeights = rec?.model.fairness_weight === current.settings.fairness_weight
      if (rec && sameScenario(current.scenario, rec.quantum.scenario) && sameWeights) {
        dispatch({ type: 'slice/ready', key: 'model', data: rec.model, source: 'recorded' })
      } else {
        dispatch({ type: 'slice/error', key: 'model', error: 'Model details need the API for edited scenarios.' })
      }
      return
    }
    if (current.connection.status !== 'online') return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      dispatch({ type: 'slice/loading', key: 'model' })
      try {
        const data = await api.model(
          current.scenario as ScenarioSpec,
          { fairness_weight: current.settings.fairness_weight },
          { signal: controller.signal },
        )
        dispatch({ type: 'slice/ready', key: 'model', data, source: 'live' })
      } catch (error) {
        if (!isAbortError(error)) dispatch({ type: 'slice/error', key: 'model', error: message(error) })
      }
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [scenarioKey, state.mode, state.connection.status])

  useEffect(() => {
    if (autoConnect) void checkConnection()
  }, [autoConnect, checkConnection])

  const actions = useMemo<StoreActions>(
    () => ({
      checkConnection,
      switchToRecording,
      switchToLive,
      selectPreset,
      editScenario,
      updateSettings,
      runSolvers,
      fetchDataSources,
      loadBenchmark,
    }),
    [checkConnection, switchToRecording, switchToLive, selectPreset, editScenario, updateSettings, runSolvers, fetchDataSources, loadBenchmark],
  )

  const value = useMemo(() => ({ state, actions }), [state, actions])
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext)
  if (!value) throw new Error('useStore must be used inside <StoreProvider>')
  return value
}

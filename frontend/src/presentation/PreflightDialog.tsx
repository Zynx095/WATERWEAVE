/*
 * Checks to run before presenting: the API, a real solver run (greedy, exact
 * and QAOA on the default scenario), live weather (optional) and the recorded
 * fallback. Each check says whether it is required, optional or only the
 * fallback, and the start buttons follow from the results.
 */
import { CircleAlert, CircleCheck, CircleDashed, ExternalLink, LoaderCircle, RotateCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { loadRecording } from '../data/recorded'
import { formatDateTime, formatNumber, formatSeconds } from '../lib/format'
import { DEFAULT_SETTINGS, useStore } from '../state/store'
import { PACES, totalDuration } from './machine'
import { MACHINE_CONFIG, usePresentation } from './PresentationProvider'

type CheckStatus = 'waiting' | 'running' | 'pass' | 'fail'
type CheckId = 'app' | 'api' | 'solvers' | 'weather' | 'recording'

interface Check {
  id: CheckId
  label: string
  need: 'Required' | 'Optional' | 'Fallback'
  status: CheckStatus
  detail: string
}

const INITIAL: Check[] = [
  { id: 'app', label: 'App loaded', need: 'Required', status: 'pass', detail: 'This window is running the frontend.' },
  { id: 'api', label: 'API reachable', need: 'Required', status: 'waiting', detail: '' },
  { id: 'solvers', label: 'Solvers ready', need: 'Required', status: 'waiting', detail: '' },
  { id: 'weather', label: 'Live weather', need: 'Optional', status: 'waiting', detail: '' },
  { id: 'recording', label: 'Recorded fallback', need: 'Fallback', status: 'waiting', detail: '' },
]

const PACE_LABELS: Record<number, string> = {
  0.2: 'Quick check',
  0.75: 'Brisk',
  1: 'Standard',
  1.25: 'Relaxed',
  1.5: 'Slow',
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

const ICONS: Record<CheckStatus, typeof CircleCheck> = {
  waiting: CircleDashed,
  running: LoaderCircle,
  pass: CircleCheck,
  fail: CircleAlert,
}

const STATUS_TEXT: Record<CheckStatus, string> = {
  waiting: 'Waiting',
  running: 'Checking',
  pass: 'Passed',
  fail: 'Failed',
}

export function PreflightDialog() {
  const { state: store, actions } = useStore()
  const { state, dispatch, preflightOpen, closePreflight, setLiveData } = usePresentation()
  const dialog = useRef<HTMLDialogElement>(null)
  const [checks, setChecks] = useState<Check[]>(INITIAL)
  const [running, setRunning] = useState(false)
  const run = useRef(0)

  const update = (id: CheckId, patch: Partial<Check>) =>
    setChecks((current) => current.map((c) => (c.id === id ? { ...c, ...patch } : c)))

  const runChecks = useCallback(async () => {
    const id = ++run.current
    const live = () => id === run.current
    setRunning(true)
    setChecks(INITIAL.map((c) => (c.id === 'app' ? c : { ...c, status: 'running', detail: 'Checking.' })))

    const recording = loadRecording()
      .then((rec) => {
        if (live())
          update('recording', {
            status: 'pass',
            detail: `Recorded run from ${formatDateTime(rec.provenance.capturedAt)} is bundled with the app.`,
          })
      })
      .catch((error: unknown) => live() && update('recording', { status: 'fail', detail: message(error) }))

    try {
      const health = await api.health()
      if (!live()) return
      update('api', {
        status: 'pass',
        detail: `Python ${health.engine.python}, Qiskit ${health.engine.qiskit}${health.offline_mode ? ', offline mode' : ''}.`,
      })
    } catch (error) {
      if (!live()) return
      update('api', { status: 'fail', detail: message(error) })
      update('solvers', { status: 'fail', detail: 'Needs the API.' })
      update('weather', { status: 'fail', detail: 'Needs the API. The data step will use the recorded offline view.' })
      setLiveData(false)
      await recording
      setRunning(false)
      return
    }

    const solveCheck = (async () => {
      try {
        const presets = store.presets.data ?? (await api.presets())
        const scenario = presets.find((p) => p.id === 'default')?.scenario
        if (!scenario) throw new Error('The API has no default scenario.')
        const started = performance.now()
        const result = await api.solve(scenario, { ...DEFAULT_SETTINGS })
        const seconds = (performance.now() - started) / 1000
        const failed = result.results.filter((r) => r.status !== 'ok')
        if (!live()) return
        if (failed.length) {
          update('solvers', { status: 'fail', detail: failed.map((r) => `${r.solver_name}: ${r.error}`).join(' ') })
        } else {
          const q = result.results.find((r) => r.key === 'qaoa')
          update('solvers', {
            status: 'pass',
            detail: `Greedy, exact and QAOA ran in ${formatSeconds(seconds)} (QAOA: ${String(q?.metadata.num_qubits)} qubits, score ${formatNumber(q?.objective_value)}).`,
          })
        }
      } catch (error) {
        if (live()) update('solvers', { status: 'fail', detail: message(error) })
      }
    })()

    const weatherCheck = (async () => {
      try {
        const data = await api.dataSources({ live: true, refresh: true })
        if (!live()) return
        const rain = data.observations.find((o) => o.variable === 'rainfall_mm')
        if (data.offline_mode) {
          update('weather', { status: 'fail', detail: 'The API runs in offline mode; the data step shows the offline view.' })
          setLiveData(false)
        } else if (!rain || rain.quality.missing) {
          update('weather', {
            status: 'fail',
            detail: `${rain?.quality.error_details ?? 'No rainfall observation.'} The data step will show this honestly.`,
          })
          setLiveData(false)
        } else {
          update('weather', {
            status: 'pass',
            detail: `Open-Meteo answered: ${formatNumber(rain.value, 1)} mm, observed ${formatDateTime(rain.source_timestamp)}.`,
          })
          setLiveData(true)
        }
      } catch (error) {
        if (!live()) return
        update('weather', { status: 'fail', detail: `${message(error)} The data step will use the offline view.` })
        setLiveData(false)
      }
    })()

    await Promise.all([solveCheck, weatherCheck, recording])
    if (live()) setRunning(false)
  }, [store.presets.data, setLiveData])

  // Open and close the native dialog with the provider's flag.
  useEffect(() => {
    const el = dialog.current
    if (!el) return
    if (preflightOpen && !el.open) {
      el.showModal()
      void runChecks()
    } else if (!preflightOpen && el.open) {
      el.close()
    }
  }, [preflightOpen, runChecks])

  const status = (id: CheckId) => checks.find((c) => c.id === id)!.status
  const liveReady = status('api') === 'pass' && status('solvers') === 'pass'
  const recordedReady = status('recording') === 'pass'

  const startLive = async () => {
    if (store.mode === 'recorded') await actions.switchToLive()
    closePreflight()
    dispatch({ type: 'START' })
  }

  const startRecorded = async () => {
    await actions.switchToRecording()
    setLiveData(false)
    closePreflight()
    dispatch({ type: 'START' })
  }

  return (
    <dialog
      ref={dialog}
      className="preflight"
      aria-labelledby="preflight-title"
      onClose={closePreflight}
      onCancel={closePreflight}
    >
      <h2 id="preflight-title">Before you present</h2>
      <p className="preflight__lede">
        These checks run the real engine once, so nothing surprises you on stage. Live weather is optional; the
        recorded run is only needed if the API is down.
      </p>

      <ul className="preflight__checks">
        {checks.map((c) => {
          const Icon = ICONS[c.status]
          return (
            <li key={c.id} data-status={c.status}>
              <Icon aria-hidden size={20} className={c.status === 'running' ? 'spin' : undefined} />
              <div>
                <p className="preflight__check">
                  <strong>{c.label}</strong> <span className="preflight__need">{c.need}</span>{' '}
                  <span className="preflight__result">{STATUS_TEXT[c.status]}</span>
                </p>
                {c.detail && <p className="preflight__detail">{c.detail}</p>}
              </div>
            </li>
          )
        })}
      </ul>

      <div className="preflight__options">
        <div className="field">
          <label htmlFor="pace" className="field__label">
            Pace
          </label>
          <select
            id="pace"
            className="select"
            value={state.pace}
            onChange={(e) => dispatch({ type: 'SET_PACE', pace: Number(e.target.value) })}
          >
            {PACES.map((p) => (
              <option key={p} value={p}>
                {PACE_LABELS[p]}, about {Math.max(1, Math.round(totalDuration(MACHINE_CONFIG, p) / 60000))} min
              </option>
            ))}
          </select>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={state.auto}
            onChange={(e) => dispatch({ type: 'SET_AUTO', auto: e.target.checked })}
          />
          Advance automatically
        </label>
        <button
          type="button"
          className="button button--quiet"
          onClick={() => window.open('/presenter', 'waterweave-presenter', 'popup,width=960,height=760')}
        >
          <ExternalLink aria-hidden size={16} /> Open presenter view
        </button>
      </div>

      <div className="preflight__actions">
        <button type="button" className="button button--primary button--large" disabled={!liveReady} onClick={() => void startLive()}>
          Start with the live engine
        </button>
        <button type="button" className="button button--large" disabled={!recordedReady} onClick={() => void startRecorded()}>
          Start with the recorded run
        </button>
        <button type="button" className="button button--quiet" disabled={running} onClick={() => void runChecks()}>
          <RotateCw aria-hidden size={16} /> Check again
        </button>
        <button type="button" className="button button--quiet" onClick={closePreflight}>
          Cancel
        </button>
      </div>
    </dialog>
  )
}

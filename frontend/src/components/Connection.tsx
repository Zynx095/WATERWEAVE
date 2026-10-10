import { CircleAlert, CircleCheck, History, LoaderCircle, RotateCw } from 'lucide-react'
import { useState } from 'react'
import { formatDateTime } from '../lib/format'
import { useStore } from '../state/store'

/** Compact engine status shown in the header. */
export function ConnectionPill() {
  const { state } = useStore()
  if (state.mode === 'recorded') {
    return (
      <span className="pill pill--recorded" title="Results come from a recorded run, not a fresh execution">
        <History aria-hidden size={16} /> Recorded run
      </span>
    )
  }
  const { status, health } = state.connection
  if (status === 'checking') {
    return (
      <span className="pill pill--neutral">
        <LoaderCircle aria-hidden size={16} className="spin" /> Connecting
      </span>
    )
  }
  if (status === 'online') {
    return (
      <span
        className="pill pill--live"
        title={`Python ${health?.engine.python ?? '?'}, Qiskit ${health?.engine.qiskit ?? '?'}`}
      >
        <CircleCheck aria-hidden size={16} /> Engine connected
      </span>
    )
  }
  return (
    <span className="pill pill--error">
      <CircleAlert aria-hidden size={16} /> API offline
    </span>
  )
}

/** Explains what works when the API is down, and labels the recorded mode. */
export function ConnectionBanner() {
  const { state, actions } = useStore()
  const [busy, setBusy] = useState(false)

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  if (state.mode === 'recorded' && state.recording) {
    const p = state.recording.provenance
    return (
      <div className="banner banner--recorded" role="status">
        <div className="banner__inner">
          <History aria-hidden size={20} className="banner__icon" />
          <p>
            <strong>Recorded run.</strong> Results on screen were captured from the real engine on{' '}
            {formatDateTime(p.capturedAt)} (commit <code>{p.gitCommit.slice(0, 7)}</code>, Qiskit{' '}
            {p.engine.qiskit}). Nothing is being executed now.
          </p>
          <button type="button" className="button button--quiet" disabled={busy} onClick={() => act(actions.switchToLive)}>
            <RotateCw aria-hidden size={16} /> Use the live engine
          </button>
        </div>
      </div>
    )
  }

  if (state.connection.status !== 'offline') return null

  return (
    <div className="banner banner--error" role="alert">
      <div className="banner__inner">
        <CircleAlert aria-hidden size={20} className="banner__icon" />
        <p>
          <strong>The WATERWEAVE API is not reachable,</strong> so the solvers cannot run. Start it with{' '}
          <code>python -m waterweave.api</code> and retry, or look at a recorded run of the real engine.
        </p>
        <div className="banner__actions">
          <button type="button" className="button" disabled={busy} onClick={() => act(actions.checkConnection)}>
            <RotateCw aria-hidden size={16} /> Retry
          </button>
          <button
            type="button"
            className="button button--quiet"
            disabled={busy}
            onClick={() => act(actions.switchToRecording)}
          >
            <History aria-hidden size={16} /> Show recorded run
          </button>
        </div>
      </div>
    </div>
  )
}

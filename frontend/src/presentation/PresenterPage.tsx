/*
 * Presenter view for a second screen. It mirrors the audience window over a
 * BroadcastChannel and sends it commands; it runs nothing itself.
 */
import { ExternalLink, Pause, Play, RotateCcw, SkipBack, SkipForward, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { WeaveMark } from '../components/Wordmark'
import { usePageTitle } from '../hooks/usePageTitle'
import { CHANNEL_NAME, parseAudienceMessage, type PresenterMessage, type PresenterSnapshot } from './channel'
import type { PresentationEvent } from './machine'
import { formatClock } from './PresentationBar'

const STALE_MS = 3500

export function PresenterPage() {
  usePageTitle('Presenter view')
  const [snapshot, setSnapshot] = useState<PresenterSnapshot | null>(null)
  const [lastSeen, setLastSeen] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const channel = useRef<BroadcastChannel | null>(null)
  const supported = typeof BroadcastChannel !== 'undefined'

  useEffect(() => {
    if (!supported) return
    const ch = new BroadcastChannel(CHANNEL_NAME)
    channel.current = ch
    ch.onmessage = (event: MessageEvent) => {
      const message = parseAudienceMessage(event.data)
      if (!message) return
      setSnapshot(message.snapshot)
      setLastSeen(Date.now())
    }
    ch.postMessage({ kind: 'hello' } satisfies PresenterMessage)
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    // Lets the main window know a presenter view is open (it then keeps notes off the projector).
    const heartbeat = window.setInterval(() => ch.postMessage({ kind: 'hello' } satisfies PresenterMessage), 2000)
    return () => {
      window.clearInterval(id)
      window.clearInterval(heartbeat)
      ch.close()
      channel.current = null
    }
  }, [supported])

  const send = (event: PresentationEvent) =>
    channel.current?.postMessage({ kind: 'command', event } satisfies PresenterMessage)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return
      const map: Record<string, PresentationEvent> = {
        ' ': { type: 'TOGGLE' },
        ArrowRight: { type: 'NEXT' },
        PageDown: { type: 'NEXT' },
        ArrowLeft: { type: 'PREV' },
        PageUp: { type: 'PREV' },
        Home: { type: 'RESTART' },
      }
      const event = map[e.key]
      if (!event) return
      e.preventDefault()
      channel.current?.postMessage({ kind: 'command', event } satisfies PresenterMessage)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const connected = snapshot !== null && now - lastSeen < STALE_MS
  const s = snapshot?.state
  const step = s && snapshot ? snapshot.steps[s.index] : null
  const playing = s?.status === 'running'

  return (
    <div className="presenter">
      <header className="presenter__head">
        <WeaveMark size={32} />
        <h1>Presenter view</h1>
        <p className={connected ? 'pill pill--live' : 'pill pill--error'} role="status">
          {!supported
            ? 'This browser cannot link windows'
            : connected
              ? `Linked to the main window${snapshot?.mode === 'recorded' ? ', recorded run' : ''}`
              : 'Waiting for the main window'}
        </p>
      </header>

      {!connected || !s || !snapshot ? (
        <section className="presenter__waiting">
          <p className="lede">
            Open WATERWEAVE in another window of this browser and press <strong>Present</strong> there. This view
            follows it and controls it.
          </p>
          <button
            type="button"
            className="button button--primary button--large"
            onClick={() => window.open('/', 'waterweave-audience')}
          >
            <ExternalLink aria-hidden size={18} /> Open the main window
          </button>
        </section>
      ) : s.status === 'idle' ? (
        <section className="presenter__waiting">
          <p className="lede">The main window is open but not presenting. Start from its Present button, or here.</p>
          <button type="button" className="button button--primary button--large" onClick={() => send({ type: 'START' })}>
            <Play aria-hidden size={18} /> Start without preflight
          </button>
        </section>
      ) : (
        <main className="presenter__main">
          <div className="presenter__now">
            <p className="presenter__count">
              Step {s.index + 1} of {snapshot.steps.length}
              {s.status === 'finished' ? ', finished' : ''}
            </p>
            <h2>{step?.title}</h2>
            <p className="presenter__state">
              <strong>
                {s.status === 'finished'
                  ? 'Finished'
                  : s.action.status === 'pending'
                    ? 'Waiting for the engine'
                    : playing
                      ? s.auto
                        ? 'Playing'
                        : 'Manual'
                      : 'Paused'}
              </strong>
              {s.auto && s.status !== 'finished' && (
                <span className="num">
                  {formatClock(snapshot.remaining.stepMs)} left in this step, {formatClock(snapshot.remaining.totalMs)}{' '}
                  in total
                </span>
              )}
            </p>
            {s.action.status === 'pending' && snapshot.actionLabel && <p className="presenter__action">{snapshot.actionLabel}</p>}
            {s.action.status === 'failed' && (
              <p className="presenter__action presenter__action--failed" role="alert">
                {s.action.error}
              </p>
            )}
          </div>

          <div className="presenter__controls">
            <button type="button" className="button button--large" onClick={() => send({ type: 'PREV' })} disabled={s.index === 0}>
              <SkipBack aria-hidden size={20} /> Previous
            </button>
            {s.status === 'finished' ? (
              <button type="button" className="button button--primary button--large" onClick={() => send({ type: 'RESTART' })}>
                <RotateCcw aria-hidden size={20} /> Restart
              </button>
            ) : (
              <button type="button" className="button button--primary button--large presenter__toggle" onClick={() => send({ type: 'TOGGLE' })}>
                {playing ? <Pause aria-hidden size={20} /> : <Play aria-hidden size={20} />}
                {playing ? 'Pause' : 'Resume'}
              </button>
            )}
            <button
              type="button"
              className="button button--large"
              onClick={() => send({ type: 'NEXT' })}
              disabled={s.status === 'finished'}
            >
              Next <SkipForward aria-hidden size={20} />
            </button>
            <button type="button" className="button button--quiet" onClick={() => send({ type: 'RESTART' })}>
              <RotateCcw aria-hidden size={16} /> Restart
            </button>
            <button type="button" className="button button--quiet" onClick={() => send({ type: 'EXIT' })}>
              <X aria-hidden size={16} /> Exit presentation
            </button>
          </div>

          <section className="presenter__notes" aria-labelledby="notes-title">
            <h3 id="notes-title">Say</h3>
            <ul>
              {snapshot.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <h3>The audience reads</h3>
            <p className="presenter__caption">{snapshot.caption}</p>
          </section>

          <section className="presenter__next" aria-labelledby="next-title">
            <h3 id="next-title">Next</h3>
            {snapshot.next ? (
              <>
                <p className="presenter__next-title">{snapshot.next.title}</p>
                <p>{snapshot.next.caption}</p>
              </>
            ) : (
              <p>This is the last step.</p>
            )}
          </section>

          <nav aria-label="All steps" className="presenter__steps">
            <ol>
              {snapshot.steps.map((st, i) => (
                <li key={st.id}>
                  <button
                    type="button"
                    aria-current={i === s.index ? 'step' : undefined}
                    onClick={() => send({ type: 'GOTO', index: i })}
                  >
                    {i + 1}. {st.title}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        </main>
      )}
    </div>
  )
}

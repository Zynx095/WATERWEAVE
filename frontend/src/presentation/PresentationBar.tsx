import {
  CircleAlert,
  Eye,
  EyeOff,
  LoaderCircle,
  NotebookText,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  X,
} from 'lucide-react'
import { remaining, stepDuration } from './machine'
import { MACHINE_CONFIG, usePresentation } from './PresentationProvider'
import { STEPS } from './steps'

export function formatClock(ms: number) {
  const s = Math.ceil(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Audience-facing caption and controls, fixed to the bottom of the window. */
export function PresentationBar() {
  const { state, dispatch, context, notesOpen, setNotesOpen, cleanView, setCleanView } = usePresentation()
  if (state.status === 'idle') return null

  const step = STEPS[state.index]
  const next = STEPS[state.index + 1]
  const { stepMs, totalMs } = remaining(MACHINE_CONFIG, state)
  const duration = stepDuration(MACHINE_CONFIG, state)
  const playing = state.status === 'running'
  const pending = state.action.status === 'pending'
  const statusText =
    state.status === 'finished'
      ? 'Finished'
      : pending
        ? 'Waiting for the engine'
        : !state.auto
          ? 'Manual'
          : playing
            ? 'Playing'
            : 'Paused'

  return (
    <section className="present-bar" data-clean={cleanView || undefined} aria-label="Presentation controls">
      {notesOpen && !cleanView && (
        <div className="present-notes" id="presenter-notes">
          <h2 className="present-notes__title">Presenter notes</h2>
          <ul>
            {step.notes(context).map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
          <p className="present-notes__next">{next ? `Next: ${next.title}` : 'This is the last step.'}</p>
        </div>
      )}

      <div className="present-bar__inner">
        <p className="present-bar__caption" aria-live="polite">
          {state.status === 'finished' ? 'End of the guided presentation. Restart, or exit to explore freely.' : step.caption(context)}
        </p>

        {(pending || state.action.status === 'failed') && (
          <p className={pending ? 'present-bar__action' : 'present-bar__action present-bar__action--failed'} role={pending ? 'status' : 'alert'}>
            {pending ? (
              <>
                <LoaderCircle aria-hidden size={16} className="spin" /> {step.actionLabel}
              </>
            ) : (
              <>
                <CircleAlert aria-hidden size={16} /> {state.action.error}
                <button
                  type="button"
                  className="present-bar__retry"
                  onClick={() => dispatch({ type: 'GOTO', index: state.index })}
                >
                  Retry
                </button>
              </>
            )}
          </p>
        )}

        <div className="present-bar__row">
          <ol className="present-progress" aria-label={`Step ${state.index + 1} of ${STEPS.length}`}>
            {STEPS.map((s, i) => (
              <li key={s.id} data-state={i < state.index ? 'done' : i === state.index ? 'current' : 'todo'}>
                <button
                  type="button"
                  className="present-progress__segment"
                  aria-label={`Go to step ${i + 1}: ${s.title}`}
                  aria-current={i === state.index ? 'step' : undefined}
                  onClick={() => dispatch({ type: 'GOTO', index: i })}
                >
                  <span
                    className="present-progress__fill"
                    style={
                      i === state.index
                        ? { width: `${state.status === 'finished' ? 100 : Math.min(100, (state.elapsedMs / duration) * 100)}%` }
                        : undefined
                    }
                  />
                </button>
              </li>
            ))}
          </ol>

          <p className="present-bar__where">
            <span className="present-bar__count">
              Step {state.index + 1} of {STEPS.length}
            </span>{' '}
            <span className="present-bar__title">{step.title}</span>
          </p>

          <p className="present-bar__status">
            <span className="present-bar__state">{statusText}</span>
            {state.auto && state.status !== 'finished' && (
              <span className="present-bar__time num">
                {formatClock(stepMs)} left, {formatClock(totalMs)} total
              </span>
            )}
          </p>

          {cleanView ? (
            <button
              type="button"
              className="present-btn present-btn--quiet"
              aria-label="Show controls"
              title="Show controls (H)"
              onClick={() => setCleanView(false)}
            >
              <Eye aria-hidden size={18} />
            </button>
          ) : (
            <div className="present-bar__controls">
              <button
                type="button"
                className="present-btn"
                aria-label="Previous step"
                title="Previous step (Left arrow)"
                disabled={state.index === 0}
                onClick={() => dispatch({ type: 'PREV' })}
              >
                <SkipBack aria-hidden size={20} />
              </button>
              {state.status === 'finished' ? (
                <button type="button" className="present-btn present-btn--main" onClick={() => dispatch({ type: 'RESTART' })}>
                  <RotateCcw aria-hidden size={20} /> Restart
                </button>
              ) : (
                <button
                  type="button"
                  className="present-btn present-btn--main"
                  aria-label={playing ? 'Pause' : 'Resume'}
                  title={playing ? 'Pause (Space)' : 'Resume (Space)'}
                  onClick={() => dispatch({ type: 'TOGGLE' })}
                >
                  {playing ? <Pause aria-hidden size={20} /> : <Play aria-hidden size={20} />}
                  {playing ? 'Pause' : 'Resume'}
                </button>
              )}
              <button
                type="button"
                className="present-btn"
                aria-label="Next step"
                title="Next step (Right arrow)"
                disabled={state.status === 'finished'}
                onClick={() => dispatch({ type: 'NEXT' })}
              >
                <SkipForward aria-hidden size={20} />
              </button>
              <button
                type="button"
                className="present-btn"
                aria-label="Restart from the beginning"
                title="Restart (Home)"
                onClick={() => dispatch({ type: 'RESTART' })}
              >
                <RotateCcw aria-hidden size={20} />
              </button>
              <button
                type="button"
                className="present-btn"
                aria-expanded={notesOpen}
                aria-controls="presenter-notes"
                aria-label="Presenter notes"
                title="Presenter notes (N)"
                onClick={() => setNotesOpen(!notesOpen)}
              >
                <NotebookText aria-hidden size={20} />
              </button>
              <button
                type="button"
                className="present-btn"
                aria-label="Clean audience view"
                title="Hide navigation and controls (H)"
                onClick={() => setCleanView(true)}
              >
                <EyeOff aria-hidden size={20} />
              </button>
              <button
                type="button"
                className="present-btn present-btn--exit"
                aria-label="Exit presentation"
                title="Exit (Esc)"
                onClick={() => dispatch({ type: 'EXIT' })}
              >
                <X aria-hidden size={20} /> Exit
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

import { CircleAlert, History, LoaderCircle, Play, RotateCcw, Square } from 'lucide-react'
import { useRef } from 'react'
import type { SolveResponse, SolveSettings, SolverOutcome } from '../api/types'
import { ProvenanceTag } from '../components/ProvenanceTag'
import { ScenarioEditor } from '../components/ScenarioEditor'
import { ServiceChart } from '../components/ServiceChart'
import { SettingsForm } from '../components/SettingsForm'
import { SolverPanel } from '../components/SolverPanel'
import { usePageTitle } from '../hooks/usePageTitle'
import { canonical } from '../lib/canonical'
import { capitalise, formatDateTime, formatNumber, formatSeconds, formatTime } from '../lib/format'
import { scenarioFacts } from '../lib/scenario'
import { SOLVER_ORDER } from '../lib/solvers'
import { useStore } from '../state/store'

const SETTING_KEYS: (keyof SolveSettings)[] = ['include_qaoa', 'fairness_weight', 'p', 'shots', 'seed', 'maxiter']

export function isStale(run: SolveResponse, scenario: unknown, settings: SolveSettings): boolean {
  if (canonical(run.scenario) !== canonical(scenario)) return true
  return SETTING_KEYS.some((k) => {
    if (!run.settings.include_qaoa && !settings.include_qaoa && ['p', 'shots', 'seed', 'maxiter'].includes(k)) {
      return false
    }
    return run.settings[k as keyof typeof run.settings] !== settings[k]
  })
}

function ConstraintNotes() {
  const { state } = useStore()
  if (!state.scenario) return null
  const facts = scenarioFacts(state.scenario)
  return (
    <aside className="constraints" aria-labelledby="constraints-title" data-present-id="constraints">
      <h3 id="constraints-title">Rules every plan must follow</h3>
      <ul>
        <li>
          <strong>Supply per slot.</strong>{' '}
          {state.scenario.slots
            .map((slot) => {
              const requested = state.scenario!.neighborhoods.reduce((s, n) => s + (n.demand_by_slot[slot] ?? 0), 0)
              const supply = state.scenario!.supply_by_slot[slot] ?? 0
              return `${capitalise(slot)}: ${requested} requested, ${supply} available.`
            })
            .join(' ')}
        </li>
        <li>
          <strong>Storage per neighborhood.</strong>{' '}
          {facts.storageLimited.length
            ? facts.storageLimited
                .map((n) => `${n.name} asked for ${n.requested} but can store only ${n.storage}.`)
                .join(' ')
            : 'No neighborhood asked for more than it can store.'}
        </li>
        <li>
          <strong>One unit per request.</strong> Each request is a yes-or-no decision: {facts.requests} decisions,{' '}
          {facts.plans.toLocaleString('en-GB')} possible plans.
        </li>
      </ul>
      <p className="field__hint">
        Greedy and exact search only accept plans that follow these rules. QAOA also meets plans that break them,
        priced with a large penalty so that they score badly.
      </p>
    </aside>
  )
}

function RunStatus({ settings }: { settings: SolveSettings }) {
  const { state } = useStore()
  const { run } = state
  if (run.status === 'loading') {
    return (
      <p className="loading-line">
        <LoaderCircle aria-hidden size={18} className="spin" />
        {run.label ??
          (settings.include_qaoa
            ? 'Running greedy, exact search and QAOA. The quantum simulation takes about a second.'
            : 'Running greedy and exact search.')}
      </p>
    )
  }
  if (run.status === 'error') {
    return (
      <p className="run-error">
        <CircleAlert aria-hidden size={18} /> {run.error}
      </p>
    )
  }
  if (run.status === 'ready' && run.data) {
    return run.source === 'recorded' ? (
      <p>
        <History aria-hidden size={16} className="inline-icon" /> Showing the recorded run captured{' '}
        {formatDateTime(state.recording?.provenance.capturedAt)}. It was not executed now.
      </p>
    ) : (
      <p>
        Ran at {formatTime(run.data.executed_at)}; all solvers together took {formatSeconds(run.data.wall_seconds)}.
      </p>
    )
  }
  return <p>Not run yet. Results appear below.</p>
}

function ScoreBreakdown({ outcome, alpha }: { outcome: SolverOutcome; alpha: number }) {
  const m = outcome.metrics
  if (!m || outcome.objective_value === null) return null
  const sum = m.weighted_shortage + alpha * m.disparity
  // Only feasible plans have no penalty term; show the sum only when it reproduces the engine's score.
  if (!outcome.feasible || Math.abs(sum - outcome.objective_value) > 1e-9) return null
  return (
    <span className="breakdown num">
      {formatNumber(m.weighted_shortage)} shortage + {formatNumber(alpha)} × {formatNumber(m.disparity)} unevenness ={' '}
      <strong>{formatNumber(outcome.objective_value)}</strong>
    </span>
  )
}

export function WorkspacePage() {
  usePageTitle('Workspace')
  const { state, actions } = useStore()
  const controller = useRef<AbortController | null>(null)
  const { scenario, settings, run } = state
  const running = run.status === 'loading'
  const preset = state.presets.data?.find((p) => p.id === state.presetId) ?? null
  const result = run.status === 'ready' ? run.data : null
  const stale = result && scenario ? isStale(result, scenario, settings) : false

  const onRun = () => {
    controller.current?.abort()
    controller.current = new AbortController()
    void actions.runSolvers({ signal: controller.current.signal })
  }

  const ordered = result
    ? SOLVER_ORDER.map((key) => result.results.find((r) => r.key === key)).filter(
        (r): r is SolverOutcome => r !== undefined,
      )
    : []
  const exact = ordered.find((r) => r.key === 'exact')

  return (
    <>
      <header className="page-head">
        <h1>Workspace</h1>
        <p className="lede">
          Set up a day of requests, choose how plans are scored, and run the three solvers. Every number on this page
          comes from the WATERWEAVE engine.
        </p>
      </header>

      <section className="section ws-section" aria-labelledby="scenario-title" data-present-id="scenario">
        <h2 id="scenario-title">Requests and limits</h2>
        {!scenario ? (
          <p className="loading-line">
            {state.connection.status === 'offline'
              ? 'The scenario comes from the API, which is not reachable.'
              : 'Loading the scenario.'}
          </p>
        ) : (
          <div className="ws-scenario">
            <div className="ws-scenario__main">
              <div className="ws-preset">
                <div className="field">
                  <label htmlFor="preset" className="field__label">
                    Start from
                  </label>
                  <select
                    id="preset"
                    className="select"
                    value={state.presetId ?? ''}
                    disabled={running}
                    onChange={(e) => actions.selectPreset(e.target.value)}
                  >
                    {state.presets.data?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="ws-preset__meta">
                  {preset && <ProvenanceTag kind={preset.provenance} />}
                  {state.scenarioEdited && preset && (
                    <>
                      <span className="tag tag--synthetic">Edited</span>
                      <button
                        type="button"
                        className="button button--quiet"
                        disabled={running}
                        onClick={() => actions.selectPreset(preset.id)}
                      >
                        <RotateCcw aria-hidden size={16} /> Reset to {preset.label}
                      </button>
                    </>
                  )}
                </div>
                {preset && <p className="field__hint">{preset.summary}</p>}
              </div>
              <p className="field__hint">
                Select a crossing to add or remove a request. Each request is one unit of water in one slot.
              </p>
              <ScenarioEditor scenario={scenario} onChange={actions.editScenario} disabled={running} />
            </div>
            <ConstraintNotes />
          </div>
        )}
      </section>

      <section className="section ws-section" aria-labelledby="settings-title" data-present-id="settings">
        <h2 id="settings-title">Scoring and solvers</h2>
        <SettingsForm settings={settings} onChange={actions.updateSettings} model={state.model} disabled={running} />
        <div className="run-bar">
          <button
            type="button"
            className="button button--primary button--large"
            onClick={onRun}
            disabled={!scenario || running}
          >
            {running ? <LoaderCircle aria-hidden size={18} className="spin" /> : <Play aria-hidden size={18} />}
            {running ? 'Running' : settings.include_qaoa ? 'Run greedy, exact and QAOA' : 'Run greedy and exact'}
          </button>
          {running && (
            <button type="button" className="button button--quiet" onClick={() => controller.current?.abort()}>
              <Square aria-hidden size={16} /> Cancel
            </button>
          )}
          <div className="run-bar__status" role="status" aria-live="polite">
            <RunStatus settings={settings} />
          </div>
        </div>
      </section>

      <section className="section ws-section" aria-labelledby="results-title">
        <h2 id="results-title">Results</h2>
        {!result ? (
          <p className="section-intro">Run the solvers to see their plans here, side by side.</p>
        ) : (
          <>
            {stale && (
              <p className="notice notice--info">
                <CircleAlert aria-hidden size={18} /> The scenario or settings changed after this run. Run again to
                update the results.
              </p>
            )}
            <p className="section-intro">
              Same {result.scenario.neighborhoods.length} neighborhoods, same rules, same scoring (fairness weight{' '}
              {result.settings.fairness_weight}, penalty {result.settings.penalty_weight}). Lower scores are better.
            </p>
            <div className="solvers" data-present-id="results">
              {ordered.map((outcome) => (
                <SolverPanel
                  key={outcome.key}
                  outcome={outcome}
                  scenario={result.scenario}
                  source={result.source}
                  runId={result.run_id}
                />
              ))}
            </div>
            {!result.settings.include_qaoa && (
              <p className="field__hint">QAOA was not included in this run.</p>
            )}
          </>
        )}
      </section>

      {result && (
        <section className="section ws-section" aria-labelledby="fairness-title" data-present-id="fairness">
          <h2 id="fairness-title">Who was served</h2>
          <p className="section-intro">
            Each bar is the share of a neighborhood's requests that a plan met. The fairness score is 1 minus the gap
            between the best- and worst-served neighborhood, so 1 means everyone got the same share.
          </p>
          <ServiceChart scenario={result.scenario} results={ordered} reference={result.reference.deliver_nothing} />
          <details className="explain">
            <summary>How the score is built</summary>
            <p>
              <strong>In plain words:</strong> every unmet request costs its neighborhood's priority weight, and uneven
              service between neighborhoods costs extra, scaled by the fairness weight. Breaking a supply or storage
              rule costs a large penalty.
            </p>
            {exact && (
              <p>
                <strong>For the exact plan in this run:</strong> <ScoreBreakdown outcome={exact} alpha={result.settings.fairness_weight} />
              </p>
            )}
            <p>
              <strong>Technically:</strong> F(x) = Σ<sub>i</sub> w<sub>i</sub>·unmet<sub>i</sub> + α·Σ<sub>i&lt;j</sub>(s
              <sub>i</sub> − s<sub>j</sub>)² + P·(supply and storage violations)², where s<sub>i</sub> is
              neighborhood i's share. The solvers minimise the squared differences; the fairness score reported above
              uses the range instead. The two usually agree but are not the same measure (docs/VALIDATION.md, section
              2.1).
            </p>
          </details>
        </section>
      )}
    </>
  )
}

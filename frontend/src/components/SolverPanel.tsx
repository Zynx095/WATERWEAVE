import { CircleAlert, CircleCheck, CircleSlash, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'
import type { QaoaMetadata, RunSource, ScenarioSpec, SolverOutcome } from '../api/types'
import { formatNumber, formatPercent, formatSeconds } from '../lib/format'
import { SOLVERS } from '../lib/solvers'
import { ProvenanceTag } from './ProvenanceTag'
import { Weave } from './Weave'

function RulesLine({ outcome }: { outcome: SolverOutcome }) {
  const m = outcome.metrics!
  if (outcome.feasible) {
    return (
      <span className="rules rules--ok">
        <CircleCheck aria-hidden size={16} /> All rules met
      </span>
    )
  }
  const broken = [
    m.supply_violation_units > 0 && `supply exceeded by ${m.supply_violation_units}`,
    m.storage_violation_units > 0 && `storage exceeded by ${m.storage_violation_units}`,
    m.demand_violation_units > 0 && `${m.demand_violation_units} unrequested`,
    m.invalid_entries > 0 && `${m.invalid_entries} invalid entries`,
  ].filter(Boolean)
  return (
    <span className="rules rules--broken">
      <TriangleAlert aria-hidden size={16} /> Breaks a rule: {broken.join(', ')}
    </span>
  )
}

function GapLine({ outcome }: { outcome: SolverOutcome }) {
  if (outcome.key === 'exact') {
    return <p className="gap gap--best">Best possible score for this scoring (checked every plan).</p>
  }
  if (outcome.gap_to_exact === null) return null
  if (Math.abs(outcome.gap_to_exact) < 1e-9) {
    return <p className="gap gap--best">Same score as exact search.</p>
  }
  return (
    <p className="gap gap--worse">
      <span className="num">{formatNumber(outcome.gap_to_exact)}</span> worse than exact search.
    </p>
  )
}

function QaoaFacts({ outcome }: { outcome: SolverOutcome }) {
  const md = outcome.metadata as unknown as QaoaMetadata
  return (
    <ul className="qaoa-facts">
      <li>
        <span className="num">{md.num_qubits}</span> simulated qubits, circuit depth{' '}
        <span className="num">{md.circuit_depth}</span>, {md.layers_p} {md.layers_p === 1 ? 'layer' : 'layers'}
      </li>
      <li>
        <span className="num">{md.shots.toLocaleString('en-GB')}</span> samples,{' '}
        <span className="num">{formatPercent(md.feasible_samples_ratio)}</span> of them followed the rules
      </li>
      <li>
        Most frequent sample {md.modal_bitstring_feasible ? 'followed the rules' : 'broke a rule'}; the plan shown is
        the best valid sample, picked classically
      </li>
      <li>
        Optimiser: {md.optimizer}, <span className="num">{md.total_evaluations}</span> circuit evaluations (
        {md.optimizer_status === 'maxiter_reached' ? 'stopped at its step limit' : 'converged'})
      </li>
    </ul>
  )
}

export interface SolverPanelProps {
  outcome: SolverOutcome
  scenario: ScenarioSpec
  source: RunSource
  runId: string
}

export function SolverPanel({ outcome, scenario, source, runId }: SolverPanelProps) {
  const info = SOLVERS[outcome.key]
  const m = outcome.metrics
  const titleId = `solver-${outcome.key}-${runId}`
  return (
    <article
      className={`solver solver--${outcome.key}`}
      aria-labelledby={titleId}
      data-status={outcome.status}
      data-present-id={`solver-${outcome.key}`}
    >
      <header className="solver__head">
        <h3 id={titleId}>{info.name}</h3>
        <p className="solver__short">{info.short}</p>
        {source === 'recorded' && <ProvenanceTag kind="recorded" />}
      </header>

      {outcome.status === 'ok' && m && outcome.allocation ? (
        <>
          <Weave
            scenario={scenario}
            allocation={outcome.allocation}
            caption={`${info.name} allocation`}
            captionHidden
            animateKey={`${runId}-${outcome.key}`}
            compact
          />
          <dl className="solver__metrics">
            <div className="solver__score">
              <dt>Score (lower is better)</dt>
              <dd className="num">{formatNumber(outcome.objective_value)}</dd>
            </div>
            <div>
              <dt>Requests met</dt>
              <dd className="num">
                {m.total_demand_units - m.unmet_demand_units} of {m.total_demand_units}
              </dd>
            </div>
            <div>
              <dt>Weighted shortage</dt>
              <dd className="num">{formatNumber(m.weighted_shortage)}</dd>
            </div>
            <div>
              <dt>Fairness score</dt>
              <dd className="num">{formatNumber(m.fairness_score)}</dd>
            </div>
            <div>
              <dt>Run time</dt>
              <dd className="num">{formatSeconds(outcome.runtime_seconds)}</dd>
            </div>
          </dl>
          <RulesLine outcome={outcome} />
          <GapLine outcome={outcome} />
          {outcome.key === 'qaoa' &&
            (outcome.metadata.num_qubits === 0 ? (
              <p className="field__hint">Nothing was requested, so the circuit had nothing to decide.</p>
            ) : (
              <>
                <QaoaFacts outcome={outcome} />
                <p className="solver__link">
                  <Link to="/lab#circuit">Inspect this circuit in the quantum lab</Link>
                </p>
              </>
            ))}
        </>
      ) : outcome.status === 'skipped' ? (
        <div className="notice notice--info" role="status">
          <CircleSlash aria-hidden size={18} />
          <p>{outcome.error}</p>
        </div>
      ) : (
        <div className="notice notice--error" role="alert">
          <CircleAlert aria-hidden size={18} />
          <p>
            <strong>{info.name} failed.</strong> {outcome.error} No allocation is shown, and no other solver's result
            is put in its place.
          </p>
        </div>
      )}

      <details className="solver__details">
        <summary>How this solver works</summary>
        <p>{info.plain}</p>
        <p className="solver__technical">{info.technical}</p>
      </details>
    </article>
  )
}

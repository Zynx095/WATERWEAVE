import type { ReferenceOutcome, ScenarioSpec, SolverOutcome } from '../api/types'
import { formatNumber, formatPercent } from '../lib/format'
import { agreesWithMetrics, serviceShares } from '../lib/service'
import { SOLVERS } from '../lib/solvers'
import { ScrollRegion } from './ScrollRegion'

export interface ServiceChartProps {
  scenario: ScenarioSpec
  results: SolverOutcome[]
  reference: ReferenceOutcome
}

/**
 * Share of each neighborhood's request that each solver met. The shares are
 * checked against the engine's fairness score and disparity first; if they
 * disagree the chart is not drawn.
 */
export function ServiceChart({ scenario, results, reference }: ServiceChartProps) {
  const ok = results.filter((r) => r.status === 'ok' && r.allocation && r.metrics)
  const series = ok.map((r) => ({ outcome: r, rows: serviceShares(scenario, r.allocation!) }))
  const consistent = series.every((s) => agreesWithMetrics(s.rows, s.outcome.metrics!))

  if (!ok.length) return <p className="field__hint">No successful solver result to chart.</p>
  if (!consistent) {
    return (
      <p className="notice notice--error" role="alert">
        The per-neighborhood shares could not be matched to the engine's fairness numbers, so the chart is not
        shown.
      </p>
    )
  }

  return (
    <div className="service">
      <ScrollRegion className="service__scroll" label="Share of requests met" hint>
        <table className="service__table">
          <caption className="sr-only">Share of each neighborhood's requests that each solver met</caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Neighborhood</span>
              </th>
              {series.map((s) => (
                <th scope="col" key={s.outcome.key} className={`service__solver service__solver--${s.outcome.key}`}>
                  {SOLVERS[s.outcome.key].name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {series[0].rows.map((row, i) => (
              <tr key={row.id}>
                <th scope="row">
                  {row.name}
                  <span className="service__requested">{row.requested} requested</span>
                </th>
                {series.map((s) => {
                  const r = s.rows[i]
                  return (
                    <td key={s.outcome.key}>
                      {r.share === null ? (
                        <span className="service__none">No request</span>
                      ) : (
                        <div className="service__bar" data-solver={s.outcome.key}>
                          <span className="service__fill" style={{ width: `${r.share * 100}%` }} />
                          <span className="service__value num">
                            {formatPercent(r.share)} <span className="sr-only">({r.served} of {r.requested})</span>
                          </span>
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Fairness score</th>
              {series.map((s) => (
                <td key={s.outcome.key} className="num">
                  {formatNumber(s.outcome.metrics!.fairness_score)}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">Requests met</th>
              {series.map((s) => (
                <td key={s.outcome.key} className="num">
                  {s.outcome.metrics!.total_demand_units - s.outcome.metrics!.unmet_demand_units} of{' '}
                  {s.outcome.metrics!.total_demand_units}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </ScrollRegion>
      <ReferenceNote reference={reference} objectives={ok.map((r) => r.objective_value as number)} />
    </div>
  )
}

function ReferenceNote({ reference, objectives }: { reference: ReferenceOutcome; objectives: number[] }) {
  const best = Math.min(...objectives)
  const worst = Math.max(...objectives)
  const score = <span className="num">{formatNumber(reference.objective_value)}</span>
  return (
    <p className="service__reference">
      For comparison, <strong>delivering nothing</strong> has a perfect fairness score of{' '}
      <span className="num">{formatNumber(reference.metrics.fairness_score)}</span>, because everyone is equally
      unserved.{' '}
      {reference.objective_value > worst + 1e-9 ? (
        <>Its score is {score}, worse than every plan above.</>
      ) : Math.abs(reference.objective_value - best) < 1e-9 ? (
        <>
          Its score is {score}, as good as the best plan here: with this fairness weight, serving nobody is an optimal
          plan. That is a property of the scoring, not a recommendation.
        </>
      ) : (
        <>Its score is {score}.</>
      )}{' '}
      Fairness only means something next to how much water was delivered.
    </p>
  )
}

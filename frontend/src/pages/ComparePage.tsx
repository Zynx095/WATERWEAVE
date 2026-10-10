import { CircleCheck, LoaderCircle, Play, TriangleAlert } from 'lucide-react'
import { useEffect } from 'react'
import { Link } from 'react-router'
import type { BenchmarkInstance, BenchmarkSummaryRow, SolverOutcome } from '../api/types'
import { ProvenanceTag } from '../components/ProvenanceTag'
import { usePageTitle } from '../hooks/usePageTitle'
import { benchmarkFacts, CONTROL_NAME, EXACT_NAME, GREEDY_NAME, QAOA_NAME } from '../lib/benchmark'
import { formatDateTime, formatNumber, formatPercent, formatRelative, formatSeconds } from '../lib/format'
import { useNow } from '../hooks/useNow'
import { SOLVER_ORDER, SOLVERS } from '../lib/solvers'
import { useStore } from '../state/store'
import { ScrollRegion } from '../components/ScrollRegion'

function rowLabel(row: BenchmarkSummaryRow): string {
  if (row.solver_name === GREEDY_NAME) return 'Greedy'
  if (row.solver_name === EXACT_NAME) return 'Exact search'
  if (row.solver_name === QAOA_NAME) return `QAOA, ${row.qaoa_p} ${row.qaoa_p === 1 ? 'layer' : 'layers'}`
  if (row.solver_name === CONTROL_NAME) return 'Random sampling, same number of samples'
  return row.solver_name
}

function rowOrder(row: BenchmarkSummaryRow): number {
  const base = [GREEDY_NAME, EXACT_NAME, QAOA_NAME, CONTROL_NAME].indexOf(row.solver_name)
  return (base < 0 ? 9 : base) * 10 + (row.qaoa_p ?? 0)
}

function LiveComparison() {
  const { state, actions } = useStore()
  const now = useNow()
  const run = state.run.status === 'ready' ? state.run.data : null
  const running = state.run.status === 'loading'

  if (!run) {
    return (
      <div className="run-bar">
        <button
          type="button"
          className="button button--primary button--large"
          disabled={!state.scenario || running}
          onClick={() => void actions.runSolvers({ includeQaoa: true })}
        >
          {running ? <LoaderCircle aria-hidden size={18} className="spin" /> : <Play aria-hidden size={18} />}
          {running ? 'Running' : 'Run greedy, exact and QAOA'}
        </button>
        <p className="run-bar__status" role="status">
          {state.run.status === 'error'
            ? state.run.error
            : running
              ? 'Running the three solvers on the current scenario.'
              : 'Runs the current workspace scenario with the current settings.'}
        </p>
      </div>
    )
  }

  const results = SOLVER_ORDER.map((k) => run.results.find((r) => r.key === k)).filter(
    (r): r is SolverOutcome => r !== undefined,
  )
  const scores = results.map((r) => r.objective_value).filter((v): v is number => v !== null)
  const maxScore = Math.max(...scores, run.reference.deliver_nothing.objective_value)
  const exact = results.find((r) => r.key === 'exact')
  const qaoa = results.find((r) => r.key === 'qaoa')
  const ratio =
    exact?.status === 'ok' && qaoa?.status === 'ok' && exact.runtime_seconds > 0
      ? qaoa.runtime_seconds / exact.runtime_seconds
      : null

  return (
    <>
      <p className="section-intro">
        Scenario <strong>{run.scenario.name}</strong>, fairness weight {run.settings.fairness_weight}, penalty{' '}
        {run.settings.penalty_weight}
        {run.settings.include_qaoa &&
          `, QAOA with ${run.settings.p} ${run.settings.p === 1 ? 'layer' : 'layers'} and ${run.settings.shots} samples`}
        .{' '}
        {run.source === 'recorded' ? (
          <ProvenanceTag kind="recorded" />
        ) : (
          <>
            <ProvenanceTag kind="live" label="Live engine run" /> {formatDateTime(run.executed_at)},{' '}
            {formatRelative(run.executed_at, now)}.
          </>
        )}
      </p>
      <ScrollRegion className="table-scroll" label="Solver results table">
        <table className="data-table">
          <caption className="sr-only">Solver results on the same scenario and objective</caption>
          <thead>
            <tr>
              <th scope="col">Solver</th>
              <th scope="col">How it searches</th>
              <th scope="col">Score (lower is better)</th>
              <th scope="col">Versus exact</th>
              <th scope="col">Rules</th>
              <th scope="col">Run time</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.key} data-solver={r.key}>
                <th scope="row">{SOLVERS[r.key].name}</th>
                <td>{SOLVERS[r.key].short}</td>
                <td>
                  {r.objective_value === null ? (
                    <span className="field__error">{r.status === 'skipped' ? 'Not run' : 'Failed'}</span>
                  ) : (
                    <span className="score-bar">
                      <span
                        className="score-bar__fill"
                        style={{ width: `${(r.objective_value / maxScore) * 100}%` }}
                        aria-hidden="true"
                      />
                      <span className="num">{formatNumber(r.objective_value)}</span>
                    </span>
                  )}
                </td>
                <td className="num">
                  {r.key === 'exact'
                    ? 'Optimal'
                    : r.gap_to_exact === null
                      ? 'n/a'
                      : Math.abs(r.gap_to_exact) < 1e-9
                        ? 'Same'
                        : `+${formatNumber(r.gap_to_exact)}`}
                </td>
                <td>
                  {r.status !== 'ok' ? 'n/a' : r.feasible ? (
                    <span className="rules rules--ok">
                      <CircleCheck aria-hidden size={16} /> Met
                    </span>
                  ) : (
                    <span className="rules rules--broken">
                      <TriangleAlert aria-hidden size={16} /> Broken
                    </span>
                  )}
                </td>
                <td className="num">{r.status === 'ok' ? formatSeconds(r.runtime_seconds) : 'n/a'}</td>
              </tr>
            ))}
            <tr className="data-table__reference">
              <th scope="row">Deliver nothing</th>
              <td>Reference, not a solver</td>
              <td>
                <span className="score-bar">
                  <span
                    className="score-bar__fill score-bar__fill--reference"
                    style={{ width: `${(run.reference.deliver_nothing.objective_value / maxScore) * 100}%` }}
                    aria-hidden="true"
                  />
                  <span className="num">{formatNumber(run.reference.deliver_nothing.objective_value)}</span>
                </span>
              </td>
              <td colSpan={3}>Fairness score {formatNumber(run.reference.deliver_nothing.metrics.fairness_score)}</td>
            </tr>
          </tbody>
        </table>
      </ScrollRegion>
      {ratio !== null && (
        <p className="callout">
          On this run QAOA took about <strong className="num">{Math.round(ratio).toLocaleString('en-GB')} times</strong>{' '}
          as long as checking every plan. That time is the cost of simulating a {String(qaoa?.metadata.num_qubits)}
          -qubit circuit on this computer; it says nothing about how fast quantum hardware would be.
        </p>
      )}
    </>
  )
}

function BenchmarkTable({ bench }: { bench: BenchmarkInstance }) {
  const rows = [...bench.summary].sort((a, b) => rowOrder(a) - rowOrder(b))
  const facts = bench.audit_facts ?? {}
  return (
    <>
      <ScrollRegion className="table-scroll" label="Recorded benchmark table">
        <table className="data-table">
          <caption className="sr-only">Recorded benchmark: {bench.instance}</caption>
          <thead>
            <tr>
              <th scope="col">Method</th>
              <th scope="col">Found the best plan</th>
              <th scope="col">Mean score</th>
              <th scope="col">Median time</th>
              <th scope="col">Valid samples</th>
              <th scope="col">Chance one sample is optimal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const hits = Math.round((row.hit_optimum_rate ?? 0) * row.ok_runs)
              const isControl = row.solver_name === CONTROL_NAME
              const pOptimal = isControl ? facts.uniform_p_optimal_pattern : row.state_p_optimal_mean
              return (
                <tr key={`${row.solver_name}-${row.qaoa_p}`} data-control={isControl || undefined}>
                  <th scope="row">{rowLabel(row)}</th>
                  <td className="num">
                    {hits} of {row.ok_runs} runs
                  </td>
                  <td className="num">
                    {formatNumber(row.objective_mean)}
                    {row.objective_sd ? ` ± ${formatNumber(row.objective_sd)}` : ''}
                  </td>
                  <td className="num">{formatSeconds(row.runtime_median_s)}</td>
                  <td className="num">
                    {row.feasible_sample_ratio_mean === null ? 'n/a' : formatPercent(row.feasible_sample_ratio_mean)}
                  </td>
                  <td className="num">{pOptimal === null || pOptimal === undefined ? 'n/a' : formatPercent(pOptimal, 1)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </ScrollRegion>
      <p className="field__hint">
        Recorded {formatDateTime(bench.timestamp_utc)} by <code>scripts/benchmark.py</code> into{' '}
        <code>{bench.file}</code>: seeds {bench.parameters.seeds.join(', ')}, layers {bench.parameters.p_values.join(', ')},{' '}
        {bench.parameters.shots} samples, {bench.parameters.maxiter} optimiser steps, engine commit{' '}
        <code>{String(bench.provenance.engine_git_commit ?? 'unknown').slice(0, 7)}</code>. Greedy, exact and random
        sampling were run alongside each QAOA run. For random sampling, the last column is exact: optimal plans divided
        by all plans. For QAOA it is the probability in the simulated quantum state.
      </p>
      {bench.audit_checks.length > 0 && (
        <details className="explain">
          <summary>
            {bench.audit_checks.filter((c) => c.status === 'pass').length} of {bench.audit_checks.length} independent
            checks passed
          </summary>
          <ul className="check-list">
            {bench.audit_checks.map((c) => (
              <li key={c.name}>
                <strong>{c.name.replaceAll('_', ' ')}</strong>: {c.status}. {c.detail}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  )
}

/** Each statement below is only made when the recorded numbers support it. */
function HonestReading({ bench }: { bench: BenchmarkInstance }) {
  const f = benchmarkFacts(bench)
  const facts = bench.audit_facts ?? {}
  const qaoaRows = bench.summary
    .filter((r) => r.solver_name === QAOA_NAME)
    .sort((a, b) => (a.qaoa_p ?? 0) - (b.qaoa_p ?? 0))
  const validRange = qaoaRows
    .map((r) => r.feasible_sample_ratio_mean)
    .filter((v): v is number => v !== null)
  const control = bench.summary.find((r) => r.solver_name === CONTROL_NAME)
  const uniform = facts.uniform_p_optimal_pattern ?? null
  const pOpt = qaoaRows.map((r) => r.state_p_optimal_mean).filter((v): v is number => v !== null)
  const risesWithDepth = pOpt.length > 1 && pOpt.every((v, i) => i === 0 || v >= pOpt[i - 1])
  const depthsBeatingRandom = uniform === null ? [] : qaoaRows.filter((r) => (r.state_p_optimal_mean ?? 0) > uniform)
  const controlAsGood = f.controlHits !== null && f.controlRuns !== null && f.controlHits / f.controlRuns >= f.qaoaHits / f.qaoaRuns
  const exactFaster =
    f.exactMedianSeconds !== null && f.qaoaMedianSeconds !== null && f.exactMedianSeconds < f.qaoaMedianSeconds[0]
  return (
    <div className="honest">
      <div>
        <h3>What the results show</h3>
        <ul>
          <li>
            The quantum pipeline is real and complete: the allocation problem becomes a {facts.n_qubits ?? ''}-qubit
            circuit, the circuit is tuned and sampled, and samples decode into plans that follow the rules.
          </li>
          <li>
            QAOA reached the best plan in {f.qaoaHits} of {f.qaoaRuns} recorded runs.
          </li>
          {validRange.length > 0 && control?.feasible_sample_ratio_mean != null && (
            <li>
              Its samples followed the rules more often than random ones: {formatPercent(Math.min(...validRange))} to{' '}
              {formatPercent(Math.max(...validRange))} against {formatPercent(control.feasible_sample_ratio_mean)}.
            </li>
          )}
          <li>Every reported number traces back to an engine run, and the formulation passed independent checks.</li>
        </ul>
      </div>
      <div>
        <h3>What they do not show</h3>
        <ul>
          {controlAsGood ? (
            <li>
              A quantum advantage. Random sampling with the same {f.shots} samples found the best plan in{' '}
              {f.controlHits} of {f.controlRuns} runs, at least as often as QAOA. With{' '}
              {facts.n_states ?? 'this few'} possible plans, a thousand random samples almost surely include the best
              one.
            </li>
          ) : (
            <li>
              A quantum advantage. QAOA found the best plan more often than random sampling here, but one small
              simulated instance cannot establish an advantage.
            </li>
          )}
          {exactFaster && (
            <li>
              A speed-up. Checking every plan took about {formatSeconds(f.exactMedianSeconds)}; simulating QAOA took{' '}
              {formatSeconds(f.qaoaMedianSeconds![0])} to {formatSeconds(f.qaoaMedianSeconds![1])}.
            </li>
          )}
          {!risesWithDepth && uniform !== null && (
            <li>
              Steady improvement with depth. The chance that one QAOA sample is optimal does not rise steadily from{' '}
              {qaoaRows[0]?.qaoa_p} to {qaoaRows.at(-1)?.qaoa_p} layers, and {depthsBeatingRandom.length} of{' '}
              {qaoaRows.length} depths beat random guessing ({formatPercent(uniform, 1)} per sample).
            </li>
          )}
          <li>
            Anything about quantum hardware or larger cities. These are noiseless simulations of one small synthetic
            scenario.
          </li>
        </ul>
      </div>
    </div>
  )
}

export function ComparePage() {
  usePageTitle('Classical vs quantum')
  const { state, actions } = useStore()
  const bench = state.benchmark.data?.default ?? null

  useEffect(() => {
    if (state.connection.status === 'online' || state.mode === 'recorded') void actions.loadBenchmark()
  }, [state.connection.status, state.mode, actions])

  return (
    <>
      <header className="page-head">
        <h1>Does the quantum solver help?</h1>
        <p className="lede">
          Not on the benchmark scenario. All three solvers get the same scenario and the same score. Exact search is
          certain and fastest there; QAOA finds equally good plans, but so does random sampling with the same number
          of samples. What this project shows is a working, checked quantum pipeline, not a speed or quality
          advantage.
        </p>
      </header>

      <section className="section" aria-labelledby="same-title" data-present-id="compare">
        <h2 id="same-title">Same scenario, same score</h2>
        <LiveComparison />
      </section>

      <section className="section" aria-labelledby="bench-title" data-present-id="benchmark">
        <h2 id="bench-title">Repeated runs</h2>
        <p className="section-intro">
          One run can be lucky. The benchmark repeats every solver over several seeds and depths and adds a control:
          random sampling with exactly as many samples as QAOA.
        </p>
        {bench ? (
          <>
            <ProvenanceTag kind="recorded" label="Recorded benchmark" />
            <BenchmarkTable bench={bench} />
          </>
        ) : (
          <p className="loading-line">
            {state.benchmark.status === 'error'
              ? state.benchmark.error
              : state.connection.status === 'offline' && state.mode === 'live'
                ? 'The recorded benchmark is served by the API, which is not reachable.'
                : 'Loading the recorded benchmark.'}
          </p>
        )}
      </section>

      {bench && (
        <section className="section" aria-labelledby="honest-title" data-present-id="honest">
          <h2 id="honest-title">What this shows, and what it does not</h2>
          <HonestReading bench={bench} />
        </section>
      )}

      <section className="section" aria-labelledby="conclusion-title" data-present-id="conclusion">
        <h2 id="conclusion-title">Where this leaves WATERWEAVE</h2>
        <div className="conclusion">
          <div>
            <h3>Contribution</h3>
            <p>
              A transparent model of water rationing, in which the rules and trade-offs are explicit and every plan has
              a score that can be checked. The same model runs through an exact search, a greedy heuristic and a
              complete QAOA pipeline, with an honest benchmark and a random control.
            </p>
          </div>
          <div>
            <h3>Limitations</h3>
            <p>
              One small synthetic scenario. No hydraulic network, pressure or tank dynamics. Weights such as the
              fairness weight are choices, not measurements, and they decide the answer. The reported fairness score
              is not exactly the quantity the solvers minimise. QAOA is simulated without noise.
            </p>
          </div>
          <div>
            <h3>Next steps</h3>
            <p>
              Larger instances with binary instead of unary slack encoding; mixers that keep samples within the rules;
              noise-aware runs on real quantum hardware; stronger classical baselines such as integer programming; and
              real supply and demand data if the utility publishes it. See <Link to="/lab">the quantum lab</Link> for
              the mathematics.
            </p>
          </div>
        </div>
      </section>
    </>
  )
}

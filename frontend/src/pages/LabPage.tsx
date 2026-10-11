import { LoaderCircle, Play } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { api } from '../api/client'
import type { EvaluateResponse, QaoaMetadata, SolverOutcome } from '../api/types'
import { CircuitDiagram } from '../components/CircuitDiagram'
import { CouplingMatrix } from '../components/CouplingMatrix'
import { usePageTitle } from '../hooks/usePageTitle'
import { formatDateTime, formatNumber, formatPercent, shortName } from '../lib/format'
import { scenarioFacts } from '../lib/scenario'
import { variableLabels, variableShortLabels } from '../lib/variables'
import { useStore } from '../state/store'
import { isStale } from './WorkspacePage'

function Levels({ plain, here, children }: { plain: ReactNode; here?: ReactNode; children: ReactNode }) {
  return (
    <>
      <p>
        <strong>In plain words.</strong> {plain}
      </p>
      {here && (
        <p>
          <strong>In this scenario.</strong> {here}
        </p>
      )}
      <details className="explain">
        <summary>Technical and mathematical detail</summary>
        {children}
      </details>
    </>
  )
}

function Sample({ title, bitstring, decision, slack, labels }: {
  title: string
  bitstring: string
  decision: number[]
  slack: number[]
  labels: string[]
}) {
  return (
    <div>
      <h3>{title}</h3>
      <p className="bitstring-note">
        Qiskit reports <code className="bitstring">{bitstring}</code>, with qubit 0 on the right. In qubit order:
      </p>
      <p className="bits__group">Decisions</p>
      <Bits bits={decision} labels={labels} />
      <p className="bits__group">Slack</p>
      <Bits bits={slack} labels={labels} offset={decision.length} />
    </div>
  )
}

function Bits({ bits, labels, offset = 0 }: { bits: number[]; labels: string[]; offset?: number }) {
  return (
    <ul className="bits">
      {bits.map((b, i) => (
        <li key={i} data-on={b === 1 || undefined} title={labels[offset + i]}>
          <span className="bits__value num">{b}</span>
          <span className="bits__label">{labels[offset + i]}</span>
        </li>
      ))}
    </ul>
  )
}

export function LabPage() {
  usePageTitle('Quantum lab')
  const { state, actions } = useStore()
  const model = state.model.data
  const scenario = state.scenario
  const latestRun = state.run.status === 'ready' ? state.run.data : null
  // A run made for another scenario or other settings would be drawn with this
  // scenario's variable names, so it is not shown here until it is run again.
  const runIsOld = latestRun && scenario ? isStale(latestRun, scenario, state.settings) : false
  const run = runIsOld ? null : latestRun
  const qaoa: SolverOutcome | null = run?.results.find((r) => r.key === 'qaoa' && r.status === 'ok') ?? null
  const md = (qaoa?.metadata ?? null) as QaoaMetadata | null
  const labels = model ? variableLabels(model, scenario) : []
  const shortLabels = model ? variableShortLabels(model) : []
  const facts = scenario ? scenarioFacts(scenario) : null
  const [penaltyExample, setPenaltyExample] = useState<{ name: string; result: EvaluateResponse } | null>(null)

  // A real penalty example: give a storage-limited neighborhood everything it asked for.
  const limitedId = facts?.storageLimited[0]?.id ?? null
  useEffect(() => {
    const n = scenario?.neighborhoods.find((x) => x.id === limitedId)
    if (!scenario || !n || state.mode !== 'live' || state.connection.status !== 'online') {
      setPenaltyExample(null)
      return
    }
    const controller = new AbortController()
    api
      .evaluate(scenario, { [n.id]: { ...n.demand_by_slot } }, { fairness_weight: state.settings.fairness_weight }, {
        signal: controller.signal,
      })
      .then((result) => setPenaltyExample({ name: shortName(n.name), result }))
      .catch(() => setPenaltyExample(null))
    return () => controller.abort()
  }, [scenario, limitedId, state.mode, state.connection.status, state.settings.fairness_weight])

  return (
    <>
      <header className="page-head">
        <h1>Quantum lab</h1>
        <p className="lede">
          How a water-allocation day becomes a quantum circuit, step by step. Each step starts in plain words; the
          mathematics is one click away. Everything shown is computed by the engine for the scenario in the workspace
          {scenario ? ` (${scenario.name})` : ''}.
        </p>
      </header>

      {runIsOld && (
        <p className="notice notice--info">
          The last run was for a different scenario or different settings, so its circuit and samples are not shown
          here. Run the solvers again in the <Link to="/workspace">workspace</Link>.
        </p>
      )}

      {model && model.n_decision === 0 ? (
        <p className="notice notice--info">
          This scenario has no requests, so there is nothing to optimise. Add a request in the{' '}
          <Link to="/workspace">workspace</Link>.
        </p>
      ) : !model ? (
        <p className="loading-line">
          {state.model.status === 'error'
            ? state.model.error
            : state.connection.status === 'offline' && state.mode === 'live'
              ? 'The model is built by the API, which is not reachable.'
              : 'Building the model.'}
        </p>
      ) : (
        <ol className="lab">
          <li className="lab__step" id="decisions">
            <h2>Yes-or-no decisions</h2>
            <Levels
              plain="Every request becomes a question with a yes or no answer: does this neighborhood get a unit of water in this slot?"
              here={
                <>
                  {model.n_decision} questions, so {facts ? facts.plans.toLocaleString('en-GB') : 2 ** model.n_decision}{' '}
                  possible plans: {labels.slice(0, model.n_decision).join(', ')}.
                </>
              }
            >
              <p>
                A binary variable <var>x</var>
                <sub>i,t</sub> ∈ {'{'}0, 1{'}'} exists only where neighborhood <var>i</var> requested water in slot{' '}
                <var>t</var>; one bit delivers one unit. With <var>K</var> = {model.n_decision} variables there are 2
                <sup>{model.n_decision}</sup> assignments, which the exact solver enumerates.
              </p>
            </Levels>
          </li>

          <li className="lab__step" id="objective">
            <h2>One score per plan</h2>
            <Levels
              plain="A plan is scored by the water it leaves unmet, weighted by each neighborhood's priority, plus a charge for serving some neighborhoods much better than others. Lower is better."
              here={
                <>
                  Fairness weight α = {formatNumber(model.fairness_weight)}. Priority weights:{' '}
                  {scenario?.neighborhoods.map((n) => `${shortName(n.name)} ${n.priority_weight}`).join(', ')}.
                </>
              }
            >
              <p className="math">
                F(<var>x</var>) = Σ<sub>i</sub> <var>w</var>
                <sub>i</sub> (<var>D</var>
                <sub>i</sub> − <var>y</var>
                <sub>i</sub>) + α Σ<sub>i&lt;j</sub> (<var>s</var>
                <sub>i</sub> − <var>s</var>
                <sub>j</sub>)² + P · (rule violations)²
              </p>
              <p>
                <var>y</var>
                <sub>i</sub> is the number of units delivered to neighborhood <var>i</var>, <var>D</var>
                <sub>i</sub> its total request and <var>s</var>
                <sub>i</sub> = <var>y</var>
                <sub>i</sub>/<var>D</var>
                <sub>i</sub> its served share. Both sums are quadratic in the bits (using <var>x</var>² = <var>x</var>),
                which is what makes a quantum formulation possible.
              </p>
            </Levels>
          </li>

          <li className="lab__step" id="penalties">
            <h2>Rules become penalties</h2>
            <Levels
              plain="The quantum method cannot forbid a choice, so breaking a rule is made expensive instead: every unit over a supply or storage limit adds a large penalty, squared."
              here={
                penaltyExample ? (
                  <>
                    Giving {penaltyExample.name} both deliveries it asked for exceeds its storage by{' '}
                    {penaltyExample.result.metrics.storage_violation_units}. The engine scores that plan{' '}
                    <strong className="num">{formatNumber(penaltyExample.result.objective_value)}</strong>, including a
                    penalty of P = {formatNumber(penaltyExample.result.penalty_weight)}.
                  </>
                ) : (
                  <>Penalty weight P = {formatNumber(model.penalty_weight)}, set automatically from the scenario.</>
                )
              }
            >
              <p>
                An inequality Σ<var>x</var> ≤ <var>B</var> gets <var>B</var> extra slack bits so that it can be written as
                an equality, Σ<var>x</var> + Σ<var>s</var> = <var>B</var>, penalised by P(Σ<var>x</var> + Σ<var>s</var> −{' '}
                <var>B</var>)². Choosing the slack bits well gives P · max(0, Σ<var>x</var> − <var>B</var>)²: zero when the
                rule holds. Here that adds {model.n_slack} slack bits: {labels.slice(model.n_decision).join('; ')}.
              </p>
              <p>
                P must exceed the largest possible gain from breaking a rule. The engine uses P ={' '}
                {formatNumber(model.penalty_weight)}; the benchmark's exhaustive check confirms that every rule-breaking
                plan scores worse than the best valid one.
              </p>
            </Levels>
          </li>

          <li className="lab__step" id="qubo">
            <h2>One energy over all bits</h2>
            <Levels
              plain={`Scores and penalties together become one quadratic formula over ${model.n_vars} bits: a QUBO. Each grid cell below is how strongly two bits push each other.`}
              here={`${model.n_decision} decision bits plus ${model.n_slack} slack bits, ${model.qubo.quadratic.length} non-zero couplings.`}
            >
              <p className="math">
                E(<var>z</var>) = <var>z</var>
                <sup>T</sup>Q<var>z</var> + <var>c</var>
                <sup>T</sup>
                <var>z</var> + {formatNumber(model.qubo.offset, 2)}
              </p>
              <p>
                For every plan, the lowest energy over the slack bits equals that plan's score F(<var>x</var>); the
                benchmark verifies this for all plans.
              </p>
            </Levels>
            <CouplingMatrix model={model} labels={shortLabels} longLabels={labels} />
          </li>

          <li className="lab__step" id="ising">
            <h2>Bits become spins</h2>
            <Levels
              plain="Each bit becomes a qubit. A qubit measured as 0 or 1 behaves like a tiny magnet pointing up or down, and the energy formula becomes a set of fields and couplings between magnets."
              here={`Largest field |h| = ${formatNumber(Math.max(...model.ising.h.map(Math.abs)))}, largest coupling |J| = ${formatNumber(Math.max(...model.ising.J.map((j) => Math.abs(j[2]))))}, constant ${formatNumber(model.ising.offset)}.`}
            >
              <p className="math">
                <var>z</var>
                <sub>k</sub> = (1 − Z<sub>k</sub>)/2, H<sub>C</sub> = {formatNumber(model.ising.offset)} + Σ<sub>k</sub>{' '}
                <var>h</var>
                <sub>k</sub>Z<sub>k</sub> + Σ<sub>k&lt;l</sub> <var>J</var>
                <sub>kl</sub>Z<sub>k</sub>Z<sub>l</sub>
              </p>
              <p>
                H<sub>C</sub> is diagonal: on the basis state for a bit string it equals that string's QUBO energy
                (checked on all 2<sup>{model.n_vars}</sup> states in the benchmark). It is not normalised, which matters
                for the angles below.
              </p>
            </Levels>
          </li>

          <li className="lab__step" id="circuit">
            <h2>The QAOA circuit</h2>
            <Levels
              plain="The circuit starts with every plan equally likely. A cost step shifts each plan's phase by its energy; a mixing step lets plans interfere. Tuning how strong each step is makes low-energy plans more likely to be measured."
              here={
                qaoa && md ? (
                  <>
                    The circuit QAOA actually ran {run?.source === 'recorded' ? 'in the recorded run' : `at ${formatDateTime(run?.executed_at)}`}:{' '}
                    {md.num_qubits} qubits, depth {md.circuit_depth}, {md.layers_p} layer(s), angles from{' '}
                    {md.grid_evaluations} grid points plus {md.optimizer_iterations} {md.optimizer} steps.
                  </>
                ) : (
                  <>Run QAOA to see the circuit with its tuned angles. Its structure for p = 1, 2, 3 has depth {model.circuit_structure.map((c) => c.depth).join(', ')}.</>
                )
              }
            >
              <p className="math">
                |ψ(γ, β)⟩ = Π<sub>l</sub> e<sup>−iβ<sub>l</sub>ΣX</sup> e<sup>−iγ<sub>l</sub>H<sub>C</sub></sup> |+⟩
                <sup>⊗{model.n_vars}</sup>
              </p>
              <p>
                Cost step: RZZ(2γ<var>J</var>
                <sub>kl</sub>) on every coupled pair and RZ(2γ<var>h</var>
                <sub>k</sub>) on every qubit. Mixer: RX(2β) on every qubit. The mixer does not respect the rules, so
                samples can break them; the expected energy ⟨H<sub>C</sub>⟩ is minimised over (γ, β) with SciPy COBYLA
                after a 6 × 6 grid start, using exact statevector simulation.
              </p>
            </Levels>
            {qaoa?.circuit ? (
              <CircuitDiagram circuit={qaoa.circuit} labels={labels} />
            ) : (
              <div className="run-bar">
                <button
                  type="button"
                  className="button button--primary"
                  disabled={state.run.status === 'loading' || !scenario}
                  onClick={() => void actions.runSolvers({ includeQaoa: true })}
                >
                  {state.run.status === 'loading' ? (
                    <LoaderCircle aria-hidden size={18} className="spin" />
                  ) : (
                    <Play aria-hidden size={18} />
                  )}
                  Run QAOA on this scenario
                </button>
                <p className="run-bar__status" role="status">
                  {state.run.status === 'error' ? state.run.error : 'Runs all three solvers; takes about a second.'}
                </p>
              </div>
            )}
          </li>

          <li className="lab__step" id="sampling">
            <h2>Measuring and choosing</h2>
            <Levels
              plain="Measuring the circuit gives one plan per shot. Many shots give many plans; an ordinary computer decodes each one, throws out those that break a rule, and keeps the best."
              here={
                qaoa && md && qaoa.samples?.best ? (
                  <>
                    {md.shots.toLocaleString('en-GB')} shots gave {md.sampled_unique_bitstrings} different bit strings;{' '}
                    {formatPercent(md.feasible_samples_ratio)} of shots followed the rules. The most frequent string (
                    {md.modal_bitstring_count} shots) {md.modal_bitstring_feasible ? 'followed' : 'broke'} the rules.
                  </>
                ) : (
                  'Run QAOA to see what its samples looked like.'
                )
              }
            >
              <p>
                Qiskit reports bit strings with qubit 0 on the right, so strings are reversed before decoding. The first{' '}
                {model.n_decision} bits are decisions, the rest slack. Selection rule:{' '}
                <code>{md?.selection_rule ?? 'best_feasible_slack_consistent'}</code> (the lowest-scoring valid sample
                whose slack bits are consistent). This is classical post-selection, not the most likely outcome.
              </p>
            </Levels>
            {qaoa?.samples?.best && (
              <div className="samples">
                <Sample
                  title="Chosen sample"
                  bitstring={qaoa.samples.best.bitstring}
                  decision={qaoa.samples.best.decision_bits}
                  slack={qaoa.samples.best.slack_bits}
                  labels={labels}
                />
                {qaoa.samples.modal && (
                  <Sample
                    title="Most frequent sample"
                    bitstring={qaoa.samples.modal.bitstring}
                    decision={qaoa.samples.modal.decision_bits}
                    slack={qaoa.samples.modal.slack_bits}
                    labels={labels}
                  />
                )}
              </div>
            )}
          </li>

          <li className="lab__step" id="method">
            <h2>How the results are checked</h2>
            <Levels
              plain="A separate program recomputes the score of every plan, compares it with the engine, and simulates the circuit independently. The benchmark repeats runs over seeds and depths and adds random sampling with the same budget as a control."
            >
              <p>
                <code>scripts/benchmark.py</code> checks penalty dominance, variable order, objective equality on all
                plans, the QUBO minimum over slack, the Ising diagonal on all basis states, and an independent NumPy
                simulation of the QAOA state. Results and their provenance are in <code>benchmark_results/</code>; the
                review is in <code>docs/VALIDATION.md</code>. See the <Link to="/compare">comparison</Link> for the
                numbers.
              </p>
            </Levels>
          </li>
        </ol>
      )}
    </>
  )
}

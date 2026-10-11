import { useEffect } from 'react'
import { Link } from 'react-router'
import type { ReactNode } from 'react'
import { ProvenanceTag } from '../components/ProvenanceTag'
import { Weave, WeaveLegend } from '../components/Weave'
import { usePageTitle } from '../hooks/usePageTitle'
import { benchmarkFacts } from '../lib/benchmark'
import { formatSeconds } from '../lib/format'
import { numberWord, scenarioFacts } from '../lib/scenario'
import { useStore } from '../state/store'

export function OverviewPage({ presentAction }: { presentAction?: ReactNode }) {
  usePageTitle('Overview')
  const { state, actions } = useStore()
  const preset = state.presets.data?.find((p) => p.id === 'default') ?? null
  const scenario = preset?.scenario ?? null
  const facts = scenario ? scenarioFacts(scenario) : null
  const bench = state.benchmark.data?.default ? benchmarkFacts(state.benchmark.data.default) : null

  useEffect(() => {
    if (state.connection.status === 'online' || state.mode === 'recorded') void actions.loadBenchmark()
  }, [state.connection.status, state.mode, actions])

  return (
    <>
      <section className="hero" aria-labelledby="problem" data-present-id="problem">
        <div className="hero__text">
          <h1 id="problem" className="hero__title">
            {facts ? (
              <>
                {numberWord(facts.requests, true)} deliveries requested. Water for {numberWord(facts.supply)}.
              </>
            ) : (
              'Who gets water when there is not enough?'
            )}
          </h1>
          <p className="lede">
            When supply runs short, a water utility has to choose which neighborhoods are served in which
            delivery slot. WATERWEAVE makes that choice transparent, compares three ways of making it, and
            tests honestly whether a quantum optimiser helps.
          </p>
          <div className="button-row hero__actions">
            <Link to="/workspace" className="button button--primary button--large">
              Open the workspace
            </Link>
            {presentAction}
          </div>
        </div>
        <figure className="hero__figure">
          {scenario ? (
            <>
              <Weave scenario={scenario} allocation={null} caption="Requests for one day" />
              <WeaveLegend mode="requests" />
              <figcaption className="hero__figcaption">
                <ProvenanceTag kind={preset?.provenance ?? 'synthetic'} /> Four neighborhoods, two delivery slots.
                The numbers are made up to keep the problem small enough to check by hand.
              </figcaption>
            </>
          ) : (
            <p className="loading-line">
              {state.presets.status === 'error'
                ? state.presets.error
                : state.connection.status === 'offline'
                  ? 'The scenario is loaded from the API, which is not reachable. Start it, or show the recorded run from the banner above.'
                  : 'Loading the scenario from the API.'}
            </p>
          )}
        </figure>
      </section>

      <section className="section" aria-labelledby="questions">
        <h2 id="questions">In short</h2>
        <dl className="qa">
          <div>
            <dt>What is WATERWEAVE?</dt>
            <dd>
              A prototype that plans how to share scarce water between neighborhoods and delivery slots, and
              compares a quick rule of thumb, an exhaustive search and a quantum algorithm on the same plan.
            </dd>
          </div>
          <div>
            <dt>What problem does it solve?</dt>
            <dd>
              Deciding who is served when demand exceeds supply, in a way that can be inspected: every plan gets
              a score, and every score can be traced back to the rules and weights that produced it.
            </dd>
          </div>
          <div>
            <dt>Why is that hard?</dt>
            <dd>
              Choices interact. A slot has limited supply, a neighborhood can only store so much, and serving one
              area first can leave another dry.
              {facts && (
                <>
                  {' '}
                  Even this small day has {facts.plans} possible plans; a city has astronomically more.
                </>
              )}
            </dd>
          </div>
          <div>
            <dt>How does it decide?</dt>
            <dd>
              It scores each plan by the water left unmet, weighted by each neighborhood's priority, plus a
              penalty when some neighborhoods are served much better than others. Supply and storage limits must
              hold. The lowest score wins.
            </dd>
          </div>
          <div>
            <dt>What does quantum computing do here?</dt>
            <dd>
              QAOA, a quantum optimisation algorithm, searches the same scores by sampling from a quantum circuit.
              Here the circuit is simulated on an ordinary computer; no quantum hardware is involved.
            </dd>
          </div>
          <div>
            <dt>How is fairness measured?</dt>
            <dd>
              By each neighborhood's share of its request that was met. The fairness score is 1 minus the gap
              between the best- and worst-served share. It is always shown next to the amount delivered, because
              delivering nothing at all would score as perfectly fair.
            </dd>
          </div>
          <div>
            <dt>Which data is real?</dt>
            <dd>
              The scenario is synthetic. Live rainfall for Bengaluru is fetched from Open-Meteo for context only,
              population figures are illustrative, and no public live feed of the city's water supply exists. The{' '}
              <Link to="/data">data sources page</Link> labels each input.
            </dd>
          </div>
          <div>
            <dt>Does the quantum approach win?</dt>
            <dd>
              {bench ? (
                <>
                  Not on this problem. Exhaustive search finds the best plan in about{' '}
                  {formatSeconds(bench.exactMedianSeconds)}. In the recorded benchmark, QAOA found an equally good
                  plan in {bench.qaoaHits} of {bench.qaoaRuns} runs
                  {bench.controlHits !== null && (
                    <>
                      , and random guessing with the same {bench.shots} samples did so in {bench.controlHits} of{' '}
                      {bench.controlRuns}
                    </>
                  )}
                  . <Link to="/compare">See the comparison</Link>.
                </>
              ) : (
                <>
                  Not on this problem: the exact classical search is faster and certain. The{' '}
                  <Link to="/compare">comparison page</Link> shows the measurements.
                </>
              )}
            </dd>
          </div>
        </dl>
      </section>
    </>
  )
}

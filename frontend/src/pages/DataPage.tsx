import { CloudOff, LoaderCircle, RadioTower, RotateCw } from 'lucide-react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import type { DataSourcesResponse, Observation } from '../api/types'
import { ProvenanceTag } from '../components/ProvenanceTag'
import { usePageTitle } from '../hooks/usePageTitle'
import { capitalise, formatAge, formatDateTime, formatNumber, shortName } from '../lib/format'
import { observationLabel, VARIABLE_LABEL } from '../lib/provenance'
import { scenarioFacts } from '../lib/scenario'
import { useStore } from '../state/store'
import { ScrollRegion } from '../components/ScrollRegion'

function ObservationRow({
  obs,
  data,
  names,
}: {
  obs: Observation
  data: DataSourcesResponse
  names: Record<string, string>
}) {
  const label = observationLabel(obs)
  const isRain = obs.variable === 'rainfall_mm'
  const illustrative = label.kind === 'illustrative'
  const place =
    obs.geographic_level === 'city'
      ? capitalise(obs.geographic_id)
      : names[obs.geographic_id]
        ? `${names[obs.geographic_id]} (${obs.geographic_id})`
        : obs.geographic_id
  return (
    <tr>
      <th scope="row">
        {VARIABLE_LABEL[obs.variable] ?? obs.variable}, {place}
        <span className="ledger__provider">
          {illustrative ? (
            <>
              Illustrative values in <code>{obs.provider.id}</code>, not census records
            </>
          ) : (
            <>
              {obs.provider.name} (<code>{obs.provider.id}</code>)
            </>
          )}
        </span>
      </th>
      <td>
        <ProvenanceTag kind={label.kind} label={label.label} />
      </td>
      <td className="num">
        {obs.value === null ? (
          <span className="field__error">{obs.quality.error_details ?? 'No value'}</span>
        ) : (
          `${formatNumber(obs.value, 1)} ${obs.unit === 'count' ? 'people' : obs.unit}`
        )}
      </td>
      <td>
        {illustrative ? (
          <>
            Not dated
            <span className="ledger__sub">Made-up values; they were never observed</span>
          </>
        ) : obs.source_timestamp ? (
          <>
            {formatDateTime(obs.source_timestamp)}
            <span className="ledger__sub">{formatAge(obs.source_age_seconds)} old</span>
          </>
        ) : (
          'No observation time'
        )}
      </td>
      <td>
        {isRain ? (
          <>Context only. {data.scenario_effect.rainfall_heuristic_enabled ? 'Adjusts evening supply.' : 'Not used by any scenario.'}</>
        ) : (
          <>Priority weight in the illustrative-population preset only</>
        )}
      </td>
    </tr>
  )
}

function EffectSummary({ data }: { data: DataSourcesResponse }) {
  const { state, actions } = useStore()
  const names = Object.fromEntries(
    (state.presets.data?.find((p) => p.id === 'default')?.scenario.neighborhoods ?? []).map((n) => [
      n.id,
      shortName(n.name),
    ]),
  )
  const navigate = useNavigate()
  const effect = data.scenario_effect
  const supply = Object.entries(effect.supply_by_slot)
    .map(([slot, units]) => `${units} ${slot}`)
    .join(' and ')
  return (
    <div className="effect" data-present-id="data-effect">
      <div>
        <h3>Supply</h3>
        <p>
          {effect.supply_changed
            ? `Changed by the rainfall heuristic to ${supply}.`
            : `Unchanged: ${supply} units, the same as the synthetic default.`}{' '}
          The rainfall-to-supply heuristic is <strong>{effect.rainfall_heuristic_enabled ? 'on' : 'off'}</strong>,
          because rain falling today does not tell us how much water the utility can pipe today.
        </p>
      </div>
      <div>
        <h3>Priority weights</h3>
        {effect.priority_weight_changes.length ? (
          <>
            <p>From illustrative population figures, population ÷ 25,000:</p>
            <ul className="weights">
              {effect.priority_weight_changes.map((c) => (
                <li key={c.id} className="num">
                  {names[c.id] ?? c.id}: {formatNumber(c.default)} → <strong>{formatNumber(c.data_informed)}</strong>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="button button--quiet"
              onClick={() => {
                actions.selectPreset('illustrative-population')
                navigate('/workspace')
              }}
            >
              Open this variant in the workspace
            </button>
          </>
        ) : (
          <p>No population figures were available, so the default weights stay.</p>
        )}
      </div>
    </div>
  )
}

export function DataPage() {
  usePageTitle('Data sources')
  const { state, actions } = useStore()
  const { dataSources } = state
  const data = dataSources.data
  const loading = dataSources.status === 'loading'
  const canFetch = state.connection.status === 'online' || state.mode === 'recorded'

  useEffect(() => {
    if (canFetch && dataSources.status === 'idle') void actions.fetchDataSources({ live: false })
  }, [canFetch, dataSources.status, actions])

  const defaultScenario = state.presets.data?.find((p) => p.id === 'default')?.scenario
  const syntheticSummary = defaultScenario
    ? (() => {
        const facts = scenarioFacts(defaultScenario)
        const storage = defaultScenario.neighborhoods.map((n) => n.storage_capacity_units)
        return `${facts.requests} requests, ${defaultScenario.slots
          .map((slot) => defaultScenario.supply_by_slot[slot])
          .join(' + ')} units of supply, storage ${Math.min(...storage)} to ${Math.max(...storage)}`
      })()
    : null
  const neighborhoodNames = Object.fromEntries(
    (defaultScenario?.neighborhoods ?? []).map((n) => [n.id, shortName(n.name)]),
  )
  const rain = data?.observations.find((o) => o.variable === 'rainfall_mm')
  const skippedRain = data?.skipped.find((s) => s.provider.id === 'open_meteo')

  return (
    <>
      <header className="page-head">
        <h1>Where the numbers come from</h1>
        <p className="lede">
          Every input is labelled as live, cached, illustrative, synthetic or unavailable. Weather can be fetched
          live. Nothing here measures how much water Bengaluru actually has.
        </p>
      </header>

      <section className="section" aria-labelledby="ledger-title" data-present-id="data">
        <h2 id="ledger-title">Inputs and their status</h2>
        <div className="run-bar">
          <button
            type="button"
            className="button button--primary"
            disabled={!canFetch || loading || state.mode === 'recorded'}
            onClick={() => void actions.fetchDataSources({ live: true, refresh: true })}
          >
            {loading ? <LoaderCircle aria-hidden size={18} className="spin" /> : <RadioTower aria-hidden size={18} />}
            Fetch live weather
          </button>
          <button
            type="button"
            className="button button--quiet"
            disabled={!canFetch || loading}
            onClick={() => void actions.fetchDataSources({ live: false })}
          >
            <CloudOff aria-hidden size={18} /> Show without the network
          </button>
          <p className="run-bar__status" role="status" aria-live="polite">
            {loading
              ? 'Contacting the data providers. Open-Meteo can take up to 10 seconds.'
              : dataSources.status === 'error'
                ? dataSources.error
                : data
                  ? `${data.requested_live ? 'Live fetch' : 'Offline view'} at ${formatDateTime(data.fetched_at)}${
                      dataSources.source === 'recorded' ? ' (recorded run)' : ''
                    }.`
                  : canFetch
                    ? 'Loading.'
                    : 'The API is not reachable, so provider data cannot be loaded.'}
          </p>
        </div>

        {data && (
          <>
            {data.offline_mode && (
              <p className="notice notice--info">
                <CloudOff aria-hidden size={18} /> The API was started in offline mode, so network providers are never
                contacted.
              </p>
            )}
            {rain?.quality.missing && (
              <p className="notice notice--error" role="alert">
                <RotateCw aria-hidden size={18} /> Open-Meteo could not be reached: {rain.quality.error_details}. The
                rest of the app is unaffected, because no scenario depends on live weather. Try again with Fetch live
                weather.
              </p>
            )}
            <ScrollRegion className="table-scroll" label="Data inputs table">
              <table className="data-table ledger">
                <caption className="sr-only">Data inputs, their status and how they are used</caption>
                <thead>
                  <tr>
                    <th scope="col">Input</th>
                    <th scope="col">Status</th>
                    <th scope="col">Value</th>
                    <th scope="col">Observed</th>
                    <th scope="col">Used for</th>
                  </tr>
                </thead>
                <tbody>
                  {skippedRain && (
                    <tr>
                      <th scope="row">
                        Rainfall, Bengaluru
                        <span className="ledger__provider">
                          {skippedRain.provider.name} (<code>{skippedRain.provider.id}</code>)
                        </span>
                      </th>
                      <td>
                        <ProvenanceTag kind="skipped" label={data.offline_mode ? 'Not fetched: offline mode' : 'Not fetched yet'} />
                      </td>
                      <td colSpan={2}>{skippedRain.reason}</td>
                      <td>Context only. Not used by any scenario.</td>
                    </tr>
                  )}
                  {data.observations.map((obs) => (
                    <ObservationRow
                      key={`${obs.provider.id}-${obs.geographic_id}-${obs.variable}`}
                      obs={obs}
                      data={data}
                      names={neighborhoodNames}
                    />
                  ))}
                  <tr>
                    <th scope="row">
                      Demand, supply and storage
                      <span className="ledger__provider">
                        <code>waterweave.scenarios</code>
                      </span>
                    </th>
                    <td>
                      <ProvenanceTag kind="synthetic" />
                    </td>
                    <td>{syntheticSummary ?? 'Defined in waterweave.scenarios'}</td>
                    <td>Made up to keep the problem checkable by hand</td>
                    <td>Every scenario in the app</td>
                  </tr>
                  <tr>
                    <th scope="row">
                      Reservoir levels and pipe flow
                      <span className="ledger__provider">BWSSB</span>
                    </th>
                    <td>
                      <ProvenanceTag kind="error" label="No public source" />
                    </td>
                    <td colSpan={2}>No public live API exists (checked 10 Oct 2026; docs/DATA_SOURCES.md).</td>
                    <td>Nothing</td>
                  </tr>
                  <tr>
                    <th scope="row">
                      Live demand by ward
                      <span className="ledger__provider">BWSSB, BBMP</span>
                    </th>
                    <td>
                      <ProvenanceTag kind="error" label="No public source" />
                    </td>
                    <td colSpan={2}>Not published (docs/DATA_GAPS.md).</td>
                    <td>Nothing</td>
                  </tr>
                </tbody>
              </table>
            </ScrollRegion>
          </>
        )}
      </section>

      {data && (
        <section className="section" aria-labelledby="effect-title">
          <h2 id="effect-title">What the data changes</h2>
          <p className="section-intro">
            What the scenario builder would do with the inputs above. The default demonstration uses none of them.
          </p>
          <EffectSummary data={data} />
        </section>
      )}

      <section className="section" aria-labelledby="offline-title">
        <h2 id="offline-title">Without a network</h2>
        <p className="section-intro">
          The solvers run locally and need no internet. If Open-Meteo cannot be reached, the rainfall row says so and
          shows the error; nothing else changes. To present without any network access, start the API with{' '}
          <code>python -m waterweave.api --offline</code>.
        </p>
      </section>
    </>
  )
}

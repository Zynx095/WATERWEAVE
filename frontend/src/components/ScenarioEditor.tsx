/*
 * Edit a scenario on its own weave: select a crossing to add or remove a
 * request, and set supply per slot and weight and storage per neighborhood.
 * Limits match what the API accepts (one unit per request, see
 * src/waterweave/api/schemas.py).
 */
import type { NeighborhoodSpec, ScenarioSpec } from '../api/types'
import { capitalise, shortName } from '../lib/format'
import { NumberStepper } from './NumberStepper'
import { Crossing } from './Weave'

export interface ScenarioEditorProps {
  scenario: ScenarioSpec
  onChange: (update: (scenario: ScenarioSpec) => ScenarioSpec) => void
  disabled?: boolean
}

function updateNeighborhood(
  scenario: ScenarioSpec,
  id: string,
  change: (n: NeighborhoodSpec) => NeighborhoodSpec,
): ScenarioSpec {
  return { ...scenario, neighborhoods: scenario.neighborhoods.map((n) => (n.id === id ? change(n) : n)) }
}

export function ScenarioEditor({ scenario, onChange, disabled = false }: ScenarioEditorProps) {
  const { slots, neighborhoods } = scenario
  return (
    <div className="weave-wrap">
      <table className="weave weave--editor">
        <caption className="sr-only">
          Scenario editor: requests per neighborhood and slot, supply per slot, weight and storage per neighborhood
        </caption>
        <thead>
          <tr>
            <th scope="col" className="weave__corner">
              <span className="sr-only">Neighborhood</span>
            </th>
            {slots.map((slot) => (
              <th scope="col" key={slot} className="weave__slot">
                <span className="weave__slot-name">{capitalise(slot)}</span>
                <NumberStepper
                  label={`${slot} supply`}
                  visibleLabel="Supply"
                  value={scenario.supply_by_slot[slot] ?? 0}
                  min={0}
                  max={neighborhoods.length}
                  onChange={(value) =>
                    onChange((s) => ({ ...s, supply_by_slot: { ...s.supply_by_slot, [slot]: value } }))
                  }
                  disabled={disabled}
                />
              </th>
            ))}
            <th scope="col" className="editor__head">
              Priority weight
            </th>
            <th scope="col" className="editor__head">
              Storage
            </th>
          </tr>
        </thead>
        <tbody>
          {neighborhoods.map((n) => {
            const name = shortName(n.name)
            return (
              <tr key={n.id}>
                <th scope="row" className="weave__row-head">
                  <span className="weave__name">{name}</span>
                </th>
                {slots.map((slot) => {
                  const requested = (n.demand_by_slot[slot] ?? 0) > 0
                  return (
                    <td key={slot} className="weave__cell">
                      <button
                        type="button"
                        className="weave__toggle"
                        aria-pressed={requested}
                        aria-label={`${name} ${slot} request`}
                        title={requested ? 'Requested: select to remove' : 'No request: select to add'}
                        disabled={disabled}
                        onClick={() =>
                          onChange((s) =>
                            updateNeighborhood(s, n.id, (m) => ({
                              ...m,
                              demand_by_slot: { ...m.demand_by_slot, [slot]: requested ? 0 : 1 },
                            })),
                          )
                        }
                      >
                        <Crossing state={requested ? 'requested' : 'none'} index={0} />
                      </button>
                    </td>
                  )
                })}
                <td className="editor__cell">
                  <NumberStepper
                    label={`${name} priority weight`}
                    visibleLabel=""
                    value={n.priority_weight}
                    min={0.5}
                    max={10}
                    step={0.5}
                    digits={1}
                    onChange={(value) => onChange((s) => updateNeighborhood(s, n.id, (m) => ({ ...m, priority_weight: value })))}
                    disabled={disabled}
                  />
                </td>
                <td className="editor__cell">
                  <NumberStepper
                    label={`${name} storage`}
                    visibleLabel=""
                    value={n.storage_capacity_units}
                    min={0}
                    max={slots.length}
                    onChange={(value) =>
                      onChange((s) => updateNeighborhood(s, n.id, (m) => ({ ...m, storage_capacity_units: value })))
                    }
                    disabled={disabled}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

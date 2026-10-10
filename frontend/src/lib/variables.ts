import type { ModelSummary, ScenarioSpec } from '../api/types'
import { shortName } from './format'

/** Human-readable names for the model's variables, in qubit order. */
export function variableLabels(model: ModelSummary, scenario: ScenarioSpec | null): string[] {
  const names = Object.fromEntries((scenario?.neighborhoods ?? []).map((n) => [n.id, shortName(n.name)]))
  const decisions = model.decision_vars.map((v) => `${names[v.neighborhood_id] ?? v.neighborhood_id} ${v.slot}`)
  const slack = model.slack_vars.map((v) => {
    const supply = /^slack_supply_(.+)_\d+$/.exec(v.name)
    if (supply) return `slack, ${supply[1]} supply`
    const storage = /^slack_storage_(.+)_\d+$/.exec(v.name)
    if (storage) return `slack, ${names[storage[1]] ?? storage[1]} storage`
    return v.name
  })
  return [...decisions, ...slack]
}

/** Short column labels for dense grids: N1m, N1e, s1... */
export function variableShortLabels(model: ModelSummary): string[] {
  return [
    ...model.decision_vars.map((v) => `${v.neighborhood_id}${v.slot.charAt(0)}`),
    ...model.slack_vars.map((_, i) => `s${i + 1}`),
  ]
}

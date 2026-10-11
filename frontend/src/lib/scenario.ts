import type { ScenarioSpec } from '../api/types'
import { shortName } from './format'

export interface ScenarioFacts {
  requests: number
  supply: number
  /** One yes/no decision per requested delivery, so 2^requests possible plans. */
  plans: number
  storageLimited: { id: string; name: string; requested: number; storage: number }[]
  scarceSlots: { slot: string; requested: number; supply: number }[]
}

export function scenarioFacts(scenario: ScenarioSpec): ScenarioFacts {
  const requested = (slot: string) =>
    scenario.neighborhoods.reduce((sum, n) => sum + (n.demand_by_slot[slot] ?? 0), 0)
  const requests = scenario.slots.reduce((sum, slot) => sum + requested(slot), 0)
  return {
    requests,
    supply: scenario.slots.reduce((sum, slot) => sum + (scenario.supply_by_slot[slot] ?? 0), 0),
    plans: 2 ** requests,
    storageLimited: scenario.neighborhoods
      .map((n) => ({
        id: n.id,
        name: shortName(n.name),
        requested: scenario.slots.reduce((sum, slot) => sum + (n.demand_by_slot[slot] ?? 0), 0),
        storage: n.storage_capacity_units,
      }))
      .filter((n) => n.requested > n.storage),
    scarceSlots: scenario.slots
      .map((slot) => ({ slot, requested: requested(slot), supply: scenario.supply_by_slot[slot] ?? 0 }))
      .filter((s) => s.requested > s.supply),
  }
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']

export function numberWord(n: number, capital = false): string {
  const word = Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : String(n)
  return capital ? word.charAt(0).toUpperCase() + word.slice(1) : word
}

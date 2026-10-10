/*
 * Per-neighborhood service shares for the fairness chart. The API reports
 * only the aggregate fairness score and disparity, so the shares are derived
 * here with the same definition as waterweave.metrics (served units are
 * capped at the request). agreesWithMetrics() checks the derivation against
 * the API's own numbers before the chart is trusted.
 */
import type { Allocation, Metrics, ScenarioSpec } from '../api/types'
import { shortName } from './format'

export interface ServiceRow {
  id: string
  name: string
  requested: number
  served: number
  /** served / requested, or null when nothing was requested. */
  share: number | null
}

export function serviceShares(scenario: ScenarioSpec, allocation: Allocation): ServiceRow[] {
  return scenario.neighborhoods.map((n) => {
    let requested = 0
    let served = 0
    for (const slot of scenario.slots) {
      const demand = n.demand_by_slot[slot] ?? 0
      requested += demand
      served += Math.min(allocation[n.id]?.[slot] ?? 0, demand)
    }
    return { id: n.id, name: shortName(n.name), requested, served, share: requested > 0 ? served / requested : null }
  })
}

const shares = (rows: ServiceRow[]) => rows.map((r) => r.share).filter((s): s is number => s !== null)

export function fairnessScore(rows: ServiceRow[]): number {
  const s = shares(rows)
  return s.length ? 1 - (Math.max(...s) - Math.min(...s)) : 1
}

export function disparity(rows: ServiceRow[]): number {
  const s = shares(rows)
  let total = 0
  for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) total += (s[i] - s[j]) ** 2
  return total
}

export function agreesWithMetrics(rows: ServiceRow[], metrics: Metrics): boolean {
  return (
    Math.abs(fairnessScore(rows) - metrics.fairness_score) < 1e-9 &&
    Math.abs(disparity(rows) - metrics.disparity) < 1e-9
  )
}

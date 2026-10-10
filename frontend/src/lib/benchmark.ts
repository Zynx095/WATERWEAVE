import type { BenchmarkInstance, BenchmarkSummaryRow } from '../api/types'

export const QAOA_NAME = 'QAOA (Quantum Heuristic)'
export const EXACT_NAME = 'Exact Classical (Optimal)'
export const GREEDY_NAME = 'Greedy (Priority-First)'
export const CONTROL_NAME = 'Uniform random sampling (shot-matched control)'

export interface BenchmarkFacts {
  qaoaHits: number
  qaoaRuns: number
  controlHits: number | null
  controlRuns: number | null
  exactMedianSeconds: number | null
  qaoaMedianSeconds: [number, number] | null
  pValues: number[]
  seeds: number[]
  shots: number
}

const hits = (row: BenchmarkSummaryRow) => Math.round((row.hit_optimum_rate ?? 0) * row.ok_runs)

/** Counts read off the recorded benchmark summary (no new statistics). */
export function benchmarkFacts(instance: BenchmarkInstance): BenchmarkFacts {
  const qaoa = instance.summary.filter((r) => r.solver_name === QAOA_NAME)
  const control = instance.summary.find((r) => r.solver_name === CONTROL_NAME) ?? null
  const exact = instance.summary.find((r) => r.solver_name === EXACT_NAME) ?? null
  const medians = qaoa.map((r) => r.runtime_median_s).filter((v): v is number => v !== null)
  return {
    qaoaHits: qaoa.reduce((sum, r) => sum + hits(r), 0),
    qaoaRuns: qaoa.reduce((sum, r) => sum + r.ok_runs, 0),
    controlHits: control ? hits(control) : null,
    controlRuns: control ? control.ok_runs : null,
    exactMedianSeconds: exact?.runtime_median_s ?? null,
    qaoaMedianSeconds: medians.length ? [Math.min(...medians), Math.max(...medians)] : null,
    pValues: instance.parameters.p_values,
    seeds: instance.parameters.seeds,
    shots: instance.parameters.shots,
  }
}

import type { SolverKey } from '../api/types'

export interface SolverInfo {
  name: string
  short: string
  /** Plain-language description for a general audience. */
  plain: string
  /** What the code does, for technical readers. */
  technical: string
}

export const SOLVERS: Record<SolverKey, SolverInfo> = {
  greedy: {
    name: 'Greedy',
    short: 'Rule of thumb',
    plain:
      'Adds deliveries one at a time, each time taking the one that lowers the score most, then tries single swaps. Fast, but it can miss the best plan.',
    technical:
      'Objective-aware forward greedy with 1-opt removal and swap refinement, also compared with the priority-first and empty plans (waterweave.solvers.solve_greedy).',
  },
  exact: {
    name: 'Exact search',
    short: 'Checks every plan',
    plain:
      'Scores every possible plan and keeps the best one. It is certain to find the best plan for this scoring, but the work doubles with every extra request.',
    technical:
      'Exhaustive enumeration of all 2^K decision patterns, K = number of requested deliveries, under the shared objective; ties broken by fairness score (solve_exact).',
  },
  qaoa: {
    name: 'QAOA',
    short: 'Quantum circuit, simulated',
    plain:
      'Builds a quantum circuit whose measurements favour low-score plans, samples it many times and keeps the best valid sample. Here the circuit runs on a classical simulator.',
    technical:
      'p-layer QAOA on the Ising form of the QUBO with slack qubits; angles from a 36-point grid then COBYLA; StatevectorSampler shots; best feasible, slack-consistent sample selected classically (solve_qaoa).',
  },
}

export const SOLVER_ORDER: SolverKey[] = ['greedy', 'exact', 'qaoa']

/*
 * Shapes returned by the WATERWEAVE API (src/waterweave/api). Field names
 * match the Python side exactly; nothing here is computed in the browser.
 */

export type Allocation = Record<string, Record<string, number>>

export interface NeighborhoodSpec {
  id: string
  name: string
  demand_by_slot: Record<string, number>
  priority_weight: number
  storage_capacity_units: number
}

export interface ScenarioSpec {
  name: string
  description: string
  slots: string[]
  supply_by_slot: Record<string, number>
  neighborhoods: NeighborhoodSpec[]
  seed: number
}

export interface Preset {
  id: string
  label: string
  summary: string
  provenance: 'synthetic' | 'illustrative'
  scenario: ScenarioSpec
}

export interface SolveSettings {
  include_qaoa: boolean
  fairness_weight: number
  penalty_weight?: number | null
  p: number
  shots: number
  maxiter: number
  seed?: number | null
}

/** Output of waterweave.metrics.evaluate_allocation. */
export interface Metrics {
  total_demand_units: number
  total_allocated_units: number
  unmet_demand_units: number
  weighted_shortage: number
  service_level: number
  fairness_score: number
  disparity: number
  feasible: number
  invalid_entries: number
  demand_violation_units: number
  supply_violation_units: number
  storage_violation_units: number
}

export type SolverKey = 'greedy' | 'exact' | 'qaoa'

export interface CircuitGate {
  name: string
  qubits: number[]
  params: number[]
}

export interface CircuitInfo {
  num_qubits: number
  depth: number
  gate_counts: Record<string, number>
  layers: number
  gammas: number[]
  betas: number[]
  gates: CircuitGate[]
}

export interface DecodedSample {
  bitstring: string
  decision_bits: number[]
  slack_bits: number[]
  allocation: Allocation
}

/** QAOA telemetry keys documented in docs/INTERFACES.md. */
export interface QaoaMetadata {
  solver_type: 'quantum_approximate'
  layers_p: number
  shots: number
  seed: number
  num_qubits: number
  circuit_depth: number
  optimizer: string
  optimizer_iterations: number
  optimizer_converged: boolean
  optimizer_status: string
  grid_evaluations: number
  total_evaluations: number
  optimal_gammas: number[]
  optimal_betas: number[]
  sampled_unique_bitstrings: number
  feasible_samples_ratio: number
  modal_bitstring: string
  modal_bitstring_feasible: boolean
  modal_bitstring_objective: number | null
  modal_bitstring_count: number
  selection_rule: string
  best_bitstring: string
  qubo_energy: number
  slack_consistent: boolean
  fairness_weight: number
  penalty_weight: number
  quantum_advantage_claimed: false
}

export interface SolverOutcome {
  key: SolverKey
  solver_name: string
  status: 'ok' | 'error' | 'skipped'
  error: string | null
  allocation: Allocation | null
  objective_value: number | null
  feasible: boolean
  metrics: Metrics | null
  runtime_seconds: number
  gap_to_exact: number | null
  metadata: Record<string, unknown>
  circuit: CircuitInfo | null
  samples: { best: DecodedSample | null; modal: DecodedSample | null } | null
}

export interface EngineInfo {
  python: string
  qiskit: string | null
  numpy: string
  scipy: string
  max_qaoa_qubits: number
}

export interface ModelSummary {
  n_decision: number
  n_slack: number
  n_vars: number
  fairness_weight: number
  penalty_weight: number
  decision_vars: { index: number; neighborhood_id: string; slot: string; name: string }[]
  slack_vars: { index: number; name: string }[]
  qaoa_within_budget: boolean
  max_qaoa_qubits: number
}

export interface ModelDetails extends ModelSummary {
  qubo: { offset: number; linear: number[]; quadratic: [number, number, number][] }
  ising: { offset: number; h: number[]; J: [number, number, number][] }
  circuit_structure: { p: number; depth: number; gate_counts: Record<string, number> }[]
}

export interface ReferenceOutcome {
  allocation: Allocation
  objective_value: number
  metrics: Metrics
}

/** Where a displayed run came from: executed now, or the bundled recording. */
export type RunSource = 'live' | 'recorded'

export interface SolveResponse {
  run_id: string
  executed_at: string
  source: RunSource
  scenario: ScenarioSpec
  settings: Required<Omit<SolveSettings, 'penalty_weight' | 'seed'>> & {
    penalty_weight: number
    penalty_weight_was_default: boolean
    seed: number
  }
  model: ModelSummary
  results: SolverOutcome[]
  reference: { deliver_nothing: ReferenceOutcome }
  wall_seconds: number
  engine: EngineInfo
}

export interface EvaluateResponse {
  metrics: Metrics
  objective_value: number
  fairness_weight: number
  penalty_weight: number
}

export interface Observation {
  provider: { id: string; name: string; organization: string; url: string }
  dataset_id: string
  geographic_level: string
  geographic_id: string
  variable: string
  value: number | null
  unit: string
  source_timestamp: string | null
  retrieval_timestamp: string
  source_age_seconds: number | null
  retrieval_age_seconds: number
  served_from_cache: boolean
  quality: { status: string; missing: boolean; error_details: string | null }
}

export interface DataSourcesResponse {
  requested_live: boolean
  offline_mode: boolean
  fetched_at: string
  observations: Observation[]
  skipped: { provider: { id: string; name: string; url: string }; reason: string }[]
  scenario_effect: {
    rainfall_heuristic_enabled: boolean
    supply_changed: boolean
    supply_by_slot: Record<string, number>
    default_supply_by_slot: Record<string, number>
    priority_weight_changes: { id: string; default: number | null; data_informed: number }[]
  }
}

export interface BenchmarkSummaryRow {
  solver_name: string
  qaoa_p: number | null
  runs: number
  ok_runs: number
  failed_runs: number
  feasible_rate: number | null
  hit_optimum_rate: number | null
  objective_mean: number | null
  objective_sd: number | null
  objective_min: number | null
  objective_max: number | null
  approx_ratio_mean: number | null
  runtime_mean_s: number | null
  runtime_median_s: number | null
  runtime_max_s: number | null
  feasible_sample_ratio_mean: number | null
  modal_feasible_rate: number | null
  state_p_optimal_mean: number | null
  state_p_feasible_mean: number | null
  state_p_feasible_no_penalty_mean: number | null
  state_p_optimal_no_penalty_mean: number | null
}

export interface BenchmarkInstance {
  file: string
  instance: string
  timestamp_utc: string
  synthetic_notice: string
  parameters: {
    fairness_weight: number
    penalty_weight: number
    shots: number
    maxiter: number
    seeds: number[]
    p_values: number[]
  }
  exact_optimum_objective: number
  seed_note: string
  provenance: Record<string, string | boolean>
  summary: BenchmarkSummaryRow[]
  audit_checks: { name: string; status: string; detail: string | null }[]
  /** Facts from the benchmark's exhaustive enumeration; empty if the audit was skipped. */
  audit_facts: Partial<{
    n_states: number
    n_feasible_states: number
    n_optimal_ties: number
    optimal_objective: number
    uniform_p_feasible_pattern: number
    uniform_p_optimal_pattern: number
    best_infeasible_objective: number
    serve_nobody_alpha_threshold: number
    n_qubits: number
    n_slack_vars: number
  }>
  limitations: string[]
}

export interface BenchmarkResponse {
  default?: BenchmarkInstance
  small?: BenchmarkInstance
}

export interface HealthResponse {
  status: 'ok'
  server_time: string
  engine: EngineInfo
  offline_mode: boolean
  frontend_built: boolean
}

export interface ValidationProblem {
  field: string
  message: string
}

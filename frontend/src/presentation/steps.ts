/*
 * The guided presentation, step by step. Captions (for the audience) and
 * notes (for the presenter) are built from the current results, so the
 * presenter never reads out a number the app has not produced.
 */
import type { DataSourcesResponse, SolveResponse, SolverOutcome } from '../api/types'
import type { BenchmarkFacts } from '../lib/benchmark'
import { formatGap, formatNumber, formatPercent, formatSeconds } from '../lib/format'
import type { ScenarioFacts } from '../lib/scenario'
import { numberWord } from '../lib/scenario'

export type StepAction =
  | 'load-default'
  | 'run-classical'
  | 'run-quantum'
  | 'ensure-results'
  | 'fetch-data'
  | 'load-benchmark'

export interface StepContext {
  facts: ScenarioFacts | null
  run: SolveResponse | null
  bench: BenchmarkFacts | null
  data: DataSourcesResponse | null
  /** Facts of the default scenario, which the first step's page shows whatever is selected. */
  introFacts?: ScenarioFacts | null
  /** 'recorded' when results come from the recorded run rather than a live engine. */
  mode?: 'live' | 'recorded'
}

export interface StepDef {
  id: string
  /** Chapter title shown to the audience and the presenter. */
  title: string
  route: string
  /** data-present-id of the element to scroll to and highlight. */
  target: string
  durationMs: number
  action?: StepAction
  /** What the action is doing, for the loading state. */
  actionLabel?: string
  caption: (ctx: StepContext) => string
  notes: (ctx: StepContext) => string[]
}

const result = (run: SolveResponse | null, key: SolverOutcome['key']) =>
  run?.results.find((r) => r.key === key && r.status === 'ok') ?? null

const served = (r: SolverOutcome) => `${r.metrics!.total_demand_units - r.metrics!.unmet_demand_units} of ${r.metrics!.total_demand_units}`

export const STEPS: StepDef[] = [
  {
    id: 'problem',
    title: 'The problem',
    route: '/',
    target: 'problem',
    durationMs: 22_000,
    caption: ({ facts, introFacts }) => {
      const shown = introFacts ?? facts
      return shown
        ? `${numberWord(shown.requests, true)} deliveries are requested, but there is water for ${numberWord(shown.supply)}. Who gets it?`
        : 'More water is requested than there is. Who gets it?'
    },
    notes: ({ facts, introFacts }) => [
      'When demand exceeds supply, a utility has to decide which neighborhoods get water in which delivery slot.',
      'Each crossing in the weave is one request: a neighborhood (row) wants one unit of water in a slot (column).',
      (introFacts ?? facts)
        ? `Today: ${(introFacts ?? facts)!.requests} requests and ${(introFacts ?? facts)!.supply} units of water, so at least ${Math.max(0, (introFacts ?? facts)!.requests - (introFacts ?? facts)!.supply)} requests cannot be met.`
        : 'The scenario has not loaded yet; describe the problem in general terms.',
    ],
  },
  {
    id: 'scenario',
    title: 'The scenario',
    route: '/workspace',
    target: 'scenario',
    durationMs: 22_000,
    action: 'load-default',
    actionLabel: 'Loading the default synthetic scenario.',
    caption: () => 'A small synthetic day: four neighborhoods, two delivery slots, made up so every answer can be checked.',
    notes: () => [
      'Say clearly that the numbers are synthetic, chosen to be small enough to check by hand.',
      'Priority weights set how much one unit of shortage costs in each neighborhood: Lakeside counts double.',
      'Everything here can be edited: selecting a crossing adds or removes a request.',
    ],
  },
  {
    id: 'constraints',
    title: 'The rules',
    route: '/workspace',
    target: 'constraints',
    durationMs: 24_000,
    caption: ({ facts }) => {
      const limited = facts?.storageLimited[0]
      return limited
        ? `Every plan must respect supply per slot and storage: ${limited.name} can store only ${limited.storage} of the ${limited.requested} units it asked for.`
        : 'Every plan must respect the supply in each slot and the storage of each neighborhood.'
    },
    notes: ({ facts }) => [
      ...(facts?.scarceSlots.map((s) => `${s.slot}: ${s.requested} requests for ${s.supply} units.`) ?? []),
      facts
        ? `${facts.requests} yes-or-no decisions give ${facts.plans} possible plans.`
        : 'Each request is a yes-or-no decision.',
      'The classical solvers only accept plans that follow the rules; the QAOA circuit can also produce rule-breaking plans, which carry a large penalty.',
    ],
  },
  {
    id: 'classical',
    title: 'Classical solvers',
    route: '/workspace',
    target: 'results',
    durationMs: 30_000,
    action: 'run-classical',
    actionLabel: 'Running greedy and exact search on the engine.',
    caption: ({ run, facts }) => {
      const exact = result(run, 'exact')
      const greedy = result(run, 'greedy')
      if (!exact || !greedy) return 'Two classical solvers: a quick rule of thumb and a search of every plan.'
      return `Exact search checked all ${facts?.plans ?? 'possible'} plans in ${formatSeconds(exact.runtime_seconds)}: best score ${formatNumber(exact.objective_value)}. Greedy scored ${formatNumber(greedy.objective_value)}.`
    },
    notes: ({ run, mode }) => {
      const exact = result(run, 'exact')
      const greedy = result(run, 'greedy')
      return [
        mode === 'recorded' || run?.source === 'recorded'
          ? 'These results come from a recorded run of the Python engine, not a live run. Say so.'
          : 'These results are being computed live by the Python engine.',
        'Greedy builds a plan one delivery at a time. It is fast but can miss the best plan.',
        'Exact search scores every plan, so it is certain to find the best one for this scoring; its work doubles with each extra request.',
        exact && greedy
          ? `Exact: score ${formatNumber(exact.objective_value)}, ${served(exact)} requests met. Greedy: ${formatNumber(greedy.objective_value)}, ${served(greedy)} met. Lower is better.`
          : 'If the run fails, say so and continue: the error is shown on screen.',
      ]
    },
  },
  {
    id: 'quantum',
    title: 'Quantum optimisation',
    route: '/workspace',
    // QAOA's numbers and sampling facts; the whole card is taller than a laptop screen.
    target: 'solver-qaoa-numbers',
    durationMs: 32_000,
    action: 'run-quantum',
    actionLabel: 'Running QAOA: optimising and sampling the circuit.',
    caption: ({ run }) => {
      const q = result(run, 'qaoa')
      if (!q) return 'QAOA turns the same problem into a quantum circuit, simulated here on a classical computer.'
      const gap = q.gap_to_exact
      const versus = gap === null ? '' : Math.abs(gap) < 1e-9 ? ', the same as exact search' : `, ${formatGap(gap)} worse than exact search`
      return `QAOA simulated a ${String(q.metadata.num_qubits)}-qubit circuit and scored ${formatNumber(q.objective_value)}${versus}, in ${formatSeconds(q.runtime_seconds)}.`
    },
    notes: ({ run }) => {
      const q = result(run, 'qaoa')
      const md = q?.metadata as Record<string, number | boolean | string> | undefined
      return [
        'Each request becomes a qubit; slack qubits encode the supply and storage limits.',
        'A classical optimiser tunes the circuit, which is then sampled; the best sample that follows the rules is kept.',
        md
          ? `${formatPercent(md.feasible_samples_ratio as number)} of ${String(md.shots)} samples followed the rules; the most frequent one ${md.modal_bitstring_feasible ? 'did' : 'did not'}.`
          : 'If QAOA fails, the panel says so; nothing is put in its place.',
        'This is a noiseless simulation on this computer. No quantum hardware is involved.',
      ]
    },
  },
  {
    id: 'fairness',
    title: 'Results and fairness',
    route: '/workspace',
    target: 'fairness',
    durationMs: 28_000,
    // Only runs if the presenter jumped here without results on screen.
    action: 'ensure-results',
    actionLabel: 'Running the solvers, because there are no results on screen yet.',
    caption: ({ run }) => {
      const exact = result(run, 'exact')
      const nothing = run?.reference.deliver_nothing
      if (!exact || !nothing) return 'Fairness only means something next to how much water was delivered.'
      return `The best plan meets ${served(exact)} requests with a fairness score of ${formatNumber(exact.metrics!.fairness_score)}. Delivering nothing would score a "perfect" ${formatNumber(nothing.metrics.fairness_score)}.`
    },
    notes: ({ run }) => {
      const nothing = run?.reference.deliver_nothing
      return [
        "Each bar is one neighborhood's share of its request that was met.",
        'Fairness score = 1 minus the gap between the best- and worst-served neighborhoods.',
        nothing
          ? `Delivering nothing is perfectly even but scores ${formatNumber(nothing.objective_value)}: fairness alone is not a goal.`
          : 'Delivering nothing is perfectly even, which is why fairness is always shown with the water delivered.',
        'The fairness weight sets the trade-off; set very high, serving nobody becomes the best plan.',
      ]
    },
  },
  {
    id: 'data',
    title: 'Data integrity',
    route: '/data',
    target: 'data',
    durationMs: 26_000,
    action: 'fetch-data',
    actionLabel: 'Asking the data providers for their latest values.',
    caption: ({ data, mode }) => {
      const rain = data?.observations.find((o) => o.variable === 'rainfall_mm')
      if (mode === 'recorded') {
        return 'Recorded run: these are the labels the providers returned when it was recorded. Demand is synthetic, population illustrative.'
      }
      if (rain && !rain.quality.missing && rain.value !== null) {
        return `Live rainfall from Open-Meteo: ${formatNumber(rain.value, 1)} mm, shown for context only. Population figures are illustrative; demand is synthetic.`
      }
      if (data && data.requested_live === false && !rain) {
        return 'Live weather was not requested, so no network source was contacted. Demand is synthetic, population illustrative.'
      }
      if (rain?.quality.missing || data?.skipped.length) {
        return 'Live weather is unavailable right now, and nothing depends on it: demand is synthetic, population illustrative.'
      }
      return 'Every input is labelled: live, cached, illustrative, synthetic or unavailable.'
    },
    notes: ({ data, mode }) => [
      ...(mode === 'recorded'
        ? ['This is a recorded run: nothing was fetched just now. Say that the weather row shows what was captured earlier.']
        : []),
      'Rainfall is deliberately not used in any scenario: rain today does not tell us how much water the pipes carry today.',
      'The population figures are illustrative, not census records; they only feed one optional preset.',
      'There is no public live feed of Bengaluru reservoir or pipe data, so none is claimed.',
      data?.skipped.length || data?.observations.some((o) => o.quality.missing)
        ? 'The network source is unavailable here: point out that the row says so and the rest keeps working.'
        : 'If the network fails during a talk, this row says so and nothing else changes.',
    ],
  },
  {
    id: 'compare',
    title: 'Honest comparison',
    route: '/compare',
    target: 'benchmark',
    durationMs: 32_000,
    action: 'load-benchmark',
    actionLabel: 'Loading the recorded benchmark.',
    caption: ({ bench }) =>
      bench && bench.controlHits !== null
        ? `In ${bench.qaoaRuns} recorded runs QAOA found the best plan ${bench.qaoaHits} times. Random sampling with the same budget: ${bench.controlHits} of ${bench.controlRuns}.`
        : 'Same scenario, same score: does the quantum solver actually help?',
    notes: ({ bench }) => [
      'One run can be lucky, so the benchmark repeats runs over seeds and circuit depths.',
      'The control is random sampling with exactly as many samples as QAOA.',
      bench?.exactMedianSeconds !== null && bench?.qaoaMedianSeconds
        ? `Exact search takes about ${formatSeconds(bench.exactMedianSeconds)}; the QAOA simulation ${formatSeconds(bench.qaoaMedianSeconds[0])} to ${formatSeconds(bench.qaoaMedianSeconds[1])}.`
        : 'Exact search is far faster on this size of problem.',
      'So: no quantum advantage on this problem, and none is claimed.',
    ],
  },
  {
    id: 'conclusion',
    title: 'Conclusion',
    route: '/compare',
    target: 'conclusion',
    durationMs: 22_000,
    caption: () => 'A transparent, checked pipeline, honest about what a small simulation can and cannot show.',
    notes: () => [
      'Contribution: an explicit model of rationing, three solvers on one score, an independent audit and an honest benchmark.',
      'Limitations: one synthetic scenario, no hydraulics, weights are choices, simulation only.',
      'Next: larger instances, rule-preserving mixers, hardware runs with noise, stronger classical baselines, real data if published.',
    ],
  },
]

export const STEP_DURATIONS = STEPS.map((s) => s.durationMs)

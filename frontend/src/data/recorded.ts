/*
 * The recorded run: raw API responses captured by
 * scripts/export_demo_snapshot.py and verified against the engine by
 * tests/test_recorded_snapshot.py. Used only when the API cannot be reached;
 * everything taken from it is marked source: 'recorded'.
 */
import { isScenario, isSolveResponse } from '../api/client'
import type {
  BenchmarkResponse,
  DataSourcesResponse,
  ModelDetails,
  Preset,
  SolveResponse,
} from '../api/types'

export interface RecordingProvenance {
  capturedAt: string
  gitCommit: string
  command: string
  engine: { python: string; qiskit: string | null }
}

export interface Recording {
  provenance: RecordingProvenance
  presets: Preset[]
  classical: SolveResponse
  quantum: SolveResponse
  model: ModelDetails
  dataSources: DataSourcesResponse
  benchmark: BenchmarkResponse
}

interface RawRecording {
  kind: string
  captured_at: string
  git_commit: string
  command: string
  responses: {
    presets: Preset[]
    solve_classical: SolveResponse
    solve_quantum: SolveResponse
    model_default: ModelDetails
    data_sources_offline: DataSourcesResponse
    benchmark: BenchmarkResponse
  }
}

export function parseRecording(raw: unknown): Recording {
  const r = raw as RawRecording
  const res = r?.responses
  if (
    r?.kind !== 'waterweave-recorded-run' ||
    !res ||
    !isSolveResponse(res.solve_classical) ||
    !isSolveResponse(res.solve_quantum) ||
    !Array.isArray(res.presets) ||
    !res.presets.every((p) => isScenario(p.scenario))
  ) {
    throw new Error('The bundled recorded run is missing or malformed.')
  }
  const mark = (run: SolveResponse): SolveResponse => ({ ...run, source: 'recorded' })
  return {
    provenance: {
      capturedAt: r.captured_at,
      gitCommit: r.git_commit,
      command: r.command,
      engine: { python: res.solve_quantum.engine.python, qiskit: res.solve_quantum.engine.qiskit },
    },
    presets: res.presets,
    classical: mark(res.solve_classical),
    quantum: mark(res.solve_quantum),
    model: res.model_default,
    dataSources: res.data_sources_offline,
    benchmark: res.benchmark,
  }
}

let cached: Promise<Recording> | null = null

/** Loads the recording lazily so it stays out of the main bundle. */
export function loadRecording(): Promise<Recording> {
  cached ??= import('./recordedRun.json').then((m) => parseRecording(m.default))
  return cached
}

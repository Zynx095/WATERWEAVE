import type {
  BenchmarkResponse,
  DataSourcesResponse,
  EvaluateResponse,
  HealthResponse,
  ModelDetails,
  Preset,
  ScenarioSpec,
  SolveResponse,
  SolveSettings,
  Allocation,
  ValidationProblem,
} from './types'

export type ApiErrorKind = 'network' | 'timeout' | 'http' | 'aborted' | 'invalid-response'

/** An API failure with a message written for the person using the app. */
export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status?: number
  readonly problems: ValidationProblem[]

  constructor(kind: ApiErrorKind, message: string, status?: number, problems: ValidationProblem[] = []) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
    this.problems = problems
  }
}

export const isAbortError = (error: unknown): boolean =>
  error instanceof ApiError && error.kind === 'aborted'

export interface RequestOptions {
  signal?: AbortSignal
  timeoutMs?: number
}

const API_HINT = 'Start it with "python -m waterweave.api" and reload the page.'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function requestJson<T>(
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown },
  options: RequestOptions & { timeoutMs: number },
  validate: (value: unknown) => boolean,
): Promise<T> {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, options.timeoutMs)
  const onOuterAbort = () => controller.abort()
  if (options.signal?.aborted) controller.abort()
  options.signal?.addEventListener('abort', onOuterAbort, { once: true })

  let response: Response
  try {
    response = await fetch(path, {
      method: init.method ?? 'GET',
      headers: init.body === undefined ? { Accept: 'application/json' } : {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    })
  } catch (error) {
    if (timedOut) {
      throw new ApiError(
        'timeout',
        `The API did not answer within ${Math.round(options.timeoutMs / 1000)} seconds.`,
      )
    }
    if (controller.signal.aborted) {
      throw new ApiError('aborted', 'The request was cancelled.')
    }
    throw new ApiError('network', `Cannot reach the WATERWEAVE API. ${API_HINT}`)
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', onOuterAbort)
  }

  let payload: unknown = null
  const text = await response.text()
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    const detail = isObject(payload) && typeof payload.detail === 'string' ? payload.detail : null
    const problems =
      isObject(payload) && Array.isArray(payload.problems)
        ? (payload.problems as ValidationProblem[])
        : []
    if (response.status === 422) {
      const list = problems.map((p) => (p.field ? `${p.field}: ${p.message}` : p.message)).join('; ')
      throw new ApiError('http', `The request was rejected. ${list || detail || ''}`.trim(), 422, problems)
    }
    if (response.status === 404 && !detail) {
      throw new ApiError('http', `The API has no route ${path}. Is an older API version running?`, 404)
    }
    throw new ApiError(
      'http',
      detail ?? `The API answered with HTTP ${response.status}. ${API_HINT}`,
      response.status,
    )
  }

  if (payload === null || !validate(payload)) {
    throw new ApiError(
      'invalid-response',
      `The API returned an unexpected response for ${path}. Frontend and API versions may not match.`,
      response.status,
    )
  }
  return payload as T
}

// ---- response checks: enough structure that the UI can rely on it --------

const isNumberOrNull = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v))

export function isSolveResponse(value: unknown): boolean {
  if (!isObject(value) || !Array.isArray(value.results) || !isObject(value.scenario)) return false
  if (!isObject(value.model) || !isObject(value.reference) || !isObject(value.settings)) return false
  return value.results.every(
    (r) =>
      isObject(r) &&
      ['greedy', 'exact', 'qaoa'].includes(r.key as string) &&
      ['ok', 'error', 'skipped'].includes(r.status as string) &&
      isNumberOrNull(r.objective_value) &&
      typeof r.runtime_seconds === 'number' &&
      (r.status !== 'ok' || (isObject(r.allocation) && isObject(r.metrics))),
  )
}

export function isScenario(value: unknown): boolean {
  return (
    isObject(value) &&
    Array.isArray(value.slots) &&
    Array.isArray(value.neighborhoods) &&
    isObject(value.supply_by_slot)
  )
}

const isPresetList = (value: unknown) =>
  Array.isArray(value) && value.every((p) => isObject(p) && typeof p.id === 'string' && isScenario(p.scenario))
const isHealth = (value: unknown) => isObject(value) && value.status === 'ok' && isObject(value.engine)
const isModel = (value: unknown) =>
  isObject(value) && typeof value.n_vars === 'number' && Array.isArray(value.decision_vars)
const isEvaluate = (value: unknown) =>
  isObject(value) && isObject(value.metrics) && typeof value.objective_value === 'number'
const isDataSources = (value: unknown) =>
  isObject(value) && Array.isArray(value.observations) && isObject(value.scenario_effect)
const isBenchmark = (value: unknown) =>
  isObject(value) && (isObject(value.default) || isObject(value.small))

// ---- endpoints ---------------------------------------------------------------

export const api = {
  health: (options: RequestOptions = {}) =>
    requestJson<HealthResponse>('/api/health', {}, { timeoutMs: 5000, ...options }, isHealth),

  presets: (options: RequestOptions = {}) =>
    requestJson<Preset[]>('/api/presets', {}, { timeoutMs: 10000, ...options }, isPresetList),

  solve: (scenario: ScenarioSpec, settings: Partial<SolveSettings>, options: RequestOptions = {}) =>
    requestJson<SolveResponse>(
      '/api/solve',
      { method: 'POST', body: { scenario, settings } },
      { timeoutMs: 90000, ...options },
      isSolveResponse,
    ),

  model: (
    scenario: ScenarioSpec,
    weights: { fairness_weight: number; penalty_weight?: number | null },
    options: RequestOptions = {},
  ) =>
    requestJson<ModelDetails>(
      '/api/model',
      { method: 'POST', body: { scenario, ...weights } },
      { timeoutMs: 15000, ...options },
      isModel,
    ),

  evaluate: (
    scenario: ScenarioSpec,
    allocation: Allocation,
    weights: { fairness_weight: number; penalty_weight?: number | null },
    options: RequestOptions = {},
  ) =>
    requestJson<EvaluateResponse>(
      '/api/evaluate',
      { method: 'POST', body: { scenario, allocation, ...weights } },
      { timeoutMs: 15000, ...options },
      isEvaluate,
    ),

  dataSources: (params: { live: boolean; refresh?: boolean }, options: RequestOptions = {}) =>
    requestJson<DataSourcesResponse>(
      `/api/data-sources?live=${params.live}&refresh=${params.refresh ?? false}`,
      {},
      { timeoutMs: 25000, ...options },
      isDataSources,
    ),

  benchmark: (options: RequestOptions = {}) =>
    requestJson<BenchmarkResponse>('/api/benchmark', {}, { timeoutMs: 10000, ...options }, isBenchmark),
}

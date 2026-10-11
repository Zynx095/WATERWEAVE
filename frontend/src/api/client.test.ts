import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, isSolveResponse } from './client'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** A fetch that never answers but honours the abort signal, like a hung server. */
function hangingFetch() {
  return vi.fn((_url: string, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })
  })
}

const health = { status: 'ok', server_time: 'now', engine: { qiskit: '2.5.2' } }

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('api client', () => {
  it('returns parsed JSON for a valid response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(health)))
    await expect(api.health()).resolves.toMatchObject({ status: 'ok' })
  })

  it('explains how to start the API when it cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    const error = await api.health().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).kind).toBe('network')
    expect((error as ApiError).message).toContain('python -m waterweave.api')
  })

  it('times out a request that never answers', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', hangingFetch())
    const pending = api.health({ timeoutMs: 1000 }).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(1001)
    const error = (await pending) as ApiError
    expect(error.kind).toBe('timeout')
    expect(error.message).toContain('1 seconds')
  })

  it('reports a cancelled request as aborted, not as a failure', async () => {
    vi.stubGlobal('fetch', hangingFetch())
    const controller = new AbortController()
    const pending = api.health({ signal: controller.signal }).catch((e: unknown) => e)
    controller.abort()
    expect(((await pending) as ApiError).kind).toBe('aborted')
  })

  it('lists validation problems from a 422 answer', async () => {
    const body = {
      detail: 'The request is not valid.',
      problems: [{ field: 'scenario.neighborhoods.0.demand_by_slot', message: 'demand must be 0 or 1' }],
    }
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(body, 422)))
    const error = (await api.solve({} as never, {}).catch((e: unknown) => e)) as ApiError
    expect(error.status).toBe(422)
    expect(error.problems).toHaveLength(1)
    expect(error.message).toContain('demand must be 0 or 1')
  })

  it('passes the server explanation through for other errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ detail: 'Another solver run is still in progress.' }, 503)))
    const error = (await api.solve({} as never, {}).catch((e: unknown) => e)) as ApiError
    expect(error.status).toBe(503)
    expect(error.message).toBe('Another solver run is still in progress.')
  })

  it('rejects a response that does not have the expected shape', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ results: 'nope' })))
    const error = (await api.solve({} as never, {}).catch((e: unknown) => e)) as ApiError
    expect(error.kind).toBe('invalid-response')
  })

  it('sends the scenario and settings as JSON', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)
    await api.solve({ name: 'x' } as never, { include_qaoa: false }).catch(() => undefined)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/solve')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ scenario: { name: 'x' }, settings: { include_qaoa: false } })
  })
})

describe('isSolveResponse', () => {
  const base = { scenario: {}, model: {}, reference: {}, settings: {} }
  const ok = {
    key: 'exact',
    status: 'ok',
    objective_value: 6,
    runtime_seconds: 0.003,
    allocation: {},
    metrics: {},
  }

  it('accepts ok, failed and skipped results', () => {
    const failed = { ...ok, key: 'qaoa', status: 'error', objective_value: null, allocation: null, metrics: null }
    expect(isSolveResponse({ ...base, results: [ok, failed] })).toBe(true)
  })

  it('refuses an ok result without an allocation', () => {
    expect(isSolveResponse({ ...base, results: [{ ...ok, allocation: null }] })).toBe(false)
  })

  it('refuses unknown solver keys', () => {
    expect(isSolveResponse({ ...base, results: [{ ...ok, key: 'magic' }] })).toBe(false)
  })
})

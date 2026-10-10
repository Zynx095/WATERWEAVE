import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import recorded from '../data/recordedRun.json'
import { StoreProvider } from '../state/store'

/** Real API responses captured by scripts/export_demo_snapshot.py. */
export const fixtures = recorded.responses as unknown as Record<string, unknown> & {
  health: unknown
  presets: unknown[]
  solve_classical: { results: unknown[] }
  solve_quantum: { results: unknown[] }
  model_default: unknown
  data_sources_offline: unknown
  benchmark: unknown
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

type Handler = (init: RequestInit | undefined, url: string) => Response | Promise<Response>

/** Stubs fetch with API routes answered from the recorded fixtures. */
export function mockApi(overrides: Record<string, Handler> = {}) {
  const handlers: Record<string, Handler> = {
    '/api/health': () => json(fixtures.health),
    '/api/presets': () => json(fixtures.presets),
    '/api/solve': (init) => {
      const body = JSON.parse(String(init?.body ?? '{}'))
      return json(body.settings?.include_qaoa === false ? fixtures.solve_classical : fixtures.solve_quantum)
    },
    '/api/model': () => json(fixtures.model_default),
    '/api/data-sources': () => json(fixtures.data_sources_offline),
    '/api/benchmark': () => json(fixtures.benchmark),
    ...overrides,
  }
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const handler = handlers[url.split('?')[0]]
    if (!handler) return json({ detail: `no mock for ${url}` }, 404)
    return handler(init, url)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

export function offlineApi() {
  const fetchMock = vi.fn(async () => Promise.reject(new TypeError('Failed to fetch')))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

export function renderWithStore(ui: ReactNode, route = '/') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <StoreProvider>{ui}</StoreProvider>
    </MemoryRouter>,
  )
}

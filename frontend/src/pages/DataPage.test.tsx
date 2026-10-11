import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DataSourcesResponse, Observation } from '../api/types'
import { fixtures, json, mockApi, renderWithStore } from '../test/utils'
import { DataPage } from './DataPage'
import { WorkspacePage } from './WorkspacePage'

afterEach(() => vi.unstubAllGlobals())

const offline = fixtures.data_sources_offline as DataSourcesResponse

function withRain(change: Partial<Observation>): DataSourcesResponse {
  const rain: Observation = {
    provider: { id: 'open_meteo', name: 'Open-Meteo Weather API', organization: 'Open-Meteo', url: 'https://open-meteo.com/' },
    dataset_id: 'current_weather',
    geographic_level: 'city',
    geographic_id: 'bengaluru',
    variable: 'rainfall_mm',
    value: 1.2,
    unit: 'mm',
    source_timestamp: '2026-10-10T18:45:00+00:00',
    retrieval_timestamp: '2026-10-10T18:50:00+00:00',
    source_age_seconds: 300,
    retrieval_age_seconds: 0.2,
    served_from_cache: false,
    quality: { status: 'VERIFIED_LIVE', missing: false, error_details: null },
    ...change,
  }
  return { ...offline, requested_live: true, skipped: [], observations: [rain, ...offline.observations] }
}

const ledger = () => screen.getByRole('table', { name: /Data inputs/ })
const row = (name: RegExp) => within(ledger()).getByRole('rowheader', { name }).closest('tr')!

describe('DataPage', () => {
  it('labels every input, starting without the network', async () => {
    const fetchMock = mockApi()
    renderWithStore(<DataPage />)
    await screen.findByRole('table', { name: /Data inputs/ })
    expect(fetchMock.mock.calls.some(([url]) => String(url) === '/api/data-sources?live=false&refresh=false')).toBe(true)
    expect(row(/Rainfall, Bengaluru/)).toHaveTextContent('Not fetched')
    expect(within(ledger()).getAllByText('Illustrative')).toHaveLength(4)
    // Illustrative figures are not credited to a census or given a census date.
    const hillview = row(/Population, Hillview \(N1\)/)
    expect(hillview).toHaveTextContent('not census records')
    expect(hillview).toHaveTextContent('Not dated')
    expect(ledger()).not.toHaveTextContent('2011')
    expect(ledger()).not.toHaveTextContent('BBMP Ward Census')
    expect(row(/Rainfall, Bengaluru/)).toHaveTextContent('Not fetched yet')
    expect(row(/Demand, supply and storage/)).toHaveTextContent('7 requests, 2 + 2 units of supply, storage 1 to 2')
    expect(row(/Reservoir levels/)).toHaveTextContent('No public source')
  })

  it('shows a live observation with its time and that it changes nothing', async () => {
    const fetchMock = mockApi()
    const user = userEvent.setup()
    renderWithStore(<DataPage />)
    await screen.findByRole('table', { name: /Data inputs/ })
    mockApi({ '/api/data-sources': () => json(withRain({})) })
    await user.click(screen.getByRole('button', { name: 'Fetch live weather' }))
    await waitFor(() => expect(row(/Rainfall, Bengaluru/)).toHaveTextContent('Live observation'))
    expect(row(/Rainfall, Bengaluru/)).toHaveTextContent('1.2 mm')
    expect(row(/Rainfall, Bengaluru/)).toHaveTextContent('5 min old')
    expect(row(/Rainfall, Bengaluru/)).toHaveTextContent('Not used by any scenario.')
    expect(screen.getByText(/Unchanged: 2 morning and 2 evening units/)).toBeInTheDocument()
    expect(fetchMock).toBeDefined()
  })

  it('marks cached observations with their age', async () => {
    mockApi({ '/api/data-sources': () => json(withRain({ served_from_cache: true, retrieval_age_seconds: 130 })) })
    renderWithStore(<DataPage />)
    await screen.findByRole('table', { name: /Data inputs/ })
    expect(row(/Rainfall, Bengaluru/)).toHaveTextContent('Cached, fetched 2 min ago')
  })

  it('reports a failed live fetch without inventing a value', async () => {
    mockApi({
      '/api/data-sources': () =>
        json(
          withRain({
            value: null,
            source_timestamp: null,
            source_age_seconds: null,
            quality: { status: 'ERROR', missing: true, error_details: 'Network error: no route to host' },
          }),
        ),
    })
    renderWithStore(<DataPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Open-Meteo could not be reached: Network error')
    expect(row(/Rainfall, Bengaluru/)).toHaveTextContent('Unavailable')
    expect(row(/Rainfall, Bengaluru/)).not.toHaveTextContent('mm')
  })

  it('opens the illustrative-population variant in the workspace', async () => {
    mockApi()
    const user = userEvent.setup()
    renderWithStore(
      <Routes>
        <Route path="/data" element={<DataPage />} />
        <Route path="/workspace" element={<WorkspacePage />} />
      </Routes>,
      '/data',
    )
    expect(await screen.findByText(/Hillview: 1.5/)).toHaveTextContent('Hillview: 1.5 → 1.4')
    await user.click(screen.getByRole('button', { name: 'Open this variant in the workspace' }))
    expect(await screen.findByRole('combobox', { name: 'Start from' })).toHaveValue('illustrative-population')
    expect(screen.getByText('Illustrative')).toBeInTheDocument()
  })
})

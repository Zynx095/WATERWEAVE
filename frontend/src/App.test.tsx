import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from './App'
import { mockApi, offlineApi, renderWithStore } from './test/utils'

afterEach(() => vi.unstubAllGlobals())

describe('application shell', () => {
  it('offers every section in the main navigation and marks the current page', async () => {
    mockApi()
    renderWithStore(<AppRoutes />, '/')
    const nav = screen.getByRole('navigation', { name: 'Main' })
    for (const label of ['Overview', 'Workspace', 'Classical vs quantum', 'Data sources', 'Quantum lab']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    }
    expect(nav.querySelector('[aria-current="page"]')).toHaveTextContent('Overview')
    expect(await screen.findByText('Engine connected')).toBeInTheDocument()
  })

  it('navigates between pages and updates the title', async () => {
    mockApi()
    const user = userEvent.setup()
    renderWithStore(<AppRoutes />, '/')
    await user.click(screen.getByRole('link', { name: 'Quantum lab' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Quantum lab' })).toBeInTheDocument()
    expect(document.title).toBe('Quantum lab | WATERWEAVE')
    expect(screen.getByRole('link', { name: 'Quantum lab' })).toHaveAttribute('aria-current', 'page')
  })

  it('provides a skip link to the main content', () => {
    mockApi()
    renderWithStore(<AppRoutes />, '/')
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main')
    expect(document.getElementById('main')).toBeInTheDocument()
  })

  it('shows a not-found page for unknown addresses', () => {
    mockApi()
    renderWithStore(<AppRoutes />, '/nowhere')
    expect(screen.getByRole('heading', { name: 'There is no page here' })).toBeInTheDocument()
  })

  it('explains an unreachable API and offers retry and the recorded run', async () => {
    offlineApi()
    const user = userEvent.setup()
    renderWithStore(<AppRoutes />, '/')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('python -m waterweave.api')
    expect(screen.getByText('API offline')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show recorded run' }))
    await waitFor(() => expect(screen.getByText(/Nothing is being executed now/)).toBeInTheDocument())
    expect(screen.getByText('Recorded run', { selector: '.pill' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('reconnects when the API comes back', async () => {
    offlineApi()
    const user = userEvent.setup()
    renderWithStore(<AppRoutes />, '/')
    await screen.findByRole('alert')
    mockApi()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Engine connected')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

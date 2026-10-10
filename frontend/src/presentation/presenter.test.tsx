import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../App'
import { mockApi, renderWithStore } from '../test/utils'
import { parseAudienceMessage, parsePresenterMessage } from './channel'
import { PresenterPage } from './PresenterPage'

afterEach(() => vi.unstubAllGlobals())

describe('presenter channel messages', () => {
  it('accepts hello and presenter commands', () => {
    expect(parsePresenterMessage({ kind: 'hello' })).toEqual({ kind: 'hello' })
    expect(parsePresenterMessage({ kind: 'command', event: { type: 'NEXT' } })).toEqual({
      kind: 'command',
      event: { type: 'NEXT' },
    })
    expect(parsePresenterMessage({ kind: 'command', event: { type: 'GOTO', index: 3 } })).not.toBeNull()
  })

  it('rejects anything a presenter must not send, or malformed data', () => {
    for (const data of [
      null,
      'NEXT',
      { kind: 'command', event: { type: 'TICK', deltaMs: 99999 } },
      { kind: 'command', event: { type: 'ACTION_DONE', token: 1 } },
      { kind: 'command', event: { type: 'GOTO', index: 'two' } },
      { kind: 'command', event: { type: 'SET_AUTO', auto: 'yes' } },
      { kind: 'something' },
    ]) {
      expect(parsePresenterMessage(data)).toBeNull()
    }
    expect(parseAudienceMessage({ kind: 'snapshot', snapshot: { state: {} } })).toBeNull()
  })
})

describe('presenter view', () => {
  it('waits for a main window and offers to open one', () => {
    render(
      <MemoryRouter>
        <PresenterPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Presenter view' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for the main window')
    expect(screen.getByRole('button', { name: 'Open the main window' })).toBeInTheDocument()
  })

  it('mirrors the running presentation and controls it from the second window', async () => {
    mockApi()
    const user = userEvent.setup()
    renderWithStore(<AppRoutes />, '/')
    await user.click(await screen.findByRole('button', { name: 'Start the guided presentation' }))
    await user.click(await screen.findByRole('button', { name: 'Start with the live engine' }))
    const bar = await screen.findByRole('region', { name: 'Presentation controls' })

    const presenter = render(
      <MemoryRouter>
        <PresenterPage />
      </MemoryRouter>,
    )
    const view = within(presenter.container)
    await waitFor(() => expect(view.getByRole('status')).toHaveTextContent('Linked to the main window'))
    // With a presenter view open, notes stay off the audience screen.
    await waitFor(() => expect(within(bar).getByRole('button', { name: 'Presenter notes' })).toBeDisabled())
    expect(view.getByRole('heading', { level: 2, name: 'The problem' })).toBeInTheDocument()
    expect(view.getByText(/Today: 7 requests and 4 units of water/)).toBeInTheDocument()
    expect(view.getByText('The scenario', { selector: '.presenter__next-title' })).toBeInTheDocument()

    await user.click(view.getByRole('button', { name: /Next/ }))
    await waitFor(() => expect(bar).toHaveTextContent('Step 2 of 9'))
    await waitFor(() => expect(view.getByRole('heading', { level: 2, name: 'The scenario' })).toBeInTheDocument())

    await user.click(view.getByRole('button', { name: 'Pause' }))
    await waitFor(() => expect(bar).toHaveTextContent('Paused'))

    await user.click(view.getByRole('button', { name: 'Exit presentation' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Presentation controls' })).not.toBeInTheDocument())
    await waitFor(() => expect(view.getByText(/not presenting/)).toBeInTheDocument())
  })
})

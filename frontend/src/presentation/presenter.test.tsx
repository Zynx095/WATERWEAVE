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
    expect(parsePresenterMessage({ kind: 'command', target: 'tab-a', event: { type: 'NEXT' } })).toEqual({
      kind: 'command',
      target: 'tab-a',
      event: { type: 'NEXT' },
    })
    expect(parsePresenterMessage({ kind: 'command', target: 'tab-a', event: { type: 'GOTO', index: 3 } })).not.toBeNull()
  })

  it('rejects anything a presenter must not send, or malformed data', () => {
    for (const data of [
      null,
      'NEXT',
      { kind: 'command', event: { type: 'NEXT' } }, // no target window
      { kind: 'command', target: '', event: { type: 'NEXT' } },
      { kind: 'command', target: 'tab-a', event: { type: 'TICK', deltaMs: 99999 } },
      { kind: 'command', target: 'tab-a', event: { type: 'ACTION_DONE', token: 1 } },
      { kind: 'command', target: 'tab-a', event: { type: 'GOTO', index: 'two' } },
      { kind: 'command', target: 'tab-a', event: { type: 'SET_AUTO', auto: 'yes' } },
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

describe('presenter ownership with several app windows', () => {
  const snap = (tabId: string, status: 'idle' | 'running') => ({
    kind: 'snapshot',
    snapshot: {
      tabId,
      state: { status, index: 0, elapsedMs: 0, pace: 1, auto: true, token: 1, action: { status: 'idle', error: null } },
      steps: [{ id: 'problem', title: 'The problem' }],
      caption: 'caption',
      notes: [],
      next: null,
      remaining: { stepMs: 1000, totalMs: 2000 },
      actionLabel: null,
      mode: 'live',
    },
  })

  /** Plays the part of app windows: answers on the same channel, records what commands arrive. */
  function windows() {
    const received: { target: string; type: string }[] = []
    const listener = new BroadcastChannel('waterweave-presentation')
    listener.onmessage = (e: MessageEvent) => {
      if (e.data?.kind === 'command') received.push({ target: e.data.target, type: e.data.event.type })
    }
    const talker = new BroadcastChannel('waterweave-presentation')
    return { talker, received, close: () => [listener, talker].forEach((c) => c.close()) }
  }

  it('pins to the first window and sends commands naming it, even when another answers', async () => {
    const user = userEvent.setup()
    const w = windows()
    const view = render(
      <MemoryRouter>
        <PresenterPage />
      </MemoryRouter>,
    )
    w.talker.postMessage(snap('tab-a', 'idle'))
    await waitFor(() => expect(within(view.container).getByRole('status')).toHaveTextContent('Linked'))
    w.talker.postMessage(snap('tab-b', 'idle')) // a second idle window must not take over
    await user.click(within(view.container).getByRole('button', { name: /Start without preflight/ }))
    await waitFor(() => expect(w.received.length).toBeGreaterThan(0))
    expect(w.received.every((c) => c.target === 'tab-a')).toBe(true)
    w.close()
  })

  it('moves to a window that starts presenting while the pinned one is idle', async () => {
    const user = userEvent.setup()
    const w = windows()
    const view = render(
      <MemoryRouter>
        <PresenterPage />
      </MemoryRouter>,
    )
    w.talker.postMessage(snap('tab-a', 'idle'))
    await waitFor(() => expect(within(view.container).getByRole('status')).toHaveTextContent('Linked'))
    w.talker.postMessage(snap('tab-b', 'running'))
    const next = await within(view.container).findByRole('button', { name: /Next/ })
    await user.click(next)
    await waitFor(() => expect(w.received.some((c) => c.type === 'NEXT')).toBe(true))
    expect(w.received.filter((c) => c.type === 'NEXT').every((c) => c.target === 'tab-b')).toBe(true)
    w.close()
  })
})

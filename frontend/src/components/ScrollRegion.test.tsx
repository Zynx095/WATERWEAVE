import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ScrollRegion } from './ScrollRegion'

describe('ScrollRegion', () => {
  it('is a labelled, focusable region so keyboard users can scroll it', () => {
    render(
      <ScrollRegion className="table-scroll" label="Wide table">
        <p>content</p>
      </ScrollRegion>,
    )
    expect(screen.getByRole('region', { name: 'Wide table' })).toHaveAttribute('tabindex', '0')
    expect(screen.queryByText(/Scroll sideways/)).toBeNull()
  })

  it('adds a visual scroll cue outside the region when asked', () => {
    render(
      <ScrollRegion className="table-scroll" label="Wide table" hint>
        <p>content</p>
      </ScrollRegion>,
    )
    const cue = screen.getByText('Scroll sideways to see every column.')
    expect(cue).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('region', { name: 'Wide table' })).not.toContainElement(cue)
  })
})

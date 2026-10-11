import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ScrollRegion } from './ScrollRegion'

/** jsdom has no layout; give every element these scroll and client widths. */
function setWidths(scrollWidth: number, clientWidth: number) {
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => scrollWidth })
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => clientWidth })
}

afterEach(() => {
  // Back to jsdom's own (zero) widths.
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollWidth')
  Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth')
})

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

  it('says it scrolls sideways while the content is wider than the region', () => {
    setWidths(720, 358)
    render(
      <ScrollRegion className="table-scroll" label="Wide table" hint>
        <p>content</p>
      </ScrollRegion>,
    )
    const cue = screen.getByText('Scroll sideways to see every column.')
    expect(cue).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('region', { name: 'Wide table' })).not.toContainElement(cue)
  })

  it('stays quiet when everything fits', () => {
    setWidths(700, 700)
    render(
      <ScrollRegion className="table-scroll" label="Wide table" hint>
        <p>content</p>
      </ScrollRegion>,
    )
    expect(screen.queryByText(/Scroll sideways/)).toBeNull()
  })
})

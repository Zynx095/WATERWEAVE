import type { ReactNode } from 'react'

/**
 * A container that may scroll sideways on narrow screens. It is focusable
 * and labelled so keyboard users can scroll it too (WCAG 2.1.1).
 */
export function ScrollRegion({ label, className, children }: { label: string; className: string; children: ReactNode }) {
  return (
    <div className={className} role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  )
}

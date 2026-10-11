import type { ReactNode } from 'react'

/**
 * A container that may scroll sideways on narrow screens. It is focusable
 * and labelled so keyboard users can scroll it too (WCAG 2.1.1), and on
 * narrow screens it says that it scrolls.
 */
export function ScrollRegion({
  label,
  className,
  children,
  hint = false,
}: {
  label: string
  className: string
  children: ReactNode
  /** Show "scroll sideways" on narrow screens, for tables wider than a phone. */
  hint?: boolean
}) {
  return (
    <>
      {hint && (
        <p className="scroll-hint" aria-hidden="true">
          Scroll sideways to see every column.
        </p>
      )}
      <div className={className} role="region" aria-label={label} tabIndex={0}>
        {children}
      </div>
    </>
  )
}

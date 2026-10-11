import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * A container that may scroll sideways on narrow screens. It is focusable
 * and labelled so keyboard users can scroll it too (WCAG 2.1.1). With `hint`,
 * it says that it scrolls whenever its content is actually wider than it.
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
  /** Say that it scrolls sideways while the content overflows; a string replaces the default wording. */
  hint?: boolean | string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [overflowing, setOverflowing] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!hint || !element) return
    const check = () => setOverflowing(element.scrollWidth > element.clientWidth + 1)
    check()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(check)
    observer.observe(element)
    if (element.firstElementChild) observer.observe(element.firstElementChild)
    return () => observer.disconnect()
  }, [hint])

  return (
    <>
      {hint && overflowing && (
        <p className="scroll-hint" aria-hidden="true">
          {typeof hint === 'string' ? hint : 'Scroll sideways to see every column.'}
        </p>
      )}
      <div ref={ref} className={className} role="region" aria-label={label} tabIndex={0}>
        {children}
      </div>
    </>
  )
}

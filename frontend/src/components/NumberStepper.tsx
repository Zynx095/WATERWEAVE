import { Minus, Plus } from 'lucide-react'
import { useEffect, useId, useState } from 'react'

export interface NumberStepperProps {
  label: string
  /** Shown visually; the full label is always available to assistive tech. */
  visibleLabel?: string
  value: number
  min: number
  max: number
  step?: number
  /** Decimal places shown and accepted. */
  digits?: number
  onChange: (value: number) => void
  disabled?: boolean
  hint?: string
  /** Narrower control for table cells. */
  compact?: boolean
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/**
 * A number input with large decrease/increase buttons. Typed values are
 * validated on blur; out-of-range or non-numeric input shows a message and
 * is not applied.
 */
export function NumberStepper({
  label,
  visibleLabel,
  value,
  min,
  max,
  step = 1,
  digits = 0,
  onChange,
  disabled = false,
  hint,
  compact = false,
}: NumberStepperProps) {
  const id = useId()
  const [draft, setDraft] = useState(value.toFixed(digits))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDraft(value.toFixed(digits))
    setError(null)
  }, [value, digits])

  const commit = (raw: string) => {
    const parsed = Number(raw)
    if (raw.trim() === '' || !Number.isFinite(parsed)) {
      setError('Enter a number.')
      return
    }
    if (parsed < min || parsed > max) {
      setError(`Use a value from ${min} to ${max}.`)
      return
    }
    const rounded = Number(parsed.toFixed(digits))
    setError(null)
    if (rounded !== value) onChange(rounded)
    else setDraft(value.toFixed(digits))
  }

  const nudge = (direction: 1 | -1) => {
    const next = Number(clamp(value + direction * step, min, max).toFixed(digits))
    setError(null)
    if (next !== value) onChange(next)
  }

  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ')

  return (
    <div className={compact ? 'stepper stepper--compact' : 'stepper'} data-invalid={error ? true : undefined}>
      {visibleLabel !== '' && (
        <label htmlFor={id} className="stepper__label">
          {visibleLabel ?? label}
        </label>
      )}
      <div className="stepper__control">
        <button
          type="button"
          className="stepper__button"
          aria-label={`Decrease ${label}`}
          onClick={() => nudge(-1)}
          disabled={disabled || value <= min}
        >
          <Minus aria-hidden size={16} />
        </button>
        <input
          id={id}
          className="stepper__input num"
          inputMode={digits > 0 ? 'decimal' : 'numeric'}
          aria-label={visibleLabel === '' || visibleLabel ? label : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit((e.target as HTMLInputElement).value)
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              nudge(1)
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              nudge(-1)
            }
          }}
        />
        <button
          type="button"
          className="stepper__button"
          aria-label={`Increase ${label}`}
          onClick={() => nudge(1)}
          disabled={disabled || value >= max}
        >
          <Plus aria-hidden size={16} />
        </button>
      </div>
      {hint && (
        <span id={`${id}-hint`} className="stepper__hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-error`} className="stepper__error" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}

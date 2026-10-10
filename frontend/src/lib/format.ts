/* Display formatting only. Values are never recomputed here. */

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return 'unknown time'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(date)
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return 'unknown time'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/** Runtime in the most readable unit. */
export function formatSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return 'not recorded'
  if (seconds < 0.001) return '< 1 ms'
  if (seconds < 1) return `${(seconds * 1000).toFixed(seconds < 0.01 ? 1 : 0)} ms`
  return `${seconds.toFixed(2)} s`
}

export function formatAge(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return 'unknown age'
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s} s`
  const m = Math.round(s / 60)
  if (m < 120) return `${m} min`
  const h = Math.round(m / 60)
  if (h < 48) return `${h} h`
  const d = Math.round(h / 24)
  if (d < 730) return `${d} days`
  return `${Math.round(d / 365)} years`
}

export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'n/a'
  const rounded = Number(value.toFixed(digits))
  return rounded.toLocaleString('en-GB', { maximumFractionDigits: digits })
}

export function formatPercent(fraction: number | null | undefined, digits = 0): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return 'n/a'
  return `${(fraction * 100).toFixed(digits)}%`
}

/** "Hillview (synthetic)" -> "Hillview"; the provenance is shown separately. */
export function shortName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '')
}

export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

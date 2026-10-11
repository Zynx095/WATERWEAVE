/* Display formatting only. Values are never recomputed here. */

/** Date and time in the viewer's local time zone, with the zone named. */
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
    timeZoneName: 'short',
  }).format(date)
}

/** "just now", "3 min ago", "2 h ago", "4 days ago". */
export function formatRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const s = Math.round((now - t) / 1000)
  if (s < 45) return 'just now'
  if (s < 90 * 60) return `${Math.max(1, Math.round(s / 60))} min ago`
  if (s < 36 * 3600) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} days ago`
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

/** A score gap; a real gap smaller than the display precision must not read as "0". */
export function formatGap(value: number, digits = 2): string {
  const floor = 0.5 * 10 ** -digits
  return Math.abs(value) < floor ? `<${(2 * floor).toFixed(digits)}` : formatNumber(value, digits)
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

import { describe, expect, it } from 'vitest'
import { formatAge, formatRelative, formatSeconds, shortName } from './format'

describe('formatting', () => {
  const now = Date.parse('2026-10-11T01:00:00Z')

  it('describes how long ago something happened', () => {
    expect(formatRelative('2026-10-11T00:59:30Z', now)).toBe('just now')
    expect(formatRelative('2026-10-11T00:57:00Z', now)).toBe('3 min ago')
    expect(formatRelative('2026-10-10T23:00:00Z', now)).toBe('2 h ago')
    expect(formatRelative('2026-10-07T01:00:00Z', now)).toBe('4 days ago')
    expect(formatRelative(null, now)).toBe('')
  })

  it('formats run times and ages in readable units', () => {
    expect(formatSeconds(0.0004)).toBe('< 1 ms')
    expect(formatSeconds(0.0056)).toBe('5.6 ms')
    expect(formatSeconds(0.351)).toBe('351 ms')
    expect(formatSeconds(3.94)).toBe('3.94 s')
    expect(formatSeconds(null)).toBe('not recorded')
    expect(formatAge(725)).toBe('12 min')
  })

  it('drops the provenance suffix from neighborhood names', () => {
    expect(shortName('Hillview (synthetic)')).toBe('Hillview')
    expect(shortName('Lakeside')).toBe('Lakeside')
  })
})

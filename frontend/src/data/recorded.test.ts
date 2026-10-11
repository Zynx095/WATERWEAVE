import { describe, expect, it } from 'vitest'
import { loadRecording, parseRecording } from './recorded'

describe('recorded run', () => {
  it('loads the bundled recording and marks every run as recorded', async () => {
    const rec = await loadRecording()
    expect(rec.classical.source).toBe('recorded')
    expect(rec.quantum.source).toBe('recorded')
    expect(rec.provenance.gitCommit).toMatch(/^[0-9a-f]{40}$/)
    expect(rec.provenance.capturedAt).toBeTruthy()
  })

  it('holds real solver output for the synthetic default scenario', async () => {
    const rec = await loadRecording()
    const byKey = Object.fromEntries(rec.quantum.results.map((r) => [r.key, r]))
    expect(byKey.exact.objective_value).toBe(6)
    expect(byKey.qaoa.status).toBe('ok')
    expect(byKey.qaoa.metadata.quantum_advantage_claimed).toBe(false)
    expect(rec.quantum.scenario.description).toContain('SYNTHETIC')
  })

  it('refuses malformed data instead of showing it', () => {
    expect(() => parseRecording({ kind: 'something-else' })).toThrow(/malformed/)
    expect(() => parseRecording(null)).toThrow()
  })
})

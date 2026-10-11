import type { Observation } from '../api/types'
import type { ProvenanceKind } from '../components/ProvenanceTag'
import { formatAge } from './format'

export interface ObservationLabel {
  kind: ProvenanceKind
  label: string
}

/**
 * Maps a provider observation to the label shown to users. The quality
 * status comes from the provider; "cached" means the API's provider cache
 * returned an earlier retrieval unchanged. Unknown statuses are shown as-is.
 */
export function observationLabel(obs: Observation): ObservationLabel {
  if (obs.quality.missing || obs.quality.status === 'ERROR') return { kind: 'error', label: 'Unavailable' }
  switch (obs.quality.status) {
    case 'VERIFIED_LIVE':
      return obs.served_from_cache
        ? { kind: 'cached', label: `Cached, fetched ${formatAge(obs.retrieval_age_seconds)} ago` }
        : { kind: 'live', label: 'Live observation' }
    case 'ILLUSTRATIVE':
      return { kind: 'illustrative', label: 'Illustrative' }
    case 'SYNTHETIC':
      return { kind: 'synthetic', label: 'Synthetic' }
    default:
      return { kind: 'illustrative', label: obs.quality.status }
  }
}

export const VARIABLE_LABEL: Record<string, string> = {
  rainfall_mm: 'Rainfall',
  population: 'Population',
}

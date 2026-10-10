import { FlaskConical, History, Radio, TriangleAlert, Users } from 'lucide-react'

export type ProvenanceKind = 'synthetic' | 'illustrative' | 'live' | 'cached' | 'recorded' | 'error'

const LABELS: Record<ProvenanceKind, string> = {
  synthetic: 'Synthetic',
  illustrative: 'Illustrative',
  live: 'Live observation',
  cached: 'Cached observation',
  recorded: 'Recorded run',
  error: 'Unavailable',
}

const ICONS = {
  synthetic: FlaskConical,
  illustrative: Users,
  live: Radio,
  cached: History,
  recorded: History,
  error: TriangleAlert,
}

const CLASS: Record<ProvenanceKind, string> = {
  synthetic: 'tag--synthetic',
  illustrative: 'tag--illustrative',
  live: 'tag--live',
  cached: 'tag--recorded',
  recorded: 'tag--recorded',
  error: 'tag--error',
}

/** A text label (with icon) saying where a value comes from. */
export function ProvenanceTag({ kind, label }: { kind: ProvenanceKind; label?: string }) {
  const Icon = ICONS[kind]
  return (
    <span className={`tag ${CLASS[kind]}`}>
      <Icon aria-hidden size={14} />
      {label ?? LABELS[kind]}
    </span>
  )
}

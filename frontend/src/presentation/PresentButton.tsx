import { Presentation } from 'lucide-react'
import { usePresentation } from './PresentationProvider'

/** Opens the preflight checks, from which the presentation starts. */
export function PresentButton({ large = false }: { large?: boolean }) {
  const { state, openPreflight } = usePresentation()
  const presenting = state.status !== 'idle'
  return (
    <button
      type="button"
      className={large ? 'button button--large' : 'button button--quiet'}
      disabled={presenting}
      data-present-opener
      onClick={openPreflight}
    >
      <Presentation aria-hidden size={18} />
      {large ? 'Start the guided presentation' : 'Present'}
    </button>
  )
}

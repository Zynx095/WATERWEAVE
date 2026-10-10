import { Presentation } from 'lucide-react'
import { usePresentation } from './PresentationProvider'

/** Starts the guided presentation. */
export function PresentButton({ large = false }: { large?: boolean }) {
  const { state, dispatch } = usePresentation()
  const presenting = state.status !== 'idle'
  return (
    <button
      type="button"
      className={large ? 'button button--large' : 'button button--quiet'}
      disabled={presenting}
      onClick={() => dispatch({ type: 'START' })}
    >
      <Presentation aria-hidden size={18} />
      {large ? 'Start the guided presentation' : 'Present'}
    </button>
  )
}

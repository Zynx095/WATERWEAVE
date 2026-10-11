import { useEffect } from 'react'

/** Sets the document title for the current page. */
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} | WATERWEAVE` : 'WATERWEAVE'
  }, [title])
}

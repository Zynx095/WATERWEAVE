import { Link } from 'react-router'
import { usePageTitle } from '../hooks/usePageTitle'

export function NotFoundPage() {
  usePageTitle('Page not found')
  return (
    <div className="page-head">
      <h1>There is no page here</h1>
      <p className="lede">
        The address does not match any page. <Link to="/">Go to the overview</Link>.
      </p>
    </div>
  )
}

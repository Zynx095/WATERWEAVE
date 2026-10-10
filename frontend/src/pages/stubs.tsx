import { Link } from 'react-router'
import { usePageTitle } from '../hooks/usePageTitle'

function Stub({ title, intro }: { title: string; intro: string }) {
  usePageTitle(title)
  return (
    <div className="page-head">
      <h1>{title}</h1>
      <p className="lede">{intro}</p>
    </div>
  )
}

export const DataPage = () => <Stub title="Data sources" intro="Which inputs are live, illustrative or synthetic." />
export const LabPage = () => <Stub title="Quantum lab" intro="How the allocation problem becomes a quantum circuit." />

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

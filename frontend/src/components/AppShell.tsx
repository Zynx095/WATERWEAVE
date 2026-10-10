import { Menu, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { ConnectionBanner, ConnectionPill } from './Connection'
import { WeaveMark } from './Wordmark'

export const NAV_ITEMS = [
  { to: '/', label: 'Overview', end: true },
  { to: '/workspace', label: 'Workspace', end: false },
  { to: '/compare', label: 'Classical vs quantum', end: false },
  { to: '/data', label: 'Data sources', end: false },
  { to: '/lab', label: 'Quantum lab', end: false },
] as const

/** Moves focus to the page and announces it after client-side navigation. */
function useRouteFocus(mainRef: React.RefObject<HTMLElement | null>) {
  const location = useLocation()
  const first = useRef(true)
  const [announcement, setAnnouncement] = useState('')
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (!location.hash) window.scrollTo({ top: 0 })
    mainRef.current?.focus({ preventScroll: true })
    const id = window.setTimeout(() => setAnnouncement(document.title), 50)
    return () => window.clearTimeout(id)
  }, [location.pathname, location.hash, mainRef])
  return announcement
}

export function AppShell({ actions }: { actions?: ReactNode }) {
  const mainRef = useRef<HTMLElement>(null)
  const announcement = useRouteFocus(mainRef)
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  useEffect(() => setMenuOpen(false), [location.pathname])

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="shell-header">
        <div className="shell-header__inner">
          <Link to="/" className="brand" aria-label="WATERWEAVE overview">
            <WeaveMark />
            <span className="brand__name">WATERWEAVE</span>
          </Link>
          <button
            type="button"
            className="menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="primary-nav"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X aria-hidden size={20} /> : <Menu aria-hidden size={20} />}
            <span>Menu</span>
          </button>
          <nav id="primary-nav" className="primary-nav" data-open={menuOpen} aria-label="Main">
            <ul>
              {NAV_ITEMS.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} end={item.end} className="primary-nav__link">
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="shell-header__status">
            <ConnectionPill />
            {actions}
          </div>
        </div>
      </header>
      <ConnectionBanner />
      <main id="main" ref={mainRef} tabIndex={-1} className="shell-main">
        <Outlet />
      </main>
      <footer className="shell-footer">
        <div className="shell-footer__inner">
          <p>
            All scenarios are synthetic demonstration data, not measurements of any real water network.
            WATERWEAVE is a research prototype, not an operational controller.
          </p>
          <p>
            QAOA runs as a statevector simulation on a classical computer. No quantum advantage is claimed.
            Method and audit: <code>docs/QUANTUM_METHOD.md</code>, <code>docs/VALIDATION.md</code>.
          </p>
        </div>
      </footer>
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </div>
  )
}

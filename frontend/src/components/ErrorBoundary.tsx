import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  error: Error | null
}

/**
 * Keeps one broken page from blanking the whole app. Shows what failed and
 * how to recover; the navigation stays usable.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('WATERWEAVE page error', error, info.componentStack)
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="page-head" role="alert">
        <h1>This page could not be displayed</h1>
        <p className="lede">
          {this.state.error.message}. The API and the frontend may be different versions: restart{' '}
          <code>python -m waterweave.api</code> after updating, then reload. Other pages may still work.
        </p>
        <p>
          <button type="button" className="button" onClick={() => window.location.reload()}>
            Reload the page
          </button>
        </p>
      </div>
    )
  }
}

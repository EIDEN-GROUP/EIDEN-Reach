import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep logging local; no PII or payloads are sent anywhere.
    console.error('EIDEN Reach render error', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <main className="auth-screen" role="alert">
          <section className="auth-card">
            <h1>Workspace temporarily unavailable</h1>
            <p>Something failed while rendering this screen. Sign in again or refresh the browser. Contact your administrator if the problem persists.</p>
            <button className="primary-button" type="button" onClick={() => this.setState({ error: null })}>Try again</button>
          </section>
        </main>
      )
    }
    return this.props.children
  }
}

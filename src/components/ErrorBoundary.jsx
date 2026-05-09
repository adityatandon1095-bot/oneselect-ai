import { Component } from 'react'
import * as Sentry from '@sentry/react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack)
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', gap: 14,
        background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-body)',
        padding: 40,
      }}>
        <div style={{ fontSize: 28, opacity: 0.18, lineHeight: 1 }}>◈</div>
        <div style={{ fontFamily: 'var(--font-head)', fontSize: 20, fontWeight: 400 }}>
          Something went wrong
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0, maxWidth: 380, textAlign: 'center', lineHeight: 1.7 }}>
          {this.state.error?.message ?? 'An unexpected error occurred. Try reloading the page.'}
        </p>
        <button
          className="btn btn-primary"
          style={{ marginTop: 8 }}
          onClick={() => this.setState({ hasError: false, error: null })}
        >
          Try again
        </button>
      </div>
    )
  }
}

// ---------------------------------------------------------------------------
// THE APP HAD NOTHING BETWEEN A RENDER THROW AND A WHITE SCREEN.
//
// `index.html` ships a bare `<div id="root">`, `main.tsx` mounts straight into
// it, and React unmounts the entire tree when a render throws. So one bad
// value anywhere — a null where a number was expected, a malformed row from
// localStorage, a field a migration renamed — took the whole app to a blank
// page, mid-session, with no message, no way back, and nothing to report.
// Every logged set was still safely in its queue and there was no way for the
// user to know that either.
//
// This is deliberately the plainest thing that works: no theme tokens, no
// design-system imports, no hooks, inline styles only. A boundary that itself
// depends on the app's machinery is a boundary that fails in exactly the
// situations it exists for. Class component because React offers no hook
// equivalent of componentDidCatch.
//
// What it does NOT do, on purpose:
//   - swallow the error (it is logged, in full, every time);
//   - retry automatically (a render loop would spin forever);
//   - claim the problem is fixed (Try again re-renders; if the cause is still
//     there the boundary catches it again, which is honest).
// ---------------------------------------------------------------------------

import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // The stack is the only record of what happened — there is no error
    // reporting service wired up, so the console is where a bug report starts.
    console.error('The app hit an unrecoverable render error:', error, info.componentStack)
  }

  private handleRetry = (): void => {
    this.setState({ error: null })
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div
        role="alert"
        style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.75rem',
          padding: '2rem 1.5rem',
          textAlign: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: '#1A1636',
          color: '#F4F2FA',
        }}
      >
        <h1 style={{ fontSize: '1.0625rem', fontWeight: 600, margin: 0 }}>Something went wrong on this screen.</h1>
        {/* The most useful true sentence available. Sets, water, meals and
            cardio are all local-first with their own queues, so a render
            crash genuinely does not lose them — and "did I just lose my
            workout" is the first thing anyone would think. */}
        <p style={{ fontSize: '0.8125rem', lineHeight: 1.5, margin: 0, maxWidth: '22rem', opacity: 0.75 }}>
          Anything you logged is saved — this is the display, not your data.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <button
            type="button"
            onClick={this.handleRetry}
            style={{
              minHeight: '44px',
              padding: '0 1.25rem',
              borderRadius: '999px',
              border: 'none',
              background: '#8FE3C4',
              color: '#12102A',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              minHeight: '44px',
              padding: '0 1.25rem',
              borderRadius: '999px',
              border: '1px solid rgba(244,242,250,0.25)',
              background: 'transparent',
              color: '#F4F2FA',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload the app
          </button>
        </div>
        {/* Collapsed, not hidden. Nobody reads a stack trace by choice, but
            when Ashley sends a screenshot this is the difference between
            "it broke" and a line number. */}
        <details style={{ marginTop: '1.25rem', fontSize: '0.6875rem', opacity: 0.6, maxWidth: '22rem' }}>
          <summary style={{ cursor: 'pointer' }}>Technical details</summary>
          <pre
            style={{
              marginTop: '0.5rem',
              textAlign: 'left',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontSize: '0.625rem',
              lineHeight: 1.4,
            }}
          >
            {error.message}
          </pre>
        </details>
      </div>
    )
  }
}

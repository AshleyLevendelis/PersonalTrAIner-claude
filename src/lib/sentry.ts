// The only Sentry code on the path to first paint, and it imports nothing from Sentry (8 Nov 2026, her
// "Just after the app appears"). The SDK itself (sentry-init.ts, ~57 kB gzipped) is fetched once the page
// has loaded and the browser is idle.
//
// An error before then is not lost: it is held here and sent the moment the SDK arrives. What CAN be lost is
// an error in a tab closed before that, which is the trade she accepted.
//
// With no VITE_SENTRY_DSN (the browser harness, a fresh clone) nothing is fetched and nothing is sent.
import type { ErrorInfo } from 'react'

type SentryApi = Awaited<ReturnType<typeof import('./sentry-init')['initSentry']>>
type Held =
  | { kind: 'react'; error: unknown; info: ErrorInfo; handled: boolean }
  | { kind: 'global'; error: unknown; type: 'onerror' | 'onunhandledrejection' }

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined
let sentry: SentryApi | null = null
const held: Held[] = []
const MAX_HELD = 20

function send(h: Held, s: SentryApi) {
  if (h.kind === 'react') {
    s.captureReactException(h.error, h.info, { mechanism: { handled: h.handled, type: 'auto.function.react.error_handler' } })
  } else {
    s.captureException(h.error, { mechanism: { handled: false, type: `auto.browser.global_handlers.${h.type}` } })
  }
}

function hold(h: Held) {
  if (!DSN) return
  if (sentry) send(h, sentry)
  else if (held.length < MAX_HELD) held.push(h)
}

// For createRoot's three hooks. Passing a hook replaces React's own reporting, so the two that React would
// have printed are still printed (AppErrorBoundary prints the caught ones itself).
export const reactErrorHook = (which: 'uncaught' | 'caught' | 'recoverable') => (error: unknown, info: ErrorInfo) => {
  if (which !== 'caught') console.error(error)
  hold({ kind: 'react', error, info, handled: which !== 'uncaught' })
}

function onEarlyError(e: ErrorEvent) { hold({ kind: 'global', error: e.error ?? e.message, type: 'onerror' }) }
function onEarlyRejection(e: PromiseRejectionEvent) { hold({ kind: 'global', error: e.reason, type: 'onunhandledrejection' }) }

export function startSentry() {
  if (!DSN) return
  // Until the SDK's own handlers are installed, these hold what would otherwise go unreported.
  window.addEventListener('error', onEarlyError)
  window.addEventListener('unhandledrejection', onEarlyRejection)

  const load = () => {
    import('./sentry-init')
      .then(({ initSentry }) => {
        window.removeEventListener('error', onEarlyError)
        window.removeEventListener('unhandledrejection', onEarlyRejection)
        sentry = initSentry(DSN)
        for (const h of held.splice(0)) send(h, sentry)
      })
      .catch(() => { /* offline or a deploy took the chunk away: the app carries on without Sentry */ })
  }
  const whenIdle = () => ('requestIdleCallback' in window ? window.requestIdleCallback(load, { timeout: 3000 }) : setTimeout(load, 1))
  if (document.readyState === 'complete') whenIdle()
  else window.addEventListener('load', whenIdle, { once: true })
}

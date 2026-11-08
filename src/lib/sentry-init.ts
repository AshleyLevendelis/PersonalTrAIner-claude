// Sentry error monitoring and page-speed tracing (8 Nov 2026). Never imported statically: sentry.ts loads
// this file just after the app first appears (her ruling that day, "Just after the app appears", over
// loading it at start), so opening the app downloads nothing more than it did before Sentry.
//
// PRIVACY, her ruling the same day, "Errors + speed only" (over adding blanked-out screen recordings and over
// Sentry's defaults): this is a health app, so Sentry gets crash reports and timings and NOTHING she typed or
// was served. No session replay, no IP address or user info, no cookies, no headers, no request or response
// bodies (so no meals, weights or chat text), no URL query strings (Supabase puts row filters such as user
// ids there), and breadcrumb URLs are cut at the "?" for the same reason.
// Named imports only: a namespace import keeps the whole SDK (replay, feedback...), 155 kB gzipped against ~57.
import { init, browserTracingIntegration, captureException, captureReactException } from '@sentry/react'

const stripQuery = (url: unknown) => (typeof url === 'string' ? url.split('?')[0] : url)

// The whole configuration, as a value, so test:sentry-privacy can read what Sentry is told without starting it.
export function sentryOptions(dsn: string, environment: string, release?: string): Parameters<typeof init>[0] {
  return {
    dsn,
    environment,
    release: release || undefined,

    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },

    integrations: [browserTracingIntegration()],

    // Tracing: every page load in development, one in five in production.
    tracesSampleRate: environment === 'production' ? 0.2 : 1.0,
    // No trace headers on outgoing requests: nothing on the server side reads them yet, and an extra header
    // on a Supabase function call is a CORS preflight the function's allowlist was never asked about.
    tracePropagationTargets: [],

    beforeBreadcrumb(crumb) {
      if (crumb.data && 'url' in crumb.data) crumb.data.url = stripQuery(crumb.data.url)
      if (crumb.category === 'navigation' && crumb.data) {
        crumb.data.from = stripQuery(crumb.data.from)
        crumb.data.to = stripQuery(crumb.data.to)
      }
      return crumb
    },
  }
}

export function initSentry(dsn: string) {
  const release = import.meta.env.VITE_APP_RELEASE as string | undefined
  const environment = (import.meta.env.VITE_APP_ENV as string | undefined) || import.meta.env.MODE
  init(sentryOptions(dsn, environment, release))
  return { captureException, captureReactException }
}

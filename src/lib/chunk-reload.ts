// ---------------------------------------------------------------------------
// A SCREEN WHOSE CODE WAS DEPLOYED AWAY RELOADS THE APP ONCE, NOT INTO A CRASH.
//
// Run 7 of the live-app test (14 Oct 2026, H30): the app was open while a new
// version went live. The Exercise tab then asked for its "What happened?"
// sheet by the OLD file name, the host no longer had it, and the import failed
// with "Failed to fetch dynamically imported module …WhatHappenedSheet-….js".
// React.lazy rethrew that at render, the root error screen took the whole app,
// and "Try again" could never work, because lazy keeps the rejected promise.
//
// The fix is the one that matches the cause: the page is out of date, so load
// the page again. Once. A reload is refused when this tab already reloaded for
// this reason in the last RELOAD_GUARD_MS, so a deploy that is genuinely
// broken shows the error screen instead of reloading for ever. Every lazily
// loaded screen goes through `lazyWithReload`, and every other dynamic import
// is covered by Vite's own `vite:preloadError` event (installChunkReload).
//
// Reloading is safe mid-session: sets, water, meals and cardio are local-first
// with their own queues (AppErrorBoundary says the same).
// ---------------------------------------------------------------------------

import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

/** A reload for this reason within this long of the last one is refused (a broken deploy, not an old page). */
export const RELOAD_GUARD_MS = 20_000
const STAMP_KEY = 'chunk-reload-at'

/**
 * The browser's words for "a module file the page asked for is not there", across Chrome, Firefox and Safari,
 * plus Vite's own preload failure. Anything else is a real error and is left alone.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { name?: unknown; message?: unknown }
  const text = `${typeof e.name === 'string' ? e.name : ''} ${typeof e.message === 'string' ? e.message : ''}`
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|ChunkLoadError|Unable to preload CSS/i.test(text)
}

/**
 * Reload the page, unless this tab already did so for this reason in the last RELOAD_GUARD_MS. Returns whether
 * a reload was started. Storage that cannot be read refuses the reload: without the stamp there is no loop guard.
 */
export function reloadOnce(now: number = Date.now()): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(STAMP_KEY) ?? 0)
    if (Number.isFinite(last) && last > 0 && now - last < RELOAD_GUARD_MS) return false
    window.sessionStorage.setItem(STAMP_KEY, String(now))
  } catch {
    return false
  }
  window.location.reload()
  return true
}

/**
 * React.lazy, plus: when the file is gone because a new version went live, reload once and keep the screen's
 * Suspense fallback up meanwhile (a promise that never settles), instead of throwing into the error screen.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the same constraint React.lazy itself uses
export function lazyWithReload<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(() => factory().catch((error: unknown) => {
    if (isChunkLoadError(error) && reloadOnce()) return new Promise<{ default: T }>(() => {})
    throw error
  }))
}

/**
 * The plain `import()` calls inside event handlers and effects are not lazies, so they are covered by Vite's
 * `vite:preloadError`, fired for a failed dynamic import in a built app. Not prevented: the caller still sees
 * its error (each already handles a failed load), and the reload starts beside it.
 */
export function installChunkReload(): void {
  window.addEventListener('vite:preloadError', () => { reloadOnce() })
}

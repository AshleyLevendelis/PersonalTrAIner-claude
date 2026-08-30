import { useEffect, useRef } from 'react'

// ---------------------------------------------------------------------------
// KEEP THE SCREEN AWAKE WHILE A SESSION IS RUNNING — audit §6.4
//
// There was no wake lock anywhere in the app. During a set the phone dimmed
// and locked on its normal schedule, so the user unlocked it between every
// single set — in a gym, with chalky hands, mid-workout. It is the kind of
// friction that never appears in a bug report and quietly decides whether
// someone keeps using a training app.
//
// Best-effort by design, and silent when it can't work:
//   - Screen Wake Lock is Android Chrome and iOS 16.4+. Anything older
//     simply doesn't get it; there is nothing useful to tell the user, and a
//     "your browser doesn't support..." notice mid-workout would be worse
//     than the problem.
//   - The browser releases the lock itself whenever the tab is hidden. That
//     is not a failure, it is the contract — so this re-acquires on
//     visibilitychange rather than treating the release as an error.
//   - Acquisition can reject outright (low battery on some devices, a
//     permissions policy). Caught and ignored, for the same reason.
//
// It does NOT hold the lock for a finished or idle session. A screen held
// awake after the user has stopped training is a battery bug wearing a
// feature's clothes.
// ---------------------------------------------------------------------------

/**
 * lib.dom types navigator.wakeLock as always present, which is not true of
 * the browsers this has to survive — hence the runtime check below against a
 * type that admits the absence, rather than an interface extending Navigator
 * (which TypeScript rejects outright for exactly this reason).
 */
type MaybeWakeLockNavigator = Omit<Navigator, 'wakeLock'> & { wakeLock?: Navigator['wakeLock'] }

export function useWakeLock(active: boolean): void {
  const sentinelRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    if (!active) return
    const nav = navigator as MaybeWakeLockNavigator
    if (!nav.wakeLock) return

    let cancelled = false

    const acquire = async () => {
      // Requesting while hidden always rejects — skip rather than log noise.
      if (document.visibilityState !== 'visible') return
      if (sentinelRef.current && !sentinelRef.current.released) return
      try {
        const sentinel = await nav.wakeLock!.request('screen')
        if (cancelled) { void sentinel.release().catch(() => {}); return }
        sentinelRef.current = sentinel
      } catch {
        // Unsupported, refused, or battery-saver. Nothing to say and nothing
        // to retry right now — the visibilitychange handler will try again.
      }
    }

    const onVisibility = () => { void acquire() }

    void acquire()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      const sentinel = sentinelRef.current
      sentinelRef.current = null
      if (sentinel && !sentinel.released) void sentinel.release().catch(() => {})
    }
  }, [active])
}

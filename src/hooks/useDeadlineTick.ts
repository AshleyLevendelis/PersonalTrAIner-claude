import { useEffect, useRef, useState } from 'react'

// ---------------------------------------------------------------------------
// The shared redraw-forcing mechanism behind every deadline-anchored timer
// in this app (rest timer, and now the standalone stopwatch/lap/round
// timers). Extracted verbatim from useActiveSession.tsx's own rest-timer
// tick effect — a plain setInterval is safe here because callers always
// recompute their displayed value fresh from a stored deadline/anchor
// timestamp (`endsAt - now`, or `now - startedAt`), never from a counter
// this hook increments — a throttled/missed tick only delays the redraw by
// a frame, it can never corrupt the number. visibilitychange/pageshow/focus
// force an immediate resync so returning from background never shows a
// stale value even for that one frame.
// ---------------------------------------------------------------------------

/** Returns a counter that increments roughly once a second while `active`,
 * plus immediately on visibilitychange/pageshow/focus. The counter's VALUE
 * is meaningless — callers read it only to force a recompute of their own
 * deadline-derived state; never treat it as an elapsed/remaining count. */
export function useDeadlineTick(active: boolean): number {
  const [tick, setTick] = useState(0)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!active) return
    tickRef.current = setInterval(() => setTick(t => t + 1), 1000)
    const resync = () => setTick(t => t + 1)
    document.addEventListener('visibilitychange', resync)
    window.addEventListener('pageshow', resync)
    window.addEventListener('focus', resync)
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
      document.removeEventListener('visibilitychange', resync)
      window.removeEventListener('pageshow', resync)
      window.removeEventListener('focus', resync)
    }
  }, [active])

  return tick
}

import { useEffect } from 'react'
import { keptPlanWeeks, sendKeptPlanWeeks, subscribeKeptPlanWeeks } from '@/lib/mesocycle-persistence'

/** How often a plan change kept on the phone is offered to the server while the app stays open. */
const KNOCK_MS = 20_000

/**
 * SENDS THE PLAN CHANGES KEPT ON THE PHONE (mesocycle-persistence, 10 Nov 2026): once when the app opens, when the
 * phone says the signal is back, and on a slow knock while any are waiting, because a connection can return without
 * the browser ever saying so. One hook, mounted by App and by the browser harness, so a driver runs the app's own
 * sender. `onSent` is told when the last one has gone, for a screen that re-reads the plan.
 */
export function useKeptPlanSender(profileId: string | null | undefined, onSent?: () => void): void {
  useEffect(() => {
    if (!profileId) return
    let stopped = false
    const send = () => {
      if (keptPlanWeeks(profileId).size === 0) return
      void sendKeptPlanWeeks(profileId).then(left => { if (!stopped && left === 0) onSent?.() })
    }
    send()
    window.addEventListener('online', send)
    const knock = window.setInterval(send, KNOCK_MS)
    // A change kept just now starts the knocking on its own; nothing to do here but be subscribed for the count.
    const off = subscribeKeptPlanWeeks(() => {})
    return () => { stopped = true; window.removeEventListener('online', send); window.clearInterval(knock); off() }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onSent is a callback, not a reason to re-arm
  }, [profileId])
}

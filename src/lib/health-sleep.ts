// ---------------------------------------------------------------------------
// SLEEP FROM THE PHONE (his pick "A", 26 Nov 2026; the rules are sleep-nights.ts). Read only, its own switch on
// Profile, phone app only. The nights are read from the phone's health store each time and worked out here; NOTHING
// ABOUT HIS SLEEP IS SAVED to the app's database. Home shows last night against his usual; the coach is told the same
// few lines with a message he sends, and offers a lighter session after two short nights.
// ---------------------------------------------------------------------------
import { nightsFromSessions, sleepPicture, type SleepPicture } from './sleep-nights'

const SLEEP_CONNECTED_KEY = 'fitplan_health_sleep_connected'
/** Sixteen nights of usual, plus the night that began before the first of them. */
const READ_BACK_DAYS = 18

export function isHealthSleepConnected(): boolean {
  try { return localStorage.getItem(SLEEP_CONNECTED_KEY) === '1' } catch { return false }
}
function setConnected(on: boolean): void {
  try { if (on) localStorage.setItem(SLEEP_CONNECTED_KEY, '1'); else localStorage.removeItem(SLEEP_CONNECTED_KEY) } catch { /* asked again */ }
}

export type SleepConnectResult = { ok: true; store: string } | { ok: false; reason: 'not-phone-app' | 'unavailable' | 'denied' | 'error'; store?: string }

/** The Profile switch: the phone's own permission sheet for sleep, and the answer remembered. */
export async function connectHealthSleep(): Promise<SleepConnectResult> {
  const { healthAdapter, healthStoreName } = await import('./health-steps')
  const adapter = await healthAdapter()
  if (!adapter || !adapter.requestSleepAccess) return { ok: false, reason: 'not-phone-app' }
  const store = healthStoreName(adapter.platform)
  try {
    if (!(await adapter.isAvailable()).available) return { ok: false, reason: 'unavailable', store }
    const granted = await adapter.requestSleepAccess()
    // As with steps: Apple never says a read was refused, so a finished sheet counts as connected there.
    if (!granted && adapter.platform === 'android') return { ok: false, reason: 'denied', store }
    setConnected(true)
    return { ok: true, store }
  } catch {
    return { ok: false, reason: 'error', store }
  }
}
export function disconnectHealthSleep(): void { setConnected(false) }

/**
 * Last night, his usual and any run of short nights, as of `today`. Null when the switch is off, off the phone app, or
 * the read failed: nothing to say, never a throw and never a guess.
 */
export async function readSleepPicture(today: string, now: Date): Promise<SleepPicture | null> {
  if (!isHealthSleepConnected()) return null
  try {
    const { healthAdapter } = await import('./health-steps')
    const adapter = await healthAdapter()
    if (!adapter?.sleepSessions) return null
    const sessions = await adapter.sleepSessions(new Date(now.getTime() - READ_BACK_DAYS * 86400000), now)
    return sleepPicture(nightsFromSessions(sessions), today)
  } catch {
    return null
  }
}

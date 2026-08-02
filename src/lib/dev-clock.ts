import type { UserProfile } from './types'

const STORAGE_PREFIX = 'fitplan_dev_clock_'
const BYPASS_PREFIX = 'fitplan_dev_bypass_'

export interface DevClockOverride {
  date: string // ISO date string (YYYY-MM-DD)
  enabled: boolean
}

export function getDevClockOverride(userId: string): DevClockOverride | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${userId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DevClockOverride
    if (!parsed.enabled) return null
    return parsed
  } catch {
    return null
  }
}

export function setDevClockOverride(userId: string, date: string | null): void {
  const key = `${STORAGE_PREFIX}${userId}`
  if (!date) {
    localStorage.removeItem(key)
    return
  }
  localStorage.setItem(key, JSON.stringify({ date, enabled: true }))
}

export function getAppNow(userId: string | undefined): Date {
  if (!userId) return new Date()
  const override = getDevClockOverride(userId)
  if (!override) return new Date()
  const d = new Date(override.date + 'T12:00:00')
  if (isNaN(d.getTime())) return new Date()
  return d
}

/**
 * Local (not UTC) YYYY-MM-DD for a Date. `toISOString().split('T')[0]`
 * silently converts to UTC first — for anyone west of Greenwich, an evening
 * session can cross UTC midnight (e.g. ~8pm US Eastern) while it's still the
 * same calendar day locally, splitting one workout into two auto-created
 * sessions. The date that actually matters is the trainee's own.
 */
export function getLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export interface SessionDateContext {
  /** YYYY-MM-DD, local calendar date. */
  date: string
  /** Full weekday name — derived from the SAME Date instant as `date`, so the two can never disagree right at a day boundary. */
  day: string
}

/**
 * The single source of truth for "what session (date + weekday) is live
 * right now" — dev-clock aware, local calendar date throughout. Callers
 * should compute this ONCE per active session (e.g. on mount, or when the
 * dev-clock override changes) rather than on every render: re-deriving it
 * from a fresh `new Date()` on every render risks the date silently rolling
 * over mid-workout, splitting one session into two.
 */
export function getSessionDateContext(userId: string | undefined): SessionDateContext {
  const now = getAppNow(userId)
  return {
    date: getLocalDateString(now),
    day: now.toLocaleDateString('en-US', { weekday: 'long' }),
  }
}

export function getDevBypassLocks(userId: string): boolean {
  try {
    return localStorage.getItem(`${BYPASS_PREFIX}${userId}`) === 'true'
  } catch {
    return false
  }
}

export function setDevBypassLocks(userId: string, bypass: boolean): void {
  const key = `${BYPASS_PREFIX}${userId}`
  if (bypass) {
    localStorage.setItem(key, 'true')
  } else {
    localStorage.removeItem(key)
  }
}

export function isDevAccount(profile: UserProfile | null): boolean {
  if (!profile) return false
  const email = (profile as any).email || ''
  if (email.includes('test.local') || email.includes('@dev.')) return true
  try {
    return localStorage.getItem('fitplan_dev_mode') === 'true'
  } catch {
    return false
  }
}

export function enableDevMode(): void {
  localStorage.setItem('fitplan_dev_mode', 'true')
}

export function disableDevMode(): void {
  localStorage.removeItem('fitplan_dev_mode')
}

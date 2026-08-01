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

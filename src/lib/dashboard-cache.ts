// ---------------------------------------------------------------------------
// Last-known Home, so the tab has something to draw while it re-reads.
//
// Every tab except chat unmounts when you leave it (src/App.tsx; the rule is
// pinned by test-stale-after-write.ts, and it is deliberate — a fresh mount is
// a fresh read for free). For Home that fresh read is loadDashboardData, which
// is around twenty round trips, and until it lands the whole tab is one line
// of grey text in an empty card. Ashley, 7 Sep 2026: "when switching to the
// home tab the tab is blank for a few seconds while it loads."
//
// THIS IS A PAINT CACHE AND NOTHING ELSE. The fetch still runs on every mount,
// unconditionally; this only decides what is on screen for the second or two
// before it answers. That distinction is what keeps it compatible with the
// no-stale-tabs rule rather than an exception to it: the stale window is no
// longer than the blank window it replaces, and it ends the same way.
//
// Modelled on chat-cache.ts, deliberately — same three functions, same
// synchronous localStorage, same swallow-everything error handling, so there
// is one idiom for "what was on screen last time" instead of two.
// ---------------------------------------------------------------------------

import type { DashboardData } from './dashboard-data'

const DASHBOARD_CACHE_PREFIX = 'dashboard_cache_'

function cacheKey(profileId: string, date: string): string {
  return `${DASHBOARD_CACHE_PREFIX}${profileId}_${date}`
}

/**
 * Keep today's snapshot and drop the rest.
 *
 * Without this the key grows one entry per day, forever, in a store that is
 * a few megabytes and shared with the pending-write queues that genuinely
 * matter. Yesterday's Home is of no use to anyone: it is keyed by date
 * precisely so it can never be served as today.
 */
function sweepOtherDays(profileId: string, keep: string): void {
  const prefix = `${DASHBOARD_CACHE_PREFIX}${profileId}_`
  const doomed: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith(prefix) && k !== `${prefix}${keep}`) doomed.push(k)
  }
  for (const k of doomed) localStorage.removeItem(k)
}

export function saveDashboardCache(profileId: string | undefined, date: string, data: DashboardData): void {
  if (!profileId || !date) return
  try {
    sweepOtherDays(profileId, date)
    localStorage.setItem(cacheKey(profileId, date), JSON.stringify(data))
  } catch {
    // Full, unavailable, or private browsing. Home then behaves exactly as it
    // did before this file existed — a blank card for a beat — which is the
    // right failure for a cache that only decides what to paint.
  }
}

/**
 * The last Home drawn for this profile on this date, or null.
 *
 * Two guards, not one: the key carries the date AND the payload's own `today`
 * is checked against it. A snapshot that disagrees with the day it is filed
 * under is the one genuinely harmful thing this could do — yesterday's
 * calories and yesterday's session presented as this morning's — so it is
 * refused twice rather than trusted once.
 */
export function loadDashboardCache(profileId: string | undefined, date: string): DashboardData | null {
  if (!profileId || !date) return null
  try {
    const raw = localStorage.getItem(cacheKey(profileId, date))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    // Shape check, so a snapshot written by an older build cannot crash the
    // render it is restored into. Cheap, and the alternative is a white screen.
    if (typeof parsed.today !== 'string' || typeof parsed.dayName !== 'string' || !parsed.session) return null
    if (parsed.today !== date) return null
    return parsed as DashboardData
  } catch {
    return null
  }
}

// NO clearDashboardCache. chat-cache.ts has one because the chat has a "clear
// conversation" button; Home has no equivalent, and nothing else in the app
// deletes a profile's local state today. An exported function with no caller
// is the dead-code shape test:no-dead-code exists to catch, and a cache of
// public numbers keyed by profile is not something to invent a caller for.

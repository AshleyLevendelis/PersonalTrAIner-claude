// ---------------------------------------------------------------------------
// The one persisted session record (LAYOUT-DESIGN.md §5.4 / D6). Everything
// useActiveSession needs to survive a reload, a tab switch, or (from P3) a
// midnight rollover lives here — nowhere else. This file owns exactly one
// localStorage key per profile and one schema; later phases EXTEND
// ActiveSessionRecord in place (add fields, same key) rather than fork a
// second key or a second shape — see F1 in LAYOUT-DESIGN.md §7.
//
// P1 populates identity + status + rest only. Fields the design's full
// schema lists for P2/P3 (cursor, order, drafts, prs, ...) are added by the
// phases that actually read and write them — shipping unread fields now
// would be exactly the kind of forked-but-silent state the prior multi-agent
// draft produced.
// ---------------------------------------------------------------------------

import type { PRRecord } from './pr-engine'

const KEY_PREFIX = 'fitplan_active_session_v1:'
const MAX_ENTRIES = 2

export interface ActiveSessionRecord {
  profileId: string
  /** YYYY-MM-DD, local calendar date — frozen at session start, never re-derived mid-session (D7). */
  date: string
  dayName: string
  liveWeek: number
  status: 'running' | 'finished'
  startedAtIso: string
  finishedAtIso?: string
  lastActivityIso: string
  /**
   * Set when Finish closed the session locally but the SERVER close
   * (markSessionCompleted) failed — the moment it failed, ISO.
   *
   * The sets themselves are safe: they go through set-log-store's own offline
   * queue. What is missing is the workout_sessions row's completed stamp, and
   * that stamp is what history, the streak and "have you reviewed this
   * session yet" all read. Before 5 Sep 2026 the failure was caught, logged to
   * the console, and the app showed "Session complete" over the top of it —
   * permanently, because nothing ever tried again. This marker is what lets
   * the next mount or foreground retry, and what lets the summary dialog stop
   * claiming a finish that has not happened yet.
   */
  serverCloseFailedAt?: string
  /** Deadline-anchored rest — set by startRest, cleared by dismissRest. Absent when no rest is running. */
  restEndsAt?: string
  restLabel?: string
  /** The set number to jump to once this rest completes — see useActiveSession.tsx's RestState doc comment. */
  restTargetSetNumber?: number
  /** The rest's original/total duration in ms — a fill-bar's denominator. Captured by startRest, kept in sync by adjustRest's ±30s taps. Absent when no rest is running. */
  restTotalMs?: number
  /** User-typed off-plan exercise names for today (P2) — the DETECTED half of offPlanWork is computed from logs + the day's plan, not stored here. */
  declaredOffPlan?: string[]
  /** Snapshot of pr-engine's PR cache taken at startSession() — the finish
   * summary diffs today's logged maxes against THIS, not the live cache
   * (which checkForPR has already mutated mid-session). Absent for a
   * session that was silently opened by logSet rather than an explicit
   * Start tap. */
  prSnapshotAtStart?: Record<string, PRRecord>
  /**
   * Weight/reps TYPED into a set row but not yet ticked, plus any extra set
   * rows added by hand — keyed by `${exerciseId}:${setNumber}` and by
   * exerciseId respectively (audit §6.3).
   *
   * These lived in component state only, so reloading the page, or leaving
   * the app long enough for the browser to discard the tab, threw them away
   * mid-session. Saved sets were always safe; this is the in-progress typing,
   * which is exactly what someone loses when their phone locks between sets.
   *
   * Deliberately part of THIS record and not a second key, per this file's
   * own rule: one localStorage key per profile, extended in place. Drafts are
   * cleared per exercise as each set is logged, so this does not grow.
   */
  drafts?: Record<string, { weight: string; reps: string; isBodyweight: boolean }>
  extraSets?: Record<string, number[]>
}

type RecordMap = Record<string /* date */, ActiveSessionRecord>

function storageKey(profileId: string): string {
  return `${KEY_PREFIX}${profileId}`
}

function loadMap(profileId: string): RecordMap {
  try {
    const raw = localStorage.getItem(storageKey(profileId))
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveMap(profileId: string, map: RecordMap): void {
  localStorage.setItem(storageKey(profileId), JSON.stringify(map))
}

/** The record for a specific date, or null if none exists (fresh profile, or evicted by the 2-entry cap). */
export function getActiveSessionRecord(profileId: string, date: string): ActiveSessionRecord | null {
  return loadMap(profileId)[date] ?? null
}

/**
 * The most recently active record for this profile, regardless of date —
 * used at hydration to find a session that may have rolled past midnight
 * (D7's 6-hour grace window) before the caller has decided which date to
 * look under.
 */
export function getMostRecentActiveSessionRecord(profileId: string): ActiveSessionRecord | null {
  const map = loadMap(profileId)
  const records = Object.values(map)
  if (records.length === 0) return null
  return records.reduce((latest, r) =>
    r.lastActivityIso > latest.lastActivityIso ? r : latest
  )
}

/**
 * Upserts by date, capped at MAX_ENTRIES — oldest-by-lastActivityIso is
 * evicted first. The cap exists so a stale prior-day run survives long
 * enough for the stale-run resolution (§3.7) without the key growing
 * unbounded across months of use.
 */
export function saveActiveSessionRecord(record: ActiveSessionRecord): void {
  const map = loadMap(record.profileId)
  map[record.date] = record
  const dates = Object.keys(map)
  if (dates.length > MAX_ENTRIES) {
    dates
      .sort((a, b) => map[a].lastActivityIso.localeCompare(map[b].lastActivityIso))
      .slice(0, dates.length - MAX_ENTRIES)
      .forEach(d => delete map[d])
  }
  saveMap(record.profileId, map)
}

export function clearActiveSessionRecords(profileId: string): void {
  localStorage.removeItem(storageKey(profileId))
}

/** D7's "6h of inactivity" grace window — the one place this number lives. */
export const SESSION_STALE_INACTIVITY_MS = 6 * 60 * 60 * 1000

/**
 * True when a still-"running" record should be auto-closed: either 6h+ of
 * inactivity, or its date is no longer "today" (end-of-day rollover — a
 * prior day's still-running record is stale by definition regardless of how
 * recently it was touched).
 */
export function isSessionStale(record: ActiveSessionRecord, nowIso: string, todayDate: string): boolean {
  if (record.status !== 'running') return false
  if (record.date !== todayDate) return true
  return new Date(nowIso).getTime() - new Date(record.lastActivityIso).getTime() > SESSION_STALE_INACTIVITY_MS
}

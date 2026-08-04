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
  /** Deadline-anchored rest — set by startRest, cleared by dismissRest. Absent when no rest is running. */
  restEndsAt?: string
  restLabel?: string
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

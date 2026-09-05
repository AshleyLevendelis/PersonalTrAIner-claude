// ---------------------------------------------------------------------------
// The one state owner for "what session is live right now" (LAYOUT-DESIGN.md
// §5.2 / D6 / F3). Nothing by this name existed before this phase.
//
// P1 shipped identity (frozen once, never re-derived per render — F3),
// `logs` + `setsFor` as the sole read model, a thin write facade
// (`logSet`/`deleteSet`) around set-log-store, and a deadline-anchored rest
// facade backed by the persisted session record.
//
// P2 adds `ghosts`/`loadGhosts` (the one getLastSessionSets fetcher now —
// SetLogger's own per-instance effect and the bulk-log path's ad hoc call
// both die in the same commit SetGrid ships, per F1) and the off-plan
// declaration facade. Cursor, drafts, order, PRs and everything else the
// full design's schema lists still arrive with P3 — shipping them now
// would be unread, forkable state.
//
// `liveWeek` here has NO setter exposed to any component (D8) — it is
// stamped once from `getSessionDateContext` + `getActiveMesocycleWeek` and
// only re-stamped when the identity INPUTS change (profile, dev overrides,
// plan creation date, total weeks), never by user interaction. Browsing a
// different week is a separate, view-local concern from P2 onward.
// ---------------------------------------------------------------------------

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useDeadlineTick } from './useDeadlineTick'
import { getAppNow, getSessionDateContext } from '@/lib/dev-clock'
import { getActiveMesocycleWeek } from '@/lib/calculations'
import { saveSet, deleteSet, getSetsForDate, getLastSessionSets, initSetLogStore, ensureSessionSynced, type SaveSetInput } from '@/lib/set-log-store'
import { refreshPRCacheFromDB, getPRCache, type PRRecord } from '@/lib/pr-engine'
import { markSessionCompleted } from '@/lib/daily-tracking'
import { filterLoggableSets } from '@/lib/session-derive'
import {
  getActiveSessionRecord,
  saveActiveSessionRecord,
  getMostRecentActiveSessionRecord,
  isSessionStale,
  type ActiveSessionRecord,
} from '@/lib/active-session-store'
import type { ExerciseSetLog } from '@/lib/types'

export interface ActiveSessionIdentity {
  profileId: string | undefined
  /** YYYY-MM-DD, local calendar date. Frozen with dayName/liveWeek — see the module doc comment. */
  date: string
  dayName: string
  liveWeek: number
}

export interface RestState {
  restEndsAt: string | null
  restLabel: string | null
  /** Milliseconds remaining, recomputed on every tick/visibilitychange/focus — negative once the rest has overrun. Null when no rest is running. */
  restRemainingMs: number | null
  /** The set number to jump to once this rest completes (setNumber + 1 of the exercise it was started for), or null when the completed set was that exercise's last — nothing on this exercise to jump to. */
  restTargetSetNumber: number | null
  /** The rest's original/total duration in ms — a fill-bar's denominator. Null when no rest is running. */
  restTotalMs: number | null
}

/** A pending "focus this specific set's input" request — set by BottomDock's
 * "Start next set" action, consumed by the matching ExerciseRow once it
 * expands and its SetGrid has painted. Transient (not persisted): a stale
 * focus request surviving a reload has no meaning. */
export interface SetFocusRequest {
  exerciseName: string
  setNumber: number
}

/** The result of finishSession — the raw materials TodayPanel composes into
 * a SessionSummary/PR list/progression preview. useActiveSession stays
 * plan-agnostic (§5.5) — it does not build the summary itself. */
export interface FinishSessionResult {
  startedAtIso: string
  finishedAtIso: string
  prSnapshotAtStart: Record<string, PRRecord>
  /**
   * True when Finish was tapped with no working set logged. The session was
   * NOT marked completed on the server — see finishSession — so the day
   * stays open, and TodayPanel says so instead of showing a summary of
   * nothing.
   */
  nothingLogged?: boolean
  /**
   * True when the sets are saved but the session's completed stamp did not
   * reach the server. The local session IS finished — never trap someone in a
   * running session over a network failure — but the dialog says so rather
   * than showing an unqualified "Session complete", and the marker on the
   * record makes the next mount or foreground-return retry it.
   */
  serverCloseFailed?: boolean
}

export interface ActiveSessionValue extends ActiveSessionIdentity, RestState {
  ready: boolean
  logs: ExerciseSetLog[]
  setsFor: (exerciseId: string, exerciseName?: string) => ExerciseSetLog[]
  refresh: () => void
  logSet: (input: SaveSetInput) => ExerciseSetLog
  deleteSet: typeof deleteSet
  /** 'idle' before any session activity today; 'running' from an explicit
   * Start tap OR the first logged set (forgiving-by-design); 'finished'
   * after an explicit Finish tap or a silent stale auto-close. */
  status: 'idle' | 'running' | 'finished'
  startedAtIso: string | null
  startSession: () => void
  finishSession: () => Promise<FinishSessionResult | null>
  startRest: (label: string, durationSeconds: number, targetSetNumber?: number) => void
  adjustRest: (deltaSeconds: number) => void
  dismissRest: () => void
  requestedSetFocus: SetFocusRequest | null
  requestSetFocus: (request: SetFocusRequest) => void
  clearSetFocusRequest: () => void
  /** Cached previous-session sets for one exercise — call loadGhosts once (e.g. on mount) then read via ghosts(exerciseId); empty array until it resolves. The one fetcher app-wide now (was duplicated between SetLogger and the bulk-log path). */
  ghosts: (exerciseId: string) => ExerciseSetLog[]
  loadGhosts: (exerciseId: string) => void
  declaredOffPlan: string[]
  declareOffPlan: (name: string) => void
  undeclareOffPlan: (name: string) => void
  /**
   * Typed-but-not-yet-logged set values, and hand-added set rows (audit
   * §6.3). Kept here rather than in SetGrid's own state so they survive a
   * reload or a backgrounded tab mid-session.
   */
  setDraft: (exerciseId: string, setNumber: number) => SetDraft | undefined
  saveSetDraft: (exerciseId: string, setNumber: number, draft: SetDraft) => void
  clearSetDrafts: (exerciseId: string) => void
  extraSetsFor: (exerciseId: string) => number[]
  setExtraSets: (exerciseId: string, setNumbers: number[]) => void
}

/** One set row's in-progress values, exactly as typed — strings, because "" and "0" are different things to a half-filled box. */
export interface SetDraft {
  weight: string
  reps: string
  isBodyweight: boolean
}

const ActiveSessionContext = createContext<ActiveSessionValue | null>(null)

export function useActiveSession(): ActiveSessionValue {
  const ctx = useContext(ActiveSessionContext)
  if (!ctx) throw new Error('useActiveSession must be used within an ActiveSessionProvider')
  return ctx
}

export interface ActiveSessionProviderProps {
  profileId: string | undefined
  planCreatedAt: string | undefined
  totalWeeks: number
  devOverrideWeek: number | null
  devOverrideDay: string | null
  /** Bumped by external log sources (chat, dev seeding) to trigger a refetch — same signal `logsVersion` was already used for. */
  refreshToken?: number
  children: React.ReactNode
}

export function ActiveSessionProvider({
  profileId,
  planCreatedAt,
  totalWeeks,
  devOverrideWeek,
  devOverrideDay,
  refreshToken,
  children,
}: ActiveSessionProviderProps) {
  // Single init call for the whole app (was ExercisePlan.tsx:872, re-run on
  // every day change even though the store is idempotent) — moved to the
  // one place that owns the session lifecycle.
  useEffect(() => {
    initSetLogStore()
  }, [])

  // Initial PR cache load — the in-memory cache is empty until this
  // resolves. Kept alongside identity change so switching profiles doesn't
  // read a stale userId's records; refresh() below keeps it current after
  // every mutation surface (log, delete, chat-logged sets).
  useEffect(() => {
    if (profileId) refreshPRCacheFromDB(profileId).catch(console.error)
  }, [profileId])

  // Identity: stamped once per mount and re-stamped only when its actual
  // inputs change — never re-derived from a fresh clock read on every
  // render (dev-clock.ts's documented hazard: a mid-workout day rollover
  // would otherwise silently split one session into two).
  const identity = useMemo<ActiveSessionIdentity>(() => {
    if (!profileId) return { profileId: undefined, date: '', dayName: '', liveWeek: 1 }
    const ctx = getSessionDateContext(profileId)
    return {
      profileId,
      date: ctx.date,
      dayName: devOverrideDay ?? ctx.day,
      liveWeek: devOverrideWeek ?? getActiveMesocycleWeek(planCreatedAt, getAppNow(profileId), totalWeeks),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, devOverrideWeek, devOverrideDay, planCreatedAt, totalWeeks])

  const [logs, setLogs] = useState<ExerciseSetLog[]>([])
  const [ready, setReady] = useState(false)
  const [status, setStatus] = useState<'idle' | 'running' | 'finished'>('idle')
  const [startedAtIso, setStartedAtIso] = useState<string | null>(null)

  // Hydrate status/startedAtIso from the persisted record on identity
  // change — same pattern restEndsAt already uses below.
  useEffect(() => {
    if (!identity.profileId || !identity.date) {
      setStatus('idle')
      setStartedAtIso(null)
      return
    }
    const record = getActiveSessionRecord(identity.profileId, identity.date)
    setStatus(record?.status ?? 'idle')
    setStartedAtIso(record?.startedAtIso ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.profileId, identity.date])

  const refresh = useCallback(() => {
    if (!identity.profileId || !identity.date) return
    getSetsForDate(identity.profileId, identity.date)
      .then(rows => {
        setLogs(rows)
        setReady(true)
      })
      .catch(console.error)
    // refresh() is the one place every mutation surface (logSet, a manual
    // deleteSet+refresh pairing, chat-logged sets via refreshToken) already
    // converges on — piggybacking the PR cache's DB refresh here means a
    // deleted/undone set evicts and a chat-logged set ingests, without a
    // second signal to wire up per call site.
    refreshPRCacheFromDB(identity.profileId).catch(console.error)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.profileId, identity.date])

  useEffect(() => {
    setReady(false)
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.profileId, identity.date])

  useEffect(() => {
    if (refreshToken != null && refreshToken > 0) refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken])

  const setsFor = useCallback(
    (exerciseId: string, exerciseName?: string) => filterLoggableSets(logs, exerciseId, exerciseName),
    [logs],
  )

  // --- Ghosts (F1: the one getLastSessionSets fetcher for the session view,
  // replacing SetLogger's own per-instance effect and the bulk-log path's
  // ad hoc call) -----------------------------------------------------------
  const [ghostsMap, setGhostsMap] = useState<Record<string, ExerciseSetLog[]>>({})
  const loadedGhostKeysRef = useRef<Set<string>>(new Set())

  // A new session day invalidates every cached ghost — "last session before
  // X" changes when X does.
  useEffect(() => {
    loadedGhostKeysRef.current = new Set()
    setGhostsMap({})
  }, [identity.date])

  const loadGhosts = useCallback((exerciseId: string) => {
    if (!identity.profileId || !identity.date) return
    const key = `${identity.date}:${exerciseId}`
    if (loadedGhostKeysRef.current.has(key)) return
    loadedGhostKeysRef.current.add(key)
    getLastSessionSets(identity.profileId, exerciseId, identity.date)
      .then(rows => setGhostsMap(prev => ({ ...prev, [exerciseId]: rows })))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.profileId, identity.date])

  const ghosts = useCallback((exerciseId: string) => ghostsMap[exerciseId] ?? [], [ghostsMap])

  // --- Off-plan declarations (§1.7 H) — persisted so a declared-but-not-yet-
  // logged extra lift survives a reload. Detection (chat-logged / swapped-
  // away work) is computed by the caller from `logs` + the day's plan —
  // this hook stays plan-agnostic (§5.5 ownership boundary).
  const [declaredOffPlan, setDeclaredOffPlan] = useState<string[]>([])

  useEffect(() => {
    if (!identity.profileId || !identity.date) return
    const record = getActiveSessionRecord(identity.profileId, identity.date)
    setDeclaredOffPlan(record?.declaredOffPlan ?? [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.profileId, identity.date])

  // Every persist call merges onto the existing record rather than
  // constructing a fresh one — persistRest and persistDeclaredOffPlan write
  // different slices of the same record, and neither may clobber the
  // other's fields (a rest started after declaring off-plan work must not
  // wipe declaredOffPlan, and vice versa).
  const patchRecord = useCallback((patch: Partial<ActiveSessionRecord>) => {
    if (!identity.profileId || !identity.date) return
    const existing = getActiveSessionRecord(identity.profileId, identity.date)
    const now = getAppNow(identity.profileId).toISOString()
    // SPREAD the existing record, don't re-enumerate its fields.
    //
    // This used to list the fields to carry forward by hand, and had already
    // fallen behind: prSnapshotAtStart was missing from the list, so the PR
    // baseline captured at startSession was wiped by the very next patch —
    // starting a rest timer was enough. finishSession then read it back as
    // {} and built the session summary by diffing today's lifts against no
    // baseline at all.
    //
    // A hand-maintained carry-forward list is a rule that has to be updated
    // every time the record grows, in a file whose own header says later
    // phases will grow it. Spreading makes forgetting impossible, which is
    // the only version of this that survives the next field.
    saveActiveSessionRecord({
      ...(existing ?? {}),
      profileId: identity.profileId,
      date: identity.date,
      dayName: identity.dayName,
      liveWeek: identity.liveWeek,
      status: existing?.status ?? 'running',
      startedAtIso: existing?.startedAtIso ?? now,
      ...patch,
      lastActivityIso: now,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.profileId, identity.date, identity.dayName, identity.liveWeek])

  const logSet = useCallback((input: SaveSetInput): ExerciseSetLog => {
    const result = saveSet(input)
    // Forgiving by design: a logged set with no session open silently opens
    // one, backdated to "now" — patchRecord's own `existing?.startedAtIso ??
    // now` default IS that backdating (there's no earlier timestamp to
    // recover). Also transparently reopens a session the user had already
    // explicitly finished, if they keep logging afterward.
    patchRecord({ status: 'running', finishedAtIso: undefined })
    setStatus('running')
    refresh()
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, patchRecord])

  // --- Explicit start/finish (Part 1) -----------------------------------
  const startSession = useCallback(() => {
    if (!identity.profileId || !identity.date) return
    const now = getAppNow(identity.profileId).toISOString()
    patchRecord({
      status: 'running',
      startedAtIso: now,
      finishedAtIso: undefined,
      prSnapshotAtStart: getPRCache(identity.profileId),
    })
    setStatus('running')
    setStartedAtIso(now)
    // Stamps the DB row's started_at immediately, even before the first set
    // — same resolver the first-set sync path already uses, no parallel
    // writer.
    void ensureSessionSynced(identity.profileId, identity.date, 'training').catch(console.error)
  }, [identity.profileId, identity.date, patchRecord])

  const finishSession = useCallback(async (): Promise<FinishSessionResult | null> => {
    if (!identity.profileId || !identity.date) return null
    const record = getActiveSessionRecord(identity.profileId, identity.date)
    const finishedAtIso = getAppNow(identity.profileId).toISOString()
    const startedAt = record?.startedAtIso ?? finishedAtIso
    // NOTHING LOGGED, NOTHING COMPLETED. Ashley's Thursday, 3 Sep 2026: Start
    // and Finish four seconds apart with no set between them — a look at the
    // screen, not a workout — and the day was marked done. The coach then
    // asked how it felt, the strip showed a tick, and marking it a rest day
    // could not undo any of it because a completed session outranks a chosen
    // rest. A session is the sets in it; with none, Finish closes the local
    // session and leaves the day exactly as it was.
    const workingSets = (await getSetsForDate(identity.profileId, identity.date)).filter(s => !s.is_warmup)
    if (workingSets.length === 0) {
      patchRecord({ status: 'finished', finishedAtIso })
      setStatus('finished')
      return { startedAtIso: startedAt, finishedAtIso, prSnapshotAtStart: record?.prSnapshotAtStart ?? {}, nothingLogged: true }
    }
    let serverCloseFailed = false
    try {
      const sessionId = await ensureSessionSynced(identity.profileId, identity.date, 'training')
      await markSessionCompleted(sessionId) // real "now" — the explicit tap IS the finish moment
    } catch (e) {
      console.error(e)
      serverCloseFailed = true
    }
    // The local finish happens either way: the tap is the user's decision and
    // a dead connection must not veto it. What changes is that the failure is
    // now RECORDED rather than swallowed — see serverCloseFailedAt.
    patchRecord({ status: 'finished', finishedAtIso, serverCloseFailedAt: serverCloseFailed ? finishedAtIso : undefined })
    setStatus('finished')
    return { startedAtIso: startedAt, finishedAtIso, prSnapshotAtStart: record?.prSnapshotAtStart ?? {}, serverCloseFailed }
  }, [identity.profileId, identity.date, patchRecord])

  /**
   * Finish the server half of a session whose local half already finished.
   *
   * Runs on the same triggers as resolveStaleSession — mount, and every
   * foreground-return — because those are exactly the moments a phone has just
   * got its connection back. Deliberately separate from that function: a stale
   * session is one still RUNNING past its window, this one is already
   * finished and merely unsynced, and folding two different states into one
   * sweep is how a cleanup path comes to close sessions it shouldn't.
   *
   * Silent in both directions. A success needs no announcement (the user was
   * already told it would retry) and a failure just leaves the marker for the
   * next attempt.
   */
  const retryUnclosedSession = useCallback(async (profileId: string) => {
    const record = getMostRecentActiveSessionRecord(profileId)
    if (!record?.serverCloseFailedAt) return
    try {
      const sessionId = await ensureSessionSynced(profileId, record.date, 'training')
      // The finish moment, not now — "now" is whenever the connection came
      // back, which could be the next morning.
      await markSessionCompleted(sessionId, new Date(record.finishedAtIso ?? record.serverCloseFailedAt))
    } catch (e) {
      console.error('Retrying a session close failed; will try again next time:', e)
      return
    }
    const fresh = getActiveSessionRecord(profileId, record.date)
    if (fresh) saveActiveSessionRecord({ ...fresh, serverCloseFailedAt: undefined })
  }, [])

  // Auto-close a stale "running" session left open past D7's 6h grace
  // window (or one whose date has rolled past "today") — forgiving by
  // design: never left as a zombie, but silently, with no UI shown for a
  // prior run's cleanup. Checked on mount/identity-change and again on
  // foreground-return (the realistic mobile trigger for "backgrounded past
  // the window"), mirroring the rest facade's own resync listener set.
  const resolveStaleSession = useCallback(async (profileId: string, todayDate: string) => {
    const record = getMostRecentActiveSessionRecord(profileId)
    const nowIso = getAppNow(profileId).toISOString()
    if (!record || !isSessionStale(record, nowIso, todayDate)) return
    // Same rule as an explicit Finish: a session that was opened and then
    // abandoned with nothing logged is closed locally and never marked
    // completed on the server.
    const hadWork = (await getSetsForDate(profileId, record.date)).some(s => !s.is_warmup)
    if (hadWork) {
      try {
        const sessionId = await ensureSessionSynced(profileId, record.date, 'training')
        // NOT "now" — now could be hours later than when the user actually
        // stopped; lastActivityIso is the best-known real finish moment.
        await markSessionCompleted(sessionId, new Date(record.lastActivityIso))
      } catch (e) {
        console.error(e)
      }
    }
    saveActiveSessionRecord({ ...record, status: 'finished', finishedAtIso: record.lastActivityIso })
    if (record.date === todayDate) setStatus('finished')
  }, [])

  useEffect(() => {
    if (!identity.profileId || !identity.date) return
    void resolveStaleSession(identity.profileId, identity.date)
    void retryUnclosedSession(identity.profileId)
  }, [identity.profileId, identity.date, resolveStaleSession, retryUnclosedSession])

  useEffect(() => {
    if (!identity.profileId || !identity.date) return
    const profileId = identity.profileId
    const todayDate = identity.date
    const handler = () => {
      void resolveStaleSession(profileId, todayDate)
      void retryUnclosedSession(profileId)
    }
    document.addEventListener('visibilitychange', handler)
    window.addEventListener('focus', handler)
    window.addEventListener('pageshow', handler)
    return () => {
      document.removeEventListener('visibilitychange', handler)
      window.removeEventListener('focus', handler)
      window.removeEventListener('pageshow', handler)
    }
  }, [identity.profileId, identity.date, resolveStaleSession, retryUnclosedSession])

  // --- Set drafts (audit §6.3) ------------------------------------------
  //
  // Read straight from the record on every call rather than mirrored into
  // React state: a draft changes on every keystroke, and a state mirror
  // would re-render the whole session tree per character. The record is a
  // synchronous localStorage read, which is cheap enough to do per row.
  const draftKey = (exerciseId: string, setNumber: number) => `${exerciseId}:${setNumber}`

  const currentRecord = useCallback(() => (
    identity.profileId && identity.date ? getActiveSessionRecord(identity.profileId, identity.date) : null
  ), [identity.profileId, identity.date])

  const setDraft = useCallback((exerciseId: string, setNumber: number): SetDraft | undefined =>
    currentRecord()?.drafts?.[draftKey(exerciseId, setNumber)], [currentRecord])

  const saveSetDraft = useCallback((exerciseId: string, setNumber: number, draft: SetDraft) => {
    const existing = currentRecord()?.drafts ?? {}
    patchRecord({ drafts: { ...existing, [draftKey(exerciseId, setNumber)]: draft } })
  }, [currentRecord, patchRecord])

  /** Called once a set is logged — the typed value has become a real row, and keeping it would resurrect it on the next reload. */
  const clearSetDrafts = useCallback((exerciseId: string) => {
    const existing = currentRecord()?.drafts
    if (!existing) return
    const next = Object.fromEntries(Object.entries(existing).filter(([k]) => !k.startsWith(`${exerciseId}:`)))
    patchRecord({ drafts: next })
  }, [currentRecord, patchRecord])

  const extraSetsFor = useCallback((exerciseId: string): number[] =>
    currentRecord()?.extraSets?.[exerciseId] ?? [], [currentRecord])

  const setExtraSets = useCallback((exerciseId: string, setNumbers: number[]) => {
    const existing = currentRecord()?.extraSets ?? {}
    patchRecord({ extraSets: { ...existing, [exerciseId]: setNumbers } })
  }, [currentRecord, patchRecord])

  const persistDeclaredOffPlan = useCallback((names: string[]) => {
    patchRecord({ declaredOffPlan: names })
  }, [patchRecord])

  const declareOffPlan = useCallback((name: string) => {
    setDeclaredOffPlan(prev => {
      if (prev.includes(name)) return prev
      const next = [...prev, name]
      persistDeclaredOffPlan(next)
      return next
    })
  }, [persistDeclaredOffPlan])

  const undeclareOffPlan = useCallback((name: string) => {
    setDeclaredOffPlan(prev => {
      const next = prev.filter(n => n !== name)
      persistDeclaredOffPlan(next)
      return next
    })
  }, [persistDeclaredOffPlan])

  // --- Rest facade -----------------------------------------------------
  // Deadline-anchored (§3.8): the record stores WHEN the rest ends, never a
  // remaining-seconds counter, so it is correct after backgrounding,
  // throttling, reload, and tab switches — the exact defects
  // RestTimer.tsx's tick-counting had. `restEndsAt`/`restLabel` are read
  // from the persisted record so a reload mid-rest restores the same
  // deadline; `restRemainingMs` is a live tick recomputed on an interval
  // and resynced on visibilitychange/pageshow/focus.
  const [restEndsAt, setRestEndsAt] = useState<string | null>(null)
  const [restLabel, setRestLabel] = useState<string | null>(null)
  const [restTargetSetNumber, setRestTargetSetNumber] = useState<number | null>(null)
  const [restTotalMs, setRestTotalMs] = useState<number | null>(null)

  // Hydrate rest state from the persisted record when identity resolves —
  // this is what makes the timer survive a reload or a tab switch (the app
  // root never unmounts the provider, so in practice this only matters on
  // a fresh load / hard reload).
  useEffect(() => {
    if (!identity.profileId || !identity.date) return
    const record = getActiveSessionRecord(identity.profileId, identity.date)
    if (record?.restEndsAt) {
      setRestEndsAt(record.restEndsAt)
      setRestLabel(record.restLabel ?? null)
      setRestTargetSetNumber(record.restTargetSetNumber ?? null)
      setRestTotalMs(record.restTotalMs ?? null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.profileId, identity.date])

  const persistRest = useCallback((endsAt: string | null, label: string | null, targetSetNumber: number | null, totalMs: number | null) => {
    patchRecord({ restEndsAt: endsAt ?? undefined, restLabel: label ?? undefined, restTargetSetNumber: targetSetNumber ?? undefined, restTotalMs: totalMs ?? undefined })
  }, [patchRecord])

  const startRest = useCallback((label: string, durationSeconds: number, targetSetNumber?: number) => {
    if (!identity.profileId) return
    const totalMs = durationSeconds * 1000
    const endsAt = new Date(getAppNow(identity.profileId).getTime() + totalMs).toISOString()
    setRestEndsAt(endsAt)
    setRestLabel(label)
    setRestTargetSetNumber(targetSetNumber ?? null)
    setRestTotalMs(totalMs)
    persistRest(endsAt, label, targetSetNumber ?? null, totalMs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.profileId, persistRest])

  const adjustRest = useCallback((deltaSeconds: number) => {
    setRestEndsAt(prev => {
      if (!prev || !identity.profileId) return prev
      const next = new Date(new Date(prev).getTime() + deltaSeconds * 1000).toISOString()
      const nextTotalMs = (restTotalMs ?? 0) + deltaSeconds * 1000
      setRestTotalMs(nextTotalMs)
      persistRest(next, restLabel, restTargetSetNumber, nextTotalMs)
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.profileId, persistRest, restLabel, restTargetSetNumber, restTotalMs])

  const dismissRest = useCallback(() => {
    setRestEndsAt(null)
    setRestLabel(null)
    setRestTargetSetNumber(null)
    setRestTotalMs(null)
    persistRest(null, null, null, null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistRest])

  // Tick + resync, extracted to useDeadlineTick (shared with the standalone
  // stopwatch/lap/round timers) — the DISPLAYED value is always
  // `restEndsAt - now`, recomputed fresh each tick, never from the tick
  // counter itself, so a throttled/missed tick only delays the redraw.
  const restTick = useDeadlineTick(!!restEndsAt)

  const restRemainingMs = useMemo(() => {
    if (!restEndsAt || !identity.profileId) return null
    void restTick
    return new Date(restEndsAt).getTime() - getAppNow(identity.profileId).getTime()
  }, [restEndsAt, restTick, identity.profileId])

  // --- Cross-tree set-focus request (BottomDock -> the matching ExerciseRow,
  // different subtrees) — transient, never persisted.
  const [requestedSetFocus, setRequestedSetFocus] = useState<SetFocusRequest | null>(null)
  const requestSetFocus = useCallback((request: SetFocusRequest) => setRequestedSetFocus(request), [])
  const clearSetFocusRequest = useCallback(() => setRequestedSetFocus(null), [])

  const value: ActiveSessionValue = {
    ...identity,
    ready,
    logs,
    setsFor,
    refresh,
    logSet,
    deleteSet,
    status,
    startedAtIso,
    startSession,
    finishSession,
    startRest,
    adjustRest,
    dismissRest,
    restEndsAt,
    restLabel,
    restRemainingMs,
    restTargetSetNumber,
    restTotalMs,
    requestedSetFocus,
    requestSetFocus,
    clearSetFocusRequest,
    ghosts,
    loadGhosts,
    declaredOffPlan,
    setDraft,
    saveSetDraft,
    clearSetDrafts,
    extraSetsFor,
    setExtraSets,
    declareOffPlan,
    undeclareOffPlan,
  }

  return <ActiveSessionContext.Provider value={value}>{children}</ActiveSessionContext.Provider>
}

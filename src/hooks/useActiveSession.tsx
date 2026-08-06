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
import { saveSet, deleteSet, getSetsForDate, getLastSessionSets, initSetLogStore, type SaveSetInput } from '@/lib/set-log-store'
import { seedPRCacheFromHistory } from '@/lib/pr-engine'
import { filterLoggableSets } from '@/lib/session-derive'
import {
  getActiveSessionRecord,
  saveActiveSessionRecord,
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
}

/** A pending "focus this specific set's input" request — set by BottomDock's
 * "Start next set" action, consumed by the matching ExerciseRow once it
 * expands and its SetGrid has painted. Transient (not persisted): a stale
 * focus request surviving a reload has no meaning. */
export interface SetFocusRequest {
  exerciseName: string
  setNumber: number
}

export interface ActiveSessionValue extends ActiveSessionIdentity, RestState {
  ready: boolean
  logs: ExerciseSetLog[]
  setsFor: (exerciseId: string, exerciseName?: string) => ExerciseSetLog[]
  refresh: () => void
  logSet: (input: SaveSetInput) => ExerciseSetLog
  deleteSet: typeof deleteSet
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

  // PR cache seeding used to run only when ExercisePlan mounted (i.e. only
  // if the user visited the Exercise tab) — now that the program browse
  // stand-in is the only thing ExercisePlan renders, and it may never
  // mount in a session, seeding belongs at the root that always mounts.
  useEffect(() => {
    if (profileId) seedPRCacheFromHistory(profileId).catch(console.error)
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

  const refresh = useCallback(() => {
    if (!identity.profileId || !identity.date) return
    getSetsForDate(identity.profileId, identity.date)
      .then(rows => {
        setLogs(rows)
        setReady(true)
      })
      .catch(console.error)
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

  const logSet = useCallback((input: SaveSetInput): ExerciseSetLog => {
    const result = saveSet(input)
    refresh()
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh])

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
    saveActiveSessionRecord({
      profileId: identity.profileId,
      date: identity.date,
      dayName: identity.dayName,
      liveWeek: identity.liveWeek,
      status: existing?.status ?? 'running',
      startedAtIso: existing?.startedAtIso ?? now,
      finishedAtIso: existing?.finishedAtIso,
      restEndsAt: existing?.restEndsAt,
      restLabel: existing?.restLabel,
      restTargetSetNumber: existing?.restTargetSetNumber,
      declaredOffPlan: existing?.declaredOffPlan,
      ...patch,
      lastActivityIso: now,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.profileId, identity.date, identity.dayName, identity.liveWeek])

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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.profileId, identity.date])

  const persistRest = useCallback((endsAt: string | null, label: string | null, targetSetNumber: number | null) => {
    patchRecord({ restEndsAt: endsAt ?? undefined, restLabel: label ?? undefined, restTargetSetNumber: targetSetNumber ?? undefined })
  }, [patchRecord])

  const startRest = useCallback((label: string, durationSeconds: number, targetSetNumber?: number) => {
    if (!identity.profileId) return
    const endsAt = new Date(getAppNow(identity.profileId).getTime() + durationSeconds * 1000).toISOString()
    setRestEndsAt(endsAt)
    setRestLabel(label)
    setRestTargetSetNumber(targetSetNumber ?? null)
    persistRest(endsAt, label, targetSetNumber ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.profileId, persistRest])

  const adjustRest = useCallback((deltaSeconds: number) => {
    setRestEndsAt(prev => {
      if (!prev || !identity.profileId) return prev
      const next = new Date(new Date(prev).getTime() + deltaSeconds * 1000).toISOString()
      persistRest(next, restLabel, restTargetSetNumber)
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.profileId, persistRest, restLabel, restTargetSetNumber])

  const dismissRest = useCallback(() => {
    setRestEndsAt(null)
    setRestLabel(null)
    setRestTargetSetNumber(null)
    persistRest(null, null, null)
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
    startRest,
    adjustRest,
    dismissRest,
    restEndsAt,
    restLabel,
    restRemainingMs,
    restTargetSetNumber,
    requestedSetFocus,
    requestSetFocus,
    clearSetFocusRequest,
    ghosts,
    loadGhosts,
    declaredOffPlan,
    declareOffPlan,
    undeclareOffPlan,
  }

  return <ActiveSessionContext.Provider value={value}>{children}</ActiveSessionContext.Provider>
}

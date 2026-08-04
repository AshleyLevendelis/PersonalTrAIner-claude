// ---------------------------------------------------------------------------
// The one state owner for "what session is live right now" (LAYOUT-DESIGN.md
// §5.2 / D6 / F3). Nothing by this name existed before this phase.
//
// P1 scope only: identity (frozen once, never re-derived per render — F3),
// `logs` + `setsFor` as the sole read model, a thin write facade
// (`logSet`/`deleteSet`) around set-log-store, and a deadline-anchored rest
// facade backed by the persisted session record. Ghosts, cursor, drafts,
// order, PRs, off-plan tracking and everything else the full design's
// schema lists arrive with the phase that actually consumes them (P2/P3) —
// shipping them now would be unread, forkable state.
//
// `liveWeek` here has NO setter exposed to any component (D8) — it is
// stamped once from `getSessionDateContext` + `getActiveMesocycleWeek` and
// only re-stamped when the identity INPUTS change (profile, dev overrides,
// plan creation date, total weeks), never by user interaction. Browsing a
// different week is a separate, view-local concern from P2 onward.
// ---------------------------------------------------------------------------

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { getAppNow, getSessionDateContext } from '@/lib/dev-clock'
import { getActiveMesocycleWeek } from '@/lib/calculations'
import { saveSet, deleteSet, getSetsForDate, initSetLogStore, type SaveSetInput } from '@/lib/set-log-store'
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
}

export interface ActiveSessionValue extends ActiveSessionIdentity, RestState {
  ready: boolean
  logs: ExerciseSetLog[]
  setsFor: (exerciseId: string, exerciseName?: string) => ExerciseSetLog[]
  refresh: () => void
  logSet: (input: SaveSetInput) => ExerciseSetLog
  deleteSet: typeof deleteSet
  startRest: (label: string, durationSeconds: number) => void
  adjustRest: (deltaSeconds: number) => void
  dismissRest: () => void
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
  const [restTick, setRestTick] = useState(0)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.profileId, identity.date])

  const persistRest = useCallback((endsAt: string | null, label: string | null) => {
    if (!identity.profileId || !identity.date) return
    const existing = getActiveSessionRecord(identity.profileId, identity.date)
    const now = getAppNow(identity.profileId).toISOString()
    const record: ActiveSessionRecord = {
      profileId: identity.profileId,
      date: identity.date,
      dayName: identity.dayName,
      liveWeek: identity.liveWeek,
      status: existing?.status ?? 'running',
      startedAtIso: existing?.startedAtIso ?? now,
      finishedAtIso: existing?.finishedAtIso,
      lastActivityIso: now,
      restEndsAt: endsAt ?? undefined,
      restLabel: label ?? undefined,
    }
    saveActiveSessionRecord(record)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.profileId, identity.date, identity.dayName, identity.liveWeek])

  const startRest = useCallback((label: string, durationSeconds: number) => {
    if (!identity.profileId) return
    const endsAt = new Date(getAppNow(identity.profileId).getTime() + durationSeconds * 1000).toISOString()
    setRestEndsAt(endsAt)
    setRestLabel(label)
    persistRest(endsAt, label)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.profileId, persistRest])

  const adjustRest = useCallback((deltaSeconds: number) => {
    setRestEndsAt(prev => {
      if (!prev || !identity.profileId) return prev
      const next = new Date(new Date(prev).getTime() + deltaSeconds * 1000).toISOString()
      persistRest(next, restLabel)
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.profileId, persistRest, restLabel])

  const dismissRest = useCallback(() => {
    setRestEndsAt(null)
    setRestLabel(null)
    persistRest(null, null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistRest])

  // Tick + resync. A plain setInterval is fine here because the DISPLAYED
  // value is always `restEndsAt - now`, recomputed fresh each tick — unlike
  // the old RestTimer, a throttled/missed tick cannot make the number wrong,
  // only late by a frame. visibilitychange/pageshow/focus force an
  // immediate resync so returning from background never shows a stale
  // number even for that one frame.
  useEffect(() => {
    if (!restEndsAt) return
    tickRef.current = setInterval(() => setRestTick(t => t + 1), 1000)
    const resync = () => setRestTick(t => t + 1)
    document.addEventListener('visibilitychange', resync)
    window.addEventListener('pageshow', resync)
    window.addEventListener('focus', resync)
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
      document.removeEventListener('visibilitychange', resync)
      window.removeEventListener('pageshow', resync)
      window.removeEventListener('focus', resync)
    }
  }, [restEndsAt])

  const restRemainingMs = useMemo(() => {
    if (!restEndsAt || !identity.profileId) return null
    // restTick is read only to force this memo to recompute on each tick —
    // the actual value always comes fresh from getAppNow, never from a
    // counter, so a missed/throttled tick only delays the redraw, never
    // corrupts the number.
    void restTick
    return new Date(restEndsAt).getTime() - getAppNow(identity.profileId).getTime()
  }, [restEndsAt, restTick, identity.profileId])

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
  }

  return <ActiveSessionContext.Provider value={value}>{children}</ActiveSessionContext.Provider>
}

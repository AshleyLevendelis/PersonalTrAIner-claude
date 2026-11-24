// ---------------------------------------------------------------------------
// LOADS WHAT A PLAN-CHANGING PATH MUST KNOW BEFORE IT RUNS — the one I/O half
// of plan-guard.ts and effective-constraints.ts, which are both pure.
//
// Every path that replaces days of a live plan (an adaptation, a kit change,
// each rebuild offer, ending an adaptation) asks this for its context and is
// not able to run without one: the functions it calls take a required
// `PlanEditContext`. See plan-adaptations.ts.
//
// WHEN A READ FAILS, IT PROTECTS MORE, NOT LESS. If the app cannot find out
// what has been logged today it treats today as trained and says so in the
// console. Nothing is ever changed on the strength of "could not check".
// ---------------------------------------------------------------------------

import { supabase } from './supabase'
import { getSessionMovesInRange } from './daily-tracking'
import { getAppNow, getLocalDateString } from './dev-clock'
import { getLocalSetsForDate } from './set-log-store'
import { getActiveSessionRecord } from './active-session-store'
import { getActiveAdaptations, type PlanAdaptationRow } from './plan-adaptations-store'
import { buildDayGuard, buildBanGuard, type DayGuard } from './plan-guard'
import { addDays, type SessionMove } from './session-move'
import { effectiveConstraints, isAdaptationActive } from './effective-constraints'
import type { PlanEditContext } from './plan-adaptations'
import type { MesocycleWeek, UserProfile } from './types'

interface SessionFlags {
  id: string
  date: string
  marked_missed?: boolean | null
  deliberate_rest?: boolean | null
  swapped_for_activity?: string | null
}

export interface LoadedPlanEditContext extends PlanEditContext {
  /** The adaptations running now, as loaded — for the caller that also shows them. */
  adaptations: PlanAdaptationRow[]
  /**
   * THE GUARD A BAN WRITES THROUGH (24 Nov 2026, Ashley mid-session: "it told me that it was out for good but it
   * stayed on my day"). `isProtected` treats a session that is RUNNING as trained, which is right for a rebuild (it
   * would redraw the whole session under him) and wrong for a ban: he is looking at the exercise in that session and
   * asking for it gone, the same edit a mid-session swap already makes. So today's running session is open to a ban
   * of an exercise he has logged NOTHING of today; a finished, missed, rested or swapped day, a past day, and an
   * exercise with even one logged set stay as they are, the record (plan-guard rule 1).
   */
  banGuard: (exerciseName: string) => DayGuard
}

export async function loadPlanEditContext(
  profile: Pick<UserProfile, 'id' | 'injuries'>,
  mesocycle: MesocycleWeek[],
  planCreatedAt: string | undefined,
): Promise<LoadedPlanEditContext> {
  const now = getAppNow(profile.id)
  const today = getLocalDateString(now)
  const logged = new Set<string>()
  const closed = new Set<string>()
  let moves: SessionMove[] = []
  let adaptations: PlanAdaptationRow[] = []
  /** Exercises with a set logged today, lower-cased. Null when it could not be read: then nothing is opened. */
  let loggedTodayNames: Set<string> | null = new Set<string>()
  let runningToday = false

  if (profile.id) {
    // What this phone already knows about today counts before the server
    // answers: a set logged ten seconds ago is a set logged.
    try {
      const localRows = getLocalSetsForDate(profile.id, today).rows
      if (localRows.length > 0) logged.add(today)
      for (const r of localRows) loggedTodayNames?.add(r.exercise_name.toLowerCase())
      // A SESSION RUNNING TODAY IS TODAY BEING TRAINED, sets or not (run 5, H28, 11 Oct 2026): a rebuild applied
      // mid-session replaced the session on screen with a different one.
      if (getActiveSessionRecord(profile.id, today)?.status === 'running') { logged.add(today); runningToday = true }
    } catch { loggedTodayNames = null /* no local store outside the browser */ }

    try {
      const horizon = addDays(today, mesocycle.length * 7 + 8)
      const since = planCreatedAt ? getLocalDateString(new Date(planCreatedAt)) : addDays(today, -28)
      const [sessions, movesRead, active] = await Promise.all([
        supabase
          .from('workout_sessions')
          .select('id, date, marked_missed, deliberate_rest, swapped_for_activity')
          .eq('profile_id', profile.id)
          .gte('date', today),
        getSessionMovesInRange(profile.id, since < today ? since : today, horizon),
        getActiveAdaptations(profile.id),
      ])
      if (sessions.error) throw sessions.error
      moves = movesRead
      adaptations = active
      const rows = (sessions.data ?? []) as SessionFlags[]
      for (const s of rows) {
        if (s.marked_missed || s.deliberate_rest || s.swapped_for_activity) closed.add(s.date)
      }
      const ids = rows.map(s => s.id).filter(Boolean)
      if (ids.length > 0) {
        const logs = await supabase.from('exercise_set_logs').select('session_id, exercise_name').in('session_id', ids)
        if (logs.error) throw logs.error
        const dateOf = new Map(rows.map(s => [s.id, s.date]))
        for (const l of (logs.data ?? []) as { session_id: string; exercise_name?: string | null }[]) {
          const date = dateOf.get(l.session_id)
          if (date) logged.add(date)
          if (date === today && l.exercise_name) loggedTodayNames?.add(l.exercise_name.toLowerCase())
        }
      }
    } catch (err) {
      console.error('Could not check what has been trained today, so today is being treated as trained:', err)
      closed.add(today)
      loggedTodayNames = null
    }
  }

  const calendar = { planCreatedAt, today, moves }
  const live = adaptations.filter(a => isAdaptationActive(a, now))
  // Every running temporary change, injury AND kit: a rebuild carries both through until they end (run 5, H28).
  const injuryEnds = live.map(a => getLocalDateString(new Date(a.expires_at))).sort()
  const guardInput = { ...calendar, loggedDates: logged, closedDates: closed }
  const isProtected = buildDayGuard(mesocycle, guardInput)
  const banGuard = (exerciseName: string): DayGuard =>
    buildBanGuard(mesocycle, { ...guardInput, runningToday, loggedTodayNames, exerciseName })
  return {
    isProtected,
    banGuard,
    constraints: effectiveConstraints(profile, live, now),
    calendar,
    constrainedUntil: injuryEnds.length > 0 ? injuryEnds[injuryEnds.length - 1] : null,
    adaptations: live,
  }
}

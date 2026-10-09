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
import { getActiveAdaptations, type PlanAdaptationRow } from './plan-adaptations-store'
import { buildDayGuard } from './plan-guard'
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

  if (profile.id) {
    // What this phone already knows about today counts before the server
    // answers: a set logged ten seconds ago is a set logged.
    try {
      if (getLocalSetsForDate(profile.id, today).rows.length > 0) logged.add(today)
    } catch { /* no local store outside the browser */ }

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
        const logs = await supabase.from('exercise_set_logs').select('session_id').in('session_id', ids)
        if (logs.error) throw logs.error
        const dateOf = new Map(rows.map(s => [s.id, s.date]))
        for (const l of (logs.data ?? []) as { session_id: string }[]) {
          const date = dateOf.get(l.session_id)
          if (date) logged.add(date)
        }
      }
    } catch (err) {
      console.error('Could not check what has been trained today, so today is being treated as trained:', err)
      closed.add(today)
    }
  }

  const calendar = { planCreatedAt, today, moves }
  const live = adaptations.filter(a => isAdaptationActive(a, now))
  const injuryEnds = live.filter(a => a.kind === 'injury').map(a => getLocalDateString(new Date(a.expires_at))).sort()
  return {
    isProtected: buildDayGuard(mesocycle, { ...calendar, loggedDates: logged, closedDates: closed }),
    constraints: effectiveConstraints(profile, live, now),
    calendar,
    constrainedUntil: injuryEnds.length > 0 ? injuryEnds[injuryEnds.length - 1] : null,
    adaptations: live,
  }
}

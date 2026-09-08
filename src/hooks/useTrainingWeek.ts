// ---------------------------------------------------------------------------
// The week strip's data source (LAYOUT-DESIGN.md §1.3/§5.2). A sibling to
// useActiveSession, not a member of it — this is READ-ONLY orientation data
// for the whole Mon-Sun window, not live session identity. Deliberately NOT
// bound to subscribeSyncState (see useActiveSession's doc comment on the
// same hazard): a save shouldn't refetch a whole week just to redraw one
// glyph — the caller overlays today's cell from its own setsFor result
// instead (see WeekStrip).
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react'
import { getWeeklyDashboard, getSessionMovesInRange, type WeeklyDashboardDay } from '@/lib/daily-tracking'
import { sessionForDate, type SessionMove } from '@/lib/session-move'
import { getAppNow, getLocalDateString } from '@/lib/dev-clock'
import type { WorkoutDay } from '@/lib/types'

export type DayGlyphState = 'done' | 'partial' | 'due' | 'missed' | 'rest' | 'recovery' | 'before_plan' | 'swapped' | 'rest_chosen' | 'moved'

export interface TrainingWeekDay {
  date: string
  dayName: string
  state: DayGlyphState
  /**
   * What they did INSTEAD, when `state` is 'swapped' — the activity name as
   * they gave it ("Muay Thai"), straight off workout_sessions.
   *
   * Carried here rather than re-read by each surface, because on 8 Sep 2026
   * exactly that split showed: the strip drew its swap glyph correctly while
   * TodayPanel, which read nothing, went on offering "Start workout" for a
   * session Ashley had already replaced. Two readers of one fact is how they
   * come to disagree; the state and the name now travel together.
   */
  swappedForActivity?: string | null
  /** Set on the ORIGIN of a move — where this day's session went. */
  movedTo?: { date: string; dayName: string } | null
  /** Set on the TARGET of a move — where this day's session came from. */
  movedFrom?: { date: string; dayName: string } | null
  /**
   * The session actually run on this date, moves taken into account. The one
   * answer every screen used to derive for itself with
   * `plan.find(d => d.day === dayName)` — right only for a day nothing has
   * happened to, and there are now four ways that can be false.
   */
  session?: WorkoutDay | null
}

export interface TrainingWeekResult {
  days: TrainingWeekDay[]
  /** Every move touching this window, both ends — the raw fact behind the two fields on each day. */
  moves: SessionMove[]
  sessionsDone: number
  sessionsPlanned: number
  loading: boolean
  refresh: () => void
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function mondayOf(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d
}

/**
 * Does this day count in "N of M sessions done"?
 *
 * 'before_plan' is excluded alongside rest/recovery: a day the plan never
 * covered is not a session you owe, so it must not inflate M. Exported and
 * named rather than inlined so the tally and its test can't drift.
 *
 * 'swapped' joins them, and the reasoning is worth stating because it changes
 * what this number measures. The tally counts sessions OF THE LIFTING PLAN. A
 * swapped day is one the trainee deliberately did not do, so counting it as
 * done would inflate lifting adherence, and counting it as missed is the
 * exact bug the state exists to fix. Dropping it mirrors 'before_plan'.
 *
 * The alternative — counting it as done, on the grounds that Muay Thai is
 * real training — is defensible, and it is one entry in this predicate if
 * Ashley prefers it. What the trainee actually did is not lost either way:
 * it goes to cardio_logs and the streak already reads that table.
 *
 * 'moved' joins them for a different reason, and the arithmetic is the point:
 * the session is still owed, so it must be counted exactly ONCE. It is
 * counted on the day it landed on — which classifyDay now treats as an
 * ordinary training day — so counting the origin as well would tell her she
 * owes two sessions where the plan asked for one.
 */
export function countsTowardWeekTally(state: DayGlyphState): boolean {
  return state !== 'rest' && state !== 'recovery' && state !== 'before_plan' && state !== 'swapped' && state !== 'rest_chosen' && state !== 'moved'
}

export function classifyDay(
  weekdayName: string,
  dateStr: string,
  todayStr: string,
  plan: WorkoutDay[],
  dashboardDay: WeeklyDashboardDay | undefined,
  planStartStr: string | undefined,
  /**
   * Moves touching this week — "I'll do Tuesday's session on Wednesday".
   * Defaulted to none so every existing caller and every existing week
   * classifies exactly as it did before.
   */
  moves: SessionMove[] = [],
): DayGlyphState {
  // WHAT IS ACTUALLY RUN HERE, which is the plan's own row only for a day
  // nothing has happened to. On the RECEIVING end of a move this is the
  // session that travelled in, so a free Wednesday classifies as the training
  // day it has become; on the ORIGIN we keep the plan's own row, because the
  // day still HAS a session — it is just being run elsewhere, and the branch
  // below is what says so.
  const resolved = sessionForDate({ date: dateStr, plan, moves })
  const workout = resolved.movedTo ? plan.find(d => d.day === weekdayName) : resolved.day ?? undefined
  if (!workout) return 'rest'
  if (workout.exercises.length === 0) return 'recovery'

  // Logged work outranks every date judgement below. If they trained that
  // day it counts, even if it predates the plan — anything else would erase
  // real work to make a tidier calendar.
  //
  // WORK, not a flag. A session row can carry is_completed with nothing in
  // it — Start and Finish four seconds apart, a look at the screen (Ashley's
  // Thursday, 3 Sep 2026) — and until this check asked for the sets, that
  // read as a tick the trainee could not remove: a chosen rest day ranked
  // below it. Finish no longer completes an empty session, and the rows that
  // already exist stop counting here.
  const loggedWork = !!dashboardDay && (dashboardDay.workoutLogs.length > 0 || (dashboardDay.cardioLogs?.length ?? 0) > 0)
  if (dashboardDay?.session?.is_completed && loggedWork) return 'done'
  if (dashboardDay && dashboardDay.workoutLogs.length > 0) return 'partial'

  // Deliberately swapped for something else, and said so at the time. Ranked
  // BELOW the logged-work checks above on purpose: someone who announced a
  // swap and then lifted anyway has earned the 'done', and the rule this file
  // already states — logged work outranks every date judgement — must keep
  // holding. Ranked above the date judgement because a swap is exactly the
  // thing that stops a day being 'missed'.
  // Moved to another day, and said so. Ranked with the swap and the chosen
  // rest below for the same two reasons: logged work still outranks it
  // (someone who said they would move it and then trained anyway has earned
  // the 'done'), and it must sit above the date judgement, because not being
  // called 'missed' is the entire point.
  //
  // A SEPARATE STATE from both. 'swapped' says work happened elsewhere and
  // 'rest_chosen' says none happened and that was the plan; this one says the
  // work is still owed, on a named day. Collapsing any two of them would lose
  // the only fact the trainee actually gave us.
  if (resolved.movedTo) return 'moved'

  if (dashboardDay?.session?.swapped_for_activity) return 'swapped'

  // Rested on purpose, and said so. Ranked here for the same two reasons the
  // swap above is: logged work still outranks it (someone who declared a rest
  // and then trained anyway has earned the 'done'), and it has to sit above
  // the date judgement, because not being called 'missed' is the entire point.
  //
  // A SEPARATE STATE from 'rest', not the same one. 'rest' means the plan
  // never asked for anything that day; this means it did and they chose not
  // to. Collapsing them would quietly rewrite the plan's history into one
  // where Monday was never a training day — which is the tidier calendar this
  // file already refuses to draw two checks above.
  if (dashboardDay?.session?.deliberate_rest) return 'rest_chosen'

  // Nothing was prescribed before the plan existed, so nothing was missed.
  // Without this, someone who finished onboarding on a Thursday opened the
  // app to Monday and Wednesday already marked missed — the reward for
  // signing up was being told they had failed twice. Ashley's call: those
  // days are not part of the plan and are not counted (see the tally above).
  if (planStartStr && dateStr < planStartStr) return 'before_plan'

  return dateStr < todayStr ? 'missed' : 'due'
}

/**
 * `plan` should be the LIVE week's WorkoutDay[] (mesocycle week matching
 * liveWeek, or the flat base plan for a legacy/no-mesocycle profile) — this
 * hook only fetches log/session data, never plan data, matching the
 * ownership split in LAYOUT-DESIGN.md §5.5 (plan stays App-owned).
 */
export function useTrainingWeek(
  profileId: string | undefined,
  sessionDate: string,
  plan: WorkoutDay[],
  /**
   * When this plan came into existence (ISO instant — App.tsx's
   * `mesocycleCreatedAt ?? profile.created_at`). Converted to a LOCAL date
   * below: every other date in this hook is a getLocalDateString value, and
   * comparing those against a UTC instant would misjudge the plan's own
   * first day either side of midnight.
   */
  planCreatedAt?: string,
  /**
   * Bumped by the caller when something OUTSIDE this hook has changed a day
   * — today: App's logsVersion, which the chat's rest-day/session writes
   * increment through onLogsUpdated.
   *
   * Without it the strip was write-blind. `refresh` keys on profile and date
   * only, so a rest day marked from the chat landed in workout_sessions and
   * the strip kept its stale glyph until a remount. Ashley reported exactly
   * that on 3 Sep 2026: "I marked a day as rest but nothing was changed."
   * The write HAD happened; the strip simply never re-read it. Same idiom
   * ActiveSessionProvider already uses for the same reason.
   */
  refreshToken?: number,
): TrainingWeekResult {
  const [dashboard, setDashboard] = useState<WeeklyDashboardDay[]>([])
  // A SECOND READ, deliberately: a move's two ends need not sit in the same
  // Monday-to-Sunday window (see getSessionMovesInRange). Held separately so
  // the day loop below can ask one resolver about both ends at once.
  const [moves, setMoves] = useState<SessionMove[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(() => {
    if (!profileId || !sessionDate) return
    const monday = mondayOf(new Date(sessionDate + 'T12:00:00'))
    const sunday = new Date(monday)
    sunday.setDate(sunday.getDate() + 6)
    setLoading(true)
    const from = getLocalDateString(monday)
    const to = getLocalDateString(sunday)
    Promise.all([
      getWeeklyDashboard(profileId, from, to),
      // Never rejects — it logs and returns what it has, so one failing read
      // cannot blank the whole strip.
      getSessionMovesInRange(profileId, from, to).catch(err => {
        console.error('useTrainingWeek: reading session moves failed', err)
        return [] as SessionMove[]
      }),
    ])
      .then(([week, wk]) => { setDashboard(week); setMoves(wk) })
      .catch(console.error)
      .finally(() => setLoading(false))
    // refreshToken is intentionally a dependency and intentionally unused
    // in the body — it exists to force this callback (and the effect below
    // that runs it) to re-fire when a day changed underneath us.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, sessionDate, refreshToken])

  useEffect(() => {
    refresh()
  }, [refresh])

  const planStartStr = planCreatedAt ? getLocalDateString(new Date(planCreatedAt)) : undefined
  const monday = sessionDate ? mondayOf(new Date(sessionDate + 'T12:00:00')) : new Date(getAppNow(profileId))
  const days: TrainingWeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(d.getDate() + i)
    const dateStr = getLocalDateString(d)
    const dayName = WEEKDAY_NAMES[d.getDay()]
    const dashboardDay = dashboard.find(dd => dd.date === dateStr)
    // Loading rule (§1.3): an un-logged training day must render 'due', never
    // 'missed', until the range read resolves — loading must not read as
    // failure. classifyDay already defaults an unmatched date to due/missed
    // by the real-vs-today comparison; while loading, dashboard is simply
    // empty, so every training day naturally falls through to its
    // date-based branch — for a PAST date that would wrongly say 'missed'
    // before data arrives, so gate explicitly on `loading`.
    const state = loading
      ? classifyLoadingSafe(dayName, plan, dateStr, planStartStr)
      : classifyDay(dayName, dateStr, sessionDate, plan, dashboardDay, planStartStr, moves)
    // Both ends of a move, resolved ONCE here rather than by each of the three
    // screens that need them. TodayPanel already reads the swap fact from this
    // hook rather than re-reading the row, with a comment recording why; this
    // follows the same path for the same reason.
    const resolved = sessionForDate({ date: dateStr, plan, moves })
    return {
      date: dateStr,
      dayName,
      state,
      swappedForActivity: dashboardDay?.session?.swapped_for_activity ?? null,
      movedTo: resolved.movedTo,
      movedFrom: resolved.movedFrom,
      session: resolved.day,
    }
  })

  const trainingDays = days.filter(d => countsTowardWeekTally(d.state))
  const sessionsPlanned = trainingDays.length
  const sessionsDone = trainingDays.filter(d => d.state === 'done').length

  return { days, sessionsDone, sessionsPlanned, loading, refresh, moves }
}

function classifyLoadingSafe(
  weekdayName: string,
  plan: WorkoutDay[],
  dateStr: string,
  planStartStr: string | undefined,
): DayGlyphState {
  const workout = plan.find(d => d.day === weekdayName)
  if (!workout) return 'rest'
  if (workout.exercises.length === 0) return 'recovery'
  // Same guard as classifyDay: a pre-plan day must not flash as 'due'
  // (an outstanding session) while the range read resolves.
  if (planStartStr && dateStr < planStartStr) return 'before_plan'
  return 'due'
}

// ---------------------------------------------------------------------------
// VISION.md Step 5 — "volume pull-back when recovery is poor... [is] core
// S&C, and the app should handle them explicitly." Step 4 (block-review.ts)
// read backward on LOAD; this reads backward on ATTENDANCE. If a trainee's
// real logged sessions covered less than two-thirds of what the block that
// just ended actually scheduled, the new block's volume is held at the
// previous block's own numbers instead of stepping up on the next
// periodization phase's formula — the same check-on-load, block-boundary
// shape as block-review.ts, reusing its getBlockDateRange unmodified. See
// the approved plan (Ashley's session) for the corrections that shaped this:
//
// - HOLD, never cut. This never reduces a number below what it already was
//   — it only ever skips a scheduled increase. If the new block's formula
//   would naturally have produced a LOWER number anyway (a lighter phase),
//   that's left alone; this only intervenes when it would otherwise go up.
//   Ashley: "Actively reducing someone's volume because they missed
//   sessions reads as the app giving up on them, and risks a spiral."
// - The explanation is never a comment on what happened. It's framed only
//   as something the app is doing FOR consistency, never a judgement about
//   missed sessions — the copy was reviewed and approved as part of the plan.
// - Deliberately NOT built here: any actual cut (not even the app's own
//   recovery-capacity scale), a repeat-block escalation (logged as a future
//   "maybe this is a schedule problem, not a volume problem" conversation),
//   and any RPE-trend fatigue signal — this is scoped to the one signal
//   that's unambiguous and already fully loggable: real attendance.
// ---------------------------------------------------------------------------

import type { MesocycleWeek, UserProfile, WorkoutDay } from './types'
import { getActiveMesocycleWeek } from './calculations'
import { getBlockDateRange } from './block-review'
import { saveMesocycleWeek } from './mesocycle-persistence'
import { supabase } from './supabase'

/** "Missed roughly a third or more" — attended two-thirds or fewer of a block's real scheduled sessions triggers the hold. Ashley's own number, not a recommendation. */
const ATTENDANCE_TRIGGER_RATIO = 2 / 3

const CONSISTENCY_NOTE = "Keeping your volume steady this block, so it's easier to stay consistent."
const CONSISTENCY_DASHBOARD_MESSAGE = "Your volume's holding steady this block — same as last time, so it's easier to stay consistent."

/** Pure — a block with nothing scheduled has nothing to judge attendance against. */
export function didBlockMissAttendance(scheduledCount: number, loggedCount: number): boolean {
  if (scheduledCount <= 0) return false
  return loggedCount / scheduledCount < ATTENDANCE_TRIGGER_RATIO
}

/** A day is "scheduled" the same way dashboard-data.ts already treats it: real training days per this block's own plan, not a separate profile field. */
function getScheduledWeekdays(week: MesocycleWeek): Set<string> {
  return new Set(week.days.filter(d => d.exercises.length > 0).map(d => d.day))
}

/** How many real calendar dates in [start, end) fall on one of `scheduledWeekdays` — pure, UTC, matching getBlockDateRange's own date convention. */
export function countScheduledDays(start: string, end: string, scheduledWeekdays: Set<string>): number {
  let count = 0
  const cursor = new Date(`${start}T00:00:00.000Z`)
  const endDate = new Date(`${end}T00:00:00.000Z`)
  while (cursor < endDate) {
    const weekdayName = cursor.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
    if (scheduledWeekdays.has(weekdayName)) count++
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return count
}

/** A real workout_sessions row per date is "attended" — same query shape as daily-tracking.ts's getWeeklyDashboard, just profile+date-range scoped rather than pulled alongside metrics/nutrition. */
async function countLoggedSessions(profileId: string, start: string, end: string): Promise<number> {
  const { data, error } = await supabase
    .from('workout_sessions')
    .select('id')
    .eq('profile_id', profileId)
    .gte('date', start)
    .lt('date', end)
  if (error || !data) return 0
  return data.length
}

/**
 * Holds every exercise's sets at the PREVIOUS block's own number for that
 * exact day-and-slot position — never by exercise name, since a slot's
 * specific movement often rotates between blocks by design (VISION.md:
 * "movement patterns stay consistent while variations rotate"); matching by
 * name would silently miss most rotated slots. Only ever caps an increase
 * back down — a slot that would already be the same or lower is untouched,
 * and a day or slot with no counterpart in the previous block (a schedule
 * change, an unplanned add) is left alone rather than guessed at.
 */
export function holdVolumeAtPrevious(newDays: WorkoutDay[], previousDays: WorkoutDay[]): WorkoutDay[] {
  const previousByDay = new Map(previousDays.map(d => [d.day, d]))
  return newDays.map(day => {
    const prevDay = previousByDay.get(day.day)
    if (!prevDay) return day
    const exercises = day.exercises.map((ex, i) => {
      const prevEx = prevDay.exercises[i]
      if (!prevEx || ex.sets <= prevEx.sets) return ex
      return { ...ex, sets: prevEx.sets }
    })
    return { ...day, exercises }
  })
}

export interface ConsistencyHoldResult {
  mesocycle?: MesocycleWeek[]
  messages: string[]
}

/**
 * Check-on-load sweep — same convention, same block-boundary timing
 * (week_in_block === 1 of a block after the first) as block-review.ts's
 * checkForBlockReview, run as its sibling in App.tsx. Idempotent by
 * checking whether the new block's own week 1 coach_note already carries
 * CONSISTENCY_NOTE — no new persisted field needed (unlike Step 4's
 * block_hold_note): coach_note is otherwise fully deterministic per week at
 * generation time, so its presence alone means this exact check already ran
 * for this block boundary.
 */
export async function checkForConsistencyHold(
  profileId: string,
  mesocycle: MesocycleWeek[],
  _profile: UserProfile,
  planCreatedAt: string,
  now: Date,
): Promise<ConsistencyHoldResult> {
  if (mesocycle.length === 0) return { messages: [] }

  const totalWeeks = mesocycle.length
  const liveWeek = getActiveMesocycleWeek(planCreatedAt, now, totalWeeks)
  const currentWeek = mesocycle.find(w => w.week_number === liveWeek)
  if (!currentWeek || currentWeek.block_number == null || currentWeek.block_number <= 1 || currentWeek.week_in_block !== 1) {
    return { messages: [] }
  }
  if (currentWeek.coach_note?.includes(CONSISTENCY_NOTE)) return { messages: [] }

  const previousBlockNumber = currentWeek.block_number - 1
  const previousBlockWeeks = mesocycle.filter(w => w.block_number === previousBlockNumber)
  const previousWeek1 = previousBlockWeeks.find(w => w.week_in_block === 1)
  if (!previousWeek1) return { messages: [] }

  const { start, end } = getBlockDateRange(planCreatedAt, previousBlockNumber)
  const scheduledWeekdays = getScheduledWeekdays(previousWeek1)
  const scheduledCount = countScheduledDays(start, end, scheduledWeekdays)
  const loggedCount = await countLoggedSessions(profileId, start, end)

  if (!didBlockMissAttendance(scheduledCount, loggedCount)) return { messages: [] }

  const newBlockWeeks = mesocycle.filter(w => w.block_number === currentWeek.block_number)
  const previousByWeekInBlock = new Map(previousBlockWeeks.map(w => [w.week_in_block, w]))

  const patchedWeeks = newBlockWeeks.map(week => {
    const prevWeek = week.week_in_block != null ? previousByWeekInBlock.get(week.week_in_block) : undefined
    const days = prevWeek ? holdVolumeAtPrevious(week.days, prevWeek.days) : week.days
    const coach_note = week.coach_note ? `${week.coach_note} ${CONSISTENCY_NOTE}` : CONSISTENCY_NOTE
    return { ...week, days, coach_note }
  })

  const patchedByWeekNumber = new Map(patchedWeeks.map(w => [w.week_number, w]))
  const workingMesocycle = mesocycle.map(w => patchedByWeekNumber.get(w.week_number) ?? w)

  await Promise.all(patchedWeeks.map(w => saveMesocycleWeek(profileId, w)))

  return { mesocycle: workingMesocycle, messages: [CONSISTENCY_DASHBOARD_MESSAGE] }
}

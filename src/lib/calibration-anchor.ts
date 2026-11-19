// ---------------------------------------------------------------------------
// CALIBRATION WEEK'S ANSWER, WRITTEN INTO THE PLAN.
//
// Ashley, 10 Sep 2026, after training on a calibration week that was too
// light: "if the prescribed weights are too light this week, next week it may
// ramp up a bit but it still won't be enough, and will take a long time to
// get to my actual working weights."
//
// Next week's SESSION was already right — TodayPanel re-anchors to the
// heaviest logged set (test:logged-reanchor). What was wrong was the printed
// program: "See the whole program" kept the formula's numbers until the
// accelerator had three sessions to judge and then OFFERED a re-anchor. So a
// person who did everything right saw next week at ~75kg on one screen and
// 100kg on another, and drew the conclusion above.
//
// HER RULING, 10 Sep 2026: from a calibration week, apply the anchor
// AUTOMATICALLY, once. Every week after keeps the 1 Sep rule — the
// accelerator offers, never applies — because there the worry is rewarding
// chased reps. Calibration week is different in kind: the printed number was
// an admitted guess (the cue says "your heaviest set becomes next week's
// weight"), and the heavier number came from her own fingers answering
// exactly the question the app asked.
//
// Pure core + thin shell. `calibrationAnchorsFor` decides WHAT to re-anchor
// from a week, a day and the day's logged sets, with no I/O, so a gate can
// run it. `applyCalibrationAnchors` is the shell that reads the logs, calls
// the shared patch helper, and saves.
// ---------------------------------------------------------------------------
import type { MesocycleWeek, UserProfile, WorkoutDay, ExerciseSetLog } from './types'
import { getActiveMesocycleWeek } from './calculations'
import { getExerciseEntry, getExerciseId } from './exercise-db'
import { isExternallyLoaded, statedCeilingKg, getLoadIncrementKg, categorize } from './load-prescription'
import { outgrownWeightKg } from './outgrown'
import { getSetsForDate, getSetsForDates } from './set-log-store'
import { saveMesocycleWeek } from './mesocycle-persistence'
import { patchBlockFromLiftedKg, type LiftedAnchor } from './beat-target-offer'
import { sessionForDate, addDays, type SessionMove } from './session-move'
import { getSessionMovesInRange } from './daily-tracking'
import { getLocalDateString } from './dev-clock'

export interface CalibrationAnchor {
  exIndex: number
  exerciseName: string
  plannedKg: number
  liftedKg: number
  /** Set when the weight was worked out from far more reps than asked (outgrown.ts): the heaviest set actually lifted. */
  fromRepsAtKg?: number
  /**
   * What next week's row for this lift reads AFTER the re-anchor, taken from
   * the patched plan itself — the number and the printed string ("~24kg per
   * hand"). Set by planCalibrationAnchors; absent on an anchor that has only
   * been detected, not yet applied.
   *
   * It exists because the sentence used to be built from `liftedKg`, and the
   * plan from a clamped copy of it (test log H18, 9 Oct 2026: "Week 2 now
   * starts Romanian Deadlifts from your 30kg set" over a week 2 that read
   * 24kg per hand, the heaviest dumbbells he had said he owns). A receipt is
   * read off what was written, or it is a second opinion.
   */
  nextWeek?: {
    kg: number
    label: string
    /** True when next week's own number changed — the only thing the sentence may claim. */
    moved: boolean
    /** True when it stopped short of the lifted weight because of a limit the person told us. */
    atStatedLimit: boolean
  }
}

/**
 * Which lifts on this day earned a re-anchor: externally loaded, prescribed
 * a number, and lifted for a working set HEAVIER than that number. Equal or
 * lighter changes nothing — a calibration set at the guess, or under it, is
 * not evidence the guess was low. Warm-ups and bodyweight rows never count.
 */
export function calibrationAnchorsFor(
  week: MesocycleWeek | undefined,
  day: WorkoutDay | undefined,
  sets: ExerciseSetLog[],
): CalibrationAnchor[] {
  if (!week?.isCalibrationWeek || !day) return []
  const working = sets.filter(s => !s.is_warmup && !s.is_bodyweight && Number(s.weight_kg) > 0)
  const out: CalibrationAnchor[] = []
  day.exercises.forEach((ex, exIndex) => {
    if (ex.suggested_load_kg == null) return
    const entry = getExerciseEntry(ex.name)
    if (!entry || !isExternallyLoaded(entry)) return
    const id = getExerciseId(ex.name)
    const mine = working.filter(s => (s.exercise_id ?? getExerciseId(s.exercise_name)) === id)
    const lifted = mine.reduce((m, s) => Math.max(m, Number(s.weight_kg)), 0)
    // THE SAME WEIGHT FOR FAR MORE REPS THAN ASKED IS A HEAVIER WEIGHT (18 Nov 2026, outgrown.ts): 40 kg x 20 against
    // 8-12 used to anchor nothing, because only a heavier number counted. Read from the sets at the heaviest weight.
    const range = (ex.reps ?? '').match(/\d+/g)?.map(Number) ?? []
    const atTop = mine.filter(s => Number(s.weight_kg) === lifted).map(s => s.reps_completed)
    const outgrown = range.length >= 2 && lifted > 0
      ? outgrownWeightKg(lifted, atTop, Math.min(...range), Math.max(...range), getLoadIncrementKg(entry, categorize(entry), lifted))
      : null
    const heaviest = Math.max(lifted, outgrown ?? 0)
    // EVIDENCE IS USED ONCE (18 Nov 2026): a weight this slot was already anchored from does not anchor again.
    if (heaviest > Math.max(ex.suggested_load_kg, ex.calibration_anchored_kg ?? 0)) {
      out.push({ exIndex, exerciseName: ex.name, plannedKg: ex.suggested_load_kg, liftedKg: heaviest, ...(heaviest > lifted ? { fromRepsAtKg: lifted } : {}) })
    }
  })
  return out
}

/**
 * The sentence the app says about it, in the coach's voice rather than a
 * receipt — or null when there is nothing true to say.
 *
 * IT SAYS WHAT NEXT WEEK NOW READS. For a lift written at the weight that was
 * lifted that is the old sentence unchanged ("from your 30kg set"). Where the
 * plan stopped short of it, the number quoted is the one on the plan, and when
 * the reason is a limit the person gave us, it says so. A lift whose next week
 * did not move is not mentioned at all, and if none moved there is no
 * sentence: "now starts" over an unchanged number is a claim, not a receipt.
 */
export function calibrationAnchorMessage(nextWeekNumber: number, applied: CalibrationAnchor[]): string | null {
  // An anchor with no `nextWeek` was applied by an older caller that did not
  // read the plan back; it keeps the original wording rather than vanishing.
  const told = applied.filter(a => a.nextWeek == null || a.nextWeek.moved)
  if (told.length === 0) return null
  const parts = told.map(a => {
    const n = a.nextWeek
    // Worked out from reps: the sentence names what he lifted, never a set he did not do.
    if (a.fromRepsAtKg != null && (!n || n.kg >= a.liftedKg)) return `${a.exerciseName} at ${a.liftedKg}kg, from your easy sets at ${a.fromRepsAtKg}kg`
    if (!n || n.kg >= a.liftedKg) return `${a.exerciseName} from your ${a.liftedKg}kg set`
    const label = n.label.replace(/^~/, '')
    return n.atStatedLimit
      ? `${a.exerciseName} at ${label}, the heaviest you've told me you have`
      : `${a.exerciseName} at ${label}`
  })
  const list = parts.length <= 2
    ? parts.join(' and ')
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
  return `Week ${nextWeekNumber} now starts ${list} — not the ${told.length === 1 ? 'guess' : 'guesses'} it was printed with.`
}

export interface CalibrationAnchorPlan {
  next: MesocycleWeek[]
  applied: CalibrationAnchor[]
  /** The weeks whose stored rows changed — the shell saves exactly these and nothing else. */
  changedWeeks: MesocycleWeek[]
  nextWeekNumber: number | null
}

const NOTHING = (mesocycle: MesocycleWeek[]): CalibrationAnchorPlan =>
  ({ next: mesocycle, applied: [], changedWeeks: [], nextWeekNumber: null })

/**
 * The whole decision, with no I/O: given the plan, the week the session fell
 * in, the day and its logged sets, which weeks change and to what. Only weeks
 * AFTER the calibration week in the same block are rewritten — the week she
 * just trained stays as the record of what was printed. Never downward: the
 * shared patch helper leaves any week already at or above the lifted number
 * alone.
 */
export function planCalibrationAnchors(
  mesocycle: MesocycleWeek[],
  profile: UserProfile,
  weekNumber: number,
  dayName: string,
  sets: ExerciseSetLog[],
): CalibrationAnchorPlan {
  const week = mesocycle.find(w => w.week_number === weekNumber)
  const day = week?.days.find(d => d.day === dayName)
  const anchors = calibrationAnchorsFor(week, day, sets)
  if (!week || anchors.length === 0) return NOTHING(mesocycle)

  const blockNumber = week.block_number ?? 1
  const fromWeekInBlock = (week.week_in_block ?? 1) + 1
  // STAMP THE EVIDENCE on the testing week's own slots, whether or not a later week then moves: the same sets must
  // not write the plan again on a later read (see `calibration_anchored_kg`). The slot's printed number is untouched.
  let next = mesocycle.map(w => w.week_number !== weekNumber ? w : {
    ...w,
    days: w.days.map(d => d.day !== dayName ? d : {
      ...d,
      exercises: d.exercises.map((e, i) => {
        const a = anchors.find(x => x.exIndex === i)
        return a ? { ...e, calibration_anchored_kg: a.liftedKg } : e
      }),
    }),
  })
  const stamped = next
  const applied: CalibrationAnchor[] = []
  for (const a of anchors) {
    const anchor: LiftedAnchor = { blockNumber, dayName, exIndex: a.exIndex, exerciseName: a.exerciseName, liftedKg: a.liftedKg, fromWeekInBlock }
    const r = patchBlockFromLiftedKg(next, profile, anchor)
    if (!r.patched) continue
    // READ THE RECEIPT OFF THE PLAN. Next week's row, before and after.
    const slotIn = (plan: MesocycleWeek[]) => plan
      .find(w => w.week_number === weekNumber + 1)?.days.find(d => d.day === dayName)?.exercises[a.exIndex]
    const before = slotIn(next)
    const after = slotIn(r.next)
    next = r.next
    const entry = getExerciseEntry(a.exerciseName)
    const stated = entry ? statedCeilingKg(entry, profile) : null
    applied.push(after?.suggested_load_kg == null ? a : {
      ...a,
      nextWeek: {
        kg: after.suggested_load_kg,
        label: after.suggested_load ?? `${after.suggested_load_kg}kg`,
        moved: after.suggested_load_kg !== before?.suggested_load_kg,
        atStatedLimit: stated != null && after.suggested_load_kg < a.liftedKg && after.suggested_load_kg >= stated,
      },
    })
  }
  // Untouched weeks keep their identity through the patch helper's map, so
  // "what changed" is exactly the weeks that are no longer the same object.
  // With nothing applied that is the testing week alone, carrying its stamp.
  const changedWeeks = next.filter((w, i) => w !== mesocycle[i])
  if (applied.length === 0) return { next: stamped, applied: [], changedWeeks, nextWeekNumber: null }
  return { next, applied, changedWeeks, nextWeekNumber: weekNumber + 1 }
}

/** One testing-week date: the session run on it (moves taken into account) and the sets logged on it. */
export interface CalibrationDay { date: string; dayName: string; sets: ExerciseSetLog[] }

/**
 * EVERY WAY A TESTING-WEEK SESSION CAN BE LOGGED REACHES THE PLAN (18 Nov 2026, docs/plans/weights-leftovers-2026-11-18.md §4).
 *
 * Until now only the Finish button anchored. A session closed by the six-hour window, logged through "I did it, not
 * in the app", logged by the coach, or added to after Finish left the printed plan on the estimate while today's card
 * read the logs: the two screens his 10 Sep ruling exists to keep agreeing. This folds the SAME decision over each
 * testing-week date that has passed, so there is still one rule. Pure: the shell below reads the dates and the sets.
 */
export function planCalibrationSweep(
  mesocycle: MesocycleWeek[],
  profile: UserProfile,
  weekNumber: number,
  days: CalibrationDay[],
): CalibrationAnchorPlan {
  let next = mesocycle
  const applied: CalibrationAnchor[] = []
  for (const d of days) {
    const r = planCalibrationAnchors(next, profile, weekNumber, d.dayName, d.sets)
    next = r.next
    applied.push(...r.applied)
  }
  const changedWeeks = next.filter((w, i) => w !== mesocycle[i])
  return { next, applied, changedWeeks, nextWeekNumber: applied.length > 0 ? weekNumber + 1 : null }
}

/**
 * Which dates the sweep reads: the testing week's own dates that are BEFORE today. Today is the Finish button's (a
 * testing session works up to its heaviest set, and anchoring from a set half-way up would announce the wrong
 * number twice). Empty once the plan has left the testing week's block: every week it could write is behind him.
 */
export function calibrationSweepDates(
  mesocycle: MesocycleWeek[],
  planCreatedAt: string | undefined,
  today: string,
): { weekNumber: number; dates: string[] } | null {
  const week = mesocycle.find(w => w.isCalibrationWeek)
  if (!week || !planCreatedAt) return null
  const total = mesocycle.length || 4
  const weekOf = (date: string) => getActiveMesocycleWeek(planCreatedAt, new Date(`${date}T12:00:00`), total)
  const nowWeek = mesocycle.find(w => w.week_number === weekOf(today))
  if (!nowWeek || (nowWeek.block_number ?? 1) !== (week.block_number ?? 1)) return null
  const start = getLocalDateString(new Date(planCreatedAt))
  const dates: string[] = []
  // Two weeks from the plan's first day covers the testing week wherever the week boundary falls.
  for (let i = 0; i < 14; i++) {
    const date = addDays(start, i)
    if (date >= today) break
    if (weekOf(date) === week.week_number) dates.push(date)
  }
  return dates.length > 0 ? { weekNumber: week.week_number, dates } : null
}

/**
 * The shell: reads moves and sets for the dates above, then decides against the plan AS IT IS NOW (`current()`, asked
 * after the reads, so an edit made while they were in flight is not written over). Saves exactly the changed weeks.
 */
export async function sweepCalibrationWeek(params: {
  profileId: string
  profile: UserProfile
  current: () => MesocycleWeek[]
  planCreatedAt: string | undefined
  today: string
  adopt: (next: MesocycleWeek[]) => void
}): Promise<CalibrationAnchorPlan> {
  const { profileId, profile, current, planCreatedAt, today, adopt } = params
  const scope = calibrationSweepDates(current(), planCreatedAt, today)
  if (!scope) return NOTHING(current())
  const { weekNumber, dates } = scope
  const [moves, setsByDate] = await Promise.all([
    getSessionMovesInRange(profileId, dates[0], dates[dates.length - 1]).catch(() => [] as SessionMove[]),
    getSetsForDates(profileId, dates),
  ])
  const mesocycle = current()
  const week = mesocycle.find(w => w.week_number === weekNumber)
  if (!week?.isCalibrationWeek) return NOTHING(mesocycle)
  const days: CalibrationDay[] = []
  dates.forEach(date => {
    const session = sessionForDate({ date, plan: week.days, moves }).day
    const sets = setsByDate.get(date) ?? []
    if (session && sets.length > 0) days.push({ date, dayName: session.day, sets })
  })
  const plan = planCalibrationSweep(mesocycle, profile, weekNumber, days)
  if (plan.changedWeeks.length === 0) return plan
  adopt(plan.next)
  await Promise.all(plan.changedWeeks.map(w => saveMesocycleWeek(profileId, w)))
  return plan
}

export async function applyCalibrationAnchors(params: {
  profileId: string
  profile: UserProfile
  mesocycle: MesocycleWeek[]
  planCreatedAt: string | undefined
  sessionDate: string
  dayName: string
}): Promise<CalibrationAnchorPlan> {
  const { profileId, profile, mesocycle, planCreatedAt, sessionDate, dayName } = params
  const weekNumber = getActiveMesocycleWeek(planCreatedAt, new Date(`${sessionDate}T12:00:00`), mesocycle.length || 4)
  const sets = await getSetsForDate(profileId, sessionDate)
  const plan = planCalibrationAnchors(mesocycle, profile, weekNumber, dayName, sets)
  await Promise.all(plan.changedWeeks.map(w => saveMesocycleWeek(profileId, w)))
  return plan
}

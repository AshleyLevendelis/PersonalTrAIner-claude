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
import { isExternallyLoaded, statedCeilingKg } from './load-prescription'
import { getSetsForDate } from './set-log-store'
import { saveMesocycleWeek } from './mesocycle-persistence'
import { patchBlockFromLiftedKg, type LiftedAnchor } from './beat-target-offer'

export interface CalibrationAnchor {
  exIndex: number
  exerciseName: string
  plannedKg: number
  liftedKg: number
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
    const heaviest = working
      .filter(s => (s.exercise_id ?? getExerciseId(s.exercise_name)) === id)
      .reduce((m, s) => Math.max(m, Number(s.weight_kg)), 0)
    if (heaviest > ex.suggested_load_kg) {
      out.push({ exIndex, exerciseName: ex.name, plannedKg: ex.suggested_load_kg, liftedKg: heaviest })
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
  let next = mesocycle
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
  if (applied.length === 0) return NOTHING(mesocycle)
  // Untouched weeks keep their identity through the patch helper's map, so
  // "what changed" is exactly the weeks that are no longer the same object.
  const changedWeeks = next.filter((w, i) => w !== mesocycle[i])
  return { next, applied, changedWeeks, nextWeekNumber: weekNumber + 1 }
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

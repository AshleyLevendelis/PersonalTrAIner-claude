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
import { isExternallyLoaded } from './load-prescription'
import { getSetsForDate } from './set-log-store'
import { saveMesocycleWeek } from './mesocycle-persistence'
import { patchBlockFromLiftedKg, type LiftedAnchor } from './beat-target-offer'

export interface CalibrationAnchor {
  exIndex: number
  exerciseName: string
  plannedKg: number
  liftedKg: number
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

/** The sentence the app says about it, in the coach's voice rather than a receipt. */
export function calibrationAnchorMessage(nextWeekNumber: number, applied: CalibrationAnchor[]): string {
  const parts = applied.map(a => `${a.exerciseName} from your ${a.liftedKg}kg set`)
  const list = parts.length <= 2
    ? parts.join(' and ')
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
  return `Week ${nextWeekNumber} now starts ${list} — not the ${applied.length === 1 ? 'guess' : 'guesses'} it was printed with.`
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
    if (r.patched) { next = r.next; applied.push(a) }
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

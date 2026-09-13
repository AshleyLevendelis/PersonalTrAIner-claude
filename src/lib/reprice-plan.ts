// ---------------------------------------------------------------------------
// RE-PRICING A PLAN THAT IS ALREADY RUNNING — same exercises, new weights.
//
// ASHLEY'S RULING, 13 Sep 2026. Asked what should happen when you correct one
// of the numbers you gave at setup — your gym's heaviest dumbbell is 40kg not
// 30kg, you can bench 80kg not 60kg — from three options (apply now / wait for
// the next block / ask each time), she chose: **update this plan's weights
// now, from this week onward, exercises unchanged, and say what moved.** A
// wrong number is wrong today.
//
// WHY THIS FILE HAD TO EXIST. The only whole-plan reaction to a changed
// profile fact was `rebuildAgainstProfile` (plan-adaptations.ts), which re-runs
// `generateExercisePlan` and therefore CAN CHANGE WHICH EXERCISES ARE IN THE
// PLAN — weight-basis-offer.ts:122-126 says so in as many words, and matches
// exercises by NAME rather than slot index precisely because a rebuild
// reorders them. Her ruling says the exercises stay. Every load-only patcher
// that existed was one slot, one block (patchBlockFromLiftedKg,
// applyCalibrationAnchors, confirmLoadSuggestion). So the plan-wide load-only
// recompute is the piece that was missing, and this is it.
//
// **IT MAY GO DOWNWARD, AND THAT IS THE DIFFERENCE FROM EVERY EXISTING
// PATCHER.** `patchBlockFromLiftedKg` is NEVER DOWNWARD on purpose — it is fed
// by a logged lift, and pulling a later week down would make it a brake, which
// is block-review's job and needs block-review's evidence bar. This one is fed
// by a CORRECTED FACT, and the whole point of lowering a stated ceiling is
// that the weights come down: a trainee whose dumbbells stop at 20kg must stop
// being prescribed 30. Two rules, two functions, neither reused as the other.
//
// ONE DOOR TO A WEIGHT. Loads are written through `prescribeLoad` and the four
// fields are set together, exactly as patchBlockFromLiftedKg does. Setting
// `suggested_load_kg` by hand is the bug that file's header was written about;
// there must not be a second way to write a weight.
//
// IT APPLIES THE DIFFERENCE THE FACT MAKES — IT DOES NOT RE-PRESCRIBE FROM
// SCRATCH, AND THE FIRST VERSION OF THIS FILE DID. Driven on a real 16-week
// plan, re-prescribing every slot against the corrected profile moved 174
// weights when the correction was LOWERING a dumbbell ceiling — including a
// barbell bench press UP from 37.5kg to 57.5kg and a trap bar deadlift up to
// 122.5kg, neither of which a dumbbell has anything to do with. The invariant
// that caught it: re-pricing against the UNCHANGED profile moved the same 174
// weights. A bare `prescribeLoad` call cannot reproduce a stored weight,
// because the stored one carries the block's progression, its periodization
// and its calibration conservatism, and this file knows none of that.
//
// So it prices the SAME slot twice — once against the profile as it stands,
// once against the corrected one — and moves the stored weight by the ratio
// between them. A fact that does not bear on a lift gives the same number
// twice, a ratio of 1, and nothing moves: **idempotent by construction**,
// rather than by a rule someone has to remember. The final number still goes
// through `prescribeLoad` (via `forceStartingWeightKg`) so rounding, units,
// the per-set breakdown and the ceiling clamp are all the real ones.
//
// PAST WEEKS ARE HISTORY. The caller passes the live week onward. That rule is
// already written down in weight-basis-offer.ts:107 ("A past week is
// history") and this file does not get its own opinion about it.
// ---------------------------------------------------------------------------
import { prescribeLoad } from './load-prescription'
import { getExerciseEntry } from './exercise-db'
import type { MesocycleWeek, UserProfile, Exercise } from './types'

/** One weight that moved, in the terms the screen needs to say it. */
export interface RepricedLoad {
  weekNumber: number
  dayName: string
  exerciseName: string
  fromKg: number | null
  toKg: number | null
}

export interface RepriceResult {
  mesocycle: MesocycleWeek[]
  /** Every weight that actually moved, in plan order. Empty means nothing changed. */
  changes: RepricedLoad[]
}

/**
 * The single largest move IN THE EARLIEST WEEK TOUCHED, for a one-line receipt.
 *
 * Largest by ABSOLUTE change, so a correction that brings weights DOWN is
 * reported as readily as one that raises them — the down case is the one that
 * matters most, because it is the one where the person could not lift what the
 * app was asking for.
 *
 * RESTRICTED TO THE EARLIEST WEEK, and that is not a detail. Read off a real
 * 16-week plan: the largest move anywhere was a week-9 leg curl going 40kg to
 * 10kg, so the receipt read "from this week: Dumbbell Leg Curl goes down from
 * 40kg to 10kg" while this week's leg curl said 22kg. The sentence names the
 * week it opens with; the number has to come from that week or it is quoting
 * a weight she cannot see.
 */
export function headlineReprice(changes: RepricedLoad[]): RepricedLoad | null {
  if (changes.length === 0) return null
  const earliest = Math.min(...changes.map(c => c.weekNumber))
  let best: RepricedLoad | null = null
  let bestDelta = -1
  for (const c of changes) {
    if (c.weekNumber !== earliest || c.fromKg == null || c.toKg == null) continue
    const delta = Math.abs(c.toKg - c.fromKg)
    if (delta > bestDelta) { best = c; bestDelta = delta }
  }
  return best
}

/**
 * What to tell the person, in plain words. Null when nothing moved.
 *
 * Deliberately names ONE lift and its two numbers rather than summarising:
 * "your weights changed" is not something anyone can check, and the receipt
 * exists so she can see the correction landed.
 *
 * IT NAMES THE WEEK THE CHANGE STARTS — ASHLEY'S RULING, 13 Sep 2026, from
 * three options (name the week / lead with "nothing changes this week" / leave
 * it). She chose naming the week because one sentence then works whether the
 * change starts today or in two months.
 *
 * WHAT WAS WRONG WITH THE SENTENCE IT REPLACES, measured rather than guessed:
 * it opened "I've redone your weights from this week" and then quoted the
 * headline lift, which comes from the earliest week TOUCHED — not the earliest
 * week re-priced. Raising a dumbbell ceiling from 30kg to 40kg on a real
 * 16-week plan touches weeks 7, 9, 10 and 15 ONLY, because the lighter weeks
 * were never near the old ceiling. So the receipt said "this week" and named a
 * weight that is not on this week's screen. That is the same defect
 * `headlineReprice` below was written to fix, one step narrower — the fix
 * restricted the headline to the earliest week touched, and then the sentence
 * went on asserting that week was this one.
 *
 * THE NAME IS NEVER THE SUBJECT OF A VERB, and that is not fussiness. The
 * first version read "<name> goes down from 14kg to 4kg", which is fine for
 * "Goblet Squat" and wrong for most of the catalogue — read off a real plan
 * it printed "Romanian Deadlifts goes down from 14kg to 4kg". Plural names
 * are the norm here (Push-Ups, Lateral Raises, Face Pulls), so a singular
 * verb would be wrong more often than right. Naming the lift and then stating
 * the move reads correctly whichever it is.
 */
export function describeReprice(changes: RepricedLoad[]): string | null {
  const headline = headlineReprice(changes)
  if (!headline || headline.fromKg == null || headline.toKg == null) return null
  const direction = headline.toKg > headline.fromKg ? 'up' : 'down'
  const others = changes.length - 1
  const tail = others > 0
    ? ` ${others} other ${others === 1 ? 'weight' : 'weights'} moved with it.`
    : ''
  return `I've redone your weights. From week ${headline.weekNumber}, `
    + `${headline.exerciseName}: ${direction} from ${headline.fromKg}kg to ${headline.toKg}kg.${tail}`
}

/**
 * The weeks a re-price may touch: the live week onward. Never the past.
 *
 * The same shape and the same rule as `rebuildableWeekNumbers`
 * (weight-basis-offer.ts:107); kept here rather than imported so this module
 * has no dependency on the offer machinery, which it is not part of.
 */
export function repriceableWeekNumbers(mesocycle: MesocycleWeek[], liveWeek: number): number[] {
  return mesocycle.filter(w => w.week_number >= liveWeek).map(w => w.week_number)
}

/**
 * Re-prescribe every loaded slot in the given weeks against a corrected
 * profile, changing nothing else.
 *
 * PURE. Returns the new plan and what moved; saving is the caller's, so a gate
 * can run this against a generated plan with no database — the same split
 * `patchBlockFromLiftedKg` keeps.
 *
 * What it deliberately does NOT touch: which exercises are in the plan, their
 * order, their sets, reps, rest, tempo or supersets. A slot whose exercise is
 * not in the catalogue, or which carries no weight (bodyweight work), is left
 * exactly as it is rather than being guessed at.
 */
export function repriceForCorrectedProfile(
  mesocycle: MesocycleWeek[],
  /** The profile as it stands, BEFORE the correction — the other half of the ratio. */
  current: UserProfile,
  corrected: UserProfile,
  weekNumbers: number[],
): RepriceResult {
  const targets = new Set(weekNumbers)
  const changes: RepricedLoad[] = []

  const next = mesocycle.map(week => {
    if (!targets.has(week.week_number)) return week
    let weekTouched = false

    const days = week.days.map(day => {
      let dayTouched = false
      const exercises = day.exercises.map(ex => {
        const entry = getExerciseEntry(ex.name)
        if (!entry) return ex
        // NOT A LOADED SLOT — bodyweight work, a carry with no kilos, a primer
        // forced to "Light". Re-pricing one would be inventing a number for a
        // movement the plan deliberately prescribes without one.
        if (ex.suggested_load_kg == null) return ex

        const opts = {
          targetRpeLabel: ex.intensity || '',
          isFirstBlock: (week.block_number ?? 1) === 1,
          sets: ex.sets,
          repRangeLabel: ex.reps,
          phase: week.phase_label,
        }
        // THE SAME SLOT, PRICED TWICE. Only the ratio between them is the
        // fact's doing; everything else about the stored weight is the plan's
        // and must survive.
        const before = prescribeLoad(entry, current, opts)
        const after = prescribeLoad(entry, corrected, opts)
        if (before.starting_weight_kg == null || after.starting_weight_kg == null) return ex
        if (after.starting_weight_kg === before.starting_weight_kg) return ex

        const ratio = after.starting_weight_kg / before.starting_weight_kg
        const load = prescribeLoad(entry, corrected, {
          ...opts,
          forceStartingWeightKg: ex.suggested_load_kg * ratio,
        })
        if (load.starting_weight_kg === ex.suggested_load_kg) return ex

        changes.push({
          weekNumber: week.week_number,
          dayName: day.day,
          exerciseName: ex.name,
          fromKg: ex.suggested_load_kg,
          toKg: load.starting_weight_kg,
        })
        dayTouched = true
        weekTouched = true
        // THE FOUR FIELDS TOGETHER, from one prescribeLoad result. Writing
        // suggested_load_kg alone would leave the printed string, the per-set
        // breakdown and the basis sentence describing the OLD weight — three
        // places on screen disagreeing with the number beside them.
        const repriced: Exercise = {
          ...ex,
          suggested_load: load.display,
          suggested_load_kg: load.starting_weight_kg,
          per_set_load: load.per_set,
          load_guidance: load.basis,
        }
        return repriced
      })
      return dayTouched ? { ...day, exercises } : day
    })

    return weekTouched ? { ...week, days } : week
  })

  return { mesocycle: changes.length > 0 ? next : mesocycle, changes }
}

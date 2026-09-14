import { supabase } from './supabase'
import { getExerciseEntry, getExerciseId } from './exercise-db'
import { categorize, getLoadIncrementKg, isExternallyLoaded, getLoadingCeilingKg, loadingMode, roundToPlate, labelModeForEntry, formatLoad, effectiveLoadingCeilingKg } from './load-prescription'
import { getLastSessionSets, getSetsForDate, isMalformedZeroWeight } from './set-log-store'
import type { ExerciseTier, ExerciseSetLog, Exercise, UserProfile } from './types'

// ---------------------------------------------------------------------------
// All progression reads run against the unified store (exercise_set_logs via
// set-log-store's merged reads — C0 Part 4), keyed by exercise_id, working
// sets only. The documented §3 contract is preserved exactly: recency by
// completed_at, strictly-before-sessionDate scoping, the every-set-hit-top-
// reps gate, equipment-aware increments. What changed vs the legacy set_logs
// reads: duplicates can no longer exist (unique key upstream), sets arrive
// ordered by set_number, and the progression base weight is the MAX working-
// set weight — not whichever row the database happened to return first
// (landmine L3: with ramped loading, "first row" could be a light early set).
// ---------------------------------------------------------------------------

export interface ProgressionResult {
  exerciseName: string
  currentWeight: number
  newWeight: number
  reason: string
  type: 'overload' | 'primer_complete'
}

const NON_PROGRESSABLE_TIERS: Set<string> = new Set([
  'tier_0_primer',
  'tier_4_finisher',
])

const NON_PROGRESSABLE_DB_TIERS: Set<string> = new Set([
  'primer',
  'cardio',
])

function isProgressable(exerciseName: string, tier?: ExerciseTier): boolean {
  if (tier && NON_PROGRESSABLE_TIERS.has(tier)) return false
  const entry = getExerciseEntry(exerciseName)
  if (entry && NON_PROGRESSABLE_DB_TIERS.has(entry.mechanics_tier)) return false
  if (entry && entry.equipment.length === 0) return false
  return true
}

function parseRepRange(reps: string): { low: number; high: number } {
  const rangeMatch = reps.match(/^(\d+)\s*-\s*(\d+)$/)
  if (rangeMatch) {
    return { low: parseInt(rangeMatch[1]), high: parseInt(rangeMatch[2]) }
  }
  const single = parseInt(reps)
  if (!isNaN(single)) return { low: single, high: single }
  return { low: 8, high: 12 }
}

function calculateIncrement(currentWeight: number): number {
  if (currentWeight <= 0) return 2.5
  const increment = currentWeight * 0.025
  return Math.max(1, Math.round(increment * 2) / 2)
}

/** The progression base: the heaviest working set of the session (kills L3 — never "whichever row came back first"). */
function maxWorkingWeight(sets: ExerciseSetLog[]): number {
  return sets.reduce((max, s) => Math.max(max, s.weight_kg), 0)
}

/**
 * Same-session progressive-overload check (the toast after a completed set).
 * Reads today's merged sets — including ones still pending sync — so it works
 * mid-session even if the network is behind.
 */
export async function checkDoubleProgression(
  userId: string,
  exerciseName: string,
  sessionDate: string,
  prescribedSets: number,
  prescribedReps: string,
  tier?: ExerciseTier
): Promise<ProgressionResult | null> {
  const exerciseId = getExerciseId(exerciseName)
  const todaySets = (await getSetsForDate(userId, sessionDate))
    .filter(s => (s.exercise_id ?? getExerciseId(s.exercise_name)) === exerciseId && !s.is_warmup)
    // A malformed 0kg/non-bodyweight row (chat-logged with no weight stated,
    // pre C0 fix #2) carries no real signal — must not count toward "did
    // every prescribed set land", nor toward the weight this progresses from.
    .filter(s => !isMalformedZeroWeight(s))
    .sort((a, b) => a.set_number - b.set_number)

  if (!isProgressable(exerciseName, tier)) {
    if (todaySets.length >= prescribedSets) {
      return {
        exerciseName,
        currentWeight: 0,
        newWeight: 0,
        reason: 'Primer / finisher completed — no load progression applicable.',
        type: 'primer_complete',
      }
    }
    return null
  }

  if (todaySets.length < prescribedSets) return null

  const relevantSets = todaySets.slice(0, prescribedSets)
  const { high: topReps } = parseRepRange(prescribedReps)

  const allAtTop = relevantSets.every(s => s.reps_completed >= topReps)
  const avgRpe = relevantSets.reduce((sum, s) => sum + (s.rpe ?? 7), 0) / relevantSets.length
  const rpeQualifies = avgRpe <= 8

  if (!allAtTop || !rpeQualifies) return null

  const currentWeight = maxWorkingWeight(relevantSets)
  const increment = calculateIncrement(currentWeight)
  const newWeight = currentWeight + increment

  return {
    exerciseName,
    currentWeight,
    newWeight,
    reason: `All ${prescribedSets} sets completed at ${topReps} reps with RPE ${avgRpe.toFixed(1)} — progressive overload triggered.`,
    type: 'overload',
  }
}

export interface DoubleProgressionRecommendation {
  weightKg: number
  /** True when every logged set from the last session hit the top of the rep range and the weight bumped up. */
  didProgress: boolean
  note: string
}

/**
 * TODAY'S CARD SHOWS THE NUMBER THE LOG EARNED — in all three places it is
 * written, not just in the label above it.
 *
 * Ashley, 14 Sep 2026, from a real session: "the main header prominently
 * displays 40kg, but the pre-filled numbers in the set input rows show 35kg,
 * making it confusing to know which weight to hit." Both numbers were the
 * app's: 40 was what generation printed weeks ago, 35 was her last session.
 * The card labelled the 40 "from your last session" and printed "Held at
 * 35kg" underneath it.
 *
 * The cause was narrow. getDoubleProgressionRecommendation's answer reached
 * the chip's SOURCE (so the label changed) and the note (so the sentence
 * changed) and never reached the figure. The added-load path five lines away
 * in TodayPanel already substituted, with a comment saying exactly why; the
 * ordinary-weight case was left out. See docs/plans/one-lift-one-number-today.md.
 *
 * WHY A COPY. The stored plan is not touched. Re-anchoring the printed FUTURE
 * weeks to logged numbers is deliberately an offer (beat-target-offer.ts).
 * This is today's card only, which is why the browse and peek surfaces — which
 * never receive a recommendation — keep showing plan figures and are right to.
 *
 * WHY ALL THREE FIELDS. rebuildLoadForExercise in exercise-plan.ts states the
 * rule this function exists to keep: `suggested_load_kg`, `suggested_load` and
 * `per_set_load` are three views of one number, every screen reads a different
 * one, so they move together or they contradict each other. The header reads
 * the first, the S-chips read the third, and the set-grid default reads the
 * third then the first.
 *
 * WHY THE RAMP IS SCALED, NOT FLATTENED. per_set_load is built from
 * getSetPercents, so a strength-phase main lift climbs to its top set.
 * rebuildLoadForExercise flattens — safely, because neither of its callers
 * ever meets a ramp — but flattening here would turn a ramped session into
 * five top sets, which is materially harder work than the plan prescribed.
 * Each set keeps its own share of the top and is re-rounded to something
 * loadable.
 *
 * WHY THE CEILING IS APPLIED HERE. getDoubleProgressionRecommendation returns
 * `lastWeight + increment` with no ceiling of its own, which was harmless
 * while the number only chose a label. The moment it is displayed, somebody
 * who hit their reps on the heaviest dumbbell they own would be shown a
 * weight they cannot load.
 */
export function withWorkingLoadKg<T extends Exercise>(ex: T, targetKg: number, profile?: UserProfile): T {
  const entry = getExerciseEntry(ex.name)
  // No catalogue entry means no loading mode, no plate step and no ceiling —
  // nothing to round or clamp against. Returning the exercise untouched keeps
  // the plan's own (self-consistent) figures rather than inventing rounding.
  if (!entry || ex.suggested_load_kg == null) return ex

  const mode = loadingMode(entry)
  const labelMode = labelModeForEntry(entry)
  // PROFILE OPTIONAL, AND THE FALLBACK IS THE POINT. TodayPanel's row props
  // declare it optional, so gating the whole substitution on it would have
  // reintroduced the two-number screen on exactly the path where nobody was
  // looking. Without a profile the app's own table still clamps; what is lost
  // is only the downward correction from a stated kit ceiling.
  const category = categorize(entry)
  const ceiling = profile
    ? effectiveLoadingCeilingKg(entry, category, profile)
    : getLoadingCeilingKg(entry, category)
  // NOT PLATE-ROUNDED, and this was measured rather than reasoned. Rounding a
  // logged 9kg dumbbell to the app's 2kg rack step printed 10kg in the header
  // above a note reading "Held at 9kg" and set rows prefilled at 9 — Ashley's
  // own bug again, one kilo apart, reproduced by verify:one-number on its
  // first run. roundToPlate exists to make a number the APP INVENTED
  // loadable; a weight that came off the bar is loadable by proof, and a
  // progressed one is that weight plus an implement-sized increment. The only
  // invented number here is the ceiling, so that is the only one rounded — and
  // downward, so a clamp can never raise what it was clamping.
  const clamped = Math.min(targetKg, ceiling)
  const top = clamped < targetKg ? Math.min(roundToPlate(clamped, mode), ceiling) : clamped

  const planTop = ex.suggested_load_kg
  const perSet = ex.per_set_load && ex.per_set_load.length > 0 && planTop > 0
    ? ex.per_set_load.map(s => {
        // The set's OWN share of the plan's top set, carried onto the new one.
        // A set at 100% stays at the top exactly, so the heaviest chip and the
        // header can never round apart.
        const kg = s.load_kg >= planTop ? top : roundToPlate((top * s.load_kg) / planTop, mode)
        return { ...s, load_kg: kg, display: formatLoad(kg, labelMode) }
      })
    : ex.per_set_load

  return { ...ex, suggested_load_kg: top, suggested_load: formatLoad(top, labelMode), per_set_load: perSet }
}

/**
 * True double progression from the trainee's actual last session, per the
 * rule this app shows next to every loaded exercise: hit the top of the rep
 * range on every set → the weight goes up by one loading-mode-sized
 * increment; anything short of that → hold the weight and chase reps first.
 * `sessionDate` scopes the lookup to sessions strictly before it, so
 * re-running this mid-session doesn't pick up sets just logged today.
 */
export async function getDoubleProgressionRecommendation(
  profileId: string,
  exerciseName: string,
  sessionDate: string,
  prescribedRepRangeHigh: number,
): Promise<DoubleProgressionRecommendation | null> {
  const exerciseId = getExerciseId(exerciseName)
  const sessionSets = await getLastSessionSets(profileId, exerciseId, sessionDate)
  if (sessionSets.length === 0) return null

  const lastWeight = maxWorkingWeight(sessionSets)
  const hitTopOnAllSets = sessionSets.every(s => s.reps_completed >= prescribedRepRangeHigh)

  if (!hitTopOnAllSets) {
    return {
      weightKg: lastWeight,
      didProgress: false,
      note: `Held at ${lastWeight}kg — didn't hit ${prescribedRepRangeHigh} reps on every set last time. Aim for more reps before adding load.`,
    }
  }

  const entry = getExerciseEntry(exerciseName)
  const increment = entry && isExternallyLoaded(entry) ? getLoadIncrementKg(entry, categorize(entry), lastWeight) : calculateIncrement(lastWeight)
  const weightKg = lastWeight + increment

  return {
    weightKg,
    didProgress: true,
    note: `Hit ${prescribedRepRangeHigh} reps on every set last time — up to ${weightKg}kg. Reps reset toward the bottom of the range.`,
  }
}

/**
 * Double progression on ADDED weight — the same rule as
 * getDoubleProgressionRecommendation above, applied to the belt rather than
 * the bar: hit the top of the rep range on every set and the added weight
 * goes up one plate pair; anything short and it holds while reps catch up.
 *
 * Its own function rather than a flag on the one above, because the two
 * return different things and mean different things. That one answers "what
 * should the bar weigh"; this answers "what should you hang off yourself",
 * and a caller that confused them would render "+15kg" as a 15kg lift — the
 * exact untrue statement AddedLoadChip exists to prevent.
 *
 * 2.5kg is one plate pair, matching prescribeAddedLoad's own rounding, so a
 * progressed figure is always a number someone can actually load.
 */
export const ADDED_LOAD_PROGRESSION_STEP_KG = 2.5

export interface AddedLoadProgression {
  addedKg: number
  didProgress: boolean
  note: string
}

export async function getAddedLoadProgression(
  profileId: string,
  exerciseName: string,
  sessionDate: string,
  prescribedRepRangeHigh: number,
): Promise<AddedLoadProgression | null> {
  const exerciseId = getExerciseId(exerciseName)
  const sessionSets = await getLastSessionSets(profileId, exerciseId, sessionDate)
  if (sessionSets.length === 0) return null

  // A session where nothing carried added weight tells us nothing about it —
  // returning 0 would read as "you used no belt last time, add 2.5kg", which
  // is a claim about a session we have no such record of.
  const withAdded = sessionSets.filter(s => s.added_load_kg != null)
  if (withAdded.length === 0) return null

  const lastAdded = withAdded.reduce((max, s) => Math.max(max, s.added_load_kg ?? 0), 0)
  const hitTopOnAllSets = sessionSets.every(s => s.reps_completed >= prescribedRepRangeHigh)

  if (!hitTopOnAllSets) {
    return {
      addedKg: lastAdded,
      didProgress: false,
      note: `Holding at +${lastAdded}kg — didn't hit ${prescribedRepRangeHigh} reps on every set last time. Chase the reps before adding more.`,
    }
  }
  const addedKg = lastAdded + ADDED_LOAD_PROGRESSION_STEP_KG
  return {
    addedKg,
    didProgress: true,
    note: `Hit ${prescribedRepRangeHigh} reps on every set last time — up to +${addedKg}kg. Reps reset toward the bottom of the range.`,
  }
}

/** Most recent logged working set for an exercise (optionally scoped to a mesocycle week). */
export async function getLastLoggedWeight(
  userId: string,
  exerciseName: string,
  weekNumber?: number
): Promise<{ weight_kg: number; reps_completed: number } | null> {
  let query = supabase
    .from('exercise_set_logs')
    .select('weight_kg, reps_completed, is_bodyweight')
    .eq('user_id', userId)
    .eq('exercise_id', getExerciseId(exerciseName))
    .eq('is_warmup', false)
    .order('completed_at', { ascending: false })
    .limit(10)

  if (weekNumber !== undefined) {
    query = query.eq('week_number', weekNumber)
  }

  const { data } = await query
  const row = (data ?? []).find(r => !isMalformedZeroWeight({ weight_kg: Number(r.weight_kg), is_bodyweight: r.is_bodyweight }))
  if (!row) return null
  return { weight_kg: Number(row.weight_kg), reps_completed: row.reps_completed }
}

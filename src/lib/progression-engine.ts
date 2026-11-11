import { supabase } from './supabase'
import { sessionDeclaresWarmups } from './session-derive'
import { getExerciseEntry, getExerciseId } from './exercise-db'
import { categorize, getLoadIncrementKg, isExternallyLoaded, getLoadingCeilingKg, loadingMode, roundToPlate, labelModeForEntry, formatLoad, effectiveLoadingCeilingKg, getEquipmentFloorKg, DELOAD_LOAD_FRACTION } from './load-prescription'
import { getLastSessionSets, getSetsForDate, isMalformedZeroWeight } from './set-log-store'
import type { ExerciseTier, ExerciseSetLog, Exercise, UserProfile } from './types'
import { effortFromRpe, type LiftEffort } from './lift-effort'

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

// ---------------------------------------------------------------------------
// WHICH OF THESE ROWS WERE WORKING SETS
//
// Ashley, 17 Sep 2026: her deadlift card said "Held at 95kg — didn't hit 8
// reps on every set last time" and would have said it every week for ever.
// She logged 20x10, 50x5, 70x3, then three clean 95x8. The build-up rows are
// stored as working sets, because `is_warmup` exists, is filtered by twelve
// readers, and NOTHING IN THE APP HAS EVER BEEN ABLE TO SET IT. So
// `every(reps >= 8)` fails on a 5-rep warm-up, and three perfect top sets can
// never clear it. Her dumbbell rows were frozen at 20kg the same way.
//
// THE HARM IS WORSE THAN THE FREEZE, and that is why this is read-time rather
// than waiting on the labelled rows she ruled for. Had she NOT pressed "Add
// Set" four times, `maxWorkingWeight` would be 70, TodayPanel stores the
// recommendation whether or not it progressed, and the card would print 70kg
// as the working weight. The ramp steps scale FROM that number, so the next
// session's build-up is computed off 70, logged, and becomes the next anchor.
// Left alone, contamination walks the prescription DOWN.
//
// SO THIS REPAIRS THE PAST WITHOUT WRITING TO IT. Every already-logged session
// is reinterpreted on read: no migration, no rewrite of her diary, nothing
// that could lose a row. It is also independent of how the rows are drawn, so
// it holds whatever the grid ends up looking like.
//
// THE RULE IS A CONJUNCTION, AND IT HAS TO BE. A weight threshold alone cannot
// work: `RAMP_SCHEMES.intermediate` prescribes a build-up step at 85% of the
// top set, and `RAMP_PERCENT_TABLE` prescribes a ramped WORKING set at 85% of
// the top set. Same number, opposite meaning. What separates them is REPS —
// the build-up step is prescribed for 2, the working set for the bottom of the
// rep range. So a row is a build-up when EITHER
//   (a) it is below the floor of what this session's own prescription ramps
//       through, or
//   (b) it is lighter than the session's top set AND lighter in reps than the
//       bottom of the prescribed range.
//
// THE FLOOR IS DERIVED, NEVER CHOSEN. Where the prescription carries its own
// per-set weights, the floor is the lowest share it asks for — so a session
// prescribed [75, 85, 92, 96, 100] can never have its 75% set thrown away by a
// number somebody typed here. The tolerance below it absorbs plate rounding:
// `buildPerSetLoads` rounds every step to the plates available, so a set
// prescribed at exactly the floor can land a kilo under it.
//
// BODYWEIGHT IS UNTOUCHED BY CONSTRUCTION, not by a guard: with a top set of
// 0 every comparison against a lighter weight is false, so nothing is dropped.
// ---------------------------------------------------------------------------

/** The share of the top set below which a row cannot be working, when the prescription says nothing more specific. */
const DEFAULT_WORKING_FLOOR = 0.85
/** Plate rounding can put a set prescribed AT the floor a little under it. */
const FLOOR_ROUNDING_TOLERANCE = 0.03

export interface WorkingSetContext {
  /** Bottom of the prescribed rep range. Without it, clause (b) cannot fire and only the weight floor applies. */
  repRangeLow?: number
  /** The prescription's own per-set weights, when it ramps — the floor is read off these rather than assumed. */
  perSetLoadKg?: number[]
  /** How many working sets the session asked for. Fewer than this and there is nothing complete to judge. */
  prescribedSets?: number
  /**
   * True when the session carries at least one row explicitly marked as a
   * build-up. THE INFERENCE BELOW THEN RETIRES ITSELF: it exists only because
   * nothing in the app could ever mark a warm-up, so every row logged before
   * 17 Sep 2026 looks like a working set. Once the app KNOWS, guessing is
   * strictly worse than reading — a genuine light back-off set would be
   * thrown away by a heuristic that is no longer needed.
   */
  sessionDeclaresWarmups?: boolean
}

export function workingSetsOf(sets: ExerciseSetLog[], ctx: WorkingSetContext = {}): ExerciseSetLog[] {
  // THE SESSION ALREADY SAID. Nothing below is an improvement on being told.
  if (ctx.sessionDeclaresWarmups) return sets
  const top = maxWorkingWeight(sets)
  if (top <= 0) return sets

  const prescribed = (ctx.perSetLoadKg ?? []).filter(kg => kg > 0)
  const share = prescribed.length > 1 ? Math.min(...prescribed) / Math.max(...prescribed) : DEFAULT_WORKING_FLOOR
  const floorKg = top * Math.max(0, Math.min(DEFAULT_WORKING_FLOOR, share) - FLOOR_ROUNDING_TOLERANCE)

  const working = sets.filter(s => {
    if (s.weight_kg < floorKg) return false
    if (ctx.repRangeLow != null && s.weight_kg < top && s.reps_completed < ctx.repRangeLow) return false
    return true
  })
  // NEVER JUDGE HER ON NOTHING. If a prescription this function does not
  // understand would empty the session, the old behaviour is strictly safer
  // than a confident answer drawn from no rows at all.
  return working.length > 0 ? working : sets
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
  tier?: ExerciseTier,
  ctx: WorkingSetContext = {},
): Promise<ProgressionResult | null> {
  const exerciseId = getExerciseId(exerciseName)
  const allTodayRows = (await getSetsForDate(userId, sessionDate))
    .filter(s => (s.exercise_id ?? getExerciseId(s.exercise_name)) === exerciseId)
  // ASKED BEFORE THE FILTER REMOVES THE EVIDENCE. Once she has ticked a real
  // build-up row, the inference below has nothing left to add.
  const declaresWarmups = sessionDeclaresWarmups(allTodayRows)
  const todaySets = allTodayRows
    .filter(s => !s.is_warmup)
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

  // BEFORE THE SLICE, and that ordering is the whole point. This takes the
  // first `prescribedSets` rows BY ORDER; Ashley's first three rows were her
  // build-up, so her three real 95kg sets at positions 4-6 were never looked
  // at and the same-session bump could not fire for her at all. A second,
  // independent freeze from the same cause, which nobody had reported.
  const { high: topReps, low: bottomReps } = parseRepRange(prescribedReps)
  const workingToday = workingSetsOf(todaySets, { repRangeLow: ctx.repRangeLow ?? bottomReps, perSetLoadKg: ctx.perSetLoadKg, sessionDeclaresWarmups: declaresWarmups })

  if (workingToday.length < prescribedSets) return null

  const relevantSets = workingToday.slice(0, prescribedSets)

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
  /** The heaviest working weight of the last session, before any increment — what a layoff eases from. */
  lastWeightKg: number
  /** True when every logged set from the last session hit the top of the rep range and the weight bumped up. */
  didProgress: boolean
  note: string
  /** How the lift felt last time, when that was said (the one tap, or an effort the coach logged). */
  effort?: LiftEffort | null
  /** Last time fell short: a working set under the bottom of the rep range. */
  fellShort?: boolean
  /** Last time was too easy, so today FINDS the weight: the calibration week's own search, on this one lift. */
  findWeight?: boolean
  /** The date of the session this was worked out from. */
  lastDate?: string
}

// ---------------------------------------------------------------------------
// HOW A LIFT FELT, AND WHAT THAT DOES TO THE NEXT WEIGHT
//
// Ashley, 11 Nov 2026: "If it prescribed a weight and I complete it and find it
// too easy and have lots left on reserve, will it ramp up accordingly or will
// it take many weeks". Measured: one small step a session, and only when every
// set was TYPED at the top of the range, so 40 kg to a true 70 kg took twelve
// sessions and a session ticked through never rose at all. Nothing asked how
// it felt. His ruling, from three options: "One tap per lift" (Too easy, About
// right, Too hard), after the lift's last set.
//
// The answer is kept as an effort on that lift's last working set, the same
// 1-10 scale a set the coach logs already carries, so an effort said to the
// coach and one tapped on the screen are read by one rule.
//
// WHAT EACH ANSWER DOES is a coaching decision (CSCS delegation; basis in
// BACKLOG and docs/plans/too-easy-weights.md):
//   easy  - four or more reps were left. By the app's own rep-to-load curve
//           that is about 13% of load, so the next session STARTS 10% up (at
//           least one step) and is a find-your-weight session: go up again
//           while it is easy, and the heaviest good set becomes the weight.
//           A load that far out is re-tested, not crept towards.
//   right - the existing rule (the top of the range on every set earns a
//           step); and two sessions running at one weight, every set done,
//           both about right, earn a step too. A tick records the bottom of
//           the range, so without this somebody who never types reps never
//           progresses however well it is going.
//   hard  - or any working set under the bottom of the range: hold. Two such
//           sessions running: down one step, to get the reps back.
// ---------------------------------------------------------------------------

/** How the lift felt: the effort on its LAST working set, where the question is asked and where fatigue shows. */
export function sessionEffort(working: ExerciseSetLog[]): LiftEffort | null {
  const last = [...working].sort((a, b) => b.set_number - a.set_number)[0]
  return last ? effortFromRpe(last.rpe) : null
}

/** One search step up from a weight that was too easy: 10%, and never less than one real step. */
export function findWeightStartKg(lastWeightKg: number, exerciseName: string): number {
  const entry = getExerciseEntry(exerciseName)
  if (!entry || !isExternallyLoaded(entry)) return lastWeightKg + calculateIncrement(lastWeightKg)
  const oneStep = lastWeightKg + getLoadIncrementKg(entry, categorize(entry), lastWeightKg)
  return Math.max(oneStep, roundToPlate(lastWeightKg * 1.1, loadingMode(entry)))
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
  ctx: WorkingSetContext = {},
): Promise<DoubleProgressionRecommendation | null> {
  const exerciseId = getExerciseId(exerciseName)
  const sessionSets = await getLastSessionSets(profileId, exerciseId, sessionDate)
  if (sessionSets.length === 0) return null

  // Build-up rows out before either question is asked — they are what froze
  // her deadlift at 95kg and her rows at 20kg.
  const working = workingSetsOf(sessionSets, ctx)
  // A SESSION THAT WAS ONLY WARMED UP IS NOT EVIDENCE OF ANYTHING, and saying
  // so out loud is the other half of the fix. Filtering alone is not enough:
  // a day logged as 20x10, 50x5, 70x3 and then abandoned collapses to its
  // heaviest BUILD-UP row, and the caller stores the recommendation whether or
  // not it progressed — so the card would print 70kg as the working weight and
  // the next session's ramp would be scaled from it. Returning null leaves the
  // plan's own prescription standing, which is the honest answer to "I have no
  // complete session to judge".
  if (ctx.prescribedSets != null && working.length < ctx.prescribedSets) {
    // A FIND-YOUR-WEIGHT SESSION CLIMBS ON PURPOSE, so its early sets look like build-up and the guard above would
    // throw the whole session away and hand back the plan's stale number. When every set was logged and the session
    // before it was the "too easy" one, the heaviest set IS the answer that session went looking for.
    const searchDate = sessionSets[0]?.date
    if (sessionSets.length < ctx.prescribedSets || !searchDate) return null
    const before = workingSetsOf(await getLastSessionSets(profileId, exerciseId, searchDate), ctx)
    if (sessionEffort(before) !== 'easy') return null
    const found = maxWorkingWeight(sessionSets)
    const feltAfter = sessionEffort(sessionSets)
    if (feltAfter === 'easy') {
      const weightKg = findWeightStartKg(found, exerciseName)
      return { weightKg, lastWeightKg: found, didProgress: true, findWeight: true, effort: feltAfter, fellShort: false, lastDate: searchDate,
        note: `Still too easy at ${found}kg, so today starts at ${weightKg}kg. Go up again if it's still easy: your heaviest good set becomes your weight.` }
    }
    return { weightKg: found, lastWeightKg: found, didProgress: found > maxWorkingWeight(before), effort: feltAfter, fellShort: false, lastDate: searchDate,
      note: `You found ${found}kg last time: that's your weight today.` }
  }
  const lastWeight = maxWorkingWeight(working)
  const lastDate = working[0]?.date
  const fellShortOf = (sets: ExerciseSetLog[]) => ctx.repRangeLow != null && sets.some(s => s.reps_completed < ctx.repRangeLow!)
  const effort = sessionEffort(working)
  const fellShort = fellShortOf(working)
  const said = { effort, fellShort, lastDate }

  const entry = getExerciseEntry(exerciseName)
  const increment = entry && isExternallyLoaded(entry) ? getLoadIncrementKg(entry, categorize(entry), lastWeight) : calculateIncrement(lastWeight)
  /** The session before the last one, read only where a rule needs two running. */
  const sessionBefore = async (): Promise<ExerciseSetLog[]> => {
    if (!lastDate) return []
    const before = workingSetsOf(await getLastSessionSets(profileId, exerciseId, lastDate), ctx)
    return ctx.prescribedSets != null && before.length < ctx.prescribedSets ? [] : before
  }

  // HARD, OR SHORT OF THE RANGE: hold, and never add. Two such sessions running come down one step.
  if (effort === 'hard' || fellShort) {
    const before = await sessionBefore()
    const hardBefore = before.length > 0 && maxWorkingWeight(before) >= lastWeight && (sessionEffort(before) === 'hard' || fellShortOf(before))
    if (hardBefore) {
      const floor = entry && isExternallyLoaded(entry) ? getEquipmentFloorKg(entry) : 0
      const weightKg = Math.max(floor, lastWeight - increment)
      if (weightKg < lastWeight) {
        return { ...said, weightKg, lastWeightKg: lastWeight, didProgress: false,
          note: `Hard two sessions running, so down to ${weightKg}kg to get the reps back.` }
      }
    }
    return { ...said, weightKg: lastWeight, lastWeightKg: lastWeight, didProgress: false,
      note: effort === 'hard'
        ? `Hard last time, so holding at ${lastWeight}kg.`
        : `Held at ${lastWeight}kg — short of ${ctx.repRangeLow} reps on a set last time. Get the reps before adding load.` }
  }

  // TOO EASY: today finds the weight.
  if (effort === 'easy') {
    const weightKg = findWeightStartKg(lastWeight, exerciseName)
    return { ...said, weightKg, lastWeightKg: lastWeight, didProgress: true, findWeight: true,
      note: `Too easy last time, so today starts at ${weightKg}kg. Go up again if it's still easy: your heaviest good set becomes your weight.` }
  }

  const hitTopOnAllSets = working.every(s => s.reps_completed >= prescribedRepRangeHigh)
  if (hitTopOnAllSets) {
    const weightKg = lastWeight + increment
    return { ...said, weightKg, lastWeightKg: lastWeight, didProgress: true,
      note: `Hit ${prescribedRepRangeHigh} reps on every set last time — up to ${weightKg}kg. Reps reset toward the bottom of the range.` }
  }

  // ABOUT RIGHT, TWICE RUNNING AT ONE WEIGHT, every set done both times: a step.
  if (effort === 'right') {
    const before = await sessionBefore()
    if (before.length > 0 && maxWorkingWeight(before) === lastWeight && sessionEffort(before) === 'right' && !fellShortOf(before)) {
      const weightKg = lastWeight + increment
      return { ...said, weightKg, lastWeightKg: lastWeight, didProgress: true,
        note: `About right two sessions running at ${lastWeight}kg — up to ${weightKg}kg.` }
    }
  }

  return { ...said, weightKg: lastWeight, lastWeightKg: lastWeight, didProgress: false,
    note: `Held at ${lastWeight}kg — didn't hit ${prescribedRepRangeHigh} reps on every set last time. Aim for more reps before adding load.` }
}

// ---------------------------------------------------------------------------
// TODAY'S WEIGHT: WHAT THE LOG EARNED, READ AGAINST THE PLAN'S OWN WEEK
//
// The card took the log's answer whatever the plan week was (traced 11 Nov
// 2026 for his question above). Three things followed, none of them a rule
// anybody chose:
//   - a DELOAD week showed last week's full weight, because the log said so;
//   - the first session AFTER a deload was held at the deload weight;
//   - a session done exactly as written (ticks, no typing) records the bottom
//     of the range, never earns a step, and so sat UNDER the plan's own next
//     week for as long as it was done properly.
// This is the one place that reads the log's answer against the plan's week.
// It is a pure function so the checks can ask it rather than read a screen.
//
// CSCS basis (BACKLOG): a deload is a planned drop in load and the log of a
// loading week says nothing about it; a deload's own log says nothing about a
// working weight; and completing the prescribed work is the standard for
// taking the plan's next step, where falling short of it, or lifting less than
// was asked, is not.
// ---------------------------------------------------------------------------

export interface PlanWeekContext {
  /** The plan's number for this lift today. */
  printedKg: number
  /** The plan's number for this lift in the plan week of the last session. Absent when the lift was not in that week. */
  printedThenKg?: number
  todayIsDeload: boolean
  /** The last session fell in a deload week. */
  lastWasDeload: boolean
}

export interface CardLoad {
  weightKg: number
  note: string
  didProgress: boolean
  /** Today this lift runs the find-your-weight search. */
  findWeight: boolean
}

export function cardLoadFor(rec: DoubleProgressionRecommendation, plan: PlanWeekContext, exerciseName: string): CardLoad {
  const entry = getExerciseEntry(exerciseName)
  const loaded = !!entry && isExternallyLoaded(entry)
  const last = rec.lastWeightKg
  const plate = (kg: number) => (loaded ? roundToPlate(kg, loadingMode(entry!)) : kg)

  if (plan.todayIsDeload) {
    // A second deload session repeats the first; a plan followed to the kilo gets the plan's own deload number;
    // anybody else gets the same share of what they actually lifted.
    if (plan.lastWasDeload) return { weightKg: last, note: `Deload week: the same lighter weight as last time.`, didProgress: false, findWeight: false }
    if (plan.printedThenKg != null && last === plan.printedThenKg) {
      return { weightKg: plan.printedKg, note: `Deload week: lighter on purpose.`, didProgress: false, findWeight: false }
    }
    // Plate rounding already stops at the lightest thing that can be loaded (measured: a second floor here bound nothing).
    const weightKg = Math.min(last, plate(last * DELOAD_LOAD_FRACTION))
    return { weightKg, note: `Deload week: lighter on purpose, from the ${last}kg you lifted last time.`, didProgress: false, findWeight: false }
  }

  if (plan.lastWasDeload) {
    // Back from a deload. Never above the plan, and never more than a step over where they were before it.
    const before = plate(last / DELOAD_LOAD_FRACTION)
    const step = loaded ? getLoadIncrementKg(entry!, categorize(entry!), before) : calculateIncrement(before)
    const weightKg = Math.min(plan.printedKg, before + step)
    return { weightKg, note: weightKg === plan.printedKg ? `Back from your deload: this block's weight.` : `Back from your deload: picking up from about where you were.`,
      didProgress: false, findWeight: false }
  }

  // Did the last session keep up with the plan? Only then may the plan's own next number raise today's.
  const keptUp = plan.printedThenKg != null && last >= plan.printedThenKg && !rec.fellShort && rec.effort !== 'hard'
  if (keptUp && plan.printedKg > rec.weightKg) {
    return { weightKg: plan.printedKg, note: `Last session done as planned — this week's ${plan.printedKg}kg.`, didProgress: plan.printedKg > last, findWeight: !!rec.findWeight }
  }
  return { weightKg: rec.weightKg, note: rec.note, didProgress: rec.didProgress, findWeight: !!rec.findWeight }
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
  /** The added weight of the last session, before any increment — what a layoff eases from. */
  lastAddedKg: number
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
  // THE TWIN, and it had a bug of its own: `every` ran over EVERY row,
  // including ones carrying no added weight at all — so a single unweighted
  // warm-up pull-up froze the belt weight exactly as a 5-rep build-up froze
  // the deadlift. The question is about the sets that carried the belt.
  const withAdded = sessionSets.filter(s => s.added_load_kg != null)
  if (withAdded.length === 0) return null

  const lastAdded = withAdded.reduce((max, s) => Math.max(max, s.added_load_kg ?? 0), 0)
  const topAdded = withAdded.filter(s => (s.added_load_kg ?? 0) >= lastAdded)
  const hitTopOnAllSets = topAdded.every(s => s.reps_completed >= prescribedRepRangeHigh)

  if (!hitTopOnAllSets) {
    return {
      addedKg: lastAdded,
      lastAddedKg: lastAdded,
      didProgress: false,
      note: `Holding at +${lastAdded}kg — didn't hit ${prescribedRepRangeHigh} reps on every set last time. Chase the reps before adding more.`,
    }
  }
  const addedKg = lastAdded + ADDED_LOAD_PROGRESSION_STEP_KG
  return {
    addedKg,
    lastAddedKg: lastAdded,
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
    // `*` for the same reason the PR cache uses it: a column list naming
    // `drop_index` is rejected before the migration runs, and this function
    // discards the error, so progression would silently lose its anchor.
    .select('*')
    .eq('user_id', userId)
    .eq('exercise_id', getExerciseId(exerciseName))
    .eq('is_warmup', false)
    .order('completed_at', { ascending: false })
    .limit(10)

  if (weekNumber !== undefined) {
    query = query.eq('week_number', weekNumber)
  }

  const { data } = await query
  // A DROP NEVER RE-ANCHORS NEXT WEEK, and this is the sharpest case of the
  // three: a drop is logged immediately after the set it hangs off, so it is
  // the most recent row and would win this `order by completed_at desc` every
  // time. The prescription would fall to the drop's weight — the app lowering
  // next week's target every time somebody trained HARDER. Ashley's ruling,
  // 19 Sep 2026.
  const row = (data ?? [])
    .filter(r => (((r as unknown) as { drop_index?: number | null }).drop_index ?? 0) === 0)
    .find(r => !isMalformedZeroWeight({ weight_kg: Number(r.weight_kg), is_bodyweight: r.is_bodyweight }))
  if (!row) return null
  return { weight_kg: Number(row.weight_kg), reps_completed: row.reps_completed }
}

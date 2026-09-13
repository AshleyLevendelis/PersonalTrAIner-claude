// ---------------------------------------------------------------------------
// WHAT THIS SESSION COULD USE — the ranked half of "add an exercise".
//
// Adding is the one edit with no outgoing exercise to key off, so
// getReplacementCandidates (mesocycle-edit.ts:43) cannot rank it: that
// function asks "what else trains what THIS lift trains". Here the question is
// "what would fit this session", which is a property of the day.
//
// TWO LISTS, ONE ANSWER, AND THE SPLIT IS ASHLEY'S RULING (13 Sep 2026):
// *show everything, warn me*. This module is the RANKED list and it comes
// strictly from `getConstrainedPool` — generation's own equipment, injury,
// style and skill stages, so a suggestion is never something the app would
// have refused to plan. The sheet's search box beside it reads the whole
// catalogue and states the clash on the row, which is precisely what the swap
// dialog already does (exercise-plan.ts:4498-4509 records why: a filtered-only
// list dead-ends when every ranked option is also unavailable, and hiding
// options was the worse failure). Add and swap therefore give ONE answer to
// "may I choose this", not two.
//
// RANK WITHIN THE SESSION'S THEME, AND THE FIRST VERSION OF THIS FILE DID THE
// OPPOSITE. It scored an exercise UP for training a major muscle group the day
// did not touch at all, on the reasoning that a gap is what a session is
// short of. Driven on a real generated push day (bench, Arnold press, lateral
// raise, triceps, flyes) it offered, in order: Air Squat, Belt Squat,
// Bodyweight Good Morning, Box Squat. Every one of them true to the rule and
// wrong as coaching — nobody adds a squat to their bench day, and a trainer
// who suggested it would not be asked twice. The gap it was measuring is a
// property of the WEEK, which the week-balance pass already owns; within one
// session the useful question is the opposite one, so this file now scores
// overlap with what the day already trains and drops anything with none.
//
// CHOSEN, NOT SHUFFLED. Every row carries the reason it is there, in the same
// `{ exercise, note }` shape the swap list uses, so the sheet can render both
// through one row component, and ties break on name so the same day offers
// the same list twice.
// ---------------------------------------------------------------------------
import { getConstrainedPool, mapMovementPattern } from './exercise-plan'
import { EXERCISE_DATABASE, getExerciseEntry, muscleGroupsOf, type ExerciseEntry, type MuscleGroup } from './exercise-db'
import type { WorkoutDay, UserProfile, MesocycleMovementPattern } from './types'

export interface AdditionCandidate {
  exercise: ExerciseEntry
  /** Why this one is being offered, in a sentence the row can print. */
  note: string
}

/**
 * The patterns that MAKE a session what it is, rather than fitting into one.
 *
 * Muscle overlap alone is not enough to decide something belongs on a day, and
 * the gate caught this after the first fix: a deadlift shares BACK with a push
 * day that has any rowing in it, so overlap happily offered Deadlifts, Goblet
 * Squats and Barbell Squats for a bench-press session. Adding a lower-body
 * compound is not an addition to that session, it is a different session. A
 * pull, a press or an isolation movement is judged on overlap alone — rear
 * delt work on a push day is a good idea, and this must not block it.
 */
const STRUCTURAL_PATTERNS: ReadonlySet<MesocycleMovementPattern> =
  new Set(['squat', 'hinge', 'lunge'] as MesocycleMovementPattern[])

/** Sets per muscle group in one day, by the reckoning weekMuscleBalance uses. */
function dayMuscleSets(day: WorkoutDay): Map<MuscleGroup, number> {
  const counts = new Map<MuscleGroup, number>()
  for (const ex of day.exercises) {
    // The day holds planned exercises; the catalogue holds the muscles. A
    // planned exercise whose name no longer resolves contributes nothing
    // rather than throwing — the tolerance muscleSetTotal already keeps.
    const entry = getExerciseEntry(ex.name)
    if (!entry) continue
    for (const g of muscleGroupsOf(entry)) counts.set(g, (counts.get(g) ?? 0) + ex.sets)
  }
  return counts
}

/**
 * The exercises this session could use, best first.
 *
 * Ranking, in words: it has to train something this session already trains —
 * that is what makes it belong on this day rather than another. Among those,
 * one that hits the muscle getting the LEAST work here comes first, because
 * that is the part of the session with room in it. An accessory outranks a
 * second main lift: "add something" almost never means "add a second squat",
 * and a request for one of those is a swap or a different day.
 *
 * Returns nothing for a day with no exercises — there is no theme to fit, and
 * `addExerciseToSession` refuses a rest day anyway.
 */
export function getAdditionCandidates(
  day: WorkoutDay,
  profile: UserProfile,
  exclusions: string[] = [],
  limit = 8,
): AdditionCandidate[] {
  const muscles = dayMuscleSets(day)
  if (muscles.size === 0) return []
  const patterns = new Set(day.exercises.map(e => e.movement_pattern).filter(Boolean) as MesocycleMovementPattern[])
  const leastInDay = Math.min(...muscles.values())
  const present = new Set(day.exercises.map(e => e.name.toLowerCase()))

  const scored = getConstrainedPool(profile, exclusions)
    .filter(e => !present.has(e.name.toLowerCase()))
    .map(exercise => {
      const overlap = muscleGroupsOf(exercise).filter(g => muscles.has(g))
      if (overlap.length === 0) return null
      const pattern = mapMovementPattern(exercise.movement_pattern)
      if (STRUCTURAL_PATTERNS.has(pattern) && !patterns.has(pattern)) return null

      // THE GROUP THE EXERCISE LEADS WITH, not merely one it touches.
      // muscleGroupsOf preserves primary_muscles' order, so overlap[0] is what
      // this movement is FOR among the things the day trains.
      //
      // Read off a screenshot, 13 Sep 2026: keying on the least-served
      // overlapping group instead offered "Archer Push-Ups — your core gets
      // the least work in this session", because a push-up's secondary core
      // was the thinnest thing it touched. True, and it reads as though the
      // app thinks a push-up is core work. Nobody would say it out loud.
      const leads = overlap[0]
      const leadSets = muscles.get(leads) ?? 0
      const isMainLift = exercise.mechanics_tier === 'tier1_compound'

      const score = 2
        + (leadSets <= leastInDay ? 2 : 0)
        + (!isMainLift ? 1 : 0)

      const note = leadSets <= leastInDay
        ? `Your ${leads} gets the least work in this session — ${leadSets} ${leadSets === 1 ? 'set' : 'sets'}. This adds more.`
        : `Trains ${overlap.slice(0, 2).join(' and ')}, like the rest of this session.`

      return { exercise, note, score, thinnestSets: leadSets }
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) =>
      (b.score - a.score)
      || (a.thinnestSets - b.thinnestSets)
      || a.exercise.name.localeCompare(b.exercise.name))

  return scored.slice(0, limit).map(({ exercise, note }) => ({ exercise, note }))
}

/**
 * Resolve a movement NAMED IN WORDS against what this person can be prescribed.
 *
 * THIS IS THE SAFETY STEP ON THE COACH PATH, and it is a function rather than
 * two inline lookups so a check can call it. The model sends a name; nothing
 * about that name has been through equipment, injury, style or skill filtering
 * until it passes through here. A name that is not in the pool — a movement
 * the model invented, or a real one this profile is filtered out of — comes
 * back null, and the caller refuses.
 *
 * It lived inline in ChatAssistant's builder and again in the executor until
 * a mutation showed why that was wrong: replacing the pool with the raw
 * catalogue in the builder left the WORD `getConstrainedPool` elsewhere in the
 * file, so a gate that searched the source for it stayed green while the
 * filtering was gone. One exported function, called by both, asserted by
 * calling it.
 *
 * Matching is exact first, then a unique prefix/substring — "face pull" finds
 * "Face Pulls". Ambiguity resolves to nothing rather than to a guess: two
 * plausible matches means the app does not know which was meant.
 */
export function resolveAdditionRequest(
  item: string,
  profile: UserProfile,
  exclusions: string[] = [],
): ExerciseEntry | null {
  const wanted = item.trim().toLowerCase()
  if (!wanted) return null
  const pool = getConstrainedPool(profile, exclusions)
  const exact = pool.find(e => e.name.toLowerCase() === wanted)
  if (exact) return exact

  // A REAL MOVEMENT THE FILTERS REMOVED IS A REFUSAL, NOT A NEAR-MISS. Caught
  // by the gate: asked for "Push-Ups" with a shoulder injury, the substring
  // pass found exactly one survivor whose name contains it — a different
  // push-up variant — and handed that back. The card would have named the
  // substitute, so it was not silent, but it answers a question nobody asked.
  // When someone names a movement that exists and they cannot be prescribed,
  // the honest answer is that they cannot be prescribed it.
  const inCatalogue = EXERCISE_DATABASE.some(e => !e.retired && e.name.toLowerCase() === wanted)
  if (inCatalogue) return null

  const partial = pool.filter(e => e.name.toLowerCase().includes(wanted))
  return partial.length === 1 ? partial[0] : null
}

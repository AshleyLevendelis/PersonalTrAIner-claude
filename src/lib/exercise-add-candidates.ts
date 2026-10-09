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
// THE DAY'S OWN WORK DEFINES IT, AND ITS PURPOSE COMES FIRST — decided as a
// CSCS coach, 9 Oct 2026, after the tester's leg day offered Arm Circles, Band
// Face Pulls and Band Pull-Aparts under "Your shoulders gets the least work in
// this session" (reproduced on 8 of 8 generated leg days for a shoulder-flagged,
// limited-kit profile). Three things were wrong, and the fourth is grammar:
//   1. MOVEMENT PREP IS NOT WORK. A shoulder flag puts a two-set shoulder-care
//      primer on every day, so "shoulders" became a muscle leg day trains — the
//      one with the fewest sets, which is exactly what the ranking rewards. The
//      session's theme is now read from its working exercises only, and a
//      primer is never offered as an addition (the search box still reaches
//      one): an added exercise extends the training stimulus, and prep is
//      dosed to prepare, not to be added to.
//   2. THE DAY'S PURPOSE FIRST. Each track names the work without which its
//      name is untrue (`defining_patterns`, asked through
//      dayHoldsDefiningWork); a candidate that IS that work sorts above one
//      that merely shares a muscle with the session. Leg day offers leg work.
//   3. A FLAGGED JOINT IS NOT A GAP TO FILL. With a shoulder or lower-back
//      flag on the profile the app does not volunteer more loading for it:
//      nothing whose lead muscle sits on the flagged area is suggested, that
//      muscle is never the "least work" a suggestion is ranked up for, and it
//      is not a reason for anything else to be on the list. She can still
//      choose one by search — her 13 Sep ruling, show everything — and the
//      plan's own dose is untouched. (The other six areas have no muscle group
//      of their own; for those the catalogue's contraindication tags, already
//      applied to the pool, are the whole answer. A rule that also dropped
//      everything the catalogue marks as GOOD for a flagged joint was built
//      and taken out again: it removed leg curls for a bad knee and trunk work
//      for a bad back, which is the opposite of what a coach would offer.)
//
// CHOSEN, NOT SHUFFLED. Every row carries the reason it is there, in the same
// `{ exercise, note }` shape the swap list uses, so the sheet can render both
// through one row component, and ties break on name so the same day offers
// the same list twice.
// ---------------------------------------------------------------------------
import { getConstrainedPool, mapMovementPattern, hasBetterLoadingPeer, EQUIPMENT_QUALITY_TIERS, dayHoldsDefiningWork, isWeekSupportLeg } from './exercise-plan'
import { isExternallyLoaded } from './load-prescription'
import { EXERCISE_DATABASE, getExerciseEntry, muscleGroupsOf, type ExerciseEntry, type MuscleGroup } from './exercise-db'
import type { WorkoutDay, UserProfile, MesocycleMovementPattern, EquipmentAccess } from './types'

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

/** Movement prep — a warm-up drill on the day's list. Dosed to prepare, so it is neither the session's work nor something to add more of. */
function isMovementPrep(entry: ExerciseEntry | undefined): boolean {
  return entry?.mechanics_tier === 'primer'
}

/**
 * IS THIS ROW PART OF WHAT THE SESSION IS FOR? Not movement prep, and not the
 * one light leg accessory a shoulders day carries for the WEEK's sake
 * (isWeekSupportLeg — "not a second leg day"). Counting that two-set bridge
 * made hamstrings the thinnest muscle of a shoulders day and filled the list
 * with seven leg curls: the same fault as the primer, by the other door.
 */
function isSessionWork(day: WorkoutDay, entry: ExerciseEntry | undefined): entry is ExerciseEntry {
  return !!entry && !isMovementPrep(entry) && !isWeekSupportLeg(day.focus, entry)
}

/**
 * Sets per muscle group in one day's WORK, by the reckoning weekMuscleBalance
 * uses. Movement prep is left out: see point 1 in the header.
 */
function dayMuscleSets(day: WorkoutDay): Map<MuscleGroup, number> {
  const counts = new Map<MuscleGroup, number>()
  for (const ex of day.exercises) {
    // The day holds planned exercises; the catalogue holds the muscles. A
    // planned exercise whose name no longer resolves contributes nothing
    // rather than throwing — the tolerance muscleSetTotal already keeps.
    const entry = getExerciseEntry(ex.name)
    if (!isSessionWork(day, entry)) continue
    for (const g of muscleGroupsOf(entry)) counts.set(g, (counts.get(g) ?? 0) + ex.sets)
  }
  return counts
}

/**
 * The muscle group that sits ON an area somebody can flag, where the app's two
 * vocabularies have one. Only these two do: a knee, hip, ankle, elbow, wrist
 * or neck has no muscle group of its own here, and for those the catalogue's
 * own contraindication tags (already applied to the pool) are the whole answer.
 */
const GROUPS_ON_A_FLAGGED_AREA: Record<string, MuscleGroup[]> = {
  shoulders: ['shoulders'],
  lower_back: ['erectors'],
}

/**
 * "Your shoulders get", "Your chest gets". The sentence printed "Your
 * shoulders gets the least work" for every plural group. A SWITCH WITH NO
 * DEFAULT, so a twelfth muscle group cannot be added without somebody deciding
 * which verb it takes.
 */
export function leastWorkVerb(group: MuscleGroup): 'get' | 'gets' {
  switch (group) {
    case 'chest': case 'back': case 'core': return 'gets'
    case 'erectors': case 'shoulders': case 'biceps': case 'triceps':
    case 'quads': case 'hamstrings': case 'glutes': case 'calves': return 'get'
  }
}

/** A real, loadable tool sorts before an improvised one (band, backpack) when both are tied on everything else — the same shared question generation, rotation, the swap list and the scorer all ask. */
function equipmentPenalty(exercise: ExerciseEntry, pool: ExerciseEntry[], equipment?: EquipmentAccess): number {
  return equipment && EQUIPMENT_QUALITY_TIERS.has(equipment) && hasBetterLoadingPeer(exercise, pool) ? 1 : 0
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
  const patterns = new Set(day.exercises
    .filter(e => isSessionWork(day, getExerciseEntry(e.name)))
    .map(e => e.movement_pattern).filter(Boolean) as MesocycleMovementPattern[])
  const injuries = profile.injuries ?? []
  const flaggedGroups = new Set(injuries.flatMap(i => GROUPS_ON_A_FLAGGED_AREA[i] ?? []))
  // The thinnest part of the session — never a muscle on a flagged area, which
  // is thin on purpose (point 3 in the header). AND ONLY WHEN SOMETHING IS
  // THINNER THAN SOMETHING ELSE: on a day whose muscles all carry the same
  // sets, every candidate used to be told its muscle "gets the least work —
  // 7 sets", which is not true of any of them.
  const openSets = [...muscles].filter(([g]) => !flaggedGroups.has(g)).map(([, sets]) => sets)
  const leastInDay = Math.min(...openSets)
  const somethingIsThinner = leastInDay < Math.max(...openSets)
  const present = new Set(day.exercises.map(e => e.name.toLowerCase()))
  const pool = getConstrainedPool(profile, exclusions)
  const equipment = profile.equipment_access
  // Does this day's name make a claim at all? Asked with nothing in hand: a
  // track with no defining work answers yes to anything, and then purpose is
  // not a way to tell two candidates apart.
  const dayHasAPurpose = !dayHoldsDefiningWork(day.focus, [])

  const scored = pool
    .filter(e => !present.has(e.name.toLowerCase()))
    // Movement prep is never offered as an addition.
    .filter(e => !isMovementPrep(e))
    // Nor is more loading for a flagged area: nothing that leads with the
    // muscle sitting on it.
    .filter(e => { const lead = muscleGroupsOf(e)[0]; return !lead || !flaggedGroups.has(lead) })
    .map(exercise => {
      // What it shares with the session's work. A muscle on a flagged area is
      // not something to add to, so it is not a reason to be here either —
      // "Jump Rope: trains shoulders, like the rest of this session" was the
      // one suggestion on a shoulder-flagged chest day.
      const overlap = muscleGroupsOf(exercise).filter(g => muscles.has(g) && !flaggedGroups.has(g))
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

      const thinnest = somethingIsThinner && leadSets <= leastInDay

      const score = 2
        + (thinnest ? 2 : 0)
        + (!isMainLift ? 1 : 0)

      const note = thinnest
        ? `Your ${leads} ${leastWorkVerb(leads)} the least work in this session — ${leadSets} ${leadSets === 1 ? 'set' : 'sets'}. This adds more.`
        : `Trains ${overlap.slice(0, 2).join(' and ')}, like the rest of this session.`

      // THE DAY'S OWN WORK — the thing its name promises (point 2).
      const ofTheDay = dayHasAPurpose && dayHoldsDefiningWork(day.focus, [exercise]) ? 1 : 0

      // SOMETHING SHE CAN ADD WEIGHT TO, before something she cannot — the
      // tie used to fall to the alphabet, so a lifter with dumbbells was
      // offered Air Squat, Bodyweight Good Morning and Box Squat (Bodyweight)
      // ahead of Goblet Squats. Added work should be work that can progress;
      // her 18 Sep ruling on the swap list is the same call ("weight always
      // wins"). With no kit nothing in the pool is loaded and this is silent.
      const loadable = isExternallyLoaded(exercise) ? 1 : 0

      return { exercise, note, score, ofTheDay, loadable, thinnestSets: leadSets }
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) =>
      // OUTERMOST: what the day is for, before what it happens to touch.
      (b.ofTheDay - a.ofTheDay)
      || (b.score - a.score)
      || (a.thinnestSets - b.thinnestSets)
      || (b.loadable - a.loadable)
      // A REAL TOOL BEFORE AN IMPROVISED ONE, ADDED 21 Sep 2026. Every tied
      // candidate used to fall straight to alphabetical order — the exact
      // "Backpack Lateral Raise sorts to index 0" shape this whole line of
      // work exists to close, reproduced on the one path nobody had re-
      // checked: driven on a real full-gym push day, tied triceps candidates
      // offered Band Tricep Kickback and Band Tricep Pushdown ahead of Cable
      // Pushdown and Skull Crushers, on name alone. Same shared definition as
      // generation, rotation, the swap list and the scorer.
      || (equipmentPenalty(a.exercise, pool, equipment) - equipmentPenalty(b.exercise, pool, equipment))
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

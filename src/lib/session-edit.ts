// ---------------------------------------------------------------------------
// EDITING ONE SESSION'S EXERCISE LIST — add, remove, and reorder.
//
// Ashley, 11 Sep 2026, from the must-have audit: an exercise could be swapped
// or banned and nothing else. Banning rewrites every week of every block
// (mesocycle-edit.ts:353), so "not today" did not exist; neither did moving
// one earlier or later.
//
// THE TAIL MOVED OUT, 13 Sep 2026. Everything that must hold after a day's
// exercise list changes shape now lives in settle-week.ts, because this file
// was the only caller and every OTHER in-place edit — swap, ban, volume —
// re-ran none of it. See that file's header for what each edit was missing.
//
// CORRECTED AT THE SAME TIME, and worth knowing because the wrong version was
// written down here and in the must-have list: this header used to say
// enforceWeeklyPatternBalance was unreachable "because it needs the candidate
// pool and the whole generation context". It does not. Its signature is
// (days: WorkoutDay[]) => void — the same shape as the two passes already
// called here. Only balanceWeeklyStructure genuinely needs the pool and the
// trace, and it swaps exercise IDENTITIES, which would overwrite the edit
// somebody just made. The reachable half is now part of the tail.
//
// The precedent is volume-adjust.ts — the one production path that already
// mutates a session outside generation. It touches sets only, clamps through
// the generator's own bounds, and refuses rather than overrun the time cap.
// This file extends that shape; it does not invent one.
//
// Scope vocabulary is mesocycle-edit's, deliberately: 'today' patches one
// (week, day), 'permanent' the rest of THIS block. A third meaning would be a
// third thing for someone to get wrong.
// ---------------------------------------------------------------------------
import type { MesocycleWeek, Exercise, UserProfile, ExerciseTier } from './types'
import type { ExerciseEntry } from './exercise-db'
import type { LoadPrescription } from './load-prescription'
import { settleWeek } from './settle-week'
import { applyReplacement, type SwapScope } from './mesocycle-edit'
import { mapTier } from './exercise-plan'

/**
 * The fewest exercises a session may be reduced to. The same floor
 * sizeBlockToRestBudget's phase B already keeps (exercise-plan.ts:5472-5493) —
 * stated once here rather than guessed at a second time.
 */
export const MIN_EXERCISES_PER_SESSION = 3

export interface SessionEditResult {
  mesocycle: MesocycleWeek[]
  /** True when the edit actually changed something. False leaves the input untouched. */
  changed: boolean
  /** Why nothing happened, in words a person can read. Empty when `changed`. */
  refusal?: string
}

/** Which weeks a scope reaches — mesocycle-edit's own rule, kept identical. */
function targetWeekNumbers(mesocycle: MesocycleWeek[], weekNumber: number, scope: SwapScope): number[] {
  if (scope === 'today') return [weekNumber]
  const current = mesocycle.find(w => w.week_number === weekNumber)
  if (!current) return [weekNumber]
  return mesocycle
    .filter(w => w.block_number === current.block_number && w.week_number >= weekNumber)
    .map(w => w.week_number)
}

export interface RemoveExerciseParams {
  mesocycle: MesocycleWeek[]
  profile: UserProfile
  weekNumber: number
  dayName: string
  exIndex: number
  scope: SwapScope
}

/**
 * Take one exercise out of a session, without banning it from the plan.
 *
 * Refuses rather than empties: a session below MIN_EXERCISES_PER_SESSION is
 * not a session. The superset partner it may orphan is repaired by
 * clearOrphanedSupersetLabels in the shared tail, which also undoes the
 * `rest: 'alternate'` that partner was carrying.
 */
export function removeExerciseFromSession(params: RemoveExerciseParams): SessionEditResult {
  const { mesocycle, profile, weekNumber, dayName, exIndex, scope } = params
  const week = mesocycle.find(w => w.week_number === weekNumber)
  const day = week?.days.find(d => d.day === dayName)
  const target = day?.exercises[exIndex]
  if (!week || !day || !target) {
    return { mesocycle, changed: false, refusal: "I couldn't find that exercise on that day." }
  }
  if (day.exercises.length - 1 < MIN_EXERCISES_PER_SESSION) {
    return {
      mesocycle,
      changed: false,
      refusal: `That would leave ${dayName} with fewer than ${MIN_EXERCISES_PER_SESSION} exercises. Take the whole day off instead, or swap this one for something easier.`,
    }
  }

  const weeks = new Set(targetWeekNumbers(mesocycle, weekNumber, scope))
  let changed = false
  const next = mesocycle.map(w => {
    if (!weeks.has(w.week_number)) return w
    const d = w.days.find(x => x.day === dayName)
    // Positional, and NAME-CHECKED — a later week may have rotated this slot
    // to a different exercise, and removing whatever happens to sit at index 3
    // is not what anyone asked for.
    const slot = d?.exercises[exIndex]
    if (!d || !slot || slot.name !== target.name) return w
    if (d.exercises.length - 1 < MIN_EXERCISES_PER_SESSION) return w
    changed = true
    const trimmed = { ...d, exercises: d.exercises.filter((_, i) => i !== exIndex) }
    return settleWeek({ ...w, days: w.days.map(x => (x.day === dayName ? trimmed : x)) }, dayName, profile).week
  })
  return changed
    ? { mesocycle: next, changed: true }
    : { mesocycle, changed: false, refusal: "I couldn't find that exercise on that day." }
}

/**
 * WHERE A NEW EXERCISE GOES IN THE ORDER — generation's own sequence, not the
 * end of the list. Appending blindly would put a squat after the calf raises.
 */
const TIER_RANK: Record<ExerciseTier, number> = {
  tier_0_primer: 0,
  tier_1_primary: 1,
  tier_2_secondary: 2,
  tier_3_isolation: 3,
  tier_4_finisher: 4,
}

export interface AddExerciseParams {
  mesocycle: MesocycleWeek[]
  profile: UserProfile
  weekNumber: number
  dayName: string
  /**
   * The movement to add. RESOLVED AGAINST THE CONSTRAINED POOL BY THE CALLER,
   * never by a name typed here or by the model: `getConstrainedPool` is what
   * applies equipment, injuries and bans, and an addition that skipped it
   * would be the one path into the plan that those filters do not guard.
   */
  entry: ExerciseEntry
  /**
   * What to prescribe. Computed by the caller because `recomputeLoad` is async
   * (it reaches for the progression engine) and this file is not — the same
   * split the swap dialog already makes.
   *
   * NULL MEANS "NOT PRICED YET", and it is a real case rather than a lazy
   * default. The coach's proposal builders are synchronous by a decision
   * already recorded for swap (ChatAssistant: mirroring recomputeLoad's
   * composition to preview a number that confirm supersedes anyway would
   * duplicate real logic to be approximately wrong), so the coach's card is
   * built from an UNPRICED trial and `executeExerciseAdd` prices it for real
   * at confirm. The length and the balance cost the card states do not read
   * the weight, so both are exact either way.
   *
   * Explicitly null rather than a fabricated prescription: passing a made-up
   * one through `applyReplacement` is how a peer's weight ends up under a
   * different movement's name, which is the leak its primer guard and its
   * ramp_up clearing both exist to stop.
   */
  load: LoadPrescription | null
  scope: SwapScope
}

/**
 * What an unpriced slot says instead of a weight — the same sentence the
 * reset branch of `recomputeLoad` produces, so the card and the confirmed
 * plan do not tell two different stories about a lift with no history.
 */
const UNPRICED_BASIS = 'New lift — find your working weight this session, then let it ramp from here.'

/**
 * Put one exercise INTO a session, as part of the plan.
 *
 * The last missing operation in the exercise grain. Extra work could always be
 * LOGGED (AddUnplannedWork), which is a different thing: a logged extra never
 * counts towards the week's prescribed volume, the balance passes never see
 * it, and the coach cannot plan around it.
 *
 * WHERE THE NUMBERS COME FROM — a PEER, not an invention. Sets, reps and rest
 * are taken from the nearest exercise in the same day at the same tier, so the
 * addition looks like the session it is joining AND inherits numbers that have
 * already been through this week's progression, deload and duration passes.
 * `applyReplacement` does the carrying, which also buys the primer guard, the
 * prescription-unit rule, and the clearing of ramp blocks and selection notes
 * that belong to a different movement.
 *
 * ASHLEY'S RULING, 13 Sep 2026, on what this does to the clock: adding work
 * makes the session longer, and the app SAYS the new length rather than
 * trimming something else to pay for it. So nothing here touches any other
 * exercise. The caller states the cost before the tap.
 */
export function addExerciseToSession(params: AddExerciseParams): SessionEditResult {
  const { mesocycle, profile, weekNumber, dayName, entry, load, scope } = params
  const week = mesocycle.find(w => w.week_number === weekNumber)
  const day = week?.days.find(d => d.day === dayName)
  if (!week || !day) return { mesocycle, changed: false, refusal: "I couldn't find that day on your plan." }
  // A REST DAY IS NOT A SESSION TO ADD TO. Silently turning one into a
  // one-exercise workout would change what the week is without being asked.
  if (day.exercises.length === 0) {
    return { mesocycle, changed: false, refusal: `${dayName} is a rest day. Make it a training day first, then add to it.` }
  }
  if (day.exercises.some(e => e.name === entry.name)) {
    return { mesocycle, changed: false, refusal: `${entry.name} is already on ${dayName}.` }
  }

  const newTier = mapTier(entry.mechanics_tier)
  const weeks = new Set(targetWeekNumbers(mesocycle, weekNumber, scope))
  let changed = false
  const next = mesocycle.map(w => {
    if (!weeks.has(w.week_number)) return w
    const d = w.days.find(x => x.day === dayName)
    if (!d || d.exercises.length === 0) return w
    // A later week may have rotated its accessories; adding a duplicate there
    // is not what was asked for either.
    if (d.exercises.some(e => e.name === entry.name)) return w

    const template = peerTemplate(d.exercises, newTier)
    if (!template) return w
    const priced = load ?? {
      display: 'Find your working weight',
      starting_weight_kg: null,
      per_set: null,
      basis: UNPRICED_BASIS,
    } as unknown as LoadPrescription
    const slot: Exercise = {
      ...applyReplacement(template, entry, priced, profile.session_duration_preference),
      // THE PEER'S SUPERSET REST DOES NOT COME WITH IT. applyReplacement
      // clears `superset_label` but carries `rest`, and a peer that was half
      // of a pair carries `rest: 'alternate'` — which on a slot with no
      // partner is an instruction to alternate with nothing.
      // clearOrphanedSupersetLabels in the tail repairs orphaned LABELS and
      // would never see this one, because this slot has no label to orphan.
      ...(template.rest === 'alternate' ? { rest: fallbackRest(d.exercises) } : {}),
    }

    changed = true
    const exercises = insertByTier(d.exercises, slot, newTier)
    const grown = { ...d, exercises }
    return settleWeek({ ...w, days: w.days.map(x => (x.day === dayName ? grown : x)) }, dayName, profile).week
  })

  return changed
    ? { mesocycle: next, changed: true }
    : { mesocycle, changed: false, refusal: `I couldn't add ${entry.name} to ${dayName}.` }
}

/**
 * The programming a newly added exercise would inherit on this day — the peer
 * template's sets, reps and effort, read WITHOUT performing the edit.
 *
 * Exported because pricing the incoming lift is async (`recomputeLoad` reaches
 * the progression engine) and this module is not, so the caller has to price
 * it BEFORE calling `addExerciseToSession`. Both sides therefore have to agree
 * on which peer they are copying: if the caller guessed its own sets and reps,
 * the weight on the card could be computed for a set count the plan never
 * receives. One function, one answer.
 *
 * Returns null when there is no peer to copy — an empty day, which the add
 * itself refuses anyway.
 */
export function peerProgrammingFor(
  exercises: Exercise[],
  tier: ExerciseTier,
): { sets: number; reps: string; intensity: string } | null {
  const template = peerTemplate(exercises, tier)
  if (!template) return null
  return { sets: template.sets, reps: template.reps, intensity: template.intensity ?? 'RPE 7-8' }
}

/**
 * The exercise whose programming the new one should copy: same tier first,
 * then the nearest tier, and never a superset half if a plain slot exists —
 * a pair's numbers are chosen to alternate and read oddly on their own.
 */
function peerTemplate(exercises: Exercise[], tier: ExerciseTier): Exercise | null {
  const rank = TIER_RANK[tier]
  const plain = exercises.filter(e => !e.superset_label)
  const pool = plain.length > 0 ? plain : exercises
  const sameTier = pool.filter(e => e.tier === tier)
  if (sameTier.length > 0) return sameTier[sameTier.length - 1]
  // Nearest by tier distance, preferring the one BELOW (an accessory's numbers
  // under-prescribe a compound rather than over-prescribing it, which is the
  // safer way to be wrong about a movement nobody has done yet).
  return [...pool].sort((a, b) => {
    const da = Math.abs((a.tier ? TIER_RANK[a.tier] : 3) - rank)
    const db = Math.abs((b.tier ? TIER_RANK[b.tier] : 3) - rank)
    if (da !== db) return da - db
    return (b.tier ? TIER_RANK[b.tier] : 3) - (a.tier ? TIER_RANK[a.tier] : 3)
  })[0] ?? null
}

/** A plain rest for a slot that inherited a superset's 'alternate'. */
function fallbackRest(exercises: Exercise[]): string {
  const plain = exercises.find(e => e.rest && e.rest !== 'alternate')
  return plain?.rest ?? '90s'
}

/**
 * Insert in generation's tier order, and NEVER between the two halves of a
 * labelled superset — buildSupersetPairs goes out of its way to make them
 * adjacent and the scorer deducts for `superset_not_adjacent`, so landing in
 * the middle of one would break the thing the label means.
 */
function insertByTier(exercises: Exercise[], slot: Exercise, tier: ExerciseTier): Exercise[] {
  const rank = TIER_RANK[tier]
  let at = exercises.length
  for (let i = 0; i < exercises.length; i++) {
    const theirs = exercises[i].tier ? TIER_RANK[exercises[i].tier!] : 3
    if (theirs > rank) { at = i; break }
  }
  // Nudge forward off a superset seam.
  while (
    at > 0 && at < exercises.length
    && exercises[at - 1].superset_label
    && exercises[at - 1].superset_label === exercises[at].superset_label
  ) at++
  return [...exercises.slice(0, at), slot, ...exercises.slice(at)]
}

export interface MoveExerciseParams {
  mesocycle: MesocycleWeek[]
  profile: UserProfile
  weekNumber: number
  dayName: string
  fromIndex: number
  toIndex: number
  scope: SwapScope
}

/**
 * Move one exercise earlier or later in its session.
 *
 * SUPERSET PARTNERS MOVE TOGETHER. A superset's two halves must stay adjacent
 * — buildSupersetPairs goes out of its way to make them so
 * (exercise-plan.ts:1002-1018) and the scorer deducts for
 * `superset_not_adjacent`. Moving one half alone would break the thing the
 * label means, so the whole pair travels.
 *
 * Nothing here re-prices anything: order carries no load.
 */
export function moveExerciseInSession(params: MoveExerciseParams): SessionEditResult {
  const { mesocycle, profile, weekNumber, dayName, fromIndex, toIndex, scope } = params
  const week = mesocycle.find(w => w.week_number === weekNumber)
  const day = week?.days.find(d => d.day === dayName)
  const target = day?.exercises[fromIndex]
  if (!week || !day || !target) {
    return { mesocycle, changed: false, refusal: "I couldn't find that exercise on that day." }
  }
  if (toIndex < 0 || toIndex >= day.exercises.length) {
    return { mesocycle, changed: false, refusal: "That would put it outside the session." }
  }
  if (toIndex === fromIndex) {
    return { mesocycle, changed: false, refusal: `${target.name} is already there.` }
  }

  const weeks = new Set(targetWeekNumbers(mesocycle, weekNumber, scope))
  let changed = false
  const next = mesocycle.map(w => {
    if (!weeks.has(w.week_number)) return w
    const d = w.days.find(x => x.day === dayName)
    const slot = d?.exercises[fromIndex]
    if (!d || !slot || slot.name !== target.name) return w
    const reordered = reorderWithSupersets(d.exercises, fromIndex, toIndex)
    if (!reordered) return w
    changed = true
    // THE SHARED TAIL, 13 Sep 2026, replacing a warm-up-only rebuild.
    //
    // The old comment here argued the coherence passes had nothing to say
    // because no load or volume changed, and on its own terms that is right.
    // But the must-have list stated that moving re-ran them, no check would
    // have noticed either way, and "this particular edit happens not to need
    // three of the four" is a claim that has to stay true as both sides change.
    // The passes preserve order (enforceSetHierarchy is a map, not a sort) and
    // are no-ops on a week they have nothing to fix, so running them costs the
    // move nothing and makes one rule true of every edit instead of most.
    return settleWeek({ ...w, days: w.days.map(x => (x.day === dayName ? { ...d, exercises: reordered } : x)) }, dayName, profile).week
  })
  return changed
    ? { mesocycle: next, changed: true }
    : { mesocycle, changed: false, refusal: "I couldn't move that one." }
}

/**
 * The array move, with a superset's members travelling as one block. Returns
 * null when the move would change nothing.
 */
export function reorderWithSupersets(exercises: Exercise[], fromIndex: number, toIndex: number): Exercise[] | null {
  const target = exercises[fromIndex]
  if (!target) return null
  const letter = target.superset_label?.[0]
  const blockIdx = letter
    ? exercises.map((ex, i) => (ex.superset_label?.[0] === letter ? i : -1)).filter(i => i >= 0)
    : [fromIndex]
  const blockSet = new Set(blockIdx)
  const block = blockIdx.map(i => exercises[i])
  const rest = exercises.filter((_, i) => !blockSet.has(i))
  const restIdx = exercises.map((_, i) => i).filter(i => !blockSet.has(i))
  // Where the block lands among what remains. `toIndex` is a position in the
  // ORIGINAL list, so it is translated by counting how many of the survivors
  // belong in front of it. Moving DOWN, the destination slot is one the block
  // vacates on its way past, so the exercise now sitting AT toIndex stays in
  // front (<=); moving UP it does not (<). Getting this backwards lands a
  // downward move one short — the off-by-one the gate caught.
  const down = toIndex > fromIndex
  const at = restIdx.filter(i => (down ? i <= toIndex : i < toIndex)).length
  const next = [...rest.slice(0, at), ...block, ...rest.slice(at)]
  if (next.every((ex, i) => ex === exercises[i])) return null
  return next
}

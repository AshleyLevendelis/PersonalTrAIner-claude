import type { MesocycleWeek, Exercise, UserProfile } from './types'
import { getSmartReplacements, type ExerciseEntry } from './exercise-db'
import { getConstrainedPool, mapMovementPattern, mapTier, deriveFatigueCost } from './exercise-plan'
import { prescribeLoad, type LoadPrescription } from './load-prescription'
// Dynamically imported inside recomputeLoad(), not statically here — importing
// progression-engine.ts pulls in supabase.ts, which reads import.meta.env at
// module-evaluation time. That's fine in the real (Vite) app, but it means
// any plain-Node/tsx script touching this module (audits, verification
// scripts with no Supabase env) would crash on import alone, even when the
// history lookup is never actually reached (e.g. no profile.id).

// ---------------------------------------------------------------------------
// Rebuilt swap/ban (Part 7)
// ---------------------------------------------------------------------------
// The old implementation mutated `exercisePlan` while the UI renders from
// `mesocycle` — swap/ban had no visible effect at all in the normal case.
// Candidates came from the raw EXERCISE_DATABASE (no equipment/injury/skill
// filtering), and the substitute inherited the outgoing exercise's load
// wholesale instead of getting a fresh prescription. This module is the
// single source of truth for both operations, targeting `mesocycle`
// directly; App.tsx persists the returned array via
// saveMesocycleWeek/saveMesocycle (src/lib/mesocycle-persistence.ts).

export type SwapScope = 'today' | 'permanent'

/** Constraint-filtered, ranked candidates for swapping OUT `exerciseName` — the same pool equipment/injury/style/skill filtering that generation itself uses. */
export function getReplacementCandidates(
  exerciseName: string,
  profile: UserProfile,
  exclusions: string[],
): { exercise: ExerciseEntry; note: string }[] {
  const pool = getConstrainedPool(profile, exclusions)
  return getSmartReplacements(exerciseName, pool, profile.training_experience || 'novice', exclusions, profile)
}

function parseRepsHigh(reps: string): number | null {
  const range = reps.match(/(\d+)\s*-\s*(\d+)/)
  if (range) return parseInt(range[2], 10)
  const single = reps.match(/^(\d+)/)
  return single ? parseInt(single[1], 10) : null
}

/**
 * Fresh load for a swapped-in exercise — never a carry-over of the outgoing
 * exercise's kg/intensity/per-set fields.
 *
 * - Main-lift resets (a new main lift, first week it's touched) get a
 *   conservative first-prescription (isFirstBlock, no logged-history lookup)
 *   with an explicit "new lift" note — the whole point of resetting a main
 *   lift's baseline is to stop trusting a number that belonged to a
 *   different movement.
 * - Everything else prefers logged history on the new exercise itself
 *   (rare immediately after a swap, but real once the trainee has logged a
 *   session on it — e.g. after a previous swap of the same slot) via
 *   getDoubleProgressionRecommendation, falling back to the normal
 *   bodyweight/known-weight estimate when no history exists.
 */
export async function recomputeLoad(
  entry: ExerciseEntry,
  profile: UserProfile,
  intensity: string,
  sets: number,
  reps: string,
  isMainLiftReset: boolean,
): Promise<LoadPrescription> {
  if (isMainLiftReset) {
    const load = prescribeLoad(entry, profile, {
      targetRpeLabel: intensity, isFirstBlock: true, sets, repRangeLabel: reps,
    })
    return { ...load, basis: `New lift — find your working weight this session, then let it ramp from here. ${load.basis}` }
  }

  const repHigh = parseRepsHigh(reps)
  let recommendation = null as Awaited<ReturnType<typeof import('./progression-engine').getDoubleProgressionRecommendation>>
  if (profile.id && repHigh != null) {
    const { getDoubleProgressionRecommendation } = await import('./progression-engine')
    recommendation = await getDoubleProgressionRecommendation(profile.id, entry.name, new Date().toISOString().split('T')[0], repHigh)
  }

  return prescribeLoad(entry, profile, {
    targetRpeLabel: intensity,
    isFirstBlock: false,
    sets,
    repRangeLabel: reps,
    forceStartingWeightKg: recommendation?.weightKg,
  })
}

/** Rebuilds an Exercise slot around a NEW movement — every load/tier/pattern field recomputed, programming (sets/reps/rest) carried over from the slot being replaced. */
export function applyReplacement(slot: Exercise, entry: ExerciseEntry, load: LoadPrescription): Exercise {
  return {
    ...slot,
    id: entry.id,
    name: entry.name,
    substitution: '',
    superset_label: undefined,
    suggested_load: load.display,
    suggested_load_kg: load.starting_weight_kg,
    per_set_load: load.per_set,
    load_guidance: load.basis,
    movement_pattern: mapMovementPattern(entry.movement_pattern),
    tier: mapTier(entry.mechanics_tier),
    fatigue_cost: deriveFatigueCost(entry),
  }
}

/** A superset pair with one side removed/changed is no longer a pair — clears the label on whichever side is now alone rather than leaving it pointing at a partner that no longer matches. */
export function clearOrphanedSupersetLabels(exercises: Exercise[]): Exercise[] {
  const letterCounts = new Map<string, number>()
  for (const ex of exercises) {
    if (!ex.superset_label) continue
    const letter = ex.superset_label[0]
    letterCounts.set(letter, (letterCounts.get(letter) ?? 0) + 1)
  }
  return exercises.map(ex => {
    if (!ex.superset_label) return ex
    const letter = ex.superset_label[0]
    if ((letterCounts.get(letter) ?? 0) < 2) return { ...ex, superset_label: undefined, rest: ex.rest === 'alternate' ? '60s' : ex.rest }
    return ex
  })
}

export function isMainLiftSlot(ex: Exercise | undefined): boolean {
  return ex?.tier === 'tier_1_primary'
}

export interface SwapExerciseParams {
  mesocycle: MesocycleWeek[]
  profile: UserProfile
  currentWeekNumber: number
  dayName: string
  exIndex: number
  newExercise: ExerciseEntry
  scope: SwapScope
}

/**
 * 'today': patches this one (week, day, slot) only — every other week,
 * including this same day next week, is untouched, so the swap reverts on
 * its own and the original lift's progression baseline (tracked at
 * generation time, independent of this edit) just continues from wherever
 * it last logged.
 *
 * 'permanent': patches the same slot across every remaining week of the
 * CURRENT BLOCK (this week onward, same block_number) — future blocks
 * rotate normally from the original base plan, untouched. Each touched
 * week gets its own fresh, independently recomputed load rather than an
 * attempt to replay the block's baseline+increment ramp retroactively —
 * still real numbers, still never a carry-over from the outgoing exercise,
 * just not a perfect reconstruction of Part 1's ramp for an ad-hoc mid-block
 * edit.
 */
export async function swapExerciseInMesocycle(params: SwapExerciseParams): Promise<MesocycleWeek[]> {
  const { mesocycle, profile, currentWeekNumber, dayName, exIndex, newExercise, scope } = params
  const currentWeek = mesocycle.find(w => w.week_number === currentWeekNumber)
  const currentDay = currentWeek?.days.find(d => d.day === dayName)
  const oldSlot = currentDay?.exercises[exIndex]
  if (!currentWeek || !oldSlot) return mesocycle

  const isMainLift = isMainLiftSlot(oldSlot)
  const targetWeekNumbers = new Set(
    scope === 'today'
      ? [currentWeekNumber]
      : mesocycle
          .filter(w => w.block_number === currentWeek.block_number && w.week_number >= currentWeekNumber)
          .map(w => w.week_number)
  )

  return Promise.all(mesocycle.map(async week => {
    if (!targetWeekNumbers.has(week.week_number)) return week
    const day = week.days.find(d => d.day === dayName)
    const slot = day?.exercises[exIndex]
    if (!day || !slot) return week

    const load = await recomputeLoad(newExercise, profile, slot.intensity || '', slot.sets, slot.reps, isMainLift)
    const replaced = applyReplacement(slot, newExercise, load)
    const exercises = clearOrphanedSupersetLabels(
      day.exercises.map((e, i) => (i === exIndex ? replaced : e))
    )
    const days = week.days.map(d => (d.day === dayName ? { ...d, exercises } : d))
    return { ...week, days }
  }))
}

export interface BanExerciseParams {
  mesocycle: MesocycleWeek[]
  profile: UserProfile
  bannedName: string
  /** Must already include bannedName — used to keep the replacement pick from re-suggesting anything else the trainee has banned. */
  exclusions: string[]
}

/**
 * Removes `bannedName` everywhere it appears in the persisted mesocycle —
 * every week, every block, not just the current one, since a ban means
 * "never again," not "not for the rest of this block." Each occurrence gets
 * a live constraint-filtered replacement (same pool/ranking as a manual
 * swap, auto-picking the top candidate) with a fresh load. If no valid
 * substitute exists in the pool for that day, the slot is dropped rather
 * than keeping the banned exercise around.
 */
export async function banExerciseFromMesocycle(params: BanExerciseParams): Promise<MesocycleWeek[]> {
  const { mesocycle, profile, bannedName, exclusions } = params
  const lowerBanned = bannedName.toLowerCase()

  return Promise.all(mesocycle.map(async week => {
    const days = await Promise.all(week.days.map(async day => {
      const idx = day.exercises.findIndex(e => e.name.toLowerCase() === lowerBanned)
      if (idx === -1) return day

      const oldSlot = day.exercises[idx]
      const alreadyUsedInDay = new Set(day.exercises.filter((_, i) => i !== idx).map(e => e.name))
      const candidates = getReplacementCandidates(bannedName, profile, exclusions)
        .filter(c => !alreadyUsedInDay.has(c.exercise.name))

      if (candidates.length === 0) {
        return { ...day, exercises: clearOrphanedSupersetLabels(day.exercises.filter((_, i) => i !== idx)) }
      }

      const replacement = candidates[0].exercise
      const load = await recomputeLoad(replacement, profile, oldSlot.intensity || '', oldSlot.sets, oldSlot.reps, isMainLiftSlot(oldSlot))
      const replaced = applyReplacement(oldSlot, replacement, load)
      const exercises = clearOrphanedSupersetLabels(
        day.exercises.map((e, i) => (i === idx ? replaced : e))
      )
      return { ...day, exercises }
    }))
    return { ...week, days }
  }))
}

/** True if the banned name is truly gone from every week — used by the audit and as a sanity check after a ban completes. */
export function containsExerciseName(mesocycle: MesocycleWeek[], name: string): boolean {
  const lower = name.toLowerCase()
  return mesocycle.some(w => w.days.some(d => d.exercises.some(e => e.name.toLowerCase() === lower)))
}

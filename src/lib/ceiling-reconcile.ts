// ---------------------------------------------------------------------------
// Bring an existing plan back under a ceiling the trainee already stated.
//
// WHY A PLAN CAN BE OVER ITS OWN CEILING AT ALL. App.tsx's restoreSession
// rebuilt the profile column by column and never named max_dumbbell_kg,
// max_single_implement_kg or max_improvised_kg — so a stated ceiling was
// written to Postgres correctly and read back as undefined on every reload.
// Every plan generated after someone answered "my dumbbells go to 24kg" was
// generated as though they never had.
//
// Restoring those columns fixes the NEXT plan. It does nothing for the
// sixteen weeks someone is already in the middle of, which is why this
// exists — Ashley's ruling when the choice was put to her: "rebuild the plan
// against it", over waiting for the next generation (a trainee keeps getting
// weights they cannot load for up to sixteen weeks) and over a confirm card
// (nothing moves without a yes, but it is another card on open).
//
// DETECTED BY THE VIOLATION, NOT BY A MARKER. There is no flag saying "this
// plan was built while the ceiling was invisible", and adding one would only
// be true going forward. What is checkable is the thing that actually
// matters: is any prescribed load above what this person said they own. That
// is self-correcting — it fires exactly when there is something to fix, and
// stays quiet once there isn't, so it is safe to run on every load.
//
// No new rebuild path. rebuildAgainstProfile already takes the profile, and
// the profile now carries the ceiling, so the ceiling applies simply by
// rebuilding — the same route rebuildForWeightBasis takes for a weight that
// became known late.
// ---------------------------------------------------------------------------

import { statedCeilingKg } from './load-prescription'
import { getExerciseEntry } from './exercise-db'
import { rebuildAgainstProfile } from './plan-adaptations'
import { saveMesocycleWeek } from './mesocycle-persistence'
import type { MesocycleWeek, UserProfile } from './types'

export interface CeilingViolation {
  weekNumber: number
  day: string
  exercise: string
  prescribedKg: number
  ceilingKg: number
}

export interface CeilingReconcileResult {
  mesocycle?: MesocycleWeek[]
  messages: string[]
  violations: CeilingViolation[]
}

/**
 * Every prescribed load above what this trainee said they can actually load.
 *
 * Exported for the gate and for the message — the count is what tells someone
 * this was worth doing, and a rebuild that reports "3 lifts" when it changed
 * 30 would be its own small lie.
 */
export function findCeilingViolations(
  mesocycle: MesocycleWeek[],
  profile: UserProfile,
  fromWeek: number,
): CeilingViolation[] {
  const out: CeilingViolation[] = []
  for (const week of mesocycle) {
    // Past weeks are history. Rewriting a load someone already trained
    // against would change what their own logs are measured against.
    if (week.week_number < fromWeek) continue
    for (const day of week.days) {
      for (const ex of day.exercises ?? []) {
        if (ex.suggested_load_kg == null) continue
        const entry = getExerciseEntry(ex.name)
        if (!entry) continue
        const ceiling = statedCeilingKg(entry, profile)
        if (ceiling == null || ex.suggested_load_kg <= ceiling) continue
        out.push({
          weekNumber: week.week_number,
          day: day.day,
          exercise: ex.name,
          prescribedKg: ex.suggested_load_kg,
          ceilingKg: ceiling,
        })
      }
    }
  }
  return out
}

/**
 * Check-on-load sweep, same convention as block-consistency's
 * checkForConsistencyHold: returns the patched weeks and a message for the
 * dashboard's adaptation banner, and persists what it changed.
 *
 * Idempotent by construction — after a rebuild there are no violations left,
 * so the next load finds nothing and says nothing.
 */
export async function reconcileToStatedCeilings(
  profileId: string,
  mesocycle: MesocycleWeek[],
  profile: UserProfile,
  exclusions: string[],
  currentWeek: number,
): Promise<CeilingReconcileResult> {
  const violations = findCeilingViolations(mesocycle, profile, currentWeek)
  if (violations.length === 0) return { messages: [], violations: [] }

  const weekNumbers = [...new Set(violations.map(v => v.weekNumber))].sort((a, b) => a - b)
  // Seeded on the ceilings themselves, so the same plan and the same stated
  // numbers always produce the same rebuild — the convention
  // rebuildForWeightBasis follows and for the same reason.
  const seedKey = `stated-ceiling:${profileId}:${profile.max_dumbbell_kg ?? '-'}:${profile.max_single_implement_kg ?? '-'}:${profile.max_improvised_kg ?? '-'}`
  const rebuilt = await rebuildAgainstProfile(profile, exclusions, mesocycle, weekNumbers, seedKey)

  const touched = rebuilt.filter(w => weekNumbers.includes(w.week_number))
  await Promise.all(touched.map(w => saveMesocycleWeek(profileId, w)))

  // SAY WHY. Weights changing on open with no explanation is the app moving
  // numbers under someone. Names the trainee's own number back to them, so it
  // reads as the app finally listening rather than deciding something.
  const lifts = new Set(violations.map(v => v.exercise))
  const liftWord = lifts.size === 1 ? [...lifts][0] : `${lifts.size} lifts`
  const heaviest = Math.max(...violations.map(v => v.ceilingKg))
  const messages = [
    `You told me your heaviest is ${heaviest}kg, and your plan had ${liftWord} above that — I've brought ${violations.length === 1 ? 'it' : 'them'} back down to what you've actually got.`,
  ]

  return { mesocycle: rebuilt, messages, violations }
}

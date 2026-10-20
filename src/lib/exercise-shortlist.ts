// ---------------------------------------------------------------------------
// REAL EXERCISE NAMES THAT FIT THIS PERSON, FOR THE COACH (live test, 19 Oct 2026).
//
// The coach has no catalogue. Asked about a missing press it offered "Seated Dumbbell Overhead Press", a name the app
// does not have, on a bench the person does not own, and the swap failed. This is the list it now gets: the pool
// their plan and every swap are built from (kit, injuries, running ease-offs, avoid list, skill, style), grouped by
// movement, a few names each, so a name it suggests is one the app can act on and one their kit allows.
// ---------------------------------------------------------------------------
import { getConstrainedPool } from './exercise-plan'
import type { UserProfile } from './types'

/** How many names per movement: enough to choose from, few enough to keep the prompt short. */
const NAMES_PER_MOVEMENT = 6

/** The movement, as a person would say it. A pattern with no word here is said with its underscores as spaces. */
const MOVEMENT_WORDS: Record<string, string> = {
  vertical_push: 'overhead press', horizontal_push: 'chest press', vertical_pull: 'pull-down / pull-up',
  horizontal_pull: 'row', knee_dominant: 'squat', hip_hinge: 'hinge', single_leg: 'single-leg', lunge: 'lunge',
  core: 'core', carry: 'carry', cardio: 'cardio',
  isolation_shoulder: 'shoulder raise', isolation_bicep: 'biceps', isolation_tricep: 'triceps', isolation_chest: 'chest fly',
  isolation_quad: 'quads', isolation_hamstring: 'hamstrings', isolation_calf: 'calves', isolation_glute: 'glutes',
  isolation_trap: 'traps', isolation_rear_delt: 'rear delts',
}

/** "overhead press: Dumbbell Shoulder Press, Arnold Press; row: ..." — one line per movement the pool can fill. */
export function exercisesThatFit(profile: UserProfile, exclusions: string[] = []): string {
  const byMovement = new Map<string, string[]>()
  for (const e of getConstrainedPool(profile, exclusions)) {
    if (e.mechanics_tier === 'primer' || e.retired) continue
    const list = byMovement.get(e.movement_pattern) ?? []
    if (list.length < NAMES_PER_MOVEMENT) list.push(e.name)
    byMovement.set(e.movement_pattern, list)
  }
  return [...byMovement.entries()]
    .map(([pattern, names]) => `${MOVEMENT_WORDS[pattern] ?? pattern.replace(/_/g, ' ')}: ${names.join(', ')}`)
    .join('; ')
}

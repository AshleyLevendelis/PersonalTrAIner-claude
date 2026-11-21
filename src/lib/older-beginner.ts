// ---------------------------------------------------------------------------
// BEGINNERS FROM 60 (his request 21 Nov 2026, "fix those five issues for
// beginners over 60. tighten the beginner and 60+ selection rules").
//
// A 60-year-old woman who had never trained was handed barbell back squats and
// a trap-bar deadlift on day one, pull-up negatives, a landmine press at an
// empty Olympic bar (about 20 kg) beside a 4 kg dumbbell press, a session
// called "Full Body Power", and no balance work. Each pick was legal under the
// beginner rules; together they were not a plan a coach would sign for her.
//
// The CSCS basis (decided under his 18 Sep 2026 delegation, recorded in
// BACKLOG): an older adult new to training starts on implements whose load can
// begin near zero and rise in small steps (dumbbells, kettlebells, cables,
// machines, bands), learns the squat, hinge and press patterns there, and
// meets the barbell later, once there is a technique base. Hanging work
// (pull-up bar, assisted pull-up machine, dip bars) asks for grip, shoulder
// and full-bodyweight control she has not built; a lat pulldown trains the
// same pattern from a seat and starts as light as she needs. Jumping is left
// out until she has trained a while (ACSM older-adult guidance puts impact
// last). Balance training is part of every older-adult guideline (ACSM, WHO
// 2020: "multicomponent" activity from 65, earlier for the deconditioned), and
// a 60-year-old beginner is the deconditioned case.
//
// What this does NOT do, on his 13 Nov 2026 ruling "age only adds safeguards
// and never downgrades": nothing here makes a set lighter, a session shorter
// or a plan easier. It changes WHICH exercises she is given, never how much of
// them, and once she is no longer a beginner every rule here lifts.
// ---------------------------------------------------------------------------
import type { UserProfile } from './types'
import type { ExerciseEntry } from './exercise-db'
import { getSkillDemand } from './experience-config'
import { loadingMode } from './load-prescription'
import { PREGNANCY_IMPACT } from './pregnancy-rules'

export const OLDER_BEGINNER_FROM_AGE = 60

/** A beginner aged 60 or over. No age held means no rule: nothing is assumed. */
export function isOlderBeginner(profile: Pick<UserProfile, 'age' | 'training_experience'>): boolean {
  const age = profile.age
  return typeof age === 'number' && Number.isFinite(age) && age >= OLDER_BEGINNER_FROM_AGE
    && profile.training_experience === 'beginner'
}

/**
 * Lifts the general skill table rates 'low' that still ask too much of an older beginner: a single-leg hinge is a
 * balance test under load, and a reverse hyper swings the legs through spinal extension on a machine that needs
 * teaching. The kettlebell deadlift teaches the same hinge from two feet.
 */
const OLDER_BEGINNER_TECHNIQUE = /single-leg[^,]*\b(rdl|romanian)|reverse hyper/i

/** Kit you hang from or support your whole body on. */
const HANGING_KIT = new Set(['pull-up bar', 'assisted pull-up machine', 'dip bars'])

export type OlderBeginnerReason = 'technique' | 'barbell' | 'hanging' | 'impact'

/**
 * Why this exercise is left out of an older beginner's plan, or null when it is fine.
 * - technique: anything the skill table rates above 'low' (Romanian deadlifts, walking lunges, swings...)
 * - barbell: an Olympic bar, trap bar, t-bar, landmine or Smith bar, which cannot start below the bar
 * - hanging: pull-up bar, assisted pull-up machine, dip bars
 * - impact: a jumping move (the same list the pregnancy rule keeps out)
 */
export function olderBeginnerExclusion(ex: ExerciseEntry): OlderBeginnerReason | null {
  if (PREGNANCY_IMPACT.has(ex.name) || (ex.parent && PREGNANCY_IMPACT.has(ex.parent))) return 'impact'
  if (ex.equipment.some(e => HANGING_KIT.has(e))) return 'hanging'
  if (loadingMode(ex) === 'barbell') return 'barbell'
  if (OLDER_BEGINNER_TECHNIQUE.test(ex.name)) return 'technique'
  if (getSkillDemand(ex.name) !== 'low' || (ex.parent && getSkillDemand(ex.parent) !== 'low')) return 'technique'
  return null
}

/** The words the plan's trace and the swap search use for each reason. */
export const OLDER_BEGINNER_REASON_TEXT: Record<OlderBeginnerReason, string> = {
  technique: 'a technique lift, introduced once you have a training base',
  barbell: 'a barbell lift, which cannot start lighter than the bar; dumbbells and machines first',
  hanging: 'hanging or full-bodyweight support work; a seated pulldown trains the same muscles',
  impact: 'a jumping move, added once you have trained a while',
}

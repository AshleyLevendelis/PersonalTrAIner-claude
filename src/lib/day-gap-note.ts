// ---------------------------------------------------------------------------
// THE NOTE UNDER A DAY THAT IS MISSING WHAT ITS NAME PROMISES.
//
// DERIVED WHEN THE DAY IS SHOWN, from the day as it is and the profile as it
// is. It used to be stamped once at generation ("Set once on the base plan and
// carried through periodized weeks unchanged") and so went on saying "your
// current equipment and injury settings leave nothing eligible for an overhead
// press today — not a bug, just a real gap in what's available" after the flag
// was removed, after an adaptation changed the exercises it listed, and with a
// pointer to Profile for a change Profile could not make (test log H4, H5).
//
// THE WORDS ARE THE APP'S VOICE AND ARE ASHLEY'S TO CHANGE. This is the
// default her plan's question 2 recommends (B, and C where the day has a new
// name), built unprompted on 9 Oct 2026 and reversible by editing this file:
//
//   "No overhead pressing while your shoulder's flagged, so today is upper
//    back and abs."
//
// and NOTHING once the day carries a different name — the name is the
// explanation. Never "not a bug". Never a pointer to a setting.
//
// What it will not do: say more than it knows. It names a flag only when the
// profile holds one that could explain the gap, and it describes the day from
// the exercises actually on it.
// ---------------------------------------------------------------------------

import { EXERCISE_DATABASE, getExerciseEntry, isContraindicatedFor, type ExerciseEntry } from './exercise-db'
import { getFlaggedJoints, getConstrainedPool } from './exercise-plan'
import type { UserProfile, WorkoutDay } from './types'

/**
 * The flags that can take an overhead press away, in the order one is named
 * when somebody has several, and the word the sentence uses for each. Which
 * of them actually DOES is asked of the catalogue (below), not listed here.
 */
const FLAG_WORDS: [injury: string, word: string][] = [
  ['shoulders', 'shoulder'],
  ['wrists', 'wrist'],
  ['elbows', 'elbow'],
  ['neck', 'neck'],
  ['lower_back', 'lower back'],
]

/** The first of this person's flags that rules an overhead press out: the code, and the word the sentence uses. */
function flagBehindTheGap(injuries: readonly string[]): { injury: string; word: string } | null {
  for (const [injury, word] of FLAG_WORDS) {
    if (!injuries.includes(injury)) continue
    const joints = getFlaggedJoints([injury])
    const removesAPress = EXERCISE_DATABASE.some(e =>
      !e.retired && e.movement_pattern === 'vertical_push' && isContraindicatedFor(e, joints))
    if (removesAPress) return { injury, word }
  }
  return null
}

/**
 * Does any overhead press fit this person TODAY: their kit, their injuries, their running ease-offs, their style?
 * Asked of the same pool every plan and swap is built from. null when the profile is too partial to ask (no kit known):
 * the kit sentence is then never said, because it would be a claim nobody checked.
 */
function pressFits(profile: Partial<UserProfile>): boolean | null {
  if (!profile.equipment_access) return null
  return getConstrainedPool(profile as UserProfile).some(e => e.movement_pattern === 'vertical_push' && e.mechanics_tier !== 'primer')
}

function join(parts: string[]): string {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

const LEG_PATTERNS = new Set(['knee_dominant', 'hip_hinge', 'single_leg', 'lunge', 'isolation_quad', 'isolation_hamstring', 'isolation_calf', 'isolation_glute'])

/** What the day trains, in the order a person would say it. Read off the exercises, never off the label. */
function whatTheDayIs(entries: ExerciseEntry[]): string {
  const has = (test: (e: ExerciseEntry) => boolean) => entries.some(test)
  const parts: string[] = []
  const upperBack = has(e => e.movement_pattern === 'horizontal_pull' || e.movement_pattern === 'vertical_pull' || e.movement_pattern === 'isolation_trap')
  if (upperBack) parts.push('upper back')
  if (has(e => e.movement_pattern === 'isolation_shoulder')) parts.push('shoulders')
  if (has(e => e.movement_pattern === 'isolation_bicep')) parts.push('arms')
  // LEGS ARE LEGS (live test, 19 Oct 2026): "so today is abs" was printed over a Spanish squat, a heavy swing and a
  // step-up, because no branch knew a leg movement.
  if (has(e => LEG_PATTERNS.has(e.movement_pattern))) parts.push('legs')
  if (has(e => e.movement_pattern === 'core')) parts.push('abs')
  return join(parts)
}

/**
 * The sentence for a day, or null when there is nothing to say.
 *
 * Today it speaks for one case, the one the old note fired on in practice: a
 * "Shoulders & Abs" day with no overhead press on it. A day that has been
 * renamed says nothing; a day that holds its press says nothing.
 */
export function describeDayGap(
  day: WorkoutDay,
  /**
   * The profile the person's exercises are chosen from TODAY: the saved one with any running ease-off or kit change
   * laid over it (the pool profile). Its injuries say which flags are in force; its kit says whether a press fits.
   */
  profile: Pick<UserProfile, 'injuries'> & Partial<UserProfile>,
  /**
   * The injuries saved on the profile, lasting ones only. A flag in force that is NOT among them is a running
   * ease-off, and is said as one. Omitted: every flag in force is treated as lasting (the sentence before 20 Oct).
   */
  lastingInjuries?: readonly string[],
): string | null {
  if (day.focus !== 'Shoulders & Abs' || day.exercises.length === 0) return null
  const entries = day.exercises
    .map(ex => getExerciseEntry(ex.name))
    .filter((e): e is ExerciseEntry => !!e && e.mechanics_tier !== 'primer')
  if (entries.some(e => e.movement_pattern === 'vertical_push')) return null

  const instead = whatTheDayIs(entries)
  if (!instead) return null

  // THE CAUSE, TOLD TRUE (live test, 19 Oct 2026). This said "fits your kit" for every cause that was not a lasting
  // flag on the profile, and never looked at the kit: a plan made while a shoulder was flagged, with the flag since
  // removed, read "No overhead press fits your kit" while five presses fitted it.
  const flag = flagBehindTheGap(profile.injuries ?? [])
  if (flag) {
    const easing = lastingInjuries !== undefined && !lastingInjuries.includes(flag.injury)
    return easing
      ? `No overhead pressing while you're easing off your ${flag.word}, so today is ${instead}.`
      : `No overhead pressing while your ${flag.word}'s flagged, so today is ${instead}.`
  }
  const fits = pressFits(profile)
  if (fits === false) return `No overhead press fits your kit, so today is ${instead}.`
  if (fits === true) return `Today's plan has no overhead press, though one fits your kit now, so today is ${instead}.`
  return `No overhead press on today's plan, so today is ${instead}.`
}

/**
 * True when today's note is the "one fits your kit now" case: the screen offers to add one right there. Asked of the
 * same function the sentence comes from, so the button can never appear beside a different sentence.
 */
export function dayGapCanAddPress(day: WorkoutDay, profile: Pick<UserProfile, 'injuries'> & Partial<UserProfile>, lastingInjuries?: readonly string[]): boolean {
  return /one fits your kit now/.test(describeDayGap(day, profile, lastingInjuries) ?? '')
}

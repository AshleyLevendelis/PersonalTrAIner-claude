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
import { getFlaggedJoints } from './exercise-plan'
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

/** The first of this person's flags that rules an overhead press out, as the sentence says it. */
function flagBehindTheGap(injuries: readonly string[]): string | null {
  for (const [injury, word] of FLAG_WORDS) {
    if (!injuries.includes(injury)) continue
    const joints = getFlaggedJoints([injury])
    const removesAPress = EXERCISE_DATABASE.some(e =>
      !e.retired && e.movement_pattern === 'vertical_push' && isContraindicatedFor(e, joints))
    if (removesAPress) return word
  }
  return null
}

function join(parts: string[]): string {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/** What the day trains, in the order a person would say it. Read off the exercises, never off the label. */
function whatTheDayIs(entries: ExerciseEntry[]): string {
  const has = (test: (e: ExerciseEntry) => boolean) => entries.some(test)
  const parts: string[] = []
  const upperBack = has(e => e.movement_pattern === 'horizontal_pull' || e.movement_pattern === 'vertical_pull' || e.movement_pattern === 'isolation_trap')
  if (upperBack) parts.push('upper back')
  if (has(e => e.movement_pattern === 'isolation_shoulder')) parts.push('shoulders')
  if (has(e => e.movement_pattern === 'isolation_bicep')) parts.push('arms')
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
export function describeDayGap(day: WorkoutDay, profile: Pick<UserProfile, 'injuries'>): string | null {
  if (day.focus !== 'Shoulders & Abs' || day.exercises.length === 0) return null
  const entries = day.exercises
    .map(ex => getExerciseEntry(ex.name))
    .filter((e): e is ExerciseEntry => !!e && e.mechanics_tier !== 'primer')
  if (entries.some(e => e.movement_pattern === 'vertical_push')) return null

  const instead = whatTheDayIs(entries)
  if (!instead) return null

  const flag = flagBehindTheGap(profile.injuries ?? [])
  return flag
    ? `No overhead pressing while your ${flag}'s flagged, so today is ${instead}.`
    : `No overhead press fits your kit, so today is ${instead}.`
}

// ---------------------------------------------------------------------------
// A SWAP FOR SOMETHING OF ANOTHER KIND, SAID, THEN ALLOWED (advise-then-allow fix 17, 28 Nov 2026).
//
// His ruling: "users can add or remove or change ... single exercises, whatever they want, and we just guide them and
// tell them the whys". The coach had been told a replacement MUST be the same movement pattern, so "swap the lunges
// for goblet squats" could be argued with or refused. Now a replacement HE names, of another pattern, goes on the card
// with one sentence of why it matters, and the choice is his. When the app chose the replacement (he named nothing),
// no such sentence: he did not choose it.
//
// CSCS, mine: the session's patterns are how the week covers push, pull, hinge, squat and single-leg work. A swap
// across patterns keeps the session's effort and moves which movement it trains, so the honest cost is that one
// movement; a like-for-like swap keeps it. Into or out of the warm-up or conditioning, the session does a different
// job there, and the sentence says that instead. Nothing here changes a set, a rep or a load.
//
// THE HARD STOPS (his, 28 Nov 2026) that a swap can meet: a move his injuries (or a running ease-off) rule out, the
// pregnancy rules, from 28 weeks too, and his never-again list. Pain red flags are triaged before any swap; the load
// ceilings bind the weight, never the choice. swapHardStop reads the ENTRY, so a machine version (outside the
// catalogue the add lookup searches) is judged with the contraindications it carries, and a version answers as its
// parent for the pregnancy lists and the never-again list.
// ---------------------------------------------------------------------------
import { INJURED_JOINTS, isContraindicatedFor, contraindicatedJoints, type ExerciseEntry, type MovementPattern } from './exercise-db'
import { getExerciseEntry } from './exercise-db'
import { getExerciseCompatibilityWarnings } from './exercise-plan'
import { isPregnant, lateInPregnancy } from './health-conditions'
import { pregnancyExclusion, PREGNANCY_LATE_EXCLUDED } from './pregnancy-rules'
import type { UserProfile } from './types'

const WORDS: Record<MovementPattern, string> = {
  horizontal_push: 'a horizontal press', horizontal_pull: 'a row', vertical_push: 'an overhead press',
  vertical_pull: 'a pull-up or pulldown', hip_hinge: 'a hip hinge', knee_dominant: 'a squat',
  single_leg: 'a lunge or split squat', carry: 'a loaded carry', isolation_bicep: 'biceps work',
  isolation_tricep: 'triceps work', isolation_shoulder: 'shoulder work', isolation_trap: 'trap work',
  isolation_quad: 'quad work', isolation_hamstring: 'hamstring work', isolation_calf: 'calf work',
  cardio: 'conditioning', core: 'core work', activation: 'a warm-up move',
}
const NOT_STRENGTH = new Set<MovementPattern>(['activation', 'cardio'])

/**
 * One sentence when the replacement trains a different movement pattern, else null. `day` is how the card names the
 * session ("Tuesday", "today").
 */
export function swapPatternAdvice(oldName: string, newName: string, day: string): string | null {
  const before = getExerciseEntry(oldName)
  const after = getExerciseEntry(newName)
  if (!before || !after || before.movement_pattern === after.movement_pattern) return null
  const session = day.toLowerCase() === 'today' ? "today's session" : `${day}'s session`
  const puts = `That puts ${WORDS[after.movement_pattern]} (${after.name}) where ${session} had ${WORDS[before.movement_pattern]} (${before.name})`
  if (NOT_STRENGTH.has(before.movement_pattern) || NOT_STRENGTH.has(after.movement_pattern)) {
    return `${puts}, so the session does a different job there. Fine if that's what you want.`
  }
  return `${puts}: the session keeps the work but trains a different movement. Fine if that's what you want; a like-for-like swap keeps the plan's balance.`
}

/**
 * Why this replacement may not go in (one of his hard stops), in a sentence, or null. `profile` carries his injuries
 * and any running ease-off (the pool profile); `today` is the app's date, for the from-28-weeks rules.
 */
export function swapHardStop(entry: ExerciseEntry, profile: UserProfile, exclusions: readonly string[], today: string): string | null {
  const names = [entry.name, entry.parent ?? ''].filter(Boolean).map(n => n.toLowerCase())
  if (exclusions.some(x => names.includes(x.trim().toLowerCase()))) {
    return `${entry.name} is on your never-again list, so it stays out. Take it off the list on Profile and I can swap it in.`
  }
  const flagged = new Set<string>()
  for (const injury of profile.injuries ?? []) for (const j of INJURED_JOINTS[injury] ?? []) flagged.add(j)
  if (isContraindicatedFor(entry, flagged)) {
    const joints = contraindicatedJoints(entry).filter(j => flagged.has(j)).map(j => j.replace(/_/g, ' '))
    return `${entry.name} loads your ${joints.join(' and ')}, which your plan is protecting for your injuries, so I won't swap it in. I can find one that works the same muscles without it.`
  }
  if (isPregnant(profile)) {
    const kind = pregnancyExclusion(entry)
    const why = kind === 'impact' ? 'a jumping move' : kind === 'lying' ? 'a move lying flat' : kind === 'abdominal' ? 'a hard ab move' : null
    if (why) return `${entry.name} is ${why}, which your plan leaves out while you're pregnant, so I won't swap it in. I can find one that works the same muscles.`
    if (lateInPregnancy(profile, today) && [entry.name, entry.parent ?? ''].some(n => PREGNANCY_LATE_EXCLUDED.has(n))) {
      return `${entry.name} is one your plan leaves out from 28 weeks pregnant (one-leg balance or face-down work), so I won't swap it in. I can find a supported version.`
    }
  }
  return null
}

/** What the card says about a replacement outside his kit, style or level (the screen search's own warnings), after the stops. */
export function swapFitWarnings(entry: ExerciseEntry, profile: UserProfile, exclusions: readonly string[]): string[] {
  return getExerciseCompatibilityWarnings(entry, profile, [...exclusions])
}

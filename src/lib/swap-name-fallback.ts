// ---------------------------------------------------------------------------
// A SWAP TO A NAME THE CATALOGUE DOES NOT HAVE IS ANSWERED, NEVER A DEAD END (runs 7-10, H33, 18 Oct 2026).
//
// Sam asked the coach to swap an exercise for "Dumbbell Step-Up". The catalogue calls it "Step-Ups", the resolver
// found nothing, and the whole reply was "I don't have 'Dumbbell Step-Up' in the exercise library — try another name
// for it". This answers instead: the nearest catalogue names, the real alternatives for the exercise being swapped out
// that HIS kit and injuries allow (the swap sheet's own shortlist, getReplacementCandidates, so the coach cannot offer
// what the screen would refuse), each as a tap, and a tap to change the kit when none of it is what he has.
// docs/plans/runs-7-10-batch-1-safety.md.
// ---------------------------------------------------------------------------
import type { ExerciseResolution } from './set-parse'
import type { UserProfile } from './types'
import { searchExerciseCatalogByWords, getExerciseEntry } from './exercise-db'
import { getReplacementCandidates } from './mesocycle-edit'
import { getConstrainedPool, isEquipmentAllowed } from './exercise-plan'

/**
 * Implement words a person puts in front of a movement that the catalogue's names leave out ("Dumbbell Step-Up" is
 * "Step-Ups"). Dropped only to FIND a lookalike name; whether its kit is his is the shortlist's question, not this.
 */
const IMPLEMENT_WORDS = /^(dumbbells?|db|barbells?|bb|kettlebells?|kb|cables?|machines?|bands?|banded|smith|weighted|bodyweight|bw)$/i

/** The tap that asks for the kit change (the coach's propose_kit_change card follows on the next turn). */
export const KIT_CHIP = "That's not the kit I have"

export interface SwapNameFallback {
  /** The reply, with its taps in the chat's quick-reply tag. */
  text: string
  /** The alternatives offered, catalogue names his kit and injuries allow. */
  offered: string[]
  /** A catalogue name close to what he typed that he cannot have, said so rather than hidden. */
  ruledOut: string | null
  /** Why: his kit does not have what it needs, or his injuries, avoid list or experience keep it out (the pool's other stages). */
  ruledOutBy: 'kit' | 'injuries' | null
}

export function swapNameFallback(input: {
  typed: string
  oldExercise: string
  resolution: ExerciseResolution
  profile: UserProfile
  exclusions: string[]
}): SwapNameFallback {
  const { typed, oldExercise, resolution, profile, exclusions } = input
  const allowed = getReplacementCandidates(oldExercise, profile, exclusions).map(c => c.exercise.name)
  const allowedSet = new Set(allowed.map(n => n.toLowerCase()))

  // Lookalike names: the resolver's own candidates, then the words search with the implement words dropped.
  const bare = typed.split(/\s+/).filter(w => w && !IMPLEMENT_WORDS.test(w)).join(' ')
  const lookalikes = [
    ...(resolution.resolution === 'ambiguous' ? resolution.candidates.map(c => c.name) : []),
    ...(bare ? searchExerciseCatalogByWords(bare, 10).map(e => e.name) : []),
  ].filter((n, i, all) => all.findIndex(m => m.toLowerCase() === n.toLowerCase()) === i)
    .filter(n => n.toLowerCase() !== oldExercise.toLowerCase())

  // A lookalike he CAN do is offered first even when it is a different movement: he asked for it by name, and the
  // swap card states what a cross-pattern swap costs the week before the tap (the swap path's own trade-off).
  // "Can do" is the generator's own pool with every stage but style (kit, injuries, avoid list, skill).
  const legal = new Set(getConstrainedPool(profile, exclusions, { skipStyle: true }).map(e => e.name.toLowerCase()))
  const near = lookalikes.filter(n => legal.has(n.toLowerCase()) || allowedSet.has(n.toLowerCase())).slice(0, 1)
  const ruledOut = near.length === 0 ? lookalikes[0] ?? null : null
  const ruledEntry = ruledOut ? getExerciseEntry(ruledOut) : undefined
  const ruledOutBy: SwapNameFallback['ruledOutBy'] = !ruledEntry ? null : isEquipmentAllowed(ruledEntry, profile) ? 'injuries' : 'kit'
  // The same-movement alternatives are listed on their own: a lookalike he asked for is not called a swap FOR the
  // exercise when it is a different movement.
  const alternatives = allowed
    .filter(n => !near.some(m => m.toLowerCase() === n.toLowerCase()) && n.toLowerCase() !== oldExercise.toLowerCase())
    .slice(0, near.length > 0 ? 2 : 3)
  const offered = [...near, ...alternatives]

  const opener = resolution.resolution === 'ambiguous'
    ? `"${typed}" could be a few things.`
    : `I don't have "${typed}" under that name.`
  const nearLine = near.length > 0
    ? ` The nearest I have is ${near[0]}.`
    : ruledOut ? ` The nearest I have is ${ruledOut}, ${ruledOutBy === 'kit' ? "and it needs kit your profile doesn't list" : 'and your injuries, exercises to avoid or experience keep it out'}.` : ''
  const list = (names: string[]) => names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
  const listLine = alternatives.length > 0
    ? ` ${near.length > 0 ? 'Or, for' : 'For'} ${oldExercise}, these fit your kit and injuries: ${list(alternatives)}. Which one?`
    : near.length > 0 ? ' Want that one?'
    : ` Nothing else fits ${oldExercise} with your kit and injuries as they are.`
  // Every name here is a catalogue name, and no catalogue name holds "]" or "|" (the tag ends at the first "]" and
  // splits on "|"): test:swap-name-fallback holds that over the whole catalogue.
  const chips = [...offered.map(n => `Swap ${oldExercise} for ${n}`), KIT_CHIP]
  return {
    text: `${opener}${nearLine}${listLine}\n[QUICK_REPLIES: ${chips.map(c => `"${c}"`).join(' | ')}]`,
    offered,
    ruledOut,
    ruledOutBy,
  }
}

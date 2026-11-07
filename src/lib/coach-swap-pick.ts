// ---------------------------------------------------------------------------
// WHEN THE COACH CHOOSES A SWAP, IT CHOOSES WHAT THE SWAP LIST WOULD (coach exam, 7 Nov 2026).
//
// Asked "swap the walking lunges for something else today", the coach picked Step-Ups, which need a box her home
// gym does not have, while three loaded lunges sat at the top of the Exercise tab's own swap list for that lift. The
// coach had no list to choose from, and the app built whatever it named.
//
// Two halves, one list (getReplacementCandidates, the swap sheet's own ranking: kit, injuries, avoid list, skill,
// her likes, loaded before unloaded, her style):
//   1. The coach is SENT the first few options for each of today's exercises (swapOptionsBlock), and told to take
//      the first when she names nothing.
//   2. The app holds it either way (coachSwapPick): when she named no replacement, a pick the list does not hold, or
//      an unloaded pick for a loaded lift while the list leads with a loaded one, becomes the list's first. A name
//      SHE said is hers (her 13 Sep ruling "show everything, warn me"), and is left alone.
// ---------------------------------------------------------------------------
import { getReplacementCandidates } from './mesocycle-edit'
import { getExerciseEntry } from './exercise-db'
import { isExternallyLoaded } from './load-prescription'
import type { UserProfile } from './types'

/** How many options per exercise the coach is sent: the first is the pick, the rest are for "not that one". */
export const SWAP_OPTIONS_SENT = 3

export interface SwapListInput {
  profile: UserProfile
  exclusions: string[]
  soft?: { liked: string[]; disliked: string[] }
}

/** The swap list for one exercise, best first, as the Exercise tab's swap sheet orders it. */
export function swapListFor(exerciseName: string, { profile, exclusions, soft }: SwapListInput): string[] {
  return getReplacementCandidates(exerciseName, profile, exclusions, soft)
    .map(c => c.exercise.name)
    .filter(n => n.toLowerCase() !== exerciseName.toLowerCase())
}

/**
 * The block appended to the coach's exercise summary: today's exercises, each with the first few options its swap
 * list offers. Empty when today has no exercise the catalogue knows.
 */
export function swapOptionsBlock(todayExercises: string[], input: SwapListInput): string {
  const lines = [...new Set(todayExercises)]
    .filter(n => getExerciseEntry(n))
    .map(n => ({ n, options: swapListFor(n, input).slice(0, SWAP_OPTIONS_SENT) }))
    .filter(x => x.options.length > 0)
    .map(x => `- ${x.n}: ${x.options.join(', ')}`)
  if (lines.length === 0) return ''
  return [
    "SWAP OPTIONS FOR TODAY — what the Exercise tab's swap list shows first for each of today's exercises, on their kit and injuries, best first.",
    "When they ask to swap one of these and do not name what to do instead, put the FIRST option in propose_exercise_swap's new_item, exactly as written. Offer the next one only when they say why the first will not do. A replacement THEY name is theirs to choose.",
    ...lines,
  ].join('\n')
}

/** Words a replacement's name shares with the request without the person having chosen it. */
const NOT_A_CHOICE = /^(dumbbells?|barbells?|kettlebells?|cables?|machines?|bands?|banded|smith|weighted|bodyweight|single|double|arm|leg|with|the|and)$/

const stems = (text: string): string[] =>
  text.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/)
    .filter(w => w.length > 2)
    // Plural to singular, one letter: "lunges" is "lunge", "presses" is "press", "press" stays.
    .map(w => w.replace(/sses$/, 'ss').replace(/([^s])s$/, '$1'))

/**
 * Did she name the replacement herself? Only the words that are NOT also in the exercise being swapped count ("swap
 * the walking lunges" names "lunge", which is no choice of a reverse lunge), and no implement or filler word does.
 */
export function replacementNamed(userSaid: string, replacement: string, outgoing: string): boolean {
  const said = new Set(stems(userSaid))
  const old = new Set(stems(outgoing))
  return stems(replacement)
    .filter(w => !old.has(w) && !NOT_A_CHOICE.test(w))
    .some(w => said.has(w))
}

export interface CoachSwapPick {
  /** The exercise the card will put in. */
  name: string
  /** True when the coach's own pick was set aside for the list's first. */
  replaced: boolean
}

/**
 * The replacement the card carries. Her named choice stands; with nothing named, the coach's pick stands only when
 * the swap list holds it and it is not an unloaded option for a loaded lift ahead of a loaded one.
 */
export function coachSwapPick(input: SwapListInput & { picked: string; outgoing: string; userSaid: string }): CoachSwapPick {
  const { picked, outgoing, userSaid } = input
  if (replacementNamed(userSaid, picked, outgoing)) return { name: picked, replaced: false }
  const list = swapListFor(outgoing, input)
  if (list.length === 0) return { name: picked, replaced: false }
  const first = list[0]
  const onList = list.some(n => n.toLowerCase() === picked.toLowerCase())
  const pickedEntry = getExerciseEntry(picked)
  const outgoingEntry = getExerciseEntry(outgoing)
  const firstEntry = getExerciseEntry(first)
  const downgrade = !!outgoingEntry && isExternallyLoaded(outgoingEntry)
    && !!pickedEntry && !isExternallyLoaded(pickedEntry)
    && !!firstEntry && isExternallyLoaded(firstEntry)
  if (onList && !downgrade) return { name: picked, replaced: false }
  return { name: first, replaced: true }
}

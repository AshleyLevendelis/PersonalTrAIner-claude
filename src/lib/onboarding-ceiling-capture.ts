// ---------------------------------------------------------------------------
// A LOAD CEILING MUST COME FROM THEIR OWN WORDS, NOT THE MODEL'S INFERENCE.
//
// Roadmap item 11, second half. Onboarding can now keep a weight someone
// volunteers ("I've only got 12kg dumbbells") so the Exercise tab does not ask
// for it later. The three slots that hold it are NEVER ASKED — Ashley's
// standing ruling, recorded in the header of load-ceiling-prompt.ts: someone
// who has never trained cannot answer "how much can you load", and onboarding
// is where people drop out. So the only way one is ever written is the model
// recording something that was volunteered.
//
// WHICH MAKES THE GUARD BELOW THE WHOLE SAFETY STORY. statedCeilingKg treats
// any number it finds as a HARD CLAMP, and nothing downstream can tell an
// invented number from a stated one — so a hallucinated "12" would quietly cap
// every dumbbell weight prescribed for the next sixteen weeks, and the only
// symptom would be a plan that felt oddly light. Refusing is cheap by
// comparison: the slot stays empty and the Exercise tab asks at first use,
// exactly as it does today.
//
// It lives in lib rather than in the component so it can be tested directly
// against real sentences (test:equipment-labels §11) instead of through a
// React tree.
// ---------------------------------------------------------------------------
import type { SlotKey } from './onboarding-slots'

/** The three load ceilings, and the words that count as naming each implement. */
export const CEILING_SLOT_WORDS: Partial<Record<SlotKey, RegExp>> = {
  maxDumbbellKg: /\bdumbb?ells?\b|\bdb\b/i,
  maxSingleImplementKg: /\bkettlebells?\b|\bkb\b/i,
  maxImprovisedKg: /\b(back ?pack|ruck ?sack|bag)\b/i,
}

export function isCeilingSlot(key: SlotKey): boolean {
  return Boolean(CEILING_SLOT_WORDS[key])
}

/**
 * True only when this turn's own text both NAMES the implement and CONTAINS
 * the number being written.
 *
 * Both halves are load-bearing. Without the implement word, "I weigh 80kg"
 * writes an 80kg dumbbell ceiling. Without the number, "I train with dumbbells"
 * writes whatever the model guessed. Requiring both is what makes the value a
 * quotation rather than an inference.
 */
export function ceilingIsInUserWords(key: SlotKey, value: unknown, userText: string): boolean {
  const namer = CEILING_SLOT_WORDS[key]
  if (!namer) return true // not a ceiling slot — this guard has nothing to say
  if (!namer.test(userText)) return false
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return false
  // Digit-boundary rather than \b: \b treats a decimal point as a boundary, so
  // "12.5" would satisfy a check for "12". A ceiling one is not the number
  // they said.
  return new RegExp(`(^|[^\\d.])${n}([^\\d.]|$)`).test(userText)
}

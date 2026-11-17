// ===========================================================================
// GENERATED FILE — DO NOT EDIT.
//
// This is src/lib/one-off-sport.ts, copied here by scripts/sync-shared-code.mjs so the edge
// functions (Deno, which cannot import from src/) run the SAME code the app
// does. Change the source, then run:
//
//     npm run sync:shared
//
// A hand edit here is overwritten by the next sync, and test:food-db-parity
// fails for as long as this file differs from what the script would write.
// ===========================================================================

// ---------------------------------------------------------------------------
// A ONE-OFF CLASS IS NOT A STANDING ONE (his report 17 Nov 2026: "Im doing myay thai this evening" was answered with
// an offer to rebuild all sixteen weeks around "Muay Thai · Tuesday evenings"). The coach's own instructions already
// say a one-off never gets that offer and an unclear one is asked about; the model did not follow them. This is the
// app's half, so the rule holds whatever the model does.
//
// Read off HIS message: it speaks of one occasion ("tonight", "this evening", "today", "tomorrow") and says nothing
// that makes it regular ("every", "each week", "twice a week", "on Tuesdays", "Tuesday evenings"). Then the plan is
// not rebuilt; he is asked, once, whether it is every week. Anything regular in the same message lets the offer stand.
//
// No imports: the coach's server reads a synced copy (scripts/sync-shared-code.mjs).
// ---------------------------------------------------------------------------

const ONE_OCCASION = /\b(?:tonight|tonite|today|tomorrow|later(?:\s+on)?|this\s+(?:morning|afternoon|evening|eve|weekend|week)|right\s+now|instead)\b/i

// Plural weekdays and parts of the day ("Tuesday evenings", "on Saturdays") are habits; so are frequency words.
const REGULAR = /\b(?:every|each|weekly|fortnightly|usually|normally|always|regularly|twice|three\s+times|(?:once|twice|\d+|two|three|four)\s+(?:times\s+)?(?:a|per)\s+week|(?:mon|tues|wednes|thurs|fri|satur|sun)days|mornings|afternoons|evenings|nights)\b/i

/** True when the message speaks of a single occasion and nothing regular. */
export function isOneOffMention(message: string | null | undefined): boolean {
  const text = String(message ?? '')
  return ONE_OCCASION.test(text) && !REGULAR.test(text)
}

/** The app's words when a one-off reached the standing-class offer: nothing is changed, and he is asked once. */
export function oneOffSportReply(name: string): string {
  const what = name.trim() || 'that'
  return `Enjoy ${what}. I've left your plan as it is. If it's every week, tell me which days and I'll build your week around it.`
}

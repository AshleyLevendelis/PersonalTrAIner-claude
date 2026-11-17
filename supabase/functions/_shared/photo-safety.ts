// ===========================================================================
// GENERATED FILE — DO NOT EDIT.
//
// This is src/lib/photo-safety.ts, copied here by scripts/sync-shared-code.mjs so the edge
// functions (Deno, which cannot import from src/) run the SAME code the app
// does. Change the source, then run:
//
//     npm run sync:shared
//
// A hand edit here is overwritten by the next sync, and test:food-db-parity
// fails for as long as this file differs from what the script would write.
// ===========================================================================

// ---------------------------------------------------------------------------
// A PHOTO NEVER MAKES A FOOD ALLERGY-SAFE (17 Nov 2026, the chat review: "it never says a food is allergy-safe from a
// photo"). A picture cannot show what is in a sauce, a coating or a kitchen. On a turn with a photo, any sentence that
// calls a food safe or free of an allergen is taken out of the coach's reply and the app's own sentence is said
// instead. Import-free: the coach's server runs the same file (_shared/photo-safety.ts, kept by sync:shared).
// ---------------------------------------------------------------------------

const FREE_CLAIM = /\b(?:is|are|'s|’s|looks|look|seems|seem|should be|will be|would be|appears|appear)\s+(?:to be\s+)?(?:completely\s+|totally\s+|definitely\s+|entirely\s+|perfectly\s+|100%\s+|all\s+)?(?:safe(?:\s+(?:to eat|for you|for your allergy))?|(?:nut|peanut|tree[- ]nut|gluten|wheat|dairy|milk|lactose|egg|soy|soya|fish|shellfish|sesame|celery|mustard|lupin|sulphite|allergen)[- ]free|free\s+(?:from|of)\s+\w+)\b/i
const NO_CLAIM = /\b(?:can't|cannot|can not|couldn't|won't|not)\b[^.?!]{0,40}\b(?:tell|say|know|confirm|promise|guarantee|be sure)/i

/** The app's sentence on a photo turn that touched an allergen. */
export const PHOTO_ALLERGEN_LINE = "I can't tell from a photo whether something is free of an allergen, so check the label or ask the kitchen."

/** The reply with every "it's safe / X-free" sentence taken out and the app's sentence added, or unchanged when none. */
export function withoutPhotoAllergenClaims(reply: string): { reply: string; removed: number } {
  const sentences = reply.match(/[^.!?\n]+[.!?]*\s*|\n+/g) ?? [reply]
  let removed = 0
  const kept = sentences.filter(s => {
    const claim = FREE_CLAIM.test(s) && !NO_CLAIM.test(s)
    if (claim) removed++
    return !claim
  })
  if (removed === 0) return { reply, removed: 0 }
  const body = kept.join('').trim()
  return { reply: body ? `${body}\n\n${PHOTO_ALLERGEN_LINE}` : PHOTO_ALLERGEN_LINE, removed }
}

/** The largest photo the coach is sent (base64 characters): a phone photo downscaled to 1024px is well under it. */
export const PHOTO_MAX_BASE64 = 2_000_000
export const PHOTO_MIME = /^image\/(?:jpeg|png|webp)$/

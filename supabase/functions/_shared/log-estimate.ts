// ===========================================================================
// GENERATED FILE — DO NOT EDIT.
//
// This is src/lib/log-estimate.ts, copied here by scripts/sync-shared-code.mjs so the edge
// functions (Deno, which cannot import from src/) run the SAME code the app
// does. Change the source, then run:
//
//     npm run sync:shared
//
// A hand edit here is overwritten by the next sync, and test:food-db-parity
// fails for as long as this file differs from what the script would write.
// ===========================================================================

// ---------------------------------------------------------------------------
// A FOOD THE APP CANNOT COUNT, IN A LOG (Marcus test, 15 Nov 2026; his ruling that day, "Estimate when asked").
// "I just ate a chicken burger with chips" was answered four times with "How much were they?", because neither food
// was in the table and the question asked for an amount he had already given. Two rules, both here so the app and the
// coach's server say and decide the same (synced to supabase/functions/_shared by `npm run sync:shared`):
//   1. the question names what is missing and never asks "how much" (an amount cannot fix a food the list lacks);
//   2. an estimate is used ONLY when his own message asked for one, one per missing food, and only when its numbers
//      add up. The card then says "Assumed: ... (an estimate, about N kcal)" before Apply. Never estimated unasked
//      (his 1 Oct "ask, never estimate" stands for every other case).
// Zero imports, so the server copy is the same file.
// ---------------------------------------------------------------------------

/** His words asking for an estimate: "you estimate it", "best guess", "ballpark", "roughly is fine". */
const ASKED = /\b(?:estimate|guess|ballpark|you decide|your call|roughly is fine|rough is fine|whatever'?s typical|standard portion)\b/i

export function askedToEstimate(message: string): boolean {
  return ASKED.test(message ?? '')
}

export interface FoodEstimate {
  name: string
  /** "1 regular burger", "a medium portion". */
  portion: string
  kcal: number
  protein: number
  carbs: number
  fat: number
}

/** Most a single estimated food may be, so a slip ("4000 kcal of chips") is refused, not logged. */
const MAX_ITEM_KCAL = 2000

function wordsOf(s: string): string[] {
  return (s ?? '').toLowerCase().split(/[^a-z]+/).filter(w => w.length > 2)
}

function plausible(e: FoodEstimate): boolean {
  const nums = [e.kcal, e.protein, e.carbs, e.fat]
  if (!nums.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0)) return false
  if (e.kcal <= 0 || e.kcal > MAX_ITEM_KCAL) return false
  const fromMacros = 4 * e.protein + 4 * e.carbs + 9 * e.fat
  return Math.abs(fromMacros - e.kcal) <= Math.max(40, 0.2 * e.kcal)
}

function readEstimate(raw: unknown): FoodEstimate | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const num = (v: unknown) => (typeof v === 'number' ? v : Number(v))
  const e: FoodEstimate = {
    name: String(r.name ?? '').trim(),
    portion: String(r.portion ?? '').trim(),
    kcal: Math.round(num(r.kcal)), protein: Math.round(num(r.protein)), carbs: Math.round(num(r.carbs)), fat: Math.round(num(r.fat)),
  }
  return e.name && e.portion ? e : null
}

/**
 * The estimates to use for the foods the table could not count, or null when none may be used: he did not ask, a
 * missing food has no estimate, or one does not add up. All or nothing, so a card never carries a total that quietly
 * leaves a food out (his M51 rule).
 */
export function acceptEstimates(notCounted: readonly string[], raw: unknown, message: string): FoodEstimate[] | null {
  if (notCounted.length === 0 || !askedToEstimate(message) || !Array.isArray(raw)) return null
  const offered = raw.map(readEstimate).filter((e): e is FoodEstimate => !!e)
  const used: FoodEstimate[] = []
  for (const missing of notCounted) {
    const want = wordsOf(missing)
    const e = offered.find(o => !used.includes(o) && wordsOf(o.name).some(w => want.includes(w)))
    if (!e || !plausible(e)) return null
    used.push(e)
  }
  return used
}

/** The assumption line the card shows for one: "a medium portion of chips (an estimate, about 360 kcal)". */
export function estimateAssumption(e: FoodEstimate): string {
  return `${e.portion} ${e.name} (an estimate, about ${e.kcal} kcal)`.replace(/\s+/g, ' ').trim()
}

/** The question for foods the table does not have: what was it, or say "estimate it". Never "how much". */
export function notCountedQuestion(notCounted: readonly string[]): string {
  const list = notCounted.length === 1
    ? `**${notCounted[0]}**`
    : `${notCounted.slice(0, -1).map(u => `**${u}**`).join(', ')} and **${notCounted[notCounted.length - 1]}**`
  const it = notCounted.length === 1 ? 'it' : 'them'
  return `I don't have ${list} in my food list, so I haven't put a total on ${it} yet. Tell me roughly what ${notCounted.length === 1 ? 'it was' : 'they were'}, or say "estimate it" and I'll use a standard portion and show you what I assumed before anything is saved. Or I can leave ${it} out.`
}

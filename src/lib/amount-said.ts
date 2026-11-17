// ---------------------------------------------------------------------------
// AN AMOUNT ON A COACH CARD IS ONE HE SAID (17 Nov 2026, the chat review: "stop the coach making up amounts ('2
// large')"). The coach writes a food line's amount into its tool call; nothing checked that he had said it. Every
// line the coach puts on a meal card for a food he named is read here against his own message:
//   - an amount he said (a number, or a word for one: "a", "two", "half") stands;
//   - an amount he did not say is the coach's guess, and the builder either sizes it itself and SAYS so (a swap:
//     the same calories as the food it replaces) or asks him (an addition).
// No model call, no guess: the check is his words against the line's leading number.
// ---------------------------------------------------------------------------
import { parseIngredientLine, kitchenRound } from './portion-scaler'
import { computeMealMacros, lookupIngredient } from './food-db'

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, single: 1, two: 2, couple: 2, pair: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, twelve: 12, half: 0.5, quarter: 0.25,
}

/** The numbers his message names, written as digits or as words. */
function numbersSaid(userSaid: string): number[] {
  const text = userSaid.toLowerCase()
  const out: number[] = []
  for (const m of text.matchAll(/(\d+(?:[.,]\d+)?)/g)) out.push(Number(m[1].replace(',', '.')))
  for (const m of text.matchAll(/(\d+)\s*\/\s*(\d+)/g)) out.push(Number(m[1]) / Number(m[2]))
  if (/½/.test(text)) out.push(0.5)
  for (const w of text.match(/[a-z]+/g) ?? []) if (NUMBER_WORDS[w] != null) out.push(NUMBER_WORDS[w])
  return out
}

/** True when the line's amount is one his message says. An empty message checks nothing (no surface to compare). */
export function amountSaid(line: string, userSaid: string | undefined): boolean {
  if (!userSaid || !userSaid.trim()) return true
  const parsed = parseIngredientLine(line)
  if (parsed.unread || !Number.isFinite(parsed.quantity)) return false
  const said = numbersSaid(userSaid)
  // "200g" said and "200g" written; "two eggs" said and "2 eggs" written; "a banana" said and "1 banana" written.
  // A line the reader converted ("8 oz" read as 227 g) is compared on the number he typed as well as the grams.
  const written = (line.match(/\d+(?:[.,]\d+)?/)?.[0] ?? '').replace(',', '.')
  return said.some(n => Math.abs(n - parsed.quantity) < 1e-6 || (written !== '' && Math.abs(n - Number(written)) < 1e-6))
}

/** The lines whose amount he did not say. */
export function unsaidAmounts(lines: string[], userSaid: string | undefined): string[] {
  return lines.filter(l => !amountSaid(l, userSaid))
}

/**
 * A food going in for another, at the SAME CALORIES as the line it replaces (mine, CSCS: a like-for-like swap keeps
 * the meal's energy where the plan put it). Null when either side cannot be costed, so the caller asks instead.
 */
export function sizedToReplace(newLine: string, replacedLine: string): string | null {
  const replaced = computeMealMacros([parseIngredientLine(replacedLine)])
  if (!replaced.amountsUnderstood || !(replaced.kcal > 0)) return null
  const parsed = parseIngredientLine(newLine)
  const entry = lookupIngredient(parsed.name)
  if (!entry || !(entry.per100g.kcal > 0)) return null
  const grams = Math.max(5, kitchenRound((replaced.kcal / entry.per100g.kcal) * 100, 'g'))
  return `${grams}g ${parsed.name}`
}

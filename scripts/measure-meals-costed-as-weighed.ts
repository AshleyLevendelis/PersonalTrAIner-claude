/**
 * measure:meals-costed-as-weighed — how many dishes were costed in a different
 * state from the one their card tells her to weigh, and by how much
 * (H32, run 7, 14 Oct 2026; docs/plans/meals-costed-as-weighed.md).
 *
 * Nothing is asserted here; it prints. test:meals-costed-as-weighed holds the
 * properties.
 *
 * THE PRE-FIX COSTING IS SIMULATED, AND THE SIMULATION IS NARROW ON PURPOSE.
 * Before 11 Oct the lookup threw a state word away ("raw chicken breast" was
 * costed as the cooked breast). This script reproduces exactly that and
 * nothing else: a line whose state word reaches a raw or dry entry is costed
 * as the same words with the state word removed. Checked against the real
 * pre-fix code (git 45264e98) on 14 Oct: the H32 pair gives 351 kcal / 56.9 g
 * protein / 12.2 g carbs in both, and all 290 library dishes agree. Other
 * pre-11-Oct misreads (a dish read as one of its ingredients) are not this
 * bug and are not counted.
 *
 * Corpora:
 *   A. The H32 card's two lines.
 *   B. The meal library (290: the 188 of 30 Sep and the 102 lean of 1 Oct) as
 *      written: stored-then (simulated) against costed-now.
 *   C. The same 290 dishes written the way the meal writer is told to write a
 *      meat, fish, grain or pulse weighed raw or dry ("150g raw chicken
 *      breast", "75g dry pasta"): every line on a food that has a raw or dry
 *      twin is converted to that twin at the same energy, so the dish is the
 *      same food and only the words change. This stands in for model-written
 *      pools, which cannot be read from a cloud session.
 *   D. Every library line that names a state, and whether it reaches an entry
 *      in that state; and every UNMARKED line on a food whose numbers depend on
 *      its state, by the state the app's figures assume.
 *   E. C's stale options through the real read path (costStoredMeal): how many
 *      the card now re-costs, and how many it keeps at the stored numbers.
 */
import { MEAL_LIBRARY } from '../src/lib/meal-library-data'
import { parseIngredientLines } from '../src/lib/portion-scaler'
import { computeMealMacros, lookupIngredient, stateOf, type MealIngredientLine } from '../src/lib/food-db'
import { costStoredMeal } from '../src/lib/meal-costing'
import type { MacroTargets } from '../src/lib/types'

const STATE_WORD = /\b(raw|dry|dried|uncooked)\b/i

/** The pre-11-Oct costing of a line, for the one misread this measures: a state word reaching a raw or dry entry was dropped. */
export function costedAsBeforeTheFix(lines: MealIngredientLine[]): MealIngredientLine[] {
  return lines.map(l => {
    const entry = lookupIngredient(l.name)
    const st = entry ? stateOf(entry) : undefined
    if (!entry || (st !== 'raw' && st !== 'dry') || !STATE_WORD.test(l.name)) return l
    return { ...l, name: l.name.replace(STATE_WORD, ' ').replace(/\s+/g, ' ').trim() }
  })
}

const toTargets = (m: { kcal: number; protein: number; carbs: number; fat: number }): MacroTargets => ({ calories: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat })

/** A library line on a food with a raw or dry twin, written in that twin's state at the same energy. Null when the food has no twin. */
function asWeighedRawOrDry(line: MealIngredientLine): MealIngredientLine | null {
  const u = line.unit.toLowerCase()
  if (u !== 'g' && u !== 'ml') return null
  const entry = lookupIngredient(line.name)
  if (!entry || stateOf(entry) !== 'cooked') return null
  const core = line.name.replace(/\bcooked\b/i, ' ').replace(/\s+/g, ' ').trim()
  for (const word of ['raw', 'dry'] as const) {
    const twin = lookupIngredient(`${word} ${core}`)
    if (twin && twin !== entry && stateOf(twin) === word) {
      return { name: `${word} ${core}`, quantity: Math.round((line.quantity * entry.per100g.kcal) / twin.per100g.kcal), unit: 'g' }
    }
  }
  return null
}

function stats(xs: number[]): string {
  if (xs.length === 0) return 'n/a'
  const s = [...xs].sort((a, b) => a - b)
  const med = s[Math.floor(s.length / 2)]
  const abs = xs.map(Math.abs).sort((a, b) => a - b)
  const worstAbs = s.reduce((w, x) => (Math.abs(x) > Math.abs(w) ? x : w), 0)
  return `median ${med.toFixed(1)} (size ${abs[Math.floor(abs.length / 2)].toFixed(1)}), worst ${worstAbs.toFixed(1)}`
}

function main(): void {
  // A
  const h32 = parseIngredientLines(['177g raw chicken breast', '53g dry couscous'])
  const was = computeMealMacros(costedAsBeforeTheFix(h32))
  const now = computeMealMacros(h32)
  console.log(`A. H32 lines: stored then ${was.kcal} kcal / ${was.protein} P / ${was.carbs} C / ${was.fat} F; costed as weighed ${now.kcal} kcal / ${now.protein} P / ${now.carbs} C / ${now.fat} F`)

  // B
  let bDiffer = 0
  for (const dish of MEAL_LIBRARY) {
    const lines = parseIngredientLines(dish.ingredients)
    const a = computeMealMacros(costedAsBeforeTheFix(lines)), b = computeMealMacros(lines)
    if (a.kcal !== b.kcal || a.protein !== b.protein || a.carbs !== b.carbs) bDiffer++
  }
  console.log(`B. Library as written: ${bDiffer} of ${MEAL_LIBRARY.length} dishes cost differently before and after the fix`)

  // C + E
  let cDishes = 0, cAffected = 0, cLines = 0, eRecosted = 0, eKept = 0
  const dK: number[] = [], dKpct: number[] = [], dP: number[] = [], dC: number[] = []
  let worst = { name: '', was: 0, now: 0 }
  for (const dish of MEAL_LIBRARY) {
    const lines = parseIngredientLines(dish.ingredients)
    let changed = 0
    const rewritten = lines.map(l => { const r = asWeighedRawOrDry(l); if (r) changed++; return r ?? l })
    cDishes++
    if (changed === 0) continue
    cLines += changed
    const stored = toTargets(computeMealMacros(costedAsBeforeTheFix(rewritten)))
    const asWeighed = computeMealMacros(rewritten)
    cAffected++
    dK.push(asWeighed.kcal - stored.calories)
    dKpct.push(((asWeighed.kcal - stored.calories) / Math.max(1, stored.calories)) * 100)
    dP.push(asWeighed.protein - stored.protein)
    dC.push(asWeighed.carbs - stored.carbs)
    if (Math.abs(asWeighed.kcal - stored.calories) > Math.abs(worst.now - worst.was)) worst = { name: dish.name, was: stored.calories, now: asWeighed.kcal }
    const read = costStoredMeal(rewritten, stored)
    if (read.recosted) eRecosted++
    else eKept++
  }
  console.log(`C. Library written raw/dry: ${cAffected} of ${cDishes} dishes carry a raw or dry line (${cLines} lines); stored-then vs as-weighed:`)
  console.log(`   kcal ${stats(dK)}; kcal % ${stats(dKpct)}; protein g ${stats(dP)}; carbs g ${stats(dC)}`)
  console.log(`   under-counted (stored below as-weighed) ${dK.filter(x => x > 0).length}, over-counted ${dK.filter(x => x < 0).length}; off by more than a new meal's 7% calorie band ${dKpct.filter(x => Math.abs(x) > 7).length}; worst ${worst.name}: ${worst.was} -> ${worst.now} kcal`)
  console.log(`E. Through costStoredMeal: ${eRecosted} re-costed, ${eKept} kept at stored numbers`)

  // D
  let named = 0, namedOk = 0
  const namedBad: string[] = []
  const unmarked: Record<string, number> = { cooked: 0, raw: 0, dry: 0 }
  for (const dish of MEAL_LIBRARY) {
    for (const l of parseIngredientLines(dish.ingredients)) {
      const entry = lookupIngredient(l.name)
      const word = /\b(raw|dry|dried|uncooked|cooked)\b/i.exec(l.name)?.[1]?.toLowerCase()
      const st = entry ? stateOf(entry) : undefined
      if (word) {
        named++
        const wanted = word === 'dried' ? 'dry' : word === 'uncooked' ? (st === 'raw' ? 'raw' : 'dry') : word
        if (!entry || !st || st === wanted) namedOk++
        else namedBad.push(`${l.name} -> ${entry.name} (${st})`)
      } else if (st) unmarked[st]++
    }
  }
  console.log(`D. Library lines naming a state: ${named}; reaching an entry in that state (or a food whose state does not change its numbers): ${namedOk}${namedBad.length ? `; WRONG: ${namedBad.join('; ')}` : ''}`)
  console.log(`   Unmarked lines on a food whose numbers depend on its state, by the state the app's figures assume: cooked ${unmarked.cooked}, raw ${unmarked.raw}, dry ${unmarked.dry}`)
}

main()

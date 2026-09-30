/**
 * measure:meal-library — what the meal library holds and who it can serve.
 *
 * Nothing here is asserted; it prints, so a person (and test:meal-library,
 * which reads the same numbers) can see the library as the app will:
 *   - dishes per meal, per cuisine, and per diet (derived, never stored);
 *   - lines the ingredient reader could not read strictly (an amount it would
 *     misread is the failure this library must never contain);
 *   - for each dish, the share of a grid of realistic daily targets it can be
 *     served against, through the real verifyProposal;
 *   - the dishes almost nobody can be served, which is how a dish that looks
 *     fine and fits no one is found.
 */
import { MEAL_LIBRARY } from '../src/lib/meal-library-data'
import { fitDishToBudget } from '../src/lib/meal-library'
import { verifyProposal, computeSlotBudgets, methodSafeToShow, checkSlotAppropriate } from '../src/lib/meal-generation'
import { parseIngredientLine } from '../src/lib/portion-scaler'
import { computeMealMacros, lookupIngredient } from '../src/lib/food-db'
import { validateMealAgainstDiet, DIETARY_PREFERENCES } from '../src/lib/diet-rules'
import type { MealSlotName } from '../src/lib/meal-store'
import type { MacroTargets } from '../src/lib/types'
import type { RawProposal } from '../src/lib/meal-generation'

export const TARGET_GRID: { label: string; targets: MacroTargets }[] = [
  [1700, 135], [2000, 150], [2300, 160], [2700, 170], [3100, 180], [3040, 160],
].map(([kcal, protein]) => {
  const fat = Math.round((kcal * 0.28) / 9)
  const carbs = Math.round((kcal - protein * 4 - fat * 9) / 4)
  return { label: `${kcal}kcal/${protein}g`, targets: { calories: kcal, protein, carbs, fat } }
})

const SHAPES: { label: string; mealsPerDay: number; includeSnacks: boolean }[] = [
  { label: '3 meals + snack', mealsPerDay: 3, includeSnacks: true },
  { label: '3 meals', mealsPerDay: 3, includeSnacks: false },
]

const STRICT_LINE = /^(\d+(?:\.\d+)?)(g|ml)\s+\S|^(\d+(?:\.\d+)?)\s+(tbsp|tsp|cup|clove|cloves|slice|slices|scoop|scoops|medium|large|small)\s+\S|^(\d+)\s+[a-z]/i

export function strictLineProblems(text: string): string[] {
  const problems: string[] = []
  if (!STRICT_LINE.test(text.trim())) problems.push('not in grams or a plain count')
  // "8 oz chicken" passes as a count of something called oz, and the reader then costs 8 g of chicken while coverage reads 100%.
  const unit = /^\s*\d+(?:\.\d+)?\s+(oz|ounces?|lbs?|pounds?|kg|kilos?|pinch(?:es)?|cans?|tins?|handfuls?|dash(?:es)?|splash(?:es)?|sticks?|packs?|packets?|bunch(?:es)?)\b/i.exec(text)
  if (unit) problems.push(`"${unit[1]}" is a unit the ingredient reader misreads`)
  const line = parseIngredientLine(text)
  const entry = lookupIngredient(line.name)
  if (!entry) problems.push(`"${line.name}" is not a food the app can cost`)
  return problems
}


/** How one dish fares against the whole grid, through the real verifier, with no diet. */
export function servability(x: RawProposal): { pass: number; of: number; why: string; dens: number; kcal: number } {
  let pass = 0, of = 0
  let why = ''
  for (const shape of SHAPES) {
    for (const g of TARGET_GRID) {
      const budget = computeSlotBudgets(g.targets, shape.mealsPerDay, shape.includeSnacks)[x.slot as MealSlotName]
      if (!budget) continue
      of++
      const log: string[] = []
      // AS THE APP SERVES IT: re-portioned to the meal's own budget first.
      const opt = verifyProposal(fitDishToBudget(x, budget).dish, x.slot as MealSlotName, budget, [], log)
      if (opt) pass++
      else if (!why) why = (log[0] ?? '').replace(/^\[[a-z]+\]\s*"[^"]*":\s*/, '').slice(0, 90)
    }
  }
  const asWritten = computeMealMacros(x.ingredients.map(parseIngredientLine))
  return { pass, of, why, dens: asWritten.kcal > 0 ? (100 * asWritten.protein) / asWritten.kcal : 0, kcal: asWritten.kcal }
}

const slots: MealSlotName[] = ['breakfast', 'lunch', 'dinner', 'snack']
const bySlot = (s: MealSlotName) => MEAL_LIBRARY.filter(x => x.slot === s)

function main() {
  console.log(`MEAL LIBRARY: ${MEAL_LIBRARY.length} dishes`)
  for (const s of slots) console.log(`  ${s.padEnd(10)} ${bySlot(s).length}`)

  const cuisines = new Map<string, number>()
  for (const x of MEAL_LIBRARY) cuisines.set(x.cuisine, (cuisines.get(x.cuisine) ?? 0) + 1)
  console.log(`\nCUISINES (${cuisines.size}): ` + [...cuisines].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c.split(' (')[0]} ${n}`).join(', '))

  // STRUCTURE
  let problems = 0
  for (const x of MEAL_LIBRARY) {
    for (const line of x.ingredients) {
      const p = strictLineProblems(line)
      if (p.length) { problems++; console.log(`  LINE  [${x.slot}] ${x.name}: "${line}" — ${p.join('; ')}`) }
    }
    const slotIssue = checkSlotAppropriate(x.name, x.prep, x.slot as MealSlotName, x.ingredients.length)
    if (slotIssue) { problems++; console.log(`  SLOT  [${x.slot}] ${x.name}: ${slotIssue}`) }
    if (methodSafeToShow(x.prep) !== x.prep.trim()) { problems++; console.log(`  METHOD [${x.slot}] ${x.name}: names an amount, would be dropped`) }
    const m = computeMealMacros(x.ingredients.map(parseIngredientLine))
    if (m.coverage < 1) { problems++; console.log(`  COVER [${x.slot}] ${x.name}: coverage ${(m.coverage * 100).toFixed(0)}% — ${m.unmatched.join(', ')}`) }
  }
  console.log(`\nSTRUCTURE PROBLEMS: ${problems}`)

  // DIETS (derived from the ingredients by the app's own check)
  console.log('\nDIETS (dishes that pass each, of the slot):')
  const diets = ['vegetarian', 'vegan', 'pescatarian', 'dairy-free', 'gluten-free', 'egg-free', 'nut-free'].filter(d => (DIETARY_PREFERENCES as string[]).includes(d))
  for (const diet of diets) {
    const row = slots.map(s => {
      const n = bySlot(s).filter(x => validateMealAgainstDiet(x.ingredients.map(parseIngredientLine), [diet]).ok).length
      return `${s} ${n}/${bySlot(s).length}`
    })
    console.log(`  ${diet.padEnd(12)} ${row.join('   ')}`)
  }

  // SERVABILITY against the grid, through the real verifier
  console.log('\nSERVABILITY (share of target x shape cases a dish is accepted for, no diet):')
  const rate = MEAL_LIBRARY.map(x => ({ slot: x.slot as MealSlotName, name: x.name, ...servability(x) }))
  for (const s of slots) {
    const r = rate.filter(x => x.slot === s)
    const avg = r.reduce((a, b) => a + b.pass / Math.max(1, b.of), 0) / Math.max(1, r.length)
    const never = r.filter(x => x.pass === 0).length
    const weak = r.filter(x => x.pass > 0 && x.pass / x.of < 0.6).length
    console.log(`  ${s.padEnd(10)} mean ${(avg * 100).toFixed(0)}%   never served ${never}   under 60% ${weak}   (${r.length} dishes)`)
  }
  const worst = rate.filter(x => x.pass / Math.max(1, x.of) < 0.6).sort((a, b) => a.pass / a.of - b.pass / b.of)
  if (worst.length) {
    console.log('\nDISHES SERVED BELOW 60% OF CASES:')
    for (const w of worst) console.log(`  ${(100 * w.pass / w.of).toFixed(0).padStart(3)}%  ${w.dens.toFixed(1).padStart(4)}g/100kcal ${String(w.kcal).padStart(4)}kcal [${w.slot}] ${w.name}`)
  }
}

if (process.argv[1] && process.argv[1].endsWith('measure-meal-library.ts')) main()

/**
 * test:meals-costed-as-weighed — a meal is counted in the state its card tells
 * her to weigh it (H32, run 7, 14 Oct 2026; docs/plans/meals-costed-as-weighed.md).
 *
 * The card read "177g raw chicken breast, 53g dry couscous" over numbers the
 * food table had worked out before it learnt "raw" and "dry": the cooked
 * breast and the cooked couscous. The lookup was already right; the stored
 * numbers were never asked again. This gate:
 *   1. reproduces it through the REAL read (readPools over a stub database):
 *      a stored row carrying the pre-fix numbers reads back costed as weighed;
 *   2. keeps the stored numbers WHOLE when today's table cannot cost the lines
 *      as well as it would a new meal (an unknown food, an unread amount, a
 *      line that is not a line), at the same floor a new meal must clear;
 *   3. shows every reader gets the same numbers (the day's totals, a swap);
 *   4. closes the inverse gap: a line naming the state an entry has no
 *      figures for is a miss, never costed in the wrong state, and a miss is
 *      refused under every diet (fail-closed);
 *   5. holds the meal library to the same rule.
 *
 * One exit, and the number of checks that ran is printed, so a crash or an
 * early return cannot read as a pass.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let failures = 0
let ran = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`) }
}
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

// --- A stub of the one query readPools makes ----------------------------------
type StoredRow = { slot: string; pool_index: number; name: string; ingredients: unknown; macros: { kcal: number; protein: number; carbs: number; fat: number }; tags: string[] }
let rows: StoredRow[] = []
const stub = {
  from: () => ({
    select: () => ({
      eq: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }),
    }),
  }),
}
const { setSupabaseClient } = await import('../src/lib/supabase')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
setSupabaseClient(stub as any)
const { readPools, swapPoolMeal } = await import('../src/lib/meal-store')
const { costStoredMeal, MIN_COVERAGE } = await import('../src/lib/meal-costing')
const { computeMealMacros, lookupIngredient, stateOf } = await import('../src/lib/food-db')
const { assembleDay } = await import('../src/lib/meal-generation')
const { validateMealAgainstDiet, DIETARY_PREFERENCES } = await import('../src/lib/diet-rules')
const { parseIngredientLines } = await import('../src/lib/portion-scaler')
const { MEAL_LIBRARY } = await import('../src/lib/meal-library-data')

const g = (name: string, quantity: number, unit = 'g') => ({ name, quantity, unit })
const H32_LINES = [g('raw chicken breast', 177), g('dry couscous', 53)]
// What the pre-fix food table (git 45264e98) made of those two lines, run on
// 14 Oct: the cooked breast and the cooked couscous. This is the INPUT, the
// stored row as her phone holds it; what it reads back as is the app's.
const H32_STORED = { kcal: 351, protein: 56.9, carbs: 12.2, fat: 6.5 }
const row = (slot: string, i: number, name: string, ingredients: unknown, macros: StoredRow['macros']): StoredRow =>
  ({ slot, pool_index: i, name, ingredients, macros, tags: [] })

async function main(): Promise<void> {
  console.log('\n1. A stored meal reads back costed as it is weighed (the H32 card)')
  {
    rows = [row('dinner', 0, 'Greek Chicken Souvlaki with Herbed Couscous', H32_LINES, H32_STORED)]
    const read = (await readPools('p')).pools.dinner?.[0]?.macros
    check('the raw chicken and dry couscous read 412 kcal / 46.6 P / 41 C / 4.9 F (their own state), not the stored 351 / 56.9 / 12.2 / 6.5',
      read?.calories === 412 && read?.protein === 46.6 && read?.carbs === 41 && read?.fat === 4.9, read)
    const own = computeMealMacros(H32_LINES)
    check('...which is exactly what the food table makes of the lines today', read?.calories === own.kcal && read?.protein === own.protein && read?.carbs === own.carbs, { read, own: own.kcal })

    const pasta = [g('dry pasta', 90), g('raw chicken thigh', 150), g('tomato passata', 150)]
    rows = [row('dinner', 0, 'Chicken thigh ragu', pasta, { kcal: 591, protein: 46.8, carbs: 40.2, fat: 18.4 })]
    const p = (await readPools('p')).pools.dinner?.[0]?.macros
    const pOwn = computeMealMacros(pasta)
    check('a dry-pasta, raw-thigh dinner reads its own numbers too', p?.calories === pOwn.kcal && p?.carbs === pOwn.carbs, { p, own: pOwn.kcal })

    const fresh = [g('chicken breast', 150), g('white rice cooked', 200), g('olive oil', 10)]
    const fm = computeMealMacros(fresh)
    rows = [row('lunch', 0, 'Chicken and rice', fresh, { kcal: fm.kcal, protein: fm.protein, carbs: fm.carbs, fat: fm.fat })]
    const f = (await readPools('p')).pools.lunch?.[0]?.macros
    check('a meal whose stored numbers already match its lines reads the same (nothing moves that was right)',
      f?.calories === fm.kcal && f?.protein === fm.protein && f?.carbs === fm.carbs && f?.fat === fm.fat, f)
  }

  console.log('\n2. Kept WHOLE when today\'s table cannot cost the lines as well as it would a new meal')
  {
    const stored = { calories: 640, protein: 41, carbs: 58, fat: 22 }
    const unknown = costStoredMeal([g('raw chicken breast', 150), g('mystery stew', 250)], stored)
    check('a food the table does not know, most of the dish: the stored numbers, untouched', !unknown.recosted && JSON.stringify(unknown.macros) === JSON.stringify(stored), unknown)
    // NINE readable lines and one the reader cannot weigh: 90% of the lines, so the coverage floor alone would
    // re-cost it and the unweighed food would simply vanish from the count. The amount rule is what keeps it.
    const nine = [g('raw chicken breast', 150), g('dry couscous', 60), g('olive oil', 10), g('cucumber', 80), g('tomato', 80), g('red onion', 30), g('greek yoghurt', 60), g('lemon juice', 10), g('spinach', 40)]
    const unreadLines = [...nine, { name: 'feta cheese', quantity: 1, unit: 'knob' }]
    const unread = costStoredMeal(unreadLines, stored)
    check('an amount the reader cannot weigh, even in a dish otherwise costed: the stored numbers, untouched',
      computeMealMacros(unreadLines).coverage >= MIN_COVERAGE && !unread.recosted && JSON.stringify(unread.macros) === JSON.stringify(stored), { unread, coverage: computeMealMacros(unreadLines).coverage })
    // THE FLOOR BINDS HERE: 79 g of 100 costed is under it, 81 g is over it.
    const under = costStoredMeal([g('raw chicken breast', 79), g('mystery stew', 21)], stored)
    const over = costStoredMeal([g('raw chicken breast', 81), g('mystery stew', 19)], stored)
    check(`79% costed is under the ${MIN_COVERAGE * 100}% floor a new meal must clear: kept`, !under.recosted && under.macros === stored, under)
    check('81% costed is over it: re-costed, as a new meal at 81% would be accepted and shown', over.recosted && over.macros.calories === computeMealMacros([g('raw chicken breast', 81), g('mystery stew', 19)]).kcal, over)
    check('lines that are not lines (text, nothing, a missing amount): kept, and nothing throws',
      [['177g raw chicken breast'], null, [], [{ name: 'raw chicken breast', unit: 'g' }]].every(x => {
        try { const r = costStoredMeal(x, stored); return !r.recosted && r.macros === stored } catch { return false }
      }))
    const gen = stripComments(readFileSync(join(ROOT, 'src/lib/meal-generation.ts'), 'utf8'))
    check('a new meal is refused at the SAME floor: meal-generation has no coverage floor of its own and imports this one',
      !/\bMIN_COVERAGE\s*=/.test(gen) && /import\s*\{[^}]*\bMIN_COVERAGE\b[^}]*\}\s*from\s*'\.\/meal-costing'/.test(gen))
  }

  console.log('\n3. Every reader gets the same numbers')
  {
    const breakfast = [g('oats', 80), g('milk', 250, 'ml')]
    const lunch = [g('raw chicken breast', 177), g('dry couscous', 53)]
    const dinner = [g('raw cod', 200), g('dry basmati rice', 75), g('olive oil', 10)]
    rows = [
      row('breakfast', 0, 'Porridge', breakfast, { kcal: 450, protein: 19, carbs: 66, fat: 12 }),
      row('lunch', 0, 'Souvlaki', lunch, H32_STORED),
      row('dinner', 0, 'Cod and rice', dinner, { kcal: 491, protein: 48.4, carbs: 18.8, fat: 11.9 }),
    ]
    const { pools } = await readPools('p')
    const own = [breakfast, lunch, dinner].map(l => computeMealMacros(l))
    const sum = { calories: own.reduce((a, m) => a + m.kcal, 0), protein: own.reduce((a, m) => a + m.protein, 0), carbs: own.reduce((a, m) => a + m.carbs, 0), fat: own.reduce((a, m) => a + m.fat, 0) }
    const day = assembleDay(pools, sum)
    check('the day\'s totals are the meals\' own costing, not the stored numbers', Math.round(day.totals.calories) === sum.calories && Math.abs(day.totals.carbs - sum.carbs) < 0.05, { totals: day.totals, sum })
    check('...and the day is judged on them (on target against its own food)', day.withinTolerance === true, day.totals)
    rows = [row('lunch', 0, 'Chicken and rice', [g('chicken breast', 150)], { kcal: 248, protein: 46.5, carbs: 0, fat: 5.4 }), row('lunch', 1, 'Souvlaki', lunch, H32_STORED)]
    const swapped = await swapPoolMeal('p', 'lunch', 'Chicken and rice')
    check('a swap hands back the same costing the card shows', swapped?.name === 'Souvlaki' && swapped.macros.calories === own[1].kcal, swapped?.macros)
  }

  console.log('\n4. A line naming a state the food table has no figures for is a miss, never the wrong state')
  {
    const RAW = ['salmon', 'beef mince 5% fat', 'beef mince 20% fat', 'chicken mince', 'tuna steak fresh', 'trout', 'red snapper', 'squid', 'scallops', 'oysters', 'chicken liver', 'taro root']
    const COOKED = ['duck breast', 'venison', 'split peas', 'barley']
    const wrong: string[] = []
    const lost: string[] = []
    for (const name of RAW) {
      if (lookupIngredient(`cooked ${name}`) !== null) wrong.push(`cooked ${name}`)
      const e = lookupIngredient(name)
      if (!e || e.name !== name || lookupIngredient(`raw ${name}`) !== e) lost.push(name)
    }
    for (const name of COOKED) {
      for (const w of ['raw', 'dried', 'dry']) if (lookupIngredient(`${w} ${name}`) !== null) wrong.push(`${w} ${name}`)
      const e = lookupIngredient(name)
      if (!e || e.name !== name || lookupIngredient(`cooked ${name}`) !== e) lost.push(name)
    }
    check(`no line naming the other state is costed with these ${RAW.length + COOKED.length} foods' figures`, wrong.length === 0, wrong)
    check('the line as usually written, and in the state the figures describe, still reaches the same food', lost.length === 0, lost)
    check('the H32 lines still reach the state they name', lookupIngredient('raw chicken breast')?.name === 'chicken breast raw' && lookupIngredient('dry couscous')?.name === 'couscous dry')
    const miss = parseIngredientLines(['150g cooked salmon', '100g broccoli'])
    const costed = computeMealMacros(miss)
    check('"cooked salmon" is not costed at all (it is asked about), not costed as raw salmon', costed.unmatched.includes('cooked salmon') && costed.kcal === computeMealMacros(parseIngredientLines(['100g broccoli'])).kcal, costed.unmatched)
    const permissive = DIETARY_PREFERENCES.filter(d => validateMealAgainstDiet(miss, [d]).ok)
    check(`and a miss is refused under every one of the ${DIETARY_PREFERENCES.length} diets (fail-closed, so no verdict became more permissive)`, DIETARY_PREFERENCES.length > 0 && permissive.length === 0, permissive)
  }

  console.log('\n5. The meal library is costed in the state it names')
  {
    /** A state word against the state an entry's figures describe: wrong when the entry has a state and it is not the one named. */
    const wrongState = (word: string, st: string | undefined) => {
      const wanted = word === 'dried' ? 'dry' : word === 'uncooked' ? (st === 'raw' ? 'raw' : 'dry') : word
      return !!st && st !== wanted
    }
    const bad: string[] = []
    let named = 0
    for (const dish of MEAL_LIBRARY) {
      for (const l of parseIngredientLines(dish.ingredients)) {
        const word = /\b(raw|dry|dried|uncooked|cooked)\b/i.exec(l.name)?.[1]?.toLowerCase()
        if (!word) continue
        named++
        const e = lookupIngredient(l.name)
        const st = e ? stateOf(e) : undefined
        if (e && wrongState(word, st)) bad.push(`${dish.name}: ${l.name} -> ${e.name} (${st})`)
      }
    }
    check(`every library line that names a state (${named}) reaches that state, or a food whose state does not change its numbers`, named > 100 && bad.length === 0, bad)
    // The detector, on the cases it exists for: H32's two lines as the old table read them, and two right ones.
    check('...and the detector sees a wrong one ("raw" on cooked figures, "dry" on cooked figures) and passes right ones',
      wrongState('raw', 'cooked') && wrongState('dry', 'cooked') && !wrongState('dried', 'dry') && !wrongState('uncooked', 'raw') && !wrongState('cooked', undefined))
  }
}

try {
  await main()
} catch (err) {
  failures++
  console.error('  FAIL: the gate threw —', err)
}
console.log(`\n${ran} checks ran, ${failures} failed.`)
if (failures > 0) process.exit(1)

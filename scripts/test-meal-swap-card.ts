/**
 * test:meal-swap-card — live test 19 Oct 2026, findings 6 and 7 (docs/audits/live-test-2026-10-19-findings.md).
 *
 * The coach's dinner swap card showed the current dinner at 466 kcal while Nutrition showed it at 222 (the card read
 * the SAVED dish, the screen the SERVED one); its reason line said "higher-calorie" over a dish with fewer calories
 * (the model's own words, written before any number existed); and on Apply breakfast and the snack were resized with
 * no word on the card, under a banner saying "25% smaller" when they fell 24% and 35%. Held here:
 *   §1 the card's before and after are the meal as the screen serves it now and as the trial serves it after;
 *   §2 every other meal the swap moves is on the card before the tap, and matches what really happens on the tap;
 *   §3 no model sentence on the card;
 *   §4 the chat wires the same trial the screen's week runs (one function, the hook's).
 * The banner's per-meal sizes are held in test:hold-around-pins §2.
 */
import { readFileSync } from 'node:fs'
import { serveMealWeek, buildRotation, datesFrom, pinsFromPicks } from '../src/lib/meal-rotation'
import { computeMealMacros } from '../src/lib/food-db'
import { knockOnOfPin } from '../src/lib/meal-knock-on'
import { swapDiffFromTrial } from '../src/lib/meal-swap-proposal'
import type { PoolOption } from '../src/lib/meal-generation'
import type { MealSlotName } from '../src/lib/meal-store'
import type { ProposalDiff } from '../src/lib/pending-actions-store'

let failures = 0
let ran = 0
function check(label: string, ok: boolean, extra?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`) }
}
const strip = (x: string) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const read = (p: string) => strip(readFileSync(p, 'utf8'))

const dish = (slot: MealSlotName, name: string, chicken: number, rice: number, oil: number): PoolOption => {
  const ingredients = [{ name: 'chicken breast', quantity: chicken, unit: 'g' }, { name: 'white rice', quantity: rice, unit: 'g' }, { name: 'olive oil', quantity: oil, unit: 'g' }]
  const c = computeMealMacros(ingredients)
  return { slot, name, ingredients, tags: [], macros: { calories: Math.round(c.kcal), protein: Math.round(c.protein), carbs: Math.round(c.carbs), fat: Math.round(c.fat) } } as unknown as PoolOption
}
const pools: Partial<Record<MealSlotName, PoolOption[]>> = {
  breakfast: [dish('breakfast', 'Oats bowl', 60, 150, 8), dish('breakfast', 'Rice porridge', 55, 160, 7), dish('breakfast', 'Egg rice', 65, 140, 9)],
  lunch: [dish('lunch', 'Chicken salad', 150, 200, 12), dish('lunch', 'Rice and greens', 140, 220, 11), dish('lunch', 'Grain bowl', 160, 190, 13)],
  dinner: [dish('dinner', 'Tray bake', 170, 220, 14), dish('dinner', 'Rice pot', 160, 240, 12), dish('dinner', 'Baked chicken', 180, 210, 15), dish('dinner', 'Light supper', 120, 90, 5), dish('dinner', 'Big feast', 260, 360, 22)],
}
const sum = (ms: PoolOption[]) => ms.reduce((a, o) => ({ calories: a.calories + o.macros.calories, protein: a.protein + o.macros.protein, carbs: a.carbs + o.macros.carbs, fat: a.fat + o.macros.fat }), { calories: 0, protein: 0, carbs: 0, fat: 0 })
const today = '2026-09-27'
const dates = datesFrom(today, 7)
const shape = { mealsPerDay: 3, includeSnacks: false, batchCooking: false }
const baseDiff = (slot: MealSlotName, from: PoolOption, to: PoolOption): ProposalDiff => ({
  rows: [
    { field: 'Meal', before: from.name, after: to.name },
    { field: 'Calories', before: `${from.macros.calories} kcal`, after: `${to.macros.calories} kcal` },
    { field: 'Protein', before: `${from.macros.protein}g`, after: `${to.macros.protein}g` },
  ],
  implications: [], reversible: true,
})
const row = (d: ProposalDiff, f: string) => d.rows.find(r => r.field === f)

console.log('\n§1 The card\'s numbers are the screen\'s')
// TARGETS CHOSEN SO TODAY'S DINNER IS SERVED RESIZED (the live case: saved 466, served 222). Searched, not guessed:
// the smallest scale of the default day's totals at which today's served dinner differs from its saved size.
let found: { scale: number; served: PoolOption; saved: PoolOption } | null = null
for (const scale of [0.85, 0.8, 0.9, 0.75, 1.15, 1.2, 0.7, 1.25]) {
  const t0 = sum([pools.breakfast![0], pools.lunch![0], pools.dinner![0]])
  const targets = { calories: Math.round(t0.calories * scale), protein: Math.round(t0.protein * scale), carbs: Math.round(t0.carbs * scale), fat: Math.round(t0.fat * scale) }
  const week = serveMealWeek({ today, dates, todaysPins: {}, pinsByDate: {}, pools, targets, softLikedFoods: [], shape, rotation: buildRotation(pools, targets, [], shape) })
  const served = week[0].day.chosen.dinner
  const saved = served ? pools.dinner!.find(o => served.name.startsWith(o.name)) : undefined
  if (served && saved && Math.round(served.macros.calories) !== saved.macros.calories) { found = { scale, served, saved }; break }
}
check('the fixture is the case: today\'s dinner is served at a different size from the one saved', !!found, found && { scale: found.scale, served: found.served.macros.calories, saved: found.saved.macros.calories })
const t0 = sum([pools.breakfast![0], pools.lunch![0], pools.dinner![0]])
const scale = found?.scale ?? 0.85
const targets = { calories: Math.round(t0.calories * scale), protein: Math.round(t0.protein * scale), carbs: Math.round(t0.carbs * scale), fat: Math.round(t0.fat * scale) }
const serving = { today, dates, todaysPins: {}, pinsByDate: {}, pools, targets, softLikedFoods: [], shape, rotation: buildRotation(pools, targets, [], shape) }
const before = serveMealWeek(serving)
const current = before[0].day.chosen.dinner!
const target = pools.dinner!.find(o => !current.name.startsWith(o.name) && o.name !== 'Big feast')!
const trial = knockOnOfPin({ serving, date: today, slot: 'dinner', option: target, listDates: [], existing: true })
const savedCurrent = pools.dinner!.find(o => current.name.startsWith(o.name)) ?? current
const card = swapDiffFromTrial(baseDiff('dinner', savedCurrent, target), trial, today, 'dinner')
check('BEFORE is the dinner as served now, not as saved', row(card, 'Calories')?.before === `${Math.round(current.macros.calories)} kcal`, { card: row(card, 'Calories'), served: current.macros.calories, saved: savedCurrent.macros.calories })
const afterServed = trial.after?.find(d => d.date === today)?.day.chosen.dinner
check('AFTER is the new dinner as the trial serves it with the swap in', !!afterServed && row(card, 'Calories')?.after === `${Math.round(afterServed.macros.calories)} kcal` && row(card, 'Protein')?.after === `${Math.round(afterServed.macros.protein)}g`, { card: row(card, 'Calories'), afterServed: afterServed?.macros })
check('...and the trial pins the dish as it is (no copy added to her options, nothing tagged as her own)', trial.after?.[0].pools.dinner?.length === pools.dinner!.length)

console.log('\n§2 Every other meal it moves is said before the tap, and is what the tap really does')
{
  // INDEPENDENT OF THE CODE UNDER TEST: pick the dish by name for today, as the screen's swap writes it, and serve again.
  const pin = pinsFromPicks({ dinner: target.name }, pools)
  const now = serveMealWeek({ ...serving, todaysPins: pin })
  const moved: string[] = []
  for (const s of ['breakfast', 'lunch'] as MealSlotName[]) {
    const a = before[0].day.chosen[s], b = now[0].day.chosen[s]
    if (a && b && (a.name !== b.name || Math.abs(a.macros.calories - b.macros.calories) / a.macros.calories >= 0.1)) moved.push(s)
  }
  check('the fixture is the case: the tap really moves another of today\'s meals', moved.length >= 1, moved)
  const said = (card.implications ?? []).map(l => l.text)
  check('the card carries the trial\'s lines, before any tap', said.length >= 1, said)
  check('every meal the tap really moves is named on the card', moved.every(s => said.some(t => t.toLowerCase().includes(s))), { moved, said })
  check('...and the trial reports exactly those (no meal claimed that the tap does not move)', trial.changes.filter(c => c.date === today).map(c => c.slot).sort().join() === moved.sort().join(), { trial: trial.changes.filter(c => c.date === today), moved })
  const noTrial = swapDiffFromTrial(baseDiff('dinner', savedCurrent, target), null, today, 'dinner')
  check('no trial: the card says the rest could not be checked, never "nothing else changes"', (noTrial.implications ?? []).some(l => /couldn.t|could not/i.test(l.text)), noTrial.implications)
}

console.log('\n§3 No model sentence on the card')
{
  const src = read('src/lib/meal-swap-proposal.ts')
  check('the swap builder never prints the model\'s "reason" as the card\'s rationale', !/rationale:\s*typeof input\.rawArgs\.reason/.test(src) && !/rawArgs\.reason/.test(src))
}

console.log('\n§4 The chat runs the screen\'s trial')
{
  const chat = read('src/components/ChatAssistant.tsx')
  const at = chat.indexOf("result.proposal.kind === 'propose_meal_swap' && result.proposal.rawArgs")
  const branch = at >= 0 ? chat.slice(at, at + 3000) : ''
  check('the swap card is built through the hook\'s trial, pinning the existing dish', /onMealKnockOn\(swap\.date, swap\.payload\.slot, swap\.chosen, true\)/.test(branch))
  check('...and its numbers and lines come from that trial', /diff: swapDiffFromTrial\(swap\.diff, trial, swap\.date, swap\.payload\.slot\)/.test(branch))
}

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.error(`${failures} check(s) failed`); process.exit(1) }
console.log('meal swap card: all checks passed')

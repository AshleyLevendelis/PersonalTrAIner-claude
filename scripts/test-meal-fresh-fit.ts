/**
 * test:meal-fresh-fit — a NEW plan's dishes land a day on her numbers (2 Nov 2026).
 *
 * Ashley, looking at a plan the app had just written: "Only 2 of your 7 breakfasts fit your targets right now ...
 * why are the meals not fitting the macros when I've not made any changes and that's just what the app prescribed".
 * verifyProposal checks each dish against its own meal's calories and a protein floor, never its carbs or fat, so
 * under the 10% day bands a writer's dish could pass every check and serve no day on target. Only a library dish
 * was ever asked "does this land a day?" (19 Oct). Now every round's dishes are, while a round is left to replace
 * them. Driven through generateMealPools against a fake meal writer and a fake database:
 *   1. a writer that sends good and bad breakfasts: the plan keeps only breakfasts that land a day, still reaches
 *      seven (the writer is asked again), and nothing dropped is left saved;
 *   2. a writer whose breakfasts NONE fit: nothing is dropped (the plan is never emptied);
 *   3. the last round drops nothing: dishes it adds are kept, so the plan still holds seven;
 *   4. on the "more options" path, a dish she already had is never dropped.
 * Every check runs every time.
 */
import type { MealSlotName } from '../src/lib/meal-store'
import type { MacroTargets } from '../src/lib/types'

process.env.VITE_SUPABASE_URL = 'http://fake.local'
process.env.VITE_SUPABASE_ANON_KEY = 'anon'

let ran = 0
let failed = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failed++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 500)}` : ''}`) }
}

type Row = Record<string, unknown>
const db: Record<string, Row[]> = { meal_plan_slots: [] }
function fakeFrom(table: string) {
  const filters: ((r: Row) => boolean)[] = []
  let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
  let payload: Row | Row[] | null = null
  const exec = () => {
    db[table] ??= []
    if (op === 'insert') { for (const r of Array.isArray(payload) ? payload : [payload]) db[table].push({ id: crypto.randomUUID(), created_at: new Date(0).toISOString(), ...r }); return { data: null, error: null } }
    if (op === 'update') { for (const r of db[table]) if (filters.every(f => f(r))) Object.assign(r, payload); return { data: null, error: null } }
    if (op === 'delete') { db[table] = db[table].filter(r => !filters.every(f => f(r))); return { data: null, error: null } }
    return { data: db[table].filter(r => filters.every(f => f(r))).map(r => ({ ...r })), error: null }
  }
  const api: Record<string, unknown> = {
    select: () => api,
    insert: (r: Row | Row[]) => { op = 'insert'; payload = r; return api },
    update: (r: Row) => { op = 'update'; payload = r; return api },
    delete: () => { op = 'delete'; return api },
    eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return api },
    in: (c: string, vs: unknown[]) => { filters.push(r => vs.includes(r[c])); return api },
    order: () => api,
    maybeSingle: () => api,
    single: () => api,
    then: (res: (v: unknown) => void, rej?: (e: unknown) => void) => Promise.resolve(exec()).then(res, rej),
  }
  return api
}

// THE DISHES, found by probing the real checks (2 Nov 2026), not by feel. A good breakfast is balanced; a bad one
// is salmon, eggs and cheese: it scales to the breakfast's calories and clears the protein floor, so verifyProposal
// accepts it, and its 15 g of carbs and 47 g of fat leave no day inside the 10% bands. Section 0 re-measures both.
const GOOD_BREAKFAST = ['90g dry oats', '300ml semi-skimmed milk', '200g greek yoghurt', '100g blueberries', '15g whey protein', '20g almonds']
const BAD_BREAKFAST = ['180g salmon', '3 eggs', '30g cheddar cheese', '1 tbsp olive oil', '30g dry oats']
const LUNCH = ['180g raw chicken breast', '110g dry white rice', '100g broccoli', '1 tbsp olive oil']
const DINNER = ['160g raw chicken breast', '330g raw potato', '100g green beans', '1 tbsp olive oil']
const SNACK = ['150g greek yoghurt', '100g banana', '15g almonds']

/** What the fake writer sends for breakfast in each round: 'good' / 'bad' per dish asked. */
let breakfastPlan: (round: number, i: number) => 'good' | 'bad' = () => 'good'
let callNo = 0
const asked: { round: number; breakfast: number }[] = []
;(globalThis as { fetch: unknown }).fetch = async (_url: string, init?: { body?: string }) => {
  const body = JSON.parse(init?.body ?? '{}') as { slots: { slot: MealSlotName; count: number }[] }
  // A round can go as two requests (seven a meal is 36 dishes, over the 28 a request may ask): the breakfast round
  // is counted off the requests that ask for breakfast, which is one per round.
  const wantsBreakfast = body.slots.some(s => s.slot === 'breakfast' && s.count > 0)
  if (wantsBreakfast) callNo++
  const round = callNo
  asked.push({ round, breakfast: body.slots.find(s => s.slot === 'breakfast')?.count ?? 0 })
  const meals = body.slots.flatMap(({ slot, count }) => Array.from({ length: count }, (_, i) => {
    const kind = slot === 'breakfast' ? breakfastPlan(round, i) : 'good'
    const ingredients = slot === 'breakfast' ? (kind === 'good' ? GOOD_BREAKFAST : BAD_BREAKFAST)
      : slot === 'lunch' ? LUNCH : slot === 'dinner' ? DINNER : SNACK
    return { slot, name: `${slot} ${kind} ${round}-${i}`, ingredients, prep: 'Cook it.', cuisine: 'British / Classic' }
  }))
  return { ok: true, status: 200, json: async () => ({ meals }) }
}

async function main() {
  const { setSupabaseClient } = await import('../src/lib/supabase')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSupabaseClient({ from: fakeFrom } as any)
  const { generateMealPools, assembleDay } = await import('../src/lib/meal-generation')
  type Pools = Awaited<ReturnType<typeof generateMealPools>>['accepted']
  const targets: MacroTargets = { calories: 2600, protein: 170, carbs: 320, fat: 75 }
  const base = { targets, dietaryPreferences: [], mealsPerDay: 3, includeSnacks: true, library: false as const }
  const fitsIn = (pools: Pools, slot: MealSlotName, name: string) => {
    const o = (pools[slot] ?? []).find(x => x.name === name)
    return !!o && assembleDay(pools, targets, {}, [], { [slot]: o }).withinTolerance
  }
  const reset = () => { db.meal_plan_slots = []; callNo = 0; asked.length = 0 }
  const savedNames = (profileId: string, slot: string) => db.meal_plan_slots.filter(r => r.profile_id === profileId && r.slot === slot).map(r => String(r.name)).sort()

  console.log('\n0. The fixture: a good breakfast lands a day and a bad one does not (measured, so the cases bind)')
  {
    const { verifyProposal, computeSlotBudgets } = await import('../src/lib/meal-generation')
    const budgets = computeSlotBudgets(targets, 3, true)
    const log: string[] = []
    const v = (slot: MealSlotName, ingredients: string[], name: string) => verifyProposal({ slot, name, ingredients, prep: 'Cook it.', cuisine: 'British / Classic' }, slot, budgets[slot]!, [], log)
    const good = v('breakfast', GOOD_BREAKFAST, 'g'), bad = v('breakfast', BAD_BREAKFAST, 'b')
    const others = { lunch: [v('lunch', LUNCH, 'l')!], dinner: [v('dinner', DINNER, 'd')!], snack: [v('snack', SNACK, 's')!] }
    check('both breakfasts, and the other meals, pass the meal checks (so the old plan kept a bad one)', !!good && !!bad && Object.values(others).every(o => !!o[0]), log)
    const day = (b: NonNullable<typeof good>) => assembleDay({ breakfast: [b], ...others }, targets, {}, [], { breakfast: b }).withinTolerance
    check('a good breakfast lands a day on her numbers', !!good && day(good))
    check('a bad one does not', !!bad && !day(bad))
  }

  console.log('\n1. Good and bad breakfasts: only the ones that land a day are kept, and the plan still reaches seven')
  reset()
  breakfastPlan = (_r, i) => (i % 2 === 0 ? 'good' : 'bad')
  const r1 = await generateMealPools({ ...base, profileId: 'p1' })
  const b1 = r1.accepted.breakfast ?? []
  const fit1 = b1.filter(o => fitsIn(r1.accepted, 'breakfast', o.name))
  check('the plan holds seven breakfasts', b1.length === 7, b1.map(o => o.name))
  check('...and every one of them lands a day on her numbers', fit1.length === 7, { fit: fit1.length, names: b1.map(o => o.name) })
  check('...the dropped ones are named in the log', r1.rejectionLog.filter(l => /dropped after round \d, no day of hers lands/.test(l)).length >= 3, r1.rejectionLog.filter(l => /dropped/.test(l)))
  check('...the writer was asked again for breakfasts to replace them', asked.filter(a => a.breakfast > 0).length >= 2, asked)
  check('...and what is saved is what was kept, nothing dropped left on disk', JSON.stringify(savedNames('p1', 'breakfast')) === JSON.stringify(b1.map(o => o.name).sort()), { saved: savedNames('p1', 'breakfast'), kept: b1.map(o => o.name) })
  check('...the other meals are untouched (seven each)', ['lunch', 'dinner', 'snack'].every(s => (r1.accepted[s as MealSlotName] ?? []).length === 7), ['lunch', 'dinner', 'snack'].map(s => (r1.accepted[s as MealSlotName] ?? []).length))

  console.log('\n2. Breakfasts NONE of which fit: nothing is dropped, so the plan is never emptied')
  reset()
  breakfastPlan = () => 'bad'
  const r2 = await generateMealPools({ ...base, profileId: 'p2' })
  check('the plan still holds seven breakfasts', (r2.accepted.breakfast ?? []).length === 7, (r2.accepted.breakfast ?? []).length)
  check('...none dropped', !r2.rejectionLog.some(l => /\[breakfast\].*dropped after round/.test(l)))

  console.log('\n3. The last round drops nothing')
  reset()
  // Round 1: three good and the rest bad; rounds 2 and 3: only bad. Rounds 1 and 2 keep the three good ones; the
  // last round's bad ones are kept so the plan holds seven (her "seven" ruling), and the offer says fewer fit.
  breakfastPlan = (round, i) => (round === 1 && i < 3 ? 'good' : 'bad')
  const r3 = await generateMealPools({ ...base, profileId: 'p3' })
  const b3 = r3.accepted.breakfast ?? []
  check('the plan holds seven breakfasts', b3.length === 7, b3.map(o => o.name))
  check('...the three good ones are among them', b3.filter(o => / good /.test(o.name)).length === 3, b3.map(o => o.name))
  check('...and the last round\'s dishes were kept, not dropped', b3.filter(o => / bad 3-/.test(o.name)).length === 4, b3.map(o => o.name))

  console.log('\n4. "More options": a dish she already has is never dropped')
  reset()
  db.meal_plan_slots.push(
    { id: 'x1', profile_id: 'p4', slot: 'breakfast', pool_index: 0, name: 'her old bad breakfast', ingredients: BAD_BREAKFAST.map(l => ({ name: l, quantity: 0, unit: '' })), macros: { calories: 700, protein: 50, carbs: 5, fat: 50 }, tags: [], prep: '' },
  )
  breakfastPlan = (_r, i) => (i % 2 === 0 ? 'good' : 'bad')
  await generateMealPools({ ...base, profileId: 'p4', onlySlots: ['breakfast'], appendToExisting: true, poolSize: 3 })
  check('her own earlier breakfast is still saved', savedNames('p4', 'breakfast').includes('her old bad breakfast'), savedNames('p4', 'breakfast'))

  console.log(`\n${ran} checks ran.`)
  if (failed > 0) { console.error(`${failed} check(s) FAILED.`); process.exit(1) }
  console.log('A new plan keeps only dishes that land a day, while a round is left to replace them.')
}

main().catch(err => { console.error(err); process.exit(1) })

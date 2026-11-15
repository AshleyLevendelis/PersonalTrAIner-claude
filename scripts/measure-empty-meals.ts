/**
 * measure:empty-meals — A NEW PLAN, THE MEAL WRITER UNREACHABLE OR EMPTY: WHICH MEALS END WITH NOTHING? (15 Nov 2026,
 * the coeliac nurse: vegan + gluten-free, no tofu, avocado or oats, 2,053 kcal / 156 g, three meals and a snack, got
 * breakfast and a snack only.) Runs the real new-plan path with the writer switched off and the library on, over the
 * nurse and a spread of diets, and prints how many dishes each meal ends with. Nothing is asserted; it prints.
 */
import type { MealSlotName } from '../src/lib/meal-store'
type Row = Record<string, unknown>
const db: Record<string, Row[]> = {}
const fakeFrom = (table: string) => {
  const filters: ((r: Row) => boolean)[] = []
  let op: 'select' | 'insert' | 'delete' | 'update' | 'upsert' = 'select'
  let payload: Row | Row[] | null = null
  const exec = () => {
    db[table] ??= []
    if (op === 'insert' || op === 'upsert') { for (const r of Array.isArray(payload) ? payload : [payload]) db[table].push({ id: crypto.randomUUID(), ...r }); return { data: null, error: null } }
    if (op === 'update') { for (const r of db[table]) if (filters.every(f => f(r))) Object.assign(r, payload); return { data: null, error: null } }
    if (op === 'delete') { db[table] = db[table].filter(r => !filters.every(f => f(r))); return { data: null, error: null } }
    return { data: db[table].filter(r => filters.every(f => f(r))).map(r => ({ ...r })), error: null }
  }
  const api: Record<string, unknown> = {
    select: () => api, insert: (r: Row | Row[]) => { op = 'insert'; payload = r; return api }, upsert: (r: Row | Row[]) => { op = 'upsert'; payload = r; return api },
    update: (r: Row) => { op = 'update'; payload = r; return api }, delete: () => { op = 'delete'; return api },
    eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return api }, in: (c: string, vs: unknown[]) => { filters.push(r => vs.includes(r[c])); return api },
    order: () => api, maybeSingle: () => api, single: () => api,
    then: (res: (v: unknown) => void, rej?: (e: unknown) => void) => Promise.resolve(exec()).then(res, rej),
  }
  return api
}
;(globalThis as { fetch: unknown }).fetch = async () => { throw new Error('the meal writer is switched off') }

const t = (kcal: number, protein: number) => { const fat = Math.round(kcal * 0.28 / 9); return { calories: kcal, protein, carbs: Math.round((kcal - protein * 4 - fat * 9) / 4), fat } }
export const EMPTY_MEAL_CASES = [
  { label: 'nurse: vegan+GF, no tofu/avocado/oats, 2053/156', targets: t(2053, 156), diet: ['vegan', 'gluten-free'], avoid: ['tofu', 'avocado', 'oats'] },
  { label: 'nurse at 1.6 g/kg (125 g)', targets: t(2053, 125), diet: ['vegan', 'gluten-free'], avoid: ['tofu', 'avocado', 'oats'] },
  { label: 'vegan, 2000/150', targets: t(2000, 150), diet: ['vegan'], avoid: [] },
  { label: 'vegetarian, 2300/160', targets: t(2300, 160), diet: ['vegetarian'], avoid: [] },
  { label: 'gluten-free, 2000/150', targets: t(2000, 150), diet: ['gluten-free'], avoid: [] },
  { label: 'none, 2700/170', targets: t(2700, 170), diet: [], avoid: [] },
]
const SLOTS: MealSlotName[] = ['breakfast', 'lunch', 'dinner', 'snack']

export async function emptyMeals() {
  const { setSupabaseClient } = await import('../src/lib/supabase')
  setSupabaseClient({ from: fakeFrom } as any)
  const { generateMealPools } = await import('../src/lib/meal-generation')
  const { getPools } = await import('../src/lib/meal-store')
  const out: { label: string; counts: Record<MealSlotName, number> }[] = []
  let k = 0
  for (const c of EMPTY_MEAL_CASES) {
    const id = `empty-${++k}`
    const quiet = { log: console.log, warn: console.warn, error: console.error }
    console.log = console.warn = console.error = () => {}
    try { await generateMealPools({ profileId: id, targets: c.targets, dietaryPreferences: c.diet, dislikedFoods: c.avoid, mealsPerDay: 3, includeSnacks: true, skipBreakfast: false }) } finally { Object.assign(console, quiet) }
    const pools = await getPools(id) as Partial<Record<MealSlotName, unknown[]>>
    out.push({ label: c.label, counts: Object.fromEntries(SLOTS.map(s => [s, pools[s]?.length ?? 0])) as Record<MealSlotName, number> })
  }
  return out
}

if (process.argv[1]?.includes('measure-empty-meals')) {
  const rows = await emptyMeals()
  for (const r of rows) console.log(`${r.label.padEnd(52)} ${SLOTS.map(s => `${s} ${r.counts[s]}`).join('  ')}`)
}

/**
 * measure:meal-library-depth — HOW MANY DISHES CAN THE LIBRARY ACTUALLY HAND ONE PERSON? (3 Nov 2026)
 *
 * measure:meal-library counts dishes ACCEPTED at a budget. A dish accepted is not a dish served: since 19 Oct a
 * library dish joins her pool only when a day of hers lands on target with it pinned (the 10% bands). This walks
 * the real append path ("Get more options") for one person at a time, with the meal writer switched off, and asks
 * it again and again until the library has nothing left that lands her day, up to the ten a pool may hold. The
 * number per meal is how deep her variety can go from our own dishes. Nothing is asserted; it prints.
 */
import { TARGET_GRID } from './measure-meal-library'
import type { MealSlotName } from '../src/lib/meal-store'

type Row = Record<string, unknown>
const db: Record<string, Row[]> = { meal_plan_slots: [] }
const fakeFrom = (table: string) => {
  const filters: ((r: Row) => boolean)[] = []
  let op: 'select' | 'insert' | 'delete' | 'update' = 'select'
  let payload: Row | Row[] | null = null
  const exec = () => {
    db[table] ??= []
    if (op === 'insert') { for (const r of Array.isArray(payload) ? payload : [payload]) db[table].push({ id: crypto.randomUUID(), ...r }); return { data: null, error: null } }
    if (op === 'update') { for (const r of db[table]) if (filters.every(f => f(r))) Object.assign(r, payload); return { data: null, error: null } }
    if (op === 'delete') { db[table] = db[table].filter(r => !filters.every(f => f(r))); return { data: null, error: null } }
    return { data: db[table].filter(r => filters.every(f => f(r))).map(r => ({ ...r })), error: null }
  }
  const api: Record<string, unknown> = {
    select: () => api, insert: (r: Row | Row[]) => { op = 'insert'; payload = r; return api },
    update: (r: Row) => { op = 'update'; payload = r; return api }, delete: () => { op = 'delete'; return api },
    eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return api }, in: (c: string, vs: unknown[]) => { filters.push(r => vs.includes(r[c])); return api },
    order: () => api, maybeSingle: () => api, single: () => api,
    then: (res: (v: unknown) => void, rej?: (e: unknown) => void) => Promise.resolve(exec()).then(res, rej),
  }
  return api
}
;(globalThis as { fetch: unknown }).fetch = async () => { throw new Error('the meal writer is switched off') }

export const DEPTH_DIETS: string[][] = [[], ['vegetarian'], ['vegan'], ['pescatarian'], ['dairy-free'], ['gluten-free'], ['egg-free'], ['nut-free']]
const SLOTS: MealSlotName[] = ['breakfast', 'lunch', 'dinner', 'snack']
export const DEPTH_CAP = 10

let walks = 0
export async function libraryDepth(opts: { library?: unknown; diets?: string[][]; grid?: typeof TARGET_GRID } = {}) {
  const { setSupabaseClient } = await import('../src/lib/supabase')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSupabaseClient({ from: fakeFrom } as any)
  const { generateMealPools } = await import('../src/lib/meal-generation')
  const { getPools } = await import('../src/lib/meal-store')
  const out: { target: string; diet: string; depth: Record<MealSlotName, number> }[] = []
  let k = 0
  // Each walk is its own set of people: a second walk on the same ids would start from the first walk's full pools.
  const walk = ++walks
  for (const g of opts.grid ?? TARGET_GRID) for (const diet of opts.diets ?? DEPTH_DIETS) {
    const id = `depth-${walk}-${++k}`
    // The first ask has nothing to judge a day with, so it seeds one dish a meal; every later ask adds only dishes
    // that land her day, one at a time, the way repeated "more options" would.
    for (let round = 0; round < DEPTH_CAP + 2; round++) {
      const have = await getPools(id) as Partial<Record<MealSlotName, unknown[]>>
      const short = SLOTS.filter(s => (have[s]?.length ?? 0) < DEPTH_CAP)
      if (short.length === 0) break
      const before = SLOTS.map(s => have[s]?.length ?? 0).join()
      // deepLibrary false (9 Nov 2026): measured under the pool-level cuisine cap the walk was written for, which a deep
      // pool moves to the week's menu (meal-menu.ts). So this is a LOWER bound on depth, and its control still
      // measures what the 3 Nov dishes bought.
      // The app logs every refused dish; a walk of hundreds of asks would bury the result in it.
      const quiet = { log: console.log, warn: console.warn, error: console.error }
      console.log = console.warn = console.error = () => {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      try { await generateMealPools({ profileId: id, targets: g.targets, dietaryPreferences: diet, mealsPerDay: 3, includeSnacks: true, poolSize: round === 0 ? 1 : 3, appendToExisting: true, deepLibrary: false, onlySlots: round === 0 ? undefined : short, ...(opts.library ? { library: opts.library as any } : {}) }) } finally { Object.assign(console, quiet) }
      const after = await getPools(id) as Partial<Record<MealSlotName, unknown[]>>
      if (SLOTS.map(s => after[s]?.length ?? 0).join() === before) break
    }
    const pools = await getPools(id) as Partial<Record<MealSlotName, unknown[]>>
    out.push({ target: g.label, diet: diet.join('+') || 'none', depth: Object.fromEntries(SLOTS.map(s => [s, Math.min(DEPTH_CAP, pools[s]?.length ?? 0)])) as Record<MealSlotName, number> })
  }
  return out
}

if (process.argv[1]?.includes('measure-meal-library-depth')) {
  const t0 = Date.now()
  const rows = await libraryDepth()
  console.log(`LIBRARY DEPTH: dishes the library can hand one person per meal, each landing her day (cap ${DEPTH_CAP})`)
  console.log('target          diet          bre lun din sna')
  for (const r of rows) console.log(`${r.target.padEnd(15)} ${r.diet.padEnd(13)} ${SLOTS.map(s => String(r.depth[s]).padStart(3)).join(' ')}`)
  const thin = rows.flatMap(r => SLOTS.filter(s => r.depth[s] < 7).map(s => `${r.target} ${r.diet} ${s} ${r.depth[s]}`))
  console.log(`\nmeals under 7: ${thin.length} of ${rows.length * 4}`)
  for (const t of thin) console.log('  ' + t)
  console.log(`(${Math.round((Date.now() - t0) / 1000)}s)`)
}

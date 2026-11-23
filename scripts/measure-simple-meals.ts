/**
 * measure:simple-meals — how much cooking a new plan asks for, over four weeks (docs/plans/simple-meals.md).
 *
 * A NEW plan is made through the app's own generateMealPools (the meal writer faked to return one plain dish a meal,
 * so the deep library seed runs exactly as it does for a person), then 28 days from a Monday are served through
 * serveDates. Printed per cooking answer: the share of SERVED meals that are simple (meal-effort.ts), the median main
 * foods on a served plate, snacks that are one or two foods, days on target and different dishes a meal over 4 weeks.
 * Run it on a checkout without the change for the "before" row (the script reads isSimpleDish only to count).
 */
import { serveDates, addDays } from '../src/lib/meal-rotation'
import { isSimpleDish, mainFoodCount } from '../src/lib/meal-effort'
import type { MealSlotName } from '../src/lib/meal-store'
import type { PoolOption } from '../src/lib/meal-generation'
import type { CookingTimePreference, MacroTargets } from '../src/lib/types'

const SLOTS: MealSlotName[] = ['breakfast', 'lunch', 'dinner', 'snack']
const START = '2026-11-09'
const DATES = Array.from({ length: 28 }, (_, i) => addDays(START, i))
const GRID: MacroTargets[] = [[1800, 140], [2300, 160], [3000, 175]].map(([kcal, protein]) => {
  const fat = Math.round((kcal * 0.28) / 9)
  return { calories: kcal, protein, fat, carbs: Math.round((kcal - protein * 4 - fat * 9) / 4) }
})
const DIETS: string[][] = [[], ['vegetarian'], ['vegan'], ['dairy-free']]
const PREFS: (CookingTimePreference | undefined)[] = ['quick', 'moderate', 'loves_cooking']

type Row = Record<string, unknown>
const db: Record<string, Row[]> = {}
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
    order: () => api, maybeSingle: () => api, single: () => api, upsert: (r: Row | Row[]) => { op = 'insert'; payload = r; return api },
    then: (res: (v: unknown) => void, rej?: (e: unknown) => void) => Promise.resolve(exec()).then(res, rej),
  }
  return api
}

import { MEAL_LIBRARY } from '../src/lib/meal-library-data'
const WRITER_POOL = MEAL_LIBRARY
let writerTurn = 0
;(globalThis as { fetch: unknown }).fetch = async (_u: string, init?: { body?: string }) => {
    // THE WRITER STANDS IN WITH LIBRARY DISHES: a spread of real dishes per meal, taken in a fixed stride so each round
    // brings different ones. One fixed dish a meal was tried first and could not anchor a day on some targets, which
    // left whole meals empty and measured that instead (23 Nov 2026).
    const body = JSON.parse(init?.body ?? '{}') as { slots: { slot: string; count: number }[] }
    const meals = body.slots.flatMap(({ slot, count }) => {
      const pool = WRITER_POOL.filter(d => d.slot === slot)
      return Array.from({ length: count }, () => pool[(writerTurn += 37) % pool.length])
    })
    return { ok: true, status: 200, json: async () => ({ meals }) }
  }

async function main() {
  const { setSupabaseClient } = await import('../src/lib/supabase')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSupabaseClient({ from: fakeFrom } as any)
  const { generateMealPools } = await import('../src/lib/meal-generation')
  const { getPools } = await import('../src/lib/meal-store')

  console.log(`SIMPLE MEALS — a new plan, then 28 days served from ${START}; ${GRID.length} targets x ${DIETS.length} diets, three meals and a snack\n`)
  console.log('cooking answer   simple served  median foods  2-food snacks  on target  dishes/meal/4wk  pool/meal')
  let k = 0
  for (const pref of PREFS) {
    let simple = 0, meals = 0, snacks2 = 0, snacks = 0, onTarget = 0, days = 0, distinct = 0, pool = 0, runs = 0
    const foods: number[] = []
    for (const diet of DIETS) for (const targets of GRID) {
      const id = `simple-${++k}`
      await generateMealPools({ profileId: id, targets, dietaryPreferences: diet, mealsPerDay: 3, includeSnacks: true, cookingTimePreference: pref })
      const pools = (await getPools(id)) as Partial<Record<MealSlotName, PoolOption[]>>
      const served = serveDates({ dates: DATES, pools, targets, shape: { mealsPerDay: 3, includeSnacks: true } })
      runs++; if (process.env.DEBUG_POOLS) console.error(pref, diet.join("+")||"none", targets.calories, SLOTS.map(s => pools[s]?.length ?? 0).join("/"))
      for (const s of SLOTS) {
        pool += pools[s]?.length ?? 0
        distinct += new Set(served.map(d => d.day.chosen[s]?.name).filter(Boolean)).size
      }
      for (const d of served) {
        days++
        if (d.day.withinTolerance) onTarget++
        for (const s of SLOTS) {
          const o = d.day.chosen[s]
          if (!o) continue
          meals++
          const names = o.ingredients.map(i => i.name)
          if (isSimpleDish(s, names, o.prep)) simple++
          foods.push(mainFoodCount(names))
          if (s === 'snack') { snacks++; if (mainFoodCount(names) <= 2) snacks2++ }
        }
      }
    }
    foods.sort((a, b) => a - b)
    const pct = (a: number, b: number) => `${Math.round((100 * a) / Math.max(1, b))}%`
    console.log(`${String(pref).padEnd(17)}${pct(simple, meals).padEnd(15)}${String(foods[Math.floor(foods.length / 2)]).padEnd(14)}${pct(snacks2, snacks).padEnd(15)}${pct(onTarget, days).padEnd(11)}${(distinct / runs / SLOTS.length).toFixed(1).padEnd(17)}${(pool / runs / SLOTS.length).toFixed(0)}`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })

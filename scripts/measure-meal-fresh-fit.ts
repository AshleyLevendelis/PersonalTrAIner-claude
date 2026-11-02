/**
 * measure:meal-fresh-fit — how many of a NEW plan's dishes land a day on target (2 Nov 2026).
 * The meal writer is stood in for by our own library, shuffled with a fixed seed per profile, so the writer is
 * "a cook who writes sensible dishes without ever seeing the day bands" — what the real one is. Prints, per meal,
 * how many of the seven fit (the dish pinned, the day inside the bands: the assembler's own test), and how long
 * the plan took to build. A measurement, not a gate.
 */
import type { MealSlotName } from '../src/lib/meal-store'
process.env.VITE_SUPABASE_URL = 'http://fake.local'
process.env.VITE_SUPABASE_ANON_KEY = 'anon'

const mulberry32 = (a: number) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
type Row = Record<string, unknown>
const db: Record<string, Row[]> = { meal_plan_slots: [] }
const fakeFrom = (table: string) => {
  const filters: ((r: Row) => boolean)[] = []; let op = 'select'; let payload: Row | Row[] | null = null
  const exec = () => { db[table] ??= []
    if (op === 'insert') { for (const r of Array.isArray(payload) ? payload : [payload]) db[table].push({ ...r! }); return { data: null, error: null } }
    if (op === 'delete') { db[table] = db[table].filter(r => !filters.every(f => f(r))); return { data: null, error: null } }
    return { data: db[table].filter(r => filters.every(f => f(r))), error: null } }
  const api: Record<string, unknown> = { select: () => api, insert: (r: Row) => { op = 'insert'; payload = r; return api }, delete: () => { op = 'delete'; return api },
    update: () => api, eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return api }, in: (c: string, vs: unknown[]) => { filters.push(r => vs.includes(r[c])); return api },
    order: () => api, maybeSingle: () => api, single: () => api, then: (res: (v: unknown) => void, rej?: (e: unknown) => void) => Promise.resolve(exec()).then(res, rej) }
  return api
}

async function main() {
  const { setSupabaseClient } = await import('../src/lib/supabase')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSupabaseClient({ from: fakeFrom } as any)
  const { generateMealPools, assembleDay } = await import('../src/lib/meal-generation')
  const { MEAL_LIBRARY } = await import('../src/lib/meal-library-data')
  const { chooseFromLibrary } = await import('../src/lib/meal-library')
  const { computeSlotBudgets, EXOTIC_CUISINES } = await import('../src/lib/meal-generation')
  const PROFILES = [
    { label: 'Ashley-like 2752/170/347/76', t: { calories: 2752, protein: 170, carbs: 347, fat: 76 } },
    { label: '2200/150/240/70', t: { calories: 2200, protein: 150, carbs: 240, fat: 70 } },
    { label: '1800/140/180/60', t: { calories: 1800, protein: 140, carbs: 180, fat: 60 } },
    { label: '3000/180/380/85', t: { calories: 3000, protein: 180, carbs: 380, fat: 85 } },
  ]
  const SEEDS = [1, 2, 3, 4, 5]
  let totalFit = 0, totalDishes = 0, totalMs = 0, runs = 0, lowSlots = 0, slotCount = 0
  for (const p of PROFILES) {
    const perSlot: Record<string, number[]> = {}
    for (const seed of SEEDS) {
      const rnd = mulberry32(seed * 7919)
      // EACH DISH SIZED TO ITS MEAL (the library's own re-portioning, as a writer told the meal's budget would
      // aim), then shuffled: a cook who sizes every dish to the meal and never sees the day bands.
      const budgets = computeSlotBudgets(p.t, 3, true)
      const deck: Record<string, typeof MEAL_LIBRARY[number][]> = {}
      for (const slot of Object.keys(budgets) as MealSlotName[]) {
        const sized = chooseFromLibrary(MEAL_LIBRARY, { slot, haveNames: [], haveCuisines: [], exoticCuisines: EXOTIC_CUISINES, rotation: 0, budget: budgets[slot] } as never)
        deck[slot] = [...sized].map(d => [rnd(), d] as const).sort((a, b) => a[0] - b[0]).map(x => x[1])
      }
      const used: Record<string, number> = {}
      ;(globalThis as { fetch: unknown }).fetch = async (_u: string, init?: { body?: string }) => {
        const body = JSON.parse(init?.body ?? '{}') as { slots: { slot: MealSlotName; count: number }[] }
        const meals = body.slots.flatMap(({ slot, count }) => Array.from({ length: count }, () => { const i = used[slot] = (used[slot] ?? 0) + 1; return deck[slot][(i - 1) % deck[slot].length] }))
        return { ok: true, status: 200, json: async () => ({ meals }) }
      }
      db.meal_plan_slots = []
      const t0 = performance.now()
      const r = await generateMealPools({ profileId: `m${seed}`, targets: p.t, dietaryPreferences: [], mealsPerDay: 3, includeSnacks: true, library: false })
      totalMs += performance.now() - t0; runs++
      for (const slot of Object.keys(r.accepted) as MealSlotName[]) {
        const opts = r.accepted[slot] ?? []
        const fit = opts.filter(o => assembleDay(r.accepted, p.t, {}, [], { [slot]: o }).withinTolerance).length
        ;(perSlot[slot] ??= []).push(fit)
        totalFit += fit; totalDishes += opts.length; slotCount++; if (fit < 3) lowSlots++
      }
    }
    console.log(p.label.padEnd(30), Object.entries(perSlot).map(([s, xs]) => `${s} ${xs.join('/')}`).join('  '))
  }
  console.log(`\nFIT ${totalFit} of ${totalDishes} dishes (${(100 * totalFit / totalDishes).toFixed(1)}%); meals with fewer than 3 that fit: ${lowSlots} of ${slotCount}; mean build ${(totalMs / runs).toFixed(0)} ms`)
}
main().catch(e => { console.error(e); process.exit(1) })

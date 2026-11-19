// ---------------------------------------------------------------------------
// MEASURE: "Get more options" on a plan whose meals no longer land a day, with the meal writer unreachable.
//
// The Nutrition walk of 18 Nov 2026 (finding N3, a lead): the button added nothing when the writer did not answer,
// though the library's dishes need no writer. Trace: a library dish is added only if a day lands on target with it
// (19 Oct, H35), judged against the OTHER meals as they are. Where the other meals are themselves off his numbers,
// no dish can land a day, so every one is passed over.
//
// A plan is made from the library at one set of targets (the writer fails throughout), the targets then move by a
// factor, and a top-up of every meal is asked for. Printed: how many dishes each meal had that land a day before,
// and how many the top-up added.
// ---------------------------------------------------------------------------
import type { MealSlotName } from '../src/lib/meal-generation'
import type { MacroTargets } from '../src/lib/types'

process.env.VITE_SUPABASE_URL = 'http://fake.local'
process.env.VITE_SUPABASE_ANON_KEY = 'anon'

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
// The meal writer never answers.
;(globalThis as { fetch: unknown }).fetch = async () => { throw new Error('offline') }

const SLOTS: MealSlotName[] = ['breakfast', 'lunch', 'dinner', 'snack']
const scale = (t: MacroTargets, f: number): MacroTargets => ({ calories: Math.round(t.calories * f), protein: Math.round(t.protein * f), carbs: Math.round(t.carbs * f), fat: Math.round(t.fat * f) })

async function main() {
  const { setSupabaseClient } = await import('../src/lib/supabase')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSupabaseClient({ from: fakeFrom } as any)
  const { generateMealPools, assembleDay } = await import('../src/lib/meal-generation')
  const { getPools } = await import('../src/lib/meal-store')
  const warn = console.warn; console.warn = () => {}
  const made: MacroTargets = { calories: 2200, protein: 160, carbs: 240, fat: 68 }
  const rows: string[] = []
  for (const f of [1, 1.1, 1.2, 1.35, 1.5, 0.8]) {
    db.meal_plan_slots = []
    const profileId = `p-${f}`
    // The plan as made: seven a meal from the library (the writer fails, so the library fills the empty meals).
    await generateMealPools({ targets: made, dietaryPreferences: [], mealsPerDay: 3, includeSnacks: true, profileId, deepLibrary: false })
    const before = await getPools(profileId)
    const now = scale(made, f)
    const fitting = (pools: typeof before, slot: MealSlotName) => (pools[slot] ?? []).filter(o => assembleDay(pools, now, {}, [], { [slot]: o }).withinTolerance).length
    const fitBefore = SLOTS.map(s => fitting(before, s))
    const lands = assembleDay(before, now, {}, [], {}).withinTolerance
    const r = await generateMealPools({ targets: now, dietaryPreferences: [], mealsPerDay: 3, includeSnacks: true, profileId, onlySlots: SLOTS, appendToExisting: true, poolSize: 5, deepLibrary: false })
    const after = await getPools(profileId)
    const added = SLOTS.map(s => r.accepted[s]?.length ?? 0)
    const fitAfter = SLOTS.map(s => fitting(after, s))
    rows.push(`  targets x${f.toFixed(2).padEnd(5)} had ${SLOTS.map(s => (before[s] ?? []).length).join('/')}  fit before ${fitBefore.join('/')}  a day lands: ${lands ? 'yes' : 'NO '}  added ${added.join('/')}  fit after ${fitAfter.join('/')}`)
  }
  console.warn = warn
  console.log('\nA plan made at 2,200 kcal / 160 g protein, then the targets move; "more options" with the writer unreachable.')
  console.log('Per meal: breakfast/lunch/dinner/snack.\n')
  for (const r of rows) console.log(r)
  console.log('')
}
main().catch(e => { console.error(e); process.exit(1) })

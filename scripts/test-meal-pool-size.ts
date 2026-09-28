/**
 * test:meal-pool-size — seven options a meal, asked for in pieces that fit.
 *
 * Ashley, 28 Sep 2026, from three options (keep five, seven, ten): SEVEN.
 * At five, a week of 28 servings was 11 dishes and most of the remaining
 * next-day repeats were forced — no other dish in the pool fitted the day.
 *
 * The number alone would have been a one-character change and a trap. The
 * meal function's reply has a fixed length; one request for 36 dishes is past
 * the size live plans have come back whole from, and a reply cut off mid-dish
 * cannot be read, so the whole round is lost. Every round asks the same size,
 * so a plan that overflows once overflows three times and arrives EMPTY. So
 * this holds both halves:
 *   1. seven is the number a new plan asks for;
 *   2. a round is split into requests of at most 28 dishes, as evenly as
 *      possible, never splitting a slot, and one at five options is still a
 *      single request;
 *   3. driven through generateMealPools against a fake function and a fake
 *      database: a default plan reaches seven a slot, no request is over the
 *      limit, and one request failing costs only its own slots.
 */
import {
  DEFAULT_POOL_SIZE,
  MAX_DISHES_PER_REQUEST,
  splitSlotRequests,
  type PoolOption,
} from '../src/lib/meal-generation'
import type { MealSlotName } from '../src/lib/meal-store'

process.env.VITE_SUPABASE_URL = 'http://fake.local'
process.env.VITE_SUPABASE_ANON_KEY = 'anon'

let ran = 0
let failed = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failed++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 400)}` : ''}`) }
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

/**
 * A stand-in for the meal function that answers what it is ASKED: `count`
 * dishes for each slot in the request, each one the app accepts. It records
 * every request so the checks can read what was asked, not what came back.
 */
interface Asked { slots: { slot: MealSlotName; count: number }[] }
const asked: Asked[] = []
let failWhen: (a: Asked) => boolean = () => false
let calls = 0
;(globalThis as { fetch: unknown }).fetch = async (_url: string, init?: { body?: string }) => {
  const body = JSON.parse(init?.body ?? '{}') as Asked
  asked.push(body)
  const n = ++calls
  if (failWhen(body)) return { ok: false, status: 502, json: async () => ({ error: 'simulated cut-off reply' }) }
  const meals = body.slots.flatMap(({ slot, count }) => Array.from({ length: count }, (_, i) => ({
    slot,
    name: `${slot} bowl ${n}-${i}`,
    ingredients: slot === 'snack'
      ? ['150g chicken breast', '100g broccoli']
      : ['200g chicken breast', '220g cooked basmati rice', '1 tbsp olive oil', '100g broccoli'],
    prep: 'Grill the chicken, steam the broccoli, serve over the rice.',
    cuisine: 'British / Classic',
  })))
  return { ok: true, status: 200, json: async () => ({ meals }) }
}
const dishesIn = (a: Asked) => a.slots.reduce((s, x) => s + x.count, 0)

async function main() {
  const { setSupabaseClient } = await import('../src/lib/supabase')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSupabaseClient({ from: fakeFrom } as any)
  const { generateMealPools } = await import('../src/lib/meal-generation')
  const targets = { calories: 2200, protein: 150, carbs: 240, fat: 70 }

  console.log('\n1. Seven options a meal')
  // LITERALS, both: her ruling is the number seven, and the limit is the size
  // already proven whole. A check reading the constant back would agree with
  // any value it was changed to.
  check('a new plan asks for seven options a meal', DEFAULT_POOL_SIZE === 7, DEFAULT_POOL_SIZE)
  check('one request asks for at most 28 dishes', MAX_DISHES_PER_REQUEST === 28, MAX_DISHES_PER_REQUEST)

  console.log('\n2. A round goes as requests that fit')
  const covers = (parts: Partial<Record<MealSlotName, number>>[], want: Partial<Record<MealSlotName, number>>) => {
    const seen: Partial<Record<MealSlotName, number>> = {}
    for (const p of parts) for (const [s, n] of Object.entries(p) as [MealSlotName, number][]) {
      if (seen[s] !== undefined) return false
      seen[s] = n
    }
    return JSON.stringify(Object.entries(seen).sort()) === JSON.stringify(Object.entries(want).filter(([, n]) => (n ?? 0) > 0).sort())
  }
  const total = (p: Partial<Record<MealSlotName, number>>) => Object.values(p).reduce((a, b) => a + (b ?? 0), 0)
  const seven = { breakfast: 9, lunch: 9, dinner: 9, snack: 9 }
  const sevenParts = splitSlotRequests(seven)
  check('seven options with three meals and a snack (36 dishes) goes as two requests', sevenParts.length === 2, sevenParts)
  check('...of 18 each, not 27 and 9 (the longest reply sets the wait)', sevenParts.every(p => total(p) === 18), sevenParts.map(total))
  check('...every slot asked for once, with its whole count', covers(sevenParts, seven), sevenParts)
  const five = { breakfast: 7, lunch: 7, dinner: 7, snack: 7 }
  check('five options (28 dishes) is still ONE request, exactly as before', splitSlotRequests(five).length === 1 && covers(splitSlotRequests(five), five), splitSlotRequests(five))
  const awkward = { breakfast: 15, lunch: 15, dinner: 15 }
  const awkwardParts = splitSlotRequests(awkward)
  check('three slots of 15 go as three requests, since any two would be 30', awkwardParts.length === 3 && covers(awkwardParts, awkward), awkwardParts)
  const huge = { lunch: 40 }
  check('one slot bigger than the limit is asked for whole, never split in two', JSON.stringify(splitSlotRequests(huge)) === JSON.stringify([huge]), splitSlotRequests(huge))
  check('slots asking for nothing are left out, and nothing asked is no request', splitSlotRequests({ lunch: 0, dinner: 3 }).length === 1 && covers(splitSlotRequests({ lunch: 0, dinner: 3 }), { dinner: 3 }) && splitSlotRequests({}).length === 0)
  const mixed = { breakfast: 9, lunch: 2, dinner: 9, snack: 9 }
  const mixedParts = splitSlotRequests(mixed)
  check('a later round asking uneven amounts still keeps every request at 28 or under', mixedParts.every(p => total(p) <= 28) && covers(mixedParts, mixed), mixedParts)
  check('...and each request keeps the slots in the order asked', mixedParts.every(p => {
    const order = Object.keys(mixed)
    const keys = Object.keys(p)
    return keys.every((k, i) => i === 0 || order.indexOf(k) > order.indexOf(keys[i - 1]))
  }), mixedParts)

  console.log('\n3. A default plan, through the app\'s own pool builder')
  {
    asked.length = 0
    calls = 0
    failWhen = () => false
    db.meal_plan_slots = []
    const result = await generateMealPools({ profileId: 'p1', targets, dietaryPreferences: [], mealsPerDay: 3, includeSnacks: true })
    const sizes = Object.fromEntries((Object.entries(result.accepted) as [MealSlotName, PoolOption[]][]).map(([s, o]) => [s, o.length]))
    check('every slot reaches seven options', Object.keys(sizes).length === 4 && Object.values(sizes).every(n => n === 7), sizes)
    check('...and seven are stored, not just returned', ['breakfast', 'lunch', 'dinner', 'snack'].every(s => db.meal_plan_slots.filter(r => r.profile_id === 'p1' && r.slot === s).length === 7),
      db.meal_plan_slots.length)
    check('no request asked for more than 28 dishes', asked.length > 0 && asked.every(a => dishesIn(a) <= 28), asked.map(dishesIn))
    check('...and the first round really was split (two requests, not one of 36)', asked.length === 2, asked.map(a => a.slots.map(s => `${s.slot}:${s.count}`)))
    check('...and the plan says nothing went unfilled', result.shortfalls.length === 0 && result.generatorReached, result.shortfalls)
  }
  {
    // ONE REQUEST OF TWO FAILS, EVERY ROUND. The other's meals must still be
    // kept, and the failure named by its slots, so a cut-off reply costs half
    // a plan instead of all of it.
    asked.length = 0
    calls = 0
    db.meal_plan_slots = []
    failWhen = a => a.slots.some(s => s.slot === 'dinner')
    const result = await generateMealPools({ profileId: 'p2', targets, dietaryPreferences: [], mealsPerDay: 3, includeSnacks: true })
    const dinnerAsked = asked.find(a => a.slots.some(s => s.slot === 'dinner'))
    const lost = (dinnerAsked?.slots ?? []).map(s => s.slot)
    const kept = (['breakfast', 'lunch', 'dinner', 'snack'] as MealSlotName[]).filter(s => !lost.includes(s))
    check('the sanity check: the failing request carried dinner and at least one other slot was elsewhere', lost.includes('dinner') && kept.length > 0, { lost, kept })
    check('the slots in the request that worked still get seven options', kept.every(s => (result.accepted[s]?.length ?? 0) === 7), Object.fromEntries(kept.map(s => [s, result.accepted[s]?.length ?? 0])))
    check('...and are stored', kept.every(s => db.meal_plan_slots.filter(r => r.profile_id === 'p2' && r.slot === s).length === 7))
    check('the failed slots are honestly short, not filled with anything', lost.every(s => (result.accepted[s]?.length ?? 0) === 0) && lost.every(s => result.shortfalls.some(x => x.slot === s)), result.shortfalls)
    check('...and the log names which slots the failed request was for', result.rejectionLog.some(l => l.includes('call failed') && lost.every(s => l.includes(s))), result.rejectionLog.filter(l => l.includes('call failed')))
    check('the generator counts as reached, because half of it was', result.generatorReached === true)
  }

  // ONE EXIT, and it reports how many ran (CLAUDE.md: a gate that bails out
  // early and exits 0 is worse than none).
  console.log(`\n${ran} checks ran`)
  if (failed > 0) { console.error(`${failed} check(s) failed`); process.exit(1) }
  console.log('meal pool size: all checks passed')
}

main().catch(err => { console.error(err); process.exit(1) })

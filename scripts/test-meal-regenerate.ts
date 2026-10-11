/**
 * test:meal-regenerate — swap, regenerate one, regenerate all (test log M22).
 *
 * 9 Oct 2026: "Regenerate all" was pressed with an edited lunch on the plan,
 * and the lunch was gone. It was still in the database — a meal she edited
 * herself survives a regenerate (Ashley, 3 Sep 2026: regeneration "replaces
 * the app's OWN suggestions") — but the screen had been set from the meal
 * writer's answer instead of from storage, and every pick had been cleared,
 * so after a reload it was one of the swap options and no longer her lunch.
 *
 * The three handlers lived inline in App.tsx, where no gate could run them.
 * They are src/lib/meal-plan-actions.ts now; this RUNS them, with the app's
 * real meal generator and store over a fake database, and only the model call
 * (the fetch to generate-meals) stood in for:
 *   1. regenerate all: the screen is what storage holds; a pick whose dish
 *      survived stays; a pick whose dish is gone is cleared;
 *   2. a partial and a total failure still keep what they kept before;
 *   3. regenerate one, and swap, behave as they did;
 *   4. what is NOT decided here is stated, not hidden: no confirm, and a meal
 *      already logged today is regenerated like any other;
 *   5. the wiring: App and the harness page use ONE hook.
 *
 * One exit, at the bottom. Every check runs every time.
 */
process.env.TZ = 'Europe/London'

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const strip = (x: string) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
const read = (p: string) => { try { return strip(readFileSync(join(ROOT, p), 'utf8')) } catch { return '' } }

const storeMap = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: (k: string) => storeMap.get(k) ?? null, setItem: (k: string, v: string) => { storeMap.set(k, String(v)) }, removeItem: (k: string) => { storeMap.delete(k) }, clear: () => { storeMap.clear() } },
  configurable: true,
})
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })

// --- A fake database ----------------------------------------------------------
type Row = Record<string, unknown>
let db: Record<string, Row[]> = {}
/** Make the next read of the options fail (a dropped connection after the run). */
let failPoolReads = false
let failPickWrites = false
const cmp = (a: unknown, b: unknown) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0)
function fakeFrom(table: string) {
  db[table] ??= []
  const filters: ((r: Row) => boolean)[] = []
  const orders: [string, boolean][] = []
  let limitN: number | null = null
  let op: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select'
  let payload: Row[] = []
  let onConflict: string[] | null = null
  let updateObj: Row | null = null
  let single = false
  const down = { data: null, error: { code: '08006', message: 'connection failure' } }
  const exec = () => {
    if (op === 'insert') { for (const raw of payload) db[table].push({ id: `${table}-${db[table].length + 1}`, created_at: '2026-03-02T09:00:00Z', ...raw }); return { data: null, error: null } }
    if (op === 'upsert') {
      if (table === 'meal_plan_picks' && failPickWrites) return down
      for (const raw of payload) {
        const existing = onConflict ? db[table].find(r => onConflict!.every(c => r[c] === raw[c])) : undefined
        if (existing) Object.assign(existing, raw); else db[table].push({ ...raw })
      }
      return { data: null, error: null }
    }
    if (op === 'update') { for (const r of db[table]) if (filters.every(f => f(r))) Object.assign(r, updateObj); return { data: null, error: null } }
    if (op === 'delete') { db[table] = db[table].filter(r => !filters.every(f => f(r))); return { data: null, error: null } }
    if (table === 'meal_plan_slots' && failPoolReads) return down
    let rows = db[table].filter(r => filters.every(f => f(r)))
    for (const [col, asc] of [...orders].reverse()) rows = [...rows].sort((a, b) => (asc ? 1 : -1) * cmp(a[col], b[col]))
    if (limitN != null) rows = rows.slice(0, limitN)
    return { data: single ? (rows[0] ?? null) : rows.map(r => ({ ...r })), error: null }
  }
  const api: Record<string, unknown> = {
    select: () => api,
    insert: (rows: Row | Row[]) => { op = 'insert'; payload = Array.isArray(rows) ? rows : [rows]; return api },
    upsert: (rows: Row | Row[], opts?: { onConflict?: string }) => { op = 'upsert'; payload = Array.isArray(rows) ? rows : [rows]; onConflict = opts?.onConflict ? opts.onConflict.split(',') : null; return api },
    update: (obj: Row) => { op = 'update'; updateObj = obj; return api },
    delete: () => { op = 'delete'; return api },
    eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return api },
    neq: (c: string, v: unknown) => { filters.push(r => r[c] !== v); return api },
    in: (c: string, vs: unknown[]) => { filters.push(r => vs.includes(r[c])); return api },
    like: (c: string, pattern: string) => { const re = new RegExp('^' + pattern.split('%').map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$'); filters.push(r => re.test(String(r[c] ?? ''))); return api },
    is: (c: string, v: unknown) => { filters.push(r => (v === null ? r[c] == null : r[c] === v)); return api },
    gte: (c: string, v: unknown) => { filters.push(r => cmp(r[c], v) >= 0); return api },
    lte: (c: string, v: unknown) => { filters.push(r => cmp(r[c], v) <= 0); return api },
    order: (c: string, opts?: { ascending?: boolean }) => { orders.push([c, opts?.ascending !== false]); return api },
    limit: (n: number) => { limitN = n; return api },
    maybeSingle: () => { single = true; return api },
    single: () => { single = true; return api },
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => Promise.resolve().then(() => resolve(exec()), reject),
  }
  return api
}

let ran = 0, failed = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failed++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 600)}` : ''}`) }
}

type Slot = 'breakfast' | 'lunch' | 'dinner' | 'snack'
type Opt = import('../src/lib/meal-generation').PoolOption
type Pools = Partial<Record<Slot, Opt[]>>
type Picks = Partial<Record<Slot, string>>

async function main() {
  const { setSupabaseClient } = await import('../src/lib/supabase')
  setSupabaseClient({ from: fakeFrom } as never)
  const { computeMealMacros } = await import('../src/lib/food-db')
  const { getPools, logMealEaten, getTodayLedger, loggedEventsBySlot, USER_REQUESTED_TAG } = await import('../src/lib/meal-store')
  const { setDevClockOverride } = await import('../src/lib/dev-clock')
  const actions = await import('../src/lib/meal-plan-actions').catch(() => null)

  console.log('meal regenerate — swap, regenerate one, regenerate all')

  const P = 'p-regen'
  const today = '2026-03-02'
  setDevClockOverride(P, today)

  const dish = (slot: Slot, name: string, chicken: number, rice: number, oil: number, tags: string[] = []): Opt => {
    const ingredients = [{ name: 'chicken breast', quantity: chicken, unit: 'g' }, { name: 'white rice', quantity: rice, unit: 'g' }, { name: 'olive oil', quantity: oil, unit: 'g' }]
    const c = computeMealMacros(ingredients)
    return { slot, name, ingredients, tags, macros: { calories: Math.round(c.kcal), protein: Math.round(c.protein), carbs: Math.round(c.carbs), fat: Math.round(c.fat) } } as Opt
  }
  const EDITED = 'Chicken salad + 100g banana'
  const startPools = (): Record<'breakfast' | 'lunch' | 'dinner', Opt[]> => ({
    breakfast: [dish('breakfast', 'Oats bowl', 60, 150, 8), dish('breakfast', 'Rice porridge', 55, 160, 7)],
    // The lunch she EDITED: stored beside the others, tagged as her own request.
    lunch: [dish('lunch', 'Chicken salad', 150, 200, 12), dish('lunch', 'Rice and greens', 140, 220, 11), dish('lunch', EDITED, 150, 230, 12, [USER_REQUESTED_TAG])],
    dinner: [dish('dinner', 'Tray bake', 170, 220, 14), dish('dinner', 'Rice pot', 160, 240, 12)],
  })
  const sum = (a: { calories: number; protein: number; carbs: number; fat: number }[]) => a.reduce((s, m) => ({ calories: s.calories + m.calories, protein: s.protein + m.protein, carbs: s.carbs + m.carbs, fat: s.fat + m.fat }), { calories: 0, protein: 0, carbs: 0, fat: 0 })
  const seedPools = startPools()
  const targets = sum([seedPools.breakfast[0].macros, seedPools.lunch[0].macros, seedPools.dinner[0].macros])

  /** A fresh account: the options stored, today's picks saved, and a screen holding both. */
  const fresh = (picks: Picks) => {
    db = { meal_plan_slots: [], meal_plan_picks: [], meal_events: [], pending_actions: [] }
    failPoolReads = false; failPickWrites = false
    const pools = startPools()
    for (const [slot, options] of Object.entries(pools)) options.forEach((o, i) => db.meal_plan_slots.push({
      id: `${slot}-${i}`, profile_id: P, slot, pool_index: i, name: o.name, ingredients: o.ingredients,
      macros: { kcal: o.macros.calories, protein: o.macros.protein, carbs: o.macros.carbs, fat: o.macros.fat }, tags: o.tags ?? [], prep: '',
    }))
    for (const [slot, name] of Object.entries(picks)) db.meal_plan_picks.push({ profile_id: P, date: today, slot, meal_name: name })
    const screen = { pools: pools as Pools, picks: { ...picks } as Picks, generating: [] as boolean[], error: null as string | null, unrecognised: null as string[] | null }
    const set = <T,>(get: () => T, put: (v: T) => void) => (next: T | ((prev: T) => T)) => put(typeof next === 'function' ? (next as (prev: T) => T)(get()) : next)
    const ctx = () => ({
      profileId: P, today, pools: screen.pools, picks: screen.picks,
      showingName: (slot: Slot) => screen.picks[slot] ?? screen.pools[slot]?.[0]?.name,
      generation: { profileId: P, targets, dietaryPreferences: [] as string[], mealsPerDay: 3, includeSnacks: false, poolSize: 2 },
      slotLabel: { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' },
      setPools: set(() => screen.pools, v => { screen.pools = v }),
      setPicks: set(() => screen.picks, v => { screen.picks = v }),
      setGenerating: (b: boolean) => { screen.generating.push(b) },
      setError: (m: string | null) => { screen.error = m },
      setUnrecognised: (r: string[] | null) => { screen.unrecognised = r },
    })
    return { screen, ctx }
  }
  const storedPicks = () => Object.fromEntries(db.meal_plan_picks.filter(r => r.profile_id === P && r.date === today).map(r => [r.slot, r.meal_name]))
  const namesOf = (p: Pools) => Object.fromEntries((Object.keys(p) as Slot[]).sort().map(s => [s, (p[s] ?? []).map(o => o.name)]))

  /** The model: asked for some dishes per meal, it proposes dishes. `only` limits which meals it answers for. */
  let calls = 0
  let made = 0
  const realFetch = globalThis.fetch
  const model = (only: Slot[] | 'none' | 'down' | null = null) => {
    globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
      calls++
      if (only === 'down') throw new Error('simulated network failure')
      const body = JSON.parse(String(init?.body ?? '{}')) as { slots?: { slot: Slot; count: number }[] }
      const meals = only === 'none' ? [] : (body.slots ?? []).filter(s => only === null || only.includes(s.slot)).flatMap(({ slot, count }) => Array.from({ length: count }, () => {
        made++
        const size = slot === 'breakfast' ? [115, 120, 5] : slot === 'lunch' ? [150, 200, 12] : [170, 220, 14]
        return { slot, name: `Fresh ${slot} plate ${made}`, cuisine: 'British / Classic', prep: 'Grill the chicken, warm the rice, serve.', ingredients: [`${size[0]}g chicken breast`, `${size[1]}g white rice`, `${size[2]}g olive oil`] }
      }))
      return { ok: true, status: 200, json: async () => ({ meals }) } as Response
    }) as typeof fetch
  }
  const run = async (name: 'regenerateAllMeals' | 'regenerateMealSlot' | 'swapMealSlot', c: unknown, ...rest: unknown[]) => {
    const fn = (actions as unknown as Record<string, (...a: unknown[]) => Promise<void>> | null)?.[name]
    if (typeof fn !== 'function') return false
    try { await fn(c, ...rest); return true } catch (err) { console.error(`  (${name} threw: ${String(err).slice(0, 200)})`); return false }
  }

  // ---------------------------------------------------------------------------
  console.log('\n[1] Regenerate all, with an edited lunch on the plan')
  {
    const { screen, ctx } = fresh({ lunch: EDITED, dinner: 'Rice pot' })
    model()
    const before = namesOf(screen.pools)
    const ok = await run('regenerateAllMeals', ctx())
    const stored = await getPools(P)
    check('the handlers exist and the run completed', ok)
    check('the model was really asked, and fresh dishes really arrived (the fixture is not a no-op)', calls >= 1 && (stored.dinner ?? []).some(o => /^Fresh dinner plate/.test(o.name)) && JSON.stringify(namesOf(stored)) !== JSON.stringify(before), { calls, stored: namesOf(stored) })
    check('storage kept the lunch she edited (her 3 Sep ruling — this was always true)', (stored.lunch ?? []).some(o => o.name === EDITED), namesOf(stored).lunch)
    check('...and dropped the app\'s own old suggestions', !(stored.lunch ?? []).some(o => o.name === 'Rice and greens') && !(stored.dinner ?? []).some(o => o.name === 'Rice pot'), namesOf(stored))
    // THE BUG: the screen showed the writer's answer, which never contains a kept meal.
    check('THE SCREEN HOLDS WHAT STORAGE HOLDS — the edited lunch is on it without a reload', JSON.stringify(namesOf(screen.pools)) === JSON.stringify(namesOf(stored)) && (screen.pools.lunch ?? []).some(o => o.name === EDITED), { screen: namesOf(screen.pools), stored: namesOf(stored) })
    check('her pick of that lunch is still on screen', screen.picks.lunch === EDITED, screen.picks)
    check('...and still saved, so it is still today\'s lunch after a reload', storedPicks().lunch === EDITED, storedPicks())
    check('a pick whose dish is GONE is cleared on screen (the dinner was the app\'s own, and was replaced)', screen.picks.dinner === undefined, screen.picks)
    check('...and in the saved picks', storedPicks().dinner === undefined, storedPicks())
    check('the working state went on, then off', screen.generating[0] === true && screen.generating[screen.generating.length - 1] === false && screen.generating.length === 2, screen.generating)
    check('nothing is reported as failed', screen.error === null && screen.unrecognised === null, { error: screen.error })
  }
  {
    // The read back fails (the connection dropped after the run): the writer's answer is still shown, and the pick is judged against it.
    const { screen, ctx } = fresh({ lunch: EDITED })
    model()
    const c = ctx()
    // Fail only the read AFTER the run: generation itself reads the options to decide what to keep.
    const realGenerate = (await import('../src/lib/meal-generation')).generateMealPools
    const ok = await run('regenerateAllMeals', { ...c, generate: async (params: Parameters<typeof realGenerate>[0]) => { const r = await realGenerate(params); failPoolReads = true; return r } })
    failPoolReads = false
    check('if the read back fails, the new meals are still shown rather than nothing', ok && (screen.pools.dinner ?? []).some(o => /^Fresh dinner plate/.test(o.name)) && (screen.pools.lunch ?? []).length > 0, namesOf(screen.pools))
    check('...and no pick is left pointing at a dish the screen does not hold', screen.picks.lunch === undefined || (screen.pools.lunch ?? []).some(o => o.name === screen.picks.lunch), { picks: screen.picks, lunch: namesOf(screen.pools).lunch })
  }

  // ---------------------------------------------------------------------------
  console.log('\n[2] Failures keep what they kept before')
  {
    const { screen, ctx } = fresh({ lunch: 'Rice and greens', dinner: 'Rice pot' })
    model(['breakfast', 'dinner'])   // nothing comes back for lunch
    const ok = await run('regenerateAllMeals', ctx())
    const stored = await getPools(P)
    check('a meal whose regeneration failed keeps its options, on screen and stored', ok && (screen.pools.lunch ?? []).some(o => o.name === 'Rice and greens') && (stored.lunch ?? []).some(o => o.name === 'Rice and greens'), namesOf(screen.pools).lunch)
    check('...and its pick (the 17 Sep fix)', screen.picks.lunch === 'Rice and greens' && storedPicks().lunch === 'Rice and greens', { screen: screen.picks, stored: storedPicks() })
    check('...while the meals that did regenerate lose a pick whose dish went', screen.picks.dinner === undefined && storedPicks().dinner === undefined, screen.picks)
    check('...and it says which meal it could not refresh, and that it kept what she had', /Lunch/.test(screen.error ?? '') && /kept what you had/.test(screen.error ?? ''), screen.error)
  }
  {
    const { screen, ctx } = fresh({ lunch: EDITED, dinner: 'Rice pot' })
    const before = JSON.stringify(namesOf(screen.pools))
    model('down')
    const ok = await run('regenerateAllMeals', ctx())
    check('the meal writer unreachable: nothing changes — options, picks, storage', ok && JSON.stringify(namesOf(screen.pools)) === before && screen.picks.dinner === 'Rice pot' && storedPicks().dinner === 'Rice pot' && JSON.stringify(namesOf(await getPools(P))) === before, { picks: screen.picks })
    check('...and it says the plan is unchanged', /existing plan is unchanged/.test(screen.error ?? ''), screen.error)
    check('...and the working state still ends', screen.generating[screen.generating.length - 1] === false && screen.generating.length === 2, screen.generating)
  }

  // ---------------------------------------------------------------------------
  console.log('\n[3] Regenerate one meal, and swap, as they were')
  {
    const { screen, ctx } = fresh({ lunch: EDITED, dinner: 'Rice pot' })
    model()
    const ok = await run('regenerateMealSlot', ctx(), 'dinner')
    const stored = await getPools(P)
    check('regenerating the dinner replaces the dinner\'s options and reads them back', ok && (screen.pools.dinner ?? []).some(o => /^Fresh dinner plate/.test(o.name)) && JSON.stringify(namesOf(screen.pools)) === JSON.stringify(namesOf(stored)), namesOf(screen.pools))
    check('...leaves the other meals\' options alone', JSON.stringify(namesOf(screen.pools).lunch) === JSON.stringify(namesOf(startPools()).lunch) && JSON.stringify(namesOf(screen.pools).breakfast) === JSON.stringify(namesOf(startPools()).breakfast))
    check('...clears the dinner\'s pick and no other', screen.picks.dinner === undefined && storedPicks().dinner === undefined && screen.picks.lunch === EDITED && storedPicks().lunch === EDITED, { screen: screen.picks, stored: storedPicks() })
  }
  {
    const { screen, ctx } = fresh({})
    const ok = await run('swapMealSlot', ctx(), 'dinner', 'Rice pot')
    check('a swap saves the pick and then shows it', ok && storedPicks().dinner === 'Rice pot' && screen.picks.dinner === 'Rice pot', { stored: storedPicks(), screen: screen.picks })
    const again = fresh({})
    failPickWrites = true
    await run('swapMealSlot', again.ctx(), 'dinner', 'Rice pot')
    failPickWrites = false
    check('a swap whose save fails is NOT shown as applied', again.screen.picks.dinner === undefined && storedPicks().dinner === undefined, again.screen.picks)
  }

  {
    // The single-meal handler had the same read back, and the same hole in it.
    const { screen, ctx } = fresh({ lunch: EDITED })
    model()
    const realGenerate = (await import('../src/lib/meal-generation')).generateMealPools
    await run('regenerateMealSlot', { ...ctx(), generate: async (params: Parameters<typeof realGenerate>[0]) => { const r = await realGenerate(params); failPoolReads = true; return r } }, 'dinner')
    failPoolReads = false
    check('regenerating one meal with the read back failing does not blank the screen either', (screen.pools.dinner ?? []).some(o => /^Fresh dinner plate/.test(o.name)) && (screen.pools.lunch ?? []).some(o => o.name === EDITED) && (screen.pools.breakfast ?? []).length > 0, namesOf(screen.pools))
  }

  // ---------------------------------------------------------------------------
  console.log('\n[4] What is not decided here, stated')
  {
    // A LOGGED MEAL IS REGENERATED LIKE ANY OTHER. Not a ruling: this is how it
    // has always behaved, the owner decision is open, and this check exists so
    // the behaviour is known rather than assumed. Re-anchor it when she rules.
    const { screen, ctx } = fresh({ dinner: 'Rice pot' })
    logMealEaten(P, today, 'dinner', 'Rice pot', { kcal: 600, protein: 50, carbs: 60, fat: 15 })
    model()
    await run('regenerateAllMeals', ctx())
    const ledger = await getTodayLedger(P, today, targets)
    const logged = loggedEventsBySlot(ledger.events)
    check('her record of the dinner she logged is untouched by a regenerate', (logged.dinner ?? []).length === 1 && (logged.dinner?.[0] as unknown as { mealName?: string })?.mealName === 'Rice pot', logged.dinner)
    check('...but the PLAN under it is replaced like any other meal: the dinner she logged is no longer among the dinner\'s options (owner decision pending)', !(screen.pools.dinner ?? []).some(o => o.name === 'Rice pot') && screen.picks.dinner === undefined, namesOf(screen.pools).dinner)
    const src = read('src/lib/meal-plan-actions.ts')
    check('...because no handler here reads what is logged (so nothing protects a logged meal yet)', src.length > 2000 && !/getTodayLedger|loggedEventsBySlot|meal_events/.test(src))
    check('...and none of them asks before acting (no confirm step — owner decision pending)', !/confirm\(|window\.confirm/.test(src))
  }

  // ---------------------------------------------------------------------------
  console.log('\n[5] One hook, for App and for the harness page')
  {
    const hook = read('src/hooks/useMealPlanActions.ts')
    check('the hook wraps the three functions', /swapMealSlot\(ctx, slot, chooseName\)/.test(hook) && /regenerateMealSlot\(ctx, slot\)/.test(hook) && /regenerateAllMeals\(ctx\)/.test(hook))
    check('...and holds the regenerate-all working state from the tap until it ends, however it ends', /setRegeneratingAll\(true\)\s*try \{ await regenerateAllMeals\(ctx\) \} finally \{ setRegeneratingAll\(false\) \}/.test(hook))
    const app = read('src/App.tsx')
    check('App uses the hook', /const mealActions = useMealPlanActions\(\{/.test(app))
    check('...for all three buttons', /const handleSwapMealSlot = mealActions\.swap/.test(app) && /const handleRegenerateMealSlot = mealActions\.regenerateSlot/.test(app) && /const handleRegenerateAllMeals = mealActions\.regenerateAll/.test(app))
    check('...and no longer carries its own copies (no meal generation or pick clearing inside a regenerate handler in App)', !/const handleRegenerateAllMeals = async/.test(app) && !/const handleRegenerateMealSlot = async/.test(app) && !/clearMealPick\(/.test(app))
    check('...hands the working state to the Nutrition tab', /mealsRegeneratingAll=\{mealActions\.regeneratingAll\}/.test(app))
    check('...and a goal change still rebuilds the meals through the same handler', /planInvalidation\?\.field === 'fitness_goal'\) await handleRegenerateAllMeals\(\)/.test(app) && /onGoalMealsNeedRebuild=\{handleRegenerateAllMeals\}/.test(app))
    const harness = read('.tour-harness/real.tsx')
    check('the harness page uses the same hook', /useMealPlanActions\(\{/.test(harness))
    check('...and hands its handlers to the real Nutrition tab (not noop) in the mode that drives them', /onRegenerateAllMeals=\{[^}]*mealActions\.regenerateAll/.test(harness) && /onSwapMealSlot=\{[^}]*mealActions\.swap/.test(harness) && /onRegenerateMealSlot=\{[^}]*mealActions\.regenerateSlot/.test(harness))
    const mealPlan = read('src/components/MealPlan.tsx')
    check('the meal list shows a working state over the whole list while it runs', /regeneratingAll && \(\s*<div role="status"[^>]*data-testid="meals-regenerating"/.test(mealPlan))
    check('...and the old meals cannot be tapped meanwhile', /inert=\{regeneratingAll\}/.test(mealPlan))
  }

  globalThis.fetch = realFetch
  console.log(`\n${ran} checks ran.`)
  if (failed > 0) { console.error(`${failed} check(s) failed\n`); process.exit(1) }
  console.log('Regenerate all shows what is stored, and keeps what is hers.\n')
}

main().catch(err => { console.error(err); process.exit(1) })

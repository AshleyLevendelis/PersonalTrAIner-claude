/**
 * test:meal-top-up — more meal options, and today does not move.
 *
 * Ashley, 28 Sep 2026, from three options: "Button, keep today". A button on
 * Nutrition tops each meal up to seven; today, and any day already on the
 * shopping list, stay exactly as they are.
 *
 * "Exactly" is the whole difficulty, and it was measured before it was built
 * (docs/plans/meal-top-up.md): two days in three at 10% target drift carry a
 * dish the search resized, and four lunches a week are last night's dinner.
 * Saving dish names would have changed both. So the new meals carry a first
 * day, and every day before it is worked out from the pool as it was.
 *
 *   1. the first-day tag, and the pool as it stands on a date;
 *   2. held days are byte-identical to before, resized dishes and leftovers
 *      included, and the new meals appear only from the first day;
 *   3. a leftover always comes from the dinner actually cooked the night
 *      before (the boundary above makes it happen on purpose; a swap already
 *      did);
 *   4. the offer's arithmetic: what is short, from when, and the run order;
 *   5. the meal generator stamps what it adds, and only then;
 *   6. the wording, and the wiring a screen cannot show.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { computeSlotBudgets, type AssembledDay, type PoolOption } from '../src/lib/meal-generation'
import { buildRotation, serveDates, addDays, datesFrom, poolsServedOn } from '../src/lib/meal-rotation'
import { newFromDate, tagsNewFrom, isBookkeepingTag, displayTags, NEW_FROM_TAG_PREFIX } from '../src/lib/meal-new-from'
import { topUpNeeds, topUpStartDate, topUpStartLabel, runMealTopUp, topUpOffer } from '../src/lib/meal-top-up'
import { moreMealOptionsOffer, moreMealOptionsDone, moreMealOptionsWhy, MORE_MEALS } from '../src/lib/coach-voice'
import type { MealSlotName } from '../src/lib/meal-store'
import type { MacroTargets } from '../src/lib/types'
import { mulberry32, makeDish } from './meal-fixture'

process.env.VITE_SUPABASE_URL = 'http://fake.local'
process.env.VITE_SUPABASE_ANON_KEY = 'anon'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const read = (f: string) => strip(readFileSync(join(ROOT, f), 'utf8'))

let ran = 0
let failed = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failed++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 400)}` : ''}`) }
}

type Pools = Partial<Record<MealSlotName, PoolOption[]>>
const TODAY = '2026-09-28'
const WEEK = datesFrom(TODAY, 7)
/** Everything a card shows for a day: every dish, its amounts, its lines, and the day's totals. */
const dayKey = (d: AssembledDay) => JSON.stringify([
  (Object.keys(d.chosen) as MealSlotName[]).sort().map(s => {
    const o = d.chosen[s]!
    return [s, o.name, o.ingredients.map(i => [i.name, i.quantity, i.unit]), o.macros, o.leftoverFrom ?? null, o.reusedTomorrow ?? null]
  }),
  d.totals, d.withinTolerance,
])

/** A realistic plan made at five options a meal, for targets `drift` away from today's. */
function plan(seed: number, drift: number, size = 5) {
  const rnd = mulberry32(seed)
  const calories = 1700 + Math.round(rnd() * 1300)
  const protein = Math.round((calories * (0.25 + rnd() * 0.1)) / 4)
  const fat = Math.round((calories * (0.25 + rnd() * 0.1)) / 9)
  const targets: MacroTargets = { calories, protein, carbs: Math.round((calories - protein * 4 - fat * 9) / 4), fat }
  const made: MacroTargets = { calories: Math.round(calories * drift), protein: Math.round(protein * drift), carbs: Math.round(targets.carbs * drift), fat: Math.round(fat * drift) }
  const budgets = computeSlotBudgets(made, 3, true)
  const pools: Pools = {}
  for (const [slot, b] of Object.entries(budgets) as [MealSlotName, MacroTargets][]) {
    pools[slot] = Array.from({ length: size }, (_, i) => makeDish(rnd, slot, i, b)).filter((o): o is PoolOption => o !== null)
  }
  /** Two more a meal, as the top-up would add them, first served on `from`. */
  const withMore = (from: string): Pools => {
    const out: Pools = {}
    for (const [slot, b] of Object.entries(budgets) as [MealSlotName, MacroTargets][]) {
      const extra = [0, 1].map(i => makeDish(rnd, slot, 50 + i, b)).filter((o): o is PoolOption => o !== null)
        .map(o => ({ ...o, name: `${o.name} (new)`, tags: tagsNewFrom(o.tags, from) }))
      out[slot] = [...(pools[slot] ?? []), ...extra]
    }
    return out
  }
  return { targets, pools, withMore, ok: Object.values(pools).every(v => (v?.length ?? 0) >= 3) }
}
const SHAPE = { mealsPerDay: 3, includeSnacks: true, batchCooking: true }

async function main() {
  console.log('\n1. A new meal\'s first day')
  {
    const o = (tags: string[]) => ({ tags })
    check('the first day is read from its tag', newFromDate(o(['Italian', `${NEW_FROM_TAG_PREFIX}2026-10-01`])) === '2026-10-01')
    check('...a meal without one has always been servable', newFromDate(o(['Italian'])) === null)
    check('...and a malformed one is ignored rather than guessed', newFromDate(o([`${NEW_FROM_TAG_PREFIX}soon`])) === null)
    const retagged = tagsNewFrom(['Thai', 'favourite', `${NEW_FROM_TAG_PREFIX}2026-10-01`], '2026-10-05')
    check('setting it replaces an earlier one and keeps every other tag, cuisine first',
      JSON.stringify(retagged) === JSON.stringify(['Thai', 'favourite', `${NEW_FROM_TAG_PREFIX}2026-10-05`]), retagged)
    check('it is bookkeeping, never a label on the card', isBookkeepingTag(`${NEW_FROM_TAG_PREFIX}2026-10-01`) && !isBookkeepingTag('Thai') && !isBookkeepingTag('favourite'))
    const dish = (name: string, tags: string[] = []): PoolOption => ({ slot: 'dinner', name, ingredients: [], macros: { calories: 0, protein: 0, carbs: 0, fat: 0 }, tags })
    const pools: Pools = { dinner: [dish('Old'), dish('New', tagsNewFrom([], '2026-10-01'))] }
    check('before its first day a new meal is not in the pool', (poolsServedOn(pools, '2026-09-30').dinner ?? []).map(d => d.name).join() === 'Old')
    check('...on its first day it is', (poolsServedOn(pools, '2026-10-01').dinner ?? []).length === 2)
    check('...and after it', (poolsServedOn(pools, '2026-10-09').dinner ?? []).length === 2)
    check('a pool with nothing held back is handed back as THE SAME OBJECT (every memo and the rotation shortcut depend on it)',
      poolsServedOn(pools, '2026-10-02') === pools && poolsServedOn({ dinner: [dish('Old')] }, '2026-09-30') !== undefined)
  }

  console.log('\n2. Held days are exactly as they were')
  {
    let held = 0
    let heldResized = 0
    let heldLeftover = 0
    let newBefore = 0
    let newFrom = 0
    const changed: string[] = []
    for (let p = 0; p < 12; p++) {
      const { targets, pools, withMore, ok } = plan(700 + p, 0.9)
      if (!ok) continue
      const likes = p % 2 === 0 ? ['chicken breast'] : []
      const from = addDays(TODAY, 3)
      const before = serveDates({ dates: WEEK, pools, targets, softLikedFoods: likes, shape: SHAPE, rotation: buildRotation(pools, targets, likes, SHAPE) })
      const more = withMore(from)
      const after = serveDates({ dates: WEEK, pools: more, targets, softLikedFoods: likes, shape: SHAPE, rotation: buildRotation(more, targets, likes, SHAPE) })
      before.forEach((b, i) => {
        const a = after[i]
        const newCount = Object.values(a.day.chosen).filter(o => o && /\(new\)$/.test(o.name)).length
        if (b.date < from) {
          held++
          if (dayKey(a.day) !== dayKey(b.day)) changed.push(`${p}/${b.date}`)
          newBefore += newCount
          for (const [slot, o] of Object.entries(b.day.chosen) as [MealSlotName, PoolOption][]) {
            if (o.leftoverFrom) { heldLeftover++; continue }
            const stored = pools[slot]?.find(x => x.name === o.name)
            if (stored && JSON.stringify(stored.ingredients) !== JSON.stringify(o.ingredients)) heldResized++
          }
        } else {
          newFrom += newCount
        }
      })
    }
    // LITERAL: twelve plans, three held days each. A short run reads as
    // "nothing changed" otherwise.
    check('36 held days were compared', held === 36, held)
    check('every held day is identical after the top-up: dishes, amounts, leftovers, lines and totals', changed.length === 0, changed)
    check('...and the check covers the hard cases: held days with a dish the search resized', heldResized > 0, heldResized)
    check('...and held days whose lunch is last night\'s dinner', heldLeftover > 0, heldLeftover)
    check('no new meal appears before its first day', newBefore === 0, newBefore)
    check('...and new meals are served from it, so the tap did something', newFrom > 0, newFrom)
  }

  console.log('\n3. A leftover comes from the dinner actually cooked')
  {
    let lunchesChecked = 0
    const wrongLeftover: string[] = []
    const wrongLine: string[] = []
    const twiceToday: string[] = []
    const lunchSaysCook: string[] = []
    for (let p = 0; p < 12; p++) {
      const { targets, pools, withMore, ok } = plan(900 + p, 0.9)
      if (!ok) continue
      for (const variant of ['boundary', 'swap'] as const) {
        let use = pools
        let pinsByDate: Record<string, Partial<Record<MealSlotName, PoolOption>>> = {}
        if (variant === 'boundary') use = withMore(addDays(TODAY, 2 + (p % 4)))
        else {
          // Swap tonight's dinner for another one on every other day.
          const base = serveDates({ dates: WEEK, pools, targets, shape: SHAPE })
          pinsByDate = Object.fromEntries(base.filter((_, i) => i % 2 === 0).map(s => {
            const other = (pools.dinner ?? []).find(o => o.name !== s.day.chosen.dinner?.name)!
            return [s.date, { dinner: other }]
          }))
        }
        const run = serveDates({ dates: WEEK, pools: use, targets, shape: SHAPE, pinsByDate })
        run.forEach((s, i) => {
          const lunch = s.day.chosen.lunch
          const dinner = s.day.chosen.dinner
          if (lunch?.leftoverFrom === 'dinner') {
            lunchesChecked++
            if (i > 0 && lunch.name !== run[i - 1].day.chosen.dinner?.name) wrongLeftover.push(`${variant} ${p}/${s.date}: ${lunch.name}`)
            if (lunch.reusedTomorrow) lunchSaysCook.push(`${variant} ${p}/${s.date}`)
            if (dinner && dinner.name === lunch.name) twiceToday.push(`${variant} ${p}/${s.date}`)
          }
          if (dinner?.reusedTomorrow && i + 1 < run.length) {
            const next = run[i + 1].day.chosen.lunch
            if (!(next?.leftoverFrom === 'dinner' && next.name === dinner.name)) wrongLine.push(`${variant} ${p}/${s.date}`)
          }
          if (i + 1 < run.length && dinner && !dinner.reusedTomorrow) {
            const next = run[i + 1].day.chosen.lunch
            if (next?.leftoverFrom === 'dinner' && next.name === dinner.name) wrongLine.push(`${variant} ${p}/${s.date} (missing)`)
          }
        })
      }
    }
    check('the sanity check: leftover lunches were served across boundaries and swaps', lunchesChecked > 20, lunchesChecked)
    check('every "last night\'s dinner" lunch is the dinner served the night before', wrongLeftover.length === 0, wrongLeftover)
    check('"cook both portions" is on a dinner exactly when the next day\'s lunch is its leftover', wrongLine.length === 0, wrongLine)
    check('a leftover never sits beside the same dish at dinner', twiceToday.length === 0, twiceToday)
    check('a lunch never carries the dinner\'s "cook both portions" line', lunchSaysCook.length === 0, lunchSaysCook)

    // The swap case on one day, spelled out: tonight's dinner is swapped, so
    // tomorrow's lunch is the NEW dinner's leftover, or cooked fresh — never
    // the dinner she swapped away.
    const { targets, pools } = plan(4242, 0.9)
    const base = serveDates({ dates: WEEK, pools, targets, shape: SHAPE })
    const k = base.findIndex((s, i) => i + 1 < base.length && base[i + 1].day.chosen.lunch?.leftoverFrom === 'dinner')
    check('the sanity check: the fixture has a day whose next lunch is its leftover', k >= 0, k)
    if (k >= 0) {
      const planned = base[k].day.chosen.dinner!.name
      const other = (pools.dinner ?? []).find(o => o.name !== planned)!
      const swapped = serveDates({ dates: WEEK, pools, targets, shape: SHAPE, pinsByDate: { [base[k].date]: { dinner: other } } })
      const nextLunch = swapped[k + 1].day.chosen.lunch
      check('after a swap, tomorrow\'s lunch is never the dinner she swapped away', nextLunch?.name !== planned, nextLunch?.name)
      check('...it is the new dinner\'s leftover, or cooked fresh', nextLunch?.leftoverFrom !== 'dinner' || nextLunch.name === other.name, nextLunch)
    } else {
      check('after a swap, tomorrow\'s lunch is never the dinner she swapped away', false)
      check('...it is the new dinner\'s leftover, or cooked fresh', false)
    }
  }

  {
    // A RUN WITH A GAP does not know what "last night" was after the gap, so
    // the rotation's own plan stands there rather than a dinner two days old.
    const { targets, pools } = plan(4343, 0.9)
    const rotation = buildRotation(pools, targets, [], SHAPE)
    const full = serveDates({ dates: WEEK, pools, targets, shape: SHAPE, rotation })
    const g = full.findIndex((s, i) => i >= 2 && s.day.chosen.lunch?.leftoverFrom === 'dinner' && full[i - 2].day.chosen.dinner?.name !== s.day.chosen.lunch.name)
    check('the sanity check: a leftover day whose dinner two days before was a different dish', g >= 2, g)
    const i = Math.max(2, g)
    const gapped = serveDates({ dates: [WEEK[i - 2], WEEK[i]], pools, targets, shape: SHAPE, rotation })
    check('after a gap, the lunch is the rotation\'s own plan, not a leftover of a dinner two days old',
      gapped[1]?.day.chosen.lunch?.name === full[i].day.chosen.lunch?.name, [gapped[1]?.day.chosen.lunch?.name, full[i].day.chosen.lunch?.name])
  }

  console.log('\n4. What is short, and from when')
  {
    const dish = (name: string, breaks = false): PoolOption => ({ slot: 'dinner', name, ingredients: [], macros: { calories: 0, protein: 0, carbs: 0, fat: 0 }, tags: [], ...(breaks ? { breaksRestriction: true as const } : {}) })
    const five = (slot: MealSlotName) => Array.from({ length: 5 }, (_, i) => ({ ...dish(`${slot} ${i}`), slot }))
    const needs = topUpNeeds({ breakfast: five('breakfast'), lunch: five('lunch'), dinner: five('dinner'), snack: five('snack') }, ['breakfast', 'lunch', 'dinner', 'snack'])
    check('a plan made at five needs two more for every meal', JSON.stringify(needs) === JSON.stringify({ breakfast: 2, lunch: 2, dinner: 2, snack: 2 }), needs)
    const marked = topUpNeeds({ dinner: [dish('a'), dish('b'), dish('c', true), dish('d', true), dish('e')] }, ['dinner'])
    check('a meal she now avoids is not an option, so it does not count', marked.dinner === 4, marked)
    check('a meal with none at all is a missing meal, not a short one', topUpNeeds({ dinner: [] }, ['dinner']).dinner === undefined)
    check('a meal already at seven is left alone', topUpNeeds({ dinner: Array.from({ length: 7 }, (_, i) => dish(`d${i}`)) }, ['dinner']).dinner === undefined)
    check('...and a slot the plan does not use is ignored', topUpNeeds({ snack: five('snack') }, ['breakfast']).snack === undefined)

    check('with nothing on the list, new meals start tomorrow', topUpStartDate(TODAY, []) === '2026-09-29')
    check('with today to Wednesday on the list, they start Thursday', topUpStartDate(TODAY, ['2026-09-28', '2026-09-29', '2026-09-30']) === '2026-10-01')
    check('with a gap on the list, every day up to the last one is held (days are a chain)', topUpStartDate(TODAY, ['2026-09-28', '2026-10-02']) === '2026-10-03')
    check('a list day that has passed does not hold anything', topUpStartDate(TODAY, ['2026-09-20']) === '2026-09-29')
    check('the start is said as "tomorrow"', topUpStartLabel(TODAY, '2026-09-29') === 'tomorrow')
    check('...as a weekday within the week', topUpStartLabel(TODAY, '2026-10-01') === 'on Thursday', topUpStartLabel(TODAY, '2026-10-01'))
    check('...and with its date a week or more out, so "Monday" cannot mean today', topUpStartLabel(TODAY, '2026-10-05') === 'on Monday 5 October', topUpStartLabel(TODAY, '2026-10-05'))

    // The run itself, with the effects handed in.
    const calls: { slots: MealSlotName[]; count: number; from: string }[] = []
    let read = 0
    const r1 = await runMealTopUp({
      needs: { breakfast: 2, lunch: 2, dinner: 4 }, today: TODAY,
      readCoverage: async () => { read++; return ['2026-09-28', '2026-09-29'] },
      generate: async (slots, count, from) => {
        calls.push({ slots, count, from })
        return { accepted: Object.fromEntries(slots.map(s => [s, Array.from({ length: count }, (_, i) => dish(`${s}${i}`))])), generatorReached: true }
      },
    })
    check('the list is read before anything is asked for', read === 1 && calls.length > 0)
    check('meals short by the same number are asked for together', calls.length === 2 && calls.some(c => c.count === 2 && c.slots.join() === 'breakfast,lunch') && calls.some(c => c.count === 4 && c.slots.join() === 'dinner'), calls)
    check('...each first served the day after the last list day', calls.every(c => c.from === '2026-09-30') && r1.from === '2026-09-30', calls)
    check('...and the result counts what arrived', r1.added.breakfast === 2 && r1.added.dinner === 4 && r1.reached, r1)

    let asked = 0
    const r2 = await runMealTopUp({
      needs: { dinner: 2 }, today: TODAY,
      readCoverage: async () => { throw new Error('offline') },
      generate: async () => { asked++; return { accepted: {}, generatorReached: true } },
    })
    check('a list that cannot be read stops everything: nothing is asked for', asked === 0 && r2.listUnreadable && r2.from === null, r2)

    // A throw out of the run is a FAILED CHECK, not a crash of this gate: a
    // crash would run fewer checks and read as nothing at all.
    const r3 = await runMealTopUp({
      needs: { breakfast: 2, dinner: 4 }, today: TODAY,
      readCoverage: async () => [],
      generate: async (slots, count) => {
        if (slots.includes('dinner')) throw new Error('cut off')
        return { accepted: Object.fromEntries(slots.map(s => [s, Array.from({ length: count }, (_, i) => dish(`${s}${i}`))])), generatorReached: true }
      },
    }).catch(() => null)
    check('one request failing keeps what the others added', r3 !== null && r3.added.breakfast === 2 && (r3.added.dinner ?? 0) === 0 && r3.reached, r3)
  }

  console.log('\n5. The meal generator stamps what it adds, and only then')
  {
    type Row = Record<string, unknown>
    const db: Record<string, Row[]> = { meal_plan_slots: [], grocery_items: [] }
    let failTable = ''
    const fakeFrom = (table: string) => {
      const filters: ((r: Row) => boolean)[] = []
      let op: 'select' | 'insert' | 'delete' | 'update' = 'select'
      let payload: Row | Row[] | null = null
      const exec = () => {
        db[table] ??= []
        if (op === 'select' && failTable === table) return { data: null, error: { message: 'simulated read failure' } }
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
    let n = 0
    let requests = 0
    ;(globalThis as { fetch: unknown }).fetch = async (_u: string, init?: { body?: string }) => {
      requests++
      const body = JSON.parse(init?.body ?? '{}') as { slots: { slot: string; count: number }[] }
      const meals = body.slots.flatMap(({ slot, count }) => Array.from({ length: count }, (_, i) => ({
        slot, name: `${slot} bowl ${++n}-${i}`, cuisine: 'British / Classic', prep: 'Grill, steam, serve.',
        ingredients: ['200g chicken breast', '220g cooked basmati rice', '1 tbsp olive oil', '100g broccoli'],
      })))
      return { ok: true, status: 200, json: async () => ({ meals }) }
    }
    const { setSupabaseClient } = await import('../src/lib/supabase')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setSupabaseClient({ from: fakeFrom } as any)
    const { generateMealPools } = await import('../src/lib/meal-generation')
    const { getPools } = await import('../src/lib/meal-store')
    const targets = { calories: 2200, protein: 150, carbs: 240, fat: 70 }
    const base = { targets, dietaryPreferences: [], mealsPerDay: 3, includeSnacks: false, onlySlots: ['lunch' as MealSlotName] }
    await generateMealPools({ ...base, profileId: 'p', poolSize: 5 })
    await generateMealPools({ ...base, profileId: 'p', poolSize: 2, appendToExisting: true, servedFrom: '2026-10-01' })
    const lunch = (await getPools('p')).lunch ?? []
    check('the sanity check: five from the plan and two added', lunch.length === 7, lunch.length)
    check('the two added carry their first day', lunch.filter(o => newFromDate(o) === '2026-10-01').length === 2, lunch.map(o => o.tags))
    check('...and the five already there carry none', lunch.filter(o => newFromDate(o) === null).length === 5)
    await generateMealPools({ ...base, profileId: 'q', poolSize: 2, appendToExisting: true })
    await generateMealPools({ ...base, profileId: 'r', poolSize: 3, servedFrom: '2026-10-01' })
    const q = (await getPools('q')).lunch ?? []
    const r = (await getPools('r')).lunch ?? []
    check('"find more options" (no first day given) stamps nothing: she is choosing for today', q.length > 0 && q.every(o => newFromDate(o) === null), q.map(o => o.tags))
    check('a fresh plan stamps nothing, even if a first day is passed', r.length > 0 && r.every(o => newFromDate(o) === null), r.map(o => o.tags))

    // THE BUTTON ITSELF, the function App and the browser harness both call,
    // end to end against the fake database.
    const { topUpMealPlan } = await import('../src/lib/meal-top-up')
    db.grocery_items.push({
      id: 'g1', profile_id: 'b', source: 'generated', canonical_key: 'oats', display_name: 'oats', quantity: 80, unit: 'g',
      category: 'dry_goods', checked: false, dismissed: false, needs_review: false, user_edited: false, client_id: 'g1', created_at: '2026-09-27T00:00:00.000Z',
      meal_refs: [{ day: 0, date: TODAY, slot: 'breakfast', mealName: 'x' }, { day: 1, date: '2026-09-29', slot: 'lunch', mealName: 'y' }],
    })
    await generateMealPools({ ...base, profileId: 'b', poolSize: 5 })
    const generation = { targets, dietaryPreferences: [], mealsPerDay: 3, includeSnacks: false }
    const done = await topUpMealPlan({ profileId: 'b', today: TODAY, needs: { lunch: 2 }, generation })
    const bLunch = (await getPools('b')).lunch ?? []
    check('the button adds what was short, first served the day after the last list day',
      done.added === 2 && bLunch.length === 7 && bLunch.filter(o => newFromDate(o) === '2026-09-30').length === 2, bLunch.map(o => o.tags))
    check('...and says so, with the day', !done.note.failed && /^Added 2 new meals\. They start on Wednesday;/.test(done.note.text), done.note)

    failTable = 'grocery_items'
    const before = requests
    const blocked = await topUpMealPlan({ profileId: 'c', today: TODAY, needs: { lunch: 2 }, generation })
    failTable = ''
    check('a shopping list that cannot be read: nothing is generated or stored', requests === before && ((await getPools('c')).lunch ?? []).length === 0, { requests: requests - before })
    check('...and the receipt says it was the list, and that nothing changed', blocked.note.failed && /shopping list/.test(blocked.note.text) && /nothing has changed/.test(blocked.note.text), blocked.note)
  }

  console.log('\n6. The words, and the wiring')
  {
    const offer = moreMealOptionsOffer([5, 5, 5, 5], 7)
    check('the offer says what she has, what it will do, and what it will not touch',
      /have 5 options each/.test(offer) && /up to 7/.test(offer) && /Today, and any day on your shopping list, stay exactly as they are/.test(offer), offer)
    check('...and names the fewest when the meals differ', /only 3 options/.test(moreMealOptionsOffer([5, 3], 7)))
    const done = moreMealOptionsDone({ added: 8, asked: 8, reached: true, listUnreadable: false, startLabel: 'on Thursday' })
    check('the receipt says how many, and from when', /Added 8 new meals\. They start on Thursday; every day before then stays as it was\./.test(done), done)
    check('...owns up when it is fewer than asked', /fewer than I asked for/.test(moreMealOptionsDone({ added: 5, asked: 8, reached: true, listUnreadable: false, startLabel: 'tomorrow' })))
    const failures = [
      moreMealOptionsDone({ added: 0, asked: 8, reached: false, listUnreadable: true, startLabel: '' }),
      moreMealOptionsDone({ added: 0, asked: 8, reached: false, listUnreadable: false, startLabel: '' }),
      moreMealOptionsDone({ added: 0, asked: 8, reached: true, listUnreadable: false, startLabel: '' }),
    ]
    check('...and every failure says nothing has changed', failures.every(f => /nothing has changed/.test(f)), failures)
    check('...a list it could not read is named as that, not as the generator', /shopping list/.test(failures[0]) && /meal generator/.test(failures[1]) && /fit your targets/.test(failures[2]), failures)

    const app = read('src/App.tsx')
    const grocery = read('src/lib/grocery-store.ts')
    check('the offer counts only the meals she can be served (the marked pools)', /topUpNeeds\(mealPools, activeMealSlots\)/.test(app) && /const mealPools = useServablePools\(/.test(app))
    check('...waits while the first plan is being built, and respects "Not now"', /const mealTopUpOffer = !initialMealBuild && !mealTopUpDismissed \? topUpOffer\(mealTopUpNeeds\) : null/.test(app))
    check('...and there is no offer when nothing is short', topUpOffer({}) === null && topUpOffer({ dinner: 2 }) === moreMealOptionsOffer([5], 7))
    // RE-ANCHORED 29 Sep 2026: the run moved into runMealTopUpNow so the
    // coach's confirm and the button share it. The property is unchanged: the
    // run calls the shared function with today and what is short.
    const handler = app.slice(app.indexOf('const runMealTopUpNow'), app.indexOf('const handleFindMoreMealOptions'))
    check('App\'s run calls the shared function, with today and what is short', /topUpMealPlan\(\{\s*profileId,\s*today: mealRotationDate,\s*needs: mealTopUpNeeds,/.test(handler), handler.slice(0, 200))
    check('...with the likes and hearted meals she can still eat, like every other generation', /likedFoods: typedFoodLikes/.test(handler) && /favouriteMeals: steerableFavouriteMeals/.test(handler))
    check('...and reloads the pools only when something was added', /if \(r\.added > 0\) setMealPools\(await getPools\(profileId\)\)/.test(handler))
    check('the strict read really throws where the ordinary one falls back', /if \(opts\.strict\) throw err/.test(grocery))
    const shown = displayTags(['Italian', `${NEW_FROM_TAG_PREFIX}2026-10-01`, 'favourite'])
    check('the card\'s labels never include the first day, and stay at two', JSON.stringify(shown) === JSON.stringify(['Italian', 'favourite']), shown)
    check('...and the old internal marker stays hidden too', JSON.stringify(displayTags(['slot_appropriate', 'Thai'])) === JSON.stringify(['Thai']))
    const mealPlan = read('src/components/MealPlan.tsx')
    check('...and the card draws its labels ONLY through that function', /displayTags\(option\.tags\)\.map\(/.test(mealPlan) && !/option\.tags\.(filter|slice|map)\(/.test(mealPlan))
    const nd = read('src/components/NutritionDisplay.tsx')
    check('the screen shows the offer only until there is a receipt, and the receipt says whether it failed',
      /mealTopUp && !mealTopUpNote/.test(nd) && /data-failed=\{mealTopUpNote\.failed/.test(nd))
  }

  console.log('\n7. The coach can do it too, through the same run')
  {
    const fn = read('supabase/functions/chat-gemini/index.ts')
    const chat = read('src/components/ChatAssistant.tsx')
    const app = read('src/App.tsx')
    const voice = read('src/lib/coach-voice.ts')

    check('the coach declares the tool, taking only the words she used', /name: "propose_meal_top_up"/.test(fn)
      && /required: \["origin_verbatim_quote"\]/.test(fn.slice(fn.indexOf('name: "propose_meal_top_up"'), fn.indexOf('name: "propose_exercise_swap"'))))
    // THE THINNEST COURIER, like the resize: which meals are short, by how
    // many and from when are questions about pools and a shopping list that
    // only the client holds, so the handler may carry no number, no meal name.
    const handlerStart = fn.indexOf('if (name === "propose_meal_top_up")')
    const handlerBody = handlerStart < 0 ? '' : fn.slice(handlerStart, fn.indexOf('if (name === "propose_session_move")', handlerStart))
    check('...its handler only forwards the words: no number and no meal named', handlerBody.length > 0
      && /kind: "propose_meal_top_up"/.test(handlerBody) && !/kcal|calories|breakfast|\b7\b|\bseven\b/i.test(strip(handlerBody).replace(/propose_meal_top_up/g, '')), handlerBody.slice(0, 200))
    const rule = fn.slice(fn.indexOf('MORE MEALS TO CHOOSE FROM IS A SEVENTH THING'), fn.indexOf('MORE MEALS TO CHOOSE FROM IS A SEVENTH THING') + 2600)
    check('the prompt separates it from a swap, an addition and a regeneration',
      /not a swap/.test(rule) && /not an addition/.test(rule) && /not a regeneration/.test(rule) && /never offer to regenerate/.test(rule), rule.slice(0, 300))
    check('...says the days already shopped for do not change, so the coach cannot promise this week will look different',
      /EVERY DAY ALREADY ON THEIR SHOPPING LIST DO NOT CHANGE/.test(rule) && /never tell them this week will look different/.test(rule))
    check('...and that a complaint is not an ask: talk first, call on a yes (her 24 Sep "a coach wouldn\'t send a card")',
      /A COMPLAINT IS NOT AN ASK/.test(rule) && /only when they say so/.test(rule))
    check('...and never points at a control or states a number', !/Get more options|Nutrition tab|the button/i.test(rule) && /Never state how many options/.test(rule), rule.slice(0, 200))
    check('...and it is in the list of cards that bring their own Confirm buttons, so no quick-reply chips are added on top',
      /propose_meal_refit, propose_meal_top_up, propose_cardio_session\)/.test(fn))

    check('the chat builds the card from what App hands it: nothing the model said', /const buildMealTopUpProposal = async/.test(chat)
      && /buildMealTopUpProposal\(result\.proposal\.rawArgs \?\? \{\}\)/.test(chat))
    const builder = chat.slice(chat.indexOf('const buildMealTopUpProposal'), chat.indexOf('const buildGoalChangeProposal'))
    check('...it refuses with a reason in three places: no body details, first plan still building, everything full',
      /MORE_MEALS\.refusals\.noBody/.test(builder) && /MORE_MEALS\.refusals\.building/.test(builder) && /MORE_MEALS\.refusals\.full\(DEFAULT_POOL_SIZE\)/.test(builder))
    check('...and a fourth: it will not state a start day off a shopping list it could not read', /if \(!start\) return \{ ok: false, refusal: MORE_MEALS\.refusals\.listUnreadable \}\s*return \{\s*ok: true/.test(builder), builder.slice(builder.indexOf('onMealTopUpStart'), builder.indexOf('onMealTopUpStart') + 260))
    check('...the card says what stays, and when the new meals start, from the phrasebook',
      /unchanged: \[MORE_MEALS\.unchanged\]/.test(builder) && /MORE_MEALS\.starts\(start\.label\)/.test(builder))
    check('...and lists the meals in the order of the day', /\['breakfast', 'lunch', 'dinner', 'snack'\] as MealSlotName\[\]\)\.filter/.test(builder))
    const confirm = chat.slice(chat.indexOf("row.kind === 'propose_meal_top_up'"), chat.indexOf("row.kind === 'propose_injury_adaptation'"))
    check('confirming calls the ONE shared run, not a copy of it', /await onMealTopUpConfirm\(\)/.test(confirm))
    check('...a partial landing is reported as partial, and a failure says what the run said',
      /failed: outcome\.added < outcome\.asked\s*\?/.test(confirm) && /outcome\?\.why/.test(confirm), confirm.slice(0, 300))
    check('the button and the coach go through ONE run in App',
      (app.match(/await runMealTopUpNow\(\)/g) ?? []).length === 2 && /onMealTopUpConfirm=\{handleMealTopUpFromChat\}/.test(app))
    check('...the coach is told the needs the app computes for the button, not its own', /mealTopUp=\{macros \? \{ needs: mealTopUpNeeds, building: initialMealBuild \} : null\}/.test(app))
    check('...and its receipt is in the chat, without setting the Nutrition tab\'s banner',
      !/setMealTopUpNote/.test(app.slice(app.indexOf('const handleMealTopUpFromChat'), app.indexOf('const previewMealTopUpStart'))))
    const card = read('src/components/chat/ReceiptCard.tsx')
    check('a receipt never prints an internal tool name, and a cause never gets a doubled full stop',
      /\/\^propose_\/\.test\(f\.op\) \? f\.error/.test(card) && /\.replace\(\/\[\.!\?\]\+\$\/, ''\)/.test(card), card.slice(card.indexOf('Didn'), card.indexOf('Didn') + 200))
    const why = moreMealOptionsWhy({ reached: false, listUnreadable: false })
    check('the cause-only line is one clause with no full stop, for a receipt that already says "Nothing was applied"',
      why === "I couldn't reach the meal generator just then" && !/[.!?]$/.test(why)
      && !/[.!?]$/.test(moreMealOptionsWhy({ reached: true, listUnreadable: false })) && !/[.!?]$/.test(moreMealOptionsWhy({ reached: true, listUnreadable: true })), why)
    check('...and the screen banner is that clause plus "so nothing has changed", retried only when a connection failed',
      moreMealOptionsDone({ added: 0, asked: 2, reached: false, listUnreadable: false, startLabel: '' }) === "I couldn't reach the meal generator just then, so nothing has changed. Try again in a moment."
      && !/Try again/.test(moreMealOptionsDone({ added: 0, asked: 2, reached: true, listUnreadable: false, startLabel: '' })))
    check('the phrasebook has the receipt words', /propose_meal_top_up: \{ done: 'Added', failed: "I couldn't add more meals" \}/.test(voice))
    const refusals = Object.values(MORE_MEALS.refusals).map(r => typeof r === 'function' ? r(7) : r)
    check('every refusal is a full sentence that names no control', refusals.length === 4
      && refusals.every(r => /[.]$/.test(r) && !/button|tab\b|Regenerate|Get more options|Profile screen/i.test(r.replace('you can add them in Profile', ''))), refusals)
    check('...the "full" one names the size and offers to swap instead', /Every meal already has 7 options, so there's nothing to add\./.test(MORE_MEALS.refusals.full(7)) && /I'll swap them/.test(MORE_MEALS.refusals.full(7)))
    check('...and the card\'s "unchanged" is ONE item with no full stop of its own (the card joins items with commas)',
      MORE_MEALS.unchanged.split('—').length === 2 && !/\.\s*$/.test(MORE_MEALS.unchanged.slice(0, -1)) )

    // THE START DAY THE CARD STATES, read off a real list: and null off a
    // list that cannot be read, so the card refuses rather than promise days.
    const { setSupabaseClient } = await import('../src/lib/supabase')
    const { previewTopUpStart } = await import('../src/lib/meal-top-up')
    const rows = [{
      id: 'g1', profile_id: 'pv', source: 'generated', canonical_key: 'oats', display_name: 'oats', quantity: 80, unit: 'g', category: 'dry_goods',
      checked: false, dismissed: false, needs_review: false, user_edited: false, client_id: 'g1', created_at: '2026-09-27T00:00:00.000Z',
      meal_refs: [{ day: 0, date: TODAY, slot: 'breakfast', mealName: 'x' }, { day: 1, date: '2026-09-29', slot: 'lunch', mealName: 'y' }],
    }]
    let listFails = false
    const client = {
      from: () => {
        const api: Record<string, unknown> = {
          select: () => api, eq: () => api, order: () => api,
          then: (res: (v: unknown) => void, rej?: (e: unknown) => void) => Promise.resolve(listFails ? { data: null, error: { message: 'offline' } } : { data: rows, error: null }).then(res, rej),
        }
        return api
      },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setSupabaseClient(client as any)
    const ok = await previewTopUpStart({ profileId: 'pv', today: TODAY })
    check('the preview names the day after the last list day, and how the card says it', ok?.from === '2026-09-30' && ok.label === 'on Wednesday', ok)
    listFails = true
    check('...and is null when the list cannot be read (the card then refuses)', (await previewTopUpStart({ profileId: 'pv', today: TODAY })) === null)
  }

  console.log(`\n${ran} checks ran`)
  if (failed > 0) { console.error(`${failed} check(s) failed`); process.exit(1) }
  console.log('meal top-up: all checks passed')
}

main().catch(err => { console.error(err); process.exit(1) })

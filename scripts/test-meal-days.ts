/**
 * test:meal-days — the Nutrition strip's upcoming days (27 Sep 2026).
 *
 * Ashley: "I can only see today's meal, I can't see upcoming meals and I
 * can't add things to the grocery list for future meals so I can plan ahead."
 * Her ruling, from three options: a strip of days across the top of
 * Nutrition; tap a day to see its meals, swap one, or add that day to the
 * shopping list.
 *
 * verify:meal-days drives the screen. This holds what a screen cannot show:
 *   1. the date arithmetic, across both clock changes;
 *   2. a pick names a pool option or pins nothing;
 *   3. THE LIST SHOPS FOR EXACTLY THE DAYS THE STRIP SHOWS, swaps included;
 *   4. adding a day recomputes rather than appends — idempotent, never
 *      counting a day twice, and every existing row protection intact;
 *   5. taking a day back off is the same recompute the other way;
 *   6. the coach's swap can name an upcoming day, and only one;
 *   7. a meal pick that did not save says so;
 *   8. the wiring in App, the coach's client and the coach itself.
 */
process.env.TZ = 'Europe/London'

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const strip = (x: string) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
const read = (p: string) => strip(readFileSync(join(ROOT, p), 'utf8'))

// --- Environment shims --------------------------------------------------------
const storeMap = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => storeMap.get(k) ?? null,
    setItem: (k: string, v: string) => { storeMap.set(k, String(v)) },
    removeItem: (k: string) => { storeMap.delete(k) },
    clear: () => { storeMap.clear() },
  },
  configurable: true,
})
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })

// --- Fake Supabase ------------------------------------------------------------
type Row = Record<string, unknown>
const db: Record<string, Row[]> = { grocery_items: [], meal_plan_slots: [], meal_plan_picks: [] }
/** Tables whose writes fail, to prove a failure is reported rather than dropped. */
const failingWrites = new Set<string>()
const cmp = (a: unknown, b: unknown) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0)
let clock = 0
function fakeFrom(table: string) {
  const filters: ((r: Row) => boolean)[] = []
  const orders: [string, boolean][] = []
  let op: 'select' | 'upsert' | 'delete' | 'update' | 'insert' = 'select'
  let payload: Row[] = []
  let onConflict: string[] | null = null
  let updateObj: Row | null = null
  const exec = () => {
    db[table] ??= []
    if ((op === 'upsert' || op === 'insert' || op === 'update' || op === 'delete') && failingWrites.has(table)) {
      return { data: null, error: { code: '08006', message: 'connection failure' } }
    }
    if (op === 'upsert' || op === 'insert') {
      for (const raw of payload) {
        const existing = onConflict ? db[table].find(r => onConflict!.every(c => r[c] === raw[c])) : undefined
        if (existing) Object.assign(existing, raw)
        else db[table].push({ id: crypto.randomUUID(), created_at: new Date(Date.UTC(2026, 8, 1, 0, 0, clock++)).toISOString(), ...raw })
      }
      return { data: null, error: null }
    }
    if (op === 'update') { for (const r of db[table]) if (filters.every(f => f(r))) Object.assign(r, updateObj); return { data: null, error: null } }
    if (op === 'delete') { db[table] = db[table].filter(r => !filters.every(f => f(r))); return { data: null, error: null } }
    let rows = db[table].filter(r => filters.every(f => f(r)))
    for (const [col, asc] of [...orders].reverse()) rows = [...rows].sort((a, b) => (asc ? 1 : -1) * cmp(a[col], b[col]))
    return { data: rows.map(r => ({ ...r })), error: null }
  }
  const api: Record<string, unknown> = {
    select: () => api,
    insert: (rows: Row | Row[]) => { op = 'insert'; payload = Array.isArray(rows) ? rows : [rows]; return api },
    upsert: (rows: Row | Row[], opts?: { onConflict?: string }) => {
      op = 'upsert'; payload = Array.isArray(rows) ? rows : [rows]
      onConflict = opts?.onConflict ? opts.onConflict.split(',') : null
      return api
    },
    update: (o: Row) => { op = 'update'; updateObj = o; return api },
    delete: () => { op = 'delete'; return api },
    eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return api },
    in: (c: string, vs: unknown[]) => { filters.push(r => vs.includes(r[c])); return api },
    order: (c: string, o?: { ascending?: boolean }) => { orders.push([c, o?.ascending !== false]); return api },
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => Promise.resolve().then(() => resolve(exec()), reject),
  }
  return api
}

let ran = 0, failed = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failed++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 400)}` : ''}`) }
}

async function main() {
  const { setSupabaseClient } = await import('../src/lib/supabase')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSupabaseClient({ from: fakeFrom } as any)
  const { addDays, datesFrom, pinsFromPicks, buildRotation, assembleRotationDay } = await import('../src/lib/meal-rotation')
  const { generateGroceryList, addGroceryDays, removeGroceryDays, coveredDates, getAllItems, addItemLocal, deleteItemLocal, flushPending } = await import('../src/lib/grocery-store')
  const { computeMealMacros } = await import('../src/lib/food-db')
  const { buildMealSwapProposal } = await import('../src/lib/meal-swap-proposal')
  const { setMealPick } = await import('../src/lib/meal-store')
  const { setDevClockOverride } = await import('../src/lib/dev-clock')

  console.log('meal days — the Nutrition strip\'s upcoming days')

  console.log('\n[1] Dates, across both clock changes')
  {
    const spring = datesFrom('2026-03-27', 5)
    const autumn = datesFrom('2026-10-23', 5)
    check('five days across the spring change are five consecutive dates',
      JSON.stringify(spring) === JSON.stringify(['2026-03-27', '2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31']), spring)
    check('...and across the autumn change', JSON.stringify(autumn) === JSON.stringify(['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27']), autumn)
    check('a month end, a year end and a leap day', addDays('2026-09-30', 1) === '2026-10-01' && addDays('2026-12-31', 1) === '2027-01-01' && addDays('2024-02-28', 1) === '2024-02-29')
    check('...and backwards', addDays('2026-10-01', -1) === '2026-09-30')
  }

  // Dishes whose stored macros ARE their ingredients', as every real option is.
  const dish = (slot: string, name: string, chicken: number, rice: number, oil: number) => {
    const ingredients = [
      { name: 'chicken breast', quantity: chicken, unit: 'g' },
      { name: 'white rice', quantity: rice, unit: 'g' },
      { name: 'olive oil', quantity: oil, unit: 'g' },
    ]
    const c = computeMealMacros(ingredients)
    return { slot, name, ingredients, tags: [], macros: { calories: Math.round(c.kcal), protein: Math.round(c.protein), carbs: Math.round(c.carbs), fat: Math.round(c.fat) } }
  }
  const pools = {
    breakfast: [dish('breakfast', 'Oats bowl', 60, 150, 8), dish('breakfast', 'Rice porridge', 55, 160, 7), dish('breakfast', 'Egg rice', 65, 140, 9)],
    lunch: [dish('lunch', 'Chicken salad', 150, 200, 12), dish('lunch', 'Rice and greens', 140, 220, 11), dish('lunch', 'Grain bowl', 160, 190, 13)],
    dinner: [dish('dinner', 'Tray bake', 170, 220, 14), dish('dinner', 'Rice pot', 160, 240, 12), dish('dinner', 'Baked chicken', 180, 210, 15)],
  } as never as Record<'breakfast' | 'lunch' | 'dinner', import('../src/lib/meal-generation').PoolOption[]>
  const sum = (a: { calories: number; protein: number; carbs: number; fat: number }[]) =>
    a.reduce((s, m) => ({ calories: s.calories + m.calories, protein: s.protein + m.protein, carbs: s.carbs + m.carbs, fat: s.fat + m.fat }), { calories: 0, protein: 0, carbs: 0, fat: 0 })
  const targets = sum([pools.breakfast[0].macros, pools.lunch[0].macros, pools.dinner[0].macros])
  const shape = { mealsPerDay: 3, includeSnacks: false, batchCooking: false }
  const today = '2026-09-27'
  const days = datesFrom(today, 7)

  console.log('\n[2] A pick names a meal, or pins nothing')
  {
    const pins = pinsFromPicks({ dinner: 'Rice pot', lunch: 'No such meal' }, pools)
    check('a pick naming a saved meal pins that meal', pins.dinner?.name === 'Rice pot', pins)
    check('...and one naming a meal no longer saved pins nothing, rather than a blank', !('lunch' in pins), Object.keys(pins))
  }

  console.log('\n[3] The list shops for exactly the days the strip shows')
  const rotation = buildRotation(pools, targets, [], shape)
  const unpinnedD2 = assembleRotationDay(rotation, days[2], pools, targets, [], {})
  const swappedDinner = pools.dinner.find(o => o.name !== unpinnedD2.chosen.dinner?.name)!
  const pinsByDate = { [days[2]]: { dinner: swappedDinner } }
  {
    check('the fixture is under pressure: the swap names a dinner that day would not otherwise serve',
      swappedDinner.name !== unpinnedD2.chosen.dinner?.name, { serves: unpinnedD2.chosen.dinner?.name, swap: swappedDinner.name })
    const profileId = crypto.randomUUID()
    // TODAY WITH A SWAP OF ITS OWN, so the list is shown to honour today's
    // picks too — a list re-deriving today would shop for the other breakfast.
    const todaysBase = assembleRotationDay(rotation, today, pools, targets, [], {}).chosen
    const todays = { ...todaysBase, breakfast: pools.breakfast.find(o => o.name !== todaysBase.breakfast?.name)! }
    await generateGroceryList({ profileId, mealPools: pools, targets, days: 7, todaysPicks: todays, pinsByDate, mealShape: shape, startDate: today })
    await flushPending()
    const refs = (await getAllItems(profileId)).flatMap(r => r.meal_refs)
    const mismatched: string[] = []
    for (const date of days) {
      const strip = assembleRotationDay(rotation, date, pools, targets, [], date === today ? todays : (pinsByDate[date] ?? {}))
      const want = Object.values(strip.chosen).map(o => `${o!.slot}:${o!.name}`).sort()
      const got = [...new Set(refs.filter(r => r.date === date).map(r => `${r.slot}:${r.mealName}`))].sort()
      if (JSON.stringify(want) !== JSON.stringify(got)) mismatched.push(`${date} want ${want} got ${got}`)
    }
    check('every one of the seven days shops for the meals the strip draws for it', mismatched.length === 0, mismatched)
    check('...including the swapped dinner, on its own day', refs.some(r => r.date === days[2] && r.slot === 'dinner' && r.mealName === swappedDinner.name))
    check('...and not the dinner it replaced, on that day', !refs.some(r => r.date === days[2] && r.slot === 'dinner' && r.mealName === unpinnedD2.chosen.dinner?.name))
    check('every reference carries its date', refs.length > 0 && refs.every(r => typeof r.date === 'string' && days.includes(r.date!)))
  }

  console.log('\n[4] Adding a day recomputes; it never appends')
  const pid = crypto.randomUUID()
  const base = { profileId: pid, mealPools: pools, targets, softLikedFoods: [], pinsByDate, mealShape: shape, today }
  const qtyByKey = async () => Object.fromEntries((await getAllItems(pid)).filter(r => r.source === 'generated').map(r => [r.canonical_key, r.quantity]))
  {
    const first = await addGroceryDays({ ...base, dates: [days[3]] })
    await flushPending()
    const rows = await getAllItems(pid)
    check('a day goes on an empty list, dated to that day and no other',
      !first.alreadyCovered && rows.length > 0 && rows.every(r => r.meal_refs.every(ref => ref.date === days[3])), rows.map(r => r.meal_refs.map(x => x.date)))
    const oneDay = await qtyByKey()

    const again = await addGroceryDays({ ...base, dates: [days[3]] })
    await flushPending()
    check('adding the same day again writes nothing and says it is already there',
      again.alreadyCovered && again.added === 0 && again.updated === 0 && JSON.stringify(await qtyByKey()) === JSON.stringify(oneDay), again)

    // A hand-added item and a removed row, before the next add.
    addItemLocal({ profileId: pid, name: 'coffee', quantity: 1, unit: 'whole', source: 'manual', currentItems: await getAllItems(pid) })
    const oil = (await getAllItems(pid)).find(r => r.canonical_key.includes('olive oil'))!
    deleteItemLocal(oil)
    await flushPending()

    const second = await addGroceryDays({ ...base, dates: [days[4]] })
    await flushPending()
    const after = await getAllItems(pid)
    check('a second day joins the first', JSON.stringify(second.covered) === JSON.stringify([days[3], days[4]]), second.covered)
    // The second day ALONE, computed the same way on a list of its own.
    const soloId = crypto.randomUUID()
    await addGroceryDays({ ...base, profileId: soloId, dates: [days[4]] })
    await flushPending()
    const solo = Object.fromEntries((await getAllItems(soloId)).map(r => [r.canonical_key, r.quantity]))
    const chicken = after.find(r => r.canonical_key.includes('chicken'))!
    const chickenKey = chicken.canonical_key
    check('an ingredient both days use is one line carrying both days\' amount',
      after.filter(r => r.canonical_key === chickenKey).length === 1 && Math.abs(chicken.quantity - (oneDay[chickenKey] + solo[chickenKey])) <= 1,
      { together: chicken.quantity, first: oneDay[chickenKey], second: solo[chickenKey] })
    check('...the hand-added item is untouched', after.some(r => r.source === 'manual' && /coffee/i.test(r.display_name)))
    check('...and the row she removed stays removed', !after.some(r => r.canonical_key.includes('olive oil')))

    const later = await addGroceryDays({ ...base, today: days[4], dates: [days[5]] })
    check('a covered day that has passed drops, the way Rebuild drops it', JSON.stringify(later.covered) === JSON.stringify([days[4], days[5]]), later.covered)
    await flushPending()

    const legacy = coveredDates([{ source: 'generated', meal_refs: [{ day: 2, slot: 'lunch', mealName: 'x' }] } as never], today, '2026-09-20')
    check('an older row with only an offset is dated from the build memo', JSON.stringify(legacy) === JSON.stringify(['2026-09-22']), legacy)
    const legacyNoMemo = coveredDates([{ source: 'generated', meal_refs: [{ day: 2, slot: 'lunch', mealName: 'x' }] } as never], today)
    check('...and from today without one, which is what the screen printed for it', JSON.stringify(legacyNoMemo) === JSON.stringify([days[2]]), legacyNoMemo)
    const manualOnly = coveredDates([{ source: 'manual', meal_refs: [{ day: 0, slot: 'x', mealName: 'x', date: days[1] }] } as never], today)
    check('...and a hand-added row covers no day at all', manualOnly.length === 0, manualOnly)
  }

  console.log('\n[5] Taking a day back off is the same recompute the other way')
  {
    const before = await qtyByKey()
    const res = await removeGroceryDays({ ...base, today: days[4], dates: [days[5]] })
    await flushPending()
    const rows = await getAllItems(pid)
    check('the day leaves the list', !rows.some(r => r.meal_refs.some(ref => ref.date === days[5])) && JSON.stringify(res.covered) === JSON.stringify([days[4]]), res.covered)
    const soloId = crypto.randomUUID()
    await addGroceryDays({ ...base, profileId: soloId, today: days[4], dates: [days[4]] })
    await flushPending()
    const solo = Object.fromEntries((await getAllItems(soloId)).map(r => [r.canonical_key, r.quantity]))
    const chickenKey = Object.keys(before).find(k => k.includes('chicken'))!
    check('...and what the other day needs stays, at that day\'s amount',
      Math.abs(((await qtyByKey())[chickenKey] ?? 0) - solo[chickenKey]) <= 1, { now: (await qtyByKey())[chickenKey], alone: solo[chickenKey] })
    check('...the hand-added item still untouched', rows.some(r => r.source === 'manual'))
    const nothing = await removeGroceryDays({ ...base, today: days[4], dates: [days[6]] })
    check('taking off a day that is not on the list writes nothing', nothing.added === 0 && nothing.updated === 0 && nothing.removed === 0, nothing)
  }

  console.log('\n[6] The coach\'s swap can name an upcoming day — and only one')
  {
    const swapPid = crypto.randomUUID()
    for (const [slot, options] of Object.entries(pools)) {
      options.forEach((o, i) => db.meal_plan_slots.push({
        profile_id: swapPid, slot, pool_index: i, name: o.name, ingredients: o.ingredients,
        macros: { kcal: o.macros.calories, protein: o.macros.protein, carbs: o.macros.carbs, fat: o.macros.fat }, tags: [], prep: '',
      }))
    }
    const upcomingDays = days.slice(1).map(d => ({ date: d, dayName: new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' }) }))
    const monday = upcomingDays.find(d => d.dayName === 'Monday')!
    const onMonday = await buildMealSwapProposal({ rawArgs: { meal_slot: 'dinner', old_item: 'Tray bake', new_item: 'Rice pot', date: monday.date }, profileId: swapPid, today, upcomingDays })
    check('a swap for Monday carries Monday\'s date', onMonday.ok && onMonday.payload.date === monday.date, onMonday)
    check('...keyed apart from tonight\'s, so one never supersedes the other', onMonday.ok && onMonday.scopeKey.endsWith(`:dinner:${monday.date}`), onMonday.ok && onMonday.scopeKey)
    check('...and the card names the day in its own row', onMonday.ok && onMonday.diff.rows[0].field === "Monday's dinner", onMonday.ok && onMonday.diff.rows[0])
    const tonight = await buildMealSwapProposal({ rawArgs: { meal_slot: 'dinner', old_item: 'Tray bake', new_item: 'Rice pot', date: today }, profileId: swapPid, today, upcomingDays })
    check('today\'s own date is today\'s swap, exactly as before', tonight.ok && tonight.payload.date === undefined && tonight.scopeKey.endsWith(':dinner'), tonight)
    const far = await buildMealSwapProposal({ rawArgs: { meal_slot: 'dinner', old_item: 'Tray bake', new_item: 'Rice pot', date: addDays(today, 9) }, profileId: swapPid, today, upcomingDays })
    check('a date the strip does not show is a question, not a write somewhere nobody can see', !far.ok && /next six days/.test(far.reason), far)
  }

  console.log('\n[7] A meal pick that did not save says so')
  {
    setDevClockOverride('pick-profile', today)
    failingWrites.add('meal_plan_picks')
    let threw = false
    try { await setMealPick('pick-profile', days[2], 'dinner', 'Rice pot') } catch { threw = true }
    check('a failed write is thrown to the caller, whose catch refuses to show the swap', threw)
    failingWrites.delete('meal_plan_picks')
    let past = false
    try { await setMealPick('pick-profile', addDays(today, -1), 'dinner', 'Rice pot') } catch { past = true }
    check('...and so is a refused write onto a day that has passed', past)
    let ok = true
    try { await setMealPick('pick-profile', days[2], 'dinner', 'Rice pot') } catch { ok = false }
    check('...while a good write simply lands', ok && db.meal_plan_picks.some(p => p.date === days[2] && p.meal_name === 'Rice pot'))
  }

  console.log('\n[8] The wiring')
  {
    const app = read('src/App.tsx')
    const call = app.match(/useMealDays\(\{([\s\S]*?)\}\)/)?.[1] ?? ''
    const assembled = app.match(/assembleRotationDay\(mealRotation, mealRotationDate, ([^)]*)\)/)?.[1] ?? ''
    check('the sanity check on this check: App assembles today from mealPools, macros and the likes', /mealPools, macros, compiledSoftFoodPreferences/.test(assembled), assembled)
    check('App builds the strip from the SAME rotation, pools, targets, likes and shape as today',
      /rotation: mealRotation\b/.test(call) && /pools: mealPools\b/.test(call) && /targets: macros\b/.test(call)
      && /softLikedFoods: compiledSoftFoodPreferences\b/.test(call) && /\bmealShape\b/.test(call) && /today: mealRotationDate\b/.test(call), call)
    check('...hands the Nutrition tab the strip and the open day', /mealStrip=\{mealDays\.strip\}/.test(app) && /upcomingDay=\{mealDays\.openDay\}/.test(app))
    check('...hands the shopping list the upcoming days\' swaps', /pinsByDate=\{mealDays\.pinsByDate\}/.test(app))
    check('...and hands the coach the same days and the same writes',
      /upcomingMeals=\{mealDays\.upcoming\}/.test(app) && /onUpcomingMealPickApplied=\{mealDays\.applyPick\}/.test(app)
      && /onAddMealDayToGrocery=\{mealDays\.addToGrocery\}/.test(app) && /onRemoveMealDayFromGrocery=\{mealDays\.removeFromGrocery\}/.test(app))
    check('when the date moves on with the app open, the new today\'s picks come across',
      /setManualMealPicks\(mealDays\.futurePicks\[mealRotationDate\] \?\? \{\}\)/.test(app))

    const fn = read('supabase/functions/chat-gemini/index.ts')
    const dayTool = fn.slice(fn.indexOf('name: "add_day_to_grocery_list"'), fn.indexOf('name: "check_off_grocery_item"'))
    check('the coach has a tool to put a day on the list, which needs the day', dayTool.length > 0 && /required: \["origin_verbatim_quote", "date"\]/.test(dayTool))
    check('...gated like add_to_grocery_list: an instruction acts, a statement becomes an offer',
      /name === "add_to_grocery_list" \|\| name === "check_off_grocery_item" \|\| name === "add_day_to_grocery_list"\) \{[\s\S]{0,1200}?classifyImperative\([\s\S]{0,700}?groceryIntent/.test(fn))
    const swapTool = fn.slice(fn.indexOf('name: "propose_meal_swap"'), fn.indexOf('name: "propose_meal_addition"'))
    check('the coach\'s swap takes a date', /\bdate: \{/.test(swapTool))
    check('the coach is told the upcoming days, by the section the client fills', /UPCOMING MEALS/.test(fn) && /\$\{context\.upcoming_meal_summary\}/.test(fn))
    check('...and no longer says no screen shows another day', !/no screen shows another day/.test(fn))

    const chat = read('src/components/ChatAssistant.tsx')
    check('the coach\'s client sends those days', /upcoming_meal_summary: buildCoachUpcomingSummary\(upcomingMeals \?\? \[\]\)/.test(chat))
    const confirm = chat.slice(chat.indexOf("} else if (row.kind === 'propose_meal_swap') {"), chat.indexOf("title = ok ? RECEIPTS['propose_meal_swap'].done"))
    check('a confirmed swap with a date lands on that date, through the strip\'s own write',
      /payload\.date\s*\?\s*\(await onUpcomingMealPickApplied\?\.\(payload\.date, payload\.slot, result\.appliedName\)\)/.test(confirm), confirm.slice(0, 300))
    check('...and its undo goes back the same way', /onUpcomingMealPickApplied\?\.\(payload\.date, payload\.slot, payload\.currentName\)/.test(chat))
    check('adding a day by chat calls the strip\'s own function', /if \(intent\.tool === 'add_day_to_grocery_list'\) \{[\s\S]{0,700}?onAddMealDayToGrocery\(date\)/.test(chat))
    check('...and its undo takes the day back off the same way', /receipt\.kind === 'grocery_day_added'\) \{[\s\S]{0,400}?onRemoveMealDayFromGrocery\(receipt\.undoToken\)/.test(chat))
  }

  console.log(`\n${ran} checks ran`)
  if (failed > 0) { console.error(`${failed} check(s) failed`); process.exit(1) }
  console.log('meal days: all checks passed')
}

main().catch(err => { console.error(err); process.exit(1) })

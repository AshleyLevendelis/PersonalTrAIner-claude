/**
 * test:meal-rebalance — moving calories from one meal to another (20 Oct 2026).
 *
 * The live test of 19 Oct: "move some of lunch's calories to dinner", both meals named, was answered by the whole-day
 * resize's "nothing to resize — tell me which". Ashley's ruling, 20 Oct 2026: "Ask how much first", with buttons, then
 * both new sizes before Apply. docs/plans/moving-calories-between-meals.md.
 *
 * verify:meal-rebalance and verify:chat-rebalance drive the Move sheet and the coach. This holds what a screen cannot:
 *   1. the builder: the same two dishes, one smaller and one bigger, read off a trial that IS the week after the write;
 *   2. no amount: the app's question and the amounts, as the chat sends them;
 *   3. the bounds (keep half, at most double, the most that fits said);
 *   4. every refusal, in the phrasebook's words (a meal eaten stays as eaten);
 *   5. a copy is the same dish, so the leftovers chain does not move;
 *   6. the write and the Undo: both or neither, and back exactly;
 *   7. the confirm writes only the move the card described;
 *   8. her words, read by the app (the backstop for the 19 Oct defect);
 *   9. the wiring: hook, App, sheet, coach client, coach, parity list.
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

// --- Fake Supabase: just meal_plan_picks, with failures we can aim -------------
type Row = Record<string, unknown>
const db: Record<string, Row[]> = { meal_plan_picks: [], meal_plan_slots: [] }
/** Fail an upsert when this returns true for the row being written. */
let failUpsertWhen: ((row: Row) => boolean) | null = null
/** Fail an insert into the options when this returns true for the row being added. */
let failInsertWhen: ((row: Row) => boolean) | null = null
let failDeletes = false
const writes: string[] = []
function fakeFrom(table: string) {
  const filters: ((r: Row) => boolean)[] = []
  let op: 'select' | 'upsert' | 'delete' | 'insert' = 'select'
  let payload: Row[] = []
  let onConflict: string[] | null = null
  let orderBy: { col: string; asc: boolean } | null = null
  let limitN: number | null = null
  const exec = () => {
    db[table] ??= []
    if (op === 'insert') {
      if (failInsertWhen && payload.some(failInsertWhen)) return { data: null, error: { code: '08006', message: 'connection failure' } }
      for (const raw of payload) { writes.push(`insert ${table}/${raw.slot}/${raw.name}`); db[table].push({ ...raw }) }
      return { data: null, error: null }
    }
    if (op === 'upsert') {
      if (failUpsertWhen && payload.some(failUpsertWhen)) return { data: null, error: { code: '08006', message: 'connection failure' } }
      for (const raw of payload) {
        writes.push(`upsert ${raw.date}/${raw.slot}=${raw.meal_name}`)
        const existing = onConflict ? db[table].find(r => onConflict!.every(c => r[c] === raw[c])) : undefined
        if (existing) Object.assign(existing, raw)
        else db[table].push({ ...raw })
      }
      return { data: null, error: null }
    }
    if (op === 'delete') {
      if (failDeletes) return { data: null, error: { code: '08006', message: 'connection failure' } }
      db[table] = db[table].filter(r => !filters.every(f => f(r)))
      writes.push('delete')
      return { data: null, error: null }
    }
    let rows = db[table].filter(r => filters.every(f => f(r))).map(r => ({ ...r }))
    if (orderBy) rows = rows.sort((x, y) => ((x[orderBy!.col] as number) - (y[orderBy!.col] as number)) * (orderBy!.asc ? 1 : -1))
    if (limitN !== null) rows = rows.slice(0, limitN)
    return { data: rows, error: null }
  }
  const api: Record<string, unknown> = {
    select: () => api,
    upsert: (rows: Row | Row[], opts?: { onConflict?: string }) => {
      op = 'upsert'; payload = Array.isArray(rows) ? rows : [rows]
      onConflict = opts?.onConflict ? opts.onConflict.split(',') : null
      return api
    },
    delete: () => { op = 'delete'; return api },
    insert: (rows: Row | Row[]) => { op = 'insert'; payload = Array.isArray(rows) ? rows : [rows]; return api },
    order: (col: string, opts?: { ascending?: boolean }) => { orderBy = { col, asc: opts?.ascending !== false }; return api },
    limit: (n: number) => { limitN = n; return api },
    eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return api },
    in: (c: string, vs: unknown[]) => { filters.push(r => vs.includes(r[c])); return api },
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => Promise.resolve().then(() => resolve(exec()), reject),
  }
  return api
}

let ran = 0, failed = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failed++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 500)}` : ''}`) }
}

type Slot = 'breakfast' | 'lunch' | 'dinner' | 'snack'
type Opt = import('../src/lib/meal-generation').PoolOption

async function main() {
  const { setSupabaseClient } = await import('../src/lib/supabase')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSupabaseClient({ from: fakeFrom } as any)
  const { datesFrom, buildRotation, serveMealWeek, pinsFromPicks } = await import('../src/lib/meal-rotation')
  const { computeMealMacros } = await import('../src/lib/food-db')
  const {
    buildMealRebalanceProposal, sameMealRebalance, rebalanceRoom, rebalanceAmounts, rebalanceAskText, rebalanceSaid, mealsNamed,
    REBALANCE_MIN_KEEP, REBALANCE_MAX_GROW,
  } = await import('../src/lib/meal-rebalance')
  const { executeMealDayMove, undoMealDayMove } = await import('../src/lib/pending-action-executor')
  const { setDevClockOverride } = await import('../src/lib/dev-clock')
  const { REBALANCE } = await import('../src/lib/coach-voice')
  const { sameDish, resizedCopyBase } = await import('../src/lib/meal-dish-identity')
  const { USER_REQUESTED_TAG } = await import('../src/lib/meal-store')
  const { newFromDate } = await import('../src/lib/meal-new-from')

  console.log('meal rebalance — moving calories from one meal to another')

  const dish = (slot: string, name: string, chicken: number, rice: number, oil: number): Opt => {
    const ingredients = [
      { name: 'chicken breast', quantity: chicken, unit: 'g' },
      { name: 'white rice', quantity: rice, unit: 'g' },
      { name: 'olive oil', quantity: oil, unit: 'g' },
    ]
    const c = computeMealMacros(ingredients)
    return { slot, name, ingredients, tags: [], macros: { calories: Math.round(c.kcal), protein: Math.round(c.protein), carbs: Math.round(c.carbs), fat: Math.round(c.fat) } } as Opt
  }
  const sum = (a: { calories: number; protein: number; carbs: number; fat: number }[]) =>
    a.reduce((s, m) => ({ calories: s.calories + m.calories, protein: s.protein + m.protein, carbs: s.carbs + m.carbs, fat: s.fat + m.fat }), { calories: 0, protein: 0, carbs: 0, fat: 0 })

  const pools = {
    breakfast: [dish('breakfast', 'Oats bowl', 60, 150, 8), dish('breakfast', 'Rice porridge', 55, 160, 7), dish('breakfast', 'Egg rice', 65, 140, 9)],
    lunch: [dish('lunch', 'Chicken salad', 150, 200, 12), dish('lunch', 'Rice and greens', 140, 220, 11), dish('lunch', 'Grain bowl', 160, 190, 13)],
    dinner: [dish('dinner', 'Tray bake', 170, 220, 14), dish('dinner', 'Rice pot', 160, 240, 12), dish('dinner', 'Baked chicken', 180, 210, 15)],
  } as unknown as Record<'breakfast' | 'lunch' | 'dinner', Opt[]>
  const targets = sum([pools.breakfast[0].macros, pools.lunch[0].macros, pools.dinner[0].macros])
  const today = '2026-09-27'
  const dates = datesFrom(today, 7)
  const shapeOff = { mealsPerDay: 3, includeSnacks: false, batchCooking: false }
  const shapeOn = { mealsPerDay: 3, includeSnacks: false, batchCooking: true }
  const servingFor = (shape: typeof shapeOff, over: Record<string, unknown> = {}) => {
    const rotation = buildRotation(pools, targets, [], shape)
    return { today, dates, todaysPins: {}, pinsByDate: {}, pools, targets, softLikedFoods: [], shape, rotation, ...over } as Parameters<typeof serveMealWeek>[0]
  }
  type Built = ReturnType<typeof buildMealRebalanceProposal>
  const okOf = (r: Built) => (r.ok ? r : null)
  // A throw is a failed check, never a dead gate.
  const build = (serving: Parameters<typeof serveMealWeek>[0], args: Record<string, unknown>, extra: { logged?: Slot[] | null; list?: string[] | null } = {}): Built => {
    try {
      return buildMealRebalanceProposal({
        profileId: 'p1', rawArgs: args, serving,
        loggedTodaySlots: extra.logged === undefined ? [] : extra.logged,
        listDates: extra.list === undefined ? [] : extra.list,
      })
    } catch (err) {
      return { ok: false, reason: `THREW: ${String(err).slice(0, 160)}` }
    }
  }
  const near = (a: number | undefined, b: number, tol: number) => a !== undefined && Math.abs(a - b) <= tol
  const kcalIn = (text: string | undefined) => Number((/^([\d,]+) kcal/.exec(text ?? '')?.[1] ?? 'NaN').replace(/,/g, ''))
  const proteinIn = (text: string | undefined) => Number(/· ([\d,]+) g protein/.exec(text ?? '')?.[1] ?? 'NaN')
  const sig = (w: ReturnType<typeof serveMealWeek>) => w.map(d => `${d.date}:${(['breakfast', 'lunch', 'dinner'] as Slot[]).map(s => `${d.day.chosen[s]?.name}@${Math.round(d.day.chosen[s]?.macros.calories ?? 0)}`).join(',')}`)

  // ---------------------------------------------------------------------------
  console.log('\n[1] The same two dishes, one smaller and one bigger, read off a trial of the week the screen serves')
  const serving = servingFor(shapeOff)
  const before = serveMealWeek(serving)
  const lunch0 = before[0].day.chosen.lunch!
  const dinner0 = before[0].day.chosen.dinner!
  {
    check('the fixture is under pressure: today has a lunch and a dinner with room to move 200', !!lunch0 && !!dinner0 && rebalanceRoom(lunch0.macros.calories, dinner0.macros.calories) >= 200, [lunch0?.macros.calories, dinner0?.macros.calories])
    const r = build(serving, { from_slot: 'lunch', to_slot: 'dinner', kcal: 200 })
    const o = okOf(r)
    check('a calorie move is proposed', r.ok, r)
    check('the lunch becomes a smaller copy of the SAME dish, named so', o?.payload.legs[0].slot === 'lunch' && o.payload.legs[0].name === `${lunch0.name} (smaller)` && o.payload.legs[0].date === today, o?.payload.legs[0])
    check('...and the dinner a bigger copy of its own dish', o?.payload.legs[1].slot === 'dinner' && o.payload.legs[1].name === `${dinner0.name} (bigger)`, o?.payload.legs[1])
    const fromAfter = kcalIn(o?.diff.rows[0]?.after), toAfter = kcalIn(o?.diff.rows[1]?.after)
    check('the card says lunch BEFORE as served (kcal and protein)', o?.diff.rows[0]?.before === REBALANCE.size(Math.round(lunch0.macros.calories), Math.round(lunch0.macros.protein)), o?.diff.rows[0])
    check('...and lunch AFTER about 200 kcal lighter', near(fromAfter, lunch0.macros.calories - 200, 15), [fromAfter, lunch0.macros.calories])
    check('...dinner AFTER about 200 kcal heavier', near(toAfter, dinner0.macros.calories + 200, 15), [toAfter, dinner0.macros.calories])
    check('the card names the protein: lunch\'s goes down, dinner\'s goes up',
      proteinIn(o?.diff.rows[0]?.after) < lunch0.macros.protein && proteinIn(o?.diff.rows[1]?.after) > dinner0.macros.protein
      && !!o?.diff.implications?.some(i => /goes down about \d+ g of protein and dinner up about \d+ g/.test(i.text)), o?.diff)
    const dayBefore = Math.round(before[0].day.totals.calories)
    const dayAfter = Math.round(o?.after.find(d => d.date === today)?.day.totals.calories ?? NaN)
    check('THE DAY HOLDS: the total moves by no more than the rounding (20 kcal)', near(dayAfter, dayBefore, 20), [dayBefore, dayAfter])
    check('...and the card says so in its own words', !!o?.diff.implications?.some(i => i.text === REBALANCE.dayHeld(dayAfter)), o?.diff.implications)
    check('the card leads with a question in the coach\'s voice', o?.diff.lead === "Want me to move about 200 kcal from today's lunch to dinner?", o?.diff.lead)
    check('every OTHER day of the week is exactly as it was (names and sizes)', !!o && JSON.stringify(sig(o.after).slice(1)) === JSON.stringify(sig(before).slice(1)))
    check('...and today\'s breakfast too', !!o && o.after[0].day.chosen.breakfast?.name === before[0].day.chosen.breakfast?.name
      && Math.round(o.after[0].day.chosen.breakfast!.macros.calories) === Math.round(before[0].day.chosen.breakfast!.macros.calories))
    check('...so the card lists no other meal changing', !!o && !o.diff.implications?.some(i => /becomes|goes from/.test(i.text)), o?.diff.implications)
    // AS STORED: the copies as the executor writes them (tagged as her request) and the picks by name, served again.
    const storedPools = o ? { ...pools, lunch: [...pools.lunch, { ...o.payload.legs[0].option!, tags: [...(o.payload.legs[0].option!.tags ?? []), USER_REQUESTED_TAG] }], dinner: [...pools.dinner, { ...o.payload.legs[1].option!, tags: [...(o.payload.legs[1].option!.tags ?? []), USER_REQUESTED_TAG] }] } : pools
    const real = o ? serveMealWeek({ ...serving, pools: storedPools as never, rotation: null, todaysPins: pinsFromPicks({ lunch: o.payload.legs[0].name, dinner: o.payload.legs[1].name }, storedPools as never) }) : []
    check('the week AFTER the write is exactly the week the card was read off', !!o && JSON.stringify(sig(real)) === JSON.stringify(sig(o.after)), o ? [sig(real)[0], sig(o.after)[0]] : null)
    check('the copies are held until the strip ends, so no other day\'s search can serve them',
      !!o && o.payload.legs.every(l => newFromDate(l.option!) === '2026-10-04'), o?.payload.legs.map(l => l.option?.tags))
    check('...and carry no "her request" tag yet: the executor adds it, once', !!o && o.payload.legs.every(l => !(l.option!.tags ?? []).includes(USER_REQUESTED_TAG)))
    check('...nor the verifier\'s "own recipe": a copy is the plan\'s dish, not one she wrote', !!o && o.payload.legs.every(l => !(l.option!.tags ?? []).includes('own recipe')), o?.payload.legs.map(l => l.option?.tags))
    const flipped = okOf(build(serving, { from_slot: 'dinner', to_slot: 'lunch', kcal: 100 }))
    check('either direction about the same two meals shares one card', !!o && o.scopeKey === flipped?.scopeKey, [o?.scopeKey, flipped?.scopeKey])
    check('nothing has been written: planning is a pure read', writes.length === 0, writes)
    // AN UPCOMING DAY of the strip, by date and by weekday.
    const up = okOf(build(serving, { from_slot: 'dinner', to_slot: 'breakfast', kcal: 150, date: dates[2] }))
    check('an upcoming day works the same, on that date only', up?.payload.legs.every(l => l.date === dates[2]) === true
      && !!up && JSON.stringify(sig(up.after).filter((_, i) => i !== 2)) === JSON.stringify(sig(before).filter((_, i) => i !== 2)), up?.payload)
    const byName = okOf(build(serving, { from_slot: 'dinner', to_slot: 'breakfast', kcal: 150, date: 'Tuesday' }))
    check('...named by its weekday too', byName?.payload.date === dates[2], byName?.payload.date)
    check('a meal already picked for the day is remembered as what Undo puts back',
      okOf(build(servingFor(shapeOff, { todaysPins: { lunch: pools.lunch[2] } }), { from_slot: 'lunch', to_slot: 'dinner', kcal: 100 }))?.payload.legs[0].previous === pools.lunch[2].name)
  }

  // ---------------------------------------------------------------------------
  console.log('\n[2] No amount: the APP asks how much, with buttons that carry the amount')
  {
    const r = build(serving, { from_slot: 'lunch', to_slot: 'dinner' })
    check('no card without an amount', !r.ok)
    const a = r.ok ? null : r
    check('the question names both meals as served, then asks', a?.reason === REBALANCE.ask('today', 'lunch', Math.round(lunch0.macros.calories), 'dinner', Math.round(dinner0.macros.calories)), a?.reason)
    check('the amounts are her three steps when the meals can take them', JSON.stringify(a?.ask?.amounts) === '[100,200,300]', a?.ask)
    const text = a?.ask ? rebalanceAskText(a.reason, a.ask) : ''
    check('as the chat sends it: the question, then the amounts as buttons naming the meal', text.endsWith('[QUICK_REPLIES: "100 kcal to dinner" | "200 kcal to dinner" | "300 kcal to dinner"]') && text.startsWith(a?.reason ?? '#'), text)
    check('an amount of 0, or words, is no amount: asked again', !build(serving, { from_slot: 'lunch', to_slot: 'dinner', kcal: 0 }).ok && !!(build(serving, { from_slot: 'lunch', to_slot: 'dinner', kcal: 'some' }) as { ask?: unknown }).ask)
    check('a tapped amount ("200 kcal to dinner" read as 200) builds the card', okOf(build(serving, { from_slot: 'lunch', to_slot: 'dinner', kcal: '200' }))?.payload.kcal === 200)
    check('only amounts the meals can take are offered (room 250: 100 and 200)', JSON.stringify(rebalanceAmounts(250)) === '[100,200]')
    check('...under 100 of room, the most there is', JSON.stringify(rebalanceAmounts(60)) === '[60]')
    check('...under 30 of room, nothing', rebalanceAmounts(20).length === 0)
  }

  // ---------------------------------------------------------------------------
  console.log('\n[3] The bounds: the smaller meal keeps half, the bigger at most doubles')
  {
    check('the room is half of the meal that gives (400 kcal gives at most 200)', rebalanceRoom(400, 1000) === 200)
    check('...or what the meal that takes can double by (150 takes at most 150)', rebalanceRoom(1000, 150) === 150)
    check('the bounds are the recorded ones: keep half, grow to double', REBALANCE_MIN_KEEP === 0.5 && REBALANCE_MAX_GROW === 2)
    const room = rebalanceRoom(lunch0.macros.calories, dinner0.macros.calories)
    const r = okOf(build(serving, { from_slot: 'lunch', to_slot: 'dinner', kcal: 5000 }))
    check('asked for more than fits: the card offers the most it can move', r?.payload.kcal === room, [r?.payload.kcal, room])
    check('...and says so, as a warning', !!r?.diff.implications?.some(i => i.severity === 'warn' && i.text === REBALANCE.capped(5000, room, 'lunch', 'dinner')), r?.diff.implications)
    check('...with lunch left at no less than half of what it was', kcalIn(r?.diff.rows[0]?.after) >= lunch0.macros.calories * 0.5 - 15, r?.diff.rows[0])
    check('an amount the meals can take is moved as asked, with no warning', !okOf(build(serving, { from_slot: 'lunch', to_slot: 'dinner', kcal: 100 }))?.diff.implications?.some(i => i.severity === 'warn'))
    check('too small to notice: said', (build(serving, { from_slot: 'lunch', to_slot: 'dinner', kcal: 10 }) as { reason?: string }).reason === REBALANCE.refusals.tooSmall(10))
    const tiny = dish('lunch', 'Tiny lunch', 5, 5, 0)
    const noRoom = build(servingFor(shapeOff, { todaysPins: { lunch: tiny } }), { from_slot: 'lunch', to_slot: 'dinner' })
    check('a meal too small to give anything: no ask, a reason', !noRoom.ok && !noRoom.ask && noRoom.reason === REBALANCE.refusals.noRoom('lunch', 'dinner'), noRoom)
  }

  // ---------------------------------------------------------------------------
  console.log('\n[4] Every refusal, in the phrasebook\'s own words')
  {
    const why = (args: Record<string, unknown>, extra?: Parameters<typeof build>[2], s = serving) => { const r = build(s, args, extra); return r.ok ? null : r.reason }
    check('no targets: says so', why({ from_slot: 'lunch', to_slot: 'dinner', kcal: 100 }, undefined, { ...serving, targets: null }) === REBALANCE.refusals.noBody)
    check('no meals named: asks which two', why({ kcal: 100 }) === REBALANCE.refusals.whichSlots)
    check('a meal the app does not have (elevenses): asks which two', why({ from_slot: 'elevenses', to_slot: 'dinner' }) === REBALANCE.refusals.whichSlots)
    check('the same meal twice: nothing to move', why({ from_slot: 'dinner', to_slot: 'dinner', kcal: 100 }) === REBALANCE.refusals.sameSlot)
    check('a meal this plan does not have (no snacks): says so', why({ from_slot: 'lunch', to_slot: 'snack', kcal: 100 }) === REBALANCE.refusals.noSuchMeal('snack'))
    check('a day beyond the strip: refused, not written somewhere unseen', why({ from_slot: 'lunch', to_slot: 'dinner', kcal: 100, date: '2026-10-20' }) === REBALANCE.refusals.outOfRange)
    check('today\'s lunch logged as eaten: it stays as eaten', why({ from_slot: 'lunch', to_slot: 'dinner', kcal: 100 }, { logged: ['lunch'] }) === REBALANCE.refusals.eaten('lunch'))
    check('...and so does a dinner already eaten, at the other end', why({ from_slot: 'lunch', to_slot: 'dinner', kcal: 100 }, { logged: ['dinner'] }) === REBALANCE.refusals.eaten('dinner'))
    check('an unreadable ledger refuses today, never reads as "nothing eaten"', why({ from_slot: 'lunch', to_slot: 'dinner', kcal: 100 }, { logged: null }) === REBALANCE.refusals.ledgerUnreadable)
    check('...but does not stop an upcoming day', build(serving, { from_slot: 'lunch', to_slot: 'dinner', kcal: 100, date: dates[3] }, { logged: null }).ok)
    const stale = okOf(build(serving, { from_slot: 'lunch', to_slot: 'dinner', kcal: 100 }, { list: [today] }))
    check('a day on the shopping list: the card says to rebuild it', !!stale?.diff.implications?.some(i => /shopping list, so rebuild the list/.test(i.text)), stale?.diff.implications)
    const unknown = okOf(build(serving, { from_slot: 'lunch', to_slot: 'dinner', kcal: 100 }, { list: null }))
    check('...an unreadable list is said, never passed off as empty', !!unknown?.diff.implications?.some(i => /couldn't check your shopping list/.test(i.text)), unknown?.diff.implications)
  }

  // ---------------------------------------------------------------------------
  console.log('\n[5] A copy is the same dish: the leftovers chain does not move')
  {
    const on = servingFor(shapeOn)
    const weekOn = serveMealWeek(on)
    // A day whose lunch is last night's dinner AND whose dinner feeds tomorrow's lunch.
    const i = weekOn.findIndex((d, k) => k >= 1 && k + 1 < weekOn.length && d.day.chosen.lunch?.leftoverFrom === 'dinner' && weekOn[k + 1].day.chosen.lunch?.leftoverFrom === 'dinner' && weekOn[k + 1].day.chosen.lunch?.name === d.day.chosen.dinner?.name)
    check('the fixture is under pressure: a day whose lunch is leftovers and whose dinner feeds tomorrow', i >= 1, weekOn.map(d => `${d.day.chosen.lunch?.leftoverFrom ?? '-'}:${d.day.chosen.dinner?.reusedTomorrow ? 'R' : '-'}`))
    const D = dates[i] ?? dates[1]
    const r = okOf(build(on, { from_slot: 'lunch', to_slot: 'dinner', kcal: 150, date: D }))
    check('lunch (leftovers) to dinner is proposed', !!r, r)
    check('the card says the leftovers become a smaller portion', !!r?.diff.implications?.some(x => x.text === REBALANCE.leftover(new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(new Date(D + 'T00:00:00Z')), false)), r?.diff.implications)
    const afterD = r?.after.find(d => d.date === D)
    const next = r?.after.find(d => d.date === dates[i + 1])
    check('the bigger dinner still says to cook both portions: tomorrow\'s lunch is its leftovers', afterD?.day.chosen.dinner?.reusedTomorrow === true, afterD?.day.chosen.dinner)
    check('...and tomorrow\'s lunch is the same dish under its own name, not re-made as "(bigger)"', next?.day.chosen.lunch?.name === weekOn[i + 1]?.day.chosen.lunch?.name, [next?.day.chosen.lunch?.name, weekOn[i + 1]?.day.chosen.lunch?.name])
    const dName = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(new Date(D + 'T00:00:00Z'))
    const isRefitLine = (t: string) => /re-fitted around these two/.test(t)
    check('...so no meal on any OTHER day changes', !!r && !r.diff.implications?.some(x => !isRefitLine(x.text) && /becomes|goes from/.test(x.text) && !x.text.startsWith(`${dName}'s`)), r?.diff.implications)
    // MEASURED ON THIS GATE'S FIRST RUN: moving 150 kcal between two different dishes moves the day's carbs and fat
    // with it, the tight bands (18 Oct) put the day just outside, and her 10 Oct hold rule ("Resize, else leave")
    // re-fits the day's other meal around the two pins. That is the app's rule for any pin, so it is said on the card
    // before the tap, and the day's line says why the total moved instead of blaming the rounding (it first did).
    const refitLine = r?.diff.implications?.find(x => isRefitLine(x.text))
    const sameDayResize = r?.diff.implications?.some(x => x.text.startsWith(`${dName}'s breakfast goes from`))
    check('the fixture is under pressure: this move pushes the day out of band, so the hold re-fits breakfast', !!sameDayResize, r?.diff.implications)
    check('...said on the card, and the total said as a re-fit around the two, never as rounding',
      !!refitLine && !r?.diff.implications?.some(x => /Rounding/.test(x.text)), r?.diff.implications)
    // THE LAST DAY OF THE STRIP has no next day served after it, so the rotation's own "cook both portions" answer is
    // the only one there is (serveDates' second pass cannot reach it). Found by a MISSED mutation of that line.
    const last = dates[6]
    const lastBefore = weekOn[6]?.day.chosen.dinner
    const lastMove = okOf(build(on, { from_slot: 'lunch', to_slot: 'dinner', kcal: 100, date: last }))
    check('the fixture is under pressure: the strip\'s last dinner says to cook both portions', lastBefore?.reusedTomorrow === true, lastBefore)
    check('...and still does once it is the bigger copy', lastMove?.after[6]?.day.chosen.dinner?.reusedTomorrow === true && lastMove?.after[6]?.day.chosen.dinner?.name === `${lastBefore?.name} (bigger)`, lastMove?.after[6]?.day.chosen.dinner)
    // A COPY IS THE PLAN'S OWN DISH, so the day holds its other dishes around it (her 10 Oct "Resize, else leave"),
    // never re-plans them as it would around a dish she asked for. Measured: reading a "(bigger)" copy as her own
    // changed another dish in 58 of 252 moves across this fixture; this is one of them.
    const held = okOf(build(serving, { from_slot: 'dinner', to_slot: 'breakfast', kcal: 300 }))
    check('moving 300 from today\'s dinner to breakfast leaves lunch the same dish', held?.after[0]?.day.chosen.lunch?.name === before[0].day.chosen.lunch?.name, [held?.after[0]?.day.chosen.lunch?.name, before[0].day.chosen.lunch?.name])
    // Dish identity, both halves.
    const base = pools.dinner[0]
    const copy = { ...base, name: `${base.name} (bigger)`, tags: [USER_REQUESTED_TAG] }
    const generated = { ...base, name: `${base.name} (bigger)`, tags: [] as string[] }
    check('a stored copy is the same dish as the one it was made from', sameDish([base, copy] as Opt[], base.name, copy.name) && resizedCopyBase(copy) === base.name)
    check('...a numbered copy too', resizedCopyBase({ name: `${base.name} (smaller 2)`, tags: [USER_REQUESTED_TAG] }) === base.name)
    check('...but a GENERATED dish that happens to end "(bigger)" stays itself', !sameDish([base, generated] as Opt[], base.name, generated.name) && resizedCopyBase(generated) === generated.name)
    // A second move on the same day names a fresh copy rather than reusing a name with another size.
    const taken = servingFor(shapeOff, { pools: { ...pools, lunch: [...pools.lunch, { ...lunch0, name: `${lunch0.name} (smaller)`, tags: [USER_REQUESTED_TAG] }] } })
    check('a name already in the meal\'s options is numbered, never reused for a different size', okOf(build(taken, { from_slot: 'lunch', to_slot: 'dinner', kcal: 100 }))?.payload.legs[0].name === `${lunch0.name} (smaller 2)`)
  }

  // ---------------------------------------------------------------------------
  console.log('\n[6] The write and the Undo: both meals or neither, and back exactly')
  {
    setDevClockOverride('p1', today)
    const shown: { date: string; slot: string; name: string | null }[][] = []
    const show = (u: { date: string; slot: string; name: string | null }[]) => { shown.push(u) }
    const words = { op: 'propose_meal_rebalance', saveFailed: REBALANCE.why.saveFailed, halfSaved: REBALANCE.why.halfSaved }
    const reset = () => { db.meal_plan_picks = []; db.meal_plan_slots = []; writes.length = 0; shown.length = 0; failUpsertWhen = null; failInsertWhen = null; failDeletes = false }
    const plan = okOf(build(serving, { from_slot: 'lunch', to_slot: 'dinner', kcal: 200, date: dates[2] }))!
    reset()
    const ok = await executeMealDayMove('p1', plan.payload, { show: show as never, words })
    const pick = (slot: Slot) => db.meal_plan_picks.find(r => r.date === dates[2] && r.slot === slot)?.meal_name
    check('both picks are saved for that date', pick('lunch') === plan.payload.legs[0].name && pick('dinner') === plan.payload.legs[1].name, db.meal_plan_picks)
    check('...both copies are added to the meal\'s options, tagged as hers and held', db.meal_plan_slots.length === 2
      && db.meal_plan_slots.every(r => (r.tags as string[]).includes(USER_REQUESTED_TAG) && (r.tags as string[]).some(t => t.startsWith('new-from:'))), db.meal_plan_slots)
    check('...and the copies hold the sizes the card showed', Math.round((db.meal_plan_slots.find(r => r.slot === 'dinner')?.macros as { kcal: number })?.kcal) === kcalIn(plan.diff.rows[1].after), db.meal_plan_slots.map(r => r.macros))
    check('...the receipt lands both, and the screen is told once', ok.failed.length === 0 && ok.landed.length === 2 && shown.length === 1 && shown[0].length === 2, { ok, shown })
    const back = await undoMealDayMove('p1', plan.payload, { show: show as never, today, loggedTodaySlots: [] })
    check('UNDO puts both meals back exactly: no picks, no copies', back.failed.length === 0 && db.meal_plan_picks.length === 0 && db.meal_plan_slots.length === 0, { back, picks: db.meal_plan_picks, slots: db.meal_plan_slots })
    // A meal changed since: the undo leaves both alone.
    reset()
    await executeMealDayMove('p1', plan.payload, { show: show as never, words })
    db.meal_plan_picks.find(r => r.slot === 'dinner')!.meal_name = 'Rice pot'
    const refused = await undoMealDayMove('p1', plan.payload, { show: show as never, today, loggedTodaySlots: [] })
    check('a meal changed since the move: Undo says so and touches nothing', refused.failed.length === 1 && pick('lunch') === plan.payload.legs[0].name && pick('dinner') === 'Rice pot', { refused, picks: db.meal_plan_picks })
    // The second copy will not save: nothing is left behind, and the words are the calorie move's.
    reset()
    failInsertWhen = row => row.slot === 'dinner'
    const half = await executeMealDayMove('p1', plan.payload, { show: show as never, words })
    check('when the second meal will not save, the first is taken back off: no picks, no copies', db.meal_plan_picks.length === 0 && db.meal_plan_slots.length === 0, { picks: db.meal_plan_picks, slots: db.meal_plan_slots })
    check('...the receipt says why in the calorie move\'s words, never "the swap"', half.failed[0]?.error === REBALANCE.why.saveFailed && half.failed[0]?.op === 'propose_meal_rebalance' && shown.length === 0, half)
    setDevClockOverride('p1', null)
  }

  // ---------------------------------------------------------------------------
  console.log('\n[7] The confirm writes only the move the card described')
  {
    const a = okOf(build(serving, { from_slot: 'lunch', to_slot: 'dinner', kcal: 200 }))!
    const again = okOf(build(serving, { from_slot: 'lunch', to_slot: 'dinner', kcal: 200 }))!
    check('the same move planned twice is the same move', sameMealRebalance(a.payload, again.payload))
    const other = okOf(build(serving, { from_slot: 'lunch', to_slot: 'dinner', kcal: 100 }))!
    check('a different amount is a different move', !sameMealRebalance(a.payload, other.payload))
    const resized = { ...a.payload, legs: [{ ...a.payload.legs[0], option: { ...a.payload.legs[0].option!, macros: { ...a.payload.legs[0].option!.macros, calories: a.payload.legs[0].option!.macros.calories + 40 } } }, a.payload.legs[1]] as typeof a.payload.legs }
    check('...and the same names at a different size are a different move', !sameMealRebalance(a.payload, resized))
    const moved = okOf(build(servingFor(shapeOff, { todaysPins: { lunch: pools.lunch[2] } }), { from_slot: 'lunch', to_slot: 'dinner', kcal: 200 }))!
    check('a lunch swapped since the card: not the move the card described', !sameMealRebalance(a.payload, moved.payload))
  }

  // ---------------------------------------------------------------------------
  console.log('\n[8] Her words, read by the app: two meals and a direction')
  {
    const said = (t: string) => JSON.stringify(rebalanceSaid(t))
    check('"move some of lunch\'s calories to dinner" (her words, 19 Oct): lunch to dinner', said("move some of lunch's calories to dinner") === JSON.stringify({ kind: 'ordered', from: 'lunch', to: 'dinner', kcal: null }))
    check('"make lunch smaller and dinner bigger": lunch to dinner', said('make lunch smaller and dinner bigger') === JSON.stringify({ kind: 'ordered', from: 'lunch', to: 'dinner', kcal: null }))
    check('"a bigger dinner and a smaller lunch": the same, the other way round in words', said('I want a bigger dinner and a smaller lunch') === JSON.stringify({ kind: 'ordered', from: 'lunch', to: 'dinner', kcal: null }))
    check('"put 200 calories from dinner into lunch": dinner to lunch, with the amount', said('put 200 calories from dinner into lunch') === JSON.stringify({ kind: 'ordered', from: 'dinner', to: 'lunch', kcal: 200 }))
    check('"move calories between lunch and dinner": two meals, no direction', said('move calories between lunch and dinner') === JSON.stringify({ kind: 'unordered', slots: ['lunch', 'dinner'] }))
    check('"my lunch and dinner are 300 over": not a move at all', rebalanceSaid('my lunch and dinner are 300 over').kind === 'none')
    check('one meal named: not a move between two', rebalanceSaid('make my lunch smaller').kind === 'none')
    check('the meals she named, once each, in order', JSON.stringify(mealsNamed('Lunch and dinner, and lunch again')) === '["lunch","dinner"]')
    check('the whole-day resize never says "tell me which" to someone who named two', !/tell me which(?! way)/.test(REBALANCE.refitFits(true)) && /moved to the other/.test(REBALANCE.refitFits(true)))
  }

  // ---------------------------------------------------------------------------
  console.log('\n[9] The wiring: one controller from the hook to the sheet and to the coach')
  {
    const hook = read('src/hooks/useMealDays.ts')
    const app = read('src/App.tsx')
    const sheet = read('src/components/nutrition/MealMoveSheet.tsx')
    const chat = read('src/components/ChatAssistant.tsx')
    const edge = read('supabase/functions/chat-gemini/index.ts')
    const parity = readFileSync(join(ROOT, 'docs/coach-screen-parity.md'), 'utf8')
    check('the hook plans over THE week object the strip is served from', /buildMealRebalanceProposal\(\{[^}]*?\n\s+serving,\n/.test(hook) && /serveMealWeek\(serving\)/.test(hook))
    check('...reads the ledger and the list before it plans', /const planRebalance = async[\s\S]*?const loggedTodaySlots = await readLoggedToday\(\)[\s\S]*?readGroceryCoverage\([\s\S]*?\{ strict: true \}\)[\s\S]*?buildMealRebalanceProposal/.test(hook))
    check('...confirms by planning again and writing only the same move, in its own words',
      /const live = await planRebalance\(/.test(hook) && /!sameMealRebalance\(live\.payload, payload\)/.test(hook) && /executeMealDayMove\(profileId, live\.payload, \{[\s\S]*?op: 'propose_meal_rebalance'/.test(hook))
    check('...and hands out plan, confirm and undo on the controller both surfaces get', /rebalance: \{ plan: planRebalance, confirm: confirmRebalance, undo: undoRebalance \}/.test(hook))
    check('App hands the coach that controller', /onMealRebalance=\{mealDays\.dayMove\.rebalance\}/.test(app) && /dayMove=\{mealDays\.dayMove\}/.test(app))
    check('the Move sheet asks with no amount, then plans with the tapped one, confirms and undoes through it',
      /rebalance\.plan\(\{ from_slot: dayMove\.slot, to_slot: rbTo, date: dayMove\.date \}\)/.test(sheet) && /rebalance\.plan\(\{ from_slot: dayMove\.slot, to_slot: rbTo, kcal: rbKcal, date: dayMove\.date \}\)/.test(sheet)
      && /rebalance\.confirm\(plan\.payload\)/.test(sheet) && /rebalance\.undo\(plan\.payload\)/.test(sheet))
    check('...and its amount buttons are the builder\'s amounts in the coach\'s words', /rbAsk\.ask\.amounts\.map\(/.test(sheet) && /REBALANCE\.chip\(k, rbTo\)/.test(sheet))
    check('the coach client plans through the controller and sends the ask with its buttons',
      /result\.proposal\.kind === 'propose_meal_rebalance'/.test(chat) && /await onMealRebalance\.plan\(/.test(chat) && /rebalanceAskText\(moved\.reason, moved\.ask\)/.test(chat))
    check('...the backstop: the whole-day resize with two meals and a move in her words becomes the calorie move', /result\.proposal\.kind === 'propose_meal_refit' && rebalanceSaid\(userSaid\)\.kind !== 'none'/.test(chat))
    const refitIdx = chat.indexOf("result.proposal.kind === 'propose_meal_refit' && rebalanceSaid")
    const refitOwn = chat.indexOf("} else if (result.proposal.kind === 'propose_meal_refit') {")
    check('...tested BEFORE the refit\'s own branch, or it could never run', refitIdx !== -1 && refitOwn !== -1 && refitIdx < refitOwn, [refitIdx, refitOwn])
    check('...and the refit\'s "nothing to resize" never asks "which" of someone who named two', /REBALANCE\.refitFits\(mealsNamed\(userSaid\)\.length >= 2\)/.test(chat))
    check('the confirm and the Undo go through the same controller', /row\.kind === 'propose_meal_rebalance'[\s\S]{0,400}onMealRebalance\.confirm\(payload\)/.test(chat) && /row\.kind === 'propose_meal_rebalance'[\s\S]{0,600}onMealRebalance\.undo\(payload\)/.test(chat))
    check('the coach declares the tool, and its courier forwards the amount and decides nothing',
      /name: "propose_meal_rebalance"/.test(edge) && /if \(name === "propose_meal_rebalance"\)[\s\S]{0,900}kind: "propose_meal_rebalance"[\s\S]{0,200}kcal: args\.kcal/.test(edge))
    check('the prompt routes "move calories from A to B" here and away from the whole-day resize',
      /MOVING SOME CALORIES FROM ONE MEAL TO ANOTHER IS A NINTH THING[^\n]*propose_meal_rebalance[^\n]*NOT propose_meal_refit/.test(edge)
      && /NOT for moving calories from one NAMED meal to another[^"]*propose_meal_rebalance/.test(edge))
    check('...and the app, not the coach, asks how much', /the APP asks it — call the tool at once without kcal/.test(edge))
    check('the parity list records it as on both surfaces', /\| `propose_meal_rebalance` \| SCREEN \|/.test(parity))
  }

  console.log(`\n${ran} checks ran, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch(err => { console.error(err); process.exit(1) })

/**
 * test:meal-day-move — swapping a meal with another day's (29 Sep 2026).
 *
 * Ashley: "Moving a meal to another day. Neither the screen nor the coach can
 * do this yet." Her ruling on what happens to the day the meal leaves, from
 * three options: THEY SWAP PLACES (over a fresh dinner for the emptied day and
 * over eating the same dish on both).
 *
 * verify:meal-day-move and verify:chat-day-move drive the screen and the
 * coach. This holds what a screen cannot show:
 *   1. the builder: two dishes trade places, and the card is read off a trial
 *      that IS the week the screen will serve;
 *   2. every refusal, in the phrasebook's own words;
 *   3. THE CARD TELLS THE TRUTH ABOUT THE REST OF THE WEEK: every other meal
 *      that changes, with the reason, against an independent diff;
 *   4. a day is warned about only when the move took it off target;
 *   5. the shopping list: said when stale, said when unreadable;
 *   6. a meal already eaten cannot move, and an unreadable ledger refuses;
 *   7. the days as they are named (today, tomorrow, a weekday, a date);
 *   8. the write: both picks or neither, put back when the second fails;
 *   9. the confirm only writes the swap the card described;
 *  10. the wiring: hook, App, sheet, coach client, coach, parity list.
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
const db: Record<string, Row[]> = { meal_plan_picks: [] }
/** Fail an upsert when this returns true for the row being written. */
let failUpsertWhen: ((row: Row) => boolean) | null = null
let failDeletes = false
const writes: string[] = []
function fakeFrom(table: string) {
  const filters: ((r: Row) => boolean)[] = []
  let op: 'select' | 'upsert' | 'delete' = 'select'
  let payload: Row[] = []
  let onConflict: string[] | null = null
  const exec = () => {
    db[table] ??= []
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
    return { data: db[table].filter(r => filters.every(f => f(r))).map(r => ({ ...r })), error: null }
  }
  const api: Record<string, unknown> = {
    select: () => api,
    upsert: (rows: Row | Row[], opts?: { onConflict?: string }) => {
      op = 'upsert'; payload = Array.isArray(rows) ? rows : [rows]
      onConflict = opts?.onConflict ? opts.onConflict.split(',') : null
      return api
    },
    delete: () => { op = 'delete'; return api },
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
  const { buildMealDayMoveProposal, sameMealDayMove, isNoticeableResize } = await import('../src/lib/meal-day-move')
  const { executeMealDayMove } = await import('../src/lib/pending-action-executor')
  const { setDevClockOverride } = await import('../src/lib/dev-clock')
  const { DAY_MOVE } = await import('../src/lib/coach-voice')

  console.log('meal day move — swapping a meal with another day\'s')

  // Dishes whose stored macros ARE their ingredients', as every real option is.
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
  const nameOf = (week: ReturnType<typeof serveMealWeek>, i: number, slot: Slot) => week[i].day.chosen[slot]?.name
  type Proposed = ReturnType<typeof buildMealDayMoveProposal>
  /** The proposal when there is one, else null: every check below reads through this, so a refusal FAILS checks instead of skipping them. */
  const okOf = (r: Proposed) => (r.ok ? r : null)
  // A THROW IS A FAILED CHECK, NOT A DEAD GATE: a builder that throws on some
  // input would otherwise end the run early and read as a crash.
  const build = (serving: Parameters<typeof serveMealWeek>[0], args: Record<string, unknown>, extra: { logged?: Slot[] | null; list?: string[] | null } = {}): Proposed => {
    try {
      return buildMealDayMoveProposal({
        profileId: 'p1', rawArgs: args as never, serving,
        loggedTodaySlots: extra.logged === undefined ? [] : extra.logged,
        listDates: extra.list === undefined ? [] : extra.list,
      })
    } catch (err) {
      return { ok: false, reason: `THREW: ${String(err).slice(0, 120)}` }
    }
  }

  // ---------------------------------------------------------------------------
  console.log('\n[1] Two dishes trade places, and the card is the week the screen serves')
  const serving = servingFor(shapeOff)
  const before = serveMealWeek(serving)
  const dinnerA = nameOf(before, 1, 'dinner')!
  const dinnerB = nameOf(before, 2, 'dinner')!
  {
    check('the fixture is under pressure: the two days serve different dinners', dinnerA !== dinnerB, [dinnerA, dinnerB])
    const r = build(serving, { meal_slot: 'dinner', from_date: dates[1], to_date: dates[2] })
    const o = okOf(r)
    check('a swap between two days is proposed', r.ok, r)
    check('the first day is given the second day\'s dinner', o?.payload.legs[0].date === dates[1] && o?.payload.legs[0].name === dinnerB, o?.payload.legs)
    check('...and the second day the first\'s: they swap places, nothing disappears', o?.payload.legs[1].date === dates[2] && o?.payload.legs[1].name === dinnerA, o?.payload.legs)
    check('the two rows name each day\'s meal, before and after',
      o?.diff.rows.length === 2 && o.diff.rows[0].before === dinnerA && o.diff.rows[0].after === dinnerB
      && o.diff.rows[1].before === dinnerB && o.diff.rows[1].after === dinnerA, o?.diff.rows)
    check('the card names the day in each row', /Monday's dinner/.test(o?.diff.rows[0].field ?? '') && /Tuesday's dinner/.test(o?.diff.rows[1].field ?? ''), o?.diff.rows.map(x => x.field))
    // THE TRIAL IS THE REAL THING: pins built the way the app builds them
    // from stored picks, over the same inputs, serve exactly `after`.
    const names = (w: ReturnType<typeof serveMealWeek>) => JSON.stringify(w.map(d => Object.values(d.day.chosen).map(x => x!.name)))
    const real = o ? serveMealWeek({
      ...serving,
      pinsByDate: {
        ...serving.pinsByDate,
        [o.payload.legs[0].date]: pinsFromPicks({ dinner: o.payload.legs[0].name }, pools),
        [o.payload.legs[1].date]: pinsFromPicks({ dinner: o.payload.legs[1].name }, pools),
      },
    }) : []
    check('the week after the swap is exactly the week the card was read off', !!o && names(real) === names(o.after))
    check('...and the two days now serve each other\'s dinner', !!o && nameOf(o.after, 1, 'dinner') === dinnerB && nameOf(o.after, 2, 'dinner') === dinnerA)
    check('the card leads with a question in the coach\'s voice', o?.diff.lead === `Want me to swap Monday's dinner with Tuesday's?`, o?.diff.lead)
    check('the swap is stated in the card\'s own words', o?.diff.implications?.[0]?.text === DAY_MOVE.swapped('dinner', 'Monday', 'Tuesday'), o?.diff.implications?.[0])
    const flipped = okOf(build(serving, { meal_slot: 'dinner', from_date: dates[2], to_date: dates[1] }))
    check('two asks about the same pair share one card, in either order', !!o && o.scopeKey === flipped?.scopeKey, [o?.scopeKey, flipped?.scopeKey])
    check('nothing has been written: planning is a pure read', writes.length === 0, writes)
    // A pick already made for a day is remembered so a failed write can put it back.
    const picked = servingFor(shapeOff, { pinsByDate: { [dates[1]]: { dinner: pools.dinner[2] } }, todaysPins: { lunch: pools.lunch[1] } })
    const rp = build(picked, { meal_slot: 'dinner', from_date: dates[1], to_date: dates[3] })
    check('a day that already had a pick records it as what to put back',
      okOf(rp)?.payload.legs[0].previous === pools.dinner[2].name && okOf(rp)?.payload.legs[1].previous === null, okOf(rp)?.payload.legs ?? rp)
    const rt = build(picked, { meal_slot: 'lunch', from_date: 'today', to_date: dates[1] })
    check('...and so does today\'s own pick, which lives in a different place from the other days\'',
      okOf(rt)?.payload.legs[0].date === today && okOf(rt)?.payload.legs[0].previous === pools.lunch[1].name, okOf(rt)?.payload.legs ?? rt)
  }

  // ---------------------------------------------------------------------------
  console.log('\n[2] Every refusal, in the phrasebook\'s own words')
  {
    const refused = (args: Record<string, unknown>, extra?: Parameters<typeof build>[2], s = serving) => {
      const r = build(s, args, extra)
      return r.ok ? null : r.reason
    }
    check('no body details, no targets: says so', refused({ meal_slot: 'dinner', from_date: dates[1], to_date: dates[2] }, undefined, { ...serving, targets: null }) === DAY_MOVE.refusals.noBody)
    check('no meal named: asks which', refused({ from_date: dates[1], to_date: dates[2] }) === DAY_MOVE.refusals.whichSlot)
    check('a meal the app does not have (elevenses): asks which', refused({ meal_slot: 'elevenses', from_date: dates[1], to_date: dates[2] }) === DAY_MOVE.refusals.whichSlot)
    check('a day missing: asks which two', refused({ meal_slot: 'dinner', from_date: dates[1] }) === DAY_MOVE.refusals.whichDays)
    check('a day nobody can name: asks which two', refused({ meal_slot: 'dinner', from_date: 'someday', to_date: dates[2] }) === DAY_MOVE.refusals.whichDays)
    check('a day beyond the strip is refused, not written somewhere unseen',
      refused({ meal_slot: 'dinner', from_date: dates[1], to_date: '2026-10-20' }) === DAY_MOVE.refusals.outOfRange)
    check('yesterday is beyond the strip too', refused({ meal_slot: 'dinner', from_date: dates[1], to_date: '2026-09-26' }) === DAY_MOVE.refusals.outOfRange)
    check('the same day twice: nothing to swap', refused({ meal_slot: 'dinner', from_date: dates[1], to_date: dates[1] }) === DAY_MOVE.refusals.sameDay)
    check('a meal the days do not have (no snacks on this plan): says which day', refused({ meal_slot: 'snack', from_date: dates[1], to_date: dates[2] }) === DAY_MOVE.refusals.nothingThere('snack', 'Monday'))

    const same = servingFor(shapeOff, { pinsByDate: { [dates[1]]: { dinner: pools.dinner[0] }, [dates[2]]: { dinner: pools.dinner[0] } } })
    check('the same dish on both days: nothing to swap', refused({ meal_slot: 'dinner', from_date: dates[1], to_date: dates[2] }, undefined, same) === DAY_MOVE.refusals.sameDish('dinner', 'Monday', 'Tuesday'))

    // A LEFTOVER LUNCH: with batch cooking on, a lunch that is last night's dinner.
    const on = servingFor(shapeOn)
    const weekOn = serveMealWeek(on)
    const leftoverDay = weekOn.findIndex((d, i) => i >= 1 && d.day.chosen.lunch?.leftoverFrom === 'dinner')
    const freshDay = weekOn.findIndex((d, i) => i >= 1 && i !== leftoverDay && d.day.chosen.lunch && d.day.chosen.lunch.leftoverFrom !== 'dinner')
    check('the fixture is under pressure: one day\'s lunch is leftovers and another is cooked fresh', leftoverDay >= 1 && freshDay >= 1, weekOn.map(d => d.day.chosen.lunch?.leftoverFrom ?? '-'))
    check('a leftover lunch cannot move on its own (as the source)',
      refused({ meal_slot: 'lunch', from_date: dates[leftoverDay], to_date: dates[freshDay] }, undefined, on) === DAY_MOVE.refusals.leftover(new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(new Date(dates[leftoverDay] + 'T00:00:00Z'))))
    check('...nor as the destination',
      refused({ meal_slot: 'lunch', from_date: dates[freshDay], to_date: dates[leftoverDay] }, undefined, on)?.includes('leftovers of the dinner the night before') === true)
    check('...but a dinner moves freely, leftovers or no', build(on, { meal_slot: 'dinner', from_date: dates[leftoverDay], to_date: dates[freshDay] }).ok)

    // A pinned meal the day assembler sets aside (it breaks a restriction) must
    // not read as a swap that happened. Two pool entries share a name, the way
    // a pool stored before names were de-duplicated can; the first is marked.
    const marked = { ...pools.dinner[1], breaksRestriction: true as const }
    const dup = { ...servingFor(shapeOff), pools: { ...pools, dinner: [marked, ...pools.dinner] } } as Parameters<typeof serveMealWeek>[0]
    const wk = serveMealWeek(dup)
    const dupDay = wk.findIndex((d, i) => i >= 1 && d.day.chosen.dinner?.name === pools.dinner[1].name && d.day.chosen.dinner?.breaksRestriction !== true)
    const otherDay = wk.findIndex((d, i) => i >= 1 && i !== dupDay && d.day.chosen.dinner && d.day.chosen.dinner.name !== pools.dinner[1].name)
    if (dupDay >= 1 && otherDay >= 1) {
      check('a dish the assembler would set aside is refused rather than shown as swapped',
        refused({ meal_slot: 'dinner', from_date: dates[otherDay], to_date: dates[dupDay] }, undefined, dup) === DAY_MOVE.refusals.wouldNotHold)
    } else {
      check('the duplicate-name fixture found two days to swap', false, wk.map(d => d.day.chosen.dinner?.name))
    }
  }

  // ---------------------------------------------------------------------------
  console.log('\n[3] The card tells the truth about the rest of the week')
  {
    const on = servingFor(shapeOn)
    const weekOn = serveMealWeek(on)
    /** Every OTHER meal that changed, read straight off the two weeks. */
    const diffOf = (after: ReturnType<typeof serveMealWeek> | undefined, moved: [string, string], slot: Slot) => {
      const out: { date: string; slot: Slot; name: string; resized: boolean; wasLeftover: boolean; nowLeftover: boolean }[] = []
      for (const d of after ?? []) {
        const was = weekOn.find(b => b.date === d.date)!
        for (const sl of ['breakfast', 'lunch', 'dinner', 'snack'] as Slot[]) {
          if ((d.date === moved[0] || d.date === moved[1]) && sl === slot) continue
          const n = d.day.chosen[sl]
          const w = was.day.chosen[sl]
          if (!n) continue
          const dk = w ? Math.abs(n.macros.calories - w.macros.calories) : 0
          if (w?.name !== n.name) out.push({ date: d.date, slot: sl, name: n.name, resized: false, wasLeftover: w?.leftoverFrom === 'dinner', nowLeftover: n.leftoverFrom === 'dinner' })
          else if (w && dk >= 50 && dk >= w.macros.calories * 0.1) out.push({ date: d.date, slot: sl, name: n.name, resized: true, wasLeftover: false, nowLeftover: false })
        }
      }
      return out
    }
    const r = build(on, { meal_slot: 'dinner', from_date: dates[1], to_date: dates[3] })
    const o = okOf(r)
    check('the swap is proposed with batch cooking on', r.ok, r)
    const truth = diffOf(o?.after, [dates[1], dates[3]], 'dinner')
    const said = (o?.diff.implications ?? []).map(i => i.text).filter(t => /becomes|goes from/.test(t))
    check('the fixture is under pressure: the swap changes meals on other days', truth.length >= 1 && truth.length <= 4, truth)
    check('every meal that changes is on the card, once: a new dish by name, a resized one by its two sizes',
      said.length === truth.length
      && truth.filter(t => !t.resized).every(t => said.some(x => x.includes(t.name)))
      && said.filter(x => /goes from/.test(x)).length === truth.filter(t => t.resized).length, { truth, said })
    check('a lunch that is now the leftovers of the moved dinner says so',
      truth.some(t => t.nowLeftover) && said.some(x => x.includes('the leftovers of the dinner the night before')), said)
    check('a lunch that stopped being leftovers says it is cooked fresh',
      truth.some(t => t.wasLeftover && !t.nowLeftover) && said.some(x => /cooked fresh instead of leftovers/.test(x)), said)
    // ...and a different dish chosen only to re-fit the day says that.
    const refit = okOf(build(on, { meal_slot: 'breakfast', from_date: dates[4], to_date: dates[6] }))
    const refitTruth = diffOf(refit?.after, [dates[4], dates[6]], 'breakfast')
    const refitSaid = (refit?.diff.implications ?? []).map(i => i.text)
    check('a different dish chosen only to re-fit the day says so',
      refitTruth.some(t => !t.resized && !t.nowLeftover && !t.wasLeftover) && refitSaid.some(x => /becomes .*, so the day still fits\./.test(x)), { refitTruth, refitSaid })

    // MORE THAN FOUR CHANGES: the first four are listed and the rest folded
    // into one counted line, so a card never becomes a wall of text and never
    // hides that there is more.
    const many = okOf(build(on, { meal_slot: 'dinner', from_date: dates[1], to_date: dates[4] }))
    const manyTruth = diffOf(many?.after, [dates[1], dates[4]], 'dinner')
    const lines = (many?.diff.implications ?? []).map(i => i.text)
    check('the fixture is under pressure: more than four other meals change', manyTruth.length > 4, manyTruth.length)
    check('the first four are listed', lines.filter(t => /becomes|goes from/.test(t)).length === 4, lines)
    check('...and the rest are counted in one line, not dropped', lines.includes(DAY_MOVE.andMore(manyTruth.length - 4)), { n: manyTruth.length, lines })
    check('a meal that changes only in SIZE is reported with both sizes',
      manyTruth.some(t => t.resized) && (refitSaid.concat(said).some(x => /goes from [\d,]+ to [\d,]+ kcal/.test(x))), { manyTruth, said })

    // WHEN A SIZE CHANGE IS WORTH A LINE, with literals, so the thresholds
    // bind: at least 50 kcal AND a tenth of the meal.
    check('a small change in a big meal is not worth a line (60 kcal of 800)', isNoticeableResize(800, 860) === false)
    check('...nor a change of a few calories in a small one (30 kcal of 200)', isNoticeableResize(200, 230) === false)
    check('...but 60 kcal of a 400 kcal meal is (15%)', isNoticeableResize(400, 460) === true)
    check('...and so is 100 kcal of a 1000 kcal one, exactly a tenth', isNoticeableResize(1000, 1100) === true)
    check('...in either direction', isNoticeableResize(460, 400) === true && isNoticeableResize(860, 800) === false)
  }

  // ---------------------------------------------------------------------------
  console.log('\n[4] A day is warned about only when the move took it off target')
  {
    // Breakfast, lunch AND dinner pinned on both days, so nothing is free to
    // re-fit: the swap can only land the day where the dishes put it.
    const B = dish('breakfast', 'Oats bowl', 60, 150, 8)
    const Ls = dish('lunch', 'Light lunch', 100, 120, 6), Ll = dish('lunch', 'Big lunch', 200, 260, 14)
    const Ds = dish('dinner', 'Light dinner', 120, 150, 8), Dl = dish('dinner', 'Big dinner', 220, 300, 16)
    const Dl2 = dish('dinner', 'Big dinner two', 215, 310, 15)
    const t1 = sum([B.macros, Ls.macros, Dl.macros]), t2 = sum([B.macros, Ll.macros, Ds.macros])
    const tight = { calories: Math.round((t1.calories + t2.calories) / 2), protein: Math.round((t1.protein + t2.protein) / 2), carbs: Math.round((t1.carbs + t2.carbs) / 2), fat: Math.round((t1.fat + t2.fat) / 2) }
    const tp = { breakfast: [B], lunch: [Ls, Ll], dinner: [Ds, Dl, Dl2] }
    const rot = buildRotation(tp as never, tight, [], shapeOff)
    const tightServing = (pins: Record<string, Record<string, Opt>>) =>
      ({ today, dates, todaysPins: {}, pinsByDate: pins, pools: tp, targets: tight, softLikedFoods: [], shape: shapeOff, rotation: rot }) as unknown as Parameters<typeof serveMealWeek>[0]
    const pins = { [dates[1]]: { breakfast: B, lunch: Ll, dinner: Ds }, [dates[3]]: { breakfast: B, lunch: Ls, dinner: Dl } }
    const s = tightServing(pins)
    const wk = serveMealWeek(s)
    check('the fixture is under pressure: both days start on target', wk[1].day.withinTolerance && wk[3].day.withinTolerance, wk.map(d => [Math.round(d.day.totals.calories), d.day.withinTolerance]))
    const r = build(s, { meal_slot: 'dinner', from_date: dates[1], to_date: dates[3] })
    const o = okOf(r)
    check('the swap is proposed', r.ok, r)
    const warns = (o?.diff.implications ?? []).filter(i => i.severity === 'warn')
    check('BOTH days that fell off target are warned about', warns.length === 2, warns)
    const monday = o?.after[1].day.totals.calories ?? 0
    check('...with the day\'s real total and how far it is out', warns.some(w => w.text === DAY_MOVE.offTarget('Monday', Math.round(monday), Math.round(monday - tight.calories))), { warns, monday })
    check('...and no false reassurance that both days still land on target', !!o && !(o.diff.implications ?? []).some(i => i.text === DAY_MOVE.stillOnTarget))
    check('each row says which way its meal moved in size: up for the day given the bigger dinner, down for the other',
      /^up \d+ kcal$/.test(o?.diff.rows[0].note ?? '') && /^down \d+ kcal$/.test(o?.diff.rows[1].note ?? ''), o?.diff.rows.map(x => x.note))

    // A day that was ALREADY off is not blamed on the move: Monday is off
    // before (a big lunch and a big dinner) and off after (a different big
    // dinner); Wednesday is on and stays on.
    const off = tightServing({ [dates[1]]: { breakfast: B, lunch: Ll, dinner: Dl }, [dates[3]]: { breakfast: B, lunch: Ls, dinner: Dl2 } })
    const wOff = serveMealWeek(off)
    check('the fixture is under pressure: Monday starts off target and Wednesday on', !wOff[1].day.withinTolerance && wOff[3].day.withinTolerance,
      wOff.map(d => [Math.round(d.day.totals.calories), d.day.withinTolerance]))
    const rOff = build(off, { meal_slot: 'dinner', from_date: dates[1], to_date: dates[3] })
    const oOff = okOf(rOff)
    check('the swap is proposed', rOff.ok, rOff)
    check('...Monday is still off target after it, so the fixture is under pressure', oOff?.after[1].day.withinTolerance === false, oOff?.after[1].day.totals)
    const w = (oOff?.diff.implications ?? []).filter(i => i.severity === 'warn')
    check('a day already off target is not blamed on the move', !!oOff && w.length === 0, w)
    check('...and the card does not claim both days land on target', !!oOff && !(oOff.diff.implications ?? []).some(i => i.text === DAY_MOVE.stillOnTarget))
    // And a swap that leaves both on target says so.
    const ok = okOf(build(serving, { meal_slot: 'dinner', from_date: dates[1], to_date: dates[2] }))
    check('a swap that keeps both days on target says so, in the phrasebook\'s words',
      !!ok && (ok.diff.implications ?? []).some(i => i.text === DAY_MOVE.stillOnTarget), ok?.diff.implications)
  }

  // ---------------------------------------------------------------------------
  console.log('\n[5] The shopping list: said when stale, said when unreadable')
  {
    const texts = (r: Proposed) => (r.ok ? (r.diff.implications ?? []).map(i => i.text) : [])
    const stale = build(serving, { meal_slot: 'dinner', from_date: dates[1], to_date: dates[2] }, { list: [dates[2], dates[5]] })
    check('a swapped day that is on the list says the list needs rebuilding', texts(stale).includes(DAY_MOVE.listStale(['Tuesday'])), texts(stale))
    const both = build(serving, { meal_slot: 'dinner', from_date: dates[1], to_date: dates[2] }, { list: [dates[1], dates[2]] })
    check('...both days, when both are on it', texts(both).includes(DAY_MOVE.listStale(['Monday', 'Tuesday'])), texts(both))
    const none = build(serving, { meal_slot: 'dinner', from_date: dates[1], to_date: dates[2] }, { list: [dates[6]] })
    check('a list that holds neither day says nothing', none.ok && !texts(none).some(t => /shopping list/.test(t)), texts(none))
    const unknown = build(serving, { meal_slot: 'dinner', from_date: dates[1], to_date: dates[2] }, { list: null })
    check('a list that could not be read is said, never passed off as empty', texts(unknown).includes(DAY_MOVE.listUnknown), texts(unknown))
    // A day the swap changed without being named counts as well.
    const on = servingFor(shapeOn)
    const wk = serveMealWeek(on)
    const o = okOf(build(on, { meal_slot: 'dinner', from_date: dates[1], to_date: dates[3] }, { list: [] }))
    const names = (d: { day: { chosen: Partial<Record<Slot, Opt>> } }) => JSON.stringify(Object.values(d.day.chosen).map(x => x!.name))
    const changedOther = o?.after.find(d => d.date !== dates[1] && d.date !== dates[3] && names(d) !== names(wk.find(b => b.date === d.date)!))
    check('the fixture is under pressure: a day nobody named changes', !!changedOther)
    const r2 = build(on, { meal_slot: 'dinner', from_date: dates[1], to_date: dates[3] }, { list: changedOther ? [changedOther.date] : [] })
    check('...and that day being on the list is said too', texts(r2).some(t => /is on your shopping list/.test(t)), texts(r2))
  }

  // ---------------------------------------------------------------------------
  console.log('\n[6] A meal already eaten cannot move')
  {
    const eatenSource = build(serving, { meal_slot: 'dinner', from_date: 'today', to_date: dates[2] }, { logged: ['dinner'] })
    check('today\'s dinner, logged as eaten, cannot go to another day', !eatenSource.ok && eatenSource.reason === DAY_MOVE.refusals.eaten('dinner'), eatenSource)
    const eatenDest = build(serving, { meal_slot: 'dinner', from_date: dates[2], to_date: 'today' }, { logged: ['dinner'] })
    check('...and another day\'s cannot come into it', !eatenDest.ok && eatenDest.reason === DAY_MOVE.refusals.eaten('dinner'), eatenDest)
    const otherSlot = build(serving, { meal_slot: 'dinner', from_date: 'today', to_date: dates[2] }, { logged: ['breakfast', 'lunch'] })
    check('a different meal eaten today does not block this one', otherSlot.ok, otherSlot)
    const unreadable = build(serving, { meal_slot: 'dinner', from_date: 'today', to_date: dates[2] }, { logged: null })
    check('a ledger that could not be read refuses a move involving today', !unreadable.ok && unreadable.reason === DAY_MOVE.refusals.ledgerUnreadable, unreadable)
    const unrelated = build(serving, { meal_slot: 'dinner', from_date: dates[1], to_date: dates[2] }, { logged: null })
    check('...but not one that does not involve today', unrelated.ok, unrelated)
    const withToday = build(serving, { meal_slot: 'dinner', from_date: 'today', to_date: dates[2] })
    check('today\'s dinner, not eaten, swaps with another day\'s',
      withToday.ok && withToday.payload.legs[0].date === today && withToday.after[0].day.chosen.dinner?.name === nameOf(before, 2, 'dinner'), withToday)
  }

  // ---------------------------------------------------------------------------
  console.log('\n[7] Days as they are named')
  {
    const byDate = build(serving, { meal_slot: 'dinner', from_date: dates[1], to_date: dates[2] })
    const words = build(serving, { meal_slot: 'Dinner', from_date: 'Monday', to_date: 'tuesday' })
    const short = build(serving, { meal_slot: 'dinner', from_date: 'mon', to_date: 'tue' })
    const key = (r: ReturnType<typeof build>) => (r.ok ? JSON.stringify(r.payload) : 'refused')
    check('a weekday name means the same day as its date', key(byDate) === key(words) && key(byDate) !== 'refused', [key(byDate), key(words)])
    check('...and so does the three-letter form', key(short) === key(byDate))
    const tomorrow = build(serving, { meal_slot: 'dinner', from_date: 'today', to_date: 'tomorrow' })
    check('"today" and "tomorrow" are understood', tomorrow.ok && tomorrow.payload.legs[0].date === today && tomorrow.payload.legs[1].date === dates[1], tomorrow)
    check('a date the strip does not hold is refused, not guessed', !build(serving, { meal_slot: 'dinner', from_date: '2026-09-27', to_date: '2026-10-04' }).ok)
  }

  // ---------------------------------------------------------------------------
  console.log('\n[8] The write: both picks or neither')
  {
    setDevClockOverride('p1', today)
    const shown: { date: string; slot: string; name: string | null }[][] = []
    const show = (u: { date: string; slot: string; name: string | null }[]) => { shown.push(u) }
    const payload = { slot: 'dinner' as const, legs: [
      { date: dates[1], name: 'Rice pot', previous: null },
      { date: dates[2], name: 'Tray bake', previous: 'Baked chicken' },
    ] as [{ date: string; name: string; previous: string | null }, { date: string; name: string; previous: string | null }] }
    const reset = () => { db.meal_plan_picks = [{ profile_id: 'p1', date: dates[2], slot: 'dinner', meal_name: 'Baked chicken' }]; writes.length = 0; shown.length = 0; failUpsertWhen = null; failDeletes = false }

    reset()
    const ok = await executeMealDayMove('p1', payload, show as never)
    const stored = (d: string) => db.meal_plan_picks.find(r => r.date === d && r.slot === 'dinner')?.meal_name
    check('both picks are saved', stored(dates[1]) === 'Rice pot' && stored(dates[2]) === 'Tray bake', db.meal_plan_picks)
    check('the receipt lands both and fails nothing', ok.landed.length === 2 && ok.failed.length === 0, ok)
    check('the screen is told once, with both, after both are saved', shown.length === 1 && shown[0].length === 2, shown)

    // The SECOND write fails: the first is put back to nothing.
    reset()
    failUpsertWhen = row => row.date === dates[2]
    const half = await executeMealDayMove('p1', payload, show as never)
    check('when the second pick will not save, the first is taken back off', stored(dates[1]) === undefined && stored(dates[2]) === 'Baked chicken', db.meal_plan_picks)
    check('...the receipt says nothing changed and names why, in the phrasebook\'s words',
      half.landed.length === 0 && half.failed[0]?.error === DAY_MOVE.why.saveFailed, half)
    check('...and the screen is never told of a swap that did not happen', shown.length === 0, shown)

    // The FIRST fails: nothing was written, nothing to put back.
    reset()
    failUpsertWhen = row => row.date === dates[1]
    const first = await executeMealDayMove('p1', payload, show as never)
    check('when the first pick will not save, nothing is written at all', !writes.some(w => w.startsWith('upsert')) && first.landed.length === 0, writes)

    // A first pick that replaced an earlier one is put back to it, not cleared.
    reset()
    db.meal_plan_picks.push({ profile_id: 'p1', date: dates[1], slot: 'dinner', meal_name: 'Tray bake' })
    failUpsertWhen = row => row.date === dates[2]
    const withPrev = { ...payload, legs: [{ ...payload.legs[0], previous: 'Tray bake' }, payload.legs[1]] as typeof payload.legs }
    await executeMealDayMove('p1', withPrev, show as never)
    check('a first day that had its own pick gets that pick back', stored(dates[1]) === 'Tray bake', db.meal_plan_picks)

    // Putting back fails too: the receipt says half of it saved, and the screen shows the store's truth.
    reset()
    failUpsertWhen = row => row.date === dates[2]
    failDeletes = true
    const stuck = await executeMealDayMove('p1', payload, show as never)
    check('when the put-back fails as well, the receipt says only half saved and names it', stuck.failed[0]?.error === DAY_MOVE.why.halfSaved && stuck.landed.length === 1, stuck)
    check('...and the screen shows what the store now holds, not what was asked', shown.length === 1 && shown[0].length === 1 && shown[0][0].date === dates[1] && shown[0][0].name === 'Rice pot', shown)

    // The past is not writeable.
    reset()
    const past = await executeMealDayMove('p1', { ...payload, legs: [{ date: '2026-09-20', name: 'Rice pot', previous: null }, payload.legs[1]] }, show as never)
    check('a leg on a past date changes nothing and says so', past.failed.length === 1 && stored(dates[2]) === 'Baked chicken' && !writes.some(w => w.startsWith('upsert')), { past, writes })
    setDevClockOverride('p1', null)
  }

  // ---------------------------------------------------------------------------
  console.log('\n[9] The confirm only writes the swap the card described')
  {
    const a = build(serving, { meal_slot: 'dinner', from_date: dates[1], to_date: dates[2] })
    const again = build(serving, { meal_slot: 'dinner', from_date: dates[1], to_date: dates[2] })
    check('the same week gives the same swap', a.ok && again.ok && sameMealDayMove(a.payload, again.payload))
    // Tuesday's dinner is swapped for something else after the card was built.
    const changed = servingFor(shapeOff, { pinsByDate: { [dates[2]]: { dinner: pools.dinner.find(o => o.name !== dinnerB && o.name !== dinnerA)! } } })
    const now = build(changed, { meal_slot: 'dinner', from_date: dates[1], to_date: dates[2] })
    check('a dish changed on either day since the card was built is not the same swap', a.ok && now.ok && !sameMealDayMove(a.payload, now.payload), now.ok ? now.payload.legs : now)
    check('a different meal is not the same swap', a.ok && sameMealDayMove(a.payload, { ...a.payload, slot: 'lunch' }) === false)
    // The order the two days were named in is decided by the payload, not the ask.
    check('the payload names its own two days, in an order it keeps', a.ok && a.payload.legs[0].date === dates[1] && a.payload.legs[1].date === dates[2])
  }

  // ---------------------------------------------------------------------------
  console.log('\n[10] The wiring: hook, App, sheet, coach client, coach, parity list')
  {
    const hook = read('src/hooks/useMealDays.ts')
    check('the hook plans over ITS OWN week: today\'s pins, the other days\' pins, the pools, the rotation',
      /buildMealDayMoveProposal\(\{[\s\S]*?serving: \{ today, dates, todaysPins, pinsByDate, pools, targets, softLikedFoods, shape: mealShape, rotation \}/.test(hook))
    check('...reading the ledger, and the shopping list STRICTLY, before it plans',
      /getTodayLedger\(profileId, today, targets\)/.test(hook) && /readGroceryCoverage\([\s\S]*?\{ strict: true \}\)/.test(hook))
    check('...and an unreadable one is passed on as unreadable, never as empty',
      /let loggedTodaySlots: MealSlotName\[\] \| null = null/.test(hook) && /let listDates: string\[\] \| null = null/.test(hook))
    check('the confirm re-plans and compares with the card before it writes',
      /const live = await planDayMove\(/.test(hook) && /!sameMealDayMove\(live\.payload, payload\)/.test(hook) && /executeMealDayMove\(profileId, live\.payload, showPicks\)/.test(hook))
    check('the hook hands out the controller both surfaces use', /dayMove: \{ dates, today, plan: planDayMove, confirm: confirmDayMove \}/.test(hook))
    check('today\'s row is updated through the way App gives the hook, not a second store', /showTodaysPick\?\.\(u\.slot, u\.name\)/.test(hook))

    const app = read('src/App.tsx')
    check('App gives the hook the way to show today\'s pick', /showTodaysPick: \(slot, name\) => setManualMealPicks\(/.test(app))
    check('App hands the SAME controller to the Nutrition tab and to the coach',
      /dayMove=\{mealDays\.dayMove\}/.test(app) && /onMealDayMovePlan=\{mealDays\.dayMove\.plan\}/.test(app) && /onMealDayMoveConfirm=\{mealDays\.dayMove\.confirm\}/.test(app))

    const nd = read('src/components/NutritionDisplay.tsx')
    check('the Nutrition tab passes the controller to BOTH day views (today and an upcoming day)', (nd.match(/dayMove=\{dayMove\}/g) ?? []).length === 2, (nd.match(/dayMove=\{dayMove\}/g) ?? []).length)
    const mp = read('src/components/MealPlan.tsx')
    check('the meal row offers Move where there is a day to swap with, even with no meal slot to move to',
      /\(\(moveContext && onMealPickApplied\) \|\| dayMove\) && \(\s*<button/.test(mp))
    check('...and opens the sheet on the same terms, with the day controller, this day and this meal',
      /moveOpen && \(\(moveContext && onMealPickApplied\) \|\| dayMove\)/.test(mp) && /dayMove=\{dayMove \? \{ controller: dayMove, date, slot \} : null\}/.test(mp))
    const sheet = read('src/components/nutrition/MealMoveSheet.tsx')
    check('the sheet plans a day when it is tapped, and confirms through the controller',
      /dayMove\.controller\.plan\(\{ meal_slot: dayMove\.slot, from_date: dayMove\.date, to_date: toDate \}\)/.test(sheet) && /dayMove!\.controller\.confirm\(plan\.payload\)/.test(sheet))

    const chat = read('src/components/ChatAssistant.tsx')
    const dayBranch = chat.slice(chat.indexOf("result.proposal.kind === 'propose_meal_day_move'"), chat.indexOf("result.proposal.kind === 'propose_concurrent_activity'"))
    check('the coach builds the card by asking App\'s plan, and shows its refusal when there is no card',
      dayBranch.length > 100 && /await onMealDayMovePlan\(\{/.test(dayBranch) && /else refusal = moved\.reason/.test(dayBranch) && /built = \{ scopeKey: moved\.scopeKey/.test(dayBranch))
    check('the coach\'s confirm is App\'s confirm, and a missing one fails rather than pretending',
      /await onMealDayMoveConfirm\(payload\)/.test(chat) && /DAY_MOVE\.why\.saveFailed/.test(chat))
    check('...with a receipt title from the phrasebook', /RECEIPTS\['propose_meal_day_move'\]\.done/.test(chat))

    const fn = read('supabase/functions/chat-gemini/index.ts')
    const decl = fn.slice(fn.indexOf('name: "propose_meal_day_move"'), fn.indexOf('name: "propose_meal_refit"'))
    check('the coach declares the tool, needing the meal, both days and the quote', /required: \["meal_slot", "from_date", "to_date", "origin_verbatim_quote"\]/.test(decl))
    check('...and its handler forwards them and decides nothing', /kind: "propose_meal_day_move",\s*rawArgs: \{\s*meal_slot: args\.meal_slot,\s*from_date: args\.from_date,\s*to_date: args\.to_date,/.test(fn))
    check('the prompt no longer tells the coach the app cannot move a meal between days',
      !/the app cannot move a meal from one day to another/.test(fn) && !/Never move a meal from one day to another/.test(fn))
    check('...it points at the tool, from the slot move and from the upcoming days', /Moving a meal to another DAY is propose_meal_day_move/.test(fn) && /propose_meal_day_move with both dates/.test(fn))
    check('...and the slot move\'s own description says it stays between meals', /moves between MEALS; to move a meal to another DAY use propose_meal_day_move/.test(fn))
    check('the quick-replies rule counts it among the tools that render their own buttons', /propose_meal_move, propose_meal_day_move, propose_meal_refit/.test(fn))
    check('the prompt states the ruling, so the coach never calls it a hole', /THE TWO DAYS SWAP PLACES/.test(fn))

    const parity = readFileSync(join(ROOT, 'docs/coach-screen-parity.md'), 'utf8')
    check('the parity list records the tool with a screen counterpart', /\| `propose_meal_day_move` \| SCREEN \|/.test(parity))
  }

  console.log(failed === 0 ? `\nAll ${ran} meal-day-move checks passed.` : `\n${failed} of ${ran} check(s) failed.`)
  console.log(`${ran} checks ran`)
  if (failed > 0) process.exit(1)
}

main().catch(err => { console.error(err); process.exit(1) })

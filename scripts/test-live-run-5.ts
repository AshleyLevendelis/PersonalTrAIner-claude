// ---------------------------------------------------------------------------
// RUN 5 OF ASHLEY'S LIVE-APP TEST (11 Oct 2026) — the logic behind seven
// fixes. What she SEES is driven by verify:live-run-5; this holds the rules
// those screens read, and the wiring a driver cannot see.
//
//   §1 L-b  Home greets "Hi" between midnight and five, not "Morning".
//   §2 L-a  A typed shopping item with no amount is ONE of it, never "~0g".
//   §3 M48  At the heaviest weight she owns, the calibration cue says reps.
//   §4 M44  The shopping card says "the week ahead" only when it is.
//   §5 M45  "Train anyway" names the session and skips what she trained.
//   §6 M46  A rest day she trained on is a session; a time nobody measured
//           is not 45 minutes.
//   §7 M47  A past day says what was done on it.
//
// One exit, and it prints how many checks ran.
// ---------------------------------------------------------------------------

// --- Environment shims (before importing any lib modules) -------------------
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
;(globalThis as unknown as { window: unknown }).window = globalThis
for (const m of ['addEventListener', 'removeEventListener'] as const) {
  if (typeof (globalThis as Record<string, unknown>)[m] !== 'function') (globalThis as Record<string, unknown>)[m] = () => {}
}

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { GroceryItemRow } from '../src/lib/grocery-store'
import type { ExerciseSetLog, WorkoutDay } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

let failures = 0
let ran = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

const PID = 'u-run5'

async function main() {
  const { makeFakeSupabase } = await import('../.tour-harness/fake-supabase')
  const { setSupabaseClient } = await import('../src/lib/supabase')
  const db: Record<string, Record<string, unknown>[]> = {
    workout_sessions: [], exercise_set_logs: [], cardio_logs: [], meal_events: [], water_logs: [], daily_metrics: [],
    user_goals: [], meal_plan_picks: [], grocery_items: [], daily_steps: [],
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSupabaseClient(makeFakeSupabase(db) as any)

  const { homeGreeting, loadDashboardData } = await import('../src/lib/dashboard-data')
  const { typedGroceryAmount, chatGroceryAmount, formatShoppingQuantity, stepQuantity } = await import('../src/lib/grocery-display')
  const { parseIngredientLine } = await import('../src/lib/portion-scaler')
  const { calibrationCueText } = await import('../src/components/exercise/CalibrationCue')
  const { shopCardState } = await import('../src/lib/shop-card')
  const { isGroceryDueToday } = await import('../src/lib/shop-day-store')
  const { trainAnywayOptions, readBorrowedDay, writeBorrowedDay } = await import('../src/lib/borrowed-day')
  const { classifyDay } = await import('../src/hooks/useTrainingWeek')
  const { honestSessionMinutes, whatYouDid } = await import('../src/lib/session-derive')
  const { markSessionCompleted } = await import('../src/lib/daily-tracking')
  const { getSessionHistory } = await import('../src/lib/exercise-history')

  // -------------------------------------------------------------------------
  console.log('\n§1 L-b — the greeting by the hour')
  check('00:13 is "Hi", not "Morning" (what she saw)', homeGreeting(0, 'Sam') === 'Hi, Sam', homeGreeting(0, 'Sam'))
  check('04:59 is still "Hi"', homeGreeting(4, 'Sam') === 'Hi, Sam', homeGreeting(4, 'Sam'))
  check('05:00 is "Morning"', homeGreeting(5, 'Sam') === 'Morning, Sam', homeGreeting(5, 'Sam'))
  check('11:00 is "Morning", 12:00 "Afternoon", 18:00 "Evening"',
    homeGreeting(11, 'Sam') === 'Morning, Sam' && homeGreeting(12, 'Sam') === 'Afternoon, Sam' && homeGreeting(18, 'Sam') === 'Evening, Sam')
  check('no name, no comma', homeGreeting(2, '') === 'Hi', homeGreeting(2, ''))
  const dash = strip(read('src/components/Dashboard.tsx'))
  check('Home greets through it, on the app\'s clock', /homeGreeting\(getAppNow\(profile\.id\)\.getHours\(\)/.test(dash))
  check('...and no second copy of the bands is left in Home', !/< 12 \? 'Morning'/.test(dash))

  // -------------------------------------------------------------------------
  console.log('\n§2 L-a — a typed item with no amount')
  const toilet = typedGroceryAmount(parseIngredientLine('toilet roll'))
  check('"toilet roll" is stored as one of it, a count', toilet.quantity === 1 && toilet.unit === 'item' && toilet.name === 'toilet roll', toilet)
  check('...and reads "1"', formatShoppingQuantity({ display_name: 'toilet roll', ...toilet }).primary === '1', formatShoppingQuantity({ display_name: 'toilet roll', ...toilet }))
  check('...and its stepper goes to 2, not to grams', stepQuantity({ display_name: 'toilet roll', ...toilet }, 1) === 2)
  const chicken = typedGroceryAmount(parseIngredientLine('200g chicken'))
  check('a line with an amount keeps it ("200g chicken")', chicken.quantity === 200 && chicken.unit === 'g', chicken)
  const bananas = typedGroceryAmount(parseIngredientLine('3 bananas'))
  check('...and a count keeps its count ("3 bananas")', bananas.quantity === 3, bananas)
  // NEVER 0 FOR A NON-ZERO AMOUNT, whatever stored it (an older row, the coach).
  for (const g of [1, 2, 3, 4]) {
    const shown = formatShoppingQuantity({ display_name: 'bin bags', quantity: g, unit: 'g' }).primary
    check(`${g} g of something the food list does not know never reads as nothing`, !/(^|[^0-9.])0g/.test(shown) && /[1-9]/.test(shown), shown)
  }
  check('...while a real weight still rounds as a shopper reads it', formatShoppingQuantity({ display_name: 'bin bags', quantity: 1180, unit: 'g' }).primary === '~1.2kg',
    formatShoppingQuantity({ display_name: 'bin bags', quantity: 1180, unit: 'g' }).primary)
  const list = strip(read('src/components/GroceryList.tsx'))
  check('the add bar stores what typedGroceryAmount says', /typedGroceryAmount\(parseIngredientLine\(/.test(list) && /name: typed\.name, quantity: typed\.quantity, unit: typed\.unit/.test(list))

  // RUN 7, L58 (20 Oct 2026): "kitchen roll · 1g". The coach's amounts go through the add bar's rule.
  const roll = chatGroceryAmount({ name: 'kitchen roll', quantity: 1, unit: 'g' })
  check('L58: the coach adding "1 g" of kitchen roll stores one of it', roll.quantity === 1 && roll.unit === 'item', roll)
  check('L58: ...a weight on something that is not a food is one of it, whatever the number', JSON.stringify(chatGroceryAmount({ name: 'bin bags', quantity: 500, unit: 'g' })) === JSON.stringify({ name: 'bin bags', quantity: 1, unit: 'item' }), chatGroceryAmount({ name: 'bin bags', quantity: 500, unit: 'g' }))
  check('L58: ...no amount at all is one of it, never "1 whole"', JSON.stringify(chatGroceryAmount({ name: 'toilet roll' })) === JSON.stringify({ name: 'toilet roll', quantity: 1, unit: 'item' }) && chatGroceryAmount({ name: 'eggs', quantity: 6 }).unit === 'item', chatGroceryAmount({ name: 'toilet roll' }))
  check('L58: ...while a food keeps its weight ("500 g chicken breast")', JSON.stringify(chatGroceryAmount({ name: 'chicken breast', quantity: 500, unit: 'g' })) === JSON.stringify({ name: 'chicken breast', quantity: 500, unit: 'g' }), chatGroceryAmount({ name: 'chicken breast', quantity: 500, unit: 'g' }))
  check('L58: ...and a food at under a shoppable gram is one of it', chatGroceryAmount({ name: 'chicken breast', quantity: 2, unit: 'g' }).unit === 'item')
  const chatSrc = strip(read('src/components/ChatAssistant.tsx'))
  check('L58: the coach\'s add stores what chatGroceryAmount says', /const amount = chatGroceryAmount\(/.test(chatSrc) && /name: amount\.name, quantity: amount\.quantity, unit: amount\.unit/.test(chatSrc))

  // -------------------------------------------------------------------------
  console.log('\n§3 M48 — the calibration cue at the stated limit')
  const atLimit = calibrationCueText(true, true)
  const normal = calibrationCueText(true, false)
  check('at the limit it says nothing about going up in weight', !/go up|%|heavier/i.test(atLimit), atLimit)
  check('...says it is the heaviest she has told the app about', /heaviest you've told me you have/i.test(atLimit), atLimit)
  check('...and says to add reps instead', /add reps rather than weight/i.test(atLimit), atLimit)
  check('...keeping the one effort target', /3-4 reps in reserve/.test(atLimit), atLimit)
  check('the plan\'s own sentence at that limit says the same thing (reps go up)', /The reps go up instead/.test(read('src/lib/load-prescription.ts')))
  check('below the limit the cue is unchanged (go up 5-10%)', /Go up 5-10%/.test(normal) && normal === calibrationCueText(true), normal)
  check('a loadless row is unchanged by the flag', calibrationCueText(false, true) === calibrationCueText(false), calibrationCueText(false, true))
  const row = strip(read('src/components/exercise/ExerciseRow.tsx'))
  const today = strip(read('src/components/exercise/TodayPanel.tsx'))
  check('the row passes the hold it already carries', /<CalibrationCue hasLoad=\{ex\.suggested_load_kg != null\} atStatedLimit=\{ex\.load_hold === 'stated_limit'\} \/>/.test(row))
  check('...and the nudge above the list asks the same', /calibrationCueText\(mainLift!\.suggested_load_kg != null, mainLift!\.load_hold === 'stated_limit'\)/.test(today))

  // -------------------------------------------------------------------------
  console.log('\n§4 M44 — what the shopping card may say')
  const TODAY = '2026-10-11'
  const add = (d: string, n: number) => { const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) }
  let seq = 0
  const gen = (name: string, refs: { date: string; slot: string; mealName: string }[], o: Partial<GroceryItemRow> = {}): GroceryItemRow => ({
    id: `g${++seq}`, profile_id: PID, canonical_key: name, display_name: name, quantity: 100, unit: 'g', category: 'produce',
    source: 'generated', meal_refs: refs.map(r => ({ day: 0, ...r })), checked: false, needs_review: false, client_id: null,
    created_at: '2026-10-07T09:00:00Z', dismissed: false, user_edited: false, ...o,
  })
  // Built four days ago for seven days: 7..13 Oct. Today is the 11th.
  const built = Array.from({ length: 7 }, (_, i) => add('2026-10-07', i))
  const stale = [
    gen('onions', [{ date: '2026-10-07', slot: 'dinner', mealName: 'Chilli' }]),         // all past
    gen('rice', [{ date: '2026-10-08', slot: 'dinner', mealName: 'Stir fry' }, { date: '2026-10-12', slot: 'dinner', mealName: 'Curry' }]),
    gen('oats', built.map(d => ({ date: d, slot: 'breakfast', mealName: 'Porridge' }))),
    gen('milk', [{ date: '2026-10-13', slot: 'breakfast', mealName: 'Porridge' }], { checked: true }),
    { ...gen('toilet roll', []), source: 'manual' as const, unit: 'item', quantity: 1 },
  ]
  const st = shopCardState({ items: stale, today: TODAY })
  check('a list that stops short of a week out is NOT "the week ahead"', st.weekAhead === false, st)
  check('...and is out of date', st.outOfDate === true)
  check('...saying what it covers, as the Grocery screen says it', st.coverage === 'Built from your next 3 days of meals.', st.coverage)
  check('the count leaves out a row whose every meal has passed (onions for Wednesday)', !st.toBuy.some(i => i.display_name === 'onions'), st.toBuy.map(i => i.display_name))
  check('...keeps a row with a meal still ahead, and one she typed herself',
    st.toBuy.map(i => i.display_name).sort().join() === 'oats,rice,toilet roll', st.toBuy.map(i => i.display_name))
  check('...and never counts a ticked row', st.checked === 1 && !st.toBuy.some(i => i.checked))

  const fresh = [gen('oats', Array.from({ length: 7 }, (_, i) => ({ date: add(TODAY, i), slot: 'breakfast', mealName: 'Porridge' })))]
  const fr = shopCardState({ items: fresh, today: TODAY })
  check('a list built today for seven days IS the week ahead', fr.weekAhead === true && fr.outOfDate === false, fr)
  const gap = [gen('oats', [0, 1, 2, 4, 5, 6].map(i => ({ date: add(TODAY, i), slot: 'breakfast', mealName: 'Porridge' })))]
  check('...but not with a day missing in the middle', shopCardState({ items: gap, today: TODAY }).weekAhead === false)
  const changed = shopCardState({ items: fresh, today: TODAY, picks: { [add(TODAY, 2)]: { breakfast: 'Eggs on toast' } } })
  check('a meal swapped since the build makes it out of date, and says so', changed.mealsChanged && changed.outOfDate && !changed.weekAhead, changed)
  const same = shopCardState({ items: fresh, today: TODAY, picks: { [add(TODAY, 2)]: { breakfast: 'Porridge' } } })
  check('...a pick of the dish the list was built from does not', !same.mealsChanged && same.weekAhead, same)
  const other = shopCardState({ items: fresh, today: TODAY, picks: { [add(TODAY, 2)]: { dinner: 'Curry' } } })
  check('...nor a pick for a meal the list never covered', !other.mealsChanged, other)
  const typedOnly = shopCardState({ items: [{ ...gen('foil', []), source: 'manual' as const }], today: TODAY })
  check('a list she typed herself claims no coverage at all', !typedOnly.weekAhead && !typedOnly.outOfDate && typedOnly.toBuy.length === 1, typedOnly)
  // The card still comes up on shop day to say so, with nothing left to buy.
  const PLAN: WorkoutDay[] = [{ day: 'Monday', focus: 'Upper', exercises: [{ name: 'Bench', sets: 3, reps: '8' } as never] } as WorkoutDay]
  check('on shop day an out-of-date list raises the card with nothing to buy',
    isGroceryDueToday({ todayName: 'Sunday', plan: PLAN, uncheckedCount: 0, nowMs: 0, listOutOfDate: true }) === true)
  check('...but a list with nothing on it and nothing wrong does not',
    isGroceryDueToday({ todayName: 'Sunday', plan: PLAN, uncheckedCount: 0, nowMs: 0 }) === false)
  const card = strip(read('src/components/ShopDayCard.tsx'))
  check('the card reads its words off the state (one "week ahead", behind weekAhead)',
    (card.match(/for the week ahead/g) ?? []).length === 1 && /state\.weekAhead\s*\?[\s\S]{0,140}for the week ahead/.test(card))
  check('...counts state.toBuy, not every unchecked row', /const unchecked = state\.toBuy/.test(card) && !/items\.filter\(i => !i\.checked\)/.test(card))
  check('...tells the store when the list is out of date', /listOutOfDate: state\.outOfDate/.test(card))
  check('...and reads the meals now for the days it covers', /getMealPicksForDates\(profileId, ahead\)/.test(card))

  // -------------------------------------------------------------------------
  console.log('\n§5 M45 — "Train anyway"')
  const day = (d: string, focus: string, n = 3): WorkoutDay => ({ day: d, focus, exercises: Array.from({ length: n }, (_, i) => ({ name: `${focus} ${i}`, sets: 3, reps: '8' })) } as unknown as WorkoutDay)
  const plan = [day('Monday', 'Push & Press'), day('Tuesday', 'Pull & Hinge'), day('Thursday', 'Legs'), day('Friday', 'Full Body'), { day: 'Saturday', focus: 'Recovery', exercises: [] } as unknown as WorkoutDay]
  const week = [
    { date: '2026-10-05', dayName: 'Monday', state: 'done', session: plan[0] },
    { date: '2026-10-06', dayName: 'Tuesday', state: 'missed', session: plan[1] },
    { date: '2026-10-07', dayName: 'Wednesday', state: 'partial', session: null },   // a rest day borrowed onto
    { date: '2026-10-08', dayName: 'Thursday', state: 'due', session: plan[2] },
    { date: '2026-10-09', dayName: 'Friday', state: 'due', session: plan[3] },
    { date: '2026-10-11', dayName: 'Sunday', state: 'rest', session: null },
  ]
  const opts = trainAnywayOptions({ plan, todayName: 'Sunday', week, borrowedOn: d => (d === '2026-10-07' ? 'Thursday' : null) })
  check('each option names the session: "Tuesday · Pull & Hinge"', opts.some(o => o.day === 'Tuesday' && o.label === 'Tuesday · Pull & Hinge'), opts)
  check('a session already done this week is not offered (Monday)', !opts.some(o => o.day === 'Monday'), opts)
  check('...nor one already borrowed onto an earlier rest day (Thursday, borrowed Wednesday)', !opts.some(o => o.day === 'Thursday'), opts)
  check('...a missed one still is (Tuesday), and so is one still to come (Friday)', opts.map(o => o.day).join() === 'Tuesday,Friday', opts)
  check('...and a day with no exercises is never offered', !opts.some(o => o.day === 'Saturday'))
  const movedWeek = [{ date: '2026-10-08', dayName: 'Thursday', state: 'done', session: plan[1] }]
  check('a session moved to another day and trained there is not offered (Tuesday\'s, done Thursday)',
    !trainAnywayOptions({ plan, todayName: 'Sunday', week: movedWeek }).some(o => o.day === 'Tuesday'))
  // Remembered per date, on this phone.
  writeBorrowedDay(PID, '2026-10-11', 'Tuesday')
  check('the borrow is remembered for today', readBorrowedDay(PID, '2026-10-11') === 'Tuesday')
  check('...and only for today (tomorrow starts clean)', readBorrowedDay(PID, '2026-10-12') === null)
  check('...and only for her', readBorrowedDay('someone-else', '2026-10-11') === null)
  writeBorrowedDay(PID, '2026-10-11', null)
  check('...and forgetting it clears it', readBorrowedDay(PID, '2026-10-11') === null)
  check('the Exercise tab starts from the remembered borrow and writes every change',
    /useState<string \| null>\(\(\) => readBorrowedDay\(profileId, today\)\)/.test(today) && /writeBorrowedDay\(profileId, today, dayName\)/.test(today))
  check('...a new day reads its own, it does not blank one', !/setBorrowedDayName\(null\)/.test(today) && /setBorrowedDayState\(readBorrowedDay\(profileId, today\)\)/.test(today))
  check('...and the options come from the week\'s own states', /trainAnywayOptions\(\{[\s\S]{0,120}week: weekTrain\.days/.test(today))
  check('the rest-day card prints the label and borrows by the day',
    /\{o\.label\}/.test(strip(read('src/components/exercise/RestDayCard.tsx'))) && /onTrainAnyway\(o\.day\)/.test(read('src/components/exercise/RestDayCard.tsx')))

  // -------------------------------------------------------------------------
  console.log('\n§6 M46 — a rest day she trained on, and a time nobody measured')
  const RPLAN = [day('Monday', 'Push & Press'), day('Tuesday', 'Pull & Hinge'), { day: 'Saturday', focus: 'Active recovery', exercises: [] } as unknown as WorkoutDay]
  const logOn = (date: string, name: string, n: number, minute = 0): ExerciseSetLog => ({
    id: `${date}-${name}-${n}`, user_id: PID, date, exercise_name: name, set_number: n, weight_kg: 40, reps_completed: 8,
    is_bodyweight: false, is_warmup: false, completed_at: `${date}T10:${String(minute + n * 3).padStart(2, '0')}:00`,
  })
  const ddayOf = (date: string, logs: ExerciseSetLog[], completed: boolean) => ({
    date, metric: null, nutrition: null, exercises: [], warmupLogs: [], cardioLogs: [],
    session: { id: 's', profile_id: PID, date, is_completed: completed } as never, workingLogs: logs,
  })
  check('an empty recovery row she lifted on, not finished, is partial (it said "recovery")',
    classifyDay('Saturday', '2026-10-10', '2026-10-11', RPLAN, ddayOf('2026-10-10', [logOn('2026-10-10', 'Row', 1)], false) as never, '2026-10-01') === 'partial')
  check('...and finished, done',
    classifyDay('Saturday', '2026-10-10', '2026-10-11', RPLAN, ddayOf('2026-10-10', [logOn('2026-10-10', 'Row', 1)], true) as never, '2026-10-01') === 'done')
  check('...while with nothing logged it is still recovery',
    classifyDay('Saturday', '2026-10-10', '2026-10-11', RPLAN, ddayOf('2026-10-10', [], false) as never, '2026-10-01') === 'recovery')

  // Home on Sunday 11 Oct, a rest day (no row), with Tuesday borrowed and two sets in.
  const profile = { id: PID, created_at: '2026-10-01T00:00:00Z' } as never
  const sundayLogs = [logOn(TODAY, 'Pull & Hinge 0', 1), logOn(TODAY, 'Pull & Hinge 0', 2)]
  const home = (logs: ExerciseSetLog[]) => loadDashboardData({
    profile, macros: null, exercisePlan: RPLAN, mesocycle: [], planCreatedAt: '2026-10-01T00:00:00Z',
    todayLogs: logs, liveWeek: 1, dayName: 'Sunday', todayStr: TODAY, now: new Date(`${TODAY}T12:00:00`),
  })
  const restHome = await home([])
  check('a rest day with nothing logged is still a rest day', restHome.session.status === 'rest', restHome.session.status)
  writeBorrowedDay(PID, TODAY, 'Tuesday')
  const borrowedHome = await home(sundayLogs)
  check('A REST DAY WITH SETS IN IS A SESSION, not "Rest day" (what she saw)', borrowedHome.session.status === 'in_progress', borrowedHome.session)
  check('...named for the session she borrowed', borrowedHome.session.focus === 'Pull & Hinge', borrowedHome.session.focus)
  check('...counted against that session\'s sets (2 of 9)', borrowedHome.session.setsLogged === 2 && borrowedHome.session.setsPlanned === 9, borrowedHome.session)
  db.workout_sessions.push({ id: 'sun', profile_id: PID, date: TODAY, split_type: 'training', is_completed: true, duration_minutes: 45,
    started_at: `${TODAY}T10:00:00`, finished_at: `${TODAY}T10:40:00` })
  const doneHome = await home(sundayLogs)
  check('...and once finished, done', doneHome.session.status === 'done', doneHome.session.status)
  check('...with the time worked out from the sets, not the column\'s 45', doneHome.sessionMinutes != null && doneHome.sessionMinutes !== 45 && doneHome.sessionMinutes > 0, doneHome.sessionMinutes)
  writeBorrowedDay(PID, TODAY, null)
  db.workout_sessions.length = 0
  const ownHome = await home([logOn(TODAY, 'Barbell Rows', 1), logOn(TODAY, 'Barbell Rows', 2), logOn(TODAY, 'Dips', 3)])
  check('work of her own on a rest day is named from what she did', ownHome.session.status === 'in_progress' && ownHome.session.focus === 'Barbell Rows + 1 more', ownHome.session)

  // The time.
  check('a figure a finish measured stands', honestSessionMinutes(52, null, null, []) === 52)
  check('the 45 placeholder with sets across half an hour is their training time',
    honestSessionMinutes(45, '2026-10-11T10:00:00Z', '2026-10-11T11:30:00Z', ['2026-10-11T10:02:00Z', '2026-10-11T10:10:00Z', '2026-10-11T10:18:00Z', '2026-10-11T10:26:00Z']) === 26,
    honestSessionMinutes(45, '2026-10-11T10:00:00Z', '2026-10-11T11:30:00Z', ['2026-10-11T10:02:00Z', '2026-10-11T10:10:00Z', '2026-10-11T10:18:00Z', '2026-10-11T10:26:00Z']))
  check('sets typed in afterwards, all one stamp, with a later start: nobody knows (null, not 45)',
    honestSessionMinutes(45, '2026-10-11T19:00:00Z', '2026-10-09T12:00:00Z', ['2026-10-09T12:00:00Z', '2026-10-09T12:00:00Z']) === null)
  check('no sets, the placeholder: nobody knows', honestSessionMinutes(45, null, null, []) === null)

  // The writer that was passed no minutes: the "I did it" sheet and a retried close.
  const timed = { id: 'timed', profile_id: PID, date: '2026-10-08', split_type: 'training', is_completed: false, duration_minutes: 45, started_at: '2026-10-08T10:00:00Z' }
  const typed = { id: 'typed', profile_id: PID, date: '2026-10-06', split_type: 'seeded', is_completed: false, duration_minutes: 45, started_at: '2026-10-11T09:00:00Z' }
  db.workout_sessions.push(timed, typed)
  for (const [i, t] of ['10:01', '10:09', '10:17', '10:25'].entries()) db.exercise_set_logs.push({ id: `t${i}`, session_id: 'timed', user_id: PID, exercise_name: 'Squat', set_number: i + 1, weight_kg: 60, reps_completed: 5, is_bodyweight: false, is_warmup: false, completed_at: `2026-10-08T${t}:00Z` })
  db.exercise_set_logs.push({ id: 'tw', session_id: 'timed', user_id: PID, exercise_name: 'Squat', set_number: 1, weight_kg: 20, reps_completed: 5, is_bodyweight: false, is_warmup: true, completed_at: '2026-10-08T09:00:00Z' })
  for (let i = 0; i < 3; i++) db.exercise_set_logs.push({ id: `p${i}`, session_id: 'typed', user_id: PID, exercise_name: 'Squat', set_number: i + 1, weight_kg: 60, reps_completed: 5, is_bodyweight: false, is_warmup: false, completed_at: '2026-10-06T12:00:00.000Z' })
  await markSessionCompleted('timed', new Date('2026-10-08T11:30:00Z'))
  await markSessionCompleted('typed', new Date('2026-10-06T12:00:00'))
  const timedRow = db.workout_sessions.find(r => r.id === 'timed')!
  const typedRow = db.workout_sessions.find(r => r.id === 'typed')!
  check('a close passed no minutes writes the training time from its sets (25, build-up ignored)', timedRow.duration_minutes === 25 && timedRow.is_completed === true, timedRow)
  check('...and a past day typed in afterwards is closed without inventing a time', typedRow.is_completed === true && typedRow.duration_minutes === 45, typedRow)
  // A row closed before this fix: completed, still holding the 45, its sets
  // spread over twenty-one minutes. Only the history reader can correct it.
  db.workout_sessions.push({ id: 'older', profile_id: PID, date: '2026-10-04', split_type: 'training', is_completed: true, duration_minutes: 45, started_at: '2026-10-04T10:00:00Z', finished_at: '2026-10-04T11:15:00Z' })
  for (const [i, t] of ['10:05', '10:13', '10:21'].entries()) db.exercise_set_logs.push({ id: `o${i}`, session_id: 'older', user_id: PID, exercise_name: 'Squat', set_number: i + 1, weight_kg: 60, reps_completed: 5, is_bodyweight: false, is_warmup: false, completed_at: `2026-10-04T${t}:00Z` })
  const hist = await getSessionHistory(PID, 50)
  check('history corrects a 45 that was never measured from its sets (21)', hist.find(e => e.sessionId === 'older')?.durationMinutes === 21, hist.find(e => e.sessionId === 'older'))
  check('history reads the measured one as measured', hist.find(e => e.sessionId === 'timed')?.durationMinutes === 25, hist.find(e => e.sessionId === 'timed'))
  check('...and the untimed one as unknown, not 45', hist.find(e => e.sessionId === 'typed')?.durationMinutes === null, hist.find(e => e.sessionId === 'typed'))
  const dialog = strip(read('src/components/exercise/SessionHistoryDialog.tsx'))
  check('...which the history list says in words, apart from "not finished"', /'time not recorded'/.test(dialog) && /!entry\.isCompleted \? 'not finished'/.test(dialog))

  // -------------------------------------------------------------------------
  console.log('\n§7 M47 — what was done on a past day')
  const did = whatYouDid([
    { ...logOn('2026-10-06', 'Deadlift', 2), weight_kg: 100, reps_completed: 5 },
    { ...logOn('2026-10-06', 'Deadlift', 1), weight_kg: 100, reps_completed: 5 },
    { ...logOn('2026-10-06', 'Lat Pulldown', 4), weight_kg: 50, reps_completed: 10 },
    { ...logOn('2026-10-06', 'Deadlift', 3), weight_kg: 60, reps_completed: 5, is_warmup: true },
    { ...logOn('2026-10-06', 'Lat Pulldown', 5), weight_kg: 35, reps_completed: 12, drop_index: 1 },
  ])
  check('one line per exercise, in the order done', did.map(d => d.name).join() === 'Deadlift,Lat Pulldown', did)
  check('...weight × reps per set', did[0]?.line === '100kg × 5, 5' && did[1]?.line === '50kg × 10', did)
  check('...build-ups and drops left out', !did.some(d => /60kg|35kg/.test(d.line)), did)
  check('the peek leads with it, before the plan, which it dims under "Planned"',
    (() => {
      const a = today.indexOf('<PeekWhatYouDid logs={peekDidLogs} />', today.indexOf('peek-swapped'))
      const b = today.indexOf('<PeekPanel', a)
      return a > 0 && b > a && /peekDidLogs\.length > 0 \? 'opacity-60'/.test(today.replace(/peekCell\?\.state === 'swapped' \|\| /, ''))
    })())
  check('...and reads the day\'s own logs from the week', /const peekDidLogs = peekCell\?\.workingLogs \?\? \[\]/.test(today))
  check('a recovery day says its suggested cardio in the plan\'s own phrase', /prescriptionLine\(peekWorkout\.recommendedCardio\)/.test(today) && /peekWorkout\?\.conditioning_note/.test(today))

  console.log(`\n${ran} checks ran.`)
  if (failures > 0) { console.error(`${failures} check(s) failed`); process.exit(1) }
  console.log('Run 5 logic holds.\n')
  process.exit(0)
}

main().catch(e => { console.error(e); console.log(`\n${ran} checks ran.`); process.exit(1) })

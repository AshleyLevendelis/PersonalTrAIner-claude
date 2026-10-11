/**
 * Gate: the app only says "behind" once the time for it has passed.
 *
 * 9 Oct 2026, the test log's L28 and L8. Three rules said "behind"; one had a
 * clock. Run against the tree as it was, this gate's own cases gave:
 *
 *   07:00, nothing eaten        "Protein is behind — 164g to go. Your lunch has 57g of it, still to log."
 *   08:30, food on plan, no water   "Water is behind — 2000ml to go."
 *   21:53, signed up at 21:50   "Protein is behind — 164g to go. ..."
 *
 * WHAT IS HELD HERE: one helper (`expectedByNow`) answers "how much by now?";
 * the SAME inputs give quiet at 07:00, what-is-left or quiet at 12:00, and
 * "behind" at 20:00; and the day the account or the plan was made is silent
 * at every hour. Home's two lines are held end to end in test:dashboard §8
 * (they need the dashboard's fake database); the screen is verify:pace-clock.
 *
 * The clock in every case is a Date this file builds. Nothing here reads the
 * machine's time, so the answers are the same on a Tuesday.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  expectedByNow, isBehindPace, paceClock, WAKING_DAY, MEAL_DUE_HOUR,
  PACE_KEEPING_UP_FRACTION, PACE_WORTH_SAYING_FRACTION, type PaceSlot,
} from '../src/lib/pace'
import { macroShortfallLine, type PlannedMeal, type ShortfallInput } from '../src/lib/macro-shortfall'
import { selectCoachTipWithKey, type CoachTipContext } from '../src/lib/coach-tips'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const code = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

let failures = 0
let ran = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 400)}` : ''}`) }
}

const DAY = '2026-03-11'
const at = (hhmm: string, day = DAY) => new Date(`${day}T${hhmm}:00`)
const JOINED_LONG_AGO = '2026-02-01T09:00:00'
const clockAt = (hhmm: string, startedOn: (string | null | undefined)[] = [JOINED_LONG_AGO]) => paceClock(at(hhmm), startedOn)

// Sam, from the test log: 1,697 kcal, 164 g protein. A day of four planned
// meals whose totals ARE the targets, so a missing meal is the only shortfall.
const T = { calories: 1697, protein: 164, carbs: 150, fat: 49 }
const plan: { slot: PaceSlot; label: string; share: number }[] = [
  { slot: 'breakfast', label: 'Breakfast', share: 0.27 },
  { slot: 'lunch', label: 'Lunch', share: 0.36 },
  { slot: 'dinner', label: 'Dinner', share: 0.27 },
  { slot: 'snack', label: 'Snack', share: 0.10 },
]
const mealsWith = (logged: PaceSlot[]): PlannedMeal[] => plan.map(m => ({
  slot: m.slot, label: m.label, logged: logged.includes(m.slot),
  macros: { calories: T.calories * m.share, protein: T.protein * m.share, carbs: T.carbs * m.share, fat: T.fat * m.share },
}))
const eatenOf = (logged: PaceSlot[]) => {
  const share = plan.filter(m => logged.includes(m.slot)).reduce((s, m) => s + m.share, 0)
  return { protein: T.protein * share, carbs: T.carbs * share, fat: T.fat * share }
}
/** One day's inputs; water is on target unless a case says otherwise, so food is what is being asked about. */
const day = (logged: PaceSlot[], hhmm: string, over: Partial<ShortfallInput> = {}): ShortfallInput => ({
  targets: T, eaten: eatenOf(logged), waterTargetMl: 2000, waterMl: 2000, meals: mealsWith(logged), clock: clockAt(hhmm), ...over,
})
const line = (input: ShortfallInput) => macroShortfallLine(input)

// ---------------------------------------------------------------------------
console.log('\n1. One helper answers "how much by now?"')
// ---------------------------------------------------------------------------
{
  const w = (hhmm: string) => Math.round(expectedByNow(2000, clockAt(hhmm), WAKING_DAY))
  check('water at 07:00: nothing is due before the waking day starts', w('07:00') === 0, w('07:00'))
  check('water at 08:30: about 70ml of 2000', w('08:30') === 71, w('08:30'))
  check('water at 12:00: 2000 x 4/14 = 571 (her own example\'s arithmetic)', w('12:00') === 571, w('12:00'))
  check('water at 22:00 and after: the whole target, never more', w('22:00') === 2000 && w('23:30') === 2000, [w('22:00'), w('23:30')])

  const meals = { kind: 'meals' as const, meals: plan.map(m => ({ slot: m.slot, amount: 100 * m.share })) }
  const f = (hhmm: string) => Math.round(expectedByNow(100, clockAt(hhmm), meals))
  check('food at 07:00: no meal is due', f('07:00') === 0, f('07:00'))
  check('food at 12:00: breakfast only', f('12:00') === 27, f('12:00'))
  check('food at 15:00: breakfast and lunch', f('15:00') === 63, f('15:00'))
  check('food at 20:00: breakfast, lunch and the snack — not dinner yet', f('20:00') === 73, f('20:00'))
  check('food at 21:30: all of it', f('21:30') === 100, f('21:30'))
  check('each meal becomes due exactly at its hour, not before',
    (Object.keys(MEAL_DUE_HOUR) as PaceSlot[]).every(slot => {
      const one = { kind: 'meals' as const, meals: [{ slot, amount: 10 }] }
      const h = MEAL_DUE_HOUR[slot]
      return expectedByNow(10, { hour: h - 0.02, firstDay: false }, one) === 0 && expectedByNow(10, { hour: h, firstDay: false }, one) === 10
    }))
  check('the meals run in the order of a day (breakfast < lunch < snack < dinner)',
    MEAL_DUE_HOUR.breakfast < MEAL_DUE_HOUR.lunch && MEAL_DUE_HOUR.lunch < MEAL_DUE_HOUR.snack && MEAL_DUE_HOUR.snack < MEAL_DUE_HOUR.dinner, MEAL_DUE_HOUR)
  // The amounts are SHARES. A plan adding up to 100 against a target of 50,
  // or of 400, still has exactly the target due once every meal's time is past.
  check('a plan that over- or under-delivers still makes exactly the target due by the end of the day',
    expectedByNow(50, clockAt('21:30'), meals) === 50 && expectedByNow(400, clockAt('21:30'), meals) === 400)
  check('...and the same share of it part-way (27% of 400 at noon)', Math.round(expectedByNow(400, clockAt('12:00'), meals)) === 108)

  const first = clockAt('21:53', ['2026-03-11T21:50:00'])
  check('the first day: nothing is due, of water or of food, at any hour',
    first.firstDay === true && expectedByNow(2000, first, WAKING_DAY) === 0 && expectedByNow(100, first, meals) === 0, first)
  check('the day after joining is an ordinary day', paceClock(at('21:53', '2026-03-12'), ['2026-03-11T21:50:00']).firstDay === false)
  check('a plain date counts as well as a timestamp', paceClock(at('09:00'), [DAY]).firstDay === true)
  check('a missing date is not a reason to go quiet', paceClock(at('09:00'), [null, undefined, '']).firstDay === false)
  check('either date being today is enough (an old account, a new plan)',
    paceClock(at('09:00'), [JOINED_LONG_AGO, `${DAY}T08:00:00`]).firstDay === true)
  check('the clock carries the minutes (21:53 is not 21:00)', Math.abs(clockAt('21:53').hour - (21 + 53 / 60)) < 1e-9, clockAt('21:53').hour)

  check('no target, or a nonsense one, is never "due"',
    expectedByNow(0, clockAt('20:00'), WAKING_DAY) === 0 && expectedByNow(NaN, clockAt('20:00'), WAKING_DAY) === 0)
  check('behind needs something to have been due', isBehindPace(0, 0, 2000) === false)
  check(`keeping up is ${PACE_KEEPING_UP_FRACTION * 100}% of what was due unless a rule says otherwise: just under is behind, at it is not`,
    isBehindPace(599, 1000, 2000) === true && isBehindPace(600, 1000, 2000) === false)
  check('...and a rule can ask for more (two thirds: 650 of 1000 is then behind)',
    isBehindPace(650, 1000, 2000, 0.66) === true && isBehindPace(660, 1000, 2000, 0.66) === false)
  check(`...and the gap has to be worth saying (${PACE_WORTH_SAYING_FRACTION * 100}% of the target): 71ml short at 08:30 is not`,
    isBehindPace(0, 71, 2000) === false && isBehindPace(0, 250, 2000) === true)
}

// ---------------------------------------------------------------------------
console.log('\n2. The Nutrition line: the same day at 07:00, 12:00 and 20:00')
// ---------------------------------------------------------------------------
{
  // (a) Nothing logged all day.
  const none0700 = line(day([], '07:00'))
  const none1200 = line(day([], '12:00'))
  const none2000 = line(day([], '20:00'))
  check('nothing logged, 07:00: silent (this was "Protein is behind — 164g to go")', none0700 === null, none0700)
  check('nothing logged, 09:59: still silent', line(day([], '09:59')) === null, line(day([], '09:59')))
  check('nothing logged, 12:00: breakfast\'s time has passed, so it may say behind', /^Protein is behind — 164g to go\./.test(none1200 ?? ''), none1200)
  // Re-anchored 10 Oct 2026 (runs 3-4, LOW): three meals past their time and
  // none logged is a LOGGING gap, and the line says so instead of a macro.
  check('nothing logged, 20:00: three meals past their time, so it says what is unlogged',
    none2000 === "3 of today's meals still to log, so these numbers are only what's logged so far.", none2000)

  // (b) Breakfast logged at 07:00, then nothing else — the SAME inputs at three times.
  const b0700 = line(day(['breakfast'], '07:00'))
  const b1200 = line(day(['breakfast'], '12:00'))
  const b2000 = line(day(['breakfast'], '20:00'))
  check('breakfast logged, 07:00: silent', b0700 === null, b0700)
  check('breakfast logged, 12:00: silent — on pace, and the plan covers the rest', b1200 === null, b1200)
  check('breakfast logged, 20:00: behind (lunch and the snack have gone by)', /^Protein is behind — 120g to go\. Your lunch has 59g of it, still to log\.$/.test(b2000 ?? ''), b2000)
  check('...so one day gives different answers at different hours', b1200 !== b2000)

  // (c) Keeping up with the clock, but the meals left would not close the day.
  const lightDay: ShortfallInput = {
    ...day(['breakfast', 'lunch', 'snack'], '20:00'),
    eaten: { protein: 90, carbs: T.carbs * 0.73, fat: T.fat * 0.73 },
  }
  const light = line(lightDay)
  check('on pace but 74g short with a 44g dinner left: what is left, in neutral words',
    light === '74g of protein to come today. Your dinner has 44g of it, still to log.', light)
  check('...and never the word "behind"', !/behind/i.test(light ?? ''))
  check('the same light day at 07:00 is silent', line({ ...lightDay, clock: clockAt('07:00') }) === null)

  // (d) Water.
  const water = (hhmm: string, ml: number) => line(day(['breakfast', 'lunch', 'dinner', 'snack'], hhmm, { waterMl: ml }))
  check('no water at 08:30: silent (this was "Water is behind — 2000ml to go")', water('08:30', 0) === null, water('08:30', 0))
  check('no water at 12:00: behind', water('12:00', 0) === 'Water is behind — 2000ml to go.', water('12:00', 0))
  check('400ml at 12:00 is keeping up with 571 due: silent', water('12:00', 400) === null, water('12:00', 400))
  check('300ml at 12:00 is not (about half of what was due): behind', water('12:00', 300) === 'Water is behind — 1700ml to go.', water('12:00', 300))
  check('400ml at 20:00 is not: behind', water('20:00', 400) === 'Water is behind — 1600ml to go.', water('20:00', 400))

  // (e) No meal plan for today: thirds, by the same hours.
  const noPlan = (hhmm: string) => line({ targets: T, eaten: { protein: 0, carbs: 0, fat: 0 }, waterTargetMl: 2000, waterMl: 2000, meals: [], clock: clockAt(hhmm) })
  check('no meal plan, 07:00: silent', noPlan('07:00') === null, noPlan('07:00'))
  check('no meal plan, 20:00, nothing eaten: behind, with no meal named', noPlan('20:00') === 'Protein is behind — 164g to go.', noPlan('20:00'))
}

// ---------------------------------------------------------------------------
console.log('\n3. The day the account or the plan was made is silent, at every hour')
// ---------------------------------------------------------------------------
{
  const hours = ['07:00', '12:00', '20:00', '21:53']
  const firstDay = (hhmm: string, startedOn: string[]) => line(day([], hhmm, { waterMl: 0, clock: clockAt(hhmm, startedOn) }))
  check('account made today, nothing eaten, no water: nothing at 07:00, 12:00, 20:00 or 21:53',
    hours.every(h => firstDay(h, [`${DAY}T06:30:00`]) === null), hours.map(h => firstDay(h, [`${DAY}T06:30:00`])))
  check('plan made today on an old account: the same', hours.every(h => firstDay(h, [JOINED_LONG_AGO, `${DAY}T06:30:00`]) === null))
  // The contrast: the identical day for somebody who joined in February is NOT silent.
  check('...and the same day for somebody who is not new does speak at 20:00', /behind|still to log/.test(firstDay('20:00', [JOINED_LONG_AGO]) ?? ''), firstDay('20:00', [JOINED_LONG_AGO]))
}

// ---------------------------------------------------------------------------
console.log('\n4. Home\'s water tip asks the same helper')
// ---------------------------------------------------------------------------
{
  const ctx = (hourOfDay: number, firstDay: boolean, waterMl = 0): CoachTipContext => ({
    today: DAY, proteinAdherenceStreakDays: 0, knownLiftProgress: [], sessionsThisWeekSoFar: 0, sessionsLastWeekSameSpan: 0,
    scheduledSoFarThisWeek: 0, loggedOfScheduledSoFarThisWeek: 0, weightTrend: null, recentPRs: [],
    waterMl, waterTargetMl: 2000, hourOfDay, firstDay,
  })
  const tip = (h: number, firstDay = false, ml = 0) => selectCoachTipWithKey(ctx(h, firstDay, ml))?.text ?? null
  check('21:00 with no water, not new: "about 1850ml behind" (the figure in the test log)', tip(21) === "You're about 1850ml behind on water for this time of day.", tip(21))
  check('the same on the day they joined: nothing', tip(21, true) === null, tip(21, true))
  check('09:00: quiet, as it always was', tip(9) === null, tip(9))
  check('12:00 with 400ml (70% of pace): quiet', tip(12, false, 400) === null, tip(12, false, 400))
  check('12:00 with 300ml (53% of pace, 250 short after rounding): spoken', /about 250ml behind/.test(tip(12, false, 300) ?? ''), tip(12, false, 300))
}

// ---------------------------------------------------------------------------
console.log('\n5. Nothing that decides a pace line reads the machine\'s clock')
// ---------------------------------------------------------------------------
{
  for (const file of ['src/lib/pace.ts', 'src/lib/macro-shortfall.ts', 'src/lib/coach-tips.ts']) {
    const src = code(file)
    check(`${file}: no \`new Date()\` and no Date.now()`, !/new Date\(\s*\)|Date\.now\(\)/.test(src))
  }
  const nutrition = code('src/components/NutritionDisplay.tsx')
  const call = /macroShortfallLine\(\{[\s\S]*?\n {2}\}\)/.exec(nutrition)?.[0] ?? ''
  check('the Nutrition tab hands the line a clock built from the APP\'s now', /clock:\s*paceClock\(\s*getAppNow\(/.test(call), call.slice(-200))
  check('...with the account\'s date and the plan\'s', /profile\.created_at/.test(call) && /planCreatedAt/.test(call), call.slice(-200))
  const all = ['src/lib/macro-shortfall.ts', 'src/lib/coach-tips.ts', 'src/lib/dashboard-data.ts'].map(f => [f, code(f)] as const)
  check('all three rules call the one helper', all.every(([, s]) => /expectedByNow\(/.test(s)), all.filter(([, s]) => !/expectedByNow\(/.test(s)).map(([f]) => f))
}

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.error(`${failures} pace check(s) FAILED.`); process.exit(1) }
console.log('The app says "behind" only once the time for it has passed.')

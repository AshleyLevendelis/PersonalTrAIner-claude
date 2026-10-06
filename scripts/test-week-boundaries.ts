/**
 * Gate: a DATE belongs to exactly one plan week, and the week changes at local midnight.
 *
 * Written 6 Oct 2026 (docs/plans/week-boundaries.md), on Ashley's "make sure the app knows
 * where one week ends and the other begins" and her ruling: a training week runs from the
 * day the plan started, every week, changing at midnight.
 *
 * WHY IT EXISTS. `getActiveMesocycleWeek` counted 24-hour blocks from the plan's creation
 * TIMESTAMP, so a plan made on Thursday at 18:30 moved to week 2 on the next Thursday at
 * 18:30: that Thursday was week 1 at noon and week 2 at 23:30, and the callers that asked
 * "now", "noon of the date" and "the stamp taken this morning" got different answers about
 * one date. Nothing could see it: no gate called the function, the test clock sits at noon,
 * and the test plan is made at midnight, so every sampling point agreed.
 *
 * WHAT THIS HOLDS, in four time zones (a clock change is where a millisecond count drifts):
 *   1. One date, one week, at every hour of that date, for plans made at any weekday and any
 *      time of day.
 *   2. The week changes at LOCAL MIDNIGHT on the plan's start weekday: the last minute of the
 *      day before is still the old week, the first minute of the day is the new one.
 *   3. A week is exactly seven consecutive dates and consecutive dates never skip a week.
 *   4. Before the plan is week 1, after the last week it stays on the last week, an absent or
 *      unreadable start is week 1, and a one-week plan is always week 1.
 */
import { getActiveMesocycleWeek } from '../src/lib/calculations'
import { planDaysForDate } from '../src/lib/plan-week'
import { weekBoundaryIndex, weekBoundaryNote } from '../src/lib/week-glyphs'
import type { TrainingWeekDay } from '../src/hooks/useTrainingWeek'
import type { MesocycleWeek, WorkoutDay } from '../src/lib/types'

let ran = 0
let failed = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failed++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 500)}` : ''}`) }
}

const ZONES = ['UTC', 'America/New_York', 'Pacific/Auckland', 'Asia/Kolkata']
const TOTAL = 8
/** A plan made at this local moment, as the ISO instant the app stores. */
const madeAt = (y: number, m: number, d: number, h: number, mi: number) => new Date(y, m, d, h, mi).toISOString()
const at = (planCreatedAt: string, y: number, m: number, d: number, h: number, mi: number, total = TOTAL) =>
  getActiveMesocycleWeek(planCreatedAt, new Date(y, m, d, h, mi), total)
/** The local calendar date `offset` days after a start date, built the way a person counts days (not in milliseconds). */
const dayAfter = (y: number, m: number, d: number, offset: number) => { const x = new Date(y, m, d + offset); return { y: x.getFullYear(), m: x.getMonth(), d: x.getDate() } }

// Starts on every weekday (1 Oct 2026 is a Thursday), at times that straddle noon and midnight,
// and in a stretch that holds a clock change in New York (1 Nov) and Auckland (27 Sep).
const STARTS = [[2026, 8, 24], [2026, 8, 25], [2026, 8, 26], [2026, 8, 27], [2026, 8, 28], [2026, 8, 29], [2026, 8, 30], [2026, 9, 26], [2026, 9, 28]] as const
const TIMES: [number, number][] = [[0, 0], [0, 30], [11, 59], [12, 0], [18, 30], [23, 59]]
const HOURS: [number, number][] = [[0, 0], [0, 30], [6, 0], [11, 59], [12, 0], [12, 1], [18, 30], [23, 0], [23, 59]]

for (const zone of ZONES) {
  process.env.TZ = zone
  console.log(`\n${zone}`)

  const ambiguous: string[] = []
  let sampled = 0
  for (const [sy, sm, sd] of STARTS) for (const [h, mi] of TIMES) {
    const created = madeAt(sy, sm, sd, h, mi)
    for (let offset = 0; offset <= 36; offset++) {
      const day = dayAfter(sy, sm, sd, offset)
      const answers = new Set(HOURS.map(([hh, mm]) => at(created, day.y, day.m, day.d, hh, mm)))
      sampled++
      if (answers.size !== 1) ambiguous.push(`made ${sy}-${sm + 1}-${sd} ${h}:${String(mi).padStart(2, '0')}, day +${offset}: ${[...answers].join('/')}`)
    }
  }
  check(`one date is one week at every hour of it: ${sampled} dates across ${STARTS.length * TIMES.length} plans`, ambiguous.length === 0 && sampled === STARTS.length * TIMES.length * 37, { ambiguous: ambiguous.slice(0, 4), sampled })

  const wrongEdge: string[] = []
  for (const [sy, sm, sd] of STARTS) for (const [h, mi] of TIMES) {
    const created = madeAt(sy, sm, sd, h, mi)
    for (let k = 1; k < TOTAL; k++) {
      const first = dayAfter(sy, sm, sd, 7 * k)
      const before = dayAfter(sy, sm, sd, 7 * k - 1)
      const lastMinuteBefore = at(created, before.y, before.m, before.d, 23, 59)
      const firstMinute = at(created, first.y, first.m, first.d, 0, 0)
      if (lastMinuteBefore !== k || firstMinute !== k + 1) wrongEdge.push(`made ${sy}-${sm + 1}-${sd} ${h}:${String(mi).padStart(2, '0')}: week ${k} ends ${lastMinuteBefore}, week ${k + 1} starts ${firstMinute}`)
    }
  }
  check('week k+1 begins at 00:00 of the plan\'s start weekday and week k is still running at 23:59 the night before', wrongEdge.length === 0, wrongEdge.slice(0, 4))

  const notSeven: string[] = []
  for (const [sy, sm, sd] of STARTS) {
    const created = madeAt(sy, sm, sd, 18, 30)
    const perWeek = new Map<number, number>()
    let previous = 0
    for (let offset = 0; offset < 7 * TOTAL; offset++) {
      const day = dayAfter(sy, sm, sd, offset)
      const week = at(created, day.y, day.m, day.d, 12, 0)
      perWeek.set(week, (perWeek.get(week) ?? 0) + 1)
      if (week < previous || week > previous + 1) notSeven.push(`made ${sy}-${sm + 1}-${sd}: day +${offset} is week ${week} after ${previous}`)
      previous = week
    }
    for (let w = 1; w <= TOTAL; w++) if (perWeek.get(w) !== 7) notSeven.push(`made ${sy}-${sm + 1}-${sd}: week ${w} holds ${perWeek.get(w)} dates`)
  }
  check('a week is exactly seven consecutive dates, and the numbers never skip or go back', notSeven.length === 0, notSeven.slice(0, 4))
}

process.env.TZ = 'UTC'
console.log('\nThe ends of the range')
const created = madeAt(2026, 9, 1, 18, 30) // Thursday 1 Oct, evening
check('days before the plan are week 1, not week 0 or a negative week', at(created, 2026, 8, 1, 12, 0) === 1 && at(created, 2026, 9, 1, 0, 0) === 1)
check('after the last week it stays on the last week and does not wrap to week 1', at(created, 2027, 2, 1, 12, 0) === TOTAL && at(created, 2026, 11, 31, 12, 0) === TOTAL)
check('a one-week plan is always week 1', at(created, 2026, 9, 30, 12, 0, 1) === 1)
check('a missing start is week 1', getActiveMesocycleWeek(undefined, new Date(2026, 9, 20, 12), TOTAL) === 1)
check('an unreadable start is week 1, not NaN', getActiveMesocycleWeek('not a date', new Date(2026, 9, 20, 12), TOTAL) === 1)
check('a total of zero is treated as one week', getActiveMesocycleWeek(created, new Date(2026, 9, 20, 12), 0) === 1)
check('with no clock given it reads the real one without throwing', Number.isInteger(getActiveMesocycleWeek(created, undefined, TOTAL)))

console.log('\nEach date of a Monday-to-Sunday window looks in its own plan week')
// A four-week plan whose weeks differ only in their label, so a day taken from the wrong week is visible.
const dayRow = (week: number, name: string) => ({ day: name, focus: `W${week} ${name}`, exercises: [] }) as unknown as WorkoutDay
const NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const mesocycle: MesocycleWeek[] = [1, 2, 3, 4].map(w => ({ week_number: w, label: `Week ${w}`, days: NAMES.map(n => dayRow(w, n)) }))
const daysOfWeek = (w: number) => mesocycle[w - 1].days
const dateStr = (y: number, m: number, d: number) => { const x = new Date(y, m, d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
// A plan made on Thursday 1 Oct 2026 in the evening: plan weeks run Thursday to Wednesday.
// The window of Monday 5 Oct to Sunday 11 Oct holds week 1 (Mon to Wed) and week 2 (Thu to Sun).
const madeThursday = madeAt(2026, 9, 1, 18, 30)
const window = Array.from({ length: 7 }, (_, i) => dateStr(2026, 9, 5 + i))
const weeksSeen = window.map(d => planDaysForDate(d, dateStr(2026, 9, 6), daysOfWeek(1), mesocycle, madeThursday).week)
check('the window of a Thursday plan holds two plan weeks: Mon-Wed are week 1, Thu-Sun are week 2', JSON.stringify(weeksSeen) === JSON.stringify([1, 1, 1, 2, 2, 2, 2]), weeksSeen)
const resolvedOn = window.map(d => planDaysForDate(d, dateStr(2026, 9, 6), daysOfWeek(1), mesocycle, madeThursday))
check('a date in today\'s plan week gets the live days exactly as the caller derived them', resolvedOn.slice(0, 3).every(r => r.days === daysOfWeek(1)))
check('a date in the NEXT plan week gets that week\'s own days, not this week\'s', resolvedOn.slice(3).every(r => r.days === daysOfWeek(2)), resolvedOn.slice(3).map(r => r.days[0]?.focus))
// The same window seen from Friday 9 Oct, when week 2 has begun: now Mon-Wed are the PAST week.
const fromFriday = window.map(d => planDaysForDate(d, dateStr(2026, 9, 9), daysOfWeek(2), mesocycle, madeThursday))
check('seen from the new week, the earlier days of the window look in the week that has ended', fromFriday.slice(0, 3).every(r => r.days === daysOfWeek(1) && r.week === 1) && fromFriday.slice(3).every(r => r.days === daysOfWeek(2) && r.week === 2), fromFriday.map(r => `${r.week}:${r.days[0]?.focus}`))
// A dev week-override hands in week 3 as "live": today's whole plan week must follow it, other weeks must not.
const overridden = window.map(d => planDaysForDate(d, dateStr(2026, 9, 6), daysOfWeek(3), mesocycle, madeThursday))
check('a forced live week is honoured for today\'s plan week and does not leak into the next one', overridden.slice(0, 3).every(r => r.days === daysOfWeek(3)) && overridden.slice(3).every(r => r.days === daysOfWeek(2)))
// The live days handed in are WEEK 3's, so "the live days stand" cannot be confused with "week 1's days".
const noAnswer = [
  planDaysForDate(window[4], window[1], daysOfWeek(3), undefined, madeThursday),
  planDaysForDate(window[4], window[1], daysOfWeek(3), [], madeThursday),
  planDaysForDate(window[4], window[1], daysOfWeek(3), mesocycle, undefined),
]
check('with no mesocycle, an empty one, or no plan start there is no per-date answer: no week, and the live days stand', noAnswer.every(r => r.week === undefined && r.days === daysOfWeek(3)), noAnswer.map(r => `${r.week}:${r.days[0]?.focus}`))
const gappy: MesocycleWeek[] = [mesocycle[0], mesocycle[1], mesocycle[3]] // a week 3 that is missing: the date falls back to what the caller holds
// Today is in week 1 and the date is in week 3, so the answer has to come from the missing-week fallback itself.
const inGap = planDaysForDate(dateStr(2026, 9, 20), dateStr(2026, 9, 6), daysOfWeek(1), gappy, madeThursday)
check('a plan week the mesocycle does not hold falls back to the live days rather than to nothing', inGap.week === 3 && inGap.days === daysOfWeek(1), `${inGap.week}:${inGap.days[0]?.focus}`)
const farFuture = planDaysForDate(dateStr(2027, 5, 1), dateStr(2026, 9, 6), daysOfWeek(1), mesocycle, madeThursday)
check('a date past the plan\'s last week stays on the last week\'s days', farFuture.week === 4 && farFuture.days === daysOfWeek(4), farFuture.week)
check('a date before the plan is week 1', planDaysForDate(dateStr(2026, 8, 20), dateStr(2026, 9, 6), daysOfWeek(1), mesocycle, madeThursday).week === 1)

console.log('\nThe strip says where the training week changes')
const stripFor = (weeks: (number | undefined)[]): TrainingWeekDay[] => weeks.map((planWeek, i) => ({ date: dateStr(2026, 9, 5 + i), dayName: NAMES[i], state: 'due', ...(planWeek !== undefined ? { planWeek } : {}) }) as TrainingWeekDay)
// A helper that throws must FAIL a check, not end the run: a crash reads as "not a catch" to the mutation harness.
const attempt = <T,>(f: () => T): T | string => { try { return f() } catch (e) { return `threw: ${String(e)}` } }
const noteOn = (days: TrainingWeekDay[], d: string) => attempt(() => weekBoundaryNote(days, d))
const thursdayPlan = stripFor([1, 1, 1, 2, 2, 2, 2])
check('the boundary is the first day of the new week: Thursday, index 3', weekBoundaryIndex(thursdayPlan) === 3)
check('before it, the note says the new week starts, and names the day', noteOn(thursdayPlan, dateStr(2026, 9, 6)) === 'Week 2 starts Thursday', noteOn(thursdayPlan, dateStr(2026, 9, 6)))
check('on the day itself it says today', noteOn(thursdayPlan, dateStr(2026, 9, 8)) === 'Week 2 starts today', noteOn(thursdayPlan, dateStr(2026, 9, 8)))
check('after it, the note says the new week began, and names the day', noteOn(thursdayPlan, dateStr(2026, 9, 10)) === 'Week 2 began Thursday', noteOn(thursdayPlan, dateStr(2026, 9, 10)))
check('a window holding one plan week has no boundary and no note (a plan begun on a Monday)', weekBoundaryIndex(stripFor([2, 2, 2, 2, 2, 2, 2])) === -1 && noteOn(stripFor([2, 2, 2, 2, 2, 2, 2]), dateStr(2026, 9, 6)) === null)
check('with no plan weeks known (a legacy plan) there is nothing to say', weekBoundaryIndex(stripFor([undefined, undefined, undefined, undefined, undefined, undefined, undefined])) === -1 && noteOn(stripFor([undefined, undefined, undefined, undefined, undefined, undefined, undefined]), dateStr(2026, 9, 6)) === null)
check('a day whose week is unknown is not a boundary, even beside a day whose week is known', weekBoundaryIndex(stripFor([undefined, undefined, undefined, 2, 2, 2, 2])) === -1 && weekBoundaryIndex(stripFor([2, 2, 2, undefined, undefined, undefined, undefined])) === -1)
check('a boundary on any weekday is found: Tuesday through Sunday', [1, 2, 3, 4, 5, 6].every(at => weekBoundaryIndex(stripFor(Array.from({ length: 7 }, (_, i) => (i < at ? 3 : 4)))) === at))
check('a week that changes by more than one is still a boundary', weekBoundaryIndex(stripFor([1, 1, 3, 3, 3, 3, 3])) === 2)


// ---------------------------------------------------------------------------
// S4 — the strip's days are DATES, and "today" for the weight window is the person's own day.
// Written against the real functions with a fake client that answers every query with the rows
// it is given (and, for upserts, records what was written).
// ---------------------------------------------------------------------------
console.log('\nThe strip walks dates, not instants (a clock change must not repeat or skip a day)')
{
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, String(v)) }, removeItem: (k: string) => { store.delete(k) }, clear: () => store.clear() }, configurable: true })
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })

  const fakeFrom = () => {
    const chain: unknown = new Proxy({}, {
      get: (_t, prop) => (prop === 'then' ? (resolve: (v: unknown) => void) => resolve({ data: [], error: null }) : () => chain),
    })
    return chain
  }
  const { setSupabaseClient } = await import('../src/lib/supabase')
  setSupabaseClient({ from: fakeFrom } as never)
  const { getWeeklyDashboard } = await import('../src/lib/daily-tracking')

  /** Seven consecutive dates from a Monday, by arithmetic on the calendar and not on the clock. */
  const sevenFrom = (monday: string) => Array.from({ length: 7 }, (_, i) => { const d = new Date(`${monday}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10) })
  /** The loop the strip used before 6 Oct 2026, kept here so the fixture can prove it binds. */
  const oldLoop = (startDate: string, endDate: string) => { const out: string[] = []; const cur = new Date(startDate); const end = new Date(endDate); while (cur <= end) { out.push(cur.toISOString().split('T')[0]); cur.setDate(cur.getDate() + 1) } return out }
  /** 105 consecutive Mondays from 5 Jan 2026: two years, which holds every clock change in the zones below. */
  const mondays = Array.from({ length: 105 }, (_, k) => { const d = new Date('2026-01-05T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 7 * k); return d.toISOString().slice(0, 10) })

  const STRIP_ZONES = ['UTC', 'Europe/London', 'America/New_York', 'Australia/Sydney', 'Pacific/Auckland', 'Africa/Cairo']
  let oldWrongSomewhere = false
  for (const zone of STRIP_ZONES) {
    process.env.TZ = zone
    let wrong = 0
    let oldWrong = 0
    const firstWrong: string[] = []
    for (const monday of mondays) {
      const want = sevenFrom(monday)
      const got = (await getWeeklyDashboard('p1', monday, want[6])).map(d => d.date)
      if (got.join() !== want.join()) { wrong++; if (firstWrong.length < 2) firstWrong.push(`${monday}: ${got.join(' ')}`) }
      if (oldLoop(monday, want[6]).join() !== want.join()) oldWrong++
    }
    if (oldWrong > 0) oldWrongSomewhere = true
    check(`${zone}: all ${mondays.length} Monday-to-Sunday strips over two years are seven consecutive dates`, wrong === 0 && mondays.length === 105, { wrong, firstWrong })
    if (zone === 'UTC') check('UTC: the old loop was right here (the fixture is not just always wrong)', oldWrong === 0, oldWrong)
    if (zone === 'Australia/Sydney') check('Sydney: the old loop repeated or skipped a day on some strips (the fixture binds)', oldWrong > 0, oldWrong)
  }
  check('some zone showed the old defect, so the strips above were a real test', oldWrongSomewhere)
}

console.log('\n"Today" for the weight window and the target snapshot is the person\'s own day')
{
  const RealDate = Date
  const freezeAt = (iso: string) => {
    const fixed = new RealDate(iso).getTime()
    class Frozen extends RealDate {
      constructor(...a: unknown[]) { if (a.length === 0) super(fixed); else super(...(a as [string])) }
      static now() { return fixed }
    }
    globalThis.Date = Frozen as unknown as DateConstructor
  }
  const thaw = () => { globalThis.Date = RealDate }
  const upserts: Record<string, unknown>[] = []
  let weighIns: Record<string, unknown>[] = []
  const fakeFrom = (table: string) => {
    const chain: unknown = new Proxy({}, {
      get: (_t, prop) => {
        if (prop === 'then') return (resolve: (v: unknown) => void) => resolve({ data: table === 'daily_metrics' ? weighIns : [], error: null })
        if (prop === 'upsert') return (row: Record<string, unknown>) => { if (table === 'daily_nutrition_targets') upserts.push(row); return chain }
        return () => chain
      },
    })
    return chain
  }
  const { setSupabaseClient } = await import('../src/lib/supabase')
  setSupabaseClient({ from: fakeFrom } as never)
  const { getEffectiveTargetWeightKg, snapshotTargetsIfChanged } = await import('../src/lib/nutrition-targets')
  const near = (a: number | undefined, b: number) => a !== undefined && Math.abs(a - b) < 0.01
  const row = (date: string, kg: number) => ({ date, weight_kg: kg })

  // Auckland, 09:00 on 7 Oct: the person's date is 7 Oct, UTC's is still 6 Oct. Today's weigh-in is
  // 90kg and the six before it 80kg, so a window that includes today averages 81.43 and one that
  // does not averages 80.
  process.env.TZ = 'Pacific/Auckland'
  weighIns = [row('2026-10-07', 90), ...['01', '02', '03', '04', '05', '06'].map(d => row(`2026-10-${d}`, 80))]
  freezeAt('2026-10-06T20:00:00Z')
  const morning = await getEffectiveTargetWeightKg('p1', 70)
  thaw()
  check('east of UTC in the morning, today\'s weigh-in is inside the seven-day window', near(morning.weightKg, (90 + 6 * 80) / 7), morning)

  // New York, 22:00 on 6 Oct: the person's date is 6 Oct, UTC's is already 7 Oct. The 30 Sep weigh-in
  // is the seventh day back for the person (100kg) and the eighth for UTC.
  process.env.TZ = 'America/New_York'
  weighIns = [row('2026-09-30', 100), ...['01', '02', '03', '04', '05', '06'].map(d => row(`2026-10-${d}`, 80))]
  freezeAt('2026-10-07T02:00:00Z')
  const evening = await getEffectiveTargetWeightKg('p1', 70)
  thaw()
  check('west of UTC in the evening, the window still reaches back seven days of the person\'s own', near(evening.weightKg, (100 + 6 * 80) / 7), evening)

  // The app's own clock, not the machine's: the dev clock moves the whole app to another date, and a
  // window read off the machine's date would average weigh-ins from a week the app is not in.
  process.env.TZ = 'UTC'
  weighIns = [...['14', '15', '16', '17', '18', '19', '20'].map(d => row(`2026-09-${d}`, 80)), ...['01', '02', '03', '04', '05', '06'].map(d => row(`2026-10-${d}`, 99))]
  const { setDevClockOverride } = await import('../src/lib/dev-clock')
  setDevClockOverride('p1', '2026-09-20')
  freezeAt('2026-10-06T12:00:00Z')
  const onDevClock = await getEffectiveTargetWeightKg('p1', 70)
  thaw()
  setDevClockOverride('p1', null)
  check('the weight window follows the app\'s date (the dev clock), not the machine\'s', near(onDevClock.weightKg, 80), onDevClock)

  // The snapshot row is dated the person's own day: an evening in New York must not file it under tomorrow.
  process.env.TZ = 'America/New_York'
  const profile = { id: 'p1', weight_kg: 80, height_cm: 180, age: 30, gender: 'male', activity_level: 'moderate' } as never
  freezeAt('2026-10-07T02:00:00Z')
  upserts.length = 0
  await snapshotTargetsIfChanged('p1', profile, { calories: 2500, protein: 160, carbs: 280, fat: 80 }, null)
  thaw()
  check('the target snapshot is dated the person\'s own day (6 Oct in New York at 22:00), not UTC\'s (7 Oct)', upserts.length === 1 && upserts[0].date === '2026-10-06', upserts.map(u => u.date))

  // And it follows the app's own clock too (the dev clock), as every other dated write does.
  process.env.TZ = 'UTC'
  setDevClockOverride('p1', '2026-09-20')
  freezeAt('2026-10-06T12:00:00Z')
  upserts.length = 0
  await snapshotTargetsIfChanged('p1', profile, { calories: 2600, protein: 165, carbs: 290, fat: 85 }, null)
  thaw()
  setDevClockOverride('p1', null)
  check('the target snapshot is dated the app\'s date (the dev clock), not the machine\'s', upserts.length === 1 && upserts[0].date === '2026-09-20', upserts.map(u => u.date))
}

console.log(`\n${ran} checks ran`)
if (failed > 0) { console.error(`\n${failed} week-boundary check(s) failed`); process.exit(1) }
console.log('\nAll week-boundary checks passed.')

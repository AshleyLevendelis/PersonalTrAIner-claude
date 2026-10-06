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

console.log(`\n${ran} checks ran`)
if (failed > 0) { console.error(`\n${failed} week-boundary check(s) failed`); process.exit(1) }
console.log('\nAll week-boundary checks passed.')

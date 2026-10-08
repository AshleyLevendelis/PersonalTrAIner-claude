/**
 * Gate: coming back after a break (layoff.ts, 8 Oct 2026; plan docs/plans/layoff-handling.md).
 *
 * Ashley asked what happens when somebody stops training. The answer was that the first
 * session back was prescribed last time's weight PLUS an increment, because the last-session
 * lookup has no age limit, and nothing said a word about the break. Her ruling on the one
 * question that was hers: after a very long break, OFFER to start the plan again from week 1
 * (one tap, never automatic).
 *
 * WHAT THIS HOLDS:
 *   1. The bands, at every edge (9/10, 20/21, 41/42, 83/84), on dates rather than instants,
 *      in zones whose clocks change.
 *   2. An eased weight is loadable, never above where it started, and actually reduced where
 *      the band says so; a belt's added weight rounds to a plate pair.
 *   3. The first session back never carries the increment, in any band.
 *   4. The sentences: what the card, the row and the coach's opener say, and that none of them
 *      calls a break a failure.
 *   5. The coach's opener leads with the break, above an unreviewed session and a missed day.
 *   6. Where the break is measured from: the last WORKING session before today, the pending
 *      queue included, warm-ups and drops and junk rows out, and a failed read never read as
 *      "never trained" — asked of a fake that records what it was ASKED (CLAUDE.md: a fake that
 *      ignores filters cannot see a missing filter).
 *   7. The coach is told the same sentence the card shows.
 *
 * What a test cannot prove is that the card USES any of this — that is verify:layoff.
 */
import { layoffStatus, easeWeightKg, easeAddedKg, layoffWeightFrom, easesWeights, NO_LAYOFF, type LayoffStatus } from '../src/lib/layoff'
import { breakLength, layoffCardLine, layoffLiftNote, layoffRestartOffer, welcomeBackOpener, PLAN_RESTART } from '../src/lib/coach-voice'
import { pickOpener, type OpenerInput } from '../src/lib/coach-opener'
import { buildCoachExerciseSummary } from '../src/lib/chat-plan-context'
import { getExerciseEntry } from '../src/lib/exercise-db'
import type { WorkoutDay } from '../src/lib/types'

let ran = 0
let failed = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failed++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 400)}` : ''}`) }
}
const attempt = <T,>(f: () => T): T | string => { try { return f() } catch (e) { return `threw: ${String(e)}` } }
const ymd = (base: string, n: number) => { const d = new Date(`${base}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

// ---------------------------------------------------------------------------
console.log('\n1. The bands, at every edge, on dates')
{
  const today = '2026-10-08'
  const bandAt = (days: number) => layoffStatus(ymd(today, -days), today)
  const expect: [number, LayoffStatus['band'], number][] = [
    [1, 'none', 1], [9, 'none', 1], [10, 'hold', 1], [20, 'hold', 1], [21, 'ease90', 0.9],
    [41, 'ease90', 0.9], [42, 'ease80', 0.8], [83, 'ease80', 0.8], [84, 'restart', 0.8], [400, 'restart', 0.8],
  ]
  const wrong = expect.filter(([d, band, factor]) => { const s = bandAt(d); return s.band !== band || s.factor !== factor || s.daysAway !== d })
  check('every band edge lands where the plan says (9/10, 20/21, 41/42, 83/84)', wrong.length === 0, wrong.map(([d]) => ({ d, got: bandAt(d) })))
  check('never trained: no break to come back from', layoffStatus(null, today).band === 'none')
  check('a session today or "after" today is no break', layoffStatus(today, today).band === 'none' && layoffStatus(ymd(today, 3), today).band === 'none')
  check('an unreadable date is no break, not a crash', layoffStatus('not-a-date', today).band === 'none')
  // Clock changes: 10 calendar days that hold a change are still 10 days, in each direction.
  const zoneWrong: string[] = []
  for (const zone of ['UTC', 'Europe/London', 'America/New_York', 'Australia/Sydney', 'Pacific/Auckland']) {
    process.env.TZ = zone
    for (const [last, now] of [['2026-03-22', '2026-04-01'], ['2026-10-20', '2026-10-30'], ['2026-09-27', '2026-10-07'], ['2026-03-31', '2026-04-10']]) {
      const s = layoffStatus(last, now)
      if (s.daysAway !== 10 || s.band !== 'hold') zoneWrong.push(`${zone} ${last}->${now}: ${s.daysAway} ${s.band}`)
    }
  }
  process.env.TZ = 'UTC'
  check('ten calendar days across a clock change are ten days in five zones', zoneWrong.length === 0, zoneWrong)
}

// ---------------------------------------------------------------------------
console.log('\n2. An eased weight is loadable, reduced, and never above where it started')
{
  const at = (band: LayoffStatus['band'], factor: number): LayoffStatus => ({ band, factor, daysAway: 30 })
  const ease90 = at('ease90', 0.9)
  const ease80 = at('ease80', 0.8)
  const bench = getExerciseEntry('Barbell Bench Press')
  const db = getExerciseEntry('Dumbbell Bench Press')
  check('the catalogue has the two lifts this section uses', !!bench && !!db)
  check('100kg barbell at 90% is 90kg', easeWeightKg(100, ease90, bench) === 90, easeWeightKg(100, ease90, bench))
  const odd = easeWeightKg(95, ease90, bench)
  check('95kg barbell at 90% lands on a 2.5kg step, not 85.5', odd % 2.5 === 0 && odd <= 95 && odd >= 85, odd)
  const dumb = easeWeightKg(9, ease80, db)
  check('a 9kg dumbbell at 80% lands on a 2kg dumbbell step and below 9', dumb % 2 === 0 && dumb < 9, dumb)
  check('rounding never hands back MORE than last time (bar alone stays the bar)', easeWeightKg(20, ease80, bench) === 20)
  // Every lift in a sweep of weights: loadable, never above, never below factor minus one step.
  const sweepWrong: string[] = []
  for (const entry of [bench, db]) for (let kg = 2; kg <= 200; kg += 1.5) for (const s of [ease90, ease80]) {
    const out = easeWeightKg(kg, s, entry)
    if (out > kg || out < Math.min(kg, kg * s.factor - 2.5) - 1e-9) sweepWrong.push(`${entry?.name} ${kg} ${s.band} -> ${out}`)
  }
  check('across 2-200kg, every eased weight sits between factor-minus-a-step and the original', sweepWrong.length === 0, sweepWrong.slice(0, 5))
  check('a hold band and no break leave the weight exactly alone', easeWeightKg(97.5, at('hold', 1), bench) === 97.5 && easeWeightKg(97.5, NO_LAYOFF, bench) === 97.5)
  check('bodyweight (0kg) stays 0', easeWeightKg(0, ease80, bench) === 0)
  check('a belt: +20kg at 90% is +17.5kg (one plate pair down)', easeAddedKg(20, ease90) === 17.5, easeAddedKg(20, ease90))
  check('a belt: +2.5kg at 80% comes off entirely, never negative', easeAddedKg(2.5, ease80) === 0)
  check('a belt in the hold band is unchanged', easeAddedKg(15, at('hold', 1)) === 15)
  check('only the easing bands ease', !easesWeights(at('hold', 1)) && !easesWeights(NO_LAYOFF) && easesWeights(ease90) && easesWeights(at('restart', 0.8)))
}

// ---------------------------------------------------------------------------
console.log('\n3. The first session back never carries the increment')
{
  const bench = getExerciseEntry('Barbell Bench Press')
  check('no break: the last weight passes through (the engine adds its own increment elsewhere)', layoffWeightFrom(80, NO_LAYOFF, bench) === 80)
  check('hold band: last time\'s weight, exactly', layoffWeightFrom(80, { band: 'hold', factor: 1, daysAway: 14 }, bench) === 80)
  check('ease band: eased from LAST time\'s weight', layoffWeightFrom(80, { band: 'ease90', factor: 0.9, daysAway: 25 }, bench) === 72.5)
}

// ---------------------------------------------------------------------------
console.log('\n4. The sentences')
{
  const hold: LayoffStatus = { band: 'hold', factor: 1, daysAway: 12 }
  const e90: LayoffStatus = { band: 'ease90', factor: 0.9, daysAway: 23 }
  const e80: LayoffStatus = { band: 'restart', factor: 0.8, daysAway: 95 }
  check('a break under two weeks is told in days, longer in weeks', breakLength(12) === '12 days' && breakLength(23) === '3 weeks' && breakLength(95) === '14 weeks')
  check('...the switch is AT two weeks: 13 days, then 2 weeks, and 20 days reads 3 weeks', breakLength(13) === '13 days' && breakLength(14) === '2 weeks' && breakLength(20) === '3 weeks', [breakLength(13), breakLength(14), breakLength(20)])
  check('no break: nothing on the card', layoffCardLine(NO_LAYOFF) === null)
  check('hold: the card says it repeats last time, with no increase', /repeats last time/.test(layoffCardLine(hold) ?? '') && /No increase/.test(layoffCardLine(hold) ?? ''), layoffCardLine(hold))
  check('ease: the card names the break and the percentage', /3 weeks/.test(layoffCardLine(e90) ?? '') && /90%/.test(layoffCardLine(e90) ?? ''), layoffCardLine(e90))
  check('restart band: the card says 80%', /80%/.test(layoffCardLine(e80) ?? ''))
  check('the row note names both weights when eased', layoffLiftNote(e90, 100, 90) === 'Eased to 90kg from 100kg after your break. Easy reps today; it climbs back from here.', layoffLiftNote(e90, 100, 90))
  check('the row note says held when nothing came off', /^Held at 100kg/.test(layoffLiftNote(hold, 100, 100)))
  check('a belt note carries its plus sign', /\+17\.5kg from \+20kg/.test(layoffLiftNote(e90, 20, 17.5, true)))
  check('the restart offer names week 1 and the calibration week', /week 1/.test(layoffRestartOffer(95)) && /calibration week/.test(layoffRestartOffer(95)))
  check('the restart refusal after a shorter break says why, in the break\'s length', /3 weeks/.test(PLAN_RESTART.notNow(23)) && /twelve weeks/.test(PLAN_RESTART.notNow(23)))
  const all = [layoffCardLine(hold), layoffCardLine(e90), layoffCardLine(e80), layoffLiftNote(e90, 100, 90), layoffRestartOffer(95), welcomeBackOpener(23), PLAN_RESTART.notNow(23), PLAN_RESTART.notNow(3)].join(' | ')
  check('no sentence calls a break a failure ("missed", "failed", "fell off", "slacked")', !/\b(missed|failed|fell off|slack)/i.test(all), all)
  check('no sentence promises the future ("yet")', !/\byet\b/i.test(all))
}

// ---------------------------------------------------------------------------
console.log('\n5. The coach\'s opener leads with the break')
{
  const base: OpenerInput = {
    hour: 9, cutoffHour: 13, awaitingFeel: null, missedYesterday: null, planKnown: true,
    todaySession: { focus: 'Push & Press', movements: 'Barbell Bench Press' }, todayLogged: false,
    tomorrowSession: null,
  }
  const back = pickOpener({ ...base, breakDays: 23, awaitingFeel: { date: '2026-09-15', day: 'Tuesday', isToday: false }, missedYesterday: { dayName: 'Tuesday', focus: 'Legs' } })
  check('after 23 days the opener is the welcome back, above an unreviewed session and a missed day', back.kind === 'welcome_back', back.kind)
  check('...it names the break', /3 weeks/.test(back.text), back.text)
  check('...and asks why, with an injury answer among the chips (it routes to the pain triage)', back.chips.length >= 3 && back.chips.some(c => /injur/i.test(c)), back.chips)
  check('...and it asks for attention', back.attention === true)
  check('nine days away is not a break: the ordinary openers decide', pickOpener({ ...base, breakDays: 9 }).kind !== 'welcome_back')
  check('no break given: unchanged behaviour', pickOpener({ ...base, breakDays: null }).kind !== 'welcome_back' && pickOpener(base).kind !== 'welcome_back')
}

// ---------------------------------------------------------------------------
console.log('\n6. Where the break is measured from')
{
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, String(v)) }, removeItem: (k: string) => { store.delete(k) }, clear: () => store.clear() }, configurable: true })
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })
  type Row = Record<string, unknown>
  let rows: Row[] = []
  let failNext = false
  const asked: string[] = []
  // A fake that HONOURS the filters it is given and records them, so a dropped filter is a
  // different answer, not the same one.
  const fakeFrom = (table: string) => {
    const filters: ((r: Row) => boolean)[] = []
    const chain: Record<string, unknown> = {}
    const add = (name: string, f: (r: Row) => boolean) => (col: string, v: unknown) => { asked.push(`${table}.${name}(${col},${String(v)})`); filters.push(f); void col; return chain }
    chain.select = () => chain
    chain.eq = (c: string, v: unknown) => add('eq', r => r[c] === v)(c, v)
    chain.lt = (c: string, v: unknown) => add('lt', r => String(r[c]) < String(v))(c, v)
    chain.order = () => chain
    chain.limit = () => chain
    chain.then = (resolve: (v: unknown) => void) => {
      if (failNext) { failNext = false; return resolve({ data: null, error: { message: 'network' } }) }
      const out = rows.filter(r => r.__table === table).filter(r => filters.every(f => f(r)))
        .sort((a, b) => String(b.completed_at).localeCompare(String(a.completed_at)))
      resolve({ data: out, error: null })
    }
    return chain
  }
  const { setSupabaseClient } = await import('../src/lib/supabase')
  setSupabaseClient({ from: fakeFrom } as never)
  const { getLastWorkingSessionDate } = await import('../src/lib/set-log-store')
  const row = (over: Row): Row => ({ __table: 'exercise_set_logs', user_id: 'p1', is_warmup: false, drop_index: 0, weight_kg: 60, is_bodyweight: false, reps_completed: 8, session_id: 's', completed_at: '2026-09-01T10:00:00.000Z', ...over })
  process.env.TZ = 'UTC'
  rows = [
    row({ completed_at: '2026-09-10T10:00:00.000Z' }),
    row({ completed_at: '2026-09-20T10:00:00.000Z', is_warmup: true }),     // a warm-up only: not training
    row({ completed_at: '2026-09-21T10:00:00.000Z', drop_index: 1 }),       // a drop on its own: not a session
    row({ completed_at: '2026-09-22T10:00:00.000Z', weight_kg: 0 }),        // the malformed 0kg row the store already refuses
    row({ completed_at: '2026-09-23T10:00:00.000Z', user_id: 'someone-else' }),
    row({ completed_at: '2026-10-08T07:00:00.000Z' }),                       // today: does not end the break mid-session
  ]
  const r1 = await attempt(() => getLastWorkingSessionDate('p1', '2026-10-08'))
  check('the last WORKING session before today, past warm-ups, drops, junk, other people and today', await r1 === '2026-09-10', await r1)
  check('...and it asked by person and for working sets (the filters are the privacy and the meaning)', asked.some(a => a === 'exercise_set_logs.eq(user_id,p1)') && asked.some(a => a === 'exercise_set_logs.eq(is_warmup,false)'), asked)
  // A set logged late yesterday WEST of UTC completes after UTC midnight: it is still yesterday.
  process.env.TZ = 'America/New_York'
  rows = [row({ completed_at: '2026-09-01T10:00:00.000Z' }), row({ completed_at: '2026-10-08T02:30:00.000Z' })]  // 22:30 on 7 Oct in New York
  const r2 = await getLastWorkingSessionDate('p1', '2026-10-08')
  check('a set at 22:30 last night in New York counts as last night, not as no session', r2 === '2026-10-07', r2)
  process.env.TZ = 'UTC'
  // The offline queue counts: a session yesterday that has not synced is not a break.
  rows = [row({ completed_at: '2026-08-01T10:00:00.000Z' })]
  store.set('fitplan_setlog_pending_v1', JSON.stringify([{ kind: 'upsert', set: { userId: 'p1', exerciseId: 'bench', isWarmup: false, dropIndex: 0, date: '2026-10-07', weightKg: 60, isBodyweight: false, completedAt: '2026-10-07T10:00:00.000Z' } }]))
  const pendingKey = [...store.keys()][0]
  const r3 = await getLastWorkingSessionDate('p1', '2026-10-08')
  store.clear()
  check('a session waiting in the offline queue counts (no break read off an unsynced day)', r3 === '2026-10-07', { r3, pendingKey })
  rows = []
  check('nothing at all: null (never trained), not a break', (await getLastWorkingSessionDate('p1', '2026-10-08')) === null)
  failNext = true
  const r5 = await getLastWorkingSessionDate('p1', '2026-10-08').then(v => `resolved ${v}`, () => 'threw')
  check('a failed read throws rather than answering "never trained"', r5 === 'threw', r5)
}

// ---------------------------------------------------------------------------
console.log('\n7. The coach is told what the card shows')
{
  const day: WorkoutDay = { day: 'Monday', focus: 'Push', exercises: [{ name: 'Barbell Bench Press', sets: 3, reps: '6-8', rest: '120s', suggested_load_kg: 80, suggested_load: '80kg' } as never] } as WorkoutDay
  const e90: LayoffStatus = { band: 'ease90', factor: 0.9, daysAway: 23 }
  const withBreak = buildCoachExerciseSummary({ days: [day], breakLine: layoffCardLine(e90) })
  check('the plan text carries the card\'s own sentence', withBreak.includes(layoffCardLine(e90) ?? '@@'), withBreak.slice(-300))
  check('...and tells the coach to quote the card, not the printed weights', /quotes the card/.test(withBreak))
  check('no break: the plan text is exactly as before', buildCoachExerciseSummary({ days: [day], breakLine: null }) === buildCoachExerciseSummary({ days: [day] }))
  check('an empty plan still returns exactly "" (a prompt rule keys on it)', buildCoachExerciseSummary({ days: [], breakLine: layoffCardLine(e90) }) === '')
}

console.log(`\n${ran} checks ran`)
if (failed > 0) { console.error(`\n${failed} layoff check(s) failed`); process.exit(1) }
console.log('\nAll layoff checks passed.')

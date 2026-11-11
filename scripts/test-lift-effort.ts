// ---------------------------------------------------------------------------
// HOW A LIFT FELT, AND WHAT TODAY'S WEIGHT DOES WITH IT.
//
// Ashley, 11 Nov 2026: "If it prescribed a weight and I complete it and find it
// too easy and have lots left on reserve, will it ramp up accordingly or will
// it take many weeks to get to a weight that the user actually finds
// challenging and beneficial." Measured: 12 sessions from 40 kg to a true
// 70 kg. His ruling, from three options: "One tap per lift".
//
// Two things are held here.
//   1. THE RULE (progression-engine's getDoubleProgressionRecommendation),
//      asked through the real store over a fake database that HONOURS the
//      filters it is given: the rule reads the session before the last one,
//      and a fake that hands back the same rows whatever was asked could not
//      see that.
//   2. TODAY'S WEIGHT AGAINST THE PLAN'S WEEK (cardLoadFor): a deload stays a
//      deload, the session after one does not start from the deload's weight,
//      and a session done as written follows the plan.
//
// A gate has exactly one exit, at the bottom.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail: unknown = '') => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else {
    failures++
    console.error(`  FAIL: ${name}${detail === '' ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`)
  }
}

// --- a database that answers the question it was asked ----------------------
type Row = Record<string, unknown> & { exercise_id: string; completed_at: string; is_warmup: boolean }
let rows: Row[] = []
const asked: { eq: Record<string, unknown>; lt: Record<string, unknown> }[] = []
function fakeFrom() {
  const q = { eq: {} as Record<string, unknown>, lt: {} as Record<string, unknown> }
  const api: Record<string, unknown> = {
    select: () => api,
    eq: (col: string, v: unknown) => { q.eq[col] = v; return api },
    lt: (col: string, v: unknown) => { q.lt[col] = v; return api },
    gt: () => api,
    order: () => api,
    limit: () => {
      asked.push(q)
      const out = rows
        .filter(r => Object.entries(q.eq).every(([c, v]) => r[c] === v))
        .filter(r => Object.entries(q.lt).every(([c, v]) => String(r[c]) < String(v)))
        .sort((a, b) => (a.completed_at < b.completed_at ? 1 : -1))
      return Promise.resolve({ data: out, error: null })
    },
  }
  return api
}
const { setSupabaseClient } = await import('../src/lib/supabase')
setSupabaseClient({ from: fakeFrom } as never)
const store = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v) },
  removeItem: (k: string) => { store.delete(k) },
  clear: () => store.clear(), key: () => null, length: 0,
} as Storage

const { getDoubleProgressionRecommendation, cardLoadFor, sessionEffort, findWeightStartKg } = await import('../src/lib/progression-engine')
const { EFFORT_RPE, effortFromRpe } = await import('../src/lib/lift-effort')
const { EFFORT_ASK, effortLabel, effortLine } = await import('../src/lib/coach-voice')
const { DELOAD_LOAD_FRACTION } = await import('../src/lib/load-prescription')
const { getExerciseEntry } = await import('../src/lib/exercise-db')
type Effort = 'easy' | 'right' | 'hard'

const BENCH = 'Barbell Bench Press'
/** One session of the bench on a date: sets as [kg, reps], and how it felt (kept on the LAST set, where the tap puts it). */
const session = (date: string, sets: [number, number][], felt?: Effort | null, lift = { id: 'barbell-bench-press', name: BENCH }): Row[] =>
  sets.map(([kg, reps], i) => ({
    id: `${date}-${lift.id}-${i}`, session_id: `s-${date}`, user_id: 'p1',
    exercise_id: lift.id, exercise_name: lift.name,
    set_number: i + 1, weight_kg: kg, reps_completed: reps, is_bodyweight: false,
    is_warmup: false, drop_index: 0, completed_at: `${date}T10:00:00.000Z`,
    rpe: felt && i === sets.length - 1 ? EFFORT_RPE[felt] : null,
  }))
const TODAY = '2026-09-30'
const CTX = { repRangeLow: 8, prescribedSets: 3 }
const ask = async (...sessions: Row[][]) => {
  rows = sessions.flat()
  return getDoubleProgressionRecommendation('p1', BENCH, TODAY, 10, CTX)
}
const ticked = (kg: number): [number, number][] => [[kg, 8], [kg, 8], [kg, 8]]
const topped = (kg: number): [number, number][] => [[kg, 10], [kg, 10], [kg, 10]]

console.log('\n[1] The three answers and the number each is kept as')
check('1a. each answer reads back as itself', (['easy', 'right', 'hard'] as const).every(e => effortFromRpe(EFFORT_RPE[e]) === e), EFFORT_RPE)
check('1b. six or under is too easy, nine and a half or over is too hard, between is about right',
  effortFromRpe(6) === 'easy' && effortFromRpe(6.5) === 'right' && effortFromRpe(9) === 'right' && effortFromRpe(9.5) === 'hard')
check('1c. no effort is no answer, never "about right"', effortFromRpe(null) === null && effortFromRpe(undefined) === null && effortFromRpe(NaN) === null)
check('1d. the answer is read off the LAST working set', sessionEffort(session('2026-09-20', ticked(40), 'easy') as never) === 'easy')
{
  const early = session('2026-09-20', ticked(40))
  early[0].rpe = 5
  check('1e. ...so an effort on an earlier set only is not the lift\'s answer', sessionEffort(early as never) === null)
}
check('1f. the three buttons are his words', effortLabel('easy') === 'Too easy' && effortLabel('right') === 'About right' && effortLabel('hard') === 'Too hard')

console.log('\n[2] With no answer, the rule is what it was')
{
  const held = await ask(session('2026-09-23', ticked(40)))
  check('2a. ticked through at the bottom of the range: held', held?.weightKg === 40 && held.didProgress === false && !held.findWeight, held)
  const up = await ask(session('2026-09-23', topped(40)))
  check('2b. the top of the range on every set: one step', up?.weightKg === 42.5 && up.didProgress === true, up)
  check('2c. the session it read is named', held?.lastDate === '2026-09-23', held?.lastDate)
}

console.log('\n[3] Too easy: the next session starts heavier and finds the weight')
{
  const easy = await ask(session('2026-09-23', ticked(40), 'easy'))
  check('3a. it is a find-your-weight session', easy?.findWeight === true && easy.effort === 'easy', easy)
  check('3b. it starts about 10% up, on a loadable weight (40 kg: 45 kg)', easy?.weightKg === 45, easy?.weightKg)
  check('3c. ...and more than the one step a typed top-of-range session earns', (easy?.weightKg ?? 0) > 42.5)
  check('3d. the heavier the lift, the bigger the first jump (100 kg: 110 kg)', findWeightStartKg(100, BENCH) === 110, findWeightStartKg(100, BENCH))
  check('3e. never less than one real step (a 6 kg dumbbell goes to 8: 10% of it is not a weight anyone can load)',
    !!getExerciseEntry('Dumbbell Curls') && findWeightStartKg(6, 'Dumbbell Curls') === 8, findWeightStartKg(6, 'Dumbbell Curls'))
  const easyButShort = await ask(session('2026-09-23', [[40, 8], [40, 8], [40, 6]], 'easy'))
  check('3f. "too easy" on a session that fell short of the range does not search: it holds', easyButShort?.weightKg === 40 && !easyButShort.findWeight, easyButShort)
}

console.log('\n[4] Too hard, or short of the range: hold, and down a step when it happens twice running')
{
  const hardAtTop = await ask(session('2026-09-23', topped(40), 'hard'))
  check('4a. too hard holds, even with the top of the range on every set', hardAtTop?.weightKg === 40 && hardAtTop.didProgress === false, hardAtTop)
  const twice = await ask(session('2026-09-16', ticked(40), 'hard'), session('2026-09-23', ticked(40), 'hard'))
  check('4b. too hard two sessions running at one weight: down one step', twice?.weightKg === 37.5, twice)
  const afterAStep = await ask(session('2026-09-16', ticked(37.5), 'hard'), session('2026-09-23', ticked(40), 'hard'))
  check('4c. ...but not when the weight had just gone up: that is one hard session at this weight', afterAStep?.weightKg === 40, afterAStep)
  const short = await ask(session('2026-09-23', [[40, 8], [40, 7], [40, 6]]))
  check('4d. a set under the bottom of the range holds, with no answer given', short?.weightKg === 40 && short.fellShort === true, short)
  const shortTwice = await ask(session('2026-09-16', [[40, 7], [40, 7], [40, 6]]), session('2026-09-23', [[40, 8], [40, 7], [40, 6]]))
  check('4e. short two sessions running: down one step', shortTwice?.weightKg === 37.5, shortTwice)
  const bar = await ask(session('2026-09-16', ticked(20), 'hard'), session('2026-09-23', ticked(20), 'hard'))
  check('4f. never under the empty bar', bar?.weightKg === 20, bar)
}

console.log('\n[5] About right: a step after two sessions running, so ticking alone still progresses')
{
  const once = await ask(session('2026-09-23', ticked(40), 'right'))
  check('5a. about right once: held', once?.weightKg === 40 && once.effort === 'right', once)
  const twice = await ask(session('2026-09-16', ticked(40), 'right'), session('2026-09-23', ticked(40), 'right'))
  check('5b. about right twice running at one weight, every set done: one step', twice?.weightKg === 42.5 && twice.didProgress === true, twice)
  const other = await ask(session('2026-09-16', ticked(37.5), 'right'), session('2026-09-23', ticked(40), 'right'))
  check('5c. ...not when the two sessions were at different weights', other?.weightKg === 40, other)
  const noAnswerBefore = await ask(session('2026-09-16', ticked(40)), session('2026-09-23', ticked(40), 'right'))
  check('5d. ...and not when the session before had no answer', noAnswerBefore?.weightKg === 40, noAnswerBefore)
  const asksBefore = asked.filter(a => a.lt.completed_at === '2026-09-23').length
  check('5e. the session before is asked for by its date (the fake honours the filter, so this binds)', asksBefore >= 1, asked.slice(-3))
  check('5f. every read names the person and the lift', asked.every(a => a.eq.user_id === 'p1' && a.eq.exercise_id === 'barbell-bench-press' && a.eq.is_warmup === false), asked.slice(-2))
}

console.log('\n[6] A find-your-weight session\'s result sticks')
{
  const climb: [number, number][] = [[45, 8], [55, 8], [65, 8]]
  const found = await ask(session('2026-09-16', ticked(40), 'easy'), session('2026-09-23', climb))
  check('6a. after a search that climbed 45, 55, 65 the weight is 65, not the plan\'s old number', found?.weightKg === 65 && !found.findWeight, found)
  const notASearch = await ask(session('2026-09-16', ticked(40)), session('2026-09-23', climb))
  check('6b. ...while the same climb with no "too easy" before it is still not judged (the old guard holds)', notASearch === null, notASearch)
  const stillEasy = await ask(session('2026-09-16', ticked(40), 'easy'), session('2026-09-23', climb, 'easy'))
  check('6c. still too easy at the top: search again, from the top', stillEasy?.findWeight === true && (stillEasy?.weightKg ?? 0) > 65, stillEasy)
}

console.log('\n[7] MEASURED: 40 kg to a true 70 kg, ticking the sets and tapping one answer')
{
  // Each session: start at the card's weight, go up 10% a set while it is under 70 (the search), answer "too easy"
  // while the top set is under 70 and "about right" once it is there.
  const plate = (kg: number) => Math.round(kg / 2.5) * 2.5
  const sessions: Row[][] = [session('2026-08-01', ticked(40), 'easy')]
  let n = 0
  let card = 40
  for (; n < 20; n++) {
    rows = sessions.flat()
    const rec = await getDoubleProgressionRecommendation('p1', BENCH, `2026-08-${String(10 + n).padStart(2, '0')}`, 10, CTX)
    card = rec?.weightKg ?? card
    if (card >= 70) break
    const sets: [number, number][] = [[card, 8], [Math.min(70, plate(card * 1.1)), 8], [Math.min(70, plate(card * 1.1 * 1.1)), 8]]
    sessions.push(session(`2026-08-${String(10 + n).padStart(2, '0')}`, sets, sets[2][0] >= 70 ? 'right' : 'easy'))
  }
  check(`7a. it arrives in ${n} more sessions (a literal bound: 4 or fewer; it was 12)`, n <= 4 && card >= 70, { sessions: n, card })
  // The same person, never answering and never typing reps: the old rule, for the contrast.
  rows = session('2026-08-01', ticked(40))
  const never = await getDoubleProgressionRecommendation('p1', BENCH, '2026-08-10', 10, CTX)
  check('7b. ...and with no answer and no typed reps the rule alone still holds at 40 (the plan\'s week is what moves it: section 8)', never?.weightKg === 40, never)
}

console.log('\n[8] Today\'s weight against the plan\'s own week')
{
  const rec = (over: Record<string, unknown>) => ({ weightKg: 40, lastWeightKg: 40, didProgress: false, note: 'Held', effort: null, fellShort: false, findWeight: false, lastDate: '2026-09-23', ...over }) as never
  const plan = (over: Record<string, unknown>) => ({ printedKg: 45, printedThenKg: 40, todayIsDeload: false, lastWasDeload: false, ...over })

  const followed = cardLoadFor(rec({}), plan({}), BENCH)
  check('8a. a session done as written follows the plan: held at 40 by the log, the plan says 45, the card says 45', followed.weightKg === 45 && followed.didProgress === true, followed)
  check('8b. ...and says why', /done as planned/.test(followed.note) && /45kg/.test(followed.note), followed.note)
  const under = cardLoadFor(rec({ weightKg: 35, lastWeightKg: 35 }), plan({}), BENCH)
  check('8c. a session lifted UNDER the plan stays on the log (her 14 Sep one-number ruling): 35, not 45', under.weightKg === 35, under)
  const hard = cardLoadFor(rec({ effort: 'hard' }), plan({}), BENCH)
  check('8d. too hard does not take the plan\'s step', hard.weightKg === 40, hard)
  const short = cardLoadFor(rec({ fellShort: true }), plan({}), BENCH)
  check('8e. nor does a session that fell short', short.weightKg === 40, short)
  const ahead = cardLoadFor(rec({ weightKg: 50, lastWeightKg: 47.5, didProgress: true }), plan({}), BENCH)
  check('8f. a log ahead of the plan keeps its own number', ahead.weightKg === 50, ahead)
  const unknown = cardLoadFor(rec({}), plan({ printedThenKg: undefined }), BENCH)
  check('8g. with no plan number for the last session\'s week the log stands', unknown.weightKg === 40, unknown)
  const search = cardLoadFor(rec({ weightKg: 45, findWeight: true, effort: 'easy', didProgress: true }), plan({ printedKg: 42.5 }), BENCH)
  check('8h. a find-your-weight session stays one on the card', search.weightKg === 45 && search.findWeight === true, search)

  // DELOAD WEEKS. The old card took the log's number whatever the week was.
  const deloadFollowed = cardLoadFor(rec({ weightKg: 102.5, lastWeightKg: 100, didProgress: true }), plan({ printedKg: 70, printedThenKg: 100, todayIsDeload: true }), BENCH)
  check('8i. DELOAD, plan followed to the kilo: the plan\'s own deload number, never last week\'s weight plus a step', deloadFollowed.weightKg === 70 && deloadFollowed.findWeight === false, deloadFollowed)
  const deloadOwn = cardLoadFor(rec({ weightKg: 60, lastWeightKg: 60 }), plan({ printedKg: 70, printedThenKg: 100, todayIsDeload: true }), BENCH)
  check(`8j. DELOAD, lifting under the plan: ${Math.round(DELOAD_LOAD_FRACTION * 100)}% of what was lifted (60 kg: 42.5 kg), not the plan's 70 and not 60`,
    deloadOwn.weightKg === 42.5, deloadOwn)
  const deloadHeavier = cardLoadFor(rec({ weightKg: 120, lastWeightKg: 120 }), plan({ printedKg: 70, printedThenKg: 100, todayIsDeload: true }), BENCH)
  check('8k. DELOAD, lifting over the plan: the same share of what was lifted (120 kg: 85 kg)', deloadHeavier.weightKg === 85, deloadHeavier)
  const deloadAgain = cardLoadFor(rec({ weightKg: 72.5, lastWeightKg: 70, didProgress: true }), plan({ printedKg: 70, printedThenKg: 70, todayIsDeload: true, lastWasDeload: true }), BENCH)
  check('8l. a second deload session repeats the first, and never adds a step', deloadAgain.weightKg === 70, deloadAgain)
  check('8m. a deload is never a find-your-weight session, whatever was tapped',
    cardLoadFor(rec({ weightKg: 110, lastWeightKg: 100, findWeight: true, effort: 'easy' }), plan({ printedKg: 70, printedThenKg: 100, todayIsDeload: true }), BENCH).findWeight === false)
  check('8n. a deload at the empty bar stays at the bar',
    cardLoadFor(rec({ weightKg: 20, lastWeightKg: 20 }), plan({ printedKg: 20, printedThenKg: 22.5, todayIsDeload: true }), BENCH).weightKg === 20)

  // THE SESSION AFTER A DELOAD. The old card held the deload's weight.
  const back = cardLoadFor(rec({ weightKg: 70, lastWeightKg: 70 }), plan({ printedKg: 102.5, printedThenKg: 70, lastWasDeload: true }), BENCH)
  check('8o. BACK FROM A DELOAD: this block\'s weight (102.5), not the deload\'s 70', back.weightKg === 102.5, back)
  const backCapped = cardLoadFor(rec({ weightKg: 70, lastWeightKg: 70 }), plan({ printedKg: 120, printedThenKg: 70, lastWasDeload: true }), BENCH)
  check('8p. ...never more than one step over where they were before it (100 before: 102.5, not the plan\'s 120)', backCapped.weightKg === 102.5, backCapped)
  const backUnder = cardLoadFor(rec({ weightKg: 42.5, lastWeightKg: 42.5 }), plan({ printedKg: 100, printedThenKg: 70, lastWasDeload: true }), BENCH)
  check('8q. ...so somebody lifting 60 before their deload is not handed the plan\'s 100', backUnder.weightKg <= 65 && backUnder.weightKg >= 60, backUnder)
  const backAbove = cardLoadFor(rec({ weightKg: 85, lastWeightKg: 85 }), plan({ printedKg: 100, printedThenKg: 70, lastWasDeload: true }), BENCH)
  check('8r. ...and never above the plan', backAbove.weightKg === 100, backAbove)
}

console.log('\n[9] The words say what the rule does')
{
  check('9a. the question', EFFORT_ASK === 'How did that feel?')
  const easy = await ask(session('2026-09-23', ticked(40), 'easy'))
  check('9b. "Too easy" says next time starts heavier and finds the weight, and the rule does both',
    /starts heavier/.test(effortLine('easy')) && /finds your weight/.test(effortLine('easy')) && easy?.findWeight === true && (easy?.weightKg ?? 0) > 40, effortLine('easy'))
  const hard = await ask(session('2026-09-23', topped(40), 'hard'))
  check('9c. "Too hard" says next time holds this weight, and it does', /holds this weight/.test(effortLine('hard')) && hard?.weightKg === 40, effortLine('hard'))
  const right = await ask(session('2026-09-16', ticked(40), 'right'), session('2026-09-23', ticked(40), 'right'))
  check('9d. "About right" says keeping it up raises the weight, and two running do', /Keep this up and the weight goes up/.test(effortLine('right')) && right?.weightKg === 42.5, effortLine('right'))
  check('9e. no line promises a number', (['easy', 'right', 'hard'] as const).every(e => !/\d/.test(effortLine(e))))
}

console.log('\n[10] The screen (source; the driver reads the pixels)')
{
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')
  const panel = strip(readFileSync('src/components/exercise/TodayPanel.tsx', 'utf8'))
  const grid = strip(readFileSync('src/components/exercise/SetGrid.tsx', 'utf8'))
  const row = strip(readFileSync('src/components/exercise/ExerciseRow.tsx', 'utf8'))
  const effect = panel.slice(panel.indexOf('const card = cardLoadFor('), panel.indexOf('setProgressedLoads(nextLoads)'))
  check('10a. today\'s weight goes through cardLoadFor, called, with the plan\'s week', /cardLoadFor\(load, \{/.test(panel) && /todayIsDeload: !!currentMesoWeekObj\?\.is_deload/.test(effect) && /lastWasDeload: !!thenWeek\?\.is_deload/.test(effect))
  check('10b. ...and the card takes ITS answer, not the log\'s raw one', /nextLoads\[name\] = card\.weightKg/.test(effect) && /findWeight: card\.findWeight/.test(effect))
  check('10c. the plan\'s number for the last session\'s week is looked up by that session\'s date', /planDaysForDate\(load\.lastDate, today, liveWeekPlan, mesocycle, planCreatedAt\)/.test(panel))
  check('10d. a lift that finds its weight runs the calibration search on its own row',
    /isCalibrationWeek: !!currentMesoWeekObj\?\.isCalibrationWeek \|\| findsWeight\(ex\.name\)/.test(panel) && /showCalibrationCue: calibrationAnchorIndex === exIndex \|\| findsWeight\(ex\.name\)/.test(panel))
  check('10e. ...never while weights are eased after a break', /const findsWeight = \(name: string\) => !easesWeights\(layoff\) && !!progressionNotes\[name\]\?\.findWeight/.test(panel))
  check('10f. the question is asked only where an answer can mean something: a number, no deload, no calibration week',
    /askEffort: ex\.suggested_load_kg != null && !currentMesoWeekObj\?\.is_deload && !currentMesoWeekObj\?\.isCalibrationWeek/.test(panel))
  check('10g. the row hands it to the grid', /askEffort=\{askEffort\}/.test(row))
  check('10h. the grid asks only once every prescribed working set is in', /existingLogs\.length >= totalSets && existingLogs\.length > 0/.test(grid) && /\{askEffort && lastWorkingLog && \(/.test(grid))
  check('10i. ...and keeps the answer on the last working set, as the number the rule reads', /rpe: felt === effort \? null : EFFORT_RPE\[effort\]/.test(grid) && /setNumber: lastWorkingLog\.set_number/.test(grid))
  check('10j. three buttons, each a full-height tap target, each saying which is chosen', /min-h-\[44px\] flex-1/.test(grid) && /aria-pressed=\{felt === effort\}/.test(grid))
}

console.log(`\n${ran} checks ran, ${failures} failed`)
if (failures > 0) process.exit(1)

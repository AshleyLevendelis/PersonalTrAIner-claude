/**
 * M12 (cause B), L9, M16 (PR half), L32 ("at 0kg"), 9 Oct 2026 — "what a
 * personal best is".
 *
 * The tester's first session finished on five "New PRs", all first-ever logs.
 * Home's Recent PRs listed three warm-up moves and no loaded lift, Tools said
 * "7 PRs" after two workouts, and the Home tip read "New PR this week:
 * Standing Band Hip Abduction at 0kg" — which is also what the coach was told.
 *
 * DECIDED AS A CSCS (basis in the backlog entry): a personal best is an
 * improvement on an earlier performance of the same kind. So —
 *   - a first-ever log is a BASELINE: there is nothing before it to beat;
 *   - a record is measured against the days BEFORE the session, never against
 *     the session's own earlier sets;
 *   - movement prep (the catalogue's primer tier) and cardio machines hold no
 *     record at all;
 *   - a drop and a build-up set never set one (Ashley, 19 and 17 Sep).
 * Ashley's rulings on what the record IS — most reps in one set at bodyweight,
 * added weight under a belt, the whole set for an estimated best — are
 * untouched and are held by test:bodyweight-progress.
 *
 * And one missing field fed four sentences: the record's KIND.
 */

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
// ...and with a window in place, modules that listen for `online` expect to be able to.
for (const m of ['addEventListener', 'removeEventListener'] as const) {
  if (typeof (globalThis as Record<string, unknown>)[m] !== 'function') (globalThis as Record<string, unknown>)[m] = () => {}
}

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

let failures = 0
let ran = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

const SAM = 'u-sam'
const THU = '2026-10-08'
const FRI = '2026-10-09'
const NEXT_THU = '2026-10-15'
const PRIMER = 'Standing Band Hip Abduction'

async function main() {
  const { makeFakeSupabase } = await import('../.tour-harness/fake-supabase')
  const { setSupabaseClient } = await import('../src/lib/supabase')
  const db: Record<string, Record<string, unknown>[]> = { exercise_set_logs: [] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSupabaseClient(makeFakeSupabase(db) as any)

  const pr = await import('../src/lib/pr-engine')
  const { getExerciseEntry } = await import('../src/lib/exercise-db')
  const { selectCoachTipWithKey } = await import('../src/lib/coach-tips')
  const { pickNudge } = await import('../src/lib/coach-nudge')
  const { recordPhrase, FIRST_LOG_NOTE } = await import('../src/lib/coach-voice')
  const { pickRecentPRs, leadLiftPhrase, LIFT_SHORT_NAME } = await import('../src/lib/dashboard-data')

  let n = 0
  const row = (name: string, date: string, o: Record<string, unknown> = {}) => ({
    id: `r${++n}`, user_id: SAM, date, exercise_name: name, exercise_id: name.toLowerCase().replace(/\s+/g, '-'),
    set_number: 1, weight_kg: 0, reps_completed: 8, is_bodyweight: false, is_warmup: false, drop_index: 0,
    added_load_kg: null, completed_at: `${date}T18:00:00`, ...o,
  })
  const asLog = (r: Record<string, unknown>) => r as never

  // The tester's Thursday: five movements, none ever logged before.
  const thursday = [
    row(PRIMER, THU, { is_bodyweight: true, reps_completed: 12 }),
    row('Romanian Deadlifts', THU, { weight_kg: 30, set_number: 1 }),
    row('Romanian Deadlifts', THU, { weight_kg: 32.5, set_number: 2 }),
    row('Dumbbell Floor Press', THU, { weight_kg: 14 }),
    row('Goblet Squats', THU, { weight_kg: 16 }),
    row('Push-Ups', THU, { is_bodyweight: true, reps_completed: 10 }),
  ]

  // -------------------------------------------------------------------------
  console.log('\n[1] the fixture is what it says it is')
  check(`"${PRIMER}" is movement prep in the catalogue`, getExerciseEntry(PRIMER)?.mechanics_tier === 'primer', getExerciseEntry(PRIMER)?.mechanics_tier)
  check('the four lifts are in the catalogue and are not', ['Romanian Deadlifts', 'Dumbbell Floor Press', 'Goblet Squats', 'Push-Ups'].every(x => { const t = getExerciseEntry(x)?.mechanics_tier; return !!t && t !== 'primer' && t !== 'cardio' }),
    ['Romanian Deadlifts', 'Dumbbell Floor Press', 'Goblet Squats', 'Push-Ups'].map(x => getExerciseEntry(x)?.mechanics_tier ?? null))
  check('movement prep holds no record; a lift does; so does a name the catalogue has never heard of',
    pr.canHoldRecord(PRIMER) === false && pr.canHoldRecord('Romanian Deadlifts') === true && pr.canHoldRecord('Zercher Carry I Made Up') === true)

  // -------------------------------------------------------------------------
  console.log('\n[2] THE FIRST SESSION — five first-ever logs')
  await pr.refreshPRCacheFromDB(SAM)
  check('before anything is logged: nothing is a first log the app could not have known about... but an empty history IS known', pr.isPRCacheLoaded(SAM) === true)
  check('the first set of a lift is where its record starts', pr.isFirstTimeLogged(SAM, 'Romanian Deadlifts', THU) === true)
  check('...and is NOT a personal best', pr.checkForPR(SAM, 'Romanian Deadlifts', { weightKg: 30, reps: 8, isBodyweight: false }, THU) === null)
  db.exercise_set_logs.push(row('Romanian Deadlifts', THU, { weight_kg: 30, set_number: 1 }))
  await pr.refreshPRCacheFromDB(SAM)
  // THE CASE A LIVE CACHE GETS WRONG: set 1 is in the cache now.
  check('THE SECOND, HEAVIER SET OF THAT SAME FIRST SESSION IS NOT ONE EITHER — a session is not its own baseline',
    pr.checkForPR(SAM, 'Romanian Deadlifts', { weightKg: 32.5, reps: 8, isBodyweight: false }, THU) === null)
  check('...and it is still the first time this lift has been logged', pr.isFirstTimeLogged(SAM, 'Romanian Deadlifts', THU) === true)
  db.exercise_set_logs.length = 0
  db.exercise_set_logs.push(...thursday)
  await pr.refreshPRCacheFromDB(SAM)
  const top = pr.getTopPRSet(SAM, 'Romanian Deadlifts', pr.toSessionSets(thursday.filter(r => r.exercise_name === 'Romanian Deadlifts').map(asLog)), THU)
  check('no row of the session gets a trophy', top === null, top)
  const finishCard = pr.computeSessionPRs(pr.getPRBaseline(SAM, THU), thursday.map(asLog))
  check('THE FINISH CARD LISTS NO NEW PRs (it listed five)', finishCard.length === 0, finishCard.map(h => h.exerciseName))
  check('nothing has been beaten yet, so "N PRs" is 0 (it was the number of exercises logged)', pr.getRecordsBeaten(SAM).length === 0, pr.getRecordsBeaten(SAM))
  check('Home has no "Recent PRs" to list', pickRecentPRs(pr.getRecordsBeaten(SAM), THU).length === 0)
  check('movement prep is not in the records at all', !(PRIMER in pr.getPRCache(SAM)) && Object.keys(pr.getPRCache(SAM)).length === 4, Object.keys(pr.getPRCache(SAM)))
  check('...and its first log is not announced as a baseline every session', pr.isFirstTimeLogged(SAM, PRIMER, THU) === false)

  // -------------------------------------------------------------------------
  console.log('\n[3] THE NEXT SESSIONS — a record needs an earlier one, and has to beat it')
  check('the day after, the deadlift is no longer a first log', pr.isFirstTimeLogged(SAM, 'Romanian Deadlifts', FRI) === false)
  check('repeating last week\'s best is not a personal best', pr.checkForPR(SAM, 'Romanian Deadlifts', { weightKg: 32.5, reps: 8, isBodyweight: false }, NEXT_THU) === null)
  const beat = pr.checkForPR(SAM, 'Romanian Deadlifts', { weightKg: 35, reps: 8, isBodyweight: false }, NEXT_THU)
  check('beating it is', beat?.metric === 'load' && beat.newWeight === 35 && beat.previousWeight === 32.5, beat)
  const nextWeek = [
    row(PRIMER, NEXT_THU, { is_bodyweight: true, reps_completed: 20 }),
    row('Romanian Deadlifts', NEXT_THU, { weight_kg: 35 }),
    row('Dumbbell Floor Press', NEXT_THU, { weight_kg: 14 }),
    row('Goblet Squats', NEXT_THU, { weight_kg: 16, reps_completed: 6 }),
    row('Push-Ups', NEXT_THU, { is_bodyweight: true, reps_completed: 13 }),
    row('Dumbbell Floor Press', NEXT_THU, { weight_kg: 40, reps_completed: 20, drop_index: 1 }),
    row('Barbell Bench Press', NEXT_THU, { weight_kg: 50 }),
  ]
  const card2 = pr.computeSessionPRs(pr.getPRBaseline(SAM, NEXT_THU), nextWeek.map(asLog)).map(h => h.exerciseName).sort()
  check('the second week\'s card lists the two lifts that improved, and only those', card2.join() === 'Push-Ups,Romanian Deadlifts', card2)
  check('...not the warm-up move, which did 20 reps where it had done 12', !card2.includes(PRIMER))
  check('...not a drop, however heavy', !card2.includes('Dumbbell Floor Press'))
  check('...and not the bench, logged for the first time that day', !card2.includes('Barbell Bench Press'))
  // What an empty baseline does now: the old failure was EVERY lift.
  check('a card handed no baseline at all lists nothing, never everything', pr.computeSessionPRs({}, nextWeek.map(asLog)).length === 0)

  db.exercise_set_logs.push(...nextWeek)
  await pr.refreshPRCacheFromDB(SAM)
  const beaten = pr.getRecordsBeaten(SAM)
  check('two records have been beaten, ever', beaten.length === 2, beaten)
  check('each says what kind it is and what it beat',
    beaten.some(b => b.exerciseName === 'Romanian Deadlifts' && b.metric === 'load' && b.value === 35 && b.previous === 32.5)
    && beaten.some(b => b.exerciseName === 'Push-Ups' && b.metric === 'reps' && b.value === 13 && b.previous === 10), beaten)

  // -------------------------------------------------------------------------
  console.log('\n[4] HOME\'S "RECENT PRs" — a loaded lift first, never a warm-up move')
  const recent = pickRecentPRs(beaten, NEXT_THU)
  check('both are listed', recent.length === 2, recent)
  check('THE LOADED LIFT LEADS, though the press-ups improved by more (30% against 8%)', recent[0]?.exerciseName === 'Romanian Deadlifts' && recent[1]?.exerciseName === 'Push-Ups', recent)
  check('each carries its kind, and there is no bare weight to print', recent.every(r => !!r.metric && r.value > 0 && !('weightKg' in r)), recent)
  check('a record from more than a week ago is not recent', pickRecentPRs(beaten, '2026-10-30').length === 0)
  const twoLoaded = pickRecentPRs([
    { exerciseName: 'A', metric: 'load', value: 105, previous: 100, date: NEXT_THU },
    { exerciseName: 'B', metric: 'load', value: 60, previous: 50, date: THU },
    { exerciseName: 'B', metric: 'reps', value: 30, previous: 10, date: NEXT_THU },
  ], NEXT_THU)
  check('between two loaded lifts, the bigger improvement leads', twoLoaded[0]?.exerciseName === 'B', twoLoaded)
  check('...and a lift is listed once, by its loaded record', twoLoaded.length === 2 && twoLoaded[0]?.metric === 'load' && twoLoaded[0]?.value === 60, twoLoaded)

  // -------------------------------------------------------------------------
  console.log('\n[5] ONE MISSING FIELD, FOUR SENTENCES — a reps record never reads "at 0kg"')
  const repsRecord = { exerciseName: 'Push-Ups', metric: 'reps' as const, value: 13, date: NEXT_THU }
  check('the phrase carries the unit of its kind', recordPhrase(repsRecord) === 'Push-Ups at 13 reps'
    && recordPhrase({ exerciseName: 'Romanian Deadlifts', metric: 'load', value: 35 }) === 'Romanian Deadlifts at 35kg'
    && recordPhrase({ exerciseName: 'Chin-Up', metric: 'added_load', value: 10 }) === 'Chin-Up at +10kg', recordPhrase(repsRecord))
  const tipCtx = {
    today: NEXT_THU, proteinAdherenceStreakDays: 0, knownLiftProgress: [], sessionsThisWeekSoFar: 0, sessionsLastWeekSameSpan: 0,
    scheduledSoFarThisWeek: 0, loggedOfScheduledSoFarThisWeek: 0, weightTrend: null, recentPRs: [repsRecord],
    waterMl: 0, waterTargetMl: 0, hourOfDay: 9,
  }
  const tip = selectCoachTipWithKey(tipCtx as never)
  check('1. the Home tip', tip?.text === 'New PR this week: Push-Ups at 13 reps.', tip)
  const nudgeBase = {
    today: NEXT_THU, planKnown: true, awaitingFeel: null, missedYesterday: null, recentPR: repsRecord, streak: 2,
    todaySession: null, todayLogged: true,
  }
  const said = pickNudge(nudgeBase as never, [])
  check('2. the coach\'s own nudge', said?.kind === 'personal_best' && said.text === "That's a PR — Push-Ups at 13 reps, the best you've logged on it.", said?.text)
  const folded = pickNudge({ ...nudgeBase, awaitingFeel: { date: NEXT_THU, day: 'Thursday', isToday: true } } as never, [])
  check('3. ...and the one folded into "how did it feel?"', /^Nice PR on Push-Ups at 13 reps\. /.test(folded?.text ?? ''), folded?.text)
  const chat = strip(read('src/components/ChatAssistant.tsx'))
  const summary = /recent_prs_summary:[\s\S]{0,260}/.exec(chat)?.[0] ?? ''
  check('4. the text handed to the coach is built by the same phrase', /recordPhrase\(pr\)/.test(summary) && !/weightKg/.test(summary), summary.slice(0, 200))
  for (const line of [tip?.text, said?.text, folded?.text]) check(`   no "0kg" and no "kg" at all in: ${line}`, !!line && !/kg/.test(line))
  // The general form: nobody outside the phrasebook glues a weight field to "kg" in a sentence about a record.
  const offenders: string[] = []
  const walk = (dir: string) => {
    for (const f of readdirSync(join(ROOT, dir))) {
      const rel = `${dir}/${f}`
      if (statSync(join(ROOT, rel)).isDirectory()) { walk(rel); continue }
      if (!/\.(ts|tsx)$/.test(f) || rel === 'src/lib/coach-voice.ts') continue
      if (/(recentPR|recentPRs\b[^\n]{0,80}|\bpr)\.weightKg\}\s?kg/.test(strip(read(rel)))) offenders.push(rel)
    }
  }
  walk('src')
  check('no sentence anywhere prints a record\'s `weightKg` beside "kg"', offenders.length === 0, offenders)
  check('...and that search would notice one', /(recentPR|recentPRs\b[^\n]{0,80}|\bpr)\.weightKg\}\s?kg/.test('`at ${pr.weightKg}kg.`'))

  // -------------------------------------------------------------------------
  console.log('\n[6] THE FIRST-LOG LINE, and Home\'s lift line')
  check('a first log says one quiet thing', FIRST_LOG_NOTE === 'First time logged — this is your baseline')
  const grid = strip(read('src/components/exercise/SetGrid.tsx'))
  check('the set grid asks the engine whether this is a first log, for the session\'s day', /isFirstTimeLogged\(profileId, exerciseName, today\)/.test(grid))
  check('...and both badge paths compare against the record before that day', /checkForPR\(profileId, exerciseName, \{[\s\S]{0,160}\}, today\)/.test(grid) && /getTopPRSet\(profileId, exerciseName, toSessionSets\(projectedLogs\), today\)/.test(grid))

  const missing = Object.keys(LIFT_SHORT_NAME).filter(k => !getExerciseEntry(k))
  check('every short-name key is an exercise the catalogue has (three of eight matched nothing)', missing.length === 0 && Object.keys(LIFT_SHORT_NAME).length >= 5, missing)
  const rdl = { name: 'Romanian Deadlifts', kg: 16, labelMode: 'per_hand' as const, loggedKg: null as number | null }
  check('before training: the plan\'s figure, with its unit', leadLiftPhrase(rdl, 'not_started') === 'RDL from ~16kg per hand', leadLiftPhrase(rdl, 'not_started'))
  check('ONCE IT HAS BEEN LIFTED: WHAT WAS LIFTED ("from 16 kg" stood there after 30 was logged)', leadLiftPhrase({ ...rdl, loggedKg: 30 }, 'done') === 'RDL 30kg per hand today', leadLiftPhrase({ ...rdl, loggedKg: 30 }, 'done'))
  check('...mid-session too', leadLiftPhrase({ ...rdl, loggedKg: 30 }, 'in_progress') === 'RDL 30kg per hand today')
  check('a finished session that never logged it does not quote the plan', leadLiftPhrase(rdl, 'done') === null)
  check('mid-session and not yet lifted: the plan\'s figure, no "from", no "next"', leadLiftPhrase(rdl, 'in_progress') === 'RDL ~16kg per hand')
  const other = leadLiftPhrase({ name: 'Bulgarian Split Squats', kg: 12, labelMode: 'per_hand', loggedKg: null }, 'not_started')
  check('a lift with no short name reads as the catalogue writes it, never lower-cased', other === 'Bulgarian Split Squats from ~12kg per hand', other)
  check('a bar is a plain weight', leadLiftPhrase({ name: 'Barbell Squats', kg: 60, labelMode: 'total', loggedKg: null }, 'not_started') === 'Squat from ~60kg')
  const home = strip(read('src/components/Dashboard.tsx'))
  check('Home builds the line with that one function', (home.match(/leadLiftPhrase\(/g) ?? []).length === 2 && !/\.kg\} kg/.test(home) && !/toLowerCase\(\)/.test(/glanceParts[\s\S]{0,1400}/.exec(home)?.[0] ?? ''))

  console.log(`\n${ran} checks ran. ${failures === 0 ? 'All passed.' : `${failures} FAILED.`}`)
  if (failures > 0) process.exit(1)
}

main().catch(e => { console.error(e); process.exit(1) })

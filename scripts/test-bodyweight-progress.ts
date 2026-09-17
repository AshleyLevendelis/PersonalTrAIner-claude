// ---------------------------------------------------------------------------
// PROGRESS WHEN THERE IS NO WEIGHT ON THE BAR.
//
// "Progress is visible — history, PRs, weight trend, streak" is one of the
// three promises. It was failing completely for anyone training without kit:
// no personal best, ever, and a permanently empty strength graph. Going from
// 5 chin-ups to 15 registered nowhere in the app.
//
// SIX INDEPENDENT EXCLUSIONS did it, and that is why this file exists rather
// than a one-line assertion. Each sat in different code; fixing any one alone
// would have changed nothing a person could see, so each is named and checked
// on its own:
//
//   1. refreshPRCacheFromDB's query said `.gt('weight_kg', 0)` — excluded in
//      the DATABASE, before any logic ran
//   2. checkForPR opened `if (weight <= 0 || reps <= 0) return null`
//   3. getTopPRSet did `if (s.weight <= 0 || s.reps <= 0) continue`
//   4. computeSessionPRs did `if (log.is_bodyweight) continue`
//   5. groupSetsBySession did `if (s.isBodyweight) continue`
//   6. SetGrid's private toSessionSets filtered `l.weight_kg > 0`
//
// ASHLEY'S RULING, 16 Sep 2026, from three options: the record at bodyweight
// is MOST REPS IN ONE SET. Not session-total reps (an easy high-volume day
// would beat a hard one, so the app would congratulate someone for going
// easier) and not bodyweight converted to an estimated load (one tidy line,
// but the factors are numbers the app would INVENT and then show as if
// measured). Once a belt goes on, ADDED WEIGHT is the record, and the reps
// best stays as the best-without-weight.
//
// THIS FILE CALLS THE ENGINE. It does not read it. The one exception is §1,
// which is about a string sent to a database this machine cannot reach —
// and it is marked as the source check it is rather than passed off as
// evidence of behaviour.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  prMetricFor, checkForPR, getTopPRSet, computeSessionPRs, toSessionSets,
  EMPTY_PR_RECORD, type PRRecord, type SetShape, type SessionSet,
} from '../src/lib/pr-engine'
import {
  groupSetsBySession, derivePRHistory, deriveStrengthTrend, hasEnoughTrendData, trendLabel,
} from '../src/lib/exercise-history'
import { personalBest } from '../src/lib/coach-voice'
import type { ExerciseSetLog } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

// A user id nothing has cached against, so getPRCache returns {} and the
// engine falls through to EMPTY_PR_RECORD. That is the real first-ever-set
// path, not a stub.
const FRESH = 'gate-user-no-cache'

const bw = (reps: number): SetShape => ({ weightKg: 0, reps, isBodyweight: true, addedLoadKg: null })
const belt = (kg: number, reps: number): SetShape => ({ weightKg: 0, reps, isBodyweight: true, addedLoadKg: kg })
const barbell = (kg: number, reps: number): SetShape => ({ weightKg: kg, reps, isBodyweight: false, addedLoadKg: null })

/**
 * SessionSet spells the load `weight`, SetShape spells it `weightKg`. The
 * first version of §4 passed SetShape objects straight into getTopPRSet, so
 * `s.weight` was undefined inside it — and the section PASSED, for the wrong
 * reason: prMetricFor answers 'reps' before it ever looks at the load.
 * Mutation 5 (restoring `s.weight <= 0` as a skip) read as MISSED, because
 * `undefined <= 0` is false and the restored bug could not bite the fixture.
 *
 * `npx tsc --noEmit` did not catch it: tsconfig.json is include: ["src"], so
 * nothing type-checks scripts/. A gate's fixtures get no compiler help, which
 * makes "the mutation had nothing to bite on" the failure mode to look for
 * first when a MISSED makes no sense.
 */
const asSessionSet = (set: SetShape, setNumber: number): SessionSet =>
  ({ setNumber, weight: set.weightKg, reps: set.reps, isBodyweight: set.isBodyweight, addedLoadKg: set.addedLoadKg })

console.log('\n1. The database query does not exclude bodyweight before logic can see it')
{
  // SOURCE CHECK, DELIBERATELY — and said out loud, because CLAUDE.md is
  // explicit that a source read is not proof of behaviour. This one is about
  // the text of a query sent to a database no cloud session can reach, so
  // there is nothing to call. Everything else in this file calls.
  const src = readFileSync(join(ROOT, 'src/lib/pr-engine.ts'), 'utf8')
  const body = src.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')
  const query = /\.from\('exercise_set_logs'\)([\s\S]*?)\n\n/.exec(body)?.[1] ?? ''
  check('the PR query was found at all (so the checks below are not vacuous)', query.length > 0, query.slice(0, 80))
  check('...and it does not filter on weight_kg', !/\.(gt|gte|neq)\('weight_kg'/.test(query), query)
  check('...and it still requires reps, because a set with no reps is not a set',
    /\.gt\('reps_completed', 0\)/.test(query), query)
  check('...and it asks for the two columns the decision needs',
    /is_bodyweight/.test(query) && /added_load_kg/.test(query), query)
}

console.log('\n2. The classifier picks the right record for each kind of set')
{
  check('a bodyweight set competes on reps', prMetricFor(bw(10)) === 'reps')
  check('a belt set competes on added weight', prMetricFor(belt(15, 5)) === 'added_load')
  check('a loaded set competes on load, unchanged', prMetricFor(barbell(60, 5)) === 'load')
  // Ashley's ruling: the belt outranks bodyweight. A weighted chin-up is not
  // a rep record with an asterisk, it is its own lift.
  check('a belt beats bodyweight when a row is both', prMetricFor(belt(15, 5)) === 'added_load')
  check('no reps means no record', prMetricFor(bw(0)) === null)
  check('a zero-weight non-bodyweight row is malformed, not a record',
    prMetricFor({ weightKg: 0, reps: 8, isBodyweight: false, addedLoadKg: null }) === null)
}

console.log('\n3. The live badge fires on a bodyweight set (exclusion 2)')
{
  const first = checkForPR(FRESH, 'Chin-Up', bw(8))
  check('a first-ever bodyweight set is a PR', first !== null && first.metric === 'reps', first)
  check('...and it carries the reps, not a weight', first?.newReps === 8 && first?.newWeight === 0, first)

  // THE TWO CHECKS THAT STOOD HERE WERE TAUTOLOGIES — `13 > existing.maxReps`
  // is arithmetic this file performed itself, not a question asked of the
  // engine, so they would have printed a tick with the comparison deleted.
  // The engine's own cache cannot be seeded without a database, but
  // computeSessionPRs takes its baseline as an argument, so §5 asks the same
  // question of real code. Left as a note rather than silently removed,
  // because the shape is the one CLAUDE.md warns about: asking a question of
  // evidence you just created.

  const loaded = checkForPR(FRESH, 'Back Squat', barbell(60, 5))
  check('a loaded set still behaves exactly as before', loaded?.metric === 'load' && loaded.newWeight === 60, loaded)
}

console.log('\n4. The top-set badge lands on the right row (exclusion 3)')
{
  const sets = [bw(6), bw(11), bw(9)].map((set, i) => asSessionSet(set, i + 1))
  check('the fixture really carries a zero LOAD, so a restored weight guard can bite it',
    sets.every(s => s.weight === 0 && s.reps > 0), sets)
  const top = getTopPRSet(FRESH, 'Press-Up', sets)
  check('the best bodyweight set in a session is found', top?.setNumber === 2, top)
  check('...and it is a reps record', top?.result.metric === 'reps' && top?.result.newReps === 11, top?.result)

  // A belt mid-session: it wins on its own terms, not by being a bigger
  // number. 15 (kg) < 20 (reps) numerically, and the belt still takes it.
  const mixed = [asSessionSet(bw(20), 1), asSessionSet(belt(15, 3), 2)]
  const topMixed = getTopPRSet(FRESH, 'Chin-Up', mixed)
  check('a belt set outranks a bigger rep count', topMixed?.setNumber === 2, topMixed)
  check('...and is reported as added weight', topMixed?.result.metric === 'added_load', topMixed?.result)
}

console.log('\n5. The end-of-session list includes bodyweight work (exclusion 4)')
{
  const log = (o: Partial<ExerciseSetLog>): ExerciseSetLog => ({
    user_id: FRESH, date: '2026-09-16', exercise_name: 'Press-Up', set_number: 1,
    weight_kg: 0, reps_completed: 0, is_bodyweight: true, ...o,
  })
  const hits = computeSessionPRs({}, [
    log({ set_number: 1, reps_completed: 14 }),
    log({ set_number: 2, reps_completed: 9 }),
  ])
  check('a bodyweight session produces a PR hit', hits.length === 1, hits)
  check('...on the best set, in reps', hits[0]?.result.newReps === 14 && hits[0]?.result.metric === 'reps', hits[0])

  const warmupOnly = computeSessionPRs({}, [log({ reps_completed: 20, is_warmup: true })])
  check('a warm-up is still not a PR', warmupOnly.length === 0, warmupOnly)

  const beaten = computeSessionPRs({ 'Press-Up': { ...EMPTY_PR_RECORD, maxReps: 20 } }, [log({ reps_completed: 14 })])
  check('a set below the existing best is not a PR', beaten.length === 0, beaten)

  // EQUAL IS NOT BETTER — asked of the engine, against a baseline it was
  // handed, rather than computed here and compared with itself.
  const matched = computeSessionPRs({ 'Press-Up': { ...EMPTY_PR_RECORD, maxReps: 14 } }, [log({ reps_completed: 14 })])
  check('matching the existing best is not a PR either', matched.length === 0, matched)
  const beat = computeSessionPRs({ 'Press-Up': { ...EMPTY_PR_RECORD, maxReps: 14 } }, [log({ reps_completed: 15 })])
  check('...and one more rep than it IS', beat.length === 1 && beat[0]?.result.newReps === 15, beat)

  // The same three for a belt, which has its own running max.
  const beltBaseline: Record<string, PRRecord> = { Dip: { ...EMPTY_PR_RECORD, maxAddedLoad: 15 } }
  const beltLog = (kg: number) => log({ exercise_name: 'Dip', reps_completed: 5, added_load_kg: kg })
  check('a lighter belt is not a PR', computeSessionPRs(beltBaseline, [beltLog(10)]).length === 0)
  check('the same belt is not a PR', computeSessionPRs(beltBaseline, [beltLog(15)]).length === 0)
  check('a heavier belt is', computeSessionPRs(beltBaseline, [beltLog(20)])[0]?.result.newAddedLoadKg === 20)
}

console.log('\n6. The history keeps bodyweight sessions (exclusion 5)')
{
  const row = (o: Record<string, unknown>) => ({
    session_id: 's1', date: '2026-09-10', set_number: 1, weight_kg: 0,
    reps_completed: 0, rpe: null, is_bodyweight: true, ...o,
  }) as Parameters<typeof groupSetsBySession>[0][number]

  const grouped = groupSetsBySession([
    row({ session_id: 'a', date: '2026-09-10', set_number: 1, reps_completed: 8 }),
    row({ session_id: 'a', date: '2026-09-10', set_number: 2, reps_completed: 11 }),
  ])
  check('the session survives grouping at all', grouped.length === 1, grouped.length)
  check('...with the top set in reps', grouped[0]?.topSetReps === 11, grouped[0])
  // The two fields block-review.ts reads must keep meaning EXTERNAL load, or
  // its own progression rule silently changes underneath it.
  check('...and topSetWeightKg stays 0, which block-review depends on',
    grouped[0]?.topSetWeightKg === 0 && grouped[0]?.topSetE1RM === 0, grouped[0])

  const belted = groupSetsBySession([row({ session_id: 'b', reps_completed: 5, added_load_kg: 20 })])
  check('a belt session records the belt', belted[0]?.topSetAddedLoadKg === 20, belted[0])
  check('...and does NOT also claim a reps record', belted[0]?.topSetReps === 0, belted[0])
}

console.log('\n7. The graph draws, and says what it is drawing')
{
  const sessions = [
    { sessionId: 'a', date: '2026-09-01', sets: [], topSetWeightKg: 0, topSetE1RM: 0, topSetReps: 6, topSetAddedLoadKg: 0 },
    { sessionId: 'b', date: '2026-09-08', sets: [], topSetWeightKg: 0, topSetE1RM: 0, topSetReps: 9, topSetAddedLoadKg: 0 },
    { sessionId: 'c', date: '2026-09-15', sets: [], topSetWeightKg: 0, topSetE1RM: 0, topSetReps: 12, topSetAddedLoadKg: 0 },
  ]
  const series = deriveStrengthTrend(sessions)
  check('a bodyweight history is a reps series', series.metric === 'reps', series.metric)
  check('...with every session on it', series.points.length === 3, series.points.length)
  check('...plotting the reps, not a zero', series.points.map(p => p.value).join(',') === '6,9,12',
    series.points.map(p => p.value))
  check('...oldest first, so the line reads left to right',
    series.points[0]?.date === '2026-09-01', series.points.map(p => p.date))
  check('...and the graph is no longer captioned "Strength trend"',
    trendLabel(series.metric) === 'Best set, in reps', trendLabel(series.metric))
  check('a loaded history is still captioned "Strength trend"', trendLabel('load') === 'Strength trend')
  check('two points is still the honest floor', hasEnoughTrendData(series) && !hasEnoughTrendData({ metric: 'reps', points: series.points.slice(0, 1) }))

  // ONE SERIES, ONE UNIT. Once a belt goes on, the line is about the belt —
  // 12 reps and 12 kg cannot share an axis.
  const thenBelt = deriveStrengthTrend([...sessions,
    { sessionId: 'd', date: '2026-09-22', sets: [], topSetWeightKg: 0, topSetE1RM: 0, topSetReps: 0, topSetAddedLoadKg: 10 }])
  check('a belt changes what the line is about', thenBelt.metric === 'added_load', thenBelt.metric)
  check('...and the reps sessions are not plotted on the belt axis', thenBelt.points.length === 1, thenBelt.points)

  check('no sessions at all is an honest nothing', deriveStrengthTrend([]).metric === null)
}

console.log('\n8. The PR list records the moment it happened')
{
  const s = (date: string, reps: number) =>
    ({ sessionId: date, date, sets: [], topSetWeightKg: 0, topSetE1RM: 0, topSetReps: reps, topSetAddedLoadKg: 0 })
  const moments = derivePRHistory([s('2026-09-01', 6), s('2026-09-08', 5), s('2026-09-15', 9)])
  check('two reps PRs from three sessions', moments.length === 2, moments)
  check('...newest first', moments[0]?.date === '2026-09-15', moments.map(m => m.date))
  check('...the middle session did not beat anything', !moments.some(m => m.date === '2026-09-08'), moments)
  check('...and each carries its metric so a reader cannot assume kilograms',
    moments.every(m => m.metric === 'reps' && m.reps > 0 && m.weightKg === 0), moments)
}

console.log('\n9. Rows reach the engine with what it needs to decide (exclusion 6)')
{
  const logs: ExerciseSetLog[] = [
    { user_id: FRESH, date: '2026-09-16', exercise_name: 'Dip', set_number: 1, weight_kg: 0, reps_completed: 10, is_bodyweight: true },
    { user_id: FRESH, date: '2026-09-16', exercise_name: 'Dip', set_number: 2, weight_kg: 0, reps_completed: 5, is_bodyweight: true, added_load_kg: 12 },
    { user_id: FRESH, date: '2026-09-16', exercise_name: 'Dip', set_number: 3, weight_kg: 0, reps_completed: 0, is_bodyweight: true },
  ]
  const converted = toSessionSets(logs)
  check('bodyweight rows are not filtered out on the way in', converted.length === 2, converted.length)
  check('...the bodyweight flag travels with them', converted[0]?.isBodyweight === true, converted[0])
  check('...so does the belt', converted[1]?.addedLoadKg === 12, converted[1])
  check('...and a no-rep row still does not', !converted.some(c => c.reps === 0), converted)
}

console.log('\n10. A number never reaches the screen without its unit')
{
  check('reps read as reps', personalBest('reps', 12) === '12 reps')
  check('added weight reads as added', personalBest('added_load', 15) === '+15kg')
  check('a loaded best is unchanged', personalBest('load', 60) === '60kg')
  // The defect this prevents, stated as a check: the old renderers printed
  // `${value}kg` with no branch, so 12 reps would have read "12kg".
  check('...and no reading of a reps best contains "kg" alone',
    !/^\d+kg$/.test(personalBest('reps', 12)), personalBest('reps', 12))

  // PROVING THE DETECTOR, so this section cannot go vacuous if personalBest
  // is later reduced to a passthrough: the three readings must DIFFER.
  const readings = new Set([personalBest('reps', 12), personalBest('added_load', 12), personalBest('load', 12)])
  check('the same number reads three different ways', readings.size === 3, [...readings])
}

console.log(failures === 0 ? '\nAll bodyweight-progress checks passed.\n' : `\n${failures} check(s) FAILED.\n`)
process.exit(failures === 0 ? 0 : 1)

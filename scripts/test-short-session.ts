// ---------------------------------------------------------------------------
// The 20-30 minute session setting (15 Nov 2026, the coeliac nurse: "I only have 20 minutes", and the shortest
// setting was 30-45). CSCS, mine: the main lift and two accessories, an upper push and pull paired as a superset,
// the goal's conditioning as its own session rather than on top, and a day still over 30 minutes with rest at its
// floor gives up a set (never below two) rather than rest or a movement pattern. One exit: the count of failures.
// ---------------------------------------------------------------------------
import { readFileSync } from 'node:fs'
import { trimShortSessionSets, buildSupersetPairs } from '../src/lib/exercise-plan'
import { DURATION_BUDGET_SECONDS, SESSION_MINIMUM_SECONDS, SESSION_MAXIMUM_SECONDS, STEADY_STATE_SECONDS, estimateDaySeconds } from '../src/lib/session-duration'
import { SESSION_BAND_MINUTES } from '../src/lib/onboarding-capture'
import { DURATION_OPTIONS } from '../src/lib/onboarding-slots'
import { scorePlan } from '../src/lib/quality-score'
import { getExerciseEntry } from '../src/lib/exercise-db'
import { shortProfile, planFor, daysFor, workingOf, GOALS, EXP, EQUIP } from './measure-short-sessions'
import type { WorkoutDay, Exercise } from '../src/lib/types'

let ran = 0, failed = 0
const ok = (c: boolean, m: string, d?: unknown) => { ran++; if (c) console.log(`  ok: ${m}`); else { failed++; console.log(`  FAIL: ${m}${d !== undefined ? ` — ${JSON.stringify(d).slice(0, 300)}` : ''}`) } }
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

console.log('§1 The setting exists everywhere a length is chosen')
ok(DURATION_OPTIONS[0]?.value === '20-30' && DURATION_OPTIONS[0]?.label === '20-30 min', 'setup and Profile offer "20-30 min", first')
ok(DURATION_BUDGET_SECONDS['20-30'] === 23 * 60 && SESSION_MINIMUM_SECONDS['20-30'] === 20 * 60 && SESSION_MAXIMUM_SECONDS['20-30'] === 30 * 60,
  'aims at 23 minutes inside 20-30', [DURATION_BUDGET_SECONDS['20-30'], SESSION_MINIMUM_SECONDS['20-30'], SESSION_MAXIMUM_SECONDS['20-30']])
ok(STEADY_STATE_SECONDS['20-30'] === 10 * 60, 'a steady-state block is 10 minutes')
ok(JSON.stringify(SESSION_BAND_MINUTES['20-30']) === '[20,30]', "setup's band words match the engine")
const coach = strip(readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8'))
ok(/enum: \["20-30", "30-45", "45-60", "60-90", "90\+"\]/.test(coach), "the coach's session-length tool can ask for 20-30")
ok(/- 20-30 min: 3 exercises/.test(coach), "the coach's scaling rules name 20-30")

console.log('§2 A 20-30 plan, across goals, experience and kit (48 seeded plans)')
let sessions = 0, over = 0, thin = 0, liftingWithBlock = 0, shortRest = 0, badPair = 0, low = 0, pairs = 0, alternates = 0, minScore = 99
for (const goal of GOALS) for (const exp of EXP) for (const eq of EQUIP) {
  const key = `gate:${goal}:${exp}:${eq}`
  const p = shortProfile({ fitness_goal: goal, training_experience: exp, equipment_access: eq, training_days: daysFor(3) })
  const plan = planFor(p, key)
  const s = scorePlan(p, plan, key).overall
  minScore = Math.min(minScore, s); if (s < 7.2) low++
  for (const week of plan) {
    if (week.is_deload) continue
    for (const day of week.days) {
      if (day.exercises.length === 0) continue
      sessions++
      if (estimateDaySeconds(day) > 30 * 60) over++
      if (day.focus !== 'Conditioning & Core' && workingOf(day).length < 3) thin++
      if (day.recommendedCardio?.timing === 'post_session' && day.focus !== 'Conditioning & Core') liftingWithBlock++
      for (const ex of day.exercises) {
        const e = getExerciseEntry(ex.name)
        if (ex.rest === 'alternate') alternates++
        if (e?.mechanics_tier === 'tier2_compound' && ex.rest !== 'alternate' && /^\d+s$/.test(ex.rest) && parseInt(ex.rest, 10) <= 30
          && e.prescription_type !== 'intervals' && e.prescription_type !== 'steady_state' && e.movement_pattern !== 'core' && e.movement_pattern !== 'carry') shortRest++
        if (ex.superset_label?.endsWith('1')) {
          pairs++
          const partner = day.exercises.find(x => x.superset_label === `${ex.superset_label![0]}2`)
          const pe = partner && getExerciseEntry(partner.name)
          if (!pe || e?.mechanics_tier === 'tier1_compound' || pe.mechanics_tier === 'tier1_compound' || ex.tier === 'tier_1_primary' || partner!.tier === 'tier_1_primary') badPair++
        }
      }
    }
  }
}
// MEASURED 15 Nov 2026 on this grid: 13 of 1,728 loading sessions (0.75%) run a minute or two past 30, every one with
// each set already at its floor of two (the 144-profile measure:short-sessions grid: 12 of 5,184; 30-45 there: 2).
// Before the four fixes it was 336 of 5,184 (6.5%), so the 1% ceiling catches a return of any one of them.
ok(sessions > 1000, `the grid ran (${sessions} loading sessions)`, sessions)
ok(over / sessions <= 0.01, `no more than 1% of sessions run past 30 minutes (${over} of ${sessions})`, over)
ok(thin === 0, `every lifting day keeps three exercises (${thin} with fewer)`, thin)
ok(liftingWithBlock === 0, `no lifting day carries a conditioning block on top (${liftingWithBlock})`, liftingWithBlock)
ok(shortRest === 0, `no second-tier compound rests 30 seconds or less outside a superset (his 18 Sep report) (${shortRest})`, shortRest)
ok(pairs > 0 && alternates > 0, `supersets exist and keep alternating through the weeks (${pairs} pairs, ${alternates} alternating rows)`, { pairs, alternates })
ok(badPair === 0, `no superset holds the main lift (${badPair})`, badPair)
ok(low === 0, `every plan clears the 7.2 quality floor (lowest ${minScore.toFixed(2)})`, minScore)

// The measured offender for the week-balance floor (15 Nov 2026): a four-day bodyweight plan whose push day the
// push:pull pass cut to two push-up variations. Found by the measurement, not picked.
{
  const p = shortProfile({ fitness_goal: 'fat_loss', training_experience: 'advanced', equipment_access: 'bodyweight', training_days: daysFor(4) })
  const plan = planFor(p, 'short:fat_loss:advanced:bodyweight:4')
  const thinDays = plan.flatMap(w => w.days).filter(d => d.exercises.length > 0 && d.focus !== 'Conditioning & Core' && workingOf(d).length < 3)
  ok(thinDays.length === 0, `the four-day bodyweight push day keeps three exercises (${thinDays.length} thin)`, thinDays.map(d => d.focus))
}

console.log('§3 A day still over 30 minutes gives up a set, never rest, a pattern or a primer')
const ex = (name: string, tier: Exercise['tier'], sets: number, reps: string, rest: string): Exercise =>
  ({ name, tier, sets, reps, rest, intensity: '', load_guidance: '' } as unknown as Exercise)
const longDay = (): WorkoutDay => ({
  day: 'Monday', focus: 'Full Body Power',
  exercises: [
    ex('Arm Circles', 'tier_0_primer', 2, '10', '20s'),
    ex('Trap Bar Deadlift', 'tier_1_primary', 4, '15-17', '120s'),
    ex('Dumbbell Bench Press', 'tier_2_secondary', 3, '15-17', '60s'),
    ex('Lat Pulldown', 'tier_2_secondary', 3, '15-17', '60s'),
    ex('Goblet Squat', 'tier_2_secondary', 3, '15-17', '60s'),
  ],
} as unknown as WorkoutDay)
const before = longDay()
ok(estimateDaySeconds(before) > 30 * 60, `the constructed day is over 30 minutes (${(estimateDaySeconds(before) / 60).toFixed(1)})`)
const days = [longDay()]
const log: { reason: string }[] = []
trimShortSessionSets(days, 30 * 60, log as never)
const after = days[0]
ok(estimateDaySeconds(after) <= 30 * 60 || after.exercises.every(e => e.tier === 'tier_0_primer' || e.sets <= 2), 'it fits, or every set is at two', estimateDaySeconds(after) / 60)
ok(after.exercises.length === before.exercises.length, 'no exercise removed')
ok(after.exercises.every((e, i) => e.rest === before.exercises[i].rest), 'no rest touched')
ok(after.exercises[0].sets === 2, 'the primer keeps its sets')
ok(after.exercises.every(e => e.sets >= 2), 'nothing below two sets')
ok(after.exercises.slice(2).every(e => e.sets <= after.exercises[1].sets) && after.exercises[4].sets <= after.exercises[2].sets,
  'accessories give up sets before the main lift, from the bottom up (his 13 Sep ruling)', after.exercises.map(e => e.sets))
ok(after.exercises[1].sets === 4 || after.exercises.slice(2).every(e => e.sets === 2), 'the main lift loses a set only once every accessory is at two', after.exercises.map(e => e.sets))
ok(log.length > 0 && /one set taken off/.test(log[0].reason), 'and the plan records why')
ok((log[0] as unknown as { exercise: string }).exercise === 'Goblet Squat', 'the first set comes off the LAST accessory', (log[0] as unknown as { exercise: string })?.exercise)
// A day that cannot fit even at two sets a lift: everything stops at two, and a three-set primer is never touched.
const huge = [{ ...longDay(), exercises: [
  ex('Arm Circles', 'tier_0_primer', 3, '10', '20s'),
  ...longDay().exercises.slice(1).map(e => ({ ...e, sets: 5, reps: '20-25' })),
  ex('Dumbbell Row', 'tier_2_secondary', 5, '20-25', '60s'),
  ex('Reverse Lunge', 'tier_2_secondary', 5, '20-25', '60s'),
] }] as WorkoutDay[]
trimShortSessionSets(huge, 30 * 60)
ok(estimateDaySeconds(huge[0]) > 30 * 60, 'the very long day is still over at its floor (so the floor binds)', estimateDaySeconds(huge[0]) / 60)
ok(huge[0].exercises.slice(1).every(e => e.sets === 2), 'every lift stops at two sets, none at one', huge[0].exercises.map(e => e.sets))
ok(huge[0].exercises[0].sets === 3, 'a three-set primer is never trimmed', huge[0].exercises[0].sets)
const fits = [{ ...longDay(), exercises: longDay().exercises.slice(0, 3).map(e => ({ ...e, sets: 2 })) }]
const fitsBefore = JSON.stringify(fits)
trimShortSessionSets(fits as WorkoutDay[], 30 * 60)
ok(JSON.stringify(fits) === fitsBefore, 'a day that fits is left alone')

console.log('§4 Which lifts may pair')
{
  const names = ['Trap Bar Deadlift', 'Dumbbell Bench Press', 'Romanian Deadlifts', 'Lat Pulldown']
  const pool = names.map(n => getExerciseEntry(n)!)
  const rows = names.map((name, i) => ex(name, i === 0 ? 'tier_1_primary' : 'tier_2_secondary', 3, '10', '60s'))
  const trace = { structure_adjusted: [], time_cap_adjusted: [] } as never
  const short = buildSupersetPairs(rows, pool, '20-30', 'hybrid', trace)
  const label = (n: string, list: Exercise[]) => list.find(e => e.name === n)?.superset_label ?? null
  ok(pool.every(Boolean), 'the fixture lifts are in the catalogue')
  ok(label('Dumbbell Bench Press', short)?.[0] === label('Lat Pulldown', short)?.[0] && label('Lat Pulldown', short) !== null,
    'at 20-30 the press pairs with the pull', short.map(e => `${e.name}:${e.superset_label ?? '-'}`))
  ok(label('Romanian Deadlifts', short) === null && label('Trap Bar Deadlift', short) === null, 'a hinge and the main lift stay unpaired')
  ok(short.find(e => e.superset_label?.endsWith('2'))?.rest === 'alternate', 'the second of the pair alternates')
  const mainNames = ['Barbell Bench Press', 'Lat Pulldown', 'Romanian Deadlifts']
  const mainPool = mainNames.map(n => getExerciseEntry(n)!)
  const mainRows = mainNames.map((name, i) => ex(name, i === 0 ? 'tier_1_primary' : 'tier_2_secondary', 3, '8', '90s'))
  const withMain = buildSupersetPairs(mainRows, mainPool, '20-30', 'hybrid', trace)
  ok(mainPool.every(Boolean) && withMain.every(e => !e.superset_label), 'a pressing main lift is never paired with a pull', withMain.map(e => `${e.name}:${e.superset_label ?? '-'}`))
  const std = buildSupersetPairs(rows, pool, '30-45', 'hybrid', trace)
  ok(std.every(e => !e.superset_label), 'at 30-45 compounds stay unpaired, as before')
}

console.log('§5 Only at 20-30')
const src = strip(readFileSync('src/lib/exercise-plan.ts', 'utf8'))
ok(/if \(profile\.session_duration_preference === '20-30'\) \{\s*trimShortSessionSets\(/.test(src), 'the set trim runs only for 20-30')
ok(/if \(duration === '20-30'\) \{\s*const isPush/.test(src), 'compound supersets only for 20-30')

console.log(`${ran} checks ran, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)

// THE PLAN FAULTS OF 26 NOV 2026 — six things the plan-quality scorer and a coach's read found on main, each measured
// on the 9,216-plan grid (or a 999-plan stride-37 sample of it) before it was changed. docs/plans/plan-faults-nov26.md.
//
//   1. the session set cap follows recovery           (a low-recovery beginner's long day: 16.2 sets against 17.4)
//   2. a compound added late goes after the compounds  (it landed ahead of the rehab drill and the main lift)
//   3. no late pass lifts an accessory over the main   (7 plans: a row at 4 sets beside a deadlift at 3)
//   4. real kit before a band or a backpack            (71 of 201 home and minimalist week-1 plans held one)
//   5. the cap keeps a press a pull-heavy week needs   (a bad back's week pulling 16 sets to 7)
//   6. the scorer says what was decided                (conditioning for a beginner; a lift at its implement's floor)
//
// EVERY PLAN HERE IS SEEDED BY ITS OWN GRID KEY, the key the measurement used, so each fixture is a profile the broken
// code named, not one picked as plausible. Constructed inputs prove the mechanism; the measured offenders prove it
// matters in a real plan. One exit, at the bottom.
import {
  generateMesocycle, setRandomSource, resetRandomSource, getConstrainedPool, hasBetterLoadingPeer, worseKitOnSession, sessionSetCap,
  slotAfterCompounds, realKitFirst, capBeginnerSets, beginnerWorkingSets, BEGINNER_MAX_WORKING_SETS, LOWER_BACK_MAX_WORKING_SETS,
} from '../src/lib/exercise-plan'
import { EXERCISE_DATABASE, getVolumeRole } from '../src/lib/exercise-db'
import { scorePlan } from '../src/lib/quality-score'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { buildProfile, comboKey, type Combination } from './quality-grid'
import type { MesocycleWeek, WorkoutDay, UserProfile } from '../src/lib/types'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { parseRuleFrequency, ruleMoves, isLargeRise } from './quality-rule-moves'
const __dirname = dirname(fileURLToPath(import.meta.url))

let failures = 0, ran = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail === undefined ? '' : ' — ' + JSON.stringify(detail)}`) }
}
const byName = new Map(EXERCISE_DATABASE.map(e => [e.name, e]))
const combo = (equipment: string, injuries: string[], duration: string, style: string, experience: string, goal: string, recovery: string, conditioningPref: string) =>
  ({ equipment, injuries, duration, style, experience, goal, recovery, conditioningPref }) as unknown as Combination
const plans = new Map<string, MesocycleWeek[]>()
function planFor(c: Combination): MesocycleWeek[] {
  const key = comboKey(c)
  if (!plans.has(key)) { setRandomSource(seededRngFromKey(key)); plans.set(key, generateMesocycle(buildProfile(c))); resetRandomSource() }
  return plans.get(key)!
}
const loadingDays = (meso: MesocycleWeek[]): WorkoutDay[] => meso.filter(w => !w.is_deload).flatMap(w => w.days.filter(d => d.exercises.length > 0))
const rulesOf = (c: Combination, meso = planFor(c)): string[] => {
  const r = scorePlan(buildProfile(c), meso, comboKey(c), { skipComparisons: true })
  return Object.values(r.dimensions).flatMap(d => d.deductions.map(x => x.rule))
}

// ---------------------------------------------------------------------------
console.log('\n1. The session set cap follows recovery')
// ---------------------------------------------------------------------------
{
  const p = (recovery: string, injuries: string[] = []) => ({ recovery_capacity: recovery, injuries, concurrent_activities: [] }) as unknown as UserProfile
  check('a beginner keeps 18 on moderate and high recovery', sessionSetCap(p('moderate'), 'beginner') === 18 && sessionSetCap(p('high'), 'beginner') === BEGINNER_MAX_WORKING_SETS)
  check('a low-recovery beginner is capped at 14 (three quarters of 18)', sessionSetCap(p('low'), 'beginner') === 14, sessionSetCap(p('low'), 'beginner'))
  check('a bad back keeps 22, and 17 on low recovery', sessionSetCap(p('high', ['lower_back']), 'advanced') === LOWER_BACK_MAX_WORKING_SETS && sessionSetCap(p('low', ['lower_back']), 'advanced') === 17)
  check('nobody else has a cap', sessionSetCap(p('low'), 'intermediate') === null && sessionSetCap(p('high', ['knees']), 'novice') === null)
  check('it only ever lowers (his "at most 18")', (sessionSetCap(p('low'), 'beginner') ?? 99) <= 18)

  // The measured case: a beginner asking for the longest session, where the gap had eroded to 93%.
  const worst = (recovery: string) => {
    let top = 0, total = 0, n = 0
    for (const equipment of ['full_gym', 'home_gym'] as const) for (const goal of ['hypertrophy', 'fat_loss'] as const) {
      for (const d of loadingDays(planFor(combo(equipment, [], '90+', 'bodybuilding', 'beginner', goal, recovery, 'tolerate')))) { const s = beginnerWorkingSets(d); top = Math.max(top, s); total += s; n++ }
    }
    return { top, mean: total / n }
  }
  const low = worst('low'), high = worst('high')
  check('no loading day of a low-recovery beginner on 90+ minutes holds more than 14 working sets', low.top <= 14, low)
  check('a high-recovery beginner still reaches past 14 (the cap binds on low only)', high.top > 14 && high.top <= 18, high)
  check('the low-recovery beginner trains under 85% of the high one\'s sets a day (it was 93%)', low.mean / high.mean < 0.85, { low: low.mean.toFixed(1), high: high.mean.toFixed(1) })
}

// ---------------------------------------------------------------------------
console.log('\n2. A compound added late goes in after the day\'s compounds, never ahead of the rehab drill')
// ---------------------------------------------------------------------------
{
  const list = ['Band Dislocates', 'Bird Dog', 'Barbell Bench Press', 'Dumbbell Shoulder Press', 'Lateral Raises', 'Plank', 'Dumbbell Rows'].map(name => ({ name }))
  for (const e of list) if (!byName.has(e.name)) check(`fixture exercise exists: ${e.name}`, false)
  const at = list.length - 1
  check('with a rehab drill at the front, the slot is the first isolation move AFTER the compounds', slotAfterCompounds(list, at) === 4, slotAfterCompounds(list, at))
  check('...which is past the main lift, not in front of it', slotAfterCompounds(list, at) > list.findIndex(e => e.name === 'Barbell Bench Press'))
  const noCompound = ['Band Dislocates', 'Lateral Raises', 'Plank', 'Dumbbell Rows'].map(name => ({ name }))
  check('a day with no other compound keeps the old answer (the first move that is not a primer)', slotAfterCompounds(noCompound, 3) === 1, slotAfterCompounds(noCompound, 3))
  const noneLater = ['Band Dislocates', 'Barbell Bench Press', 'Dumbbell Rows'].map(name => ({ name }))
  check('nothing after the compounds: no slot, so the lift stays where it was added', slotAfterCompounds(noneLater, 2) === -1)

  // The measured offenders (each fired core_before_main on main at 45ed71c).
  const offenders = [
    combo('full_gym', ['lower_back', 'knees'], '30-45', 'hybrid', 'novice', 'functional', 'moderate', 'avoid'),
    combo('home_gym', ['lower_back', 'knees'], '45-60', 'hybrid', 'novice', 'functional', 'high', 'avoid'),
    combo('full_gym', ['lower_back'], '45-60', 'hybrid', 'beginner', 'functional', 'high', 'love'),
  ]
  const still = offenders.filter(c => rulesOf(c).includes('core_before_main')).map(comboKey)
  check('the three measured offenders no longer put trunk work ahead of the main lift', still.length === 0, still)
}

// ---------------------------------------------------------------------------
console.log('\n3. No late pass lifts an accessory over its day\'s main lift')
// ---------------------------------------------------------------------------
{
  const offenders = [
    combo('full_gym', ['shoulders'], '45-60', 'hybrid', 'advanced', 'conditioning', 'low', 'tolerate'),
    combo('full_gym', ['shoulders', 'wrists'], '30-45', 'hybrid', 'novice', 'conditioning', 'moderate', 'love'),
    combo('home_gym', ['shoulders', 'wrists'], '45-60', 'hybrid', 'advanced', 'conditioning', 'moderate', 'love'),
    combo('minimalist', [], '60-90', 'combat', 'intermediate', 'conditioning', 'high', 'avoid'),
  ]
  const inverted: string[] = []
  let daysWithAMain = 0
  for (const c of offenders) for (const d of loadingDays(planFor(c))) {
    const roles = d.exercises.map(ex => { const en = byName.get(ex.name); return en ? getVolumeRole(en) : null })
    const mains = d.exercises.filter((_, j) => roles[j] === 'main').map(e => e.sets)
    if (!mains.length) continue
    daysWithAMain++
    d.exercises.forEach((ex, j) => { if (roles[j] && roles[j] !== 'main' && roles[j] !== 'conditioning' && ex.sets > Math.max(...mains)) inverted.push(`${d.day} ${ex.name} ${ex.sets} > ${Math.max(...mains)}`) })
  }
  check(`the walk looked at real days (${daysWithAMain} loading days with a main lift)`, daysWithAMain > 40, daysWithAMain)
  check('in the four measured offenders no accessory holds more sets than the main lift, in any loading week', inverted.length === 0, inverted.slice(0, 4))
  check('...and the scorer agrees', offenders.every(c => !rulesOf(c).includes('set_hierarchy_inverted')))
}

// ---------------------------------------------------------------------------
console.log('\n4. Real kit before a band or a backpack')
// ---------------------------------------------------------------------------
{
  const home = buildProfile(combo('home_gym', [], '90+', 'hybrid', 'advanced', 'fat_loss', 'moderate', 'love'))
  const pool = getConstrainedPool(home, [])
  const worse = pool.filter(e => hasBetterLoadingPeer(e, pool)).map(e => e.name)
  check(`the detector finds band and improvised moves in a home pool (${worse.length})`, worse.length >= 5 && worse.includes('Band Tricep Pushdown') && worse.includes('Backpack Front Raise'), worse.slice(0, 8))
  const ordered = realKitFirst(pool, 'home_gym')
  const firstWorse = ordered.findIndex(e => worse.includes(e.name))
  check('realKitFirst keeps every entry', ordered.length === pool.length && new Set(ordered.map(e => e.name)).size === pool.length)
  check('...and puts every one with a loadable equivalent after everything else', firstWorse === pool.length - worse.length, { firstWorse, expected: pool.length - worse.length })
  check('...keeping catalogue order among the rest', ordered.slice(0, firstWorse).map(e => e.name).join('|') === pool.filter(e => !worse.includes(e.name)).map(e => e.name).join('|'))
  check('bodyweight-only kit is left alone (its band IS its kit)', realKitFirst(pool, 'bodyweight') === pool)

  // The measured offenders: a long day that read "Front Raises, Backpack Front Raise".
  const offenders = [
    combo('home_gym', [], '90+', 'hybrid', 'advanced', 'fat_loss', 'moderate', 'love'),
    combo('home_gym', [], '90+', 'functional', 'advanced', 'functional', 'low', 'love'),
    combo('home_gym', ['lower_back'], '60-90', 'bodybuilding', 'advanced', 'conditioning', 'low', 'love'),
    combo('full_gym', [], '90+', 'bodybuilding', 'advanced', 'conditioning', 'low', 'avoid'),
    combo('minimalist', [], '90+', 'hybrid', 'intermediate', 'hypertrophy', 'high', 'tolerate'),
  ]
  const held: string[] = []
  let slots = 0
  for (const c of offenders) {
    const p = getConstrainedPool(buildProfile(c), [])
    for (const w of planFor(c)) for (const d of w.days) for (const ex of d.exercises) { slots++; const e = p.find(x => x.name === ex.name); if (e && worseKitOnSession(e, p, d.exercises.map(x => x.name))) held.push(`wk${w.week_number} ${d.day} ${ex.name}`) }
  }
  check(`the walk looked at real slots (${slots})`, slots > 1500, slots)
  check('in five measured offenders no week holds a band or improvised move that copies a loadable one, or was taken ahead of one', held.length === 0, held.slice(0, 5))
  // The rule itself, on constructed sessions (the names are the catalogue's own).
  const e = (n: string) => pool.find(x => x.name === n)!
  check('fixture: the four exercises the rule is asked about are in a home pool', ['Backpack Front Raise', 'Front Raises', 'Band Tricep Pushdown', 'Dumbbell Tricep Kickback'].every(n => !!pool.find(x => x.name === n)))
  check('a COPY of a loadable move is wrong whatever the session holds (a Backpack Front Raise beside Front Raises)', worseKitOnSession(e('Backpack Front Raise'), pool, ['Front Raises']) && worseKitOnSession(e('Backpack Front Raise'), pool, []))
  check('a different movement is wrong while a loadable equivalent is still off the session', worseKitOnSession(e('Band Tricep Pushdown'), pool, ['Dumbbell Tricep Kickback']))
  const sore = getConstrainedPool(buildProfile(combo('home_gym', ['shoulders'], '60-90', 'bodybuilding', 'intermediate', 'hypertrophy', 'moderate', 'tolerate')), [])
  const weighted = sore.filter(x => x.movement_pattern === 'isolation_tricep' && !hasBetterLoadingPeer(x, sore)).map(x => x.name)
  check('the fixture binds: a sore shoulder leaves one weighted triceps move, the kickback', weighted.length === 1 && weighted[0] === 'Dumbbell Tricep Kickback', weighted)
  check('...and once it is on the session, the band pushdown is a real second movement (the dumbbell pack\'s two triceps moves)', !worseKitOnSession(sore.find(x => x.name === 'Band Tricep Pushdown')!, sore, ['Dumbbell Tricep Kickback']))
  check('...but not before it is', worseKitOnSession(sore.find(x => x.name === 'Band Tricep Pushdown')!, sore, []))
  check('...and the band KICKBACK, a copy of it, never is', worseKitOnSession(sore.find(x => x.name === 'Band Tricep Kickback')!, sore, ['Dumbbell Tricep Kickback']))
  const dipsTogether = offenders.flatMap(c => planFor(c).flatMap(w => w.days.filter(d => d.exercises.some(x => x.name === 'Chair Dips') && d.exercises.some(x => /^(Tricep|Chest) Dips$/.test(x.name))).map(d => `wk${w.week_number} ${d.day}`)))
  check('no day holds a dip and a chair dip (one movement family)', dipsTogether.length === 0, dipsTogether.slice(0, 3))
  check('...and the scorer agrees', offenders.every(c => !rulesOf(c).includes('worse_implement_than_available')))
  // The promise that it costs nothing in time: none of them now runs short of the session asked for.
  check('...and none of them now runs under the time asked for', offenders.every(c => !rulesOf(c).includes('time_fit')))
}

// ---------------------------------------------------------------------------
console.log('\n5. The cap keeps a press a pull-heavy week needs')
// ---------------------------------------------------------------------------
{
  const ex = (name: string, sets: number) => ({ id: name, name, sets, reps: '10-12', rest: '60s' }) as unknown as WorkoutDay['exercises'][number]
  // A day over a cap of 12 by two sets: one press and two pulls can each give a set.
  const day = { day: 'Monday', focus: 'Upper', exercises: [ex('Barbell Bench Press', 3), ex('Dumbbell Shoulder Press', 3), ex('Dumbbell Rows', 4), ex('Lat Pulldown', 4)] } as unknown as WorkoutDay
  const sets = (d: WorkoutDay, n: string) => d.exercises.find(e => e.name === n)?.sets
  const pullHeavy = capBeginnerSets(day, new Set(), 12, true, { push: 2, pull: 14 })
  check('the day was cut to the cap', beginnerWorkingSets(pullHeavy) === 12, beginnerWorkingSets(pullHeavy))
  check('in a week pulling far more than it presses, the press keeps its sets and the pulls give', sets(pullHeavy, 'Dumbbell Shoulder Press') === 3 && (sets(pullHeavy, 'Dumbbell Rows')! + sets(pullHeavy, 'Lat Pulldown')!) === 6, pullHeavy.exercises.map(e => `${e.name}x${e.sets}`))
  const pushHeavy = capBeginnerSets(day, new Set(), 12, true, { push: 14, pull: 2 })
  // The accessory press has one set above its floor, so it gives that one and a pull gives the other: the press FIRST.
  check('the older half still holds: in a week pressing more than it pulls, the press gives first', sets(pushHeavy, 'Dumbbell Shoulder Press') === 2 && (sets(pushHeavy, 'Dumbbell Rows')! + sets(pushHeavy, 'Lat Pulldown')!) === 7, pushHeavy.exercises.map(e => `${e.name}x${e.sets}`))
  check('the two weeks give different answers from the same day (the rule reads the week)', sets(pullHeavy, 'Dumbbell Shoulder Press') !== sets(pushHeavy, 'Dumbbell Shoulder Press'))

  const offenders = [
    combo('full_gym', ['lower_back'], '60-90', 'hybrid', 'advanced', 'hypertrophy', 'low', 'tolerate'),
    combo('full_gym', ['lower_back'], '60-90', 'hybrid', 'advanced', 'functional', 'low', 'avoid'),
    combo('full_gym', ['lower_back'], '60-90', 'hybrid', 'advanced', 'fat_loss', 'moderate', 'tolerate'),
  ]
  const still = offenders.filter(c => rulesOf(c).includes('push_pull_imbalance')).map(comboKey)
  check('three measured bad-back weeks are no longer scored pull-heavy', still.length === 0, still)
}

// ---------------------------------------------------------------------------
console.log('\n6. The scorer says what was decided')
// ---------------------------------------------------------------------------
{
  // (a) A beginner's conditioning in a short session: one session of its own is the decided dose (CSCS, 22 Nov).
  const shortBeginner = combo('full_gym', ['neck'], '30-45', 'hybrid', 'beginner', 'fat_loss', 'high', 'love')
  const meso = planFor(shortBeginner)
  const wk1 = meso.find(w => w.week_number === 1)!
  const conditioningDays = wk1.days.filter(d => d.conditioning_note && !d.recommendedCardio?.is_filler).length
  check('the fixture binds: a beginner on 30-45 minutes who loves cardio gets at least one session, and fewer than the 2.5 the old rule wanted', conditioningDays >= 1 && conditioningDays < 2.5, conditioningDays)
  check('...and that is not scored as a mismatch', !rulesOf(shortBeginner).includes('conditioning_frequency_mismatch'))
  const none: MesocycleWeek[] = meso.map(w => ({ ...w, days: w.days.map(d => ({ ...d, conditioning_note: undefined, recommendedCardio: undefined })) }))
  check('...but the same beginner given none at all still fails', rulesOf(shortBeginner, none).includes('conditioning_frequency_mismatch'))
  // The other half of the ceiling: nothing on a rest day, so never more sessions than training days (his "B", 14 Nov).
  // The goal asks five of a beginner who loves cardio; four training days can hold four at most, and this one holds three.
  const fourDays = combo('full_gym', ['lower_back'], '45-60', 'hybrid', 'beginner', 'conditioning', 'moderate', 'love')
  const held = planFor(fourDays).find(w => w.week_number === 1)!.days.filter(d => d.conditioning_note && !d.recommendedCardio?.is_filler).length
  check('the fixture binds: three conditioning days on four training days, where the goal alone would ask five', held === 3, held)
  check('...and a beginner is not marked down for the sessions a rest day would have held', !rulesOf(fourDays).includes('conditioning_frequency_mismatch'))
  const longAdvanced = combo('full_gym', [], '60-90', 'hybrid', 'advanced', 'fat_loss', 'high', 'love')
  const stripped: MesocycleWeek[] = planFor(longAdvanced).map(w => ({ ...w, days: w.days.map((d, i) => (i === 0 ? d : { ...d, conditioning_note: undefined, recommendedCardio: undefined })) }))
  check('...and nobody else is let off: an advanced lifter left with one conditioning day fails as before', rulesOf(longAdvanced, stripped).includes('conditioning_frequency_mismatch'))

  // (b) A lift already at the lightest its implement goes cannot be "too heavy for the main lift".
  const landmine = combo('full_gym', ['lower_back'], '90+', 'combat', 'beginner', 'fat_loss', 'moderate', 'tolerate')
  const lm = planFor(landmine)
  const day = lm[0].days.find(d => d.exercises.some(e => e.name === 'Landmine Press'))
  const press = day?.exercises.find(e => e.name === 'Landmine Press')
  check('the fixture binds: a beginner\'s Landmine Press sits at the empty bar', press?.suggested_load_kg === 20, press?.suggested_load_kg)
  check('...and is not scored as outweighing the bench press', !rulesOf(landmine).includes('load_incoherent'))
  const heavier: MesocycleWeek[] = lm.map(w => ({ ...w, days: w.days.map(d => ({ ...d, exercises: d.exercises.map(e => (e.name === 'Landmine Press' ? { ...e, suggested_load_kg: 27.5 } : e)) })) }))
  check('...but the same press ABOVE the bar is', rulesOf(landmine, heavier).includes('load_incoherent'))
}

// ---------------------------------------------------------------------------
console.log('\n7. The scorer says which rules moved, and a large rise fails')
// ---------------------------------------------------------------------------
{
  const committed = readFileSync(join(__dirname, '..', 'quality-report.txt'), 'utf8')
  const was = parseRuleFrequency(committed)
  check(`the committed report's rule table is read (${was.size} rules)`, was.size >= 5 && (was.get('progression/frozen_week') ?? 0) > 1000, [...was].slice(0, 3))
  check('a report with no table reads as empty, never as zeros for every rule', parseRuleFrequency('no table here').size === 0)
  const now = new Map(was)
  check('the same counts are no move at all', ruleMoves(was, now).length === 0)
  now.set('progression/frozen_week', (was.get('progression/frozen_week') ?? 0) + 5)
  now.set('goalAlignment/a_rule_that_is_new', 520)
  now.delete([...was.keys()][1])
  const moves = ruleMoves(was, now)
  check('a rule that appears, one that vanishes and one that drifts are all listed, biggest first', moves.length === 3 && moves[0].now - moves[0].was !== 5 && Math.abs(moves[0].now - moves[0].was) >= Math.abs(moves[1].now - moves[1].was), moves)
  check('0 to 520 is a large rise (the conditioning rule, 15 to 25 Nov)', isLargeRise({ rule: 'x', was: 0, now: 520 }))
  check('684 to 1,613 is a large rise (the recovery rule)', isLargeRise({ rule: 'x', was: 684, now: 1613 }))
  check('a drift of five plans is not', !isLargeRise({ rule: 'x', was: 4061, now: 4066 }))
  check('a big rule moving a little is not (4,061 to 4,300 is under a quarter)', !isLargeRise({ rule: 'x', was: 4061, now: 4300 }))
  check('a small rule doubling is not (40 to 90 is under 100 plans)', !isLargeRise({ rule: 'x', was: 40, now: 90 }))
  check('a fall is never a failure', !isLargeRise({ rule: 'x', was: 1613, now: 93 }))
  const runner = readFileSync(join(__dirname, 'run-quality-score.ts'), 'utf8').replace(/\/\/.*$/gm, '')
  check('the runner fails on a large rise and reads the report from git before overwriting it',
    /rises\.length > 0/.test(runner) && /failed = [^\n]*rises\.length > 0/.test(runner) && runner.indexOf("'show', 'HEAD:quality-report.txt'") > 0 && runner.indexOf("'show', 'HEAD:quality-report.txt'") < runner.indexOf('fs.writeFileSync(outputPath'))
}

console.log(`\n${ran} checks ran, ${failures} failed`)
process.exit(failures > 0 ? 1 : 0)

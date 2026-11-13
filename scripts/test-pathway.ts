// test:pathway — his 13 Nov 2026 strategy, slice 3 (docs/plans/pathway.md).
// Walks, then two short home strength sessions from week 3; balance from 65; a swim or ride
// he enjoys in place of one walk; age only ever ADDS. Seeded, so every run is the same plan.
import { generateMesocycle, setRandomSource, getFlaggedJoints } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { getExerciseEntry, isContraindicatedFor } from '../src/lib/exercise-db'
import {
  ageBand, applyPathwayWeek, homeCircuit, circuitMinutes, strengthDayIndices, BALANCE_HOLD,
  HOME_STRENGTH_FROM_WEEK, SHORTEST_WALK_ON_STRENGTH_DAY, BALANCE_WARMUP_ITEM,
} from '../src/lib/pathway'
import { estimateDaySeconds } from '../src/lib/session-duration'
import { describeSessionShortfall } from '../src/lib/session-shortfall'
import { assembleProfile, choseThePathway, initialSlotValues, ONBOARDING_SLOTS } from '../src/lib/onboarding-slots'
import { detectPlanInvalidation } from '../src/lib/plan-invalidation'
import type { UserProfile, WorkoutDay, MesocycleWeek } from '../src/lib/types'
import { PERSONAS } from './pathway-personas'

let passed = 0
let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) { passed++; console.log(`  ok: ${name}`) }
  else { failed++; console.log(`  FAIL: ${name}${detail ? ` — ${detail}` : ''}`) }
}

const persona = (key: string) => PERSONAS.find(p => p.key === key)!.profile
function plan(profile: UserProfile, key: string): MesocycleWeek[] {
  setRandomSource(seededRngFromKey(key))
  return generateMesocycle(profile)
}
const strengthDays = (w: MesocycleWeek | undefined) => (w?.days ?? []).filter(d => d.exercises.length > 0 && d.recommendedCardio)
const walkDays = (w: MesocycleWeek | undefined) => (w?.days ?? []).filter(d => d.plannedActivity && d.exercises.length === 0)

console.log('test:pathway\n')

console.log('1. The age band, read from the age the app holds')
check('49 is under 50', ageBand(49) === 'under_50')
check('50 is 50 to 64', ageBand(50) === '50_to_64')
check('64 is 50 to 64', ageBand(64) === '50_to_64')
check('65 is 65 and over', ageBand(65) === '65_and_over')
check('no age is no band (nothing assumed)', ageBand(undefined) === null && ageBand(0) === null)

console.log('\n2. The 62-year-old with a sore knee: walks, then home strength from week 3')
const knee = plan(persona('p62-knee'), 'p62-knee')
check('weeks 1 and 2 are walks only', [0, 1].every(i => strengthDays(knee[i]).length === 0 && walkDays(knee[i]).length === 3),
  knee.slice(0, 2).map(w => `${strengthDays(w).length}s/${walkDays(w).length}w`).join(' '))
check(`week ${HOME_STRENGTH_FROM_WEEK} has exactly two strength + walk days`, strengthDays(knee[2]).length === 2, String(strengthDays(knee[2]).length))
check('...and the third day is still a walk', walkDays(knee[2]).length === 1)
check('every week from 3 to 16 keeps two strength days', knee.slice(2).every(w => strengthDays(w).length === 2),
  knee.slice(2).map(w => strengthDays(w).length).join(''))
const s3 = strengthDays(knee[2])
check('the strength days are not back to back (Monday and Friday)', s3.map(d => d.day).join(',') === 'Monday,Friday', s3.map(d => d.day).join(','))
const names3 = s3[0]?.exercises.map(e => e.name) ?? []
check('the circuit is squat, push, pull and hinge', names3.length === 4 && ['Incline Push-Ups', 'Towel Row', 'Glute Bridge'].every(n => names3.includes(n)), names3.join(', '))
check('...each carrying its pattern and a real tier, so every pass that reads them knows what they are',
  (s3[0]?.exercises ?? []).map(e => e.movement_pattern).join() === 'squat,push,pull,hinge' && (s3[0]?.exercises ?? []).every(e => e.tier === 'tier_2_secondary'))
check('with a sore knee the squat is the Wall Sit, not the Box Squat', names3.includes('Wall Sit') && !names3.includes('Box Squat (Bodyweight)'), names3.join(', '))
const flagged = getFlaggedJoints(['knees'])
const unsafe = knee.flatMap(w => strengthDays(w).flatMap(d => d.exercises)).filter(e => { const en = getExerciseEntry(e.name); return !en || isContraindicatedFor(en, flagged) })
check('nothing in any week is ruled out by the knee', unsafe.length === 0, unsafe.map(e => e.name).join(', '))
check('two sets each, 8-12 reps in week 3', (s3[0]?.exercises ?? []).every(e => e.sets === 2) && s3[0]?.exercises.find(e => e.name === 'Towel Row')?.reps === '8-12')
check('more reps from week 9, still two sets', strengthDays(knee[8])[0]?.exercises.find(e => e.name === 'Towel Row')?.reps === '12-15'
  && strengthDays(knee[8])[0]?.exercises.every(e => e.sets === 2))
check('45 seconds between sets, never 30', (s3[0]?.exercises ?? []).every(e => e.rest === '45s'))
check('the walk follows the strength work, at the walk\'s own effort', s3[0]?.recommendedCardio?.activity === 'Walk'
  && s3[0]?.recommendedCardio?.timing === 'post_session' && s3[0]?.recommendedCardio?.targetRpe === 3)
const mins = circuitMinutes(s3[0]?.exercises ?? [])
check('the circuit is about 15 minutes by the app\'s own clock (10 to 16)', mins >= 10 && mins <= 16, `${mins} min`)
check('no balance hold under 65', !names3.includes(BALANCE_HOLD))

console.log('\n3. The walk on a strength day fits the session he set aside, never under 15 minutes')
const wk16 = strengthDays(knee[15])[0]
const walk16 = walkDays(knee[15])[0]?.plannedActivity?.duration ?? 0
check('a walk-only day in week 16 has the block\'s full minutes (35)', walk16 === 35, String(walk16))
const cut = wk16?.recommendedCardio?.duration ?? 0
check('the strength day\'s walk is shorter, never under 15 minutes', cut < 35 && cut >= SHORTEST_WALK_ON_STRENGTH_DAY, String(cut))
check('...and the whole day fits 45 minutes, by the app\'s own clock', !!wk16 && estimateDaySeconds(wk16) <= 45 * 60, `${Math.round(estimateDaySeconds(wk16!) / 60)} min`)
check('...and says so, without quoting a number the row may not show', /a little shorter today/.test(wk16?.recommendedCardio?.reason ?? '') && !/\d/.test(wk16?.recommendedCardio?.reason ?? ''))
check('a strength day whose walk fits keeps it whole (week 3)', s3[0]?.recommendedCardio?.duration === 20)

console.log('\n4. The 50-year-old at a desk: the same pathway, no balance')
const desk = plan(persona('p50-desk'), 'p50-desk')
check('walks in weeks 1-2, two strength days from week 3', strengthDays(desk[1]).length === 0 && strengthDays(desk[2]).length === 2)
check('the Box Squat (no knee flag)', strengthDays(desk[2])[0]?.exercises.some(e => e.name === 'Box Squat (Bodyweight)') === true)
check('no balance hold anywhere', !desk.some(w => w.days.some(d => d.exercises.some(e => e.name === BALANCE_HOLD) || d.warmup?.mobility.some(m => m.name === BALANCE_HOLD))))

console.log('\n5. Balance from 65 on the pathway')
const older = plan({ ...persona('p62-knee'), age: 66 }, 'p62-knee')
const olderNames = strengthDays(older[2])[0]?.exercises.map(e => e.name) ?? []
check('a 66-year-old\'s circuit gains the balance hold', olderNames.includes(BALANCE_HOLD), olderNames.join(', '))
const hold = strengthDays(older[2])[0]?.exercises.find(e => e.name === BALANCE_HOLD)
check('...held for time, one hold a leg', hold?.sets === 2 && hold?.reps === '20-30s' && /Left leg, then right/.test(hold?.load_guidance ?? ''), `${hold?.sets} x ${hold?.reps}`)
check('...and still nothing taken away (the four moves stay)', olderNames.length === 5)
check('...and adds no more than two minutes to the circuit', circuitMinutes(strengthDays(older[2])[0]?.exercises ?? []) - circuitMinutes(strengthDays(knee[2])[0]?.exercises ?? []) <= 2)

console.log('\n6. The 68-year-old lifting three times a week: never downgraded, balance added')
const lifter = persona('p68-lifter')
const at68 = plan(lifter, 'p68-lifter')
const at40 = plan({ ...lifter, age: 40 }, 'p68-lifter')
const shape = (w: MesocycleWeek[]) => w.map(x => x.days.map(d => d.exercises.map(e => `${e.name}|${e.sets}|${e.reps}|${e.rest}`).join(';')).join('/')).join('#')
// The balance hold's own time, set to nothing: if it were inside the day's time budget, the plan would change.
const holdSeconds = BALANCE_WARMUP_ITEM.duration_seconds
;(BALANCE_WARMUP_ITEM as { duration_seconds: number }).duration_seconds = 0
const at68NoHoldTime = plan(lifter, 'p68-lifter')
;(BALANCE_WARMUP_ITEM as { duration_seconds: number }).duration_seconds = holdSeconds
check('the balance hold takes nothing away: every exercise, set, rep and rest is what it is without the hold\'s time',
  shape(at68) === shape(at68NoHoldTime))
const lifterDay1 = at68[0].days.find(d => d.exercises.length > 0)
const sameDayNoHold = at68NoHoldTime[0].days.find(d => d.exercises.length > 0)
check('...and the session simply runs two minutes longer', (lifterDay1?.warmup?.total_seconds ?? 0) - (sameDayNoHold?.warmup?.total_seconds ?? 0) === holdSeconds)
// MEASURED, NOT HELD: the older age taper on the first weight GUESS (load-prescription ageAdjustment) still moves
// some of a no-history 68-year-old's reps and sets against the same person at 40. Printed so it is never hidden.
const differ = shape(at68).split(/[;/#]/).filter((x, i) => x !== shape(at40).split(/[;/#]/)[i]).length
console.log(`  (measured: ${differ} slot(s) differ from the same person at 40, all from the first-weight age taper)`)
const lifterDays = at68.flatMap(w => w.days.filter(d => d.exercises.length > 0))
check('every training day\'s warm-up has the balance hold', lifterDays.length > 0 && lifterDays.every(d => d.warmup?.mobility.some(m => m.name === BALANCE_HOLD)),
  `${lifterDays.filter(d => !d.warmup?.mobility.some(m => m.name === BALANCE_HOLD)).length} of ${lifterDays.length} without`)
const at40Days = at40.flatMap(w => w.days.filter(d => d.exercises.length > 0))
check('...and the 40-year-old\'s has none', at40Days.every(d => !d.warmup?.mobility.some(m => m.name === BALANCE_HOLD)))
const mob68 = lifterDays[0]?.warmup?.mobility.filter(m => m.name !== BALANCE_HOLD).map(m => m.name).join(',')
check('...and the rest of the warm-up is the same', mob68 === at40Days[0]?.warmup?.mobility.map(m => m.name).join(','))
check('no walking pathway for him (he trains)', !at68.some(w => w.days.some(d => d.plannedActivity)))

console.log('\n7. The 45-year-old returning runner: untouched by the pathway')
const runner = plan(persona('p45-runner'), 'p45-runner')
check('no walks, no home circuit', !runner.some(w => w.days.some(d => d.plannedActivity || d.focus === 'Home strength + walk')))
check('no balance hold', !runner.some(w => w.days.some(d => d.warmup?.mobility.some(m => m.name === BALANCE_HOLD))))

console.log('\n8. A swim or ride he enjoys, in place of one walk a week')
const swimmer = plan({ ...persona('p62-knee'), enjoyed_activities: ['swimming'] }, 'p62-knee')
const swims = (w: MesocycleWeek) => w.days.filter(d => d.plannedActivity?.activity === 'Swim')
check('exactly one swim every week, from week 1', swimmer.every(w => swims(w).length === 1), swimmer.map(w => swims(w).length).join(''))
check('at the walk\'s minutes and effort', swims(swimmer[0])[0]?.plannedActivity?.duration === 20 && swims(swimmer[0])[0]?.plannedActivity?.targetRpe === 3)
check('never on a strength day', swimmer.every(w => swims(w).every(d => d.exercises.length === 0)))
check('in week 1 the other two days stay walks', walkDays(swimmer[0]).filter(d => d.plannedActivity?.activity === 'Walk').length === 2)
const both = plan({ ...persona('p62-knee'), enjoyed_activities: ['swimming', 'cycling'] }, 'p62-knee')
check('with both, they take turns week by week', both[0].days.some(d => d.plannedActivity?.activity === 'Swim') && both[1].days.some(d => d.plannedActivity?.activity === 'Cycle'))
check('the reason says why', /you said you enjoy it/.test(swims(swimmer[0])[0]?.plannedActivity?.reason ?? ''))

console.log('\n9. The pieces, handed a constructed week')
const walk = (day: string): WorkoutDay => ({ day, focus: 'Walk', exercises: [], is_scheduled: true, plannedActivity: { activity: 'Walk', duration: 20, targetRpe: 3 } })
check('one walk day: that one takes the strength', strengthDayIndices([walk('Tuesday')]).join() === '0')
check('Mon, Tue, Thu: Monday and Thursday (spread)', strengthDayIndices([walk('Monday'), walk('Tuesday'), walk('Thursday')]).join() === '0,2')
const fourDays = strengthDayIndices([walk('Monday'), walk('Wednesday'), walk('Friday'), walk('Sunday')])
check('Mon, Wed, Fri, Sun: never Sunday and Monday, back to back across the week', fourDays.join() === '0,2', fourDays.join())
check('a home strength day is never told it "runs shorter than you asked for"',
  describeSessionShortfall(20 * 60, '45-60', { pathway: true }) === null && describeSessionShortfall(20 * 60, '45-60') !== null)
check('week 2 is untouched', applyPathwayWeek([walk('Monday'), walk('Friday')], 2, { age: 70, session_duration_preference: '30-45' }, () => true).every(d => d.exercises.length === 0))
const none = homeCircuit({ age: 40 }, 3, () => false)
check('nothing eligible: no circuit, every pattern named as left out', none.exercises.length === 0 && none.leftOut.length === 4)
const noPush = applyPathwayWeek([walk('Monday'), walk('Friday')], 3, { age: 40, session_duration_preference: '30-45' }, n => n !== 'Incline Push-Ups')
check('a move ruled out is left out and the day says which', noPush[0].exercises.length === 3 && /push move/.test(noPush[0].conditioning_note ?? ''), noPush[0].conditioning_note ?? '')

console.log('\n10. Setup asks what he enjoys, only on the pathway; Profile offers the rebuild')
const slot = ONBOARDING_SLOTS.find(s => s.key === 'enjoyedActivities')
const onPath = { ...initialSlotValues(), trainingExperience: 'beginner', activityLevel: 'sedentary', fitnessGoal: 'fat_loss', startPreference: 'move_more' } as ReturnType<typeof initialSlotValues>
check('the question exists and is optional', !!slot && slot.required === false)
check('asked when he chose the walks', choseThePathway(onPath) && slot?.requiredIf?.(onPath) === true)
check('not asked when he chose straight into training', slot?.requiredIf?.({ ...onPath, startPreference: 'train' }) === false)
check('not asked of someone who trains (muscle goal)', slot?.requiredIf?.({ ...onPath, fitnessGoal: 'hypertrophy' }) === false)
const assembled = assembleProfile({ ...onPath, enjoyedActivities: ['cycling', 'rowing'] } as never)
check('the profile keeps only the options offered', JSON.stringify(assembled.enjoyed_activities) === '["cycling"]', JSON.stringify(assembled.enjoyed_activities))
const offTrain = assembleProfile({ ...onPath, startPreference: 'train', enjoyedActivities: ['cycling'] } as never)
check('...and none at all off the pathway', JSON.stringify(offTrain.enjoyed_activities) === '[]')
const inv = detectPlanInvalidation({ ...persona('p62-knee'), enjoyed_activities: [] }, { enjoyed_activities: ['swimming'] })
check('changing it on Profile offers a rebuild, naming the swim', inv?.field === 'enjoyed_activities' && /a swim/.test(inv?.title ?? ''), inv?.title ?? 'none')
check('the same answer in another order offers nothing', detectPlanInvalidation({ ...persona('p62-knee'), enjoyed_activities: ['cycling', 'swimming'] }, { enjoyed_activities: ['swimming', 'cycling'] }) === null)

console.log(`\n${passed + failed} checks ran: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)

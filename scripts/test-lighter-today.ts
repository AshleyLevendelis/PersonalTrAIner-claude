// ---------------------------------------------------------------------------
// Gate: "Make it easier today" is SHOWN before it is done, changes nothing but
// that day, and can be put back (2 Nov 2026, the UX pass: every change shows
// itself first and offers Undo; whole-app test #5 found it applied on the tap).
// ---------------------------------------------------------------------------
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { planLighterToday, undoLighterToday, dayFingerprint } from '../src/lib/lighter-today'
import type { MesocycleWeek, UserProfile } from '../src/lib/types'

let ran = 0
let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 400)}` : ''}`) }
}

const PROFILE = {
  age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
  fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1800, tdee: 2500,
  equipment_access: 'full_gym', injuries: [], training_style: 'hybrid',
  training_experience: 'intermediate', session_duration_preference: '45-60',
  workout_split_preference: 'ai_recommendation',
  training_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    .map(day => ({ day, available: ['Monday', 'Tuesday', 'Thursday', 'Friday'].includes(day) })),
  weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [], exercise_exclusions: [],
  macro_calculation_mode: 'STANDARD_STATIC', coaching_persona: 'supportive',
  recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
} as UserProfile

setRandomSource(seededRngFromKey('lighter-today'))
const MESO: MesocycleWeek[] = generateMesocycle(PROFILE)
resetRandomSource()
// A loading week (not the calibration week, not a deload) with a real session.
const WEEK = MESO.find(w => !w.is_deload && !w.isCalibrationWeek && w.week_number > 1)!
const DAY = WEEK.days.find(d => d.exercises.length > 4)!
const json = (x: unknown) => JSON.stringify(x)

console.log('\n1. The trial: what it would do, in words, with nothing written')
const before = json(MESO)
const plan = planLighterToday({ mesocycle: MESO, profile: PROFILE, weekNumber: WEEK.week_number, dayName: DAY.day, sayDay: 'Today' })
check('it builds for a real loading day', plan.ok, plan.ok ? undefined : plan.refusal)
check('...and changes nothing it was handed', json(MESO) === before)
const after = plan.ok ? plan.mesocycle.find(w => w.week_number === WEEK.week_number)!.days.find(d => d.day === DAY.day)! : null
const setsOf = (d: { exercises: { sets?: number }[] }) => d.exercises.reduce((n, e) => n + (e.sets ?? 0), 0)
check('the day it would leave has fewer sets', !!after && setsOf(after) < setsOf(DAY), after ? { was: setsOf(DAY), now: setsOf(after) } : null)
// EVERY exercise whose sets moved is named, with both numbers, and none that did not.
const moved = after ? after.exercises.filter(e => (DAY.exercises.find(x => x.name === e.name)?.sets ?? 0) !== (e.sets ?? 0)) : []
const lines = plan.ok ? plan.lines : []
check('each exercise whose sets drop is named with both numbers', moved.length >= 1 && moved.every(e => lines.includes(`${e.name}: ${DAY.exercises.find(x => x.name === e.name)!.sets} → ${e.sets} ${e.sets === 1 ? 'set' : 'sets'}`)), { moved: moved.map(e => e.name), lines })
check('one set is "1 set", never "1 sets"', !lines.some(l => /\b1 sets$/.test(l)), lines)
check('...and no exercise whose sets did not move is named', lines.filter(l => / sets?$/.test(l)).length === moved.length, lines)
check('it says the weights and reps stay, and only today changes', lines.some(l => /^Weights and reps stay the same\. Only today changes/.test(l)), lines)
check('weights and reps really do stay', !!after && after.exercises.every(e => { const x = DAY.exercises.find(y => y.name === e.name); return !x || (x.reps === e.reps && x.suggested_load === e.suggested_load) }))

console.log('\n2. Only that day changes')
const otherDays = (m: MesocycleWeek[]) => json(m.map(w => ({ n: w.week_number, days: w.days.filter(d => !(w.week_number === WEEK.week_number && d.day === DAY.day)) })))
check('every other day of every week is exactly as it was', plan.ok && otherDays(plan.mesocycle) === otherDays(MESO))
check('the day remembers the planned session, so Undo survives a reload', !!after?.lightened_from && json(after.lightened_from.planned) === json(DAY))
check('...and is marked as made lighter for the shortfall note', after?.lightened_today === true)

console.log('\n3. Undo puts back exactly the planned day')
const undone = plan.ok ? undoLighterToday(plan.mesocycle, WEEK.week_number, DAY.day, 0) : null
check('Undo succeeds with nothing logged', !!undone?.ok, undone)
check('...and the plan is byte-for-byte the plan before', !!undone?.ok && json(undone.mesocycle) === json(MESO))
const logged = plan.ok ? undoLighterToday(plan.mesocycle, WEEK.week_number, DAY.day, 2) : null
check('with sets logged it refuses, and says it stays lighter', !!logged && !logged.ok && /logged sets/.test(logged.refusal), logged)
// A later edit to the same day (a set taken off one more exercise) — Undo would throw it away, so it refuses.
const edited = plan.ok ? plan.mesocycle.map(w => w.week_number !== WEEK.week_number ? w : { ...w, days: w.days.map(d => d.day !== DAY.day ? d : { ...d, exercises: d.exercises.map((e, i) => i === d.exercises.length - 1 ? { ...e, sets: (e.sets ?? 1) + 1 } : e) }) }) : MESO
const stale = undoLighterToday(edited, WEEK.week_number, DAY.day, 0)
check('a day changed since is left alone, and said', !stale.ok && /changed today's session since/.test(stale.refusal), stale)
check('...the fingerprint really did change (the case binds)', !!after && dayFingerprint(edited.find(w => w.week_number === WEEK.week_number)!.days.find(d => d.day === DAY.day)!) !== dayFingerprint(after))
const notLight = undoLighterToday(MESO, WEEK.week_number, DAY.day, 0)
check('a day never made lighter has nothing to put back', !notLight.ok && /nothing to put back/.test(notLight.refusal))

console.log('\n4. Refusals are said, never silent')
const again = plan.ok ? planLighterToday({ mesocycle: plan.mesocycle, profile: PROFILE, weekNumber: WEEK.week_number, dayName: DAY.day, sayDay: 'Today' }) : null
check('a day already made lighter is not made lighter twice', !!again && !again.ok && /already made lighter/.test(again.refusal), again)
const deload = MESO.find(w => w.is_deload)
const dl = deload ? planLighterToday({ mesocycle: MESO, profile: PROFILE, weekNumber: deload.week_number, dayName: deload.days.find(d => d.exercises.length > 0)!.day, sayDay: 'Today' }) : null
check('a deload week says it is already lighter', !!dl && !dl.ok && /deload/.test(dl.refusal), dl)
const empty = WEEK.days.find(d => d.exercises.length === 0)
const em = empty ? planLighterToday({ mesocycle: MESO, profile: PROFILE, weekNumber: WEEK.week_number, dayName: empty.day, sayDay: 'Today' }) : null
check('an empty day says there is no session', !!em && !em.ok && /no session here/.test(em.refusal), em)

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.error(`${failures} lighter-today check(s) FAILED.`); process.exit(1) }
console.log('Make it easier is shown first, changes only today, and can be put back.')

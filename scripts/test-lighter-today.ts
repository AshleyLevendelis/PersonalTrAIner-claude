// ---------------------------------------------------------------------------
// Gate: "Make it easier today" is SHOWN before it is done, changes nothing but
// that day, and can be put back (2 Nov 2026, the UX pass: every change shows
// itself first and offers Undo; whole-app test #5 found it applied on the tap).
// ---------------------------------------------------------------------------
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { planLighterToday, undoLighterToday, dayFingerprint } from '../src/lib/lighter-today'
import { dayLengthParts, estimateDaySeconds } from '../src/lib/session-duration'
import type { MesocycleWeek, UserProfile } from '../src/lib/types'
import { getExerciseEntry as getEntry, getVolumeRole as getRole } from '../src/lib/exercise-db'

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
check('a warm-up move keeps its sets on the ordinary step (movement prep is not volume)', !!after && DAY.exercises.some(e => { const en = getEntry(e.name); return !!en && getRole(en) === null }) && DAY.exercises.filter(e => { const en = getEntry(e.name); return !!en && getRole(en) === null }).every(e => after.exercises.find(x => x.name === e.name)?.sets === e.sets), DAY.exercises.map(e => [e.name, e.sets]))
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

console.log('\n4. Advise, then allow (his ruling 28 Nov 2026, fix 7): a second step, a deload, the floor')
const again = plan.ok ? planLighterToday({ mesocycle: plan.mesocycle, profile: PROFILE, weekNumber: WEEK.week_number, dayName: DAY.day, sayDay: 'Today' }) : null
check('a day already made lighter takes a second step', !!again?.ok, again)
check('...saying first that it is already a step lighter', !!again?.ok && /^Today's session is already one step lighter/.test(again.lines[0]), again)
const after2 = again?.ok ? again.mesocycle.find(w => w.week_number === WEEK.week_number)!.days.find(d => d.day === DAY.day)! : null
check('...and it really is lighter than the first step', !!after2 && !!after && setsOf(after2) < setsOf(after), after2 && after ? { first: setsOf(after), second: setsOf(after2) } : null)
check('...while Undo still holds the session AS PLANNED, never the first step', !!after2?.lightened_from && json(after2.lightened_from.planned) === json(DAY))
const undo2 = again?.ok ? undoLighterToday(again.mesocycle, WEEK.week_number, DAY.day, 0) : null
check('...so one Undo puts back the plan byte for byte', !!undo2?.ok && json(undo2.mesocycle) === json(MESO))
const deload = MESO.find(w => w.is_deload)
const dlDay = deload?.days.find(d => d.exercises.some(e => (e.sets ?? 0) > 1)) ?? null
const dl = deload && dlDay ? planLighterToday({ mesocycle: MESO, profile: PROFILE, weekNumber: deload.week_number, dayName: dlDay.day, sayDay: 'Today' }) : null
check('a deload week takes the step', !!dl?.ok, dl)
check('...saying first that it is already a lighter week', !!dl?.ok && /^This is already a lighter week/.test(dl.lines[0]), dl)
const dlAfter = dl?.ok ? dl.mesocycle.find(w => w.week_number === deload!.week_number)!.days.find(d => d.day === dlDay!.day)! : null
check('...and the deload day really has fewer sets', !!dlAfter && !!dlDay && setsOf(dlAfter) < setsOf(dlDay))
check('a loading week says nothing about a deload', plan.ok && !plan.lines.some(l => /lighter week/.test(l)), plan.ok ? plan.lines : null)
const empty = WEEK.days.find(d => d.exercises.length === 0)
const em = empty ? planLighterToday({ mesocycle: MESO, profile: PROFILE, weekNumber: WEEK.week_number, dayName: empty.day, sayDay: 'Today' }) : null
check('an empty day says there is no session', !!em && !em.ok && /no session here/.test(em.refusal), em)

console.log('\n5. The length it says is the session\'s, as the header says it (18 Nov 2026)')
// A day carrying an OPTIONAL close-out reads "~44 min · + 8 optional" on its header. The line here was worked out from
// the day with the optional minutes in it, so it quoted a number no screen showed. Constructed, so the case binds:
// the same day with an 8-minute optional mobility flow on the end.
{
  const withFiller = { ...DAY, mobilityFiller: { activity: 'Mobility & Movement Prep Flow', duration: 8, targetRpe: 2, timing: 'post_session' as const, reason: 'Optional', is_filler: true } }
  const meso = MESO.map(w => (w.week_number === WEEK.week_number ? { ...w, days: w.days.map(d => (d.day === DAY.day ? withFiller : d)) } : w)) as MesocycleWeek[]
  const p5 = planLighterToday({ mesocycle: meso, profile: PROFILE, weekNumber: WEEK.week_number, dayName: DAY.day, sayDay: 'Today' })
  const line = p5.ok ? p5.lines.find(l => /^About \d+ → \d+ min\.$/.test(l)) ?? null : null
  const said = line ? /^About (\d+) → (\d+) min\.$/.exec(line)!.slice(1).map(Number) : null
  const parts = dayLengthParts(withFiller as never)
  const after5 = p5.ok ? p5.mesocycle.find(w => w.week_number === WEEK.week_number)!.days.find(d => d.day === DAY.day)! : null
  check('the fixture binds: the day\'s optional minutes make its total differ from its work', parts.optionalMinutes === 8 && Math.round(estimateDaySeconds(withFiller as never) / 60) === parts.workMinutes + 8, parts)
  check('it states a length line for a day that got shorter', !!said, p5.ok ? p5.lines : p5.refusal)
  check('the "before" is the session\'s work, the number on its header', !!said && said[0] === parts.workMinutes, { said, work: parts.workMinutes })
  check('...and the "after" is the eased session\'s work', !!said && !!after5 && said[1] === dayLengthParts(after5).workMinutes, { said, after: after5 ? dayLengthParts(after5).workMinutes : null })
}

console.log('\n6. At the plan\'s set floor: one set off each, never under one, the reason first')
{
  // Constructed so the case binds: every exercise at its role's floor, so the ordinary step moves nothing.
  const { getExerciseEntry, getVolumeRole } = await import('../src/lib/exercise-db')
  const { getRoleSetFloor } = await import('../src/lib/exercise-plan')
  const { adjustDayVolume } = await import('../src/lib/volume-adjust')
  const atFloor = { ...DAY, exercises: DAY.exercises.map(e => { const en = getExerciseEntry(e.name); const r = en ? getVolumeRole(en) : null; return { ...e, sets: r ? getRoleSetFloor(r) : 2 } }) }
  const meso = MESO.map(w => (w.week_number === WEEK.week_number ? { ...w, days: w.days.map(d => (d.day === DAY.day ? atFloor : d)) } : w)) as MesocycleWeek[]
  check('the fixture binds: the ordinary step moves nothing on it', !adjustDayVolume(atFloor as never, 'lighter', PROFILE).changed)
  const p6 = planLighterToday({ mesocycle: meso, profile: PROFILE, weekNumber: WEEK.week_number, dayName: DAY.day, sayDay: 'Today' })
  check('the step is taken at the floor', p6.ok, p6.ok ? undefined : p6.refusal)
  check('...saying first that the session is at the fewest sets the plan uses', p6.ok && p6.lines.some(l => /^Today's session is already at the fewest sets the plan uses \(\d+ across \d+ exercises\)\./.test(l)), p6.ok ? p6.lines : null)
  const a6 = p6.ok ? p6.mesocycle.find(w => w.week_number === WEEK.week_number)!.days.find(d => d.day === DAY.day)! : null
  const roleOf = (n: string) => { const en = getExerciseEntry(n); return en ? getVolumeRole(en) : null }
  check('the fixture holds a warm-up move (no volume role) with sets to take, to be left alone', atFloor.exercises.some(e => roleOf(e.name) === null && (e.sets ?? 0) > 1), atFloor.exercises.map(e => e.name))
  check('...every training exercise above one set loses exactly one', !!a6 && atFloor.exercises.every(e => { const x = a6.exercises.find(y => y.name === e.name); const want = roleOf(e.name) !== null && (e.sets ?? 0) > 1 ? (e.sets ?? 0) - 1 : (e.sets ?? 0); return !!x && (x.sets ?? 0) === want }), a6?.exercises.map(e => [e.name, e.sets]))
  check('...and the warm-up move keeps its sets', !!a6 && atFloor.exercises.filter(e => roleOf(e.name) === null).every(e => a6.exercises.find(y => y.name === e.name)?.sets === e.sets))
  check('...no exercise goes under one set, and none is lost', !!a6 && a6.exercises.length === atFloor.exercises.length && a6.exercises.every(e => (e.sets ?? 0) >= 1))
  check('...and the weights do not move', !!a6 && a6.exercises.every(e => { const x = atFloor.exercises.find(y => y.name === e.name); return !x || json(x.suggested_load) === json(e.suggested_load) }))
  const ones = { ...DAY, exercises: DAY.exercises.map(e => ({ ...e, sets: 1 })) }
  const meso1 = MESO.map(w => (w.week_number === WEEK.week_number ? { ...w, days: w.days.map(d => (d.day === DAY.day ? ones : d)) } : w)) as MesocycleWeek[]
  const p1 = planLighterToday({ mesocycle: meso1, profile: PROFILE, weekNumber: WEEK.week_number, dayName: DAY.day, sayDay: 'Today' })
  check('one set of everything is the only stop, and it says what is still possible', !p1.ok && /one set of each exercise/.test(p1.refusal) && /shorten it/.test(p1.refusal), p1)
}

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.error(`${failures} lighter-today check(s) FAILED.`); process.exit(1) }
console.log('Make it easier is shown first, changes only today, and can be put back.')

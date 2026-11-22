// test:persona-audit-fixes — the fixes from the 6,000-plan persona audit (his "b, and fix all the others too",
// 22 Nov 2026). Each section names the audit rule it holds, uses the audit's own sampled people where the measured case
// lives (scripts/audit-personas.ts profileFor), and carries a contrast showing its fixture binds.
process.env.AUDIT_LIB = '1'
const { profileFor } = await import('./audit-personas')
const { generateMesocycle, setRandomSource, daysDroppedForRecovery, beginnerWorkingSets, BEGINNER_MAX_WORKING_SETS, LOWER_BACK_MAX_WORKING_SETS } = await import('../src/lib/exercise-plan')
const { seededRngFromKey } = await import('../src/lib/seeded-random')
const { getExerciseEntry } = await import('../src/lib/exercise-db')
const { getSessionMaximumSeconds, estimateDaySeconds } = await import('../src/lib/session-duration')
const { lateReplacementKind } = await import('../src/lib/pregnancy-rules')
import type { UserProfile, MesocycleWeek } from '../src/lib/types'

let passed = 0
let failed = 0
const check = (name: string, ok: boolean, detail: unknown = '') => {
  if (ok) { passed++; console.log(`  ok: ${name}`) }
  else { failed++; console.log(`  FAIL: ${name} — ${JSON.stringify(detail).slice(0, 300)}`) }
}
const quiet = <T,>(f: () => T): T => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return f() } finally { console.log = l; console.warn = w } }
const planOf = (p: UserProfile, key: string): MesocycleWeek[] => quiet(() => { setRandomSource(seededRngFromKey(key)); return generateMesocycle(p) })
const audited = (i: number) => { const { p, key } = profileFor(i); return { p, m: planOf(p, key) } }
const ALL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const someone = (o: Partial<UserProfile>, days: string[]): UserProfile => ({
  age: 40, gender: 'female', height_cm: 166, weight_kg: 70, activity_level: 'lightly_active', fitness_goal: 'fat_loss', start_preference: 'train',
  equipment_access: 'full_gym', session_duration_preference: '45-60', training_style: 'hybrid', training_experience: 'intermediate', injuries: [],
  health_conditions: [], recovery_capacity: 'moderate', workout_split_preference: 'ai_recommendation', conditioning_preference: 'tolerate', concurrent_activities: [], ...o,
  training_days: ALL.map(d => ({ day: d, available: days.includes(d) })),
} as UserProfile)
const trainingDays = (m: MesocycleWeek[]) => m[0].days.filter(d => d.exercises.length).map(d => d.day)

console.log('test:persona-audit-fixes\n')

console.log('1. Low recovery trains four days at most, spread round the week, and the same function names the rest days (C9)')
const five = ['Monday', 'Tuesday', 'Wednesday', 'Friday', 'Saturday'], six = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
check('5 chosen: one rests, never leaving two days in a row where a spread exists (Tuesday)', JSON.stringify(daysDroppedForRecovery(someone({ recovery_capacity: 'low' }, five))) === '["Tuesday"]', daysDroppedForRecovery(someone({ recovery_capacity: 'low' }, five)))
check('6 chosen: two rest, down to 4 (it had kept 5)', daysDroppedForRecovery(someone({ recovery_capacity: 'low' }, six)).length === 2, daysDroppedForRecovery(someone({ recovery_capacity: 'low' }, six)))
check('7 chosen: three rest', daysDroppedForRecovery(someone({ recovery_capacity: 'low' }, ALL)).length === 3)
check('4 chosen: none rest', daysDroppedForRecovery(someone({ recovery_capacity: 'low' }, ['Monday', 'Tuesday', 'Wednesday', 'Thursday'])).length === 0)
check('moderate recovery: none rest (the contrast)', daysDroppedForRecovery(someone({}, six)).length === 0)
const lowSix = planOf(someone({ recovery_capacity: 'low' }, six), 'pa6low')
const restedSix = daysDroppedForRecovery(someone({ recovery_capacity: 'low' }, six))
check('the plan trains exactly the four the function keeps', trainingDays(lowSix).length === 4 && trainingDays(lowSix).every(d => !restedSix.includes(d)), { days: trainingDays(lowSix), restedSix })
const order = trainingDays(lowSix).map(d => ALL.indexOf(d)).sort((a, b) => a - b)
check('...never three days in a row', !order.some((x, k) => order[k + 2] === x + 2), trainingDays(lowSix))
check('a moderate-recovery plan trains all six (the fixture binds)', trainingDays(planOf(someone({}, six), 'pa6mod')).length === 6)

console.log('\n2. Fat loss always gets its conditioning, as its own session when every day is a heavy one (C10)')
for (const i of [0, 35, 46]) {
  const { p, m } = audited(i)
  const missing = m.filter(w => !w.is_deload && !w.days.some(d => d.recommendedCardio)).map(w => w.week_number)
  check(`audit person #${i} (${p.training_experience}, ${p.session_duration_preference}, recovery ${p.recovery_capacity}): conditioning every loading week (it had none)`, missing.length === 0, missing)
  check(`...as its own session, never added onto a lifting session`, m[0].days.some(d => d.recommendedCardio?.timing === 'independent_session') && m.every(w => w.days.every(d => d.recommendedCardio?.timing !== 'post_session')), m[0].days.map(d => d.recommendedCardio?.timing))
}
const hyp = planOf(someone({ fitness_goal: 'hypertrophy', training_experience: 'beginner', session_duration_preference: '30-45', conditioning_preference: 'avoid' }, ['Monday', 'Wednesday', 'Friday']), 'pahyp')
check('a muscle-gain beginner who avoids cardio is not handed one (the goal and the answer decide, not this rule)', !hyp[0].days.some(d => d.recommendedCardio?.timing === 'independent_session'), hyp[0].days.map(d => d.recommendedCardio))

console.log('\n3. A lighter week never holds more working sets than the cap (S9)')
for (const [i, cap] of [[2830, BEGINNER_MAX_WORKING_SETS], [4443, BEGINNER_MAX_WORKING_SETS], [5713, LOWER_BACK_MAX_WORKING_SETS]] as const) {
  const { m } = audited(i)
  const over = m.filter(w => w.is_deload).flatMap(w => w.days.filter(d => d.exercises.length && beginnerWorkingSets(d) > cap).map(d => `w${w.week_number} ${d.day} ${beginnerWorkingSets(d)}`))
  check(`audit person #${i}: every deload session ${cap} sets or fewer (it held ${cap + 2})`, over.length === 0, over)
}

console.log('\n4. One lift, one weight a week at the same reps (C7)')
{
  const { m } = audited(5722)
  const two = m.flatMap(w => { const kg = w.days.flatMap(d => d.exercises.filter(e => e.name === 'Single-Leg Leg Press').map(e => `${e.reps}|${e.suggested_load_kg}`)); return new Set(kg.map(k => k.split('|')[0])).size < new Set(kg).size ? [`w${w.week_number}`] : [] })
  const both = m.filter(w => w.days.filter(d => d.exercises.some(e => e.name === 'Single-Leg Leg Press')).length >= 2).length
  check('audit person #5722: the single-leg leg press is on two days of a week (the fixture binds)', both > 0, both)
  check('...at one weight (it read 30 kg a leg on Monday, 17.5 on Friday)', two.length === 0, two)
}

console.log('\n5. Pregnant and older trainees\' sessions keep to the time asked, warm-up additions included (C8b)')
{
  let over = 0, plans = 0, overMin = 0
  for (const i of [1, 2, 3, 4, 5, 6, 7, 24, 25, 26, 27, 28, 29, 30, 47, 48, 49, 50, 51, 52, 53]) {
    const { p, m } = audited(i)
    if (!((p.health_conditions ?? []).includes('pregnancy') || (p.age ?? 0) >= 60)) continue
    plans++
    const max = getSessionMaximumSeconds(p.session_duration_preference as never)
    for (const w of m.filter(x => !x.is_deload)) for (const d of w.days) if (d.exercises.length && estimateDaySeconds(d) > max) { over++; overMin = Math.max(overMin, (estimateDaySeconds(d) - max) / 60) }
  }
  check(`the fixture is pregnant and older people (${plans} plans)`, plans >= 12, plans)
  // Not zero: a 20-30 minute pregnant session (main lift, a paired press and row, one set of trunk work, a ten-minute
  // warm-up with pelvic floor work) can sit seconds past 30 with nothing left to take but rest or the main lift, which his
  // rulings protect. Named in BACKLOG; the bound is literal (it was up to ten minutes).
  check(`no loading session more than a minute past the top of the range asked for (it was up to ten; ${over} sessions within it)`, overMin <= 1, { over, worstMinutesOver: overMin.toFixed(1) })
}

{
  // ...and the pelvic floor minutes come out of the WARM-UP, not the lifting: the same short day, pregnant or not, gets a
  // general warm-up shorter by about the pelvic floor work's 150 seconds (measured over the audit's pregnant plans:
  // without this the lifting gave the time back, 3,320 fewer working sets).
  const { buildWarmup } = await import('../src/lib/warmup')
  const ctx = { patterns: ['knee_dominant', 'horizontal_push', 'horizontal_pull'] as never, compounds: [{ entry: getExerciseEntry('Goblet Squats')!, suggestedLoadKg: 12 }], equipment: 'full_gym' as const, injuries: [], experience: 'intermediate' as const, budgetSeconds: 600 }
  const gen = (w: { general: { duration_seconds: number }[]; mobility: { duration_seconds: number }[] }) => [...w.general, ...w.mobility].reduce((n, x) => n + x.duration_seconds, 0)
  const plain = gen(buildWarmup(ctx)), pregnant = gen(buildWarmup({ ...ctx, pregnant: true }))
  check(`a pregnant trainee's warm-up makes room for the pelvic floor work (${plain}s -> ${pregnant}s before it is added)`, plain - pregnant >= 120, { plain, pregnant })
}

console.log('\n6. From 28 weeks pregnant a hinge stays a hinge (C1)')
check('a single-leg RDL is replaced from the hinge list', lateReplacementKind('Single-Leg RDL (Bodyweight)', 'hip_hinge') === 'hinge')
check('...and a lunge still from the legs list', lateReplacementKind('Walking Lunges', 'single_leg') === 'legs')
for (const i of [2, 4, 72, 325]) {
  const { p, m } = audited(i)
  const noHinge = m.filter(w => !w.is_deload && w.days.some(d => d.exercises.length) && !w.days.some(d => d.exercises.some(e => getExerciseEntry(e.name)?.movement_pattern === 'hip_hinge' && getExerciseEntry(e.name)?.mechanics_tier !== 'primer'))).map(w => w.week_number)
  check(`audit person #${i} (pregnant, ${p.equipment_access}, ${p.training_style}): a hinge every loading week (it lost it from 28 weeks)`, noHinge.length === 0, noHinge)
}

console.log('\n7. One heavy floor pull a week, on the hinge day, in the long and many-day weeks the earlier fix missed (C3)')
{
  const { getMovementFamily } = await import('../src/lib/exercise-db')
  const isFloorPull = (n: string) => { const e = getExerciseEntry(n); return !!e && e.mechanics_tier === 'tier1_compound' && getMovementFamily(e) === 'deadlift' }
  let anyPull = 0
  for (const i of [208, 1700, 2500, 449]) {
    const { m } = audited(i)
    const two = m.filter(w => !w.is_deload && w.days.filter(d => d.exercises.some(e => isFloorPull(e.name))).length >= 2).map(w => w.week_number)
    if (m.some(w => w.days.some(d => d.exercises.some(e => isFloorPull(e.name))))) anyPull++
    check(`audit person #${i}: never two floor-pull days in a week (it had one every week)`, two.length === 0, two)
  }
  check('...and these plans still pull from the floor once a week (the fix moves it, never deletes it)', anyPull >= 3, anyPull)
  // ...and on the hinge day: a full-body day built before a hinge-led day leaves the floor pull to it (a coach puts the
  // deadlift where the day is about hinging, and gives the full-body day a squat).
  for (const i of [2500, 449]) {
    const { m } = audited(i)
    const where = m[0].days.filter(d => d.exercises.some(e => isFloorPull(e.name))).map(d => d.focus)
    check(`audit person #${i}: the week's floor pull is on its Pull & Hinge day`, where.length === 1 && /Hinge/.test(where[0]), where)
  }
}

console.log(`\n${passed + failed} checks ran: ${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)

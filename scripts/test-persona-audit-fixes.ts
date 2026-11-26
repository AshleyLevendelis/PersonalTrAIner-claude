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
  // RE-ANCHORED 26 Nov 2026: this read person #5722, whose plan no longer holds the lift on two days (its picks changed
  // when band and improvised moves stopped being taken ahead of loadable ones). #5730 does, in week 5, so the "two days,
  // one weight" property still has a week where it binds; the check below still fails on a fixture that does not.
  const { m } = audited(5730)
  const two = m.flatMap(w => { const kg = w.days.flatMap(d => d.exercises.filter(e => e.name === 'Single-Leg Leg Press').map(e => `${e.reps}|${e.suggested_load_kg}`)); return new Set(kg.map(k => k.split('|')[0])).size < new Set(kg).size ? [`w${w.week_number}`] : [] })
  const both = m.filter(w => w.days.filter(d => d.exercises.some(e => e.name === 'Single-Leg Leg Press')).length >= 2).length
  check('audit person #5730: the single-leg leg press is on two days of a week (the fixture binds)', both > 0, both)
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

console.log('\n9. Round two (his "yes fix the remaining ones too", 22 Nov 2026)')
{
  const { getMovementFamily: fam, isGenuineDuplicate, isIndicatedFor } = await import('../src/lib/exercise-db')
  const { prescribeAddedLoad } = await import('../src/lib/load-prescription')
  const { PREGNANCY_LATE_EXCLUDED } = await import('../src/lib/pregnancy-rules')
  const { getSessionMinimumSeconds } = await import('../src/lib/session-duration')
  void fam
  const ent = (n: string) => getExerciseEntry(n)
  const loadingWeeks = (m: MesocycleWeek[]) => m.filter(w => !w.is_deload)
  const sets = (w: MesocycleWeek, ps: string[]) => w.days.reduce((n, d) => n + d.exercises.filter(e => { const x = ent(e.name); return !!x && x.mechanics_tier !== 'primer' && ps.includes(x.movement_pattern) }).reduce((a, e) => a + (e.sets ?? 0), 0), 0)
  const knee = new Set(['knee'])

  // C16: a day that loads the knee carries the knee's rehab, whatever the day is called.
  {
    const { m } = audited(746)
    const kneeDays = loadingWeeks(m).flatMap(w => w.days.filter(d => d.exercises.some(e => { const x = ent(e.name); return !!x && x.mechanics_tier !== 'primer' && ['knee_dominant', 'single_leg', 'isolation_quad', 'lunge'].includes(x.movement_pattern) && !isIndicatedFor(x, knee) })))
    const bare = kneeDays.filter(d => !d.exercises.some(e => { const x = ent(e.name); return !!x && isIndicatedFor(x, knee) }))
    check('C16 #746: every day that loads a bad knee carries knee rehab (a Chest & Triceps day with the week\'s leg press had none)', kneeDays.length > 0 && bare.length === 0, bare.map(d => d.focus).slice(0, 3))
  }

  // C14: dumbbells on a step-up up to 15 reps; a belt on a pull-up still stops at 10.
  {
    const p = someone({ training_experience: 'intermediate' }, ['Monday', 'Wednesday', 'Friday'])
    const step = prescribeAddedLoad(ent('Low Box Step-Up')!, p, { repRangeLabel: '12-14', phase: 'hypertrophy', isDeload: false })
    const pull = prescribeAddedLoad(ent('Pull-Ups')!, p, { repRangeLabel: '12-14', phase: 'hypertrophy', isDeload: false })
    const step16 = prescribeAddedLoad(ent('Low Box Step-Up')!, p, { repRangeLabel: '16-18', phase: 'hypertrophy', isDeload: false })
    check('C14: a step-up at 12-14 reps in a muscle-building block takes weight', !!step && step.added_kg > 0, step)
    check('...a pull-up at the same reps takes no belt (the contrast: the rule is the leg one)', pull == null, pull)
    check('...and a step-up past 15 reps takes none', step16 == null, step16)
    const { m } = audited(930)
    check('C14 #930: the trained lifter\'s step-ups are weighted in the muscle-building block', m.some(w => !w.is_deload && w.days.some(d => d.exercises.some(e => e.name === 'Low Box Step-Up' && (e.suggested_added_load_kg ?? 0) > 0))))
  }

  // C21: late in pregnancy, a replacement is never a copy of a lift already on the day.
  for (const i of [27, 394, 1223]) {
    const { m } = audited(i)
    const copies = m.flatMap(w => w.days.flatMap(d => { const xs = d.exercises.map(e => ent(e.name)).filter((x): x is NonNullable<typeof x> => !!x && x.mechanics_tier !== 'primer')
      return xs.flatMap((a, k) => xs.slice(k + 1).filter(b => isGenuineDuplicate(a, b)).map(b => `w${w.week_number} ${a.name}+${b.name}`)) }))
    check(`C21 #${i}: no day holds the same movement twice (an air squat beside a bodyweight box squat)`, copies.length === 0, copies.slice(0, 3))
  }

  // Late pregnancy: a row from a plank is out; cardio stays cardio.
  check('a renegade row and a bear crawl are on the late-pregnancy list (plank shoulder taps already were)', PREGNANCY_LATE_EXCLUDED.has('Renegade Row') && PREGNANCY_LATE_EXCLUDED.has('Bear Crawl'))
  check('...a row is replaced by a row, cardio by cardio', lateReplacementKind('Renegade Row', 'horizontal_pull') === 'pull' && lateReplacementKind('Mountain Climbers', 'cardio') === 'cardio' && lateReplacementKind('Plank', 'core') === 'core')
  {
    const { m } = audited(4558)
    const noCardio = loadingWeeks(m).filter(w => !w.days.some(d => d.recommendedCardio || d.exercises.some(e => ent(e.name)?.mechanics_tier === 'cardio'))).map(w => w.week_number)
    check('C10 #4558 (31 weeks pregnant, fat loss): cardio every loading week (her mountain climbers had become a side plank)', noCardio.length === 0, noCardio)
    check('...and no renegade row anywhere in her plan', !m.some(w => w.days.some(d => d.exercises.some(e => e.name === 'Renegade Row'))))
  }

  // C1: a 20-30 minute week is not made to cover a second plane, so its only squat is never swapped away for one.
  for (const i of [123, 388, 588]) {
    const { m } = audited(i)
    const none = loadingWeeks(m).filter(w => sets(w, ['knee_dominant', 'single_leg']) === 0).map(w => w.week_number)
    check(`C1 #${i}: a squat-pattern exercise every loading week (a two-day week's step-ups had been swapped for a pulldown)`, none.length === 0, none)
  }

  // C8b / C8a: short sessions fit, and the warm-up is what gave.
  for (const i of [36, 38, 44, 140, 168, 588, 1252]) {
    const { p, m } = audited(i)
    const hi = getSessionMaximumSeconds(p.session_duration_preference)
    const over = loadingWeeks(m).flatMap(w => w.days.filter(d => d.exercises.length && estimateDaySeconds(d) > hi).map(d => `w${w.week_number} ${d.day} ${(estimateDaySeconds(d) / 60).toFixed(1)}`))
    check(`C8b #${i} (${p.session_duration_preference}): no loading-week session past the time asked for`, over.length === 0, over.slice(0, 3))
  }
  {
    const { p, m } = audited(48)
    const lifting = loadingWeeks(m).flatMap(w => w.days.filter(d => d.exercises.length))
    check('C8b #48 (pregnant): the pelvic floor work stays in every training day\'s warm-up', lifting.every(d => d.warmup?.mobility.some(x => /Pelvic Floor/.test(x.name))), p.due_date)
  }
  // The warm-up trim never takes the pelvic floor work (S5), found binding on these two by switching its guard off.
  for (const i of [97, 140]) {
    const { m } = audited(i)
    const bare = loadingWeeks(m).flatMap(w => w.days.filter(d => d.exercises.length && !d.warmup?.mobility.some(x => /Pelvic Floor/.test(x.name))).map(d => `w${w.week_number} ${d.day}`))
    check(`S5 #${i}: pelvic floor work in every training day's warm-up, however short the session`, bare.length === 0, bare.slice(0, 3))
  }
  // A conditioning day's own block counts as one of its three (3812: three trunk exercises beside the circuit ran over).
  {
    const { p, m } = audited(3812)
    const hi = getSessionMaximumSeconds(p.session_duration_preference)
    const over = loadingWeeks(m).flatMap(w => w.days.filter(d => d.focus === 'Conditioning & Core' && estimateDaySeconds(d) > hi).map(d => `w${w.week_number}`))
    check('C8b #3812: a Conditioning & Core day fits its time (its circuit counts toward the three exercises a day keeps)', over.length === 0, over)
  }
  // ...and a second trunk exercise is dropped as spare only while the week keeps two (C2).
  for (const i of [2436, 2566]) {
    const { m } = audited(i)
    const thin = loadingWeeks(m).filter(w => sets(w, ['core']) > 0 && w.days.reduce((n, d) => n + d.exercises.filter(e => { const x = ent(e.name); return x?.movement_pattern === 'core' && x.mechanics_tier !== 'primer' }).length, 0) < 2).map(w => w.week_number)
    check(`C2 #${i}: trunk work at least twice every loading week`, thin.length === 0, thin)
  }
  {
    const { p, m } = audited(5721)
    const lo = getSessionMinimumSeconds(p.session_duration_preference)
    const short = loadingWeeks(m).flatMap(w => w.days.filter(d => d.exercises.length && estimateDaySeconds(d) < lo).map(d => `w${w.week_number} ${d.day}`))
    check('C8a #5721: no session under the time asked for (a dropped press left a Chest & Triceps day at 28 of 30-45 minutes)', short.length === 0, short)
  }
  {
    // A 20-30 session's build-ups: the first without its empty-bar set or its near-max single, a later one a single feeder.
    const { m } = audited(815)
    const ramps = loadingWeeks(m).flatMap(w => w.days.flatMap(d => d.warmup?.ramp_ups ?? []))
    check('a 20-30 minute session\'s first build-up has no empty-bar set and nothing over 85%', ramps.length > 0 && ramps.filter(r => !r.abbreviated).every(r => r.sets.every(st => st.load_percent > 0 && st.load_percent <= 85)), ramps.slice(0, 2))
    check('...and a later lift\'s build-up is one feeder set', ramps.some(r => r.abbreviated) && ramps.filter(r => r.abbreviated).every(r => r.sets.length === 1), ramps.filter(r => r.abbreviated).slice(0, 2).map(r => r.sets.length))
    const long = planOf(someone({ session_duration_preference: '60-90', training_experience: 'advanced' }, ['Monday', 'Wednesday', 'Friday']), 'pa-long-ramps')
    check('...a 60-90 minute session keeps the full build-up (the fixture binds: the rule is the short session)', long.some(w => w.days.some(d => d.warmup?.ramp_ups.some(r => r.sets.some(st => st.load_percent === 0)))))
  }

  // C18 / C17: a press-heavy week gives a pull a set first (on the lighter day, with the minutes); a week keeps four chest sets.
  {
    const { m } = audited(207)
    const heavy = loadingWeeks(m).filter(w => { const pull = sets(w, ['horizontal_pull', 'vertical_pull']); return pull > 0 && sets(w, ['horizontal_push', 'vertical_push']) > pull * 1.5 }).map(w => w.week_number)
    check('C18 #207: no loading week pushes more than 1.5x what it pulls (push-ups at four sets beside a two-set row)', heavy.length === 0, heavy)
  }
  {
    const { m } = audited(36)
    const low = loadingWeeks(m).filter(w => sets(w, ['horizontal_pull', 'vertical_pull']) < 4).map(w => w.week_number)
    check('C17 #36: four back sets every loading week (a bodyweight week\'s only pull was a two-set table row)', low.length === 0, low)
  }
  {
    const { m } = audited(112)
    const low = loadingWeeks(m).filter(w => sets(w, ['horizontal_push', 'isolation_chest']) < 4).map(w => w.week_number)
    check('C17 #112: four chest sets every loading week (the bench\'s fourth set went to keep two sets of lateral raises)', low.length === 0, low)
  }
}

console.log('\n10. Round three (his "Yes fix all the problems", 23 Nov 2026): every plan each rule still caught, judged by the audit itself')
{
  const { auditOne } = await import('./audit-personas')
  // The plans the audit named on 23 Nov 2026 before this round (and the three the first version of it broke), by rule.
  // Each is judged by the audit's own detector, so a fix cannot pass here and fail there.
  const PINNED: Record<string, number[]> = {
    C18: [168, 457, 467, 1114, 1129, 1153, 1804, 1886, 2050, 2053, 5833],
    C13: [1503, 1513, 2801, 2830, 4443, 2103, 4896],
    C15: [35, 267, 526, 1489, 1804, 1880, 1932, 2059, 3401, 3808, 4809, 5622],
    C17: [467, 1129, 1591, 1844, 2616, 2969, 3039, 5314],
    C8b: [48, 78, 123, 323, 5613, 714, 815],
    C1: [3192],
  }
  const cache = new Map<number, Record<string, string[]>>()
  const breaches = (i: number) => { if (!cache.has(i)) cache.set(i, quiet(() => auditOne(i))); return cache.get(i)! }
  const TEXT: Record<string, string> = {
    C18: 'pushing never more than 1.5x pulling (a spare press becomes pulling; a pull the week needs goes last in every trim)',
    C13: 'front and back of the thigh in balance (a spare hinge becomes a squat; weighed again inside the beginner cap)',
    C15: 'an even week (the light day takes sets, or the heaviest gives)',
    C17: 'four chest and back sets a week (a trim takes a spare exercise before a set the week needs)',
    C8b: 'no session past the time asked for (the last stretch, the long build-up, then the bike, before the clock)',
    C1: 'every loading week squats, hinges, pushes and pulls (the cap never takes a day\'s last of one)',
  }
  for (const [rule, ids] of Object.entries(PINNED)) {
    const still = ids.filter(i => (breaches(i)[rule] ?? []).length > 0)
    check(`${rule}: ${TEXT[rule]} — ${ids.length} named plans`, still.length === 0, still.map(i => `#${i} ${breaches(i)[rule]?.[0]}`))
  }
  // ...and none of those plans breaks ANY rule now (a fix for one rule must not buy a breach of another, the shape of the
  // three this round's first version caused).
  const all = [...new Set(Object.values(PINNED).flat())]
  const any = all.filter(i => Object.values(breaches(i)).some(b => b.length > 0))
  check(`none of the ${all.length} named plans breaks any of the audit's rules`, any.length === 0, any.map(i => `#${i} ${Object.keys(breaches(i)).join(',')}`))
}

console.log(`\n${passed + failed} checks ran: ${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)

// ---------------------------------------------------------------------------
// test:coach-read — what a coach changed after reading generated plans (18 Nov 2026, the Fable pass on plans; CSCS).
// docs/plans/coach-read-of-plans.md has the counts and the basis for each.
//
//   1. only the day's main lift goes under six reps ("Walking Lunges 2x3-5 @38 kg a hand", "Push-Ups 4x4-6")
//   2. a warm-up drill's reps do not move with the block or the week ("Arm Circles 2x3" in a strength block)
//   3. two weights no coach would write (a 48 kg dumbbell leg curl, a 20 kg-a-hand kickback)
//   4. a week's lower-body main lifts alternate (a two-day beginner deadlifting both days, no squat)
//
// Plans are seeded. The people in section 1 are the ones the old floor was worst for (measured), so the rule binds.
// Every check runs every time.
// ---------------------------------------------------------------------------
import type { UserProfile, MesocycleWeek } from '../src/lib/types'

let failures = 0
let ran = 0
// A full-body day under either name: a beginner's or novice's is "Full Body Strength" since 21 Nov 2026, the same track.
const isFullBody = (focus: string) => focus === 'Full Body Power' || focus === 'Full Body Strength'
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ''}`) }
}

async function main() {
  const ep = await import('../src/lib/exercise-plan')
  const per = await import('../src/lib/periodization')
  const lp = await import('../src/lib/load-prescription')
  const { seededRngFromKey } = await import('../src/lib/seeded-random')
  const { getExerciseEntry, EXERCISE_DATABASE, EXPLOSIVE_PREP_GROUPS } = await import('../src/lib/exercise-db')

  const DAYN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const picks: Record<number, number[]> = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5] }
  const prof = (o: Record<string, unknown>): UserProfile => ({
    age: 34, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate', fitness_goal: 'hypertrophy', preferred_time: 'morning',
    bmr: 1750, tdee: 2500, equipment_access: 'full_gym', injuries: [], training_style: 'hybrid', workout_split_preference: 'ai_recommendation',
    training_experience: 'intermediate', session_duration_preference: '45-60',
    training_days: DAYN.map((day, i) => ({ day, available: picks[(o.n as number) ?? 3].includes(i) })),
    weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [], macro_calculation_mode: 'STANDARD_STATIC', coaching_persona: 'supportive',
    recovery_capacity: 'moderate', conditioning_preference: 'tolerate', ...o,
  } as unknown as UserProfile)
  const quiet = <T,>(fn: () => T): T => {
    const d = console.debug, w = console.warn, l = console.log
    console.debug = () => {}; console.warn = () => {}; console.log = () => {}
    try { return fn() } finally { console.debug = d; console.warn = w; console.log = l }
  }
  const seeded = <T,>(key: string, fn: () => T): T => { ep.setRandomSource(seededRngFromKey(key)); try { return quiet(fn) } finally { ep.resetRandomSource() } }
  const bottomOf = (reps: unknown): number | null => { const m = String(reps).match(/^(\d+)\s*-\s*(\d+)$/) ?? String(reps).match(/^(\d+)$/); return m ? Number(m[1]) : null }

  // ---------------------------------------------------------------- 1
  console.log('\n1. Only the main lift goes under six reps')
  const f = per.repFloorFor
  check('the floor for everything but the main lift is six', per.ASSISTANCE_REP_FLOOR === 6)
  check('an advanced lifter\'s side lift starts at six, the main lift at three', f(3, per.PHASE_CONFIGS.strength, false) === 6 && f(3, per.PHASE_CONFIGS.strength, true) === 3, [f(3, per.PHASE_CONFIGS.strength, false), f(3, per.PHASE_CONFIGS.strength, true)])
  check('a beginner\'s floor of eight is never lowered by it', f(8, per.PHASE_CONFIGS.strength, false) === 8 && f(8, per.PHASE_CONFIGS.strength, true) === 8)
  check('the main lift still takes the phase\'s own floor (hypertrophy 6, conditioning 10)', f(3, per.PHASE_CONFIGS.hypertrophy, true) === 6 && f(3, per.PHASE_CONFIGS.metabolic, true) === 10 && f(3, per.PHASE_CONFIGS.metabolic, false) === 6)
  check('with no phase (the base week) a side lift is still floored and the main lift is not', f(3, null, false) === 6 && f(3, null, true) === 3)

  // The people the old floor was worst for: advanced and intermediate, in plans that reach a strength or power block.
  const HEAVY: Record<string, unknown>[] = [
    { fitness_goal: 'hypertrophy', training_experience: 'advanced', equipment_access: 'full_gym', training_style: 'combat', n: 4 },
    { fitness_goal: 'functional', training_experience: 'advanced', equipment_access: 'minimalist', training_style: 'functional', n: 4 },
    { fitness_goal: 'fat_loss', training_experience: 'advanced', equipment_access: 'home_gym', training_style: 'combat', n: 3 },
    { fitness_goal: 'hypertrophy', training_experience: 'intermediate', equipment_access: 'full_gym', training_style: 'bodybuilding', n: 4 },
    { fitness_goal: 'functional', training_experience: 'intermediate', equipment_access: 'home_gym', training_style: 'hybrid', n: 3 },
    { fitness_goal: 'conditioning', training_experience: 'intermediate', equipment_access: 'minimalist', training_style: 'combat', n: 3 },
  ]
  const plans: { who: Record<string, unknown>; profile: UserProfile; plan: MesocycleWeek[] }[] = HEAVY.map((who, i) => {
    const profile = prof(who)
    return { who, profile, plan: seeded(`coach-read-${i}`, () => ep.generateMesocycle(profile, ep.generateExercisePlan(profile).plan)) }
  })
  const sideUnder: string[] = []
  let sideAtFloorHeavy = 0, mainUnder = 0, sideSlots = 0
  for (const { who, plan } of plans) for (const w of plan) for (const d of w.days) for (const e of d.exercises) {
    const entry = getExerciseEntry(e.name)
    const bottom = bottomOf(e.reps)
    if (!entry || bottom == null || entry.mechanics_tier === 'primer' || entry.mechanics_tier === 'cardio') continue
    if (entry.mechanics_tier === 'tier1_compound') { if (bottom < 6) mainUnder++; continue }
    sideSlots++
    if (bottom < 6) sideUnder.push(`${e.name} ${e.sets}x${e.reps} W${w.week_number} ${w.phase_label} ${JSON.stringify(who)}`)
    if (bottom === 6 && /Strength|Power/.test(w.phase_label ?? '')) sideAtFloorHeavy++
  }
  check('six real plans, sixteen weeks each, over 1,200 side-lift slots (measured 1,372)', plans.length === 6 && plans.every(p => p.plan.length === 16) && sideSlots > 1200, sideSlots)
  check('no lift that is not the main lift has a range starting under six, in any week', sideUnder.length === 0, sideUnder.slice(0, 4))
  check('the floor binds: over 90 side lifts sit exactly at six in a strength or power block (measured 115; they were 3-5 and 4-6)', sideAtFloorHeavy > 90, sideAtFloorHeavy)
  check('the main lift is untouched: it still goes under six reps in these plans (over 50 times)', mainUnder > 50, mainUnder)
  // The first week as it is first assigned (before any block is applied) is held to it too: a combat plan bases its
  // side lifts at 6-8 and a fat-loss goal pulls every range two reps lower.
  const baseUnder: string[] = []
  let baseSide = 0
  for (const [i, who] of [...HEAVY, { fitness_goal: 'fat_loss', training_experience: 'advanced', equipment_access: 'full_gym', training_style: 'combat', n: 5 }].entries()) {
    for (const d of seeded(`coach-read-base-${i}`, () => ep.generateExercisePlan(prof(who)).plan)) for (const e of d.exercises) {
      const entry = getExerciseEntry(e.name)
      const bottom = bottomOf(e.reps)
      if (!entry || bottom == null || entry.mechanics_tier !== 'tier2_compound' && entry.mechanics_tier !== 'tier3_isolation') continue
      baseSide++
      if (bottom < 6) baseUnder.push(`${e.name} ${e.sets}x${e.reps} ${JSON.stringify(who)}`)
    }
  }
  check('the base week holds none either (60 or more side lifts read)', baseSide >= 60 && baseUnder.length === 0, { baseSide, eg: baseUnder.slice(0, 4) })
  // The swap helper must print what generation printed (test:replacement-prescription holds the rate; this holds the floor).
  const helperUnder: string[] = []
  for (const { profile, plan } of plans) for (const w of plan) for (const d of w.days) for (const e of d.exercises) {
    const entry = getExerciseEntry(e.name)
    if (!entry || entry.mechanics_tier === 'tier1_compound' || entry.mechanics_tier === 'primer') continue
    const r = ep.repRangeForIncomingExercise(entry, profile, w)
    const b = r == null ? null : bottomOf(r)
    if (b != null && b < 6) helperUnder.push(`${e.name} ${r} W${w.week_number}`)
  }
  check('a lift swapped in mid-plan is held to the same floor', helperUnder.length === 0, helperUnder.slice(0, 4))

  // ---------------------------------------------------------------- 2
  console.log('\n2. Movement prep is not periodised')
  const primers = EXERCISE_DATABASE.filter(e => e.mechanics_tier === 'primer')
  const repPrimers = primers.filter(e => (e.prescription_type ?? 'reps') === 'reps')
  const explosive = repPrimers.filter(e => EXPLOSIVE_PREP_GROUPS.includes(e.substitution_group))
  check('the catalogue has explosive prep (5 or more) and activation drills (15 or more) to tell apart', explosive.length >= 5 && repPrimers.length - explosive.length >= 15, [explosive.length, repPrimers.length])
  check('explosive prep is five reps: jumps, slams, plyo push-ups, swings', explosive.every(e => ep.movementPrepReps(e) === '5') && ['Box Jumps', 'Broad Jumps', 'Medicine Ball Slams', 'Plyo Push-Ups', 'Kettlebell Swings'].every(n => explosive.some(e => e.name === n)), explosive.map(e => e.name))
  check('every other warm-up drill is ten', repPrimers.filter(e => !explosive.includes(e)).every(e => ep.movementPrepReps(e) === '10'))
  const ankle = getExerciseEntry('Ankle Alphabet')
  check('the ankle alphabet is timed, not counted (a rep of an alphabet was never countable)', ankle?.prescription_type === 'time' && /^\d+-\d+s$/.test(ep.fixedUnitPrescription(ankle)?.reps ?? ''), ankle?.prescription_type)
  // Across every plan above: one drill, one dose, in every block and week.
  const doses = new Map<string, Set<string>>()
  let primerSlots = 0
  const wrong: string[] = []
  for (const { who, plan } of plans) for (const w of plan) for (const d of w.days) for (const e of d.exercises) {
    const entry = getExerciseEntry(e.name)
    if (entry?.mechanics_tier !== 'primer' || (entry.prescription_type ?? 'reps') !== 'reps') continue
    primerSlots++
    const set = doses.get(e.name) ?? new Set<string>(); set.add(String(e.reps)); doses.set(e.name, set)
    if (String(e.reps) !== ep.movementPrepReps(entry)) wrong.push(`${e.name} ${e.sets}x${e.reps} W${w.week_number} ${w.phase_label} ${JSON.stringify(who)}`)
  }
  const phasesSeen = new Set(plans.flatMap(p => p.plan.map(w => w.phase_label)))
  check('the plans hold over 250 rep-counted warm-up drills (measured 328), across four or more kinds of block', primerSlots > 250 && phasesSeen.size >= 4, { primerSlots, phases: [...phasesSeen] })
  check('every one is at its own dose, in every block and week (it was 3 in a strength block, 9 in a conditioning one)', wrong.length === 0, wrong.slice(0, 4))
  check('...so no drill has two different rep counts anywhere in a plan', [...doses.values()].every(s => s.size === 1), [...doses].filter(([, s]) => s.size > 1).map(([n, s]) => `${n}: ${[...s].join('/')}`).slice(0, 4))
  const beginner = prof({ training_experience: 'beginner', fitness_goal: 'fat_loss', equipment_access: 'home_gym', n: 3 })
  const bPlan = seeded('coach-read-beginner', () => ep.generateMesocycle(beginner, ep.generateExercisePlan(beginner).plan))
  const bWrong = bPlan.flatMap(w => w.days.flatMap(d => d.exercises.filter(e => { const en = getExerciseEntry(e.name); return en?.mechanics_tier === 'primer' && (en.prescription_type ?? 'reps') === 'reps' && String(e.reps) !== ep.movementPrepReps(en) }).map(e => `${e.name} ${e.reps} W${w.week_number}`)))
  check('a beginner\'s drills are the same doses (the experience floor of 8 no longer sets them)', bWrong.length === 0 && bPlan.length === 16, bWrong.slice(0, 4))
  const armCircles = getExerciseEntry('Arm Circles')!
  const strengthWeek = plans[0].plan.find(w => /Strength/.test(w.phase_label ?? ''))
  check('a drill swapped in during a strength block gets its own dose too', !!strengthWeek && ep.repRangeForIncomingExercise(armCircles, plans[0].profile, strengthWeek) === '10' && ep.repRangeForIncomingExercise(getExerciseEntry('Box Jumps')!, plans[0].profile, strengthWeek) === '5', strengthWeek && ep.repRangeForIncomingExercise(armCircles, plans[0].profile, strengthWeek))

  // ---------------------------------------------------------------- 3
  console.log('\n3. Two weights no coach would write')
  const strong = prof({ training_experience: 'advanced', weight_kg: 95, equipment_access: 'full_gym' })
  const kg = (name: string, reps = '10-15') => quiet(() => lp.prescribeLoad(getExerciseEntry(name)!, strong, { repRangeLabel: reps }).starting_weight_kg ?? 0)
  const dbCurl = kg('Dumbbell Leg Curl'), machineCurl = kg('Lying Leg Curl')
  check('a strong lifter\'s dumbbell leg curl is 22 kg or less (it was 48)', dbCurl > 0 && dbCurl <= 22, dbCurl)
  check('...and under half the same person\'s machine leg curl', machineCurl > 0 && dbCurl <= machineCurl * 0.5, { dbCurl, machineCurl })
  const kick = kg('Dumbbell Tricep Kickback'), lying = kg('Lying Dumbbell Tricep Extension')
  check('a strong lifter\'s kickback is 10 kg a hand or less (it was 20)', kick > 0 && kick <= 10, kick)
  check('...and about half the same person\'s lying extension, a hand', lying > 0 && kick <= lying * 0.5 + 1, { kick, lying })
  const light = prof({ training_experience: 'beginner', gender: 'female', weight_kg: 55, height_cm: 160, equipment_access: 'home_gym' })
  const lightKg = (name: string) => quiet(() => lp.prescribeLoad(getExerciseEntry(name)!, light, { repRangeLabel: '10-15' }).starting_weight_kg ?? 0)
  check('a light beginner still gets a real, liftable weight on both (never zero)', lightKg('Dumbbell Leg Curl') >= 2 && lightKg('Dumbbell Tricep Kickback') >= 2, [lightKg('Dumbbell Leg Curl'), lightKg('Dumbbell Tricep Kickback')])

  // ---------------------------------------------------------------- 4
  console.log('\n4. A week\'s lower-body main lifts alternate')
  const mainsOf = (profile: UserProfile, key: string) => seeded(key, () => ep.generateExercisePlan(profile).plan)
    .map(d => { const e = d.exercises.map(x => getExerciseEntry(x.name)).find(en => en?.mechanics_tier === 'tier1_compound'); return { focus: d.focus, pattern: e?.movement_pattern ?? null, name: e?.name ?? null } })
    .filter(m => m.pattern === 'knee_dominant' || m.pattern === 'hip_hinge')
  // Weeks with two or more lower-body main lifts, across goals, levels, kit and 2 to 6 days. 60 seeded people.
  let judged = 0, twoFullBody = 0
  const oneSided: string[] = [], lopsided: string[] = []
  const firstWhenFree = new Set<string>()
  const GOALS = ['fat_loss', 'hypertrophy', 'functional', 'conditioning'], EXPS = ['beginner', 'novice', 'intermediate', 'advanced'], EQS = ['full_gym', 'home_gym'], STYLES = ['hybrid', 'functional', 'combat']
  // A fixed pseudo-random walk over the grid, never `i % k` on each axis: those alias (a functional two-day plan, the one
  // case where looking AHEAD decides the day, never came up, and a mutation removing the look-ahead was missed).
  let walk = 20261118
  const next = (n: number) => { walk = (walk * 1103515245 + 12345) & 0x7fffffff; return Math.floor((walk / 0x7fffffff) * n) % n }
  for (let i = 0; i < 60; i++) {
    const who = { fitness_goal: GOALS[next(4)], training_experience: EXPS[next(4)], equipment_access: EQS[next(2)], training_style: STYLES[next(3)], n: [2, 3, 3, 4, 5, 6][next(6)] }
    const mains = mainsOf(prof(who), `coach-read-mains-${i}`)
    if (mains.length < 2) continue
    judged++
    if (mains.filter(m => isFullBody(m.focus)).length >= 2) twoFullBody++
    if (mains.every(m => isFullBody(m.focus))) firstWhenFree.add(mains[0].pattern!)
    const squat = mains.filter(m => m.pattern === 'knee_dominant').length, hinge = mains.length - squat
    const line = `${mains.map(m => m.name).join(' | ')} ${JSON.stringify(who)}`
    if (squat === 0 || hinge === 0) oneSided.push(line)
    if (Math.abs(squat - hinge) > 1) lopsided.push(line)
  }
  check('there are weeks to judge: 40 or more with two lower-body main lifts, 15 or more with two full-body days', judged >= 40 && twoFullBody >= 15, { judged, twoFullBody })
  check('none of them is all deadlifts or all squats (measured before: 4 of 80 deadlifted on every lower day)', oneSided.length === 0, oneSided.slice(0, 3))
  check('...and squats and hinges are never more than one apart', lopsided.length === 0, lopsided.slice(0, 3))
  check('where every lower day is a full-body day, which comes first is still the ranking\'s choice (both a squat and a hinge lead somewhere)', firstWhenFree.size === 2, [...firstWhenFree])
  // LOOKING AHEAD: a functional two-day week is a full-body day and then a squat day, so the full-body day must be the
  // hinge. Before any day is built nothing has been used, so only the later, fixed day can say so.
  const ahead: string[] = []
  for (let i = 0; i < 8; i++) {
    const who = { training_style: 'functional', n: 2, fitness_goal: GOALS[i % 4], training_experience: EXPS[1 + (i % 3)], equipment_access: EQS[i % 2] }
    const mains = mainsOf(prof(who), `coach-read-ahead-${i}`)
    if (!(mains.length === 2 && isFullBody(mains[0].focus) && mains[0].pattern === 'hip_hinge' && mains[1].pattern === 'knee_dominant')) ahead.push(`${mains.map(m => `${m.focus}: ${m.name}`).join(' | ')} ${JSON.stringify(who)}`)
  }
  check('a full-body day before a squat day is built on a hinge, all eight times (it knows what comes later)', ahead.length === 0, ahead.slice(0, 3))
  // The preference gives way when the pool cannot meet it: a flagged knee still gets a main lift on each full-body day.
  const knee = prof({ n: 2, injuries: ['knees'], equipment_access: 'full_gym', training_style: 'functional' })
  const kneeDays = seeded('coach-read-knee', () => ep.generateExercisePlan(knee).plan).filter(d => d.exercises.length > 0)
  check('a week whose pool cannot alternate still fills every day (the preference never leaves a day empty)', kneeDays.length === 2 && kneeDays.every(d => d.exercises.filter(e => getExerciseEntry(e.name)?.mechanics_tier !== 'primer').length >= 3), kneeDays.map(d => d.exercises.map(e => e.name)))

  console.log(`\n${ran} checks ran`)
  if (failures > 0) { console.log(`${failures} FAILED`); process.exitCode = 1; return }
  console.log('Heavy low reps stay on the main lift, warm-ups keep one dose, two weights are realistic, and squat and hinge alternate.')
}
main().catch(e => { console.error(e); process.exitCode = 1 })

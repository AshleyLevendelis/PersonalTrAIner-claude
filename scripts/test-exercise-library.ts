// ---------------------------------------------------------------------------
// test:exercise-library: THE EXERCISE LIBRARY FROM ASHLEY'S 1,001-EXERCISE LIST (3 Nov 2026, "I want the app to have
// at its disposal"; docs/plans/exercise-library.md). Batch 1: barbell and dumbbell.
//
// Holds, for every entry added: it copies its nearest entry's exclusions (an injury removes it wherever it removes the
// model), it is priced in an existing category and never heavier on the body than the model, a lift that needs a
// lifter's base waits for intermediate with a regression that exists, and it reaches a plan. A lighter variant whose
// category would price it at its parent's full weight is NOT added (the plan names them) until a pricing rule exists.
// ---------------------------------------------------------------------------
import { getConstrainedPool, generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { EXERCISE_DATABASE, getExerciseEntry, getMovementFamily, meetsCapabilityRequirement } from '../src/lib/exercise-db'
import { categorize, prescribeLoad, isPerSideLoad } from '../src/lib/load-prescription'
import { seededRngFromKey } from '../src/lib/seeded-random'
import type { UserProfile, TrainingExperience, FitnessGoal, TrainingStyle } from '../src/lib/types'

let ran = 0, failures = 0
const check = (label: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.log(`  FAIL: ${label}${detail === undefined ? '' : ' — ' + JSON.stringify(detail).slice(0, 400)}`) }
}
const quiet = <T,>(f: () => T): T => {
  const o = { log: console.log, warn: console.warn, error: console.error, debug: console.debug }
  console.log = console.warn = console.error = console.debug = () => {}
  try { return f() } finally { Object.assign(console, o) }
}

// name, the entry whose exclusions it copies, the entry it is priced against, its category, and any joint it must
// exclude BEYOND the model (with the reason in the plan)
const BATCH: { name: string; copies: string; pricedAs: string | null; category: string | null; alsoExcludes?: string[] }[] = [
  { name: 'Sumo Deadlift', copies: 'Deadlifts', pricedAs: 'Deadlifts', category: 'deadlift' },
  { name: 'Barbell Glute Bridge', copies: 'Hip Thrust', pricedAs: 'Hip Thrust', category: 'hinge_accessory' },
  { name: 'Push Press', copies: 'Overhead Press', pricedAs: 'Overhead Press', category: 'overhead' },
  // the bar sits on the back, as in the back squat
  { name: 'Barbell Reverse Lunge', copies: 'Dumbbell Reverse Lunge', pricedAs: 'Dumbbell Reverse Lunge', category: 'single_leg_dumbbell', alsoExcludes: ['lower_back_axial'] },
  { name: 'Landmine Rotation', copies: 'Russian Twist', pricedAs: null, category: null },
  { name: 'Single-Arm Dumbbell Bench Press', copies: 'Dumbbell Bench Press', pricedAs: 'Dumbbell Bench Press', category: 'bench' },
  { name: 'Dumbbell Lateral Lunge', copies: 'Dumbbell Reverse Lunge', pricedAs: 'Dumbbell Reverse Lunge', category: 'single_leg_dumbbell' },
  // the whole lift is balanced on one ankle
  { name: 'Single-Leg Dumbbell RDL', copies: 'Romanian Deadlifts', pricedAs: 'Romanian Deadlifts', category: 'hinge_accessory', alsoExcludes: ['ankle'] },
  { name: 'Dumbbell Woodchop', copies: 'Cable Woodchops', pricedAs: null, category: null },
]
const contra = (n: string) => { const e = getExerciseEntry(n); return e ? (e.contraindicated_joints ?? e.loads_joints) : null }

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const person = (gender: 'male' | 'female', weight_kg: number, training_experience: TrainingExperience, over: Partial<UserProfile> = {}): UserProfile => ({
  age: 32, gender, height_cm: gender === 'male' ? 180 : 166, weight_kg, activity_level: 'moderate', fitness_goal: 'hypertrophy',
  preferred_time: 'evening', bmr: 1700, tdee: 2500, equipment_access: 'full_gym', injuries: [], training_style: 'bodybuilding',
  training_experience, session_duration_preference: '45-60', workout_split_preference: 'ai_recommendation',
  training_days: DAYS.map(d => ({ day: d, available: ['Monday', 'Tuesday', 'Thursday', 'Saturday'].includes(d) })),
  weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [], macro_calculation_mode: 'STANDARD_STATIC',
  coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate', ...over,
}) as unknown as UserProfile
const PEOPLE = [person('male', 85, 'intermediate'), person('female', 62, 'beginner'), person('male', 120, 'advanced'), person('female', 70, 'advanced'), person('female', 55, 'intermediate')]

console.log('\n1. The entries')
for (const p of BATCH) {
  const e = getExerciseEntry(p.name)
  check(`${p.name} is in the catalogue, once`, !!e && EXERCISE_DATABASE.filter(x => x.name === p.name).length === 1)
  check(`...priced as ${p.category ?? 'nothing (core progresses by reps)'}`, !!e && categorize(e) === p.category, e && categorize(e))
  const mine = new Set(contra(p.name) ?? [])
  const theirs = [...(contra(p.copies) ?? ['(model missing)']), ...(p.alsoExcludes ?? [])]
  check(`...and excludes at least every joint ${p.copies} excludes${p.alsoExcludes ? ' plus ' + p.alsoExcludes.join(', ') : ''} (${theirs.join(', ') || 'none'})`, theirs.every(j => mine.has(j)), { mine: [...mine], theirs })
}
const fam = (n: string) => { const e = getExerciseEntry(n); return e ? getMovementFamily(e) : null }
check('the sumo deadlift is the same movement as the deadlift (they never share a day)', fam('Sumo Deadlift') !== null && fam('Sumo Deadlift') === fam('Deadlifts'))
check('...the push press the same as the overhead press', fam('Push Press') !== null && fam('Push Press') === fam('Overhead Press'))
check('...the one-arm dumbbell bench the same as the dumbbell bench', fam('Single-Arm Dumbbell Bench Press') !== null && fam('Single-Arm Dumbbell Bench Press') === fam('Dumbbell Bench Press'))
check('...and the dumbbell woodchop the same as the cable woodchop', fam('Dumbbell Woodchop') !== null && fam('Dumbbell Woodchop') === fam('Cable Woodchops'))

console.log('\n2. Never heavier on the body than the model (a per-side number counts twice)')
{
  const heavier: string[] = []
  let compared = 0, atBar = 0
  const exempted: number[] = []
  const onBody = (n: string, who: UserProfile) => {
    const e = getExerciseEntry(n)!
    const kg = quiet(() => prescribeLoad(e, who).starting_weight_kg)
    return kg == null ? null : (isPerSideLoad(e) ? kg * 2 : kg)
  }
  for (const p of BATCH) {
    if (!p.pricedAs) continue
    for (const who of PEOPLE) {
      const e = getExerciseEntry(p.name)
      if (!e || !meetsCapabilityRequirement(e, who.training_experience)) continue
      const mine = onBody(p.name, who), theirs = onBody(p.pricedAs, who)
      if (mine == null || theirs == null) continue
      compared++
      // THE EMPTY BAR IS THE IMPLEMENT'S OWN FLOOR, not a price: a barbell cannot weigh less than 20 kg. Measured: a
      // 55 kg intermediate woman's reverse lunge is 8 kg a hand (16 on the body) and the barbell one starts at the bar.
      // An empty bar on the back is where an intermediate starts this lift; a beginner never meets it (section 3).
      if (!isPerSideLoad(e) && e.equipment.includes('barbell') && mine === 20) { atBar++; exempted.push(mine); continue }
      // One plate step (2.5kg) of rounding, or two for a per-side number, which is rounded on each side.
      if (mine > theirs + (isPerSideLoad(e) ? 5 : 2.5)) heavier.push(`${p.name} ${mine} vs ${p.pricedAs} ${theirs} (${who.gender} ${who.weight_kg} ${who.training_experience})`)
    }
  }
  check(`no new exercise prices heavier than its model (${compared} comparisons, ${atBar} at the empty bar)`, compared >= 25 && heavier.length === 0, heavier.slice(0, 4))
  check('...and the only allowance taken is the empty bar itself, never a loaded one', exempted.length > 0 && exempted.every(kg => kg === 20), exempted)
  // BY NAME, not by the unilateral flag (the machine pack's lesson: a list built from the flag drops the entry that lost it).
  const ONE_HAND = ['Single-Arm Dumbbell Bench Press', 'Dumbbell Lateral Lunge', 'Single-Leg Dumbbell RDL']
  check(`every dumbbell entry is prescribed per hand (${ONE_HAND.length})`, ONE_HAND.every(n => { const e = getExerciseEntry(n); return !!e && isPerSideLoad(e) }), ONE_HAND.filter(n => { const e = getExerciseEntry(n); return !e || !isPerSideLoad(e) }))
  const TOTALS = ['Sumo Deadlift', 'Barbell Glute Bridge', 'Push Press', 'Barbell Reverse Lunge']
  check(`...and every barbell entry as one total (${TOTALS.length})`, TOTALS.every(n => { const e = getExerciseEntry(n); return !!e && !isPerSideLoad(e) }))
}

console.log('\n3. A lift that needs a base waits for intermediate')
for (const [name, regression] of [['Push Press', 'Overhead Press'], ['Barbell Reverse Lunge', 'Dumbbell Reverse Lunge']]) {
  const e = getExerciseEntry(name)!
  check(`${name}: a beginner and a novice do not meet it, an intermediate does`, !!e && !meetsCapabilityRequirement(e, 'beginner') && !meetsCapabilityRequirement(e, 'novice') && meetsCapabilityRequirement(e, 'intermediate'))
  check(`...and the beginner is sent to ${regression}, which exists`, e?.capability_requirement?.regression === regression && !!getExerciseEntry(regression))
}

console.log('\n4. They reach a pool, and a plan')
{
  const pool = quiet(() => getConstrainedPool(person('male', 85, 'intermediate', { training_style: 'functional' }), []))
  const missing = BATCH.filter(p => !pool.some(x => x.name === p.name)).map(p => p.name)
  check(`every entry reaches a full-gym functional intermediate pool (${BATCH.length})`, missing.length === 0, missing)
  // MEASURED, a property of the batch as a whole: a seeded grid of plans, counting which entries any plan prescribes.
  const seen = new Set<string>()
  let plans = 0
  for (const goal of ['hypertrophy', 'fat_loss', 'functional'] as FitnessGoal[])
    for (const style of ['bodybuilding', 'functional', 'hybrid'] as TrainingStyle[])
      for (const experience of ['beginner', 'intermediate', 'advanced'] as TrainingExperience[]) {
        setRandomSource(seededRngFromKey(`library|${goal}|${style}|${experience}`))
        try {
          const meso = quiet(() => generateMesocycle(person('female', 68, experience, { fitness_goal: goal, training_style: style })))
          plans++
          for (const w of meso) for (const d of w.days) for (const x of d.exercises) if (BATCH.some(p => p.name === x.name)) seen.add(x.name)
        } finally { resetRandomSource() }
      }
  console.log(`     prescribed somewhere in ${plans} seeded plans: ${[...seen].sort().join(', ')}`)
  check(`at least 6 of the ${BATCH.length} entries are prescribed by some plan in the seeded grid`, plans === 27 && seen.size >= 6, { seen: seen.size, plans })
}

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.log(`${failures} exercise-library check(s) failed`); process.exit(1) }
console.log('exercise-library: all checks passed')

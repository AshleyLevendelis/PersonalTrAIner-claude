// ---------------------------------------------------------------------------
// test:machine-pack: MORE EXERCISES AND MACHINE OPTIONS (3 Nov 2026, Ashley: "I want more exercises and machine
// options"; docs/plans/machine-pack.md)
//
// Measured that day: single-leg work had no machine or cable option, quad isolation one machine (Leg Extensions),
// and several patterns one or two. Fifteen entries fill those. This holds, for each one: it copies its nearest
// entry's exclusions (so an injury removes it wherever it removes the model), it is priced in an existing category
// and never heavier than the model on the body, and the gaps are closed as properties. The Smith split squat's
// beginner gate is held too: an empty Smith bar is far above a beginner's split-squat dumbbells.
// ---------------------------------------------------------------------------
import { getConstrainedPool } from '../src/lib/exercise-plan'
import { EXERCISE_DATABASE, getExerciseEntry, getMovementFamily, meetsCapabilityRequirement } from '../src/lib/exercise-db'
import { categorize, prescribeLoad, isPerSideLoad } from '../src/lib/load-prescription'
import type { UserProfile, TrainingExperience } from '../src/lib/types'

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

// name, the entry whose exclusions it copies, the entry it is priced against (same movement, nearest kit), its category
const PACK: { name: string; copies: string; pricedAs: string | null; category: string | null }[] = [
  { name: 'Seated Dip Machine', copies: 'Assisted Dip Machine', pricedAs: 'Tricep Pushdowns', category: 'isolation_tricep' },
  { name: 'Machine Tricep Extension', copies: 'Dumbbell Tricep Kickback', pricedAs: 'Tricep Pushdowns', category: 'isolation_tricep' },
  { name: 'Cable Rear Delt Fly', copies: 'Reverse Pec Deck', pricedAs: 'Reverse Pec Deck', category: 'isolation_rear_delt' },
  { name: 'Single-Arm Cable Row', copies: 'Seated Cable Row', pricedAs: 'Seated Cable Row', category: 'row' },
  { name: 'Iso-Lateral High Row', copies: 'Seated Machine Row', pricedAs: 'Seated Machine Row', category: 'row' },
  { name: 'Iso-Lateral Pulldown', copies: 'Lat Pulldown', pricedAs: 'Lat Pulldown', category: 'pulldown' },
  { name: 'Cable Y-Raise', copies: 'Cable Lateral Raises', pricedAs: 'Cable Lateral Raises', category: 'isolation_shoulder' },
  { name: 'Bayesian Cable Curl', copies: 'Incline Dumbbell Curls', pricedAs: 'Cable Curls', category: 'isolation_bicep' },
  { name: 'Leg Press Calf Raise', copies: 'Standing Calf Raise Machine', pricedAs: 'Standing Calf Raise Machine', category: 'isolation_calf' },
  { name: 'Smith Machine Split Squat', copies: 'Bulgarian Split Squats', pricedAs: 'Bulgarian Split Squats', category: 'single_leg_dumbbell' },
  { name: 'Single-Leg Leg Press', copies: 'Leg Press', pricedAs: 'Leg Press', category: 'leg_press' },
  { name: 'Single-Leg Leg Extension', copies: 'Leg Extensions', pricedAs: 'Leg Extensions', category: 'isolation_quad' },
  { name: 'Cable Glute Kickback', copies: 'Glute Kickback Machine', pricedAs: 'Glute Kickback Machine', category: 'isolation_hamstring' },
  { name: 'Cable Crunch', copies: 'Rotary Torso Machine', pricedAs: null, category: null },
  { name: 'Half-Kneeling Single-Arm Dumbbell Press', copies: 'Dumbbell Shoulder Press', pricedAs: 'Dumbbell Shoulder Press', category: 'overhead' },
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
const PEOPLE = [person('male', 85, 'intermediate'), person('female', 62, 'beginner'), person('male', 120, 'advanced'), person('female', 70, 'advanced')]

console.log('\n1. The entries')
for (const p of PACK) {
  const e = getExerciseEntry(p.name)
  check(`${p.name} is in the catalogue, once`, !!e && EXERCISE_DATABASE.filter(x => x.name === p.name).length === 1)
  check(`...priced as ${p.category ?? 'nothing (core progresses by reps)'}`, !!e && categorize(e) === p.category, e && categorize(e))
  const mine = new Set(contra(p.name) ?? [])
  const theirs = contra(p.copies) ?? ['(model missing)']
  check(`...and excludes at least every joint ${p.copies} excludes (${theirs.join(', ') || 'none'})`, theirs.every(j => mine.has(j)), { mine: [...mine], theirs })
}
const fam = (n: string) => { const e = getExerciseEntry(n); return e ? getMovementFamily(e) : null }
check('the iso-lateral pulldown is the same movement as the lat pulldown (they never share a day)', fam('Iso-Lateral Pulldown') !== null && fam('Iso-Lateral Pulldown') === fam('Lat Pulldown'))
check('...the Y-raise the same as a lateral raise', fam('Cable Y-Raise') !== null && fam('Cable Y-Raise') === fam('Lateral Raises'))
check('...and the one-leg extension the same as the leg extension', fam('Single-Leg Leg Extension') !== null && fam('Single-Leg Leg Extension') === fam('Leg Extensions'))

console.log('\n2. Never heavier on the body than the model (a per-side number counts twice)')
{
  const heavier: string[] = []
  let compared = 0
  const onBody = (n: string, who: UserProfile) => {
    const e = getExerciseEntry(n)!
    const kg = quiet(() => prescribeLoad(e, who).starting_weight_kg)
    return kg == null ? null : (isPerSideLoad(e) ? kg * 2 : kg)
  }
  for (const p of PACK) {
    if (!p.pricedAs) continue
    for (const who of PEOPLE) {
      const e = getExerciseEntry(p.name)
      if (!e || !meetsCapabilityRequirement(e, who.training_experience)) continue
      const mine = onBody(p.name, who), theirs = onBody(p.pricedAs, who)
      if (mine == null || theirs == null) continue
      compared++
      // One plate step (2.5kg) of rounding, or two for a per-side number, which is rounded on each side. And a
      // per-side 5kg is the lightest plate on a stack: it cannot go lower, so it is not compared.
      const perSide = isPerSideLoad(e)
      if (perSide && mine <= 10) continue
      if (mine > theirs + (perSide ? 5 : 2.5)) heavier.push(`${p.name} ${mine} vs ${p.pricedAs} ${theirs} (${who.gender} ${who.weight_kg} ${who.training_experience})`)
    }
  }
  check(`no new exercise prices heavier than its model (${compared} comparisons)`, compared >= 40 && heavier.length === 0, heavier.slice(0, 4))
  // BY NAME, not by the unilateral flag: a one-arm row whose flag was lost would show the two-arm total for one arm,
  // and a list built from the flag would quietly drop it (a mutation that did exactly that was missed by the first
  // version of this check).
  const ONE_SIDED = ['Cable Rear Delt Fly', 'Single-Arm Cable Row', 'Cable Y-Raise', 'Bayesian Cable Curl', 'Single-Leg Leg Press', 'Single-Leg Leg Extension', 'Cable Glute Kickback']
  const oneSided = PACK.filter(p => ONE_SIDED.includes(p.name))
  check(`every one-arm or one-leg machine or cable entry is prescribed per side (${oneSided.length})`, oneSided.length === ONE_SIDED.length && oneSided.every(p => isPerSideLoad(getExerciseEntry(p.name)!)), oneSided.filter(p => !isPerSideLoad(getExerciseEntry(p.name)!)).map(p => p.name))
  const press = getExerciseEntry('Single-Leg Leg Press')!
  const heavy = quiet(() => prescribeLoad(press, person('male', 120, 'advanced'), { repRangeLabel: '3-5', targetRpeLabel: 'RPE 8', sets: 3, isFirstBlock: false }).starting_weight_kg)
  check('a one-leg press is capped at half the two-leg ceiling (200kg a leg), even for a 120kg advanced lifter at 3-5', heavy !== null && heavy <= 200, heavy)
}

console.log('\n3. The gaps, closed')
{
  const pool = quiet(() => getConstrainedPool(person('male', 85, 'intermediate'), []))
  const machineish = (e: { equipment: string[] }) => e.equipment.some(x => /machine|cable/.test(x))
  const singleLeg = pool.filter(e => e.movement_pattern === 'single_leg' && machineish(e)).map(e => e.name)
  check('a full-gym pool has single-leg work on a machine (measured: none before)', singleLeg.length >= 2, singleLeg)
  const quad = pool.filter(e => e.movement_pattern === 'isolation_quad' && machineish(e)).map(e => e.name)
  check('...and more than one quad machine (measured: Leg Extensions alone)', quad.length >= 2, quad)
  const missing = PACK.filter(p => { const e = getExerciseEntry(p.name); return !!e && machineish(e) && !pool.some(x => x.name === p.name) }).map(p => p.name)
  const machineCount = PACK.filter(p => { const e = getExerciseEntry(p.name); return !!e && machineish(e) }).length
  check(`...and every one of the ${machineCount} new machine or cable exercises reaches a full-gym bodybuilding pool (${pool.filter(machineish).length} there now, 54 before)`, machineCount >= 14 && missing.length === 0, missing)
}

console.log('\n4. The Smith split squat waits for intermediate')
{
  const smith = getExerciseEntry('Smith Machine Split Squat')!
  check('a beginner and a novice do not meet it', !meetsCapabilityRequirement(smith, 'beginner') && !meetsCapabilityRequirement(smith, 'novice'))
  check('...an intermediate does', meetsCapabilityRequirement(smith, 'intermediate'))
  check('...and the beginner is sent to the dumbbell split squat, which exists', smith.capability_requirement?.regression === 'Bulgarian Split Squats' && !!getExerciseEntry('Bulgarian Split Squats'))
}

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.log(`${failures} machine-pack check(s) failed`); process.exit(1) }
console.log('machine-pack: all checks passed')

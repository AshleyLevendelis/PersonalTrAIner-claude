// ---------------------------------------------------------------------------
// test:variant-pricing: A LIGHTER VARIANT IS PRICED AS A FRACTION OF ITS PARENT LIFT (3 Nov 2026, Ashley: "Build the
// pricing rule for the held-back exercises"; docs/plans/variant-pricing.md)
//
// Holds: each variant is its fraction of the parent's price on the body, on the standard path AND the typed-weight
// path; a forced figure (always this exercise's own) is never discounted; the fraction can only lower; no isolation
// entry carries one; an incline under the flat bench is not discounted twice by coherence; and the trace's finding,
// a goblet squat priced from a typed squat at the squat's own weight, is gone.
// ---------------------------------------------------------------------------
import { enforceLoadCoherence } from '../src/lib/exercise-plan'
import { EXERCISE_DATABASE, getExerciseEntry, type ExerciseEntry } from '../src/lib/exercise-db'
import { categorize, prescribeLoad, isPerSideLoad, variantPriceFraction } from '../src/lib/load-prescription'
import type { UserProfile, TrainingExperience, Exercise, WorkoutDay } from '../src/lib/types'

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
const person = (gender: 'male' | 'female', weight_kg: number, training_experience: TrainingExperience): UserProfile =>
  ({ age: 32, gender, weight_kg, height_cm: 175, training_experience, equipment_access: 'full_gym', injuries: [], skip_calibration_week: true } as unknown as UserProfile)
const PEOPLE = [person('male', 85, 'intermediate'), person('female', 62, 'intermediate'), person('male', 95, 'advanced'), person('female', 70, 'advanced')]

// variant, its fraction, the parent it is a fraction of (same category), and the known weights to try
const VARIANTS: { name: string; fraction: number; parent: string; known: Record<string, number> }[] = [
  { name: 'Front Squat', fraction: 0.8, parent: 'Barbell Squats', known: { squat: 100 } },
  { name: 'Incline Barbell Bench Press', fraction: 0.8, parent: 'Barbell Bench Press', known: { bench: 80 } },
  { name: 'Close-Grip Bench Press', fraction: 0.85, parent: 'Barbell Bench Press', known: { bench: 80 } },
  { name: 'Dumbbell Squeeze Press', fraction: 0.6, parent: 'Dumbbell Bench Press', known: { bench: 80 } },
  { name: 'Renegade Row', fraction: 0.45, parent: 'Dumbbell Rows', known: {} },
  { name: 'Dumbbell Front Squat', fraction: 0.4, parent: 'Barbell Squats', known: { squat: 100 } },
  { name: 'Suitcase Deadlift', fraction: 0.6, parent: 'Deadlifts', known: { deadlift: 120 } },
]
const OPTS = { repRangeLabel: '8-10', targetRpeLabel: 'RPE 8', sets: 3 }
const onBody = (e: ExerciseEntry, kg: number | null) => kg == null ? null : (isPerSideLoad(e) ? kg * 2 : kg)
const priced = (e: ExerciseEntry, who: UserProfile, known?: Record<string, number>) =>
  quiet(() => prescribeLoad(e, who, { ...OPTS, knownWorkingWeights: known as never }))
const price = (e: ExerciseEntry, who: UserProfile, known?: Record<string, number>) => onBody(e, priced(e, who, known).starting_weight_kg)
// The implement's own top (the heaviest dumbbell a gym holds): a number clamped there is BELOW its fraction, the safe
// side, so it is checked as "not above" rather than "equal". Named by the realistic ceiling's warning, captured.
const clampedAtTop = (e: ExerciseEntry, who: UserProfile, known?: Record<string, number>) => {
  const o = console.warn; let hit = false
  console.warn = (m: unknown) => { if (/realistic ceiling|clamping/i.test(String(m))) hit = true }
  try { prescribeLoad(e, who, { ...OPTS, knownWorkingWeights: known as never }) } finally { console.warn = o }
  return hit
}

console.log('\n1. Each variant is its fraction of the parent, on the body')
{
  let compared = 0, floored = 0, atTop = 0
  const off: string[] = []
  for (const v of VARIANTS) {
    const e = getExerciseEntry(v.name), parent = getExerciseEntry(v.parent)
    check(`${v.name} carries ${v.fraction} and sits in ${parent ? categorize(parent) : '?'} with its parent`, !!e && !!parent && e.price_fraction === v.fraction && categorize(e) === categorize(parent))
    if (!e || !parent) continue
    for (const who of PEOPLE) for (const known of [undefined, Object.keys(v.known).length ? v.known : undefined]) {
      const mine = price(e, who, known), theirs = price(parent, who, known)
      if (mine == null || theirs == null) continue
      // The implement's floor is not a price (an empty bar, a 2 kg dumbbell): not compared, counted.
      if (mine <= (isPerSideLoad(e) ? 4 : 20)) { floored++; continue }
      compared++
      // Rounded on each side: a plate step for a total, two dumbbell steps on the body for a per-hand number.
      const slack = isPerSideLoad(e) ? 5 : 2.5
      if (clampedAtTop(e, who, known)) { atTop++; if (mine > v.fraction * theirs + slack) off.push(`${v.name} ${mine} above its fraction while clamped`); continue }
      if (Math.abs(mine - v.fraction * theirs) > slack) off.push(`${v.name} ${mine} vs ${v.fraction} x ${theirs} (${who.gender} ${who.weight_kg} ${who.training_experience}${known ? ' typed' : ''})`)
    }
  }
  check(`every comparison lands within a rounding step (${compared} compared, ${floored} at the implement's floor, ${atTop} held at its top)`, compared >= 40 && off.length === 0, off.slice(0, 4))
}

console.log('\n2. The person\'s own figure is never discounted, and the fraction only lowers')
{
  const fs = getExerciseEntry('Front Squat')!
  const forced = quiet(() => prescribeLoad(fs, PEOPLE[0], { ...OPTS, forceStartingWeightKg: 70 }).starting_weight_kg)
  check('a forced number (this exercise\'s own log or printed week) comes back as itself: 70 stays 70', forced === 70, forced)
  const probe = (f: unknown) => variantPriceFraction({ ...fs, price_fraction: f as number })
  check('a fraction of 1.5, 1, 0 or -0.2 reads as 1, and none at all reads as 1', [1.5, 1, 0, -0.2, undefined].every(f => probe(f) === 1), [1.5, 1, 0, -0.2, undefined].map(probe))
  check('...while 0.8 reads as 0.8 (the probe can see a real one)', probe(0.8) === 0.8)
  const set = EXERCISE_DATABASE.filter(e => e.price_fraction !== undefined)
  const bad = set.filter(e => !(e.price_fraction! > 0 && e.price_fraction! < 1)).map(e => e.name)
  check(`every catalogue fraction is strictly between 0 and 1 (${set.length} set)`, set.length >= 7 && bad.length === 0, bad)
  const iso = set.filter(e => e.mechanics_tier === 'tier3_isolation' || (categorize(e) ?? '').startsWith('isolation')).map(e => e.name)
  check('...and none is on an isolation entry (the floor-swap pre-check reads the isolation reference directly)', iso.length === 0, iso)
}

console.log('\n3. Coherence does not discount an incline twice')
{
  const ex = (name: string, kg: number): Exercise => ({ name, sets: 3, reps: '8-10', rest: '120s', suggested_load_kg: kg, suggested_load: `${kg}kg` } as unknown as Exercise)
  const day = [{ day: 'Monday', focus: 'Push', exercises: [ex('Barbell Bench Press', 100), ex('Incline Barbell Bench Press', 80)] }] as unknown as WorkoutDay[]
  quiet(() => enforceLoadCoherence(day))
  const incline = day[0].exercises.find(e => e.name === 'Incline Barbell Bench Press')
  check('an incline at 80 beside a flat bench at 100 is left at 80 (the 0.9 cap is a ceiling, not a second discount)', incline?.suggested_load_kg === 80, incline?.suggested_load_kg)
  const over = [{ day: 'Monday', focus: 'Push', exercises: [ex('Barbell Bench Press', 100), ex('Incline Barbell Bench Press', 110)] }] as unknown as WorkoutDay[]
  quiet(() => enforceLoadCoherence(over))
  check('...while an incline at 110 is still capped to 90 (the cap reaches the new entry)', over[0].exercises.find(e => e.name === 'Incline Barbell Bench Press')?.suggested_load_kg === 90)
}

console.log('\n4. A typed squat prices a goblet squat as a goblet squat (the trace\'s finding)')
{
  const goblet = getExerciseEntry('Goblet Squats')!, back = getExerciseEntry('Barbell Squats')!
  const who = person('male', 85, 'intermediate')
  for (const squat of [60, 100]) {
    const g = quiet(() => prescribeLoad(goblet, who, { repRangeLabel: '10-12', targetRpeLabel: 'RPE 8', knownWorkingWeights: { squat } }).starting_weight_kg)
    const b = quiet(() => prescribeLoad(back, who, { repRangeLabel: '10-12', targetRpeLabel: 'RPE 8', knownWorkingWeights: { squat } }).starting_weight_kg)
    // 0.35 of the back squat it was typed for, a dumbbell step either way; it was 58 kg (clamped to 48) for a 60 kg squat.
    check(`a typed ${squat} kg squat gives a goblet squat about 0.35 of the back squat (${g} vs ${b})`, g != null && b != null && Math.abs(g - 0.35 * b) <= 2.5 && g < 48, { g, b })
  }
}

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.log(`${failures} variant-pricing check(s) failed`); process.exit(1) }
console.log('variant-pricing: all checks passed')

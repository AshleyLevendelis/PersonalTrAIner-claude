// ---------------------------------------------------------------------------
// Gate for the load whose anchor is the trainee: the single-leg calf raise.
//
// Until 6 Sep 2026 Single-Leg Dumbbell Calf Raise shared isolation_calf's
// 0.65 x squat anchor — a machine's number, on a lift where the leg already
// carries the whole body before the dumbbell exists. Measured across three
// corpora it was the ONLY exercise in the catalogue reaching its implement
// ceiling for an ordinary body: 36kg in one hand for an 80kg intermediate,
// 60kg wanted (48kg clamped) for advanced. Ashley's ruling, taken on the
// resulting weights (docs/plans/the-48kg-calf-raise.md): 12kg intermediate /
// 16kg advanced for an 80kg man, 8 / 12 for a 60kg woman.
//
// What this pins, and why each is a property rather than a number where it
// can be:
//   1. The category is chosen by PROPERTIES (unilateral + hand-held), so the
//      next single-leg calf variant is covered by construction and a machine
//      version is not.
//   2. The ruled table itself — the spec, in the one shape it was ruled on.
//   3. It is anchored to the PERSON: sex-blind, squat-blind, scales with body.
//   4. It never reaches the 48kg implement again and is always a weight a
//      person can hold on one foot.
//   5. The machine calf raises did not move — pinned, because "bit-identical"
//      is a number and only a number can say it.
//   6. The two anchors are not compared: the coherence pass used to pull the
//      MACHINE down to twice the dumbbell, and the scorer would have called
//      the pair incoherent.
//   7. The reason the exercise exists — a swap for a busy calf machine — is
//      still true.
// ---------------------------------------------------------------------------

import { EXERCISE_DATABASE, getExerciseEntry, type ExerciseEntry } from '../src/lib/exercise-db'
import { prescribeLoad, categorize, getLoadingCeilingKg, isPerSideLoad } from '../src/lib/load-prescription'
import { SAFETY_CEILING_KG_TOTAL, ALL_EQUIPMENT, ALL_DURATIONS, ALL_STYLES, ALL_EXPERIENCE, getInjuryCombinations } from '../src/lib/dev-constraint-audit'
import { generateMesocycle, setRandomSource, resetRandomSource, enforceLoadCoherence } from '../src/lib/exercise-plan'
import { getReplacementCandidates } from '../src/lib/mesocycle-edit'
import { scorePlan } from '../src/lib/quality-score'
import { seededRngFromKey } from '../src/lib/seeded-random'
import type { UserProfile, TrainingExperience, MesocycleWeek, WorkoutDay, Exercise } from '../src/lib/types'

let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

function buildProfile(gender: 'male' | 'female', weight_kg: number, training_experience: TrainingExperience, o: Partial<UserProfile> = {}): UserProfile {
  return {
    age: 30, gender, height_cm: gender === 'female' ? 168 : 180, weight_kg,
    activity_level: 'moderate', fitness_goal: 'hypertrophy', preferred_time: 'morning',
    bmr: 1800, tdee: 2500, equipment_access: 'full_gym', injuries: [],
    training_style: 'hybrid', training_experience, session_duration_preference: '45-60',
    workout_split_preference: 'upper_lower', training_days: [], weekly_schedule: {},
    dietary_preferences: [], concurrent_activities: [],
    exercise_exclusions: [] as unknown as never, macro_calculation_mode: 'STANDARD_STATIC',
    coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
    ...o,
  } as UserProfile
}

const SINGLE_LEG = 'Single-Leg Dumbbell Calf Raise'
const MACHINES = ['Calf Raises', 'Seated Calf Raises']
const single = getExerciseEntry(SINGLE_LEG)!

let clampWarnings = 0
const quiet = <T>(fn: () => T): T => {
  const d = console.debug, w = console.warn, l = console.log
  console.debug = () => {}
  console.warn = (m: unknown) => { if (/computed .* above the .* ceiling/.test(String(m))) clampWarnings++ }
  try { return fn() } finally { console.debug = d; console.warn = w; console.log = l }
}

// The shape the table was ruled in: the ordinary calf prescription.
const RULED_REPS = '12-15'
const RULED_RPE = 'RPE 7-8'
const kgFor = (entry: ExerciseEntry, profile: UserProfile, repRangeLabel = RULED_REPS, targetRpeLabel = RULED_RPE, extra: Record<string, unknown> = {}) =>
  quiet(() => prescribeLoad(entry, profile, { targetRpeLabel, repRangeLabel, isFirstBlock: false, sets: 3, ...extra }))

// ---------------------------------------------------------------------------
console.log('\n1. The category is a property of the lift, not its name')
// ---------------------------------------------------------------------------
{
  check(`${SINGLE_LEG} -> single_leg_calf`, categorize(single) === 'single_leg_calf', String(categorize(single)))
  for (const m of MACHINES) {
    const e = getExerciseEntry(m)!
    check(`${m} stays isolation_calf`, categorize(e) === 'isolation_calf', String(categorize(e)))
  }
  const variant = (o: Partial<ExerciseEntry>): ExerciseEntry => ({ ...single, name: 'Some Future Calf Raise', id: 'future-calf', ...o })
  check('a future unilateral KETTLEBELL calf raise is covered by construction',
    categorize(variant({ equipment: ['kettlebell'], unilateral: true })) === 'single_leg_calf')
  check('...and one holding a dumbbell PAIR', categorize(variant({ equipment: ['dumbbells'], unilateral: true })) === 'single_leg_calf')
  check('a unilateral calf raise on a MACHINE stays with the machine anchor — the stack supplies the load',
    categorize(variant({ equipment: ['machine'], unilateral: true })) === 'isolation_calf')
  check('a two-footed dumbbell calf raise stays with the machine anchor — the legs share the body',
    categorize(variant({ equipment: ['dumbbell'], unilateral: false })) === 'isolation_calf')
  check('the single-leg dumbbell version is per side, and says so',
    isPerSideLoad(single) && kgFor(single, buildProfile('male', 80, 'intermediate')).display.includes('(single side)'),
    kgFor(single, buildProfile('male', 80, 'intermediate')).display)
}

// ---------------------------------------------------------------------------
console.log('\n2. The ruled table — Ashley, 6 Sep 2026, option A')
// ---------------------------------------------------------------------------
{
  // Pinned as ruled. If a number here has to change, that is a new ruling,
  // not a test fix. The "not halved again" property lives here too: halving
  // the bodyweight reference a second time turns 12 into 6, and this is the
  // line that says so.
  const ruled: Array<[string, 'male' | 'female', number, TrainingExperience, number]> = [
    ['80kg man, intermediate', 'male', 80, 'intermediate', 12],
    ['80kg man, advanced', 'male', 80, 'advanced', 16],
    ['80kg man, beginner', 'male', 80, 'beginner', 4],
    ['60kg woman, intermediate', 'female', 60, 'intermediate', 8],
    ['60kg woman, advanced', 'female', 60, 'advanced', 12],
    ['120kg man, advanced — the heaviest anyone is asked to hold on one foot', 'male', 120, 'advanced', 24],
  ]
  for (const [who, g, w, exp, want] of ruled) {
    const got = kgFor(single, buildProfile(g, w, exp)).starting_weight_kg
    check(`${who}: ${want}kg in one hand`, got === want, `got ${got}`)
  }
}

// ---------------------------------------------------------------------------
console.log('\n3. Anchored to the person, not to a barbell lift')
// ---------------------------------------------------------------------------
{
  const WEIGHTS = [50, 65, 80, 100, 120]
  const EXP: TrainingExperience[] = ['beginner', 'novice', 'intermediate', 'advanced']
  const REPS = ['3-5', '6-8', '8-12', '12-15', '15-20']
  const RPES = ['RPE 6-7', 'RPE 7-8', 'RPE 8']
  let sexDiffers = 0, cells = 0
  for (const w of WEIGHTS) for (const exp of EXP) for (const r of REPS) for (const rpe of RPES) {
    cells++
    const m = kgFor(single, buildProfile('male', w, exp), r, rpe).starting_weight_kg
    const f = kgFor(single, buildProfile('female', w, exp), r, rpe).starting_weight_kg
    if (m !== f) sexDiffers++
  }
  // The squat standards differ by sex; bodyweight does not. A number that
  // moves with sex at the same body is still reading the squat table.
  check(`the same body gets the same number whatever the sex (${sexDiffers} of ${cells} cells differ)`, sexDiffers === 0)

  const plain = kgFor(single, buildProfile('male', 80, 'intermediate')).starting_weight_kg
  const strongSquat = kgFor(single, buildProfile('male', 80, 'intermediate'), RULED_REPS, RULED_RPE, { knownWorkingWeights: { squat: 200 } }).starting_weight_kg
  check(`a reported 200kg squat changes nothing (${plain} -> ${strongSquat})`, plain === strongSquat)

  const light = kgFor(single, buildProfile('female', 60, 'advanced')).starting_weight_kg!
  const heavy = kgFor(single, buildProfile('male', 120, 'advanced')).starting_weight_kg!
  check(`twice the body, twice the dumbbell (${light} -> ${heavy})`, heavy === light * 2)

  // The machine anchor DOES move with sex at the same body — the control
  // that proves the check above has teeth.
  const mm = kgFor(getExerciseEntry('Calf Raises')!, buildProfile('male', 80, 'intermediate')).starting_weight_kg
  const mf = kgFor(getExerciseEntry('Calf Raises')!, buildProfile('female', 80, 'intermediate')).starting_weight_kg
  check(`...while the machine calf raise still reads the squat table (${mf} vs ${mm} at 80kg)`, mm !== mf)
}

// ---------------------------------------------------------------------------
console.log('\n4. Never at the implement ceiling, always holdable')
// ---------------------------------------------------------------------------
{
  const WEIGHTS = [50, 65, 80, 100, 120]
  const EXP: TrainingExperience[] = ['beginner', 'novice', 'intermediate', 'advanced']
  const REPS = ['3-5', '6-8', '8-12', '12-15', '15-20']
  const RPES = ['RPE 6-7', 'RPE 7-8', 'RPE 8']
  const ceiling = getLoadingCeilingKg(single, categorize(single))
  const MAX_FRACTION_OF_BODY = 0.30
  let atCeiling = 0, notHoldable = 0, cells = 0, worst = 0
  clampWarnings = 0
  for (const g of ['male', 'female'] as const) for (const w of WEIGHTS) for (const exp of EXP) for (const r of REPS) for (const rpe of RPES) {
    cells++
    const kg = kgFor(single, buildProfile(g, w, exp), r, rpe).starting_weight_kg!
    if (kg >= ceiling) atCeiling++
    if (kg > w * MAX_FRACTION_OF_BODY) notHoldable++
    worst = Math.max(worst, kg)
  }
  check(`0 of ${cells} cells reach the ${ceiling}kg implement (was 56 of 240 before the anchor moved)`, atCeiling === 0, String(atCeiling))
  check(`the clamp never fires for it (${clampWarnings} warnings)`, clampWarnings === 0)
  check(`never more than ${MAX_FRACTION_OF_BODY * 100}% of bodyweight in one hand on one foot (${notHoldable} cells over; heaviest ${worst}kg)`, notHoldable === 0)
  check('the audit table carries a ceiling for it, written as a total at least twice the worst per-hand value',
    (SAFETY_CEILING_KG_TOTAL.single_leg_calf ?? 0) >= worst * 2, `${SAFETY_CEILING_KG_TOTAL.single_leg_calf} vs ${worst * 2}`)
}

// ---------------------------------------------------------------------------
console.log('\n5. The machine calf raises did not move')
// ---------------------------------------------------------------------------
{
  // Measured before the anchor change on 6 Sep 2026 and pinned. Change these
  // only when you mean to change what a calf machine is loaded to.
  const pinned: Array<['male' | 'female', number, TrainingExperience, number]> = [
    ['male', 80, 'intermediate', 70],
    ['female', 60, 'beginner', 17.5],
    ['male', 120, 'advanced', 142.5],
  ]
  for (const m of MACHINES) {
    const e = getExerciseEntry(m)!
    for (const [g, w, exp, want] of pinned) {
      const got = kgFor(e, buildProfile(g, w, exp)).starting_weight_kg
      check(`${m}: ${w}kg ${g} ${exp} = ${want}kg`, got === want, `got ${got}`)
    }
  }
}

// ---------------------------------------------------------------------------
console.log('\n6. The two anchors are never compared as if they were one')
// ---------------------------------------------------------------------------
{
  // Find a real plan whose week holds BOTH a machine calf raise and the
  // single-leg dumbbell one, by scanning the quality grid rather than pinning
  // a seed that a future selection change could silently retire.
  const GOALS = ['hypertrophy', 'fat_loss', 'conditioning', 'functional']
  function gridProfile(equipment: string, injuries: string[], duration: string, style: string, experience: string, goal: string): UserProfile {
    return buildProfile('male', 80, experience as TrainingExperience, {
      fitness_goal: goal as UserProfile['fitness_goal'], equipment_access: equipment as UserProfile['equipment_access'], injuries,
      training_style: style as UserProfile['training_style'], session_duration_preference: duration as UserProfile['session_duration_preference'],
      workout_split_preference: 'ai_recommendation',
      training_days: [ { day: 'Monday', available: true }, { day: 'Tuesday', available: true }, { day: 'Wednesday', available: false },
        { day: 'Thursday', available: true }, { day: 'Friday', available: true }, { day: 'Saturday', available: false }, { day: 'Sunday', available: false } ],
    })
  }
  let found: { key: string; profile: UserProfile; meso: MesocycleWeek[]; week: MesocycleWeek; machine: number; machineName: string; dumbbell: number } | null = null
  let scanned = 0
  outer: for (const equipment of ALL_EQUIPMENT) for (const injuries of getInjuryCombinations()) for (const duration of ALL_DURATIONS)
    for (const style of ALL_STYLES) for (const experience of ALL_EXPERIENCE) for (const goal of GOALS) {
      if (equipment !== 'full_gym') continue
      scanned++
      const key = [equipment, injuries.join('+') || 'none', duration, style, experience, goal].join('|')
      const profile = gridProfile(equipment, injuries, duration, style, experience, goal)
      setRandomSource(seededRngFromKey(key))
      const meso = quiet(() => { console.log = () => {}; return generateMesocycle(profile) })
      resetRandomSource()
      for (const week of meso) {
        if (week.is_deload) continue
        const all = week.days.flatMap(d => d.exercises)
        const d = all.find(e => e.name === SINGLE_LEG && e.suggested_load_kg != null)
        const m = all.find(e => MACHINES.includes(e.name) && e.suggested_load_kg != null)
        if (d && m) { found = { key, profile, meso, week, machine: m.suggested_load_kg!, machineName: m.name, dumbbell: d.suggested_load_kg!, }; break outer }
      }
      if (scanned > 600) break outer
    }
  check(`a real full-gym plan holds both in one week — sanity check on this section (${found?.key ?? 'none found'} wk${found?.week.week_number})`, found != null)
  if (found) {
    // enforceLoadCoherence's same-group pass caps every member at 2x the
    // group's lightest. In one bucket, a 16kg dumbbell would cap a 95kg
    // machine at 32kg. Split, the machine keeps its own number. THREE times,
    // not two: the first version of this line said "more than twice" and a
    // mutation that re-merged the buckets still passed it — the cap of 12kg
    // rounded up to a 12.5kg stack pin, which is more than 12. The machine
    // tables sit at five to nine times the dumbbell for every body measured,
    // so three is nowhere near a legitimate value and well clear of the trap.
    check(`the ${found.machineName} (${found.machine}kg) was not pulled down toward the dumbbell (${found.dumbbell}kg)`,
      found.machine >= found.dumbbell * 3, `${found.machine} < ${found.dumbbell * 3}`)
    const score = quiet(() => scorePlan(found!.profile, found!.meso, found!.key))
    const calfIncoherence = score.dimensions.selection.deductions.filter(d => d.rule === 'load_incoherent' && /calf/i.test(d.detail))
    check('...and the scorer does not call the pair incoherent', calfIncoherence.length === 0, calfIncoherence.map(d => d.detail).join(' | '))
  }

  // The pass itself, on a two-exercise day, with no rounding to hide behind.
  const stub = (name: string, kg: number): Exercise => ({ name, sets: 3, reps: RULED_REPS, intensity: RULED_RPE, suggested_load_kg: kg, suggested_load: `~${kg}kg` } as unknown as Exercise)
  const dayOf = (...exercises: Exercise[]): WorkoutDay => ({ day: 'Monday', focus: 'Legs', exercises } as unknown as WorkoutDay)
  const split = dayOf(stub('Calf Raises', 70), stub(SINGLE_LEG, 12))
  enforceLoadCoherence([split])
  check('run directly, the pass leaves a 70kg machine calf raise alone beside a 12kg single-leg dumbbell',
    split.exercises[0].suggested_load_kg === 70, `machine now ${split.exercises[0].suggested_load_kg}kg`)
  const control = dayOf(stub('Calf Raises', 70), stub('Seated Calf Raises', 20))
  enforceLoadCoherence([control])
  check('...while two MACHINES 70kg and 20kg apart are still pulled together — the pass is alive and this check has teeth',
    control.exercises[0].suggested_load_kg === 40, `machine now ${control.exercises[0].suggested_load_kg}kg`)
}

// ---------------------------------------------------------------------------
console.log('\n7. It still exists for the reason it was added')
// ---------------------------------------------------------------------------
{
  // "Calf Raises (machine) and Seated Calf Raises were each other's only swap
  // — both machine-bound, so a busy calf station left nothing." The swap
  // path must still offer the dumbbell version to a full-gym trainee; the
  // automatic ROTATION guard (preservesRelativeLoad) may now decline it for
  // some bodies, which is that guard doing its job on an honest number, and
  // a manual swap deliberately does not use that guard.
  const fullGym = buildProfile('male', 80, 'intermediate')
  for (const m of MACHINES) {
    const offered = quiet(() => getReplacementCandidates(m, fullGym, [])).map(c => c.exercise.name)
    check(`a busy ${m} can still be swapped for the dumbbell version`, offered.includes(SINGLE_LEG), offered.join(', '))
  }
  const back = quiet(() => getReplacementCandidates(SINGLE_LEG, fullGym, [])).map(c => c.exercise.name)
  check('...and back again', MACHINES.some(m => back.includes(m)), back.join(', '))
  check('the catalogue still has exactly one hand-held single-leg calf raise (update §5/§6 when that changes)',
    EXERCISE_DATABASE.filter(e => categorize(e) === 'single_leg_calf').length === 1,
    EXERCISE_DATABASE.filter(e => categorize(e) === 'single_leg_calf').map(e => e.name).join(', '))
}

console.log(failures === 0 ? '\nAll single-leg calf checks passed.\n' : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)

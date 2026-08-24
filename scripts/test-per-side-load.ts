// ---------------------------------------------------------------------------
// Gate for "is this number for one side, or both?" (isPerSideLoad in
// load-prescription.ts) and for the block baseline that must not survive a
// rotation (blockBaselineKg/blockWeek3Kg in exercise-plan.ts).
//
// The rules, stated once:
//
//   PER-SIDE means the prescribed number is what ONE limb handles. Three ways
//   that happens: a dumbbell pair, a unilateral single implement, a unilateral
//   weight stack. The standards model always produces a TOTAL, so per-side
//   means halve it — and every consumer (the display label, the rotation
//   comparison) must agree, or the number and its caption disagree on screen.
//
//   A BLOCK BASELINE belongs to the exercise it was measured on. A slot whose
//   variation rotated mid-block has no baseline and must fall through to a
//   fresh estimate.
//
// Why a gate. The per-side rule was written out by hand at three call sites,
// and the third case — a one-arm cable movement — was missing from all of
// them for as long as the file existed: Cable Lateral Raises at 37.5kg for a
// 120kg advanced male against a 25kg category ceiling, 51 of the 54 remaining
// failures in the whole constraint audit. One arm being handed the number
// derived for two.
//
// The baseline half was found by fixing the first: correcting the cable's
// magnitude moved more profiles into a window where a rotated-in exercise
// inherited a stranger's week-1 number, squeaked past the 25% divergence
// backstop at exactly its threshold, and was then rounded UP by plate
// rounding. The audit is the full sweep (13,967 combinations, ~75s); this
// runs the same invariant on a handful of profiles in seconds.
// ---------------------------------------------------------------------------

import {
  isPerSideLoad, labelModeForEntry, prescribeLoad, estimateEffectiveTotalKg,
  isExternallyLoaded, loadingMode, categorize,
} from '../src/lib/load-prescription'
import { EXERCISE_DATABASE, type ExerciseEntry } from '../src/lib/exercise-db'
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import type { UserProfile } from '../src/lib/types'

let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) console.log(`  ✓ ${name}`)
  else {
    failures++
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const byName = (n: string): ExerciseEntry => {
  const e = EXERCISE_DATABASE.find(x => x.name === n)
  if (!e) throw new Error(`fixture missing from EXERCISE_DATABASE: ${n}`)
  return e
}

function buildProfile(o: Partial<UserProfile>): UserProfile {
  return {
    age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
    fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1800, tdee: 2500,
    equipment_access: 'full_gym', injuries: [], training_style: 'hybrid',
    training_experience: 'intermediate', session_duration_preference: '60-90',
    workout_split_preference: 'upper_lower',
    training_days: [
      { day: 'Monday', available: true }, { day: 'Tuesday', available: true },
      { day: 'Wednesday', available: true }, { day: 'Thursday', available: true },
      { day: 'Friday', available: false }, { day: 'Saturday', available: false },
      { day: 'Sunday', available: false },
    ],
    weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
    exercise_exclusions: [] as unknown as never, macro_calculation_mode: 'STANDARD_STATIC',
    coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
    ...o,
  } as UserProfile
}

// ---------------------------------------------------------------------------
console.log('\n1. The rule fires on all three per-side shapes')
// ---------------------------------------------------------------------------
{
  check('a dumbbell PAIR is per-side', isPerSideLoad(byName('Dumbbell Rows')))
  check('a unilateral SINGLE IMPLEMENT is per-side', isPerSideLoad(byName('Suitcase Carry')))
  check('a unilateral WEIGHT STACK is per-side — the case that was missing',
    isPerSideLoad(byName('Cable Lateral Raises')))
}

// ---------------------------------------------------------------------------
console.log('\n2. ...and does not over-fire')
// ---------------------------------------------------------------------------
{
  // The specific over-fire the equipment test guards: loadingMode()'s 'stack'
  // is a FALLBACK bucket, not "a weight stack". Keying on it would sweep in
  // every bodyweight and resistance-band movement.
  const bodyweightUnilateral = byName('Pistol Squat Progression')
  check('a bodyweight unilateral exercise is not per-side', !isPerSideLoad(bodyweightUnilateral))
  check('...and it is in the same `stack` bucket, so the bucket was never the right test',
    loadingMode(bodyweightUnilateral) === 'stack')

  const bandUnilateral = byName('Band Tricep Kickback')
  check('a resistance-band unilateral exercise is not per-side', !isPerSideLoad(bandUnilateral))

  check('a BILATERAL cable lift is not per-side', !isPerSideLoad(byName('Cable Curls')))
  check('a bilateral single implement (held centrally) is not per-side',
    !isPerSideLoad(byName('Goblet Squats')))

  // Deliberately left alone, and now for a stated reason rather than a
  // deferral. Two corrections oppose and roughly cancel on a landmine: one
  // arm can press about HALF what two can, but the far end sits in a floor
  // pivot that carries part of the load, so the bar-end number reads HIGHER
  // than what the hand feels. Modelling each separately means inventing a
  // lever coefficient and a per-side factor and hoping the product is right;
  // using the overhead standard directly asserts only that they cancel, which
  // is the weaker and more defensible claim. Section 5 gates the consequence.
  const landmine = byName('Landmine Press')
  check('a unilateral BARBELL lift is (still) not per-side', !isPerSideLoad(landmine) && landmine.unilateral)
}

// ---------------------------------------------------------------------------
console.log('\n3. A one-arm press is never heavier than the same trainee\'s two-arm press')
// ---------------------------------------------------------------------------
{
  // The invariant that replaces a lever model. It needs no coefficient, it is
  // checkable at every body and rep bracket, and it was violated at 1.66x:
  // Landmine Press resolved to the BENCH standard because categorize()'s
  // pattern fallback collapsed horizontal_push and vertical_push into one
  // case, so a 120kg advanced male was prescribed 132.5kg one-armed against
  // his own 80kg two-arm barbell press. Same shape of reasoning the file
  // already uses for overhead_carry: "if you can't press 10kg overhead for
  // reps, you cannot hold 36kg overhead and walk."
  const landmine = byName('Landmine Press')
  const ohp = byName('Overhead Press')
  const BODIES: [string, Partial<UserProfile>][] = [
    ['120kg advanced male', { weight_kg: 120, training_experience: 'advanced' }],
    ['100kg intermediate male', { weight_kg: 100, training_experience: 'intermediate' }],
    ['80kg novice male', { weight_kg: 80, training_experience: 'novice' }],
    ['50kg novice female', { weight_kg: 50, gender: 'female', training_experience: 'novice' }],
    ['60kg 70yo advanced female', { weight_kg: 60, age: 70, gender: 'female', training_experience: 'advanced' }],
  ]
  const BRACKETS = [
    { repRangeLabel: '6-8', targetRpeLabel: 'RPE 8-9' },
    { repRangeLabel: '8-10', targetRpeLabel: 'RPE 7-8' },
    { repRangeLabel: '12-15', targetRpeLabel: 'RPE 6-7' },
  ]
  let worst: { body: string; lm: number; ohp: number } | null = null
  for (const [label, o] of BODIES) {
    const prof = buildProfile(o)
    for (const b of BRACKETS) {
      const lmKg = prescribeLoad(landmine, prof, { ...b, sets: 3 }).starting_weight_kg ?? 0
      const ohpKg = prescribeLoad(ohp, prof, { ...b, sets: 3 }).starting_weight_kg ?? 0
      if (!worst || lmKg - ohpKg > worst.lm - worst.ohp) worst = { body: label, lm: lmKg, ohp: ohpKg }
    }
  }
  check('the one-arm landmine never exceeds the two-arm barbell press',
    worst != null && worst.lm <= worst.ohp,
    worst ? `worst: ${worst.body} landmine ${worst.lm}kg vs OHP ${worst.ohp}kg` : '')
  console.log(`      closest case: ${worst?.body} — landmine ${worst?.lm}kg, overhead press ${worst?.ohp}kg`)

  // The trapdoor itself, not just the one exercise that fell through it.
  const strays = EXERCISE_DATABASE
    .filter(e => e.movement_pattern === 'vertical_push' && categorize(e) !== 'overhead')
    .map(e => `${e.name} -> ${categorize(e)}`)
  check('EVERY vertical push resolves to the overhead standard, not bench',
    strays.length === 0, strays.join(', '))

  // The over-fire check: horizontal push really is the bench, and splitting
  // the case must not have moved it.
  const pushStrays = EXERCISE_DATABASE
    .filter(e => e.movement_pattern === 'horizontal_push' && e.mechanics_tier !== 'tier3_isolation')
    .filter(e => categorize(e) !== 'bench')
    .map(e => `${e.name} -> ${categorize(e)}`)
  check('horizontal push still resolves to bench', pushStrays.length === 0, pushStrays.join(', '))

  // And the three lifts that were already right must be untouched — a fix
  // that moved correct numbers would be a regression wearing a fix's clothes.
  const prof = buildProfile({ weight_kg: 120, training_experience: 'advanced' })
  const unchanged = [
    ['Overhead Press', 80], ['Dumbbell Shoulder Press', 40], ['Arnold Press', 40],
  ] as const
  for (const [name, expected] of unchanged) {
    const kg = prescribeLoad(byName(name), prof, { repRangeLabel: '8-10', targetRpeLabel: 'RPE 7-8', sets: 3 }).starting_weight_kg
    check(`${name} is unchanged at ${expected}kg`, kg === expected, `${kg}kg`)
  }
}

// ---------------------------------------------------------------------------
console.log('\n4. Every consumer agrees with the rule, for every exercise')
// ---------------------------------------------------------------------------
{
  const labelDisagreements: string[] = []
  for (const entry of EXERCISE_DATABASE) {
    const perSide = isPerSideLoad(entry)
    const labelIsPerSide = labelModeForEntry(entry) !== 'total'
    if (perSide !== labelIsPerSide) labelDisagreements.push(entry.name)
  }
  check('the display label never disagrees with the halving', labelDisagreements.length === 0,
    labelDisagreements.slice(0, 5).join(', '))

  // estimateEffectiveTotalKg exists so two exercises can be compared like for
  // like. Testing 'dumbbell' there while halving on a broader rule would trade
  // one audit failure for another: the newly-halved cable lift would read as
  // half its real demand and the rotation guard would fire on it instead.
  const profile = buildProfile({ weight_kg: 100, training_experience: 'advanced' })
  const totalDisagreements: string[] = []
  for (const entry of EXERCISE_DATABASE) {
    if (!isExternallyLoaded(entry)) continue
    const total = estimateEffectiveTotalKg(entry, profile)
    const displayed = prescribeLoad(entry, profile, {
      targetRpeLabel: 'RPE 7', repRangeLabel: '10', sets: 1,
    }).starting_weight_kg
    if (total == null || displayed == null) continue
    const expected = isPerSideLoad(entry) ? displayed * 2 : displayed
    if (Math.abs(total - expected) > 0.01) totalDisagreements.push(`${entry.name} ${total} vs ${expected}`)
  }
  check('the rotation comparison doubles exactly the per-side lifts back to total',
    totalDisagreements.length === 0, totalDisagreements.slice(0, 4).join(' | '))
}

// ---------------------------------------------------------------------------
console.log('\n5. The number that started this')
// ---------------------------------------------------------------------------
{
  const cable = byName('Cable Lateral Raises')
  const ISOLATION_SHOULDER_CEILING_KG = 25 // dev-constraint-audit.ts's SAFETY_CEILING_KG
  const heaviest = buildProfile({ weight_kg: 120, gender: 'male', training_experience: 'advanced' })
  let worst = 0
  for (const reps of ['6-8', '8-10', '10-12', '15-20']) {
    for (const rpe of ['RPE 6-7', 'RPE 7-8', 'RPE 8-9']) {
      worst = Math.max(worst, prescribeLoad(cable, heaviest, { targetRpeLabel: rpe, repRangeLabel: reps, sets: 3 }).starting_weight_kg ?? 0)
    }
  }
  check(`the heaviest cable lateral raise in the sweep is under its ceiling (${worst}kg <= ${ISOLATION_SHOULDER_CEILING_KG}kg)`,
    worst <= ISOLATION_SHOULDER_CEILING_KG, `${worst}kg`)
  check('...and is still a real prescription, not clamped to nothing', worst >= 10, `${worst}kg`)
}

// ---------------------------------------------------------------------------
console.log('\n6. A block baseline never survives a rotation')
// ---------------------------------------------------------------------------
{
  // The invariant, run over real generated mesocycles: whenever a slot's
  // exercise CHANGES between two loading weeks of the same block, the new
  // exercise's displayed load must be a number that exercise could have been
  // given on its own — within the same 125% band the audit enforces.
  const BODIES = [
    { w: 50, g: 'female' as const, e: 'advanced' as const },
    { w: 50, g: 'female' as const, e: 'intermediate' as const },
    { w: 65, g: 'female' as const, e: 'intermediate' as const },
    { w: 80, g: 'male' as const, e: 'intermediate' as const },
    { w: 90, g: 'male' as const, e: 'intermediate' as const },
    { w: 120, g: 'male' as const, e: 'advanced' as const },
  ]
  const offences: string[] = []
  let rotations = 0
  for (const b of BODIES) {
    const label = `per-side-gate ${b.e}/${b.w}${b.g}`
    const profile = buildProfile({ weight_kg: b.w, gender: b.g, training_experience: b.e })
    setRandomSource(seededRngFromKey(label))
    const d = console.debug, warn = console.warn
    console.debug = () => {}; console.warn = () => {}
    const meso = generateMesocycle(profile)
    console.debug = d; console.warn = warn
    resetRandomSource()

    for (let i = 1; i < meso.length; i++) {
      const prev = meso[i - 1], week = meso[i]
      if (prev.is_deload || week.is_deload || prev.block_number !== week.block_number) continue
      for (const day of week.days) {
        const prevDay = prev.days.find(x => x.day === day.day)
        if (!prevDay) continue
        for (let j = 0; j < day.exercises.length; j++) {
          const ex = day.exercises[j], prevEx = prevDay.exercises[j]
          if (!prevEx || prevEx.name === ex.name) continue
          if (ex.suggested_load_kg == null || !ex.intensity) continue
          const entry = EXERCISE_DATABASE.find(e => e.name === ex.name)
          if (!entry || !isExternallyLoaded(entry)) continue
          rotations++
          const fresh = prescribeLoad(entry, profile, {
            targetRpeLabel: ex.intensity, repRangeLabel: ex.reps, sets: ex.sets,
          })
          if (!fresh.starting_weight_kg) continue
          const ratio = ex.suggested_load_kg / fresh.starting_weight_kg
          if (ratio > 1.25) {
            offences.push(`${label} wk${week.week_number} ${day.day} "${prevEx.name}"->"${ex.name}" ${ex.suggested_load_kg}kg vs fresh ${fresh.starting_weight_kg}kg (${Math.round(ratio * 100)}%)`)
          }
        }
      }
    }
  }
  check(`saw ${rotations} mid-block rotations to check`, rotations > 20, String(rotations))
  check('not one rotated-in exercise inherited a load it could not have earned',
    offences.length === 0, offences.slice(0, 3).join(' | '))
}

console.log(failures === 0 ? '\nAll per-side-load checks passed.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)

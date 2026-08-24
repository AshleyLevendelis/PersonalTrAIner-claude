// ---------------------------------------------------------------------------
// Gate for the "we don't know this person's body" load path (backlog 2b).
//
// The invariant, stated once: NO PRESCRIBED LOAD MAY BE DERIVED FROM A BODY
// METRIC THE USER NEVER GAVE US WITHOUT BEING MARKED AS SUCH — and the number
// it produces must never exceed what the same person would be given if they
// HAD told us.
//
// Why a gate rather than a code review: the defect was three `||`s
// (`profile.weight_kg || 75`) that read as ordinary defensive coding and had
// survived every existing suite, because not one audit or test profile
// anywhere in the repo left a body metric undefined. The whole failure mode
// is invisible unless something deliberately omits them. This is that
// something.
//
// The matrix half matters as much as the invariant half: the guard must not
// OVER-fire. Someone who gave their weight must still get an ordinary
// 'estimate', and someone who reported a real squat number must still get
// 'known_weight' on squats even if they declined their weight.
// ---------------------------------------------------------------------------

import {
  prescribeLoad, resolveBodyBasis, isUnverifiedLoadSource,
} from '../src/lib/load-prescription'
import { EXERCISE_DATABASE } from '../src/lib/exercise-db'
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import type { UserProfile, MesocycleWeek } from '../src/lib/types'

let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) console.log(`  ✓ ${name}`)
  else {
    failures++
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function buildProfile(overrides: Partial<UserProfile>): UserProfile {
  return {
    age: 30, gender: 'male', height_cm: 178, weight_kg: 80,
    activity_level: 'moderate', fitness_goal: 'hypertrophy', preferred_time: 'morning',
    bmr: 1800, tdee: 2500, equipment_access: 'full_gym', injuries: [],
    training_style: 'bodybuilding', training_experience: 'intermediate',
    session_duration_preference: '60-90', workout_split_preference: 'ai_recommendation',
    training_days: [
      { day: 'Monday', available: true },
      { day: 'Tuesday', available: false },
      { day: 'Wednesday', available: true },
      { day: 'Thursday', available: false },
      { day: 'Friday', available: true },
      { day: 'Saturday', available: false },
      { day: 'Sunday', available: false },
    ],
    weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
    exercise_exclusions: [] as unknown as never,
    macro_calculation_mode: 'STANDARD_STATIC', coaching_persona: 'supportive',
    recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
    ...overrides,
  } as UserProfile
}

function withoutBody(p: UserProfile): UserProfile {
  const out = { ...p }
  delete (out as Record<string, unknown>).weight_kg
  delete (out as Record<string, unknown>).age
  delete (out as Record<string, unknown>).gender
  return out
}

const squat = EXERCISE_DATABASE.find(e => e.name === 'Barbell Squats')!
const curl = EXERCISE_DATABASE.find(e => e.name === 'Barbell Curls')!
if (!squat || !curl) throw new Error('exercise fixtures missing from EXERCISE_DATABASE')

// ---------------------------------------------------------------------------
console.log('\n1. resolveBodyBasis reports absence instead of hiding it')
// ---------------------------------------------------------------------------
{
  const full = resolveBodyBasis(buildProfile({}))
  check('a complete profile is not assumed', full.assumed === false && full.missing.length === 0)
  check('a complete profile keeps its own numbers', full.weightKg === 80 && full.gender === 'male' && full.ageYears === 30)

  const none = resolveBodyBasis(withoutBody(buildProfile({})))
  check('all three declined -> assumed', none.assumed === true)
  check('all three named in missing', none.missing.join(',') === 'weight,sex,age', none.missing.join(','))

  const noWeight = resolveBodyBasis(buildProfile({ weight_kg: undefined }))
  check('one field declined -> still assumed', noWeight.assumed === true && noWeight.missing.join(',') === 'weight')
  check('the fields they DID give are kept, not overwritten', noWeight.gender === 'male' && noWeight.ageYears === 30)

  // The specific silent bias: `=== 'female' ? … : 'male'` sorted UNKNOWN into
  // the heavier standards table. Unknown must be its own case.
  const noSex = resolveBodyBasis(buildProfile({ gender: undefined }))
  check('unknown sex is not silently male', noSex.assumed === true && noSex.missing.includes('sex'))
  check('unknown sex resolves to the LOWER standards table', noSex.gender === 'female', noSex.gender)

  // Legacy zero rows (written while the columns were NOT NULL) are not
  // measurements. Same falsy rule resolveBodyMetrics uses.
  const zeroed = resolveBodyBasis(buildProfile({ weight_kg: 0 }))
  check('a zero weight counts as absent, not as 0kg', zeroed.assumed === true && zeroed.missing.includes('weight'))
}

// ---------------------------------------------------------------------------
console.log('\n2. THE INVARIANT: an assumed body is never prescribed more than a real one')
// ---------------------------------------------------------------------------
{
  const PEOPLE: { label: string; overrides: Partial<UserProfile> }[] = [
    { label: '55kg 52yo woman, novice', overrides: { weight_kg: 55, age: 52, gender: 'female', training_experience: 'novice' } },
    { label: '50kg 25yo woman, beginner', overrides: { weight_kg: 50, age: 25, gender: 'female', training_experience: 'beginner' } },
    { label: '100kg 35yo man, intermediate', overrides: { weight_kg: 100, age: 35, gender: 'male', training_experience: 'intermediate' } },
    { label: '75kg 30yo man, novice (the OLD assumed body)', overrides: { weight_kg: 75, age: 30, gender: 'male', training_experience: 'novice' } },
    { label: '60kg 70yo man, advanced', overrides: { weight_kg: 60, age: 70, gender: 'male', training_experience: 'advanced' } },
  ]
  const opts = { targetRpeLabel: 'RPE 8', repRangeLabel: '8-10', sets: 3 }
  for (const person of PEOPLE) {
    const stated = buildProfile(person.overrides)
    const declined = withoutBody(stated)
    const s = prescribeLoad(squat, stated, opts).starting_weight_kg!
    const d = prescribeLoad(squat, declined, opts).starting_weight_kg!
    check(`${person.label}: declined (${d}kg) <= stated (${s}kg)`, d <= s, `${(d / s).toFixed(2)}x`)
  }
}

// ---------------------------------------------------------------------------
console.log('\n3. The number is marked, everywhere it can be read')
// ---------------------------------------------------------------------------
{
  const opts = { targetRpeLabel: 'RPE 8', repRangeLabel: '8-10', sets: 3 }
  const assumed = prescribeLoad(squat, withoutBody(buildProfile({})), opts)
  check('load_source is assumed_body', assumed.load_source === 'assumed_body', assumed.load_source)
  check('isUnverifiedLoadSource agrees', isUnverifiedLoadSource(assumed.load_source))
  check('the basis does NOT claim it came from their body',
    !/for your bodyweight, sex and experience/.test(assumed.basis), assumed.basis)
  check('the basis names the gap', /don't know your weight/.test(assumed.basis), assumed.basis)

  const real = prescribeLoad(squat, buildProfile({}), opts)
  check('a complete profile is still a plain estimate', real.load_source === 'estimate', real.load_source)

  // The guard must not swallow a real self-reported number. Someone who
  // reported their squat but declined their weight gets an honest
  // 'known_weight' on squats and 'assumed_body' on everything else.
  const mixed = withoutBody(buildProfile({}))
  const anchored = prescribeLoad(squat, mixed, { ...opts, knownWorkingWeights: { squat: 100 } })
  check('a reported squat still reads known_weight despite no bodyweight',
    anchored.load_source === 'known_weight', anchored.load_source)
  check('...and is NOT damped down to the assumed body', anchored.starting_weight_kg! > 60,
    `${anchored.starting_weight_kg}kg`)
  const unanchored = prescribeLoad(curl, mixed, { ...opts, knownWorkingWeights: { squat: 100 } })
  check('...while an unanchored lift on the same profile is assumed_body',
    unanchored.load_source === 'assumed_body', unanchored.load_source)

  // The forced-ramp branch short-circuits without re-deriving, but the number
  // it carries still traces back to an assumed body — provenance has to
  // survive that path or weeks 2+ of every block would silently read clean.
  const forced = prescribeLoad(squat, withoutBody(buildProfile({})), { ...opts, forceStartingWeightKg: 60 })
  check('the within-block ramp path keeps assumed_body', forced.load_source === 'assumed_body', forced.load_source)
}

// ---------------------------------------------------------------------------
console.log('\n4. Calibration cannot be skipped on a body we invented')
// ---------------------------------------------------------------------------
function generate(profile: UserProfile, seed: string): MesocycleWeek[] {
  setRandomSource(seededRngFromKey(seed))
  const d = console.debug, w = console.warn
  console.debug = () => {}; console.warn = () => {}
  try { return generateMesocycle(profile) } finally { console.debug = d; console.warn = w; resetRandomSource() }
}
{
  // (a) The related defect: "I know my numbers" is a yes/no answer, and the
  // three number slots are never-blocking, so it could be true with nothing
  // behind it. Measured before the fix: that path prescribed a 55kg woman a
  // mean 2.22x her own loads with no calibration week anywhere.
  const bluffer = buildProfile({ weight_kg: 55, age: 52, gender: 'female', skip_calibration_week: true })
  check('skip=true with zero lift numbers still gets a calibration week',
    generate(bluffer, 'g')[0]?.isCalibrationWeek === true)

  // (b) Real numbers AND a real body: skipping is legitimate, and must still work.
  const honest = buildProfile({ skip_calibration_week: true, known_squat_kg: 100, known_bench_kg: 70, known_deadlift_kg: 130 })
  check('skip=true with real numbers and a real body still skips',
    generate(honest, 'g')[0]?.isCalibrationWeek === false)

  // (c) Real lift numbers, declined body: the ~12 categories those numbers
  // don't anchor are still guesses about a stranger.
  const halfKnown = withoutBody(buildProfile({ skip_calibration_week: true, known_squat_kg: 100 }))
  check('skip=true with real numbers but no body gets a calibration week',
    generate(halfKnown, 'g')[0]?.isCalibrationWeek === true)

  // (d) The ordinary unverified user is untouched by all of this.
  check('an ordinary unverified profile still gets its calibration week',
    generate(buildProfile({}), 'g')[0]?.isCalibrationWeek === true)
}

// ---------------------------------------------------------------------------
console.log('\n5. End to end: a declined profile never out-prescribes a stated one')
// ---------------------------------------------------------------------------
{
  // The failure this catches is the one that made the whole item worth doing:
  // the fix could be correct at prescribeLoad and still be undone downstream
  // by the unverified ramp, whose ceiling IS the estimate. So this walks the
  // whole generated mesocycle, not just week 1.
  const stated = buildProfile({ weight_kg: 55, age: 52, gender: 'female', training_experience: 'novice' })
  const declined = withoutBody(stated)
  const mS = generate(stated, 'e2e')
  const mD = generate(declined, 'e2e')

  let compared = 0
  let overshoots: string[] = []
  for (let i = 0; i < Math.min(mS.length, mD.length); i++) {
    const byName = new Map<string, number>()
    for (const day of mS[i].days) for (const ex of day.exercises) {
      if (ex.suggested_load_kg != null && !byName.has(ex.name)) byName.set(ex.name, ex.suggested_load_kg)
    }
    for (const day of mD[i].days) for (const ex of day.exercises) {
      const s = byName.get(ex.name)
      if (s == null || ex.suggested_load_kg == null) continue
      compared++
      // Equal is fine and common — both sides floor at the empty bar.
      if (ex.suggested_load_kg > s) overshoots.push(`wk${i + 1} ${ex.name} ${s}kg -> ${ex.suggested_load_kg}kg`)
    }
  }
  check(`compared ${compared} prescriptions across ${Math.min(mS.length, mD.length)} weeks`, compared > 100, String(compared))
  check('not one of them is heavier for the declined profile', overshoots.length === 0,
    overshoots.slice(0, 5).join(' | '))

  const sources = new Set<string>()
  for (const wk of mD) for (const day of wk.days) for (const ex of day.exercises) {
    if (ex.suggested_load_kg != null) sources.add(ex.load_source ?? '(unset)')
  }
  check('every loaded row on the declined plan is marked assumed_body',
    sources.size === 1 && sources.has('assumed_body'), [...sources].join(','))
}

console.log(failures === 0 ? '\nAll assumed-body load checks passed.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)

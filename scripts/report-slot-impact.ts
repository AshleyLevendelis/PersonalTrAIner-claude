// ---------------------------------------------------------------------------
// Which onboarding questions actually change the training plan?
//
// WHY THIS EXISTS RATHER THAN A LIST OF QUESTIONS TO CUT. Asked for an honest
// read on onboarding, the first pass proposed two "obvious" adaptive skips:
// don't ask a bodyweight trainee about training style, don't ask a
// conditioning trainee about cardio. Measuring took two minutes and killed
// both — 4 styles produce 4 different plans, 3 cardio preferences produce 3.
// Confidence was not evidence. So the deliverable is the measurement, and any
// cut is argued afterwards against a number.
//
// It also settles the reverse mistake. `recoveryCapacity` carried a comment
// saying it "has zero effect anywhere in the generated plan", written when
// that was true and left standing after RECOVERY_SET_MULTIPLIER landed. Read
// literally, it was an argument for demoting the question — which would have
// handed the most tired trainees a third more volume.
//
// TWO THINGS THIS DOES NOT MEASURE, both of which have already misled someone:
//
//   1. NUTRITION. Only the training half is generated here. `activityLevel`
//      scores 1-of-4 below and is NOT a candidate for cutting: it drives TDEE,
//      which this report cannot see. Every row is labelled so the number
//      cannot be read as "this question does nothing".
//   2. THE BASE WEEK ALONE. recoveryCapacity is identical in week 1 and
//      differs by ~33% of total sets across a 16-week block. Anything that
//      reports only generateExercisePlan will call it inert. This walks the
//      whole mesocycle.
//
// AND THE MEASUREMENT ITSELF: every variation of one slot runs on the SAME
// seeded RNG stream. Selection carries a +/-0.3 tie-break jitter, so seeding
// per-variation would make every slot look 100% influential — it would be
// measuring the seed.
// ---------------------------------------------------------------------------

import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { ONBOARDING_SLOTS } from '../src/lib/onboarding-slots'
import { seededRngFromKey } from '../src/lib/seeded-random'
import type { UserProfile, EquipmentAccess, MesocycleWeek } from '../src/lib/types'

function buildProfile(o: Partial<UserProfile>): UserProfile {
  return {
    age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
    fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1800, tdee: 2500,
    equipment_access: 'full_gym', injuries: [], training_style: 'hybrid',
    training_experience: 'intermediate', session_duration_preference: '45-60',
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

/**
 * What "a different plan" means.
 *
 * Everything a trainee would actually see change: which lifts, how many sets,
 * what reps, how long they rest, and what weight is on the bar. Deliberately
 * NOT a stringify of the whole object — coach_note and phase_label are prose
 * that varies with the goal name, which would report a difference nobody
 * trains differently because of.
 */
function signature(weeks: MesocycleWeek[]): string {
  return weeks.map(w => w.days.map(d =>
    d.exercises.map(e => `${e.name}|${e.sets}|${e.reps}|${e.rest}|${e.suggested_load_kg ?? ''}|${e.tempo ?? ''}`).join(';'),
  ).join('//')).join('\n')
}

function totalSets(weeks: MesocycleWeek[]): number {
  return weeks.reduce((n, w) => n + w.days.reduce((m, d) => m + d.exercises.reduce((k, e) => k + e.sets, 0), 0), 0)
}

/**
 * The profile field each slot writes, per assembleProfile.
 *
 * Hand-written, because that mapping only exists as an object literal in
 * assembleProfile and nothing machine-readable carries it. So the risk is a
 * new slot being added and silently never measured — which is the same shape
 * of silence the order gate was built for. UNMEASURED below is the other half
 * of the guard: every slot with options must be in exactly one of the two,
 * and the run FAILS if one is in neither.
 */
const TRAINING_INPUT: Record<string, keyof UserProfile> = {
  fitnessGoal: 'fitness_goal',
  trainingExperience: 'training_experience',
  activityLevel: 'activity_level',
  sessionDuration: 'session_duration_preference',
  trainingStyle: 'training_style',
  conditioningPreference: 'conditioning_preference',
  recoveryCapacity: 'recovery_capacity',
  gender: 'gender',
}

/** Slots this report cannot or should not vary, each with the reason. */
const UNMEASURED: Record<string, string> = {
  equipment: 'it IS the axis — every row below is reported per equipment tier',
  knowsWorkingLifts: 'measured separately: it sets skip_calibration_week AND three load anchors together',
  trainingDays: 'multi-select; day COUNT is measured below instead of every subset',
  injuries: 'multi-select and safety-path — test:injury-* own it, and it must never be cut on a volume number',
  dietaryPreferences: 'NUTRITION — allergen path, never a candidate regardless of what training does',
  mealsPerDay: 'NUTRITION',
  cookingTime: 'NUTRITION',
  includeSnacks: 'NUTRITION',
  favoriteCuisines: 'NUTRITION',
  breakfastStyle: 'NUTRITION',
}

/**
 * Slots that feed the NUTRITION half, which this report cannot generate.
 *
 * Read straight off macro-calculator: bodyMetrics() needs weight_kg,
 * height_cm, age and gender or it returns null and every target goes blank,
 * and computeStaticTDEE multiplies BMR by activity_level. So a "1 of N" on
 * any of these five means "does not change the TRAINING plan" and nothing
 * more — cutting one would blank someone's calorie target.
 *
 * Attached to the output by data rather than by a special case on
 * activityLevel, because heightCm reads 1-of-3 too and would otherwise have
 * appeared in a list headed "candidates for skipping" with no caveat at all.
 */
const ALSO_NUTRITION: Record<string, string> = {
  activityLevel: 'the TDEE multiplier',
  weightKg: 'BMR — blank targets without it',
  heightCm: 'BMR — blank targets without it',
  age: 'BMR — blank targets without it',
  gender: 'BMR — blank targets without it',
}

const EQUIP: EquipmentAccess[] = ['full_gym', 'home_gym', 'minimalist', 'bodyweight']

let failures = 0

// --- the guard: no slot with options may be silently unmeasured -------------
{
  const optioned = ONBOARDING_SLOTS.filter(s => s.options && s.options.length > 0).map(s => s.key)
  const orphan = optioned.filter(k => !(k in TRAINING_INPUT) && !(k in UNMEASURED))
  if (orphan.length) {
    failures++
    console.error(`\n✗ slot(s) with options neither measured nor excused: ${orphan.join(', ')}`)
    console.error('  Add to TRAINING_INPUT (with its profile field) or to UNMEASURED (with a reason).')
  }
}

function quiet<T>(fn: () => T): T {
  const d = console.debug, w = console.warn, l = console.log
  console.debug = () => {}; console.warn = () => {}; console.log = () => {}
  try { return fn() } finally { console.debug = d; console.warn = w; console.log = l }
}

interface Cell { distinct: number; of: number; minSets: number; maxSets: number }

/** Vary one field across `values`, holding everything else and the RNG fixed. */
function measure(field: keyof UserProfile, values: unknown[], base: Partial<UserProfile>, seedKey: string): Cell {
  const sigs = new Set<string>()
  let minSets = Infinity, maxSets = 0
  for (const v of values) {
    const profile = buildProfile({ ...base, [field]: v } as Partial<UserProfile>)
    const weeks = quiet(() => {
      // SAME seed for every value. See the header: a per-value seed measures
      // the tie-break jitter, not the question.
      setRandomSource(seededRngFromKey(seedKey))
      try { return generateMesocycle(profile) } finally { resetRandomSource() }
    })
    sigs.add(signature(weeks))
    const t = totalSets(weeks)
    if (t < minSets) minSets = t
    if (t > maxSets) maxSets = t
  }
  return { distinct: sigs.size, of: values.length, minSets, maxSets }
}

console.log('\n=== report:slot-impact ===')
console.log('Measures the TRAINING plan only — the full 16-week mesocycle, not the base week.')
console.log('A "1 of N" row does NOT mean the question is useless: it may drive nutrition,')
console.log('which nothing here generates. See activityLevel.\n')

const rows: { slot: string; cells: Map<string, Cell>; note?: string }[] = []

for (const [slotKey, field] of Object.entries(TRAINING_INPUT)) {
  const def = ONBOARDING_SLOTS.find(s => s.key === slotKey)
  if (!def?.options) { failures++; console.error(`✗ ${slotKey} has no options — TRAINING_INPUT is stale`); continue }
  const values = def.options.map(o => o.value)
  const cells = new Map<string, Cell>()
  for (const equipment_access of EQUIP) {
    cells.set(equipment_access, measure(field, values, { equipment_access }, `si:${slotKey}:${equipment_access}`))
  }
  rows.push({ slot: slotKey, cells })
}

// The three body numerics, which are not option lists but are exactly the
// values the reorder moved to the front — the ones that drive every
// prescribed weight. Measured with a realistic spread rather than every value.
const NUMERIC: { slot: string; field: keyof UserProfile; values: number[] }[] = [
  { slot: 'weightKg', field: 'weight_kg', values: [50, 80, 110] },
  { slot: 'heightCm', field: 'height_cm', values: [155, 178, 195] },
  { slot: 'age', field: 'age', values: [18, 35, 65] },
]
for (const { slot, field, values } of NUMERIC) {
  const cells = new Map<string, Cell>()
  for (const equipment_access of EQUIP) {
    cells.set(equipment_access, measure(field, values, { equipment_access }, `si:${slot}:${equipment_access}`))
  }
  rows.push({ slot, cells, note: 'sampled (3 values), not exhaustive' })
}

// trainingDays as a COUNT, since the real question is "does how many days you
// picked change the plan", not "does Tuesday differ from Wednesday".
{
  const mkDays = (n: number) => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    .map((day, i) => ({ day, available: i < n }))
  const cells = new Map<string, Cell>()
  for (const equipment_access of EQUIP) {
    const sigs = new Set<string>()
    let minSets = Infinity, maxSets = 0
    for (const n of [2, 3, 4, 5, 6]) {
      const profile = buildProfile({ equipment_access, training_days: mkDays(n) } as Partial<UserProfile>)
      const weeks = quiet(() => {
        setRandomSource(seededRngFromKey(`si:trainingDays:${equipment_access}`))
        try { return generateMesocycle(profile) } finally { resetRandomSource() }
      })
      sigs.add(signature(weeks))
      const t = totalSets(weeks)
      if (t < minSets) minSets = t
      if (t > maxSets) maxSets = t
    }
    cells.set(equipment_access, { distinct: sigs.size, of: 5, minSets, maxSets })
  }
  rows.push({ slot: 'trainingDays', cells, note: 'measured as day COUNT (2-6), not which days' })
}

// --- output ----------------------------------------------------------------
const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length))
const W = 24
console.log(pad('slot', W) + EQUIP.map(e => pad(e, 14)).join('') + 'total sets (min→max, full_gym)')
console.log('-'.repeat(W + EQUIP.length * 14 + 32))
for (const r of rows) {
  const fg = r.cells.get('full_gym')!
  const line = pad(r.slot, W)
    + EQUIP.map(e => { const c = r.cells.get(e)!; return pad(`${c.distinct} of ${c.of}`, 14) }).join('')
    + `${fg.minSets} → ${fg.maxSets}`
  console.log(line + (r.note ? `   (${r.note})` : ''))
}

console.log('\nInert FOR TRAINING, per tier:')
let anyInert = false
const candidates: string[] = []
for (const r of rows) {
  const inert = EQUIP.filter(e => r.cells.get(e)!.distinct === 1)
  if (inert.length === 0) continue
  anyInert = true
  const all = inert.length === EQUIP.length
  const nutrition = ALSO_NUTRITION[r.slot]
  console.log(`  ${pad(r.slot, W)} ${pad(all ? 'EVERY tier' : inert.join(', '), 34)}`
    + (nutrition ? `NOT a candidate — feeds ${nutrition}.` : 'candidate: needs one argued decision.'))
  if (!nutrition) candidates.push(r.slot)
}
if (!anyInert) console.log('  (none)')
console.log(`\nActual candidates for cutting, after the nutrition filter: ${candidates.length ? candidates.join(', ') : 'NONE'}`)

console.log(`\n${failures === 0 ? 'Report complete.' : `${failures} STRUCTURAL FAILURE(S) — see above.`}\n`)
process.exit(failures === 0 ? 0 : 1)

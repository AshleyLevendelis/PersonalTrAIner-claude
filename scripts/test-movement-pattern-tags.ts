// ---------------------------------------------------------------------------
// Gate for movement_pattern meaning what it says.
//
// Named for the CLASS, not the instance, because this is the third defect of
// exactly this shape in as many rounds: a tag that answers one question being
// used to answer another.
//
//   - loads_joints answered "does this joint participate?" and was used for
//     "is this dangerous when injured?" — so a shoulder injury removed
//     shoulder rehab. Split into contraindicated_joints/indicated_joints.
//   - movement_pattern's vertical_push fell back to the BENCH standard, so a
//     one-armed landmine press was prescribed 1.66x a two-arm press.
//   - movement_pattern's isolation_shoulder held both deltoid work AND traps,
//     so shrugs filled push days' shoulder accessory slot. MEASURED before
//     the split: 31 of 59 shrug placements landed on a pressing day.
//
// The last one is what this file starts with. The rules:
//
//   A PATTERN IS A PLACEMENT DECISION. Two movements share a pattern only if
//   they belong on the same training day. Muscle adjacency is not enough.
//   SPLITTING A PATTERN MUST NOT ORPHAN ITS MEMBERS. A fix that made shrugs
//   unreachable would be worse than the bug it fixed.
//   PLACEMENT IS NOT LOAD. This split must not move a single prescribed
//   kilo — categorize() already routed shrugs correctly.
// ---------------------------------------------------------------------------

import { generateExercisePlan, setRandomSource, resetRandomSource, patternLabel } from '../src/lib/exercise-plan'
import { categorize, prescribeLoad } from '../src/lib/load-prescription'
import { EXERCISE_DATABASE } from '../src/lib/exercise-db'
import { seededRngFromKey } from '../src/lib/seeded-random'
import type { UserProfile, WorkoutDay } from '../src/lib/types'

let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) console.log(`  ✓ ${name}`)
  else {
    failures++
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

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

function gen(profile: UserProfile, seed: string): WorkoutDay[] {
  setRandomSource(seededRngFromKey(seed))
  const d = console.debug, w = console.warn
  console.debug = () => {}; console.warn = () => {}
  try { return generateExercisePlan(profile).plan } finally { console.debug = d; console.warn = w; resetRandomSource() }
}

const isShrug = (n: string) => /shrug/i.test(n)
const isPushTrack = (focus: string) => /Push|Press|Chest|Tricep/i.test(focus)

// ---------------------------------------------------------------------------
console.log('\n1. The tag holds one kind of thing')
// ---------------------------------------------------------------------------
{
  const isoShoulder = EXERCISE_DATABASE.filter(e => e.movement_pattern === 'isolation_shoulder')
  check('isolation_shoulder holds only deltoid work, no traps',
    isoShoulder.every(e => !isShrug(e.name)), isoShoulder.filter(e => isShrug(e.name)).map(e => e.name).join(', '))
  check('...and is not empty — the slot was corrected, not deleted', isoShoulder.length > 0, String(isoShoulder.length))

  const traps = EXERCISE_DATABASE.filter(e => e.movement_pattern === 'isolation_trap')
  check('every shrug in the database is isolation_trap',
    EXERCISE_DATABASE.filter(e => isShrug(e.name)).every(e => e.movement_pattern === 'isolation_trap'))
  check('...and isolation_trap holds nothing that is not trap work',
    traps.every(e => isShrug(e.name)), traps.filter(e => !isShrug(e.name)).map(e => e.name).join(', '))
}

// ---------------------------------------------------------------------------
console.log('\n2. Placement: shrugs off push days, without being orphaned')
// ---------------------------------------------------------------------------
{
  const byFocus = new Map<string, number>()
  let shrugDays = 0, totalDays = 0
  const offenders: string[] = []
  for (const split of ['upper_lower', 'push_pull_legs', 'full_body', 'ai_recommendation'] as const) {
    for (const style of ['hybrid', 'bodybuilding', 'functional'] as const) {
      for (let s = 0; s < 6; s++) {
        for (const day of gen(buildProfile({ workout_split_preference: split, training_style: style }), `pt:${split}:${style}:${s}`)) {
          if (day.exercises.length === 0) continue
          totalDays++
          if (!day.exercises.some(e => isShrug(e.name))) continue
          shrugDays++
          byFocus.set(day.focus, (byFocus.get(day.focus) ?? 0) + 1)
          if (isPushTrack(day.focus)) offenders.push(`${split}/${style}/${s}: ${day.focus}`)
        }
      }
    }
  }
  console.log(`      ${shrugDays} of ${totalDays} training days carry a shrug: ${[...byFocus].map(([f, n]) => `${f}=${n}`).join(', ')}`)
  check('not one shrug lands on a pressing day', offenders.length === 0, offenders.slice(0, 3).join(' | '))
  // The other half: a split that orphans its members is worse than the bug.
  check('shrugs are still reachable — they did not vanish with the slot', shrugDays > 0, String(shrugDays))
  check('...and on more than one track, so it is not one lucky slot', byFocus.size > 1,
    [...byFocus.keys()].join(', '))
}

// ---------------------------------------------------------------------------
console.log('\n3. The over-fire check: deltoid work still gets its push-day slot')
// ---------------------------------------------------------------------------
{
  let lateralOnPush = 0
  for (let s = 0; s < 12; s++) {
    for (const day of gen(buildProfile({ workout_split_preference: 'push_pull_legs' }), `pt:lat:${s}`)) {
      if (!isPushTrack(day.focus)) continue
      if (day.exercises.some(e => /lateral raise/i.test(e.name))) lateralOnPush++
    }
  }
  check('lateral raises still appear on push days', lateralOnPush > 0, String(lateralOnPush))
}

// ---------------------------------------------------------------------------
console.log('\n4. Placement is not load — not one kilo may move')
// ---------------------------------------------------------------------------
{
  const profile = buildProfile({})
  for (const name of ['Shrugs', 'Dumbbell Shrugs']) {
    const e = EXERCISE_DATABASE.find(x => x.name === name)!
    check(`${name} still categorises as 'shrug'`, categorize(e) === 'shrug', String(categorize(e)))
    const kg = prescribeLoad(e, profile, { targetRpeLabel: 'RPE 6-7', repRangeLabel: '15-18', sets: 3 }).starting_weight_kg
    // Captured before the retag, on this exact profile and bracket.
    check(`${name} is unchanged at 28kg`, kg === 28, `${kg}kg`)
  }
}

// ---------------------------------------------------------------------------
console.log('\n5. The trapdoor is shut')
// ---------------------------------------------------------------------------
{
  // categorize()'s pattern fallback must know the new value, or a future trap
  // movement whose name lacks "shrug" gets no load at all — the exact failure
  // the vertical_push fallback produced for Landmine Press.
  const fake = { ...EXERCISE_DATABASE.find(e => e.name === 'Dumbbell Shrugs')!, name: 'Trap Bar Yoke Elevation' }
  check('a trap movement whose NAME lacks "shrug" still resolves to a category',
    categorize(fake) === 'shrug', String(categorize(fake)))

  // The one place a pattern name reaches a trainee. A missing case here
  // returns undefined and prints "undefined" into a gap note.
  check('the new pattern has plain-English copy for the trainee',
    typeof patternLabel('isolation_trap') === 'string' && patternLabel('isolation_trap').length > 0,
    String(patternLabel('isolation_trap')))
}

console.log(failures === 0 ? '\nAll movement-pattern-tag checks passed.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)

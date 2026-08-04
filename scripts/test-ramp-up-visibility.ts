/**
 * Ramp-up-visibility regression test.
 *
 * Real bug: an advanced profile's Push & Press day showed "Barbell Bench
 * Press — S1: 90kg, S2: 90kg, S3: 90kg" on the plan screen with no ramp/
 * build-up sets visible anywhere except inside a collapsed, day-level
 * "Warm-Up" section that has no code-level tie to the specific exercise row.
 * Diagnosis: buildWarmup (warmup.ts) correctly generated a ramp block for
 * Barbell Bench Press — it just lived exclusively on WorkoutDay.warmup.
 * ramp_ups, a day-level array keyed by exercise NAME STRING, never copied
 * onto the Exercise object the row actually renders from.
 *
 * The fix attaches a matching RampBlock onto Exercise.ramp_up wherever
 * generation produces one (exercise-plan.ts) — this test asserts that
 * attachment holds across an entire generated mesocycle, not just the base
 * plan's first pass, and specifically survives variation rotation (a block-
 * boundary or weekly accessory swap changes Exercise.name — carryRampUp is
 * what keeps ramp_up in sync with it, or drops it if the new exercise
 * doesn't qualify).
 */
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { EXERCISE_DATABASE } from '../src/lib/exercise-db'
import { isExternallyLoaded } from '../src/lib/load-prescription'
import { seededRngFromKey } from '../src/lib/seeded-random'
import type { UserProfile, WorkoutDay } from '../src/lib/types'

let failures = 0
function check(label: string, condition: boolean, extra?: unknown) {
  if (condition) {
    console.log(`  ok: ${label}`)
  } else {
    failures++
    console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`)
  }
}

function findEntry(name: string) {
  return EXERCISE_DATABASE.find(e => e.name === name)
}

/**
 * The actual regression assertion: every externally-loaded tier1_compound
 * in this day must carry a ramp_up on the SAME Exercise object, matching
 * its own name — "present somewhere in warmup.ramp_ups" is not enough, this
 * is exactly the field the exercise row renders from (ExercisePlan.tsx's
 * formatRampSets).
 */
function assertDayRampsAttached(day: WorkoutDay, label: string) {
  for (const ex of day.exercises) {
    const entry = findEntry(ex.name)
    if (!entry || entry.mechanics_tier !== 'tier1_compound' || !isExternallyLoaded(entry)) continue
    check(
      `${label} / ${day.day}: "${ex.name}" (tier1_compound, externally loaded) has ramp_up attached to its own Exercise object`,
      !!ex.ramp_up && ex.ramp_up.exercise === ex.name && ex.ramp_up.sets.length > 0,
      { ramp_up: ex.ramp_up },
    )
  }
}

async function main() {
  console.log('[1] Reproduce the exact reported scenario: advanced, full_gym, push/press day')
  // Seeded (not Math.random) so this is deterministic across runs — same
  // pattern run-quality-score.ts/run-llm-review.ts use for reproducible
  // audit/scoring runs (see seeded-random.ts's doc comment).
  setRandomSource(seededRngFromKey('ramp-visibility-advanced-full_gym'))

  const trainingDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => ({
    day,
    available: ['Monday', 'Tuesday', 'Thursday', 'Friday'].includes(day),
  }))
  const profile: UserProfile = {
    age: 32, gender: 'male', height_cm: 178, weight_kg: 90,
    activity_level: 'moderate', fitness_goal: 'hypertrophy', preferred_time: 'morning',
    training_days: trainingDays, session_duration_preference: '45-60', workout_split_preference: 'ppl',
    macro_calculation_mode: 'STANDARD_STATIC', equipment_access: 'full_gym', training_style: 'hybrid',
    training_experience: 'advanced', coaching_persona: 'supportive', injuries: [],
    recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
    known_bench_kg: 90, known_squat_kg: 100, known_deadlift_kg: 120, skip_calibration_week: true,
  }

  const mesocycle = generateMesocycle(profile)
  resetRandomSource()
  check('mesocycle generated at least one week', mesocycle.length > 0)

  // Not asserting a specific exercise NAME exists (generation legitimately
  // varies which barbell press/squat/hinge variant it picks) — the real
  // regression is about ramp attachment, not exercise selection. Any
  // tier1_compound, externally-loaded exercise in week 1 reproduces the
  // reported bug shape (a heavy compound with a prescribed working weight).
  const week1 = mesocycle[0]
  const mainLiftDay = week1?.days.find(d =>
    d.exercises.some(e => {
      const entry = findEntry(e.name)
      return entry?.mechanics_tier === 'tier1_compound' && isExternallyLoaded(entry) && e.suggested_load_kg != null
    })
  )
  check('week 1 contains a day with an externally-loaded tier1_compound main lift', !!mainLiftDay)

  if (mainLiftDay) {
    const mainLift = mainLiftDay.exercises.find(e => {
      const entry = findEntry(e.name)
      return entry?.mechanics_tier === 'tier1_compound' && isExternallyLoaded(entry) && e.suggested_load_kg != null
    })!
    check(`"${mainLift.name}" has a working weight prescribed`, mainLift.suggested_load_kg != null, mainLift.suggested_load_kg)
    check(
      `"${mainLift.name}" has ramp_up attached, matching its own name, with build-up sets`,
      !!mainLift.ramp_up && mainLift.ramp_up.exercise === mainLift.name && mainLift.ramp_up.sets.length > 0,
      mainLift.ramp_up,
    )
  }

  console.log('\n[2] Every tier1_compound externally-loaded exercise, every week — not just week 1')
  for (const week of mesocycle) {
    for (const day of week.days) {
      assertDayRampsAttached(day, `Week ${week.week_number}`)
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) FAILED.`)
    process.exit(1)
  }
  console.log('\nAll ramp-up-visibility checks passed.')
}

main().catch(err => {
  console.error('Test harness crashed:', err)
  process.exit(1)
})

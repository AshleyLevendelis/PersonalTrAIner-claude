import { generateMesocycle } from '../src/lib/exercise-plan'
import { toRow, fromRow } from '../src/lib/mesocycle-shape'
import type { UserProfile } from '../src/lib/types'

// Round-trip fidelity check for the mesocycle_weeks persistence path (Part 0).
// No live Supabase needed: `JSON.parse(JSON.stringify(...))` reproduces
// exactly what happens to a JS object crossing the wire into/out of a
// Postgres jsonb column, so composing it with toRow/fromRow exercises the
// same shape transformation saveMesocycle/restoreMesocycle perform without
// requiring database credentials.

const profile: UserProfile = {
  age: 30,
  gender: 'male',
  height_cm: 180,
  weight_kg: 85,
  activity_level: 'moderate',
  fitness_goal: 'hypertrophy',
  training_days: [
    { day: 'Monday', available: true },
    { day: 'Tuesday', available: true },
    { day: 'Wednesday', available: true },
    { day: 'Thursday', available: true },
    { day: 'Friday', available: false },
    { day: 'Saturday', available: false },
    { day: 'Sunday', available: false },
  ],
  preferred_time: 'evening',
  dietary_preferences: [],
  session_duration_preference: '60-90',
  training_time_preference: 'evening',
  workout_split_preference: 'upper_lower',
  macro_calculation_mode: 'STANDARD_STATIC',
  equipment_access: 'full_gym',
  training_style: 'bodybuilding',
  training_experience: 'intermediate',
  coaching_persona: 'analytical',
  injuries: [],
}

const original = generateMesocycle(profile)

const roundTripped = original.map(week => fromRow(
  JSON.parse(JSON.stringify(toRow('test-profile-id', week)))
))

let failures = 0

function check(label: string, condition: boolean) {
  if (!condition) {
    failures++
    console.error(`  FAIL: ${label}`)
  }
}

check('week counts match', roundTripped.length === original.length)

for (let i = 0; i < original.length; i++) {
  const before = original[i]
  const after = roundTripped[i]
  const label = `week ${before.week_number}`

  check(`${label}: phase_label`, after.phase_label === before.phase_label)
  check(`${label}: phase_focus`, after.phase_focus === before.phase_focus)
  check(`${label}: coach_note`, after.coach_note === before.coach_note)
  check(`${label}: block_number`, after.block_number === before.block_number)
  check(`${label}: week_in_block`, after.week_in_block === before.week_in_block)
  check(`${label}: is_deload`, (after.is_deload ?? false) === (before.is_deload ?? false))
  check(`${label}: isCalibrationWeek`, (after.isCalibrationWeek ?? false) === (before.isCalibrationWeek ?? false))
  check(`${label}: days deep-equal (loads/warmup/etc.)`, JSON.stringify(after.days) === JSON.stringify(before.days))
}

// Specifically exercise "week 5 renders identically" per Part 0's ask —
// week 5 is the first week of block 2, so it's also proof the fix covers
// more than just week 1.
const week5Before = original.find(w => w.week_number === 5)
const week5After = roundTripped.find(w => w.week_number === 5)
if (week5Before && week5After) {
  console.log(`\nWeek 5 sample (${week5Before.phase_label}, calibration=${week5Before.isCalibrationWeek}):`)
  const ex = week5Before.days[0]?.exercises[0]
  const exAfter = week5After.days[0]?.exercises[0]
  console.log(`  before: ${ex?.name} -> ${ex?.suggested_load_kg}kg (${ex?.intensity})`)
  console.log(`  after:  ${exAfter?.name} -> ${exAfter?.suggested_load_kg}kg (${exAfter?.intensity})`)
  check('week 5 exists after round-trip', !!week5After)
} else {
  failures++
  console.error('  FAIL: week 5 missing from generated mesocycle (need a 2+ block goal/experience combo)')
}

if (failures > 0) {
  console.error(`\n${failures} round-trip fidelity check(s) failed.`)
  process.exit(1)
}
console.log(`\nAll round-trip fidelity checks passed across ${original.length} weeks.`)

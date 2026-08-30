// ---------------------------------------------------------------------------
// Gate: when the weight stops moving, the app stops claiming it is moving.
//
// Audit §6.5, and Ashley's ruling of 30 Aug 2026 on what to do about it:
// ASK FOR ONE REAL SET. Chosen over climbing reps instead, and over saying
// nothing.
//
// WHAT WAS WRONG. For a lift the trainee has never logged, the app has no
// verified number — only an estimate from strength standards for their body.
// Each week it steps toward that estimate and then holds AT it, because there
// is nothing left to move toward (load-prescription.ts's Math.min). The
// weight is correct: going higher would mean inventing strength nobody has
// evidence for, which is the one thing this codebase consistently refuses.
//
// But the sentence shipped alongside it kept saying "this week goes up by one
// small step from last time" — week after week, while the number sat still.
// The app was describing a progression it had stopped making. That is a copy
// defect, not an arithmetic one, and it is why a user reads week 9 and week
// 10, sees the same prescription twice, and is given no reason and no way out.
//
// SO THE PROPERTY THIS HOLDS STILL IS NARROW AND EXACT: the number is
// untouched, and the explanation is true. Section 3 proves the first half by
// running both branches and comparing loads, because a copy fix that quietly
// moved a prescribed weight would be a far worse bug than the one it fixed.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { prescribeLoad, unverifiedRampStepKg } from '../src/lib/load-prescription'
import { getExerciseEntry } from '../src/lib/exercise-db'
import type { UserProfile } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

const profile: UserProfile = {
  age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
  fitness_goal: 'hypertrophy', preferred_time: 'morning',
  training_experience: 'intermediate', dietary_preferences: [], injuries: [],
} as unknown as UserProfile

const ARRIVED = /as far as the estimate goes/
const STEPPING = /goes up by one small step/

const entry = getExerciseEntry('Barbell Bench Press')
if (!entry) { console.error('Barbell Bench Press missing from the exercise database.'); process.exit(1) }

/** The unclamped estimate — what the ramp is climbing toward. */
const ceiling = prescribeLoad(entry, profile, { repRangeLabel: '8-10' }).starting_weight_kg
if (ceiling == null) { console.error('No load prescribed for a barbell lift.'); process.exit(1) }
const step = unverifiedRampStepKg(entry)

console.log('\n1. While the ramp is still climbing, nothing changes')
{
  // Far enough below the estimate that a step cannot reach it.
  const climbing = prescribeLoad(entry, profile, {
    repRangeLabel: '8-10',
    unverifiedPreviousLoadingWeekKg: ceiling - step * 4,
  })
  check('it still says the weight steps up', STEPPING.test(climbing.basis), climbing.basis)
  check('...and does not claim to have arrived', !ARRIVED.test(climbing.basis))
  check('...and the weight really did step up', (climbing.starting_weight_kg ?? 0) > ceiling - step * 4,
    { from: ceiling - step * 4, to: climbing.starting_weight_kg })
}

console.log('\n2. Once it arrives, it says so — and asks for the one thing that helps')
{
  // Sitting AT the estimate: a step would overshoot, so the min holds it.
  const arrived = prescribeLoad(entry, profile, {
    repRangeLabel: '8-10',
    unverifiedPreviousLoadingWeekKg: ceiling,
  })
  check('the weight is held at the estimate', arrived.starting_weight_kg === ceiling,
    { held: arrived.starting_weight_kg, ceiling })
  check('it no longer claims a step it is not making', !STEPPING.test(arrived.basis), arrived.basis)
  check('...it says the estimate has run out', ARRIVED.test(arrived.basis), arrived.basis)

  // Ashley's ruling was specifically to ASK. A sentence that explains the
  // hold without naming the way out is option C, which she did not choose.
  check('...and asks for a logged set, which is the ruling', /\bLog a set\b/i.test(arrived.basis), arrived.basis)
  check('...saying what changes if they do', /start moving again|can start moving/i.test(arrived.basis), arrived.basis)
  // It must not promise the app will simply add weight on its own — it will
  // not, and that is deliberate (see load-suggestions.ts: a wrong bump means
  // someone attempts a load they have not earned).
  check('...without promising a bump nobody has earned',
    !/we.{0,10}(will|'ll) (add|increase)/i.test(arrived.basis), arrived.basis)

  // One step past the ceiling is the same situation, not a new one.
  const past = prescribeLoad(entry, profile, {
    repRangeLabel: '8-10',
    unverifiedPreviousLoadingWeekKg: ceiling + step * 2,
  })
  check('a previous week already above the estimate is treated the same',
    ARRIVED.test(past.basis) && past.starting_weight_kg === ceiling,
    { basis: past.basis, load: past.starting_weight_kg })
}

console.log('\n3. A trainee with a real number is untouched by any of this')
{
  // A reported working weight is verified data. It never enters the ramp, so
  // it must never see either sentence.
  const known = prescribeLoad(entry, profile, {
    repRangeLabel: '8-10',
    knownWorkingWeights: { bench: 100 },
    unverifiedPreviousLoadingWeekKg: ceiling,
  })
  check('a known working weight is not described as an estimate that ran out',
    !ARRIVED.test(known.basis) && !STEPPING.test(known.basis), known.basis)
  check('...and is anchored to their number, not the standards guess',
    known.load_source === 'known_weight', known.load_source)
}

console.log('\n4. The change was to the words, and only the words')
{
  // Same inputs across the whole ramp, comparing the NUMBER at every point.
  // A copy fix that moved a prescribed weight would be worse than the defect.
  const moved: unknown[] = []
  for (let back = 0; back <= 8; back++) {
    const previous = ceiling - step * back
    const p = prescribeLoad(entry, profile, { repRangeLabel: '8-10', unverifiedPreviousLoadingWeekKg: previous })
    const expected = Math.min(previous + step, ceiling)
    // roundToPlate means the two can differ by less than one plate increment.
    if (Math.abs((p.starting_weight_kg ?? 0) - expected) > 2.5) {
      moved.push({ previous, got: p.starting_weight_kg, expected })
    }
  }
  check('every point on the ramp still lands where the arithmetic says', moved.length === 0, moved)

  // And the ceiling itself did not move, which is the number everything else
  // is measured against.
  const fresh = prescribeLoad(entry, profile, { repRangeLabel: '8-10' })
  check('the estimate a fresh prescription lands on is unchanged',
    fresh.starting_weight_kg === ceiling, { fresh: fresh.starting_weight_kg, ceiling })
}

console.log('\n5. The two sentences cannot collapse back into one')
{
  const src = readFileSync(join(ROOT, 'src/lib/load-prescription.ts'), 'utf8')
  // Both branches must exist. A refactor that deleted the arrived branch
  // would put the untrue sentence back for everybody and break nothing else.
  check('the source carries both sentences', ARRIVED.test(src) && STEPPING.test(src))
  check('the arrival is decided where both sides of the comparison are in scope',
    /rampArrived = stepped >= estimate/.test(src))
  check('...and the min is still what sets the weight',
    /estimate = Math\.min\(stepped, estimate\)/.test(src))
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nAll ramp-arrival checks passed.')

/**
 * Step 5 gate — block-consistency.ts pure attendance + volume-hold logic.
 *
 * Exercises Ashley's own corrections directly: this only ever HOLDS volume
 * (never cuts below what it already was), the attendance bar is exactly
 * two-thirds (below triggers, exactly two-thirds does not), and matching is
 * positional (day + slot index), never by exercise name, since exercise
 * identity rotates between blocks by design.
 */
import { didBlockMissAttendance, countScheduledDays, holdVolumeAtPrevious } from '../src/lib/block-consistency'
import type { WorkoutDay, Exercise } from '../src/lib/types'

let failures = 0
function check(label: string, condition: boolean, extra?: unknown) {
  if (condition) {
    console.log(`  ok: ${label}`)
  } else {
    failures++
    console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`)
  }
}

function ex(overrides: Partial<Exercise>): Exercise {
  return { name: 'Placeholder', sets: 3, reps: '8-10', rest: '90s', substitution: '', ...overrides }
}
function day(dayName: string, exercises: Exercise[]): WorkoutDay {
  return { day: dayName, focus: 'Test', exercises }
}

function main() {
  console.log('[1] didBlockMissAttendance — the exact two-thirds boundary')
  check('2 of 3 attended (exactly two-thirds) — does NOT trigger', !didBlockMissAttendance(3, 2))
  check('4 of 6 attended (exactly two-thirds) — does NOT trigger', !didBlockMissAttendance(6, 4))
  check('3 of 6 attended (half) — DOES trigger', didBlockMissAttendance(6, 3))
  check('1 of 3 attended — DOES trigger', didBlockMissAttendance(3, 1))
  check('full attendance never triggers', !didBlockMissAttendance(8, 8))
  check('zero attendance on a real schedule triggers', didBlockMissAttendance(8, 0))
  check('a block with nothing scheduled never triggers (no divide-by-zero)', !didBlockMissAttendance(0, 0))

  console.log('[2] countScheduledDays — pure date-range + weekday counting')
  const mwf = new Set(['Monday', 'Wednesday', 'Friday'])
  // 2026-01-01 is a Thursday; a 28-day block (4 weeks) should contain exactly 4 of each weekday.
  const count = countScheduledDays('2026-01-01', '2026-01-29', mwf)
  check('4-week block with a 3-day/week split has exactly 12 scheduled days', count === 12, count)
  const zeroRange = countScheduledDays('2026-01-01', '2026-01-01', mwf)
  check('an empty range counts zero', zeroRange === 0, zeroRange)
  const everyDay = countScheduledDays('2026-01-01', '2026-01-08', new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']))
  check('a full 7-day range with every weekday scheduled counts 7', everyDay === 7, everyDay)

  console.log('[3] holdVolumeAtPrevious — only ever caps an increase, never forces one')
  const previous: WorkoutDay[] = [
    day('Monday', [ex({ name: 'Barbell Bench Press', sets: 3 }), ex({ name: 'Incline DB Press', sets: 3 })]),
  ]
  const newHigher: WorkoutDay[] = [
    day('Monday', [ex({ name: 'Barbell Bench Press', sets: 4 }), ex({ name: 'Incline DB Press', sets: 3 })]),
  ]
  const held = holdVolumeAtPrevious(newHigher, previous)
  check('a slot that would increase (3 -> 4) is capped back to 3', held[0].exercises[0].sets === 3, held)
  check('a slot that was already equal (3 -> 3) is untouched', held[0].exercises[1].sets === 3, held)

  const newLower: WorkoutDay[] = [
    day('Monday', [ex({ name: 'Barbell Bench Press', sets: 2 })]),
  ]
  const heldLower = holdVolumeAtPrevious(newLower, [day('Monday', [ex({ name: 'Barbell Bench Press', sets: 3 })])])
  check('a slot that would already be LOWER (3 -> 2) is left alone, never forced back up', heldLower[0].exercises[0].sets === 2, heldLower)

  console.log('[4] holdVolumeAtPrevious — matches by day + slot position, never by exercise name')
  const previousRotated: WorkoutDay[] = [day('Monday', [ex({ name: 'Trap Bar Deadlift', sets: 3 })])]
  const newRotated: WorkoutDay[] = [day('Monday', [ex({ name: 'Barbell Deadlift', sets: 5 })])]
  const heldRotated = holdVolumeAtPrevious(newRotated, previousRotated)
  check('a rotated exercise in the SAME slot is still held (position match, not name match)', heldRotated[0].exercises[0].sets === 3, heldRotated)

  console.log('[5] holdVolumeAtPrevious — mismatched days/slots handled without crashing')
  const newWithExtraDay: WorkoutDay[] = [
    day('Monday', [ex({ name: 'A', sets: 5 })]),
    day('Tuesday', [ex({ name: 'B', sets: 5 })]), // no Tuesday in the previous block at all
  ]
  const previousMondayOnly: WorkoutDay[] = [day('Monday', [ex({ name: 'A', sets: 3 })])]
  const heldPartial = holdVolumeAtPrevious(newWithExtraDay, previousMondayOnly)
  check('the matched day (Monday) is still held', heldPartial[0].exercises[0].sets === 3, heldPartial)
  check('a day with no previous-block counterpart (Tuesday) is left completely alone', heldPartial[1].exercises[0].sets === 5, heldPartial)

  const newWithExtraSlot: WorkoutDay[] = [day('Monday', [ex({ name: 'A', sets: 5 }), ex({ name: 'B (unplanned add)', sets: 4 })])]
  const previousOneSlot: WorkoutDay[] = [day('Monday', [ex({ name: 'A', sets: 3 })])]
  const heldExtraSlot = holdVolumeAtPrevious(newWithExtraSlot, previousOneSlot)
  check('slot 0 (has a counterpart) is held', heldExtraSlot[0].exercises[0].sets === 3, heldExtraSlot)
  check('slot 1 (no counterpart in the shorter previous day) is left alone', heldExtraSlot[0].exercises[1].sets === 4, heldExtraSlot)

  console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} failure(s)`)
  process.exit(failures === 0 ? 0 : 1)
}

main()

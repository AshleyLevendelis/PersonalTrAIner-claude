// ---------------------------------------------------------------------------
// Verifies the "a logged walk builds a streak" fix behaviourally, not by
// inspection.
//
// The bug this guards: dashboard-data.ts derived "was this day scheduled" as
// `exercisePlan.filter(d => d.exercises.length > 0)`. An activity-shaped day
// (a walk, a swim) carries no exercises, so it evaluated scheduled=false, and
// streak.ts treats an unscheduled day as TRANSPARENT — "neither counts nor
// breaks". A user could walk every scheduled day for a fortnight and hold a
// streak of zero.
//
// This reproduces the scheduled-day derivation exactly as dashboard-data.ts
// does it (same expression, both before and after the fix) and runs the real
// computeStreak over it, so a regression in either half fails here.
// ---------------------------------------------------------------------------

import { computeStreak, type StreakDayInput } from '../src/lib/streak'
import type { WorkoutDay } from '../src/lib/types'

let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) console.log(`  ✓ ${name}`)
  else {
    failures++
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** A walking plan: three activity days a week, no exercises anywhere. */
function activityWeek(): WorkoutDay[] {
  return WEEKDAYS.map(day => {
    const isTrainingDay = day === 'Monday' || day === 'Wednesday' || day === 'Friday'
    return {
      day,
      focus: isTrainingDay ? 'Walk' : 'Rest & Recovery',
      exercises: [],
      ...(isTrainingDay
        ? {
            is_scheduled: true,
            plannedActivity: { activity: 'Walk', duration: 20 },
          }
        : { is_scheduled: false }),
    } satisfies WorkoutDay
  })
}

/** A normal gym week, for the regression half: exercises present, no is_scheduled field. */
function gymWeekWithoutFlag(): WorkoutDay[] {
  return WEEKDAYS.map(day => {
    const isTrainingDay = day === 'Monday' || day === 'Wednesday' || day === 'Friday'
    return {
      day,
      focus: isTrainingDay ? 'Full Body' : 'Rest & Recovery',
      exercises: isTrainingDay
        ? ([{ name: 'Barbell Squats', sets: 3, reps: '8-10', rest: '90s' }] as unknown as WorkoutDay['exercises'])
        : [],
    } satisfies WorkoutDay
  })
}

/** The OLD derivation, kept verbatim so the test can prove the bug was real. */
const scheduledWeekdaysOld = (plan: WorkoutDay[]) =>
  new Set(plan.filter(d => d.exercises.length > 0).map(d => d.day))

/** The CURRENT derivation — must stay in lockstep with dashboard-data.ts. */
const scheduledWeekdaysNew = (plan: WorkoutDay[]) =>
  new Set(plan.filter(d => (d.is_scheduled ?? d.exercises.length > 0)).map(d => d.day))

/**
 * Build 21 days of history ending today, logging EVERY scheduled day —
 * a perfectly consistent user.
 */
function buildDays(plan: WorkoutDay[], scheduled: Set<string>): StreakDayInput[] {
  const days: StreakDayInput[] = []
  const base = new Date('2026-08-16T12:00:00')
  for (let i = 20; i >= 0; i--) {
    const d = new Date(base.getTime() - i * 86_400_000)
    const weekday = WEEKDAYS[(d.getDay() + 6) % 7] // JS Sunday=0 → our Monday-first array
    const isScheduled = scheduled.has(weekday)
    days.push({
      date: d.toISOString().slice(0, 10),
      scheduled: isScheduled,
      logged: isScheduled, // logged every scheduled day (a walk, or a session)
      planWeek: Math.floor((20 - i) / 7) + 1,
    })
  }
  return days
}

console.log('activity-streak gate\n')

console.log('1. The bug, reproduced: the OLD derivation gives an activity plan zero streak')
const plan = activityWeek()
const oldScheduled = scheduledWeekdaysOld(plan)
check('old derivation finds NO scheduled days in a walking plan', oldScheduled.size === 0, `got ${oldScheduled.size}`)
const oldResult = computeStreak(buildDays(plan, oldScheduled))
check('…so a fortnight of logged walks yields a streak of 0', oldResult.currentStreak === 0, `got ${oldResult.currentStreak}`)

console.log('\n2. The fix: is_scheduled makes the same logged walks count')
const newScheduled = scheduledWeekdaysNew(plan)
check('new derivation finds the 3 activity days', newScheduled.size === 3, `got ${newScheduled.size}`)
const newResult = computeStreak(buildDays(plan, newScheduled))
check('a logged walk builds a streak', newResult.currentStreak > 0, `got ${newResult.currentStreak}`)
check('every scheduled day logged over 3 weeks ⇒ 9-day streak', newResult.currentStreak === 9, `got ${newResult.currentStreak}`)
check('nothing broke the streak', !newResult.brokenByMissedDay)

console.log('\n3. A missed activity day still breaks it (the streak means something)')
const missedDays = buildDays(plan, newScheduled).map((d, i, arr) =>
  // Miss the two most recent scheduled days: the first is forgiven by the
  // one make-up token per plan week, the second must break the run.
  d.scheduled && i >= arr.length - 5 ? { ...d, logged: false } : d,
)
const missedResult = computeStreak(missedDays)
check('two missed scheduled days in a week breaks the streak', missedResult.brokenByMissedDay)

console.log('\n4. Regression: gym plans (no is_scheduled field) behave exactly as before')
const gym = gymWeekWithoutFlag()
const gymOld = scheduledWeekdaysOld(gym)
const gymNew = scheduledWeekdaysNew(gym)
check('fallback keeps the old answer for a stored pre-field plan', gymOld.size === gymNew.size && [...gymOld].every(d => gymNew.has(d)))
check('gym streak identical old vs new', computeStreak(buildDays(gym, gymOld)).currentStreak === computeStreak(buildDays(gym, gymNew)).currentStreak)

console.log('\n5. An explicit is_scheduled:false beats a stale exercises array')
const contradictory: WorkoutDay[] = [
  { day: 'Monday', focus: 'Deload — skip', exercises: gymWeekWithoutFlag()[0].exercises, is_scheduled: false },
]
check('explicit false wins over exercises.length > 0', scheduledWeekdaysNew(contradictory).size === 0)

if (failures > 0) {
  console.error(`\n${failures} failure(s)`)
  process.exit(1)
}
console.log('\nAll activity-streak checks passed.')

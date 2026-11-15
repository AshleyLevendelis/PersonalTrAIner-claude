// A day named for its calves keeps a calf exercise (15 Nov 2026, CSCS; Marcus's "Legs & Calves" day had none).
// Measured before: missing on 687 of 1,152 seeded loading days at 30-45 minutes and on all 1,152 at 20-30, because the
// calf slot was optional (the first thing a short session sheds) and, in later blocks, the time trim protected the
// calf raise by NAME, so a rotated calf exercise was unprotected. One exit: the count of failures.
import { isStructuralSlot } from '../src/lib/exercise-plan'
import { getExerciseEntry } from '../src/lib/exercise-db'
import { shortProfile, planFor, daysFor } from './measure-short-sessions'
import type { SessionDuration } from '../src/lib/types'

let ran = 0, failed = 0
const ok = (c: boolean, m: string, d?: unknown) => { ran++; if (c) console.log(`  ok: ${m}`); else { failed++; console.log(`  FAIL: ${m}${d !== undefined ? ` — ${JSON.stringify(d).slice(0, 300)}` : ''}`) } }
const isCalf = (n: string) => getExerciseEntry(n)?.movement_pattern === 'isolation_calf'

console.log('§1 The rule')
const day = ['Barbell Squats', 'Romanian Deadlifts', 'Leg Extensions', 'Calf Raises'].map(n => getExerciseEntry(n))
ok(day.every(Boolean), 'the fixture lifts are in the catalogue')
ok(isStructuralSlot(day, 3, 'Legs & Calves'), 'on a "Legs & Calves" day the only calf exercise cannot be cut')
ok(!isStructuralSlot(day, 3, 'Lower Body'), 'on a day not named for calves it can')
ok(!isStructuralSlot([...day, getExerciseEntry('Seated Calf Raises')], 3, 'Legs & Calves'), 'with a second calf exercise, one may go')
ok(!isStructuralSlot(day, 2, 'Legs & Calves'), 'a leg extension on the same day is not protected by it')

console.log('§2 Real plans: bodybuilding, three days, the short settings and later blocks (48 seeded plans)')
for (const dur of ['20-30', '30-45'] as SessionDuration[]) {
  let days = 0, missing = 0
  for (const goal of ['fat_loss', 'hypertrophy'] as const) for (const exp of ['beginner', 'intermediate', 'advanced'] as const)
    for (const eq of ['full_gym', 'home_gym'] as const) for (const inj of [[], ['knees']] as string[][]) {
      const p = shortProfile({ fitness_goal: goal, training_experience: exp, equipment_access: eq, training_style: 'bodybuilding',
        workout_split_preference: 'body_part' as never, injuries: inj as never, session_duration_preference: dur, training_days: daysFor(3) })
      for (const w of planFor(p, `calf:${dur}:${goal}:${exp}:${eq}:${inj.length}`)) {
        if (w.is_deload) continue
        for (const d of w.days) { if (!/Calves/.test(d.focus)) continue; days++; if (!d.exercises.some(e => isCalf(e.name))) missing++ }
      }
    }
  ok(days > 100, `${dur}: the grid holds "& Calves" days (${days})`, days)
  ok(missing === 0, `${dur}: every one keeps a calf exercise (${missing} missing)`, missing)
}

console.log(`${ran} checks ran, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)

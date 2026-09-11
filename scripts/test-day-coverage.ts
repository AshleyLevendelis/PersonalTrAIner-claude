// ---------------------------------------------------------------------------
// Gate: a day that loses a muscle its own plan asked for.
//
// WHY IT EXISTS. Gemini was asked to rate a generated Push & Press session,
// 11 Sep 2026, and said it had no direct tricep work. Re-measured, that does
// not reproduce — 132 of 132 generated push days carried direct tricep work.
// But Ashley's session really did look that way, and the app had no way to
// notice: quality-score.ts checks coverage at WEEK level (push/pull/squat/
// hinge somewhere in the seven days) and its only per-day rule asserts that a
// Push & Press day contains a vertical push. Nothing asked whether the day got
// the isolation its own track named.
//
// WHY IT MEASURES RATHER THAN DEDUCTS. Written first as a scored rule, then
// measured before being wired in: it fires on 23.5% of days, and its dominant
// case is the MIRROR of the reported one — push days keeping tricep and core
// while losing the lateral raise. A deduction on a quarter of all days would
// move every score and encode a coaching opinion nobody has ruled on. So the
// rate is pinned instead: today's behaviour is described, and a real
// regression — the selector starting to drop named isolation far more often —
// turns this red.
//
// THE BAND IS A BASELINE, NOT A TARGET. If a deliberate change moves it, move
// the band and say so here, the way the bundle budgets record their moves.
// ---------------------------------------------------------------------------
import { generateMesocycle, TRACKS } from '../src/lib/exercise-plan'
import { daysMissingNamedIsolation } from '../src/lib/quality-score'
import { getExerciseEntry } from '../src/lib/exercise-db'
import type { UserProfile, MesocycleWeek, WorkoutDay } from '../src/lib/types'

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}

// A hand-built week, so each property is exercised on a day whose shape is
// chosen rather than hoped for.
const ex = (name: string) => ({ name, sets: 3, reps: '10', rest: '60s', substitution: '' })
const dayOf = (focus: string, names: string[]): WorkoutDay =>
  ({ day: 'Monday', focus, exercises: names.map(ex) } as unknown as WorkoutDay)
const weekOf = (day: WorkoutDay): MesocycleWeek[] =>
  ([{ week_number: 1, block_number: 1, week_in_block: 1, days: [day] }] as unknown as MesocycleWeek[])

console.log('\n1. The Push & Press track names three isolation slots')
const pushSlots = (TRACKS as Record<string, { slots: { tier: string; patterns: string[] }[] }>)['Push & Press']
  .slots.filter(s => s.tier === 'tier3_isolation').flatMap(s => s.patterns)
check('it asks for tricep, shoulder and core, in that order',
  JSON.stringify(pushSlots) === JSON.stringify(['isolation_tricep', 'isolation_shoulder', 'core']), pushSlots)

console.log('\n2. The reported session — kept the lateral raise, lost the triceps')
{
  // Exactly what Ashley photographed.
  const hit = daysMissingNamedIsolation(weekOf(dayOf('Push & Press',
    ['Arm Circles', 'Barbell Bench Press', 'Dumbbell Shoulder Press', 'Lateral Raises'])))
  check('it is reported', hit.length === 1, hit)
  check('...naming what was lost', hit[0]?.lost.includes('isolation_tricep'), hit[0])
  check('...and what survived in its place', hit[0]?.kept.includes('isolation_shoulder'), hit[0])
}

console.log('\n3. A short day with NO isolation at all is the time cap, not a failure')
{
  const none = daysMissingNamedIsolation(weekOf(dayOf('Push & Press',
    ['Arm Circles', 'Barbell Bench Press', 'Dumbbell Shoulder Press'])))
  check('it is NOT reported — or every 30-minute day becomes wallpaper', none.length === 0, none)
}

console.log('\n4. A day that got everything its track asked for is silent')
{
  const full = daysMissingNamedIsolation(weekOf(dayOf('Push & Press',
    ['Arm Circles', 'Barbell Bench Press', 'Dumbbell Shoulder Press', 'Lateral Raises', 'Tricep Pushdowns', 'Plank'])))
  check('nothing reported', full.length === 0, full)
}

console.log('\n5. It reads the CATALOGUE pattern, not the plan\'s coarse one')
{
  // THE MISTAKE THIS PINS. Exercise.movement_pattern holds 'push' / 'pull' /
  // 'hinge' — never 'isolation_tricep'. A version reading it would find
  // nothing present on every day, report every day as missing everything, and
  // §3 and §4 above would both break. Asserted by giving the plan object the
  // coarse value and checking the answer still comes from the catalogue.
  const day = dayOf('Push & Press', ['Barbell Bench Press', 'Dumbbell Shoulder Press', 'Lateral Raises', 'Tricep Pushdowns', 'Plank'])
  for (const e of day.exercises) (e as unknown as { movement_pattern: string }).movement_pattern = 'push'
  check('a day whose plan rows all say "push" is still read correctly',
    daysMissingNamedIsolation(weekOf(day)).length === 0)
  check('...and the catalogue really does disagree with the plan row',
    getExerciseEntry('Lateral Raises')?.movement_pattern === 'isolation_shoulder')
}

console.log('\n6. The measured rate, across a real grid')
{
  const base = {
    age: 30, gender: 'male', height_cm: 178, activity_level: 'moderate', preferred_time: 'morning',
    bmr: 1800, tdee: 2500, weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
    exercise_exclusions: [], macro_calculation_mode: 'STANDARD_STATIC', coaching_persona: 'supportive',
    recovery_capacity: 'moderate', conditioning_preference: 'tolerate', weight_kg: 80, training_style: 'hybrid',
    training_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
      .map(d => ({ day: d, available: !['Wednesday', 'Saturday'].includes(d) })),
  }
  const quiet = console.log
  let days = 0, hits = 0, inversions = 0
  const lost = new Map<string, number>()
  console.log = () => {}
  for (const workout_split_preference of ['ppl', 'upper_lower', 'bro_split']) {
    for (const equipment_access of ['full_gym', 'home_gym', 'minimal']) {
      for (const training_experience of ['novice', 'intermediate', 'advanced']) {
        for (const session_duration_preference of ['30', '45', '60', '90']) {
          const profile = { ...base, workout_split_preference, equipment_access, training_experience, session_duration_preference, fitness_goal: 'build_muscle' } as unknown as UserProfile
          let meso: MesocycleWeek[]
          try { meso = generateMesocycle(profile) } catch { continue }
          const wk = meso.find(w => w.week_number === 1)
          for (const d of wk?.days ?? []) {
            const t = d.focus ? (TRACKS as Record<string, { slots: { tier: string }[] }>)[d.focus] : undefined
            if (t?.slots.some(s => s.tier === 'tier3_isolation')) days++
          }
          for (const h of daysMissingNamedIsolation(meso)) {
            hits++; if (h.inversion) inversions++
            for (const l of h.lost) lost.set(l, (lost.get(l) ?? 0) + 1)
          }
        }
      }
    }
  }
  console.log = quiet
  const rate = days > 0 ? hits / days : 0
  console.log(`  measured: ${hits} of ${days} days (${(rate * 100).toFixed(1)}%), ${inversions} of them priority inversions`)
  console.log(`  lost: ${[...lost].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')}`)
  check('the grid produced days to measure', days > 200, days)
  // TWO NUMBERS, TWO DENOMINATORS, AND THEY ARE NOT INTERCHANGEABLE.
  //
  // The decision to measure rather than deduct was taken on a WIDE sweep —
  // 5 split preferences, 4 equipment tiers, 3 goals, with and without
  // injuries, 7,200 qualifying days — which fired on 23.5%.
  //
  // THIS gate runs a narrower, faster grid (3 splits, 3 equipment tiers, one
  // goal, no injuries, 540 days) and measures 2.8%. The first version of this
  // check pinned the wide sweep's 23.5% against the narrow grid's denominator
  // and failed on correct code — a number carried between two populations,
  // which is the mistake CLAUDE.md names: when the denominator changes, prior
  // numbers stop being comparable. Both are recorded here; neither is the
  // other's baseline.
  //
  // The band below is THIS grid's, measured 11 Sep 2026 at 2.8%. It is wide
  // because the selector shuffles — it exists to catch a regime change (the
  // selector beginning to drop named isolation as a matter of course), not to
  // police a percentage point.
  check('the rate sits in its recorded band for THIS grid (0.00 - 0.12)', rate >= 0 && rate <= 0.12, rate.toFixed(3))
  // The finding that decided this measures rather than deducts: the dominant
  // loss is the LATERAL RAISE, not the tricep work the review complained about.
  const shoulder = lost.get('isolation_shoulder') ?? 0
  const tricep = lost.get('isolation_tricep') ?? 0
  check('the side delt is still the most-dropped slot, not the triceps', shoulder > tricep, { shoulder, tricep })
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nAll day-coverage checks passed.')

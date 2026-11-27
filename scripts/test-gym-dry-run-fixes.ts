/**
 * THE THREE FIXES FROM THE GYM DRY RUN OF 28 NOV 2026 (docs/audits/gym-dry-run-2026-11-28.md; his "fix the superset,
 * swap and summary issues").
 *
 *   1. A superset goes in rounds: A1, A2, rest, A1, A2... and a member with more sets finishes alone (superset-turn.ts).
 *   2. A "Just today" swap moves no other day; a whole-block swap still evens the week out (mesocycle-edit.ts).
 *   3. A back-off set after the top set is a working set, so one short set keeps the main lift in "Next session"
 *      (progression-engine.ts, workingSetsOf).
 *
 * WHAT THIS DOES NOT PROVE: the Log button pressing the right tick on a screen (the dry-run walk drives that).
 */
import { supersetTurn, restAfterSupersetSet, type SupersetMember } from '../src/lib/superset-turn'
import { workingSetsOf } from '../src/lib/progression-engine'
import { generateExercisePlan, generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { swapExerciseInMesocycle, getReplacementCandidates } from '../src/lib/mesocycle-edit'
import type { ExerciseSetLog, MesocycleWeek, UserProfile } from '../src/lib/types'

let ran = 0, failures = 0
function check(label: string, ok: boolean, extra?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — got ${JSON.stringify(extra).slice(0, 500)}` : ''}`) }
}
const J = (x: unknown) => JSON.stringify(x)

async function main() {
  // ---------------------------------------------------------------------------
  console.log('1. A superset goes in rounds')
  // The walk's pair: A1 Suitcase Carry 2 sets, A2 Hollow Body Hold 3 sets. Play it through as the button would.
  const sets = { 10: 2, 11: 3 } as Record<number, number>
  const logged: Record<number, number> = { 10: 0, 11: 0 }
  const members = (): SupersetMember[] => [10, 11].map(i => ({ exIndex: i, sets: sets[i], logged: logged[i] }))
  const order: string[] = []
  for (let guard = 0; guard < 10; guard++) {
    const who = supersetTurn(members())
    if (who == null) break
    logged[who]++
    const rest = restAfterSupersetSet(members(), who, logged[who])
    order.push(`${who === 10 ? 'A1' : 'A2'}s${logged[who]}${rest ? '+rest' : ''}`)
  }
  check('A1, A2 (rest), A1, A2 (rest), then A2 alone with its rest: "alternate — no rest between"',
    J(order) === J(['A1s1', 'A2s1+rest', 'A1s2', 'A2s2+rest', 'A2s3+rest']), order)
  check('every member gets every set', logged[10] === 2 && logged[11] === 3, logged)
  check('nobody is up when the pair is done', supersetTurn(members()) === null)
  check('a tie goes to the earlier member (A1 opens every round)', supersetTurn([{ exIndex: 4, sets: 3, logged: 1 }, { exIndex: 5, sets: 3, logged: 1 }]) === 4)
  check('no rest after A1 while A2 still owes the round', restAfterSupersetSet([{ exIndex: 4, sets: 3, logged: 2 }, { exIndex: 5, sets: 3, logged: 1 }], 4, 2) === false)
  check('the rest comes once the round is complete', restAfterSupersetSet([{ exIndex: 4, sets: 3, logged: 2 }, { exIndex: 5, sets: 3, logged: 2 }], 5, 2) === true)
  check('a partner that is finished owes nothing', restAfterSupersetSet([{ exIndex: 4, sets: 2, logged: 2 }, { exIndex: 5, sets: 3, logged: 3 }], 5, 3) === true)

  // ---------------------------------------------------------------------------
  console.log('\n2. A back-off set is a working set')
  const row = (set_number: number, weight_kg: number, reps_completed: number) => ({ set_number, weight_kg, reps_completed, date: '2026-09-16', is_warmup: false }) as unknown as ExerciseSetLog
  const walk = [row(1, 47.5, 9), row(2, 40, 7), row(3, 37.5, 9)]
  const w = workingSetsOf(walk, { repRangeLow: 9, prescribedSets: 3 })
  check('the walk: 47.5 x 9, then 40 x 7 and 37.5 x 9 after it, are three working sets', w.length === 3, w.map(s => [s.weight_kg, s.reps_completed]))
  check('...so the short set is seen (7 below the range\'s 9), which is what makes the summary say "held"', w.some(s => s.reps_completed < 9))
  // The inference this narrows still does its old job: light rows BEFORE the top set, as logged before warm-ups had rows.
  const oldRamp = [row(1, 20, 10), row(2, 30, 5), row(3, 40, 3), row(4, 47.5, 9), row(5, 47.5, 9), row(6, 47.5, 9)]
  const o = workingSetsOf(oldRamp, { repRangeLow: 9, prescribedSets: 3 })
  check('a build-up logged before the top set is still not working (old sessions)', J(o.map(s => s.set_number)) === J([4, 5, 6]), o.map(s => [s.set_number, s.weight_kg]))
  check('a lighter set after the top in an old-style session is kept', workingSetsOf([...oldRamp, row(7, 40, 6)], { repRangeLow: 9 }).some(s => s.set_number === 7))

  // ---------------------------------------------------------------------------
  console.log('\n3. "Just today" moves no other day; "Whole block" still evens the week out')
  const days = (names: string[]) => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => ({ day, available: names.includes(day) }))
  const P = {
    id: undefined, age: 34, gender: 'male', height_cm: 180, weight_kg: 82, activity_level: 'moderate', preferred_time: 'evening',
    bmr: 1800, tdee: 2600, workout_split_preference: 'ai_recommendation', weekly_schedule: {}, dietary_preferences: [],
    concurrent_activities: [], macro_calculation_mode: 'STANDARD_STATIC', coaching_persona: 'supportive', recovery_capacity: 'moderate',
    conditioning_preference: 'tolerate', created_at: '2026-09-07T08:00:00.000Z', fitness_goal: 'hypertrophy', equipment_access: 'full_gym',
    injuries: [], training_style: 'bodybuilding', session_duration_preference: '45-60', training_experience: 'intermediate',
    training_days: days(['Monday', 'Wednesday', 'Friday', 'Saturday']),
  } as unknown as UserProfile
  const w0 = console.warn, l0 = console.log, i0 = console.info
  const hush = () => { console.warn = () => {}; console.log = () => {}; console.info = () => {} }
  const unhush = () => { console.warn = w0; console.log = l0; console.info = i0 }
  const week = 2
  // WHAT EVENING-OUT CHANGES: which exercises another day holds and how many sets each. Its weight is a different rule
  // (one lift, one weight in a week: a lift swapped in that another day already has is matched across both), named in
  // the dry-run report and not this check's subject.
  const othersOf = (m: MesocycleWeek[], day: string) => J(m.find(x => x.week_number === week)!.days.filter(d => d.day !== day).map(d => [d.day, d.exercises.map(e => [e.name, e.sets])]))
  let tried = 0, todayMoved = 0, blockMoved = 0
  const movedExamples: string[] = []
  // THE FIXTURE IS NAMED BY THE CODE, NOT PICKED: a plan where evening-out never fires proves nothing, so profiles are
  // tried until a whole-block swap changes another day (the dry run's own profile was functional, four days).
  const variants: Record<string, unknown>[] = [
    { training_style: 'functional', fitness_goal: 'functional', equipment_access: 'full_gym' },
    { training_style: 'hybrid', fitness_goal: 'fat_loss' },
    { training_style: 'bodybuilding' },
    { training_style: 'functional', fitness_goal: 'fat_loss', training_days: days(['Monday', 'Wednesday', 'Friday', 'Sunday']) },
  ]
  for (const [vi, over] of variants.entries()) {
    if (blockMoved > 0 && vi > 0) break
    const prof = { ...P, ...over } as UserProfile
    hush()
    let meso: MesocycleWeek[]
    setRandomSource(seededRngFromKey(`gym-dry-run-fixes|${vi}`))
    try { meso = generateMesocycle(prof, generateExercisePlan(prof, []).plan) } finally { resetRandomSource() }
    try {
      for (const d of meso.find(x => x.week_number === week)!.days) {
        for (let i = 0; i < d.exercises.length; i++) {
          const cands = getReplacementCandidates(d.exercises[i].name, prof, []).filter(c => c.exercise.name !== d.exercises[i].name).slice(0, 3)
          for (const c of cands) {
            tried++
            const base = { mesocycle: meso, profile: prof, currentWeekNumber: week, dayName: d.day, exIndex: i, newExercise: c.exercise }
            const today = await swapExerciseInMesocycle({ ...base, scope: 'today' })
            const block = await swapExerciseInMesocycle({ ...base, scope: 'permanent' })
            if (othersOf(today, d.day) !== othersOf(meso, d.day)) todayMoved++
            if (othersOf(block, d.day) !== othersOf(meso, d.day)) { blockMoved++; if (movedExamples.length < 3) movedExamples.push(`${d.day}: ${d.exercises[i].name} -> ${c.exercise.name}`) }
          }
        }
      }
    } finally { unhush() }
  }
  check(`swaps tried across the week (${tried})`, tried >= 20, tried)
  check('the balancing binds here: some whole-block swaps change another day (else this proves nothing)', blockMoved > 0, { blockMoved, movedExamples })
  check('NO just-today swap changes any other day of the week', todayMoved === 0, { todayMoved, of: tried })
  console.log(`    (whole-block swaps that evened out another day: ${blockMoved} of ${tried}, e.g. ${movedExamples[0] ?? 'none'})`)

  console.log(`\n${ran} checks ran`)
  if (failures > 0) { console.error(`${failures} failure(s)`); process.exit(1) }
  console.log('The superset goes in rounds, a just-today swap stays on today, and a back-off set counts.')
}
main().catch(e => { console.error(e); process.exit(1) })

// test:advanced-lifter — his "yes fix all five", 21 Nov 2026, after reading a 25-year-old advanced man's plan as a
// coach. Each section pairs the fix with a contrast showing its fixture binds. Seeded: every run is the same plan.
import { generateMesocycle, setRandomSource, getConstrainedPool } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { getExerciseEntry, EXERCISE_DATABASE, isRehabOnly } from '../src/lib/exercise-db'
import { isRegressionFor } from '../src/lib/periodization'
import { labelModeForEntry } from '../src/lib/load-prescription'
import type { UserProfile, MesocycleWeek } from '../src/lib/types'

let passed = 0
let failed = 0
const check = (name: string, ok: boolean, detail: unknown = '') => {
  if (ok) { passed++; console.log(`  ok: ${name}`) }
  else { failed++; console.log(`  FAIL: ${name} — ${JSON.stringify(detail).slice(0, 300)}`) }
}

const ALL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const him = (over: Partial<UserProfile> = {}): UserProfile => ({
  age: 25, gender: 'male', height_cm: 180, weight_kg: 85, activity_level: 'moderately_active', fitness_goal: 'hypertrophy',
  start_preference: 'train', equipment_access: 'full_gym',
  training_days: ALL.map(d => ({ day: d, available: ['Monday', 'Tuesday', 'Thursday', 'Friday'].includes(d) })),
  session_duration_preference: '60-90', training_style: 'hybrid', training_experience: 'advanced', injuries: [],
  recovery_capacity: 'moderate', workout_split_preference: 'ai_recommendation', ...over,
} as UserProfile)
const planOf = (p: UserProfile, key = 'm25adv'): MesocycleWeek[] => { setRandomSource(seededRngFromKey(key)); return generateMesocycle(p) }
const lowReps = (r: unknown) => { const m = String(r).match(/^(\d+)(?:-\d+)?$/); return m ? Number(m[1]) : null }
const his = planOf(him())

console.log('test:advanced-lifter\n')

console.log('1. Trunk work keeps 8+ reps in every block, while the main lifts drop to 3-5 in a strength block')
const coreLow = his.flatMap(w => w.days.flatMap(d => d.exercises.filter(e => getExerciseEntry(e.name)?.movement_pattern === 'core')
  .map(e => ({ w: w.week_number, n: e.name, r: lowReps(e.reps) })))).filter(x => x.r != null && x.r < 8)
check('no core exercise under 8 reps in any week', coreLow.length === 0, coreLow.slice(0, 3))
const strength = his.filter(w => /strength/i.test(w.phase_label ?? '') && !w.is_deload)
check('...in a plan whose strength block takes the bench to 3-5 (the fixture binds)', strength.length > 0
  && strength.some(w => w.days.some(d => d.exercises.some(e => e.name === 'Barbell Bench Press' && lowReps(e.reps) === 3))))
check('...and holds a tier-2 core lift a strength block would cut (hanging leg raises or a rollout)',
  strength.some(w => w.days.some(d => d.exercises.some(e => ['Hanging Leg Raises', 'Ab Wheel Rollout'].includes(e.name)))))

console.log('\n2. Pull-ups and dips carry weight in a muscle-building block, lighter than in a strength block')
const added = (phase: RegExp) => his.filter(w => phase.test(w.phase_label ?? '') && !w.is_deload)
  .flatMap(w => w.days.flatMap(d => d.exercises.filter(e => e.name === 'Pull-Ups').map(e => (e as { suggested_added_load_kg?: number }).suggested_added_load_kg ?? 0)))
const hyp = added(/hypertrophy/i), str = added(/strength/i)
check('every loading week of pull-ups in a hypertrophy block has a belt', hyp.length > 0 && hyp.every(kg => kg >= 2.5), hyp)
check('...lighter than the strength block\'s', str.length > 0 && Math.max(...hyp) < Math.min(...str), { hyp, str })
const novice = planOf(him({ training_experience: 'novice' }), 'nov')
const novAdded = novice.flatMap(w => w.days.flatMap(d => d.exercises.map(e => (e as { suggested_added_load_kg?: number }).suggested_added_load_kg ?? 0)))
check('a novice is never belted (unchanged)', novAdded.every(kg => !kg))

console.log('\n3. The odd picks for him')
check('the assisted dip machine is a regression past novice', isRegressionFor('Assisted Dip Machine', 'advanced') && !isRegressionFor('Assisted Dip Machine', 'novice'))
check('...and is not in his plan', !his.some(w => w.days.some(d => d.exercises.some(e => e.name === 'Assisted Dip Machine'))))
check('a Spanish squat is rehab for a knee, not for him', isRehabOnly(getExerciseEntry('Spanish Squat')!)
  && !getConstrainedPool(him()).some(e => e.name === 'Spanish Squat')
  && getConstrainedPool(him({ injuries: ['knees'] })).some(e => e.name === 'Spanish Squat'))
const renegadeBy = (goal: UserProfile['fitness_goal']) => {
  let n = 0
  for (const style of ['hybrid', 'functional', 'combat', 'bodybuilding'] as const) for (const exp of ['intermediate', 'advanced'] as const) for (const s of [1, 2, 3]) {
    if (planOf(him({ age: 28, fitness_goal: goal, training_style: style, training_experience: exp }), `rr${goal}${style}${exp}${s}`)
      .some(w => w.days.some(d => d.exercises.some(e => e.name === 'Renegade Row')))) n++
  }
  return n
}
const rrHyp = renegadeBy('hypertrophy'), rrFat = renegadeBy('fat_loss')
check('a renegade row never leads a muscle-gain plan\'s rows (24 plans)', rrHyp === 0, rrHyp)
check('...while fat-loss plans still hold it (the fixture binds, and the row is not banned)', rrFat > 0, rrFat)

console.log('\n4. "Per leg" only for one leg working')
check('a suitcase deadlift (both feet down) reads "(single side)"', labelModeForEntry(getExerciseEntry('Suitcase Deadlift')!) === 'single_side')
const perLeg = EXERCISE_DATABASE.filter(e => !e.retired && labelModeForEntry(e) === 'per_leg').map(e => e.name).sort()
check('every "per leg" entry works one leg', perLeg.length > 0 && perLeg.every(n => /single-leg|one-leg|iso-lateral|kickback/i.test(n)), perLeg)
check('...and the single-leg ones keep it', perLeg.includes('Single-Leg Leg Press') && perLeg.includes('Single-Leg Dumbbell RDL'))

console.log('\n5. A lift steps up from its OWN last number, not from a stranger in its slot')
const pp = his.flatMap(w => w.is_deload ? [] : w.days.flatMap(d => d.exercises.filter(e => e.name === 'Push Press')
  .map(e => ({ w: w.week_number, kg: (e as { suggested_load_kg?: number }).suggested_load_kg ?? 0 }))))
check('the push press appears in two separate blocks (the measured case)', new Set(pp.map(x => Math.ceil(x.w / 4))).size >= 2, pp)
const drops = pp.filter((x, i) => i > 0 && x.kg < pp[i - 1].kg)
check('...and never drops from one loading week to the next it appears in', drops.length === 0, pp)

console.log('\n6. A lift new to the plan takes its slot\'s number in its own units (total or per side)')
{
  const wk = his.find(w => w.days.some(d => d.exercises.some(e => e.name === 'Single-Arm Lat Pulldown')))
  const kgOf = (n: string) => wk?.days.flatMap(d => d.exercises).find(e => e.name === n) as { suggested_load_kg?: number } | undefined
  const one = kgOf('Single-Arm Lat Pulldown')?.suggested_load_kg, two = kgOf('Close-Grip Lat Pulldown')?.suggested_load_kg ?? kgOf('Lat Pulldown')?.suggested_load_kg
  check('the measured case is there: a single-arm and a two-arm pulldown in one week', one != null && two != null, { week: wk?.week_number, one, two })
  check('one arm carries at most 60% of the two-arm pulldown (it was 42.5kg an arm beside 62.5kg)', one != null && two != null && one <= two * 0.6, { one, two })
}

console.log(`\n${passed + failed} checks ran: ${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)

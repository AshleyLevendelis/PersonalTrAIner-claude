// test:pregnant-beginner — his "yes fix all four", 22 Nov 2026, after reading a 35-year-old pregnant beginner's plan:
// no barbell lifts to learn, no bent-over rows, no balance-heavy moves, and two optional easy walks on rest days. A
// pregnant beginner gets the older-beginner safer list plus a balance rule of her own. Seeded; every section has a
// contrast showing its fixture binds.
import { generateMesocycle, setRandomSource, getConstrainedPool, OPTIONAL_CARDIO_FOCUS } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { getExerciseEntry } from '../src/lib/exercise-db'
import { isPregnantBeginner, needsBeginnerSafeguards, beginnerSafeguardExclusion } from '../src/lib/older-beginner'
import { loadingMode } from '../src/lib/load-prescription'
import type { UserProfile, MesocycleWeek } from '../src/lib/types'

let passed = 0
let failed = 0
const check = (name: string, ok: boolean, detail: unknown = '') => {
  if (ok) { passed++; console.log(`  ok: ${name}`) }
  else { failed++; console.log(`  FAIL: ${name} — ${JSON.stringify(detail).slice(0, 300)}`) }
}
const ALL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const her = (o: Partial<UserProfile> & { nd?: number } = {}): UserProfile => {
  const nd = o.nd ?? 3
  return {
    age: 35, gender: 'female', height_cm: 166, weight_kg: 70, activity_level: 'lightly_active', fitness_goal: 'functional',
    start_preference: 'train', equipment_access: 'full_gym', session_duration_preference: '45-60', training_style: 'hybrid',
    training_experience: 'beginner', injuries: [], health_conditions: ['pregnancy'], recovery_capacity: 'moderate',
    workout_split_preference: 'ai_recommendation', conditioning_preference: 'tolerate', ...o,
    training_days: ALL.map((d, i) => ({ day: d, available: [0, 2, 4, 5].slice(0, nd).includes(i) })),
  } as UserProfile
}
const plan = (p: UserProfile, key: string): MesocycleWeek[] => { setRandomSource(seededRngFromKey(key)); return generateMesocycle(p) }
const names = (m: MesocycleWeek[]) => new Set(m.flatMap(w => w.days.flatMap(d => d.exercises.map(e => e.name))))
const isBarbell = (n: string) => { const e = getExerciseEntry(n); return !!e && loadingMode(e) === 'barbell' }
const BENT = /bent-over|t-bar rows|landmine row|pendlay/i
const BALANCE = /walking lunge|bulgarian|lateral lunge|single-leg balance/i

console.log('test:pregnant-beginner\n')

console.log('1. Who it is for')
check('pregnant and a beginner', isPregnantBeginner(her()) && needsBeginnerSafeguards(her()))
check('pregnant and a novice: not (it lifts once she has trained)', !isPregnantBeginner(her({ training_experience: 'novice' })))
check('a beginner, not pregnant: not', !needsBeginnerSafeguards(her({ health_conditions: [] })))

console.log('\n2. What is left out for her, and what stays')
const OFF: [string, string][] = [['Barbell Squats', 'barbell'], ['Sumo Deadlift', 'barbell'], ['Incline Barbell Bench Press', 'barbell'], ['Smith Machine Bent-Over Row', 'barbell'],
  ['Bent-Over Dumbbell Row', 'technique'], ['Walking Lunges', 'technique'], ['Dumbbell Lateral Lunge', 'balance'], ['Single-Leg Balance Hold', 'balance'], ['Rotary Torso Machine', 'technique']]
for (const [n, why] of OFF) check(`${n}: ${why}`, beginnerSafeguardExclusion(her(), getExerciseEntry(n)!) === why, beginnerSafeguardExclusion(her(), getExerciseEntry(n)!))
for (const n of ['Goblet Squats', 'Kettlebell Deadlift', 'Step-Ups', 'Dumbbell Reverse Lunge', 'Dumbbell Rows', 'Seated Cable Row', 'Chest Press Machine', 'Lat Pulldown'])
  check(`${n}: kept`, beginnerSafeguardExclusion(her(), getExerciseEntry(n)!) === null, beginnerSafeguardExclusion(her(), getExerciseEntry(n)!))
const olderBeg = { age: 70, training_experience: 'beginner' as const, health_conditions: [] }
check('the balance rule is hers alone: a 70-year-old beginner keeps the lateral lunge and the balance hold (there they are the training)',
  beginnerSafeguardExclusion(olderBeg, getExerciseEntry('Dumbbell Lateral Lunge')!) === null && beginnerSafeguardExclusion(olderBeg, getExerciseEntry('Single-Leg Balance Hold')!) === null)

console.log('\n3. Across a spread of pregnant beginners\' plans: none of them; the same women not pregnant do get them')
const spread: { o: Partial<UserProfile> & { nd?: number }; key: string }[] = []
for (const eq of ['full_gym', 'home_gym'] as const) for (const goal of ['functional', 'hypertrophy', 'fat_loss'] as const)
  for (const style of ['hybrid', 'functional', 'bodybuilding'] as const) for (const nd of [3, 4]) spread.push({ o: { equipment_access: eq, fitness_goal: goal, training_style: style, nd }, key: `pb${eq}${goal}${style}${nd}` })
const bad = (s: Set<string>) => [...s].filter(n => isBarbell(n) || BENT.test(n) || BALANCE.test(n))
let preg = 0, notPreg = 0
const offenders: string[] = []
for (const s of spread) {
  const p = bad(names(plan(her(s.o), s.key))); preg += p.length; if (p.length) offenders.push(`${s.key}: ${p.join(', ')}`)
  notPreg += bad(names(plan(her({ ...s.o, health_conditions: [] }), s.key))).length
}
check(`no barbell, bent-over row or balance-heavy move in ${spread.length} pregnant beginners' plans`, preg === 0, offenders.slice(0, 3))
check('...while the same beginners not pregnant hold them (the fixture binds)', notPreg > 0, notPreg)
const pool = getConstrainedPool(her()).map(e => e.name)
check('the swap shortlist agrees (no barbell, no bent-over row, no lateral lunge)', bad(new Set(pool)).length === 0, bad(new Set(pool)))
const hers = plan(her(), 'p35')
const pats = new Set(hers.filter(w => !w.is_deload).flatMap(w => w.days.flatMap(d => d.exercises.map(e => getExerciseEntry(e.name)?.movement_pattern))))
check('her plan still squats, hinges, presses and pulls', ['knee_dominant', 'hip_hinge', 'horizontal_push', 'horizontal_pull', 'vertical_pull'].every(p => pats.has(p as never)), [...pats])
check('...and her hinge is a two-feet kettlebell or dumbbell deadlift, not a barbell', names(hers).has('Kettlebell Deadlift') && ![...names(hers)].some(n => getExerciseEntry(n)?.movement_pattern === 'hip_hinge' && isBarbell(n)))

console.log('\n4. Two optional easy walks on rest days')
const walks = (m: MesocycleWeek[]) => m[0].days.filter(d => d.focus === OPTIONAL_CARDIO_FOCUS)
check('two each week, named optional, 20-minute easy walks', hers.every(w => walks([w]).length === 2) && walks(hers).every(d => /optional/i.test(d.focus) && /walk/i.test(d.recommendedCardio?.activity ?? '') && d.recommendedCardio?.duration === 20), walks(hers).map(d => d.recommendedCardio))
check('a 35-year-old beginner not pregnant: none (his ruling "B" stands)', walks(plan(her({ health_conditions: [] }), 'p35')).length === 0)
check('pregnant with low recovery: none', walks(plan(her({ recovery_capacity: 'low' }), 'p35low')).length === 0)

console.log(`\n${passed + failed} checks ran: ${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)

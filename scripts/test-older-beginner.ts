// test:older-beginner — beginners from 60 (his request 21 Nov 2026, "fix those five issues for beginners over 60.
// tighten the beginner and 60+ selection rules"). The five: barbell lifts on day one, pull-up negatives / assisted
// pull-ups, a landmine press at an empty bar beside a 4 kg dumbbell press, a session called "Power", no balance work.
// Seeded, so every run is the same plan. Every section has a contrast that shows its fixture binds.
import { generateMesocycle, setRandomSource, getConstrainedPool, stageOlderBeginnerFilter, beginnerTrackName } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { getExerciseEntry, EXERCISE_DATABASE, type ExerciseEntry } from '../src/lib/exercise-db'
import { isOlderBeginner, olderBeginnerExclusion } from '../src/lib/older-beginner'
import { needsBalanceWork, BALANCE_HOLD } from '../src/lib/pathway'
import { calculateDailyMacros } from '../src/lib/macro-calculator'
import type { UserProfile, MesocycleWeek, ConstraintTrace } from '../src/lib/types'

let passed = 0
let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) { passed++; console.log(`  ok: ${name}`) }
  else { failed++; console.log(`  FAIL: ${name}${detail ? ` — ${detail}` : ''}`) }
}

const ALL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const her = (over: Partial<UserProfile> = {}): UserProfile => ({
  age: 60, gender: 'female', height_cm: 165, weight_kg: 72, activity_level: 'sedentary',
  fitness_goal: 'fat_loss', start_preference: 'train', equipment_access: 'full_gym',
  training_days: ALL.map(d => ({ day: d, available: ['Monday', 'Wednesday', 'Friday'].includes(d) })),
  preferred_time: 'morning', dietary_preferences: [], session_duration_preference: '30-45',
  workout_split_preference: 'ai_recommendation', macro_calculation_mode: 'STANDARD_STATIC',
  training_style: 'functional', training_experience: 'beginner', coaching_persona: 'supportive', injuries: [],
  recovery_capacity: 'moderate', conditioning_preference: 'tolerate', ...over,
} as UserProfile)
function plan(profile: UserProfile): MesocycleWeek[] {
  setRandomSource(seededRngFromKey('f60'))
  return generateMesocycle(profile)
}
const lifting = (p: MesocycleWeek[]) => p.flatMap(w => w.days).filter(d => d.exercises.length > 0)
const names = (p: MesocycleWeek[]) => new Set(lifting(p).flatMap(d => d.exercises.map(e => e.name)))
const entry = (n: string) => getExerciseEntry(n)!

console.log('test:older-beginner\n')

console.log('1. Who the rule is for')
check('60 and a beginner', isOlderBeginner({ age: 60, training_experience: 'beginner' }))
check('59 is not', !isOlderBeginner({ age: 59, training_experience: 'beginner' }))
check('a 60-year-old novice is not (it lifts once she has trained)', !isOlderBeginner({ age: 60, training_experience: 'novice' }))
check('no age held is not (nothing assumed)', !isOlderBeginner({ age: undefined as unknown as number, training_experience: 'beginner' }))

console.log('\n2. What is left out, and why')
const expect: [string, string | null][] = [
  ['Barbell Squats', 'barbell'], ['Trap Bar Deadlift', 'barbell'], ['Landmine Press', 'barbell'],
  ['Pull-Up Negatives', 'hanging'], ['Pull-Ups (Assisted)', 'hanging'], ['Box Jumps', 'impact'],
  ['Romanian Deadlifts', 'technique'], ['Walking Lunges', 'technique'], ['Single-Leg Dumbbell RDL', 'technique'],
  ['Reverse Hyper Machine', 'technique'],
  ['Goblet Squats', null], ['Lat Pulldown', null], ['Kettlebell Deadlift', null], ['Step-Ups', null],
]
for (const [n, want] of expect) {
  const e = getExerciseEntry(n)
  check(`${n}: ${want ?? 'kept'}`, !!e && olderBeginnerExclusion(e) === want, e ? String(olderBeginnerExclusion(e)) : 'not in the catalogue')
}

console.log('\n3. Her plan (60, beginner, full gym, functional, 3 days): the five issues')
const hers = plan(her())
const herNames = names(hers)
const leaks = [...herNames].filter(n => { const e = getExerciseEntry(n); return e && olderBeginnerExclusion(e) })
check('no barbell, hanging, jumping or technique lift in any of the 16 weeks', leaks.length === 0, leaks.join(', '))
check('her vertical pull is a lat pulldown', herNames.has('Lat Pulldown'), [...herNames].join(', '))
check('no pull-up of any kind', ![...herNames].some(n => /pull-up/i.test(n)))
check('no landmine press', !herNames.has('Landmine Press'))
check('no session named "Power"', lifting(hers).every(d => !/power/i.test(d.focus)), [...new Set(lifting(hers).map(d => d.focus))].join(', '))
check('her full-body days are "Full Body Strength"', lifting(hers).some(d => d.focus === 'Full Body Strength'))
check('balance work in the warm-up of every lifting day', lifting(hers).every(d => d.warmup?.mobility.some(m => m.name === BALANCE_HOLD)))
const coversEveryWeek = (pats: string[]) => hers.every(w => w.days.some(d => d.exercises.some(e => pats.includes(getExerciseEntry(e.name)?.movement_pattern ?? ''))))
check('every week still squats', coversEveryWeek(['knee_dominant']))
check('every week still hinges', coversEveryWeek(['hip_hinge']))
check('every week still pushes and pulls', coversEveryWeek(['horizontal_push', 'vertical_push']) && coversEveryWeek(['horizontal_pull', 'vertical_pull']))

console.log('\n4. The same woman at 59: the fixture binds (she is given what the rule takes away)')
const at59 = plan(her({ age: 59 }))
const leaks59 = [...names(at59)].filter(n => { const e = getExerciseEntry(n); return e && olderBeginnerExclusion(e) })
check('at 59 her plan holds lifts the rule removes', leaks59.length > 0)
check('at 59 there is no balance hold (it starts at 60 for a beginner)', lifting(at59).every(d => !d.warmup?.mobility.some(m => m.name === BALANCE_HOLD)))
check('at 59 a beginner is still never told "Power"', lifting(at59).every(d => !/power/i.test(d.focus)))

console.log('\n5. Not a beginner: nothing changes')
const inter = plan(her({ age: 62, training_experience: 'intermediate' }))
check('a 62-year-old intermediate keeps "Full Body Power"', lifting(inter).some(d => d.focus === 'Full Body Power'))
check('a 62-year-old intermediate can be given a barbell', [...names(inter)].some(n => olderBeginnerExclusion(entry(n)) === 'barbell'))
check('balance from 65 for everyone, 60 for a beginner', needsBalanceWork({ age: 65, training_experience: 'advanced' })
  && !needsBalanceWork({ age: 64, training_experience: 'novice' }) && needsBalanceWork({ age: 60, training_experience: 'beginner' }))
check('beginnerTrackName renames only Full Body Power, only for a beginner',
  beginnerTrackName('Full Body Power', 'beginner') === 'Full Body Strength' && beginnerTrackName('Full Body Power', 'novice') === 'Full Body Power'
  && beginnerTrackName('Squat & Carry', 'beginner') === 'Squat & Carry')

console.log('\n5b. The rename moves no calorie target')
{
  const t = (focus: string) => calculateDailyMacros({ ...her(), macro_calculation_mode: 'DYNAMIC_CSCS' } as UserProfile, 'Monday', [{ day: 'Monday', focus, exercises: [] } as never])
  const a = t('Full Body Strength'), b = t('Full Body Power')
  check('the estimate reads the day\'s name (a core day counts differently)', JSON.stringify(t('Upper Pull & Core')) !== JSON.stringify(b))
  check('a Full Body Strength day counts the same as Full Body Power', JSON.stringify(a) === JSON.stringify(b), `${JSON.stringify(a).slice(0, 80)} vs ${JSON.stringify(b).slice(0, 80)}`)
}

console.log('\n6. The swap shortlist reads the same pool (edits keep the bar)')
const pool = getConstrainedPool(her())
const poolLeaks = pool.filter(e => olderBeginnerExclusion(e))
check('the constrained pool holds none of them', poolLeaks.length === 0, poolLeaks.map(e => e.name).join(', '))
check('and holds a kettlebell deadlift and a goblet squat', pool.some(e => e.name === 'Kettlebell Deadlift') && pool.some(e => e.name === 'Goblet Squats'))

console.log('\n7. A pattern with nothing else left: a barbell lift yields, a hanging one never does')
const trace = (): ConstraintTrace => ({
  equipment_filtered: [], injury_filtered: [], style_filtered: [], skill_filtered: [],
  time_cap_adjusted: [], exclusion_filtered: [], structure_adjusted: [],
  pool_size_after_each_stage: { equipment: 0, injury: 0, style: 0, skill: 0, final: 0 },
} as ConstraintTrace)
const constructed: ExerciseEntry[] = ['Barbell Squats', 'Pull-Up Negatives', 'Pull-Ups (Assisted)', 'Bent-Over Dumbbell Row', 'Kettlebell Deadlift'].map(entry)
const out = stageOlderBeginnerFilter(constructed, { age: 63, training_experience: 'beginner' }, trace()).map(e => e.name)
check('the only squat (a barbell) is kept, so no week loses its squat', out.includes('Barbell Squats'), out.join(', '))
check('the only vertical pulls (hanging) are not kept', !out.includes('Pull-Up Negatives') && !out.includes('Pull-Ups (Assisted)'), out.join(', '))
check('an ordinary lift passes', out.includes('Kettlebell Deadlift') && out.includes('Bent-Over Dumbbell Row'))
const withGoblet = stageOlderBeginnerFilter([...constructed, entry('Goblet Squats')], { age: 63, training_experience: 'beginner' }, trace()).map(e => e.name)
check('with a goblet squat there, the barbell squat goes', !withGoblet.includes('Barbell Squats') && withGoblet.includes('Goblet Squats'), withGoblet.join(', '))
check('a 59-year-old passes through untouched', stageOlderBeginnerFilter(constructed, { age: 59, training_experience: 'beginner' }, trace()).length === constructed.length)

console.log('\n8. Every name the rule lists is a real catalogue entry (a renamed exercise must not slip past)')
const regexHits = EXERCISE_DATABASE.filter(e => !e.retired && olderBeginnerExclusion(e) === 'technique' && /single-leg|reverse hyper/i.test(e.name))
check('the single-leg RDL and reverse-hyper rule matches catalogue entries', regexHits.length >= 2, regexHits.map(e => e.name).join(', '))

console.log(`\n${passed + failed} checks ran: ${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)

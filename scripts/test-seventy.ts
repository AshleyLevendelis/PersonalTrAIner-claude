// test:seventy — his "yes fix all four", 22 Nov 2026, after reading a 70-year-old beginner woman's plan as a coach:
// (1) no unsupported bent-over row, hollow body hold or one-arm press for a beginner from 60; (2) a beginner's third
// block keeps the second block's work (strength's extra rest had cut it by a third); (3) "Lift fast, lower slow" on the
// main strength lifts from 60; (4) two optional easy walks on rest days for a beginner from 60. Seeded. Each section
// has a contrast showing its fixture binds.
import { generateMesocycle, setRandomSource, beginnerWorkingSets, OPTIONAL_CARDIO_FOCUS } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { getExerciseEntry } from '../src/lib/exercise-db'
import { olderBeginnerExclusion, liftFastCue } from '../src/lib/older-beginner'
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
    age: 70, gender: 'female', height_cm: 162, weight_kg: 68, activity_level: 'lightly_active', fitness_goal: 'functional',
    start_preference: 'train', equipment_access: 'full_gym', session_duration_preference: '45-60', training_style: 'hybrid',
    training_experience: 'beginner', injuries: [], recovery_capacity: 'moderate', workout_split_preference: 'ai_recommendation',
    conditioning_preference: 'tolerate', ...o,
    training_days: ALL.map((d, i) => ({ day: d, available: [0, 2, 4, 5].slice(0, nd).includes(i) })),
  } as UserProfile
}
const plan = (p: UserProfile, key: string): MesocycleWeek[] => { setRandomSource(seededRngFromKey(key)); return generateMesocycle(p) }
const names = (m: MesocycleWeek[]) => new Set(m.flatMap(w => w.days.flatMap(d => d.exercises.map(e => e.name))))
const spread: { o: Partial<UserProfile> & { nd?: number }; key: string }[] = []
for (const eq of ['full_gym', 'home_gym', 'minimalist'] as const) for (const goal of ['functional', 'hypertrophy', 'fat_loss'] as const)
  for (const dur of ['30-45', '45-60', '60-90'] as const) for (const nd of [2, 3, 4]) spread.push({ o: { equipment_access: eq, fitness_goal: goal, session_duration_preference: dur, nd }, key: `s70${eq}${goal}${dur}${nd}` })

console.log('test:seventy\n')

console.log('1. The demanding picks are off an older beginner\'s list; the supported ones stay')
const OFF = ['Bent-Over Dumbbell Row', 'Hollow Body Hold', 'Single-Arm Dumbbell Bench Press', 'Half-Kneeling Single-Arm Dumbbell Press', 'Single-Arm Kettlebell Press']
const ON = ['Chest-Supported Row', 'Dead Bug', 'Dumbbell Bench Press', 'Dumbbell Shoulder Press', 'Single-Arm Kettlebell Row', 'Single-Arm Cable Row', 'Single-Arm Lat Pulldown']
for (const n of OFF) check(`${n}: left out (technique)`, olderBeginnerExclusion(getExerciseEntry(n)!) === 'technique')
for (const n of ON) check(`${n}: kept`, olderBeginnerExclusion(getExerciseEntry(n)!) === null, olderBeginnerExclusion(getExerciseEntry(n)!))
let inOlder = 0, inYounger = 0
for (const s of spread) {
  inOlder += OFF.filter(n => names(plan(her(s.o), s.key)).has(n)).length
  inYounger += OFF.filter(n => names(plan(her({ ...s.o, age: 45 }), s.key)).has(n)).length
}
check(`none in ${spread.length} plans for a 70-year-old beginner`, inOlder === 0, inOlder)
check('...while a 45-year-old beginner\'s same plans hold some (the fixture binds)', inYounger > 0, inYounger)

console.log('\n2. A beginner\'s third block keeps the second block\'s work')
let b2 = 0, n2 = 0, b3 = 0, n3 = 0, under = 0
for (const s of spread) for (const age of [30, 70]) {
  for (const w of plan(her({ ...s.o, age }), `${s.key}${age}`)) {
    if (w.is_deload) continue
    for (const d of w.days.filter(x => x.exercises.length)) {
      const n = beginnerWorkingSets(d)
      if (/consolidation/i.test(w.phase_label ?? '')) { b3 += n; n3++; if (n < 12) under++ }
      else if (/hypertrophy/i.test(w.phase_label ?? '') && w.week_number <= 8) { b2 += n; n2++ }
    }
  }
}
check('the fixture has consolidation blocks', n3 > 100, n3)
// Literal bounds: it was 13.2 against 15.7, with 40% of days under 12.
check(`consolidation averages within one set of block 2 (${(b3 / n3).toFixed(1)} vs ${(b2 / n2).toFixed(1)})`, b2 / n2 - b3 / n3 < 1, { b2: b2 / n2, b3: b3 / n3 })
check(`under 10% of consolidation days under 12 sets (${under} of ${n3})`, under / n3 < 0.1, under)
const herPlan = plan(her(), 'f70')
const herCons = herPlan.filter(w => /consolidation/i.test(w.phase_label ?? '') && !w.is_deload)
check('her weeks 9-11: every session 15 sets or more (10 before)', herCons.length > 0 && herCons.every(w => w.days.filter(d => d.exercises.length).every(d => beginnerWorkingSets(d) >= 15)),
  herCons.map(w => w.days.filter(d => d.exercises.length).map(d => beginnerWorkingSets(d))))

console.log('\n3. "Lift fast, lower slow" on the main strength lifts, from 60')
const row = (name: string, reps = '10-12') => ({ name, reps })
check('a goblet squat at 70', liftFastCue({ age: 70 }, row('Goblet Squats')) === 'Lift fast, lower slow')
check('a chest press machine at 60', liftFastCue({ age: 60 }, row('Chest Press Machine')) === 'Lift fast, lower slow')
check('not at 59', liftFastCue({ age: 59 }, row('Goblet Squats')) === null)
check('not with no age held', liftFastCue({ age: undefined as unknown as number }, row('Goblet Squats')) === null)
check('not on a warm-up move', liftFastCue({ age: 70 }, row('Band Pull-Aparts')) === null)
check('not on an isolation lift', liftFastCue({ age: 70 }, row('Lateral Raises')) === null)
check('not on a hold', liftFastCue({ age: 70 }, row('Side Plank', '30-45s')) === null)
check('not on a swing', liftFastCue({ age: 70 }, row('Kettlebell Swings')) === null)
const herLifts = herPlan[0].days.flatMap(d => d.exercises)
check('in her week 1, every multi-joint lift carries it, and nothing else', herLifts.filter(e => liftFastCue({ age: 70 }, e)).length >= 9
  && herLifts.every(e => !!liftFastCue({ age: 70 }, e) === ['tier1_compound', 'tier2_compound'].includes(getExerciseEntry(e.name)?.mechanics_tier ?? '')),
  herLifts.map(e => `${e.name}:${!!liftFastCue({ age: 70 }, e)}`))

console.log('\n4. Two optional easy walks on rest days for a beginner from 60')
const walks = (m: MesocycleWeek[]) => m[0].days.filter(d => d.focus === OPTIONAL_CARDIO_FOCUS)
const hers = walks(herPlan)
check('two, each named optional, each a 20-minute easy walk', hers.length === 2 && hers.every(d => /optional/i.test(d.focus) && d.recommendedCardio?.duration === 20 && /walk/i.test(d.recommendedCardio?.activity ?? '')),
  hers.map(d => [d.day, d.focus, d.recommendedCardio]))
const order = (d: string) => ALL.indexOf(d)
check('never on two rest days in a row', hers.length === 2 && Math.abs(order(hers[0].day) - order(hers[1].day)) !== 1, hers.map(d => d.day))
check('never on a day she lifts', hers.every(d => !herPlan[0].days.some(x => x.day === d.day && x.exercises.length)))
check('every week of the plan', herPlan.every(w => walks([w]).length === 2))
check('at 58: none (his ruling "B" for a beginner stands under 60)', walks(plan(her({ age: 58 }), 'f58')).length === 0)
check('with low recovery: none', walks(plan(her({ recovery_capacity: 'low' }), 'f70low')).length === 0)
const sixDays = walks(plan({ ...her(), training_days: ALL.map(d => ({ day: d, available: d !== 'Sunday' })) } as UserProfile, 'f70six'))
check('with one rest day left: at most one', sixDays.length <= 1, sixDays.map(d => d.day))

console.log(`\n${passed + failed} checks ran: ${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)

// test:week-shape — his "yes fix all four", 21 Nov 2026, after reading a 40-year-old intermediate woman's plan as a
// coach: one heavy floor pull a week, trunk work at least twice a week, "Power" only in a plan with a power block,
// the foundations block's main lift at 8+ reps; and, found on the way, a trim never takes the day's main lift.
// Read over a seeded spread of plans (ages, levels, kits, styles, goals, 3 and 4 days), plus her own.
import { generateMesocycle, setRandomSource, phaseSequenceFor } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { getExerciseEntry, getMovementFamily } from '../src/lib/exercise-db'
import type { UserProfile, MesocycleWeek } from '../src/lib/types'

let passed = 0
let failed = 0
const check = (name: string, ok: boolean, detail: unknown = '') => {
  if (ok) { passed++; console.log(`  ok: ${name}`) }
  else { failed++; console.log(`  FAIL: ${name} — ${JSON.stringify(detail).slice(0, 300)}`) }
}

const ALL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const profileOf = (o: Partial<UserProfile> & { nd?: number }): UserProfile => {
  const nd = o.nd ?? 3
  return {
    age: 40, gender: 'female', height_cm: 167, weight_kg: 68, activity_level: 'lightly_active', fitness_goal: 'fat_loss',
    start_preference: 'train', equipment_access: 'full_gym', session_duration_preference: '45-60', training_style: 'hybrid',
    training_experience: 'intermediate', injuries: [], recovery_capacity: 'moderate', workout_split_preference: 'ai_recommendation',
    conditioning_preference: 'tolerate', ...o,
    training_days: ALL.map((d, i) => ({ day: d, available: (nd >= 5 ? [0, 1, 2, 3, 4, 5] : [0, 2, 4, 5]).slice(0, nd).includes(i) })),
  } as UserProfile
}
const plan = (p: UserProfile, key: string): MesocycleWeek[] => { setRandomSource(seededRngFromKey(key)); return generateMesocycle(p) }
const entry = (n: string) => getExerciseEntry(n)
const isFloorPull = (n: string) => { const e = entry(n); return !!e && e.mechanics_tier === 'tier1_compound' && getMovementFamily(e) === 'deadlift' }

// The spread, and the measured offenders of the 2,048-plan audit's slices.
const cases: { p: UserProfile; key: string }[] = []
for (const exp of ['beginner', 'intermediate', 'advanced'] as const) for (const eq of ['full_gym', 'home_gym', 'minimalist'] as const)
  for (const style of ['hybrid', 'functional', 'bodybuilding'] as const) for (const goal of ['fat_loss', 'hypertrophy', 'functional'] as const)
    for (const nd of [3, 4]) cases.push({ p: profileOf({ training_experience: exp, equipment_access: eq, training_style: style, fitness_goal: goal, nd, age: exp === 'beginner' ? 30 : 40 }), key: `ws${exp}${eq}${style}${goal}${nd}` })
// Six-day weeks, where a full-body day runs out of floor pulls first: the measured offender (novice, home gym,
// functional, fat loss: squat, sumo deadlift, squat, squat) and its neighbours.
for (const exp of ['novice', 'intermediate'] as const) for (const style of ['functional', 'hybrid'] as const) for (const s of [1, 2, 3, 4])
  cases.push({ p: profileOf({ training_experience: exp, equipment_access: 'home_gym', training_style: style, fitness_goal: 'fat_loss', nd: 6, age: 30 }), key: `ws6${exp}${style}${s}` })
const plans = cases.map(c => ({ ...c, m: plan(c.p, c.key) }))
const loading = (m: MesocycleWeek[]) => m.filter(w => !w.is_deload)

console.log(`test:week-shape (${plans.length} plans)\n`)

console.log('1. One heavy floor pull a week')
const twoPulls = plans.flatMap(x => loading(x.m).filter(w => w.days.filter(d => d.exercises.some(e => isFloorPull(e.name))).length >= 2).map(w => `${x.key} w${w.week_number}`))
check('no week holds two days led by a deadlift, sumo or trap-bar pull', twoPulls.length === 0, twoPulls.slice(0, 3))
const anyPull = plans.filter(x => loading(x.m).some(w => w.days.some(d => d.exercises.some(e => isFloorPull(e.name))))).length
check('...in a spread where many plans hold one (the check binds)', anyPull >= 20, anyPull)
const her = plan(profileOf({}), 'f40int')
const herLower = loading(her)[0].days.map(d => d.exercises.find(e => ['knee_dominant', 'hip_hinge'].includes(entry(e.name)?.movement_pattern ?? '') && entry(e.name)?.mechanics_tier !== 'primer')?.name)
// ...and taking the floor pull away never tips the week into squats: with the pull taken, a day that wants a hinge
// gets a Romanian deadlift or hip thrust, not a third squat (the first build gave squat, sumo, squat, squat).
const lopsided: string[] = []
for (const x of plans) for (const w of loading(x.m)) {
  const mains = w.days.map(d => d.exercises.find(e => ['knee_dominant', 'hip_hinge'].includes(entry(e.name)?.movement_pattern ?? '') && entry(e.name)?.mechanics_tier === 'tier1_compound')).filter(Boolean)
  const sq = mains.filter(e => entry(e!.name)?.movement_pattern === 'knee_dominant').length, hi = mains.length - sq
  if (Math.abs(sq - hi) > 1 && hi < sq) lopsided.push(`${x.key} w${w.week_number}: ${mains.map(e => e!.name).join(' | ')}`)
}
check('no week has squat main lifts outnumbering hinges by two or more (tier-1 led days)', lopsided.length === 0, lopsided.slice(0, 3))
check('her week: one floor pull, the other lower main a squat or a Romanian deadlift / hip thrust', herLower.filter(n => n && isFloorPull(n)).length === 1, herLower)

console.log('\n2. Trunk work at least twice a week')
const thinCore = plans.flatMap(x => loading(x.m).filter(w => w.days.reduce((n, d) => n + d.exercises.filter(e => entry(e.name)?.movement_pattern === 'core').length, 0) < 2).map(w => `${x.key} w${w.week_number}`))
check('every loading week holds two or more core exercises', thinCore.length === 0, thinCore.slice(0, 3))
check('...her week too (one woodchop a week before)', loading(her).every(w => w.days.reduce((n, d) => n + d.exercises.filter(e => entry(e.name)?.movement_pattern === 'core').length, 0) >= 2))

console.log('\n3. "Power" only in a plan with a power block')
const lying = plans.filter(x => !phaseSequenceFor(x.p).includes('power') && x.m.some(w => w.days.some(d => /Power/.test(d.focus)))).map(x => x.key)
check('no plan without a power block names a day "Power"', lying.length === 0, lying.slice(0, 3))
const powerPlans = plans.filter(x => phaseSequenceFor(x.p).includes('power') && x.m.some(w => w.days.some(d => d.focus === 'Full Body Power')))
check('...and plans with one keep the name (the check binds)', powerPlans.length > 0, powerPlans.length)
check('her fat-loss plan (no power block) says "Full Body Strength"', her.some(w => w.days.some(d => d.focus === 'Full Body Strength')) && !her.some(w => w.days.some(d => /Power/.test(d.focus))))

console.log('\n4. The foundations block starts the main lift at 8+ reps')
const low = plans.flatMap(x => x.m.filter(w => /adaptation/i.test(w.phase_label ?? '')).flatMap(w => w.days.flatMap(d => d.exercises
  .filter(e => entry(e.name)?.mechanics_tier === 'tier1_compound' && /^\d+-\d+$/.test(String(e.reps)) && Number(String(e.reps).split('-')[0]) < 8)
  .map(e => `${x.key} w${w.week_number} ${e.name} ${e.reps}`))))
check('no tier-1 main lift under 8 reps in a foundations block', low.length === 0, low.slice(0, 3))
const strengthLow = plans.some(x => x.m.some(w => /strength/i.test(w.phase_label ?? '') && w.days.some(d => d.exercises.some(e => entry(e.name)?.mechanics_tier === 'tier1_compound' && /^[3-5]-/.test(String(e.reps))))))
check('...while a strength block still goes to 3-5 (the floor is the block\'s, not every block\'s)', strengthLow)

console.log('\n5. A trim never takes the day\'s main lift')
const lost: string[] = []
for (const x of plans) {
  const ld = loading(x.m)
  ld[0].days.forEach((d, i) => {
    for (const e of d.exercises.filter(e => entry(e.name)?.mechanics_tier === 'tier1_compound')) {
      const missing = ld.find(w => w.days[i]?.exercises.length && !w.days[i].exercises.some(y => y.name === e.name))
      if (missing) lost.push(`${x.key} day ${i} ${e.name} gone in w${missing.week_number}`)
    }
  })
}
check('every week-1 tier-1 lift is on its day in every loading week', lost.length === 0, lost.slice(0, 3))

console.log(`\n${passed + failed} checks ran: ${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)

// test:bad-back — his "yes fix all four", 21 Nov 2026, after reading a 50-year-old's plan with his lower back on the
// injuries list: no lift with the load on the shoulders or swinging the lower back (the axial tag was missing on five),
// and a session of at most 22 working sets. Each section has a contrast showing its fixture binds.
import { generateMesocycle, setRandomSource, getConstrainedPool, beginnerWorkingSets, capBeginnerSets, LOWER_BACK_MAX_WORKING_SETS } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { getExerciseEntry, contraindicatedJoints, isContraindicatedFor } from '../src/lib/exercise-db'
import type { UserProfile, MesocycleWeek } from '../src/lib/types'

let passed = 0
let failed = 0
const check = (name: string, ok: boolean, detail: unknown = '') => {
  if (ok) { passed++; console.log(`  ok: ${name}`) }
  else { failed++; console.log(`  FAIL: ${name} — ${JSON.stringify(detail).slice(0, 300)}`) }
}
const ALL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const him = (o: Partial<UserProfile> = {}): UserProfile => ({
  age: 50, gender: 'male', height_cm: 178, weight_kg: 90, activity_level: 'lightly_active', fitness_goal: 'fat_loss', start_preference: 'train',
  equipment_access: 'full_gym', training_days: ALL.map(d => ({ day: d, available: ['Monday', 'Wednesday', 'Friday'].includes(d) })),
  session_duration_preference: '45-60', training_style: 'hybrid', training_experience: 'intermediate', injuries: ['lower_back'],
  recovery_capacity: 'moderate', workout_split_preference: 'ai_recommendation', ...o,
} as UserProfile)
const plan = (p: UserProfile, key: string): MesocycleWeek[] => { setRandomSource(seededRngFromKey(key)); return generateMesocycle(p) }
const BACK = new Set(['lower_back_axial'])

console.log('test:bad-back\n')

console.log('1. The five lifts carry the axial tag; the spine-sparing ones do not')
for (const n of ['Hack Squat', 'Smith Machine Split Squat', 'Reverse Hyper Machine', 'Smith Machine Calf Raise', 'Standing Calf Raise Machine']) {
  const e = getExerciseEntry(n)
  check(`${n}: kept off a bad back`, !!e && contraindicatedJoints(e).includes('lower_back_axial'))
}
for (const n of ['Belt Squat', 'Leg Press', 'Goblet Squats', 'Machine Hip Thrust', 'Seated Calf Raises']) {
  const e = getExerciseEntry(n)
  check(`${n}: still allowed (the alternative)`, !!e && !isContraindicatedFor(e, BACK))
}
check('the hack squat still suits a sore knee (its knee tag is unchanged)', !isContraindicatedFor(getExerciseEntry('Hack Squat')!, new Set(['knee'])))

console.log('\n2. Across a spread of bad-back plans, none of them; the same people without it do get them')
const TAGGED = ['Hack Squat', 'Smith Machine Split Squat', 'Reverse Hyper Machine', 'Smith Machine Calf Raise', 'Standing Calf Raise Machine']
const spread: { o: Partial<UserProfile>; key: string }[] = []
for (const exp of ['novice', 'intermediate', 'advanced'] as const) for (const style of ['hybrid', 'bodybuilding', 'functional'] as const)
  for (const goal of ['fat_loss', 'hypertrophy'] as const) spread.push({ o: { training_experience: exp, training_style: style, fitness_goal: goal }, key: `bb${exp}${style}${goal}` })
const namesOf = (m: MesocycleWeek[]) => new Set(m.flatMap(w => w.days.flatMap(d => d.exercises.map(e => e.name))))
let withBack = 0, without = 0
const overCap: string[] = [], overCapWithout: number[] = [], missing: string[] = []
for (const s of spread) {
  const back = plan(him(s.o), s.key), clean = plan(him({ ...s.o, injuries: [] }), s.key)
  const nb = namesOf(back), nc = namesOf(clean)
  withBack += TAGGED.filter(n => nb.has(n)).length
  without += TAGGED.filter(n => nc.has(n)).length
  for (const w of back) for (const d of w.days) if (d.exercises.length && beginnerWorkingSets(d) > LOWER_BACK_MAX_WORKING_SETS) overCap.push(`${s.key} w${w.week_number} ${beginnerWorkingSets(d)}`)
  overCapWithout.push(Math.max(0, ...clean.flatMap(w => w.days.map(d => beginnerWorkingSets(d)))))
  for (const w of back.filter(x => !x.is_deload)) {
    const pats = new Set(w.days.flatMap(d => d.exercises.map(e => getExerciseEntry(e.name)?.movement_pattern)))
    if (!pats.has('knee_dominant') && !pats.has('single_leg')) missing.push(`${s.key} w${w.week_number} squat`)
    if (!pats.has('hip_hinge')) missing.push(`${s.key} w${w.week_number} hinge`)
  }
}
check(`no bad-back plan holds one of the five (${spread.length} plans)`, withBack === 0, withBack)
check('...while the same plans without the injury do (the fixture binds)', without > 0, without)
const pool = getConstrainedPool(him()).map(e => e.name)
check('the swap shortlist agrees', TAGGED.every(n => !pool.includes(n)), TAGGED.filter(n => pool.includes(n)))

console.log('\n3. A bad back\'s session holds at most 22 working sets, and still squats and hinges every week')
check('the cap is 22', LOWER_BACK_MAX_WORKING_SETS === 22)
check('no bad-back session over 22 working sets', overCap.length === 0, overCap.slice(0, 3))
// His own plan, the measured case: a 26-set Monday before the cap.
const his = plan(him(), 'm50back')
check('his plan (the measured case, 26 sets on Monday before): every session 22 or fewer', his.every(w => w.days.every(d => beginnerWorkingSets(d) <= 22)),
  his.map(w => Math.max(...w.days.map(d => beginnerWorkingSets(d)))))
// And the cap itself, on a constructed 26-set day: it trims to 22, the main lift untouched.
const row = (name: string, sets: number) => ({ name, sets, reps: '10', rest: '60s' }) as never
const capped = capBeginnerSets({ day: 'Monday', focus: 'Full Body Strength', exercises: [row('Belt Squat', 4), row('Incline Dumbbell Press', 4),
  row('Lat Pulldown', 4), row('Chest-Supported Row', 4), row('Dumbbell Reverse Lunge', 4), row('Cable Woodchops', 3), row('Bird Dog', 3)] } as never, new Set(), 22) as { exercises: { name: string; sets: number }[] }
check('the cap trims a 26-set day to 22, the main lift untouched', beginnerWorkingSets(capped as never) === 22 && capped.exercises.find(e => e.name === 'Belt Squat')?.sets === 4, capped.exercises)
check('every loading week keeps a squat and a hinge', missing.length === 0, missing.slice(0, 3))
const beginnerBack = plan(him({ training_experience: 'beginner' }), 'bbbeg')
check('a beginner with a bad back keeps the beginner cap of 18', beginnerBack.every(w => w.days.every(d => beginnerWorkingSets(d) <= 18)))

console.log('\n4. No medicine ball slams in a bad back\'s warm-up (fast loaded spinal flexion); others keep them')
check('slams carry the back tag', contraindicatedJoints(getExerciseEntry('Medicine Ball Slams')!).includes('lower_back_axial'))
const withHim = [...spread, { o: {}, key: 'm50back' }, ...[1, 2, 3, 4, 5, 6].map(i => ({ o: { training_style: 'functional' as const, fitness_goal: 'fat_loss' as const }, key: `slam${i}` }))]
const slamsIn = (inj: string[]) => withHim.filter(s => namesOf(plan(him({ ...s.o, injuries: inj }), s.key)).has('Medicine Ball Slams')).length
const slamsBack = slamsIn(['lower_back']), slamsClean = slamsIn([])
check(`no bad-back plan holds them (${withHim.length} plans; his own had them on Wednesdays)`, slamsBack === 0 && !namesOf(his).has('Medicine Ball Slams'), slamsBack)
check('...while without the injury they stay in the pool, and some plan in a wider spread holds them (the fixture binds)',
  getConstrainedPool(him({ injuries: [] })).some(e => e.name === 'Medicine Ball Slams') && !getConstrainedPool(him()).some(e => e.name === 'Medicine Ball Slams') && slamsClean > 0, slamsClean)
check('his Wednesday still opens with a warm-up move', his.filter(w => !w.is_deload).every(w => w.days.filter(d => d.exercises.length).every(d => getExerciseEntry(d.exercises[0].name)?.mechanics_tier === 'primer')),
  his.map(w => w.days.filter(d => d.exercises.length).map(d => d.exercises[0].name)))

console.log(`\n${passed + failed} checks ran: ${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)

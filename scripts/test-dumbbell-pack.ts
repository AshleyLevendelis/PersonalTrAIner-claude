// ---------------------------------------------------------------------------
// test:dumbbell-pack: A HOME TRAINEE WITH DUMBBELLS GETS A PROPER WEEK (3 Nov 2026, docs/plans/dumbbell-pack.md)
//
// Measured that day, on the kit list's own profiles: dumbbells and no bench had NO loaded row (a Towel Row and a
// Table Row), and dumbbells and a bench with a shoulder flag had NO triceps isolation and pressed 4 sets a week
// against 12 pulling. Five catalogue entries fill those gaps. This holds the gaps closed as properties, and checks
// each new entry's exclusions against the entry it copies, so a later edit cannot quietly widen who gets them.
// ---------------------------------------------------------------------------
import { generateMesocycle, setRandomSource, resetRandomSource, getConstrainedPool } from '../src/lib/exercise-plan'
import { EXERCISE_DATABASE, getExerciseEntry, getMovementFamily } from '../src/lib/exercise-db'
import { categorize } from '../src/lib/load-prescription'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { profileWithKit, type KitStatement } from '../src/lib/kit-list'
import type { UserProfile, MesocycleWeek } from '../src/lib/types'

let ran = 0, failures = 0
const check = (label: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.log(`  FAIL: ${label}${detail === undefined ? '' : ' — ' + JSON.stringify(detail).slice(0, 400)}`) }
}
const quiet = <T,>(f: () => T): T => {
  const o = { log: console.log, warn: console.warn, error: console.error }
  console.log = console.warn = console.error = () => {}
  try { return f() } finally { Object.assign(console, o) }
}

const PACK: { name: string; copies: string; category: string }[] = [
  { name: 'Bent-Over Dumbbell Row', copies: 'Barbell Rows', category: 'row' },
  { name: 'Dumbbell Tricep Kickback', copies: 'Band Tricep Kickback', category: 'isolation_tricep' },
  { name: 'Lying Dumbbell Tricep Extension', copies: 'Skull Crushers', category: 'isolation_tricep' },
  { name: 'Dumbbell Hip Thrust', copies: 'Hip Thrust', category: 'hinge_accessory' },
  { name: 'Dumbbell Reverse Lunge', copies: 'Walking Lunges', category: 'single_leg_dumbbell' },
]
const DUMBBELL_KIT = new Set(['dumbbells', 'dumbbell', 'bench'])

const TODAY = new Date(2026, 9, 5)
const tester = (over: Partial<UserProfile> = {}): UserProfile => ({
  id: 'p-db', age: 34, gender: 'male', height_cm: 180, weight_kg: 82, activity_level: 'moderate',
  fitness_goal: 'hypertrophy', preferred_time: 'evening', bmr: 1800, tdee: 2600,
  equipment_access: 'minimalist', injuries: [], training_style: 'bodybuilding',
  training_experience: 'intermediate', session_duration_preference: '45-60', workout_split_preference: 'ai_recommendation',
  training_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    .map(d => ({ day: d, available: ['Monday', 'Tuesday', 'Thursday', 'Saturday'].includes(d) })),
  weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [], macro_calculation_mode: 'STANDARD_STATIC',
  coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate', max_dumbbell_kg: 24,
  created_at: TODAY.toISOString(), ...over,
}) as unknown as UserProfile
const kitted = (items: string[], over: Partial<UserProfile> = {}) =>
  profileWithKit(tester(over), [{ mode: 'only', items } as unknown as KitStatement])
const generate = (p: UserProfile, seed: string): MesocycleWeek[] => {
  setRandomSource(seededRngFromKey(seed))
  try { return quiet(() => generateMesocycle(p)) } finally { resetRandomSource() }
}
const weekSets = (meso: MesocycleWeek[], pats: string[]) => meso[0].days.flatMap(d => d.exercises)
  .filter(e => pats.includes(getExerciseEntry(e.name)?.movement_pattern ?? ''))
  .reduce((a, e) => a + (Number(e.sets) || 0), 0)

console.log('\n1. The five entries')
for (const p of PACK) {
  const e = getExerciseEntry(p.name)
  const model = getExerciseEntry(p.copies)
  check(`${p.name} is in the catalogue and needs only dumbbells or a bench`, !!e && e.equipment.every(x => DUMBBELL_KIT.has(x)), e?.equipment)
  check(`...is priced as ${p.category}, an existing category`, !!e && categorize(e) === p.category, e && categorize(e))
  const mine = new Set(e?.contraindicated_joints ?? [])
  const theirs = model?.contraindicated_joints ?? []
  check(`...and excludes at least every joint ${p.copies} excludes (${theirs.join(', ') || 'none'})`, !!e && !!model && theirs.every(j => mine.has(j)), { mine: [...mine], theirs })
}
const fam = (n: string) => { const e = getExerciseEntry(n); return e ? getMovementFamily(e) : null }
check('the kickback shares the band kickback\'s family (they never share a day), not the lying extension\'s',
  fam('Dumbbell Tricep Kickback') !== null && fam('Dumbbell Tricep Kickback') === fam('Band Tricep Kickback')
  && fam('Dumbbell Tricep Kickback') !== fam('Lying Dumbbell Tricep Extension'))
check('the five names are unique in the catalogue', PACK.every(p => EXERCISE_DATABASE.filter(e => e.name === p.name).length === 1))

console.log('\n2. Just dumbbells, no bench: a loaded row')
{
  const pool = getConstrainedPool(kitted(['dumbbells']), [])
  const rows = pool.filter(e => e.movement_pattern === 'horizontal_pull' && e.equipment.some(x => x === 'dumbbells' || x === 'dumbbell'))
  check('the pool holds a horizontal pull done with the dumbbells (measured: only Towel and Table Rows before)', rows.length >= 1, pool.filter(e => e.movement_pattern === 'horizontal_pull').map(e => e.name))
  const meso = generate(kitted(['dumbbells']), 'pack:db-only')
  const loadedRows = meso[0].days.flatMap(d => d.exercises).filter(e => rows.some(r => r.name === e.name))
  check('...and the week uses it', loadedRows.length >= 1, meso[0].days.map(d => d.exercises.map(e => e.name).join(', ')))
  const tooHeavy = meso.flatMap(w => w.days.flatMap(d => d.exercises)).filter(e => PACK.some(p => p.name === e.name) && (e.suggested_load_kg ?? 0) > 24)
  check('...and no pack lift is ever priced over the stated 24 kg dumbbell', tooHeavy.length === 0, tooHeavy.map(e => `${e.name} ${e.suggested_load_kg}`))
}

console.log('\n3. Dumbbells and a bench with a sore shoulder: triceps, and pressing back')
{
  const p = kitted(['dumbbells', 'bench'], { injuries: ['shoulders'] })
  const tri = getConstrainedPool(p, []).filter(e => e.movement_pattern === 'isolation_tricep').map(e => e.name)
  check('the pool holds a triceps isolation (measured: none before)', tri.length >= 1, tri)
  check('...and not the lying extension, which a shoulder flag excludes', !tri.includes('Lying Dumbbell Tricep Extension'), tri)
  const meso = generate(p, 'pack:db-bench-shoulder')
  const triSets = weekSets(meso, ['isolation_tricep'])
  const press = weekSets(meso, ['horizontal_push', 'vertical_push'])
  const pull = weekSets(meso, ['horizontal_pull', 'vertical_pull'])
  check('the week trains triceps (measured 3 sets, was 0)', triSets >= 2, triSets)
  check('...and presses at least 6 sets (measured 8, was 4)', press >= 6, { press, pull })
  check('...with pulling no more than 1.5x pressing (measured 10 to 8, was 12 to 4)', pull <= press * 1.5, { press, pull })
}

console.log('\n4. The exclusions bite')
{
  const elbow = getConstrainedPool(kitted(['dumbbells', 'bench'], { injuries: ['elbows'] }), []).map(e => e.name)
  check('an elbow flag keeps both new triceps moves out', !elbow.includes('Dumbbell Tricep Kickback') && !elbow.includes('Lying Dumbbell Tricep Extension'))
  const back = getConstrainedPool(kitted(['dumbbells']), [], ).map(e => e.name)
  const backFlag = getConstrainedPool(kitted(['dumbbells'], { injuries: ['lower_back'] }), []).map(e => e.name)
  check('a lower-back flag keeps the bent-over row out (and it is there without one, so this binds)', back.includes('Bent-Over Dumbbell Row') && !backFlag.includes('Bent-Over Dumbbell Row'))
  const knee = getConstrainedPool(kitted(['dumbbells']), []).map(e => e.name)
  const kneeFlag = getConstrainedPool(kitted(['dumbbells'], { injuries: ['knees'] }), []).map(e => e.name)
  check('a knee flag keeps the reverse lunge out (and it is there without one)', knee.includes('Dumbbell Reverse Lunge') && !kneeFlag.includes('Dumbbell Reverse Lunge'))
}

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.log(`${failures} dumbbell-pack check(s) failed`); process.exit(1) }
console.log('dumbbell-pack: all checks passed')

// ---------------------------------------------------------------------------
// test:exercise-library-batch3: THE EXERCISE LIBRARY, BATCH 3, KETTLEBELL AND BODYWEIGHT (10 Nov 2026, his "work
// through as many fixes and improvements as you can ... add exercise and meal variations"; docs/plans/exercise-library.md,
// his "Known kit + a few" and the CSCS rules there).
//
// Holds, for every entry added: it copies its nearest entry's exclusions, it is priced in an existing category and
// never heavier on the body than its model, a harder variant waits for the right experience with a regression that
// exists, and the batch reaches the people it is for: a kettlebell-only trainee gets a press, a row and a slow hinge,
// and a no-kit trainee gets triceps, sideways single-leg work and core it did not have.
// ---------------------------------------------------------------------------
import { getConstrainedPool, generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { EXERCISE_DATABASE, getExerciseEntry, getMovementFamily, meetsCapabilityRequirement } from '../src/lib/exercise-db'
import { categorize, prescribeLoad, isPerSideLoad } from '../src/lib/load-prescription'
import { seededRngFromKey } from '../src/lib/seeded-random'
import type { UserProfile, TrainingExperience, FitnessGoal, TrainingStyle } from '../src/lib/types'

let ran = 0, failures = 0
const check = (label: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.log(`  FAIL: ${label}${detail === undefined ? '' : ' — ' + JSON.stringify(detail).slice(0, 400)}`) }
}
const quiet = <T,>(f: () => T): T => {
  const o = { log: console.log, warn: console.warn, error: console.error, debug: console.debug }
  console.log = console.warn = console.error = console.debug = () => {}
  try { return f() } finally { Object.assign(console, o) }
}

// MEASURED 10 Nov 2026: all 11 prescribed somewhere in the 54 seeded plans; the floor leaves room for one to drop out.
const MIN_PRESCRIBED = 10
const BATCH: { name: string; copies: string; pricedAs: string | null; category: string | null; alsoExcludes?: string[] }[] = [
  { name: 'Kettlebell Deadlift', copies: 'Romanian Deadlifts', pricedAs: 'Romanian Deadlifts', category: 'deadlift' },
  { name: 'Single-Arm Kettlebell Press', copies: 'Dumbbell Shoulder Press', pricedAs: 'Half-Kneeling Single-Arm Dumbbell Press', category: 'overhead' },
  { name: 'Single-Arm Kettlebell Row', copies: 'Bent-Over Dumbbell Row', pricedAs: 'Dumbbell Rows', category: 'row' },
  { name: 'Reverse Lunge (Bodyweight)', copies: 'Dumbbell Reverse Lunge', pricedAs: null, category: 'single_leg_dumbbell' },
  { name: 'Lateral Lunge (Bodyweight)', copies: 'Dumbbell Lateral Lunge', pricedAs: null, category: 'single_leg_dumbbell' },
  // the narrow hands load the elbows, as the close-grip bench press
  { name: 'Close-Grip Push-Ups', copies: 'Push-Ups', pricedAs: null, category: 'bench', alsoExcludes: ['elbow'] },
  { name: 'Decline Push-Ups', copies: 'Push-Ups', pricedAs: null, category: 'bench' },
  // done badly it arches the lower back
  { name: 'Hollow Body Hold', copies: 'Plank', pricedAs: null, category: null, alsoExcludes: ['lower_back_axial'] },
  { name: 'Plank Shoulder Taps', copies: 'Push-Ups', pricedAs: null, category: null },
  // a long lever on the knee and the groin
  { name: 'Copenhagen Plank', copies: 'Side Plank', pricedAs: null, category: null, alsoExcludes: ['hip', 'knee'] },
  { name: 'Reverse Crunch', copies: 'Cable Crunch', pricedAs: null, category: null },
]
const contra = (n: string) => { const e = getExerciseEntry(n); return e ? (e.contraindicated_joints ?? e.loads_joints) : null }

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const person = (gender: 'male' | 'female', weight_kg: number, training_experience: TrainingExperience, over: Partial<UserProfile> = {}): UserProfile => ({
  age: 32, gender, height_cm: gender === 'male' ? 180 : 166, weight_kg, activity_level: 'moderate', fitness_goal: 'hypertrophy',
  preferred_time: 'evening', bmr: 1700, tdee: 2500, equipment_access: 'full_gym', injuries: [], training_style: 'functional',
  training_experience, session_duration_preference: '45-60', workout_split_preference: 'ai_recommendation',
  training_days: DAYS.map(d => ({ day: d, available: ['Monday', 'Tuesday', 'Thursday', 'Saturday'].includes(d) })),
  weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [], macro_calculation_mode: 'STANDARD_STATIC',
  coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate', ...over,
}) as unknown as UserProfile
const PEOPLE = [person('male', 85, 'intermediate'), person('female', 62, 'beginner'), person('male', 120, 'advanced'), person('female', 70, 'advanced'), person('female', 55, 'intermediate')]

console.log('\n1. The entries')
for (const p of BATCH) {
  const e = getExerciseEntry(p.name)
  check(`${p.name} is in the catalogue, once`, !!e && EXERCISE_DATABASE.filter(x => x.name === p.name).length === 1)
  check(`...priced as ${p.category ?? 'nothing (core progresses by reps and time)'}`, !!e && categorize(e) === p.category, e && categorize(e))
  const mine = new Set(contra(p.name) ?? [])
  const theirs = [...(contra(p.copies) ?? ['(model missing)']), ...(p.alsoExcludes ?? [])]
  check(`...and excludes at least every joint ${p.copies} excludes${p.alsoExcludes ? ' plus ' + p.alsoExcludes.join(', ') : ''} (${theirs.join(', ') || 'none'})`, theirs.every(j => mine.has(j)), { mine: [...mine], theirs })
}
const AT_END = EXERCISE_DATABASE.slice(-BATCH.length).map(e => e.name)
check('the batch is appended at the end, so a tie still goes to an entry the app already had', BATCH.every(p => AT_END.includes(p.name)), AT_END)

console.log('\n2. Never heavier on the body than the model (a per-hand number counts twice)')
{
  const heavier: string[] = []
  let compared = 0
  const onBody = (n: string, who: UserProfile) => {
    const e = getExerciseEntry(n)!
    const kg = quiet(() => prescribeLoad(e, who).starting_weight_kg)
    return kg == null ? null : (isPerSideLoad(e) ? kg * 2 : kg)
  }
  for (const p of BATCH) {
    if (!p.pricedAs) continue
    for (const who of PEOPLE) {
      const mine = onBody(p.name, who), theirs = onBody(p.pricedAs, who)
      if (mine == null || theirs == null) continue
      compared++
      if (mine > theirs + (isPerSideLoad(getExerciseEntry(p.name)!) ? 5 : 2.5)) heavier.push(`${p.name} ${mine} vs ${p.pricedAs} ${theirs} (${who.gender} ${who.weight_kg} ${who.training_experience})`)
    }
  }
  check(`no kettlebell entry prices heavier than its model (${compared} comparisons)`, compared >= 15 && heavier.length === 0, heavier.slice(0, 4))
  check('the one-arm press and row are prescribed per hand; the deadlift (one bell, two hands) as one weight', ['Single-Arm Kettlebell Press', 'Single-Arm Kettlebell Row'].every(n => isPerSideLoad(getExerciseEntry(n)!)) && !isPerSideLoad(getExerciseEntry('Kettlebell Deadlift')!))
  // THE FRACTION, measured (its comment in exercise-db.ts): its name prices it as a barbell deadlift, and without the
  // fraction an 85 kg intermediate would be handed the bell's 48 kg cap for a first set.
  const kbd = onBody('Kettlebell Deadlift', PEOPLE[0]), swing = onBody('Kettlebell Swing (Heavy)', PEOPLE[0]), goblet = onBody('Goblet Squats', PEOPLE[0])
  check('the kettlebell deadlift lands between the heavy swing and the goblet squat, give or take one bell size', kbd != null && swing != null && goblet != null && kbd >= swing && kbd <= goblet + 4, { kbd, swing, goblet })
  const bodyweightPriced = BATCH.filter(p => !p.pricedAs).map(p => p.name).filter(n => quiet(() => prescribeLoad(getExerciseEntry(n)!, PEOPLE[0]).starting_weight_kg) != null)
  check('no bodyweight entry is handed a weight', bodyweightPriced.length === 0, bodyweightPriced)
}

console.log('\n3. A harder variant waits, with a regression that exists')
for (const [name, level, regression] of [['Close-Grip Push-Ups', 'novice', 'Push-Ups'], ['Decline Push-Ups', 'novice', 'Push-Ups'], ['Copenhagen Plank', 'intermediate', 'Side Plank']] as [string, TrainingExperience, string][]) {
  const e = getExerciseEntry(name)!
  check(`${name}: a beginner does not meet it, ${level} does`, !!e && !meetsCapabilityRequirement(e, 'beginner') && meetsCapabilityRequirement(e, level))
  check(`...and the beginner is sent to ${regression}, which exists`, e?.capability_requirement?.regression === regression && !!getExerciseEntry(regression))
}

console.log('\n4. They reach the people they are for')
{
  const kbOnly = person('male', 80, 'intermediate', { equipment_access: 'minimalist' })
  const poolFor = (who: UserProfile) => quiet(() => getConstrainedPool(who, [])).map(x => x.name)
  // A kettlebell-only kit, as the kit ticks record it (allowedEquipmentFor reads these facts): the minimalist tier
  // without dumbbells. Built by the pool's own filter, asked of the names.
  const minimal = poolFor(kbOnly)
  check('a minimalist pool (kettlebell among its kit) holds the kettlebell press, row and deadlift', ['Single-Arm Kettlebell Press', 'Single-Arm Kettlebell Row', 'Kettlebell Deadlift'].every(n => minimal.includes(n)), ['Single-Arm Kettlebell Press', 'Single-Arm Kettlebell Row', 'Kettlebell Deadlift'].filter(n => !minimal.includes(n)))
  const noKit = poolFor(person('female', 60, 'intermediate', { equipment_access: 'bodyweight' }))
  const BW = ['Reverse Lunge (Bodyweight)', 'Lateral Lunge (Bodyweight)', 'Close-Grip Push-Ups', 'Decline Push-Ups', 'Hollow Body Hold', 'Plank Shoulder Taps', 'Copenhagen Plank', 'Reverse Crunch']
  const styled = BW.filter(n => getExerciseEntry(n)!.style_tags.includes('functional'))
  check(`a no-kit functional pool holds every bodyweight entry tagged functional (${styled.length})`, styled.every(n => noKit.includes(n)), styled.filter(n => !noKit.includes(n)))
  check('...and a no-kit pool holds none of the kettlebell ones', !['Single-Arm Kettlebell Press', 'Single-Arm Kettlebell Row', 'Kettlebell Deadlift'].some(n => noKit.includes(n)))
  const sore = poolFor(person('female', 60, 'intermediate', { equipment_access: 'bodyweight', injuries: ['lower_back'] } as Partial<UserProfile>))
  check('a sore lower back keeps the hollow hold and the reverse crunch out (the plank stays)', !sore.includes('Hollow Body Hold') && !sore.includes('Reverse Crunch') && sore.includes('Plank'), { hollow: sore.includes('Hollow Body Hold'), crunch: sore.includes('Reverse Crunch'), plank: sore.includes('Plank') })
  const knee = poolFor(person('female', 60, 'intermediate', { equipment_access: 'bodyweight', injuries: ['knees'] } as Partial<UserProfile>))
  check('a sore knee keeps both new lunges and the Copenhagen plank out', !['Reverse Lunge (Bodyweight)', 'Lateral Lunge (Bodyweight)', 'Copenhagen Plank'].some(n => knee.includes(n)))
  // MEASURED, a property of the batch as a whole: seeded plans for the people the batch is for.
  const seen = new Set<string>()
  let plans = 0
  for (const access of ['bodyweight', 'minimalist'] as UserProfile['equipment_access'][])
    for (const goal of ['hypertrophy', 'fat_loss', 'functional'] as FitnessGoal[])
      for (const style of ['bodybuilding', 'functional', 'hybrid'] as TrainingStyle[])
        for (const experience of ['beginner', 'intermediate', 'advanced'] as TrainingExperience[]) {
          setRandomSource(seededRngFromKey(`batch3|${access}|${goal}|${style}|${experience}`))
          try {
            const meso = quiet(() => generateMesocycle(person('female', 66, experience, { equipment_access: access, fitness_goal: goal, training_style: style })))
            plans++
            for (const w of meso) for (const d of w.days) for (const x of d.exercises) if (BATCH.some(p => p.name === x.name)) seen.add(x.name)
          } finally { resetRandomSource() }
        }
  console.log(`     prescribed somewhere in ${plans} seeded plans: ${[...seen].sort().join(', ')}`)
  check(`most of the batch is prescribed by some plan in the seeded grid (at least ${MIN_PRESCRIBED} of ${BATCH.length})`, plans === 54 && seen.size >= MIN_PRESCRIBED, { seen: seen.size, plans })
}

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.log(`${failures} exercise-library-batch3 check(s) failed`); process.exit(1) }
console.log('exercise-library-batch3: all checks passed')

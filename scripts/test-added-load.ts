// ---------------------------------------------------------------------------
// Gate for a chin-up that actually gets heavier.
//
// Ashley's correction while scoping tempo: "Pull ups can add weight." Right,
// and the app had never given them any. MEASURED before this landed, across
// 8,928 slots: Pull-Ups 3,960, Chin-Ups 3,912, Tricep Dips 608, Chest Dips
// 448 — and ZERO carrying a weight.
//
// The defect that produced, on a full-gym advanced 80kg male:
//
//   Pull-Ups  w1:9-11 w2:10-12 w3:11-13 | ... | w9:3-5 w10:4-6 w11:5-7
//
// Week 9 prescribed THREE reps to someone the plan believes can do eleven,
// with nothing added. Not a strength block — less work. The phase note
// promises "Heavier and lower rep" and delivered only the second half.
//
// THE DESIGN MISTAKE THIS GATE EXISTS TO PREVENT A RETURN OF: the first cut
// scaled the added weight DOWN as reps rose, and produced
//
//   w9:3-5@+12.5  w10:4-6@+15  w11:5-7@+10       ...and w7:8-10 with none
//
// — the weight going up then down inside one block and vanishing at the top
// of another, because reps climb within a block (that IS the within-block
// lever) and the rep scale cut the weight as they climbed. More reps at less
// weight is a deload wearing progress's clothes. Keying on the PHASE fixes it
// by construction: a phase cannot change inside a block. Section 4 pins that.
// ---------------------------------------------------------------------------

import { generateExercisePlan, generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { getExerciseEntry, EXERCISE_DATABASE } from '../src/lib/exercise-db'
import { prescribeAddedLoad } from '../src/lib/load-prescription'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { UserProfile, EquipmentAccess, FitnessGoal, TrainingExperience, MesocycleWeek } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

function buildProfile(o: Partial<UserProfile>): UserProfile {
  return {
    age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
    fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1800, tdee: 2500,
    equipment_access: 'full_gym', injuries: [], training_style: 'hybrid',
    training_experience: 'advanced', session_duration_preference: '45-60',
    workout_split_preference: 'upper_lower',
    training_days: [
      { day: 'Monday', available: true }, { day: 'Tuesday', available: true },
      { day: 'Wednesday', available: true }, { day: 'Thursday', available: true },
      { day: 'Friday', available: false }, { day: 'Saturday', available: false },
      { day: 'Sunday', available: false },
    ],
    weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
    exercise_exclusions: [] as unknown as never, macro_calculation_mode: 'STANDARD_STATIC',
    coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
    ...o,
  } as UserProfile
}

function plan(o: Partial<UserProfile>, key: string): MesocycleWeek[] {
  const profile = buildProfile(o)
  setRandomSource(seededRngFromKey(key))
  const d = console.debug, w = console.warn
  console.debug = () => {}; console.warn = () => {}
  try { return generateMesocycle(profile, generateExercisePlan(profile).plan) }
  finally { console.debug = d; console.warn = w; resetRandomSource() }
}

const EQUIP: EquipmentAccess[] = ['full_gym', 'home_gym', 'minimalist', 'bodyweight']
const GOALS: FitnessGoal[] = ['hypertrophy', 'fat_loss', 'conditioning', 'functional']
const EXP: TrainingExperience[] = ['beginner', 'novice', 'intermediate', 'advanced']
const SPLITS = ['upper_lower', 'full_body', 'push_pull_legs'] as const

interface T {
  slots: number
  loaded: number
  onWrongExercise: string[]
  onDeload: number
  onCalibration: number
  onLightReps: string[]
  belowNovice: string[]
  notPlateRounded: string[]
  overCeiling: string[]
  blockVaries: string[]
  loadedByExp: Map<string, number>
  maxSeen: number
}
const t: T = {
  slots: 0, loaded: 0, onWrongExercise: [], onDeload: 0, onCalibration: 0, onLightReps: [],
  belowNovice: [], notPlateRounded: [], overCeiling: [], blockVaries: [],
  loadedByExp: new Map(), maxSeen: 0,
}

for (const equipment_access of EQUIP)
  for (const training_experience of EXP)
    for (const fitness_goal of GOALS)
      for (const workout_split_preference of SPLITS) {
        const weeks = plan(
          { equipment_access, training_experience, fitness_goal, workout_split_preference } as Partial<UserProfile>,
          `ag:${equipment_access}:${training_experience}:${fitness_goal}:${workout_split_preference}`,
        )
        // Per block per lift: the weight must not vary inside a block.
        const perBlock = new Map<string, Set<number>>()

        for (const wk of weeks) for (const day of wk.days) for (const ex of day.exercises) {
          const entry = getExerciseEntry(ex.name)
          if (entry?.accepts_added_load) t.slots++
          const added = ex.suggested_added_load_kg
          if (added == null) continue
          t.loaded++
          t.maxSeen = Math.max(t.maxSeen, added)
          t.loadedByExp.set(training_experience, (t.loadedByExp.get(training_experience) ?? 0) + 1)

          if (!entry?.accepts_added_load) t.onWrongExercise.push(ex.name)
          if (wk.is_deload) t.onDeload++
          if (wk.isCalibrationWeek) t.onCalibration++
          if (training_experience === 'beginner' || training_experience === 'novice') t.belowNovice.push(`${ex.name}@${added}`)
          if (Math.abs(added / 2.5 - Math.round(added / 2.5)) > 1e-9) t.notPlateRounded.push(`${ex.name}@${added}`)
          if (added > 80 * 0.35) t.overCeiling.push(`${ex.name}@${added}`)

          const m = String(ex.reps).match(/^(\d+)\s*-\s*(\d+)$/)
          const mid = m ? (Number(m[1]) + Number(m[2])) / 2 : Number(String(ex.reps)) || 0
          if (mid > 10) t.onLightReps.push(`${ex.name} ${ex.reps}@${added}`)

          const key = `${wk.block_number}|${ex.name}`
          const set = perBlock.get(key) ?? new Set<number>()
          set.add(added); perBlock.set(key, set)
        }
        for (const [key, set] of perBlock) {
          if (set.size > 1) t.blockVaries.push(`${equipment_access}/${training_experience} ${key}: ${[...set].join(', ')}`)
        }
      }

// ---------------------------------------------------------------------------
console.log('\n1. The four lifts finally get weight — and only on the heavy blocks')
// ---------------------------------------------------------------------------
{
  // Stated as a SHARE, not an absolute: this gate's grid is smaller than
  // report:added-load's (no body sweep), and an absolute threshold
  // calibrated against the report's 8,928 slots fails here on 2,252 for no
  // real reason. Both read ~9%, which is the strength/power blocks and
  // nothing else — exactly the scope.
  const share = t.loaded / t.slots
  check(`weight reaches them at all (${t.loaded} of ${t.slots} slots = ${(share * 100).toFixed(1)}%, was 0)`,
    t.loaded > 100 && share > 0.05, `${t.loaded} (${(share * 100).toFixed(1)}%)`)
  check('...and NOT on every slot — the light blocks are still bodyweight',
    t.loaded < t.slots * 0.4, `${t.loaded}/${t.slots}`)
  check(`nothing without accepts_added_load ever gets any (${t.onWrongExercise.length})`,
    t.onWrongExercise.length === 0, [...new Set(t.onWrongExercise)].slice(0, 4).join(', '))
  const flagged = EXERCISE_DATABASE.filter(e => e.accepts_added_load).map(e => e.name)
  check(`exactly four entries accept added load (${flagged.length})`, flagged.length === 4, flagged.join(', '))
}

// ---------------------------------------------------------------------------
console.log('\n2. Never where it would be unsafe or unearned')
// ---------------------------------------------------------------------------
{
  check(`never on a deload week (${t.onDeload})`, t.onDeload === 0, String(t.onDeload))
  check(`never on the calibration week (${t.onCalibration})`, t.onCalibration === 0, String(t.onCalibration))
  check(`never below intermediate (${t.belowNovice.length})`, t.belowNovice.length === 0, t.belowNovice.slice(0, 3).join(', '))
  check(`never on a rep target above 10 (${t.onLightReps.length})`, t.onLightReps.length === 0, t.onLightReps.slice(0, 3).join(', '))
  check(`always plate-rounded (${t.notPlateRounded.length} off-grid)`, t.notPlateRounded.length === 0, t.notPlateRounded.slice(0, 3).join(', '))
  check(`never past 35% of bodyweight (max seen ${t.maxSeen}kg of a 28kg cap)`, t.overCeiling.length === 0, t.overCeiling.slice(0, 3).join(', '))
}

// ---------------------------------------------------------------------------
console.log('\n3. Someone who declined their body is never given more')
// ---------------------------------------------------------------------------
{
  // The item-2b invariant, checked directly rather than trusted to
  // ASSUMED_BODY being 50kg. This is the gate that caught the frozen-week
  // attempt which collapsed an RDL to 6kg, so it is checked on the values
  // themselves, not on the constant behind them.
  const entry = getExerciseEntry('Pull-Ups')!
  const opts = { repRangeLabel: '3-5', phase: 'strength', isDeload: false, isCalibrationWeek: false }
  const declined = prescribeAddedLoad(entry, buildProfile({
    gender: undefined as unknown as UserProfile['gender'], weight_kg: undefined as unknown as number,
  }), opts)
  for (const [label, body] of [
    ['62kg female', { gender: 'female' as const, weight_kg: 62 }],
    ['80kg male', { gender: 'male' as const, weight_kg: 80 }],
    ['110kg male', { gender: 'male' as const, weight_kg: 110 }],
  ] as const) {
    const stated = prescribeAddedLoad(entry, buildProfile(body), opts)
    check(`declined (${declined?.added_kg ?? 0}kg) never exceeds a stated ${label} (${stated?.added_kg ?? 0}kg)`,
      (declined?.added_kg ?? 0) <= (stated?.added_kg ?? 0),
      `${declined?.added_kg} vs ${stated?.added_kg}`)
  }
  check('a declined profile still gets SOMETHING, not silence', (declined?.added_kg ?? 0) > 0, String(declined?.added_kg))
  // The boundary, named because it is the tightest case and ties rather than
  // clears. ASSUMED_BODY is 50kg, so a stated 50kg trainee and a declining
  // one land on the same number — and below 50kg the declining one would get
  // MORE. That is not this function's boundary to move: it is ASSUMED_BODY's,
  // it applies to every load in the app, and load-prescription.ts's own
  // calibration comment records the measured decision NOT to stack a second
  // discount on top of a conservative body. Pinned here so the tie is
  // deliberate rather than discovered later.
  const at50 = prescribeAddedLoad(entry, buildProfile({ gender: 'female', weight_kg: 50 }), opts)
  check(`at ASSUMED_BODY's own 50kg the two tie (${declined?.added_kg}kg vs ${at50?.added_kg}kg)`,
    (declined?.added_kg ?? 0) === (at50?.added_kg ?? -1), `${declined?.added_kg} vs ${at50?.added_kg}`)
}

// ---------------------------------------------------------------------------
console.log('\n4. The weight holds all block — one lever, not two')
// ---------------------------------------------------------------------------
{
  check(`the added weight never changes inside a block (${t.blockVaries.length} blocks vary)`,
    t.blockVaries.length === 0, t.blockVaries.slice(0, 3).join(' | '))
  // And the reps DO move underneath it, or "one lever" would mean none.
  const weeks = plan({ equipment_access: 'full_gym', training_experience: 'advanced' }, 'ag:full_gym:advanced:hypertrophy:upper_lower')
  const loadedWeeks = weeks.filter(wk => wk.days.some(d => d.exercises.some(e => e.suggested_added_load_kg != null)))
  const repsSeen = new Set<string>()
  for (const wk of loadedWeeks) for (const d of wk.days) for (const e of d.exercises) {
    if (e.suggested_added_load_kg != null && e.name === 'Pull-Ups') repsSeen.add(String(e.reps))
  }
  check(`reps still climb under the constant weight (${[...repsSeen].join(', ') || 'none seen'})`,
    repsSeen.size > 1, [...repsSeen].join(', '))
}

// ---------------------------------------------------------------------------
console.log('\n5. It reaches the screen, and never as a bare weight')
// ---------------------------------------------------------------------------
{
  // Putting 15 in suggested_load_kg would render "15kg" beside "Pull-Ups",
  // which reads as LIFT 15kg. The sign is the whole difference.
  const chip = readFileSync(join(ROOT, 'src/components/exercise/AddedLoadChip.tsx'), 'utf8')
  const row = readFileSync(join(ROOT, 'src/components/exercise/ExerciseRow.tsx'), 'utf8')
  const line = readFileSync(join(ROOT, 'src/components/exercise/ExerciseLine.tsx'), 'utf8')
  check('an AddedLoadChip exists', /export function AddedLoadChip/.test(chip))
  check('it says "added", not a bare number', /kg added/.test(chip))
  check('it names what to hang it from', /on top of bodyweight/.test(chip))
  check('the expanded row renders it', /<AddedLoadChip ex=\{ex\}/.test(row))
  check('the collapsed line renders it signed', /\+\$\{ex\.suggested_added_load_kg\}kg/.test(line))

  // And the engine must never smuggle it into the ordinary load field.
  const weeks = plan({ equipment_access: 'full_gym', training_experience: 'advanced' }, 'ag:full_gym:advanced:hypertrophy:upper_lower')
  const smuggled: string[] = []
  for (const wk of weeks) for (const d of wk.days) for (const e of d.exercises) {
    if (e.suggested_added_load_kg != null && e.suggested_load_kg != null) smuggled.push(e.name)
  }
  check(`suggested_load_kg stays null on these lifts (${smuggled.length})`, smuggled.length === 0, smuggled.join(', '))
}

// ---------------------------------------------------------------------------
console.log('\n6. A dip is not a pull-up')
// ---------------------------------------------------------------------------
{
  // Ashley's ruling: take the real step up (a dip IS the stronger movement,
  // and the upright tricep-emphasis version sits between the two) but stay
  // well inside the safety ceiling rather than matching the strength charts
  // outright. Asserted on PRESCRIBED values, not on the constants, so a
  // ceiling quietly clamping one of them shows up as a failure here.
  const opts = { repRangeLabel: '5-7', phase: 'strength', isDeload: false, isCalibrationWeek: false }
  const at = (name: string, body: Partial<UserProfile>) =>
    prescribeAddedLoad(getExerciseEntry(name)!, buildProfile(body), opts)?.added_kg ?? 0

  for (const [label, body] of [
    ['62kg advanced woman', { gender: 'female' as const, weight_kg: 62, training_experience: 'advanced' as const }],
    ['80kg advanced man', { gender: 'male' as const, weight_kg: 80, training_experience: 'advanced' as const }],
    ['110kg advanced man', { gender: 'male' as const, weight_kg: 110, training_experience: 'advanced' as const }],
    ['80kg intermediate man', { gender: 'male' as const, weight_kg: 80, training_experience: 'intermediate' as const }],
  ] as const) {
    const pull = at('Pull-Ups', body), tri = at('Tricep Dips', body), chest = at('Chest Dips', body)
    check(`${label}: chest dip (${chest}) >= upright dip (${tri}) >= pull-up (${pull})`,
      chest >= tri && tri >= pull, `${chest} / ${tri} / ${pull}`)
    check(`${label}: a dip actually beats a pull-up rather than tying`, chest > pull, `${chest} vs ${pull}`)
  }

  // The scale must be ABSENT on pull-ups, not set to 1 — so the change that
  // added dips could not have moved them even by rounding.
  check('pull-ups and chin-ups carry no scale at all',
    getExerciseEntry('Pull-Ups')!.added_load_scale === undefined &&
    getExerciseEntry('Chin-Ups')!.added_load_scale === undefined)
  check('the two dips carry one',
    getExerciseEntry('Chest Dips')!.added_load_scale === 1.4 &&
    getExerciseEntry('Tricep Dips')!.added_load_scale === 1.2,
    `${getExerciseEntry('Chest Dips')!.added_load_scale} / ${getExerciseEntry('Tricep Dips')!.added_load_scale}`)

  // THE REASON THE CHARTS OPTION WAS REJECTED. At 2.0x, a 50kg trainee's
  // chest dip landed on exactly 17.5kg — the 35% cap itself — which is the
  // formula asking for more than we will give. The shipped scale has to leave
  // margin at every body, or the cap is silently doing the prescribing.
  const clamped: string[] = []
  for (const kgBody of [50, 55, 62, 70, 80, 95, 110]) {
    for (const name of ['Pull-Ups', 'Chin-Ups', 'Tricep Dips', 'Chest Dips']) {
      const v = at(name, { gender: 'male', weight_kg: kgBody, training_experience: 'advanced' })
      if (v >= kgBody * 0.35) clamped.push(`${name}@${kgBody}kg -> ${v} (cap ${(kgBody * 0.35).toFixed(1)})`)
    }
  }
  check(`the 35% ceiling never binds — it is a backstop, not the prescriber (${clamped.length})`,
    clamped.length === 0, clamped.slice(0, 3).join(', '))
}

console.log(failures === 0 ? '\nAll added-load checks passed.\n' : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)

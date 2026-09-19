// ---------------------------------------------------------------------------
// Gate: CORRECTIVE WORK IN THE PREP BLOCK IS NOT A SEQUENCING FAULT.
//
// Ashley relayed a second opinion on 18 Sep 2026 ranking "core before the main
// lift" (725 of 9,216 plans) the highest-priority coaching defect, and
// directing an immediate exercise-ordering change. The general rule behind it
// is right — a fatigued trunk before a heavy compound is a bracing problem.
//
// MEASURED FIRST, and it inverted. Reproduced from the exact combination the
// quality report named, the day reads:
//     Arm Circles (warm-up) -> Side Plank -> Pull-Ups
// and Side Plank is `isIndicatedFor` that trainee's flagged lower back. It is
// the app's REHAB slot, placed by a branch whose own comment reads "straight
// after the warm-up, before the working sets: rehab is prep". Low-intensity
// corrective work before the injured area is loaded is correct practice, so
// the plans were right and the MEASUREMENT was wrong — and reordering as
// directed would have pushed corrective work behind the heavy lifting for
// exactly the people who need it in front.
//
// The asymmetry was one rule above: `primer_not_first` has always carried this
// exemption (`allPrimersBefore && isIndicatedFor`). The core rule never got it.
//
// ASHLEY'S RULING, from three options: exempt it IN THE PREP BLOCK ONLY, over
// exempting it anywhere before the main lift and over leaving the score alone.
// Hers because it changes what a metric measures, not because the coaching was
// in doubt.
//
// AND THE RESIDUE, 18 Sep 2026. Exempting the prep block took the rule from 725
// plans to 148, and those 148 were a genuine, different defect: not core, but a
// LOADED CARRY sitting in front of the barbell main lift. Root cause was the
// superset pass, not the selector — the selector's own output was correctly
// sorted tier1 -> tier2 -> tier3, and then the A1/A2 adjacency reorder pulled a
// Farmer's Walk up to sit beside the corrective slot, pushing the bench press
// to fourth. `core` and `carry` are antagonists in the pairing table, and the
// corrective slot is core-patterned and sits at position 2 by design, so every
// injured trainee whose day held a carry got one.
//
// Sections 3-6 hold the fix: A SUPERSET MAY NOT STRADDLE THE DAY'S MAIN LIFT.
// The CSCS basis is in pairCrossesMainLift's own header — the main lift is the
// day's priority by definition, and a loaded carry in front of it spends grip
// and trunk on the exercise that needs them least.
// ---------------------------------------------------------------------------

import { scorePlan } from '../src/lib/quality-score'
import { generateMesocycle, setRandomSource, resetRandomSource, getFlaggedJoints, mainLiftIndexOf, pairCrossesMainLift, buildSupersetPairs } from '../src/lib/exercise-plan'
import fs from 'fs'
import path from 'path'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { getExerciseEntry, isIndicatedFor } from '../src/lib/exercise-db'
import type { UserProfile, MesocycleWeek } from '../src/lib/types'

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}

/** The combination the quality report named, field for field. */
function profileFor(injuries: string[]): UserProfile {
  return {
    age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
    fitness_goal: 'fat_loss', preferred_time: 'morning', bmr: 1800, tdee: 2500,
    equipment_access: 'bodyweight', injuries,
    training_style: 'hybrid', training_experience: 'intermediate',
    session_duration_preference: '90+', workout_split_preference: 'ai_recommendation',
    training_days: [
      { day: 'Monday', available: true }, { day: 'Tuesday', available: true },
      { day: 'Wednesday', available: false }, { day: 'Thursday', available: true },
      { day: 'Friday', available: true }, { day: 'Saturday', available: false },
      { day: 'Sunday', available: false },
    ],
    weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
    exercise_exclusions: [], macro_calculation_mode: 'STANDARD_STATIC',
    coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'love',
  } as unknown as UserProfile
}

const KEY = 'bodyweight|lower_back|90+|hybrid|intermediate|fat_loss|moderate|love'

function build(profile: UserProfile): MesocycleWeek[] {
  setRandomSource(seededRngFromKey(KEY))
  try { return generateMesocycle(profile) } finally { resetRandomSource() }
}

const rulesOf = (r: ReturnType<typeof scorePlan>) =>
  new Set(r.dimensions.structure.deductions.map(d => d.rule))

// ---------------------------------------------------------------------------
console.log('\n[1] The real plan the report flagged')
// ---------------------------------------------------------------------------
const injured = profileFor(['lower_back'])
const meso = build(injured)
const flagged = getFlaggedJoints(injured.injuries ?? [])

// The fixture has to actually CONTAIN the shape, or everything below is
// vacuous — this is a generated subject, so it gets asserted, not assumed.
const week1 = meso.find(w => w.week_number === 1)!
let foundPrepRehab = false
for (const day of week1.days) {
  const mainIdx = day.exercises.findIndex(e => (e as unknown as { tier?: string }).tier === 'tier_1_primary')
  if (mainIdx <= 0) continue
  for (let i = 0; i < mainIdx; i++) {
    const entry = getExerciseEntry(day.exercises[i].name)
    if (entry && entry.movement_pattern === 'core' && isIndicatedFor(entry, flagged)) foundPrepRehab = true
  }
}
check('1a. the plan really does put indicated corrective work before a main lift',
  foundPrepRehab, { note: 'if this fails the rest of the gate proves nothing' })

check('1b. and that is no longer scored as a sequencing fault',
  !rulesOf(scorePlan(injured, meso, KEY, { skipComparisons: true } as never)).has('core_before_main'))

// ---------------------------------------------------------------------------
console.log('\n[2] The exemption is narrow in both directions')
// ---------------------------------------------------------------------------
{
  // SAME plan shape, trainee with NO flagged joint. Nothing is indicated for
  // them, so the identical placement is a real fault and must still fire.
  // This is the check that stops the exemption becoming "core is always fine".
  const healthy = profileFor([])
  const healthyMeso = build(healthy)
  const w1 = healthyMeso.find(w => w.week_number === 1)!
  let planted = false
  for (const day of w1.days) {
    const mainIdx = day.exercises.findIndex(e => (e as unknown as { tier?: string }).tier === 'tier_1_primary')
    if (mainIdx < 1 || planted) continue
    // Put a plain core exercise directly before the main lift.
    day.exercises.splice(mainIdx, 0, { name: 'Plank', sets: 3, reps: '30s', rest: '45s', substitution: '' } as never)
    planted = true
  }
  check('2a. the contrast fixture was actually planted', planted)
  check('2b. core before the main lift still fires for a trainee with no injury',
    rulesOf(scorePlan(healthy, healthyMeso, KEY, { skipComparisons: true } as never)).has('core_before_main'))

  // AND THE PREP-BLOCK HALF. Ashley rejected exempting corrective work
  // anywhere before the main lift, because that stops the app noticing work
  // that drifted into the middle of the heavy lifting. So the same indicated
  // exercise, with a working set in front of it, must still fire.
  const drifted = build(injured)
  const dw1 = drifted.find(w => w.week_number === 1)!
  let moved = false
  for (const day of dw1.days) {
    const mainIdx = day.exercises.findIndex(e => (e as unknown as { tier?: string }).tier === 'tier_1_primary')
    if (mainIdx <= 0 || moved) continue
    const rehabIdx = day.exercises.findIndex((e, i) => {
      const entry = getExerciseEntry(e.name)
      return i < mainIdx && !!entry && entry.movement_pattern === 'core' && isIndicatedFor(entry, flagged)
    })
    if (rehabIdx < 0) continue
    // Slide a real working exercise in FRONT of the corrective work, so the
    // corrective work is no longer in the prep block. Building it this way
    // round matters: my first attempt spliced the rehab exercise out and back
    // in at `mainIdx`, which by then had shifted down one, so it landed AFTER
    // the main lift and correctly did not fire. The fixture was wrong, not the
    // code, and it read exactly like the exemption being too broad.
    const working = day.exercises.findIndex((e, i) => {
      const entry = getExerciseEntry(e.name)
      return i > mainIdx && !!entry && entry.mechanics_tier !== 'primer' && !isIndicatedFor(entry, flagged)
    })
    if (working < 0) continue
    const [w] = day.exercises.splice(working, 1)
    day.exercises.splice(rehabIdx, 0, w)
    moved = true
  }
  check('2c. the drifted fixture was actually built', moved)
  check('2d. corrective work AFTER a working set still fires, as she ruled',
    rulesOf(scorePlan(injured, drifted, KEY, { skipComparisons: true } as never)).has('core_before_main'))
}

// ---------------------------------------------------------------------------
console.log('\n[3] The rule itself')
// ---------------------------------------------------------------------------
{
  // A day whose main lift is at index 2.
  check('3a. a pair entirely in front of the main lift is allowed',
    pairCrossesMainLift(2, 0, 1) === false)
  check('3b. a pair that straddles the main lift is refused',
    pairCrossesMainLift(2, 1, 4) === true)
  check('3c. pairing an earlier slot ONTO the main lift is refused too',
    pairCrossesMainLift(2, 1, 2) === true,
    { why: 'pulling the main lift up to i+1 pairs it, and halves its rest' })
  check('3d. a pair entirely after the main lift is allowed',
    pairCrossesMainLift(2, 3, 5) === false)
  check('3e. the main lift may anchor a pair of its own',
    pairCrossesMainLift(2, 2, 4) === false)
  check('3f. a day with no main lift refuses nothing',
    pairCrossesMainLift(-1, 0, 5) === false,
    { why: 'promotion happens later and already declines to land on a paired movement' })

  const t = (tier: string) => ({ mechanics_tier: tier } as never)
  check('3g. the main lift is the FIRST tier-1 compound',
    mainLiftIndexOf([t('primer'), t('tier3_isolation'), t('tier1_compound'), t('tier1_compound')]) === 2)
  check('3h. -1 when the day holds none',
    mainLiftIndexOf([t('primer'), t('tier2_compound'), t('tier3_isolation')]) === -1)
  check('3i. a name the catalogue cannot resolve does not throw',
    mainLiftIndexOf([undefined, null, t('tier1_compound')]) === 2)
}

// ---------------------------------------------------------------------------
console.log('\n[4] Both pairing passes ask it')
// ---------------------------------------------------------------------------
{
  // PROPERTY, not line numbers: the rule is that the two passes share ONE
  // eligibility gate, so a pair one of them compresses and the other refuses
  // would print a halved rest under no superset at all. Every function that
  // consults isSupersetEligible must therefore also consult the guard. Written
  // this way so a THIRD pairing pass added later fails here rather than
  // silently reintroducing the defect.
  const src = fs.readFileSync(path.join(process.cwd(), 'src/lib/exercise-plan.ts'), 'utf8')
  const noComments = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n')

  // Slice into top-level functions by their own `function name(` headers.
  const heads = [...noComments.matchAll(/^(?:export )?function (\w+)\s*\(/gm)]
  const bodies = heads.map((m, k) => ({
    name: m[1],
    body: noComments.slice(m.index!, k + 1 < heads.length ? heads[k + 1].index! : noComments.length),
  }))
  const consumers = bodies.filter(b => b.name !== 'isSupersetEligible' && b.body.includes('isSupersetEligible('))
  check('4a. the slicer found the pairing passes', consumers.length >= 2, consumers.map(c => c.name))
  const unguarded = consumers.filter(b => !b.body.includes('pairCrossesMainLift('))
  check('4b. every pass that pairs also refuses to straddle the main lift',
    unguarded.length === 0, unguarded.map(b => b.name))

  // The detector must be able to fail. Prove it on a body that pairs and does
  // not guard, rather than trusting that it would have noticed.
  const synthetic = [{ name: 'fakePass', body: 'function fakePass() { if (isSupersetEligible(x)) pair() }' }]
  check('4c. the detector catches an unguarded pass',
    synthetic.filter(b => !b.body.includes('pairCrossesMainLift(')).length === 1)
}

// ---------------------------------------------------------------------------
console.log('\n[5] The real pass, on a constructed day that is under pressure')
// ---------------------------------------------------------------------------
{
  const row = (name: string) => ({ name, sets: 3, reps: '8-10', rest: '60s', substitution: '' } as never)
  // Named off the catalogue so the pass resolves real entries: a warm-up, the
  // corrective core slot, the barbell main lift, a second press, the carry,
  // an isolation tail. This is the exact shape the 148 plans had.
  const day = [
    row('Scapular Push-Ups'),     // primer
    row('Bird Dog'),              // core — the corrective slot
    row('Barbell Bench Press'),   // tier1 — the main lift
    row('Landmine Press'),        // tier2
    row("Farmer's Walk"),         // carry — core's antagonist in the table
    row('Machine Lateral Raise'), // tier3
  ]
  const pool = day.map(r => getExerciseEntry((r as unknown as { name: string }).name)!)
  check('5a. every fixture name resolves in the catalogue', pool.every(Boolean),
    day.map((r, i) => pool[i] ? null : (r as unknown as { name: string }).name).filter(Boolean))

  const trace = { time_cap_adjusted: [], structure_adjusted: [], pool_size_after_each_stage: {} } as never
  const out = buildSupersetPairs(day, pool, '30-45' as never, 'combat' as never, trace)
  const names = out.map(e => e.name)
  const mainAt = names.indexOf('Barbell Bench Press')
  const carryAt = names.indexOf("Farmer's Walk")
  check('5b. the main lift is still in front of the carry', mainAt < carryAt, names)
  check('5c. nothing but the warm-up and the corrective slot precedes it',
    mainAt === 2, names)
  check('5d. the corrective slot was left unpaired',
    !out[1].superset_label, { row: out[1].name, label: out[1].superset_label })

  // THE DETECTOR PROOF. Identical day with the tier-1 swapped for a tier-2, so
  // mainLiftIndexOf returns -1 and the guard cannot apply. If the pull-forward
  // does NOT happen here, 5b/5c are passing because the pass no longer reorders
  // at all, and they prove nothing.
  const noMain = [
    row('Scapular Push-Ups'), row('Bird Dog'), row('Dumbbell Bench Press'),
    row('Landmine Press'), row("Farmer's Walk"), row('Machine Lateral Raise'),
  ]
  const poolB = noMain.map(r => getExerciseEntry((r as unknown as { name: string }).name)!)
  check('5e. the contrast fixture resolves too', poolB.every(Boolean))
  const outB = buildSupersetPairs(noMain, poolB, '30-45' as never, 'combat' as never, trace)
  const namesB = outB.map(e => e.name)
  check('5f. with no main lift to protect, the pass still pulls the partner forward',
    namesB.indexOf("Farmer's Walk") === 2, namesB)
}

// ---------------------------------------------------------------------------
console.log('\n[6] The measured offender, generated end to end')
// ---------------------------------------------------------------------------
{
  // Not a profile that looked tight — the combination the quality report named,
  // seeded with the key the measurement used.
  const CARRY_KEY = 'full_gym|lower_back|30-45|combat|beginner|hypertrophy|low|love'
  const p = {
    ...profileFor(['lower_back']),
    equipment_access: 'full_gym', training_style: 'combat',
    training_experience: 'beginner', fitness_goal: 'hypertrophy',
    session_duration_preference: '30-45', recovery_capacity: 'low',
  } as unknown as UserProfile
  setRandomSource(seededRngFromKey(CARRY_KEY))
  let weeks: MesocycleWeek[]
  try { weeks = generateMesocycle(p) } finally { resetRandomSource() }
  const w1 = weeks.find(w => w.week_number === 1)!

  let daysWithMain = 0
  let carriesBeforeMain = 0
  let sawCarry = false
  for (const day of w1.days) {
    const mainIdx = day.exercises.findIndex(e => (e as unknown as { tier?: string }).tier === 'tier_1_primary')
    if (day.exercises.some(e => getExerciseEntry(e.name)?.movement_pattern === 'carry')) sawCarry = true
    if (mainIdx < 0) continue
    daysWithMain++
    for (let i = 0; i < mainIdx; i++) {
      const entry = getExerciseEntry(day.exercises[i].name)
      if (entry?.movement_pattern === 'carry') carriesBeforeMain++
    }
  }
  // Both halves asserted, or a plan that simply lost its carry would pass.
  check('6a. the generated week still holds a loaded carry', sawCarry)
  check('6b. and a day with a real main lift', daysWithMain > 0)
  check('6c. no carry runs before the main lift', carriesBeforeMain === 0, { carriesBeforeMain })
}

console.log(failures === 0 ? '\nPASS\n' : `\n${failures} FAILED\n`)
if (failures > 0) process.exit(1)

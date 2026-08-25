// ---------------------------------------------------------------------------
// Gate for not telling someone with no weights to add weight.
//
// Root finding: a trainee whose equipment answer was "bodyweight" — no gym,
// no dumbbells — opened a week whose session was Box Squat (Bodyweight),
// Deficit Push-Ups, Table Row and Low Box Step-Up, and was told:
//
//   "...with LOAD CLIMBING WEEK TO WEEK within each block. Loads start
//    deliberately light — FIND THE WEIGHT where the last rep feels like
//    RPE 6, log it..."
//   "BASELINE WEEK — THIS SETS THE WORKING WEIGHT every later week in the
//    block adds load on top of."
//   "DROP THE LOAD if you need to in order to keep the pace."
//
// Every one of those is an instruction about equipment she does not own, on
// a week where not one working set has a weight. Same class as the assumed-
// body work: the app asserting something untrue about her own session.
//
// It compounds a second problem it was supposed to explain. Her reps visibly
// fall across a block (11-13 -> 8-10), and with no weight column to carry
// the story, the only text on screen said the weight was going up.
//
// WHAT WAS AND WASN'T WRONG, because the distinction decided the fix:
//   - The ENGINE is fine. Phase-neutral, 77.2% of bodyweight lifts climb
//     over sixteen weeks and 4.9% genuinely regress; the falling reps are
//     the block's own rep_shift doing its job.
//   - The per-EXERCISE guidance was already right: "Progress by adding reps
//     or slowing the tempo before adding load."
//   - Only the WEEK-level note was wrong, from three separate sources —
//     the phase note, the goal note, and buildProgressionNote.
//
// Also note what was NOT the problem, since I reported it as one before
// checking: BODYWEIGHT_ALLOWED_PHASES already keeps 'strength' and 'power'
// away from a bodyweight trainee, so "Heavier and lower rep" never reached
// her. The loadless variants cover those two phases anyway, so relaxing that
// restriction can't quietly reintroduce the defect.
// ---------------------------------------------------------------------------

import { generateExercisePlan, generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { getGoalPolicy } from '../src/lib/goal-policies'
import { getPhaseConfig } from '../src/lib/periodization'
import { seededRngFromKey } from '../src/lib/seeded-random'
import type { UserProfile, EquipmentAccess, FitnessGoal, TrainingExperience, MesocycleWeek } from '../src/lib/types'
import type { TrainingPhase } from '../src/lib/periodization'

let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

// Phrases that instruct a trainee to do something with a weight. Deliberately
// phrases and not the bare word "load": "loading up on reps" is fine, "add
// load" is not, and a substring match on "load" would fail to tell them apart.
const WEIGHT_INSTRUCTIONS = [
  'add load', 'adds load', 'adding load', 'add weight', 'more weight',
  'find the weight', 'drop the load', 'working weight', 'lighter loads',
  'loads start', 'load climbing', 'load goes up', 'heavier', 'bar speed',
  'on the bar', 'the weight where',
]
const offending = (text: string): string[] => {
  const t = text.toLowerCase()
  return WEIGHT_INSTRUCTIONS.filter(p => t.includes(p))
}

function buildProfile(o: Partial<UserProfile>): UserProfile {
  return {
    age: 32, gender: 'female', height_cm: 165, weight_kg: 62, activity_level: 'moderate',
    fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1400, tdee: 2000,
    equipment_access: 'bodyweight', injuries: [], training_style: 'hybrid',
    training_experience: 'intermediate', session_duration_preference: '45-60',
    workout_split_preference: 'full_body',
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

const GOALS: FitnessGoal[] = ['hypertrophy', 'fat_loss', 'conditioning', 'functional']
const EXP: TrainingExperience[] = ['beginner', 'intermediate', 'advanced']
const SPLITS = ['upper_lower', 'full_body', 'push_pull_legs'] as const

function sweep(equipment_access: EquipmentAccess): { weeks: MesocycleWeek[]; loadedShare: number }[] {
  const out: { weeks: MesocycleWeek[]; loadedShare: number }[] = []
  for (const fitness_goal of GOALS) for (const training_experience of EXP) for (const workout_split_preference of SPLITS) {
    const profile = buildProfile({ equipment_access, fitness_goal, training_experience, workout_split_preference } as Partial<UserProfile>)
    setRandomSource(seededRngFromKey(`ln:${equipment_access}:${fitness_goal}:${training_experience}:${workout_split_preference}`))
    const d = console.debug, w = console.warn
    console.debug = () => {}; console.warn = () => {}
    let weeks: MesocycleWeek[]
    try { weeks = generateMesocycle(profile, generateExercisePlan(profile).plan) }
    finally { console.debug = d; console.warn = w; resetRandomSource() }
    let working = 0, loaded = 0
    for (const wk of weeks) for (const day of wk.days) for (const ex of day.exercises) {
      if (ex.tier === 'tier_0_primer') continue
      working++
      if (ex.suggested_load_kg != null) loaded++
    }
    out.push({ weeks, loadedShare: working === 0 ? 0 : loaded / working })
  }
  return out
}

const bodyweight = sweep('bodyweight')
const fullGym = sweep('full_gym')
const minimalist = sweep('minimalist')

// ---------------------------------------------------------------------------
console.log('\n1. A trainee with no weights is never told to add weight')
// ---------------------------------------------------------------------------
{
  const bad: string[] = []
  let notes = 0
  for (const { weeks } of bodyweight) for (const wk of weeks) {
    notes++
    const hits = offending(wk.coach_note ?? '')
    if (hits.length) bad.push(`w${wk.week_number} "${hits.join('", "')}" in: ${(wk.coach_note ?? '').slice(0, 110)}…`)
  }
  check(`no weight instruction in any bodyweight week note (${bad.length} of ${notes})`,
    bad.length === 0, `\n      ${bad.slice(0, 4).join('\n      ')}`)
  check('...and there are notes to check, so this has teeth', notes > 300, String(notes))
}

// ---------------------------------------------------------------------------
console.log('\n2. Everyone else still gets the load coaching')
// ---------------------------------------------------------------------------
{
  // The over-fire check. The loadless wording must not leak to trainees who
  // DO have weights — for them "add load next week" is the correct
  // instruction and removing it would be the opposite defect.
  const withInstruction = fullGym.flatMap(({ weeks }) => weeks).filter(wk => offending(wk.coach_note ?? '').length > 0).length
  const total = fullGym.flatMap(({ weeks }) => weeks).length
  check(`full-gym weeks still talk about load (${withInstruction} of ${total})`,
    withInstruction > total * 0.5, `${withInstruction}/${total}`)
}

// ---------------------------------------------------------------------------
console.log('\n3. The predicate keys on the plan, not on the equipment answer')
// ---------------------------------------------------------------------------
{
  // A bodyweight-tier plan is NOT entirely weightless — EQUIPMENT_SETS
  // includes 'weighted backpack' at every tier on purpose, since it is the
  // one progressive load available with no gym. So the threshold has to sit
  // between "a couple of backpack lifts" and "half the session is loaded",
  // and this asserts both sides of it are where they were measured.
  const share = (rows: { loadedShare: number }[]) => rows.reduce((a, r) => a + r.loadedShare, 0) / rows.length
  const bw = share(bodyweight), mini = share(minimalist), gym = share(fullGym)
  console.log(`     loaded share of working sets — bodyweight ${(bw * 100).toFixed(1)}%, minimalist ${(mini * 100).toFixed(1)}%, full_gym ${(gym * 100).toFixed(1)}%`)
  check('bodyweight sits below the 25% threshold', bw < 0.25, bw.toFixed(3))
  check('minimalist sits above it, so it keeps the load coaching', mini > 0.25, mini.toFixed(3))
  check('bodyweight is not zero — the backpack lifts are real', bw > 0, bw.toFixed(3))
}

// ---------------------------------------------------------------------------
console.log('\n4. Every phase and every goal has a loadless voice')
// ---------------------------------------------------------------------------
{
  // Structural. tsc already requires the fields; this checks they SAY
  // something safe, including for the two phases a bodyweight trainee cannot
  // currently reach.
  const phases: TrainingPhase[] = ['anatomical_adaptation', 'hypertrophy', 'strength', 'power', 'metabolic']
  for (const p of phases) {
    const hits = offending(getPhaseConfig(p).coach_note_loadless)
    check(`phase "${p}" loadless note is weight-free`, hits.length === 0, hits.join(', '))
  }
  for (const g of GOALS) {
    const hits = offending(getGoalPolicy(g).coachNoteLoadless)
    check(`goal "${g}" loadless note is weight-free`, hits.length === 0, hits.join(', '))
  }
  // And the ordinary notes must still be the load-coaching ones, or the two
  // fields have quietly collapsed into one.
  const differing = phases.filter(p => getPhaseConfig(p).coach_note !== getPhaseConfig(p).coach_note_loadless).length
  check(`the two voices actually differ where they should (${differing} of ${phases.length} phases)`, differing >= 3, String(differing))
}

console.log(failures === 0 ? '\nAll loadless-note checks passed.\n' : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)

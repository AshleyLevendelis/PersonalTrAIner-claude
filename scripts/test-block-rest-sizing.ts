/**
 * Unit tests for sizeBlockToRestBudget (exercise-plan.ts) — the per-block
 * structural fit-check that closes the trim-magnitude bug. Verifies it
 * actually trims when a block's real rest makes a day too big, that it
 * NEVER writes an adjusted rest value back (only structure changes), that
 * required/protected exercises survive, and that a day already within
 * budget is left untouched.
 */
import { sizeBlockToRestBudget, generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { getGoalPolicy, MAIN_LIFT_REST_FLOOR_SECONDS } from '../src/lib/goal-policies'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { EXERCISE_DATABASE } from '../src/lib/exercise-db'
import { isExternallyLoaded } from '../src/lib/load-prescription'
import type {
  WorkoutDay, Exercise, UserProfile, FitnessGoal, TrainingExperience, SessionDuration,
} from '../src/lib/types'

/** A full-gym bodybuilding profile, varied only by the three axes §6 sweeps. */
function restFloorProfile(goal: FitnessGoal, experience: TrainingExperience, duration: SessionDuration): UserProfile {
  return {
    age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
    fitness_goal: goal, preferred_time: 'morning', bmr: 1800, tdee: 2500,
    equipment_access: 'full_gym', injuries: [], training_style: 'bodybuilding',
    training_experience: experience, session_duration_preference: duration,
    workout_split_preference: 'ai_recommendation',
    training_days: [
      { day: 'Monday', available: true }, { day: 'Tuesday', available: true },
      { day: 'Wednesday', available: false }, { day: 'Thursday', available: true },
      { day: 'Friday', available: true }, { day: 'Saturday', available: false },
      { day: 'Sunday', available: false },
    ],
    weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [], exercise_exclusions: [],
    macro_calculation_mode: 'STANDARD_STATIC', coaching_persona: 'supportive',
    recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
  } as UserProfile
}

let failures = 0
function check(label: string, condition: boolean, extra?: unknown) {
  if (condition) {
    console.log(`  ok: ${label}`)
  } else {
    failures++
    console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`)
  }
}

function ex(name: string, sets: number, rest: string, reps = '8-10'): Exercise {
  return { name, sets, reps, rest, substitution: '' }
}

// A 7-exercise day, deliberately oversized — mirrors the live-traced worst
// combo's shape (main lift + 5 accessory/isolation + a primer).
function bigDay(): WorkoutDay {
  return {
    day: 'Monday',
    focus: 'Push & Press',
    exercises: [
      ex('Prone Y-T Raises', 2, '20s'),
      ex('Barbell Bench Press', 3, '90s'),
      ex('Dumbbell Shoulder Press', 3, '75s'),
      ex('Cable Lateral Raises', 3, '60s'),
      ex('Overhead Tricep Extension', 3, '60s'),
      ex('Cable Woodchops', 3, '60s'),
      ex('Pec Deck Machine', 3, '75s'),
    ],
  }
}

const DAY_BUDGET_SECONDS = 45 * 60 // ~a 45-60min session's working-set budget

function main() {
  console.log('[1] a day within budget at real rest is untouched')
  const fine = sizeBlockToRestBudget([bigDay()], -15, DAY_BUDGET_SECONDS * 3, new Set(), getGoalPolicy('hypertrophy'), [])
  check('exercise count unchanged', fine[0].exercises.length === bigDay().exercises.length)
  check('no block_size_note when nothing was removed', fine[0].block_size_note === undefined)
  check('sets unchanged', JSON.stringify(fine[0].exercises.map(e => e.sets)) === JSON.stringify(bigDay().exercises.map(e => e.sets)))

  console.log('[2] moderate overage trims sets before removing anything')
  const trimLog1: any[] = []
  const trimmed = sizeBlockToRestBudget([bigDay()], 45, DAY_BUDGET_SECONDS, new Set(), getGoalPolicy('hypertrophy'), trimLog1)
  const originalCount = bigDay().exercises.length
  check('set-trim events were logged', trimLog1.some(e => e.reason.includes('sets trimmed')), trimLog1)

  console.log('[3] rest values are NEVER mutated — only structure changes')
  const before = bigDay()
  const after = trimmed[0]
  for (const origEx of before.exercises) {
    const survived = after.exercises.find(e => e.name === origEx.name)
    if (survived) {
      check(`"${origEx.name}" rest unchanged (${origEx.rest})`, survived.rest === origEx.rest, survived.rest)
    }
  }

  console.log('[4] a severe overage removes whole exercises, protected names survive')
  const protectedNames = new Set(['Barbell Bench Press'])
  const trimLog2: any[] = []
  const severe = sizeBlockToRestBudget([bigDay()], 200, DAY_BUDGET_SECONDS, protectedNames, getGoalPolicy('hypertrophy'), trimLog2)
  check('exercise count dropped', severe[0].exercises.length < originalCount, severe[0].exercises.length)
  check('protected main lift survived', severe[0].exercises.some(e => e.name === 'Barbell Bench Press'))
  check('block_size_note set when an exercise was actually removed', severe[0].block_size_note === 'Fewer exercises this block — heavier lifts need longer rest between sets.')
  check('a structure-stage trimLog entry exists for the removal', trimLog2.some(e => e.stage === 'structure'), trimLog2)
  check('never trims below 3 exercises', severe[0].exercises.length >= 3, severe[0].exercises.length)

  console.log('[5] cardio-tier exercises are never touched by this pass')
  const cardioDay: WorkoutDay = {
    day: 'Thursday', focus: 'Conditioning & Core',
    exercises: [ex('Barbell Squats', 3, '90s'), ex('Cycling Intervals', 6, '45s', '45s')],
  }
  const cardioResult = sizeBlockToRestBudget([cardioDay], 200, 1, new Set(), getGoalPolicy('hypertrophy'), []) // budget=1s forces max trimming
  const cardioSurvivor = cardioResult[0].exercises.find(e => e.name === 'Cycling Intervals')
  check('cardio exercise survives even under an impossible budget', !!cardioSurvivor)
  check('cardio sets unchanged', cardioSurvivor?.sets === 6, cardioSurvivor?.sets)

  console.log('[6] two minutes on a loaded main lift — Ashley, 2 Sep 2026')
  // HER RULING IS PINNED BY NAME, not derived from the configs. This is the
  // lesson from the metabolic rep floor earlier the same day: a check that
  // reads its expected value out of the config it is checking deletes itself
  // when the config changes, and stays green while doing it. A change to
  // either number below is a change to a decision Ashley made, and has to be
  // made here on purpose.
  check('hypertrophy: loaded main lifts rest at least 2 minutes',
    getGoalPolicy('hypertrophy').minLoadedMainLiftRestSeconds === 120,
    getGoalPolicy('hypertrophy').minLoadedMainLiftRestSeconds)
  check('fat loss: the same',
    getGoalPolicy('fat_loss').minLoadedMainLiftRestSeconds === 120,
    getGoalPolicy('fat_loss').minLoadedMainLiftRestSeconds)
  check('functional: the same',
    getGoalPolicy('functional').minLoadedMainLiftRestSeconds === 120,
    getGoalPolicy('functional').minLoadedMainLiftRestSeconds)
  // The exception, and the reason it exists: "the session still conditions,
  // the part with a bar on your back does not". She kept it when choosing the
  // two-minute floor for everything else.
  check('conditioning keeps the 90s her earlier ruling set',
    getGoalPolicy('conditioning').minLoadedMainLiftRestSeconds === 90,
    getGoalPolicy('conditioning').minLoadedMainLiftRestSeconds)

  // AND THE FLOOR HAS TO HOLD IN A REAL PLAN, which is the half that bites.
  // The first version of this check squeezed sizeBlockToRestBudget with an
  // impossible budget and asserted the rest came down — it does not: that
  // function removes exercises and leaves a main lift's rest alone, so the
  // check was testing the wrong subject and its conditioning case failed for
  // a reason that had nothing to do with the floor. Rewritten to assert the
  // OUTCOME across generated plans, where the floor is actually applied
  // (selection-time prescription, the budget trim, and the post-trim anchor
  // pass all have to agree for this to pass).
  {
    const byName = new Map(EXERCISE_DATABASE.map(e => [e.name, e]))
    const realLog = console.log, realDebug = console.debug
    let checked = 0, below = 0
    let lowest: { goal: string; name: string; rest: number; floor: number } | null = null
    for (const goal of ['hypertrophy', 'fat_loss', 'conditioning', 'functional'] as FitnessGoal[]) {
      const floor = Math.max(MAIN_LIFT_REST_FLOOR_SECONDS, getGoalPolicy(goal).minLoadedMainLiftRestSeconds ?? MAIN_LIFT_REST_FLOOR_SECONDS)
      for (const experience of ['beginner', 'novice', 'intermediate', 'advanced'] as TrainingExperience[]) {
        for (const duration of ['30-45', '45-60', '60-90'] as SessionDuration[]) {
          setRandomSource(seededRngFromKey(`${goal}|${experience}|${duration}`))
          console.log = () => {}; console.debug = () => {}
          let meso
          try { meso = generateMesocycle(restFloorProfile(goal, experience, duration)) }
          finally { console.log = realLog; console.debug = realDebug }
          resetRandomSource()
          for (const week of meso) for (const day of week.days) for (const e of day.exercises) {
            if (e.tier !== 'tier_1_primary') continue
            const entry = byName.get(e.name)
            if (!entry || !isExternallyLoaded(entry)) continue
            const rest = parseInt(String(e.rest), 10)
            if (!Number.isFinite(rest)) continue
            checked++
            if (rest < floor) {
              below++
              if (!lowest || rest < lowest.rest) lowest = { goal, name: e.name, rest, floor }
            }
          }
        }
      }
    }
    check('the sweep found loaded main lifts to check (sanity check on this check)', checked > 1000, checked)
    check('every loaded main lift in a generated plan rests at least its goal floor', below === 0, lowest ?? below)
  }

  console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} failure(s)`)
  process.exit(failures === 0 ? 0 : 1)
}

main()

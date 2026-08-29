// ---------------------------------------------------------------------------
// How often does an injured trainee actually RECEIVE the rehab work the
// database has marked for their joint?
//
// `indicated_joints` is documented in exercise-db.ts as "the prep/rehab work a
// physio would prescribe FOR that joint... the plan should deliberately
// include them when the matching injury is present." Nothing implements that
// sentence: isIndicatedFor is read only by isContraindicatedFor (to keep rehab
// ELIGIBLE) and by one label-writing line. So any rehab that reaches a plan
// today arrives by luck.
//
// This measures the luck, per joint, before the fix — and is the same script
// that measures after, so the two numbers are comparable by construction
// rather than by my remembering to hold the sweep constant.
//
// The two joints are expected to differ sharply and it matters why: knee-rehab
// movements are ALSO some of the only leg work that survives a knee injury, so
// a knee-injured trainee may already meet them often. Shoulder-rehab movements
// are warm-up-tier and compete with every other primer, so they may almost
// never appear. One headline number across both joints would hide that.
// ---------------------------------------------------------------------------

import { generateExercisePlan, setRandomSource, resetRandomSource, getFlaggedJoints } from '../src/lib/exercise-plan'
import { getExerciseEntry, isIndicatedFor } from '../src/lib/exercise-db'
import { seededRngFromKey } from '../src/lib/seeded-random'
import type { UserProfile, WorkoutDay } from '../src/lib/types'

function buildProfile(o: Partial<UserProfile>): UserProfile {
  return {
    age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
    fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1800, tdee: 2500,
    equipment_access: 'full_gym', injuries: [], training_style: 'hybrid',
    training_experience: 'intermediate', session_duration_preference: '45-60',
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

function gen(profile: UserProfile, seed: string): WorkoutDay[] {
  setRandomSource(seededRngFromKey(seed))
  const d = console.debug, w = console.warn
  console.debug = () => {}; console.warn = () => {}
  try { return generateExercisePlan(profile).plan } finally { console.debug = d; console.warn = w; resetRandomSource() }
}

const SPLITS = ['upper_lower', 'push_pull_legs', 'full_body', 'ai_recommendation'] as const
const STYLES = ['hybrid', 'bodybuilding', 'functional'] as const
const EQUIP = ['full_gym', 'home_gym', 'minimalist', 'bodyweight'] as const
const DURATIONS = ['30-45', '45-60', '60-90'] as const

interface Row {
  days: number
  daysWithRehab: number
  plansWithNoRehabAtAll: number
  plans: number
  byName: Map<string, number>
}

/**
 * Same sweep, but for an UNINJURED profile, counting movements indicated for
 * any joint at all. Split from sweep() rather than parameterised into it
 * because the two answer different questions and conflating them is how the
 * old control came to be reassuring about nothing.
 */
function sweepAnyJoint(joints: Set<string>): Row {
  const row: Row = { days: 0, daysWithRehab: 0, plansWithNoRehabAtAll: 0, plans: 0, byName: new Map() }
  for (const split of SPLITS) {
    for (const style of STYLES) {
      for (const equipment_access of EQUIP) {
        for (const session_duration_preference of DURATIONS) {
          const profile = buildProfile({
            injuries: [], workout_split_preference: split, training_style: style,
            equipment_access, session_duration_preference,
          })
          const plan = gen(profile, `none:${split}:${style}:${equipment_access}:${session_duration_preference}`)
          row.plans++
          let planHadAny = false
          for (const day of plan) {
            if (day.exercises.length === 0) continue
            row.days++
            const hits = day.exercises.filter(ex => {
              const e = getExerciseEntry(ex.name)
              return !!e && isIndicatedFor(e, joints)
            })
            if (hits.length === 0) continue
            row.daysWithRehab++
            planHadAny = true
            for (const h of hits) row.byName.set(h.name, (row.byName.get(h.name) ?? 0) + 1)
          }
          if (!planHadAny) row.plansWithNoRehabAtAll++
        }
      }
    }
  }
  return row
}

function sweep(injury: string): Row {
  const flagged = getFlaggedJoints([injury])
  const row: Row = { days: 0, daysWithRehab: 0, plansWithNoRehabAtAll: 0, plans: 0, byName: new Map() }
  for (const split of SPLITS) {
    for (const style of STYLES) {
      for (const equipment_access of EQUIP) {
        for (const session_duration_preference of DURATIONS) {
          const profile = buildProfile({
            injuries: [injury], workout_split_preference: split, training_style: style,
            equipment_access, session_duration_preference,
          })
          const plan = gen(profile, `rehab:${injury}:${split}:${style}:${equipment_access}:${session_duration_preference}`)
          row.plans++
          let planHadAny = false
          for (const day of plan) {
            if (day.exercises.length === 0) continue
            row.days++
            const hits = day.exercises.filter(ex => {
              const e = getExerciseEntry(ex.name)
              return !!e && isIndicatedFor(e, flagged)
            })
            if (hits.length === 0) continue
            row.daysWithRehab++
            planHadAny = true
            for (const h of hits) row.byName.set(h.name, (row.byName.get(h.name) ?? 0) + 1)
          }
          if (!planHadAny) row.plansWithNoRehabAtAll++
        }
      }
    }
  }
  return row
}

function report(label: string, row: Row) {
  const pct = row.days === 0 ? 0 : (row.daysWithRehab / row.days) * 100
  console.log(`\n${label}`)
  console.log(`  training days carrying at least one indicated movement: ${row.daysWithRehab}/${row.days} (${pct.toFixed(1)}%)`)
  console.log(`  whole plans containing NONE at all:                     ${row.plansWithNoRehabAtAll}/${row.plans}`)
  const top = [...row.byName].sort((a, b) => b[1] - a[1])
  console.log(`  which movements arrived: ${top.length === 0 ? '(none)' : top.map(([n, c]) => `${n}=${c}`).join(', ')}`)
}

console.log('Rehab coverage for an injured trainee — how often the marked work actually arrives.')
console.log(`Sweep: ${SPLITS.length} splits x ${STYLES.length} styles x ${EQUIP.length} equipment tiers x ${DURATIONS.length} session lengths.`)

report('SHOULDER injury (9 movements marked: 7 warm-up tier, 2 isolation)', sweep('shoulders'))
report('KNEE injury (10 movements marked: 0 warm-up tier, 7 isolation, 3 compound)', sweep('knees'))

// Added when hips and the lower back got rehab of their own. They read 0/0
// BEFORE that work and are the headline it has to move — kept in the same
// script as the two that already worked so all four numbers come off one
// sweep, rather than from a second tool that could drift from this one.
report('HIP injury (4 marked: 3 activation primers written for this, plus Bird Dog)', sweep('hips'))
report('LOWER BACK injury (3 marked, all tier3: Dead Bug, Side Plank, Bird Dog)', sweep('lower_back'))

// Added when ankles, wrists and elbows got rehab of their own (Ashley's scope
// ruling: those three, not the neck). All three read 0/576 BEFORE that work,
// with 144/144 plans containing none, and they are the headline it has to
// move. Kept in the same script as the four that already worked so all seven
// numbers come off one sweep rather than a second tool that could drift.
report('ANKLE injury (3 marked: Ankle Alphabet, Banded Dorsiflexion, Single-Leg Balance)', sweep('ankles'))
report('WRIST injury (5 marked: circles, banded flexion/extension, grip squeeze, eccentric extension)', sweep('wrists'))
report('ELBOW injury (3 marked: grip squeeze, eccentric wrist extension, pronation-supination)', sweep('elbows'))

// THE SCOPE LINE, MEASURED RATHER THAN STATED. The neck deliberately gets no
// prescribed work — "my neck bothers me" spans a stiff desk neck to a nerve
// problem that should not be loaded, and the app cannot tell which. Printing
// its zero here is what stops that decision quietly eroding: if a later
// change starts prescribing neck work, this line moves off 0 and says so.
report('NECK injury (0 marked, deliberately — Ashley ruled the neck out of scope)', sweep('neck'))

// THE OVER-FIRE CONTROL, REWRITTEN — the previous one could not fail, and I
// quoted its zero as evidence that the rehab slot "does not over-fire".
//
// It ran sweep('__no_such_injury__'), which resolves to an EMPTY flagged-joint
// set, and then counted movements indicated FOR THE FLAGGED JOINTS. With no
// flagged joints nothing can match, so it read 0 whatever the plans contained
// — including if the rehab slot had been firing on every single day. A
// tautology printed as a measurement.
//
// What is actually true, and for a better reason than that sweep: the slot
// cannot fire, because pickRehabMovement returns null on an empty joint set
// before it looks at anything (exercise-plan.ts). test:rehab-prescribed
// asserts that early return directly, where it can be broken and caught.
//
// What this prints now is the number that DOES vary and is worth watching:
// how often an uninjured trainee meets one of these movements anyway, through
// ordinary primer and accessory slots. That is by design — they are ordinary
// movements that happen to carry a joint tag — so the figure is context, not
// a pass mark. If it ever reached the injured rate of 100%, the guarantee
// would be meaningless because everyone would already have it.
//
// PER JOINT, not "any joint". The guarantee is that a knee-injured trainee
// meets a KNEE movement every day — so the honest comparison is what an
// uninjured trainee gets for that same joint, not for any of the four. The
// any-joint figure runs at 88%, which would have made the guarantee look
// worth almost nothing; it is an artefact of pooling four joints.
console.log(`\nCONTROL — uninjured trainee. No rehab slot fires: pickRehabMovement returns null on an`)
console.log(`empty joint set before it looks at anything. What follows is what they meet ANYWAY,`)
console.log(`through ordinary primer and accessory slots — by design, and the gap to 100% is what`)
console.log(`the guarantee is actually buying an injured trainee.\n`)
for (const [label, joint] of [['shoulder', 'shoulder'], ['knee', 'knee'], ['hip', 'hip'], ['lower back', 'lower_back_axial']] as const) {
  const r = sweepAnyJoint(new Set([joint]))
  const pct = 100 * r.daysWithRehab / r.days
  console.log(`  ${label.padEnd(11)} uninjured ${String(r.daysWithRehab).padStart(3)}/${r.days} days (${pct.toFixed(1).padStart(5)}%)   injured 100%   guarantee adds ${(100 - pct).toFixed(1)} points`)
}

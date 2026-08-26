// ---------------------------------------------------------------------------
// Gate for tempo being a real prescription rather than a sentence about one.
//
// Root sequence: 84.7% of bodyweight lifts end a sixteen-week plan on fewer
// reps than they started. The engine is fine — phase-neutral, 77.2% climb —
// but a bodyweight lift has no weight column to carry that story, so the
// number just goes down. Commit 074ad9d fixed the WORDS, and its loadless
// coach note says "the difficulty comes from how you move: about three
// seconds lowering, a pause at the bottom".
//
// That sentence was the only place tempo existed. No field, nothing
// prescribed, nothing tracked, nothing progressed. A promise with no
// delivery — the same shape as update_workout_schedule and the Muay Thai
// swap, and worth fixing precisely because we had just made the promise.
//
// FOUR THINGS THIS PROTECTS, in rough order of how easy each is to break:
//
//   1. Pull-ups and dips are EXCLUDED. Ashley's call, and the right one: a
//      chin-up takes a belt or a loaded backpack, so "there is no weight to
//      add" is simply false for it. Showing no weight on a chin-up is a gap
//      in this app, and a slow eccentric would paper over it rather than
//      close it. accepts_added_load carries this; the real fix (prescribing
//      the added load) is its own round.
//   2. The duration model can SEE it. SECONDS_PER_REP is 3.5 and already
//      assumes a controlled rep, so a 4-1-1 set is 6s — 71% more working
//      time. A tempo the estimator cannot see is exactly what let a
//      steady-state block be costed at 30s instead of twenty minutes.
//   3. Unit sanity. A hold ('30-45s'), a carry ('40m') and an interval have
//      no reps to slow down. Same class of error as using a rep floor as a
//      seconds floor.
//   4. One lever at a time. Tempo is set by the BLOCK and constant within
//      it; reps stay the within-block lever, exactly as loadStepUnaffordable
//      holds load and ramps reps rather than moving both.
// ---------------------------------------------------------------------------

import { generateExercisePlan, generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { getExerciseEntry } from '../src/lib/exercise-db'
import { isImprovisedLoadImplement, IMPROVISED_IMPLEMENT_CEILING_KG } from '../src/lib/load-prescription'
import { getPhaseTempo, formatTempo, parseTempo, describeTempo, tempoSecondsPerRep } from '../src/lib/periodization'
import { estimateSlotsSeconds } from '../src/lib/session-duration'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { UserProfile, EquipmentAccess, FitnessGoal, TrainingExperience } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
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

const EQUIP: EquipmentAccess[] = ['bodyweight', 'minimalist', 'home_gym', 'full_gym']
const GOALS: FitnessGoal[] = ['hypertrophy', 'fat_loss', 'conditioning', 'functional']
const EXP: TrainingExperience[] = ['beginner', 'intermediate', 'advanced']
const SPLITS = ['upper_lower', 'full_body', 'push_pull_legs'] as const

interface T {
  working: number
  tempoed: number
  loadedWithTempo: number
  cappedBackpackWithTempo: number
  cappedBackpackNoTempo: number
  underCapWithTempo: string[]
  primerWithTempo: number
  nonRepWithTempo: number
  deloadWithTempo: number
  addedLoadWithTempo: string[]
  phaseMismatch: string[]
  blockInconsistent: string[]
  unparseable: string[]
}
const t: T = {
  working: 0, tempoed: 0, loadedWithTempo: 0, cappedBackpackWithTempo: 0, cappedBackpackNoTempo: 0, underCapWithTempo: [],
  primerWithTempo: 0, nonRepWithTempo: 0,
  deloadWithTempo: 0, addedLoadWithTempo: [], phaseMismatch: [], blockInconsistent: [], unparseable: [],
}
const byEquip = new Map<string, { working: number; tempoed: number }>()

for (const equipment_access of EQUIP) {
  byEquip.set(equipment_access, { working: 0, tempoed: 0 })
  for (const fitness_goal of GOALS) for (const training_experience of EXP) for (const workout_split_preference of SPLITS) {
    const profile = buildProfile({ equipment_access, fitness_goal, training_experience, workout_split_preference } as Partial<UserProfile>)
    setRandomSource(seededRngFromKey(`tg:${equipment_access}:${fitness_goal}:${training_experience}:${workout_split_preference}`))
    const d = console.debug, w = console.warn
    console.debug = () => {}; console.warn = () => {}
    let weeks
    try { weeks = generateMesocycle(profile, generateExercisePlan(profile).plan) }
    finally { console.debug = d; console.warn = w; resetRandomSource() }

    // Tempo must be constant within a block — it is the BLOCK's lever.
    const perBlock = new Map<number, Set<string>>()

    for (const wk of weeks) {
      const expected = wk.phase_label
      for (const day of wk.days) for (const ex of day.exercises) {
        const row = byEquip.get(equipment_access)!
        if (ex.tier !== 'tier_0_primer') { t.working++; row.working++ }
        if (!ex.tempo) continue
        t.tempoed++; row.tempoed++

        if (!parseTempo(ex.tempo)) t.unparseable.push(`${ex.name} "${ex.tempo}"`)
        if (ex.suggested_load_kg != null) {
          // A loaded lift with a tempo is a DEFECT unless it is an improvised
          // implement sitting at its physical ceiling — a weighted backpack
          // with nothing left to add. Counted apart rather than exempted, so
          // the original "no tempo on a lift that already shows a weight"
          // property keeps its teeth for every other lift.
          const e = getExerciseEntry(ex.name)
          const cap = IMPROVISED_IMPLEMENT_CEILING_KG[training_experience]
          if (e && isImprovisedLoadImplement(e)) {
            if (ex.suggested_load_kg >= cap) t.cappedBackpackWithTempo++
            // Still has weight left to add and yet is being slowed down —
            // the over-fire this round must not commit.
            else t.underCapWithTempo.push(`${equipment_access}/${training_experience} ${ex.name} wk${wk.week_number} ${ex.suggested_load_kg}kg of ${cap}kg`)
          } else t.loadedWithTempo++
        }
        if (ex.tier === 'tier_0_primer') t.primerWithTempo++
        if (wk.is_deload) t.deloadWithTempo++

        const entry = getExerciseEntry(ex.name)
        if (entry) {
          if (entry.prescription_type !== 'reps') t.nonRepWithTempo++
          if (entry.accepts_added_load) t.addedLoadWithTempo.push(`${equipment_access} ${ex.name}`)
        }
        if (!/^\d+(\s*-\s*\d+)?$/.test(String(ex.reps).trim())) t.nonRepWithTempo++

        const blockKey = wk.block_number ?? 0
        const set = perBlock.get(blockKey) ?? new Set<string>()
        set.add(ex.tempo); perBlock.set(blockKey, set)
        void expected
      }
    }
    for (const [blk, set] of perBlock) {
      if (set.size > 1) t.blockInconsistent.push(`${equipment_access}/${fitness_goal} block ${blk}: ${[...set].join(', ')}`)
    }
  }
}

// ---------------------------------------------------------------------------
console.log('\n1. Tempo reaches the lifts that have no other lever')
// ---------------------------------------------------------------------------
{
  check(`weightless rep lifts carry a tempo (${t.tempoed} of ${t.working} working sets)`, t.tempoed > 5000, String(t.tempoed))
  for (const eq of EQUIP) {
    const r = byEquip.get(eq)!
    console.log(`     ${eq.padEnd(11)} ${r.tempoed}/${r.working} (${((r.tempoed / r.working) * 100).toFixed(1)}%)`)
  }
  const bw = byEquip.get('bodyweight')!, gym = byEquip.get('full_gym')!
  check('a no-equipment trainee gets it far more than a full-gym one',
    bw.tempoed / bw.working > 2 * (gym.tempoed / gym.working),
    `${(bw.tempoed / bw.working).toFixed(3)} vs ${(gym.tempoed / gym.working).toFixed(3)}`)
  check('every stored tempo parses', t.unparseable.length === 0, t.unparseable.slice(0, 3).join('; '))
}

// ---------------------------------------------------------------------------
console.log('\n2. It never reaches a lift that could take real weight')
// ---------------------------------------------------------------------------
{
  // Ashley's ruling. A chin-up or a dip takes a belt or a loaded backpack, so
  // "nothing to add" is false there and tempo would hide a gap rather than
  // close it.
  check(`no tempo on a pull-up, chin-up or dip (${t.addedLoadWithTempo.length})`,
    t.addedLoadWithTempo.length === 0, t.addedLoadWithTempo.slice(0, 4).join(', '))
  check(`no tempo on a lift that already shows a weight (${t.loadedWithTempo})`, t.loadedWithTempo === 0, String(t.loadedWithTempo))
  // ...EXCEPT a backpack with nothing left to add, which is the point of this
  // round. MEASURED before it existed: Backpack Row was 91 of 217 repeated
  // week-to-week transitions, the largest single contributor in the app.
  check(`a backpack AT its ceiling does get one (${t.cappedBackpackWithTempo})`,
    t.cappedBackpackWithTempo > 0, String(t.cappedBackpackWithTempo))
  // The over-fire check, and the one that keeps this honest: a backpack still
  // climbing must NOT be slowed down. Tempo is what you reach for when the
  // weight has stopped, not instead of adding weight that is still available.
  check(`a backpack BELOW its ceiling gets none (${t.underCapWithTempo.length})`,
    t.underCapWithTempo.length === 0, t.underCapWithTempo.slice(0, 3).join(' | '))
  // And the flag has to actually be set on something, or check one is vacuous.
  const flagged = ['Pull-Ups', 'Chin-Ups', 'Chest Dips', 'Tricep Dips'].filter(n => getExerciseEntry(n)?.accepts_added_load)
  check(`accepts_added_load is set on the four that take a belt (${flagged.length}/4)`, flagged.length === 4, flagged.join(', '))
}

// ---------------------------------------------------------------------------
console.log('\n3. Units, primers and deloads')
// ---------------------------------------------------------------------------
{
  check(`no tempo on a hold, carry or interval (${t.nonRepWithTempo})`, t.nonRepWithTempo === 0, String(t.nonRepWithTempo))
  check(`no tempo on a primer (${t.primerWithTempo})`, t.primerWithTempo === 0, String(t.primerWithTempo))
  check(`no tempo on a deload week (${t.deloadWithTempo})`, t.deloadWithTempo === 0, String(t.deloadWithTempo))
}

// ---------------------------------------------------------------------------
console.log('\n4. One lever at a time — tempo is the block\'s, reps are the week\'s')
// ---------------------------------------------------------------------------
{
  check(`tempo is constant within a block (${t.blockInconsistent.length} blocks vary)`,
    t.blockInconsistent.length === 0, t.blockInconsistent.slice(0, 3).join(' | '))
  // Power and metabolic get none on purpose — explosive intent and short-rest
  // density both fight a long time-under-tension set.
  check('power has no tempo', getPhaseTempo('power') === null)
  check('metabolic has no tempo', getPhaseTempo('metabolic') === null)
  const aa = getPhaseTempo('anatomical_adaptation')!, hyp = getPhaseTempo('hypertrophy')!, str = getPhaseTempo('strength')!
  check('the three that do have one get progressively slower',
    tempoSecondsPerRep(aa) < tempoSecondsPerRep(hyp) && tempoSecondsPerRep(hyp) < tempoSecondsPerRep(str),
    `${formatTempo(aa)} / ${formatTempo(hyp)} / ${formatTempo(str)}`)
}

// ---------------------------------------------------------------------------
console.log('\n5. The duration model can see it')
// ---------------------------------------------------------------------------
{
  // The one that would cost a shipped session its budget. Same slot, same
  // reps, tempo only — the estimate MUST move.
  const entry = getExerciseEntry('Air Squat')!
  const base = estimateSlotsSeconds([{ entry, sets: 3, reps: '10-12', restSeconds: 60 }])
  const slow = estimateSlotsSeconds([{ entry, sets: 3, reps: '10-12', restSeconds: 60, tempo: '4-1-1' }])
  check(`a 4-1-1 set costs more than an untempoed one (${base}s → ${slow}s)`, slow > base, `${base} vs ${slow}`)
  const fast = estimateSlotsSeconds([{ entry, sets: 3, reps: '10-12', restSeconds: 60, tempo: '2-0-1' }])
  check(`a 2-0-1 set costs less than the 3.5s/rep default (${base}s → ${fast}s)`, fast < base, `${base} vs ${fast}`)
  // Exact arithmetic, so a change to SECONDS_PER_REP or the tempo maths has
  // to be deliberate rather than absorbed.
  const expected = slow - base
  check(`the delta matches (11 reps avg x (6 - 3.5)s x 3 sets = ${(11 * 2.5 * 3).toFixed(0)}s)`,
    Math.abs(expected - 11 * 2.5 * 3) < 0.01, String(expected))
}

// ---------------------------------------------------------------------------
console.log('\n6. It reaches the screen, in English')
// ---------------------------------------------------------------------------
{
  // A field the engine writes and no client reads is the
  // update_workout_schedule defect wearing different clothes.
  const line = readFileSync(join(ROOT, 'src/components/exercise/ExerciseLine.tsx'), 'utf8')
  const chip = readFileSync(join(ROOT, 'src/components/exercise/LoadChip.tsx'), 'utf8')
  const row = readFileSync(join(ROOT, 'src/components/exercise/ExerciseRow.tsx'), 'utf8')
  check('the collapsed line renders it', /describeTempo\(ex\.tempo\)/.test(line))
  check('a TempoChip exists', /export function TempoChip/.test(chip))
  check('the expanded row renders that chip', /<TempoChip tempo=\{ex\.tempo\}/.test(row))
  check('"4-1-1" is never shown raw — it is described',
    describeTempo('4-1-1') === '4s down · 1s pause · drive up', String(describeTempo('4-1-1')))
  check('an absent tempo describes to nothing, not "undefined"', describeTempo(undefined) === null)
}

console.log(failures === 0 ? '\nAll tempo-prescription checks passed.\n' : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)

/**
 * Gate: every prescribed number the app holds reaches the coach.
 *
 * WHY THIS EXISTS AND WHY IT IS A SWEEP. `f516748` fixed "the coach doesn't
 * have my prescribed weights" by sending `suggested_load`. A review found the
 * SAME omission still live in four more fields, and the gate that shipped with
 * that commit could not see any of them: its only check of the invariant was
 * `loadClauseForCoach({ name: 'Arm Circles' }) === ''` — one hand-built object
 * with no load fields at all, which is not a shape the generator produces.
 *
 * The worst of the four: `Pull-Ups (Assisted)` with `suggested_assistance_kg:
 * 35` reached the coach as " @ Bodyweight" — a phrase the system prompt
 * teaches it to read as NO EXTERNAL LOAD, while `AssistanceChip` rendered
 * "35kg assist" on the next screen. Not a gap: a confident statement of the
 * opposite, in the exact shape of the incident the commit existed to fix.
 *
 * So the check here is structural and runs over REAL GENERATED PLANS: if the
 * exercise carries a prescribed number in any field, that number appears in
 * what the coach is sent. A new prescribed field added to Exercise and
 * forgotten here fails immediately instead of shipping.
 */
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { buildCoachExerciseSummary, loadClauseForCoach, describeExerciseForCoach } from '../src/lib/chat-plan-context'
import { getExerciseEntry } from '../src/lib/exercise-db'
import type { Exercise, UserProfile, EquipmentAccess, TrainingExperience } from '../src/lib/types'

let failures = 0
const check = (l: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${l}`)
  else { failures++; console.error(`  FAIL: ${l}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 500)}` : ''}`) }
}

function base(o: Partial<UserProfile>): UserProfile {
  return { age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
    fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1800, tdee: 2500,
    equipment_access: 'full_gym', injuries: [], training_style: 'hybrid',
    training_experience: 'intermediate', session_duration_preference: '60-90',
    workout_split_preference: 'upper_lower',
    training_days: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((day, i) => ({ day, available: i < 4 })),
    weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
    exercise_exclusions: [] as unknown as never, macro_calculation_mode: 'STANDARD_STATIC',
    coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate', ...o } as UserProfile
}
const quiet = <T,>(f: () => T): T => {
  const d = console.debug, w = console.warn
  console.debug = () => {}; console.warn = () => {}
  try { return f() } finally { console.debug = d; console.warn = w }
}

/**
 * Every field that carries a prescribed NUMBER, and how that number must show
 * up in the coach's copy. Adding a field to Exercise and not to this list is
 * the failure mode; adding it here and not to the builder turns this red.
 */
const NUMERIC_PRESCRIPTIONS: { field: keyof Exercise; label: string }[] = [
  { field: 'suggested_load_kg', label: 'the working weight' },
  { field: 'suggested_added_load_kg', label: 'added weight on a bodyweight movement' },
  { field: 'suggested_assistance_kg', label: 'machine assistance' },
]

const EQUIP: EquipmentAccess[] = ['full_gym', 'home_gym', 'minimalist', 'bodyweight']
const EXP: TrainingExperience[] = ['beginner', 'intermediate', 'advanced']
// TRAINING STYLE IS IN THE SWEEP BECAUSE OF THE TEETH CHECK BELOW. Without it
// `suggested_assistance_kg` never occurred in 12 generated mesocycles at all,
// which would have made this gate's most important assertion vacuously true —
// the exact tautological-control shape this repo keeps hitting. An assisted
// prescription needs a BEGINNER on a bodybuilding-style plan; the base profile
// is 'hybrid', so the field was unreachable and the check could not fail.
const STYLES = ['bodybuilding', 'functional', 'hybrid'] as const

console.log('\n1. Every prescribed number in a real plan reaches the coach')
{
  let exercises = 0, withNumber = 0
  const missing: unknown[] = []
  const danglingDays: string[] = []
  const seen = new Set<string>()

  for (const equipment_access of EQUIP) {
    for (const training_experience of EXP) {
     for (const training_style of STYLES) {
      const key = `ctx:${equipment_access}:${training_experience}:${training_style}`
      const meso = quiet(() => {
        setRandomSource(seededRngFromKey(key))
        try { return generateMesocycle(base({ equipment_access, training_experience, training_style })) }
        finally { resetRandomSource() }
      })
      for (const week of meso) {
        for (const day of week.days) {
          for (const ex of day.exercises) {
            exercises++
            const clause = loadClauseForCoach(ex)
            for (const { field, label } of NUMERIC_PRESCRIPTIONS) {
              const v = ex[field] as number | null | undefined
              if (v == null) continue
              withNumber++
              seen.add(field as string)
              // The number itself, as digits, must be in what we send. Not a
              // proxy for it, not a category it falls in.
              if (!clause.includes(String(v)) && missing.length < 8) {
                missing.push({ exercise: ex.name, field, value: v, sentAs: clause, why: label })
              }
            }
            // A per-set ramp must send every distinct set weight.
            if (ex.per_set_load && ex.per_set_load.length > 1) {
              const distinct = [...new Set(ex.per_set_load.map(s => s.load_kg))]
              if (distinct.length > 1) {
                const allThere = ex.per_set_load.every(sl => clause.includes(sl.display))
                if (!allThere && missing.length < 8) missing.push({ exercise: ex.name, field: 'per_set_load', sentAs: clause })
              }
            }
          }
          // "Sunday: Active recovery - " with nothing after the separator read
          // as an empty day the coach could say nothing about.
          const line = buildCoachExerciseSummary({ days: [day] })
          if (/-\s*$/.test(line) && danglingDays.length < 5) danglingDays.push(line)
        }
      }
     }
    }
  }

  console.log(`      swept ${exercises} exercises; ${withNumber} carry a prescribed number`)
  check('the sweep actually produced exercises (sanity check on this gate)', exercises > 1000, exercises)
  check('every prescribed number appears in what the coach is sent', missing.length === 0, missing)
  check('no day is sent as a dangling separator with nothing after it', danglingDays.length === 0, danglingDays)
  // Without this, a field the generator stopped emitting would make its check
  // vacuously true — the tautological-control shape this repo has hit before.
  for (const { field } of NUMERIC_PRESCRIPTIONS) {
    check(`...and ${String(field)} really does occur in the sweep, so its check has teeth`,
      seen.has(field as string), [...seen])
  }
}

console.log('\n1b. Assistance never lands on an exercise that has no machine')
{
  // FOUND BY THE TEETH CHECK ABOVE, not looked for. Widening the sweep so
  // suggested_assistance_kg could occur at all turned up 84 prescriptions
  // carrying it on entries that declare no assistance — Kneeling Band Lat
  // Pulldown (64) and Lat Pulldown (20). A rotation swaps the slot's identity
  // and the old exercise's counterweight was carried onto the new one, so
  // AssistanceChip rendered "40kg assist / less over time = stronger" on a
  // lift where MORE weight is the progress: an inverted cue, not a stray
  // number. This is the sweep that would have caught it.
  const leaks: unknown[] = []
  let assistedSeen = 0
  for (const equipment_access of EQUIP) {
    for (const training_experience of EXP) {
      for (const training_style of STYLES) {
        const key = `leak:${equipment_access}:${training_experience}:${training_style}`
        const meso = quiet(() => {
          setRandomSource(seededRngFromKey(key))
          try { return generateMesocycle(base({ equipment_access, training_experience, training_style })) }
          finally { resetRandomSource() }
        })
        for (const week of meso) for (const day of week.days) for (const ex of day.exercises) {
          if (ex.suggested_assistance_kg == null && !ex.assistance_ready_to_graduate) continue
          assistedSeen++
          const entry = getExerciseEntry(ex.name) as { assistance?: unknown } | undefined
          if (!entry?.assistance && leaks.length < 8) {
            leaks.push({ exercise: ex.name, assist: ex.suggested_assistance_kg, week: week.week_number })
          }
        }
      }
    }
  }
  console.log(`      ${assistedSeen} prescriptions carry an assistance field`)
  check('assistance only ever lands on an entry that declares it', leaks.length === 0, leaks)
  check('...and some prescription actually carries it, so this is not vacuous', assistedSeen > 0, assistedSeen)
}

console.log('\n2. Assistance is sent, and sent as the inverted thing it is')
{
  const ex = (o: Partial<Exercise>): Exercise =>
    ({ name: 'Pull-Ups (Assisted)', sets: 3, reps: '8-10', rest: '90s', substitution: '', ...o }) as Exercise
  const assisted = loadClauseForCoach(ex({ suggested_load: 'Bodyweight', suggested_assistance_kg: 35 }))
  check('the 35kg the machine is taking is sent', assisted.includes('35'), assisted)
  check('...and never as bare "Bodyweight", which the prompt reads as NO external load',
    assisted !== ' @ Bodyweight', assisted)
  check('...with the direction of progress stated, since less assist is more strength',
    /LESS assistance over time/.test(assisted), assisted)
  const graduated = loadClauseForCoach(ex({ suggested_load: 'Bodyweight', suggested_assistance_kg: 0, assistance_ready_to_graduate: true }))
  check('graduating off the machine is said in words, not as "0kg"',
    /unassisted/.test(graduated), graduated)
}

console.log('\n3. A deliberately-light load keeps the hedge the Exercise tab shows')
{
  const ex = (source: Exercise['load_source']): Exercise =>
    ({ name: 'Barbell Squats', sets: 3, reps: '8-10', rest: '90s', substitution: '',
       suggested_load: '~40kg', suggested_load_kg: 40, load_source: source }) as Exercise
  const assumed = loadClauseForCoach(ex('assumed_body'))
  check('an assumed_body load is marked as a deliberate floor', /STARTING LIGHT/.test(assumed), assumed)
  check('...and says it is not a target', /not a target/.test(assumed), assumed)
  // The hedge must NOT be sprayed on loads that earned their number, or it
  // means nothing and the coach hedges everything.
  for (const source of ['known_weight', 'estimate', undefined] as const) {
    check(`...and a ${source ?? 'plain'} load carries no such hedge`,
      !/STARTING LIGHT/.test(loadClauseForCoach(ex(source))), loadClauseForCoach(ex(source)))
  }
}

console.log('\n4. Non-numeric placeholders are never presented as weights')
{
  const ex = (load: string): Exercise =>
    ({ name: 'Arm Circles', sets: 2, reps: '8', rest: '20s', substitution: '', suggested_load: load }) as Exercise
  check('"Light" is labelled a primer, not quoted as a load',
    /primer, no prescribed weight/.test(loadClauseForCoach(ex('Light'))), loadClauseForCoach(ex('Light')))
  check('"Choose by feel" says there is no prescribed weight',
    /no prescribed weight/.test(loadClauseForCoach(ex('Choose by feel'))), loadClauseForCoach(ex('Choose by feel')))
  check('"Bodyweight" is still sent plainly — it IS the prescription',
    loadClauseForCoach(ex('Bodyweight')) === ' @ Bodyweight', loadClauseForCoach(ex('Bodyweight')))
}

console.log('\n5. Tempo and intensity reach the coach, because sometimes they ARE the prescription')
{
  const line = describeExerciseForCoach({ name: 'Push-Ups', sets: 3, reps: '8-10', rest: '90s', substitution: '',
    suggested_load: 'Bodyweight', tempo: '4-1-1', intensity: 'RPE 6-7' } as Exercise)
  check('intensity is sent', line.includes('RPE 6-7'), line)
  check('tempo is sent in plain English, not as "4-1-1"',
    line.includes('4s down') && !line.includes('4-1-1'), line)
}

console.log('\n6. The prompt teaches every form the builder can emit')
{
  const { readFileSync } = await import('fs')
  const { join, dirname } = await import('path')
  const { fileURLToPath } = await import('url')
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
  const fn = readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf8')
  check('assistance is explained as EASIER than bodyweight', /EASIER than bodyweight/.test(fn))
  check('...and that progress is the number going DOWN', /assist number going DOWN/.test(fn))
  check('a primer is named as not-a-weight', /these are NOT weights/.test(fn))
  check('the starting-light hedge is passed on rather than swallowed', /deliberate floor/.test(fn))
  check('tempo is named as the prescription where there is no weight', /the TEMPO is the prescription/.test(fn))
  check('the added-load divergence with the Exercise tab is admitted',
    /the screen is right/.test(fn))
}

if (failures > 0) { console.error(`\n${failures} check(s) failed`); process.exit(1) }
console.log('\nAll coach plan-context checks passed.\n')

// ---------------------------------------------------------------------------
// Gate for "what can you actually load".
//
// Ashley's question: "how do we know the user's backpack is 20kg or that they
// can add weight to it each week?" We didn't. The app inferred every load from
// strength standards and then clamped it with tables it invented — a rucksack
// against a strap/posture guess, and a HOME trainee's dumbbells against a
// commercial gym rack, a mismatch the table's own comment already admitted.
//
// The properties below are the ones that make asking safe. Three of them
// exist because of specific defects this repo has already shipped:
//
//   - DOWNWARD ONLY. The tables are also formula-regression backstops, so a
//     trainee claiming a 200kg dumbbell must change nothing. Same one-way rule
//     the weigh-in offer used: new information may correct a load, never
//     inflate one.
//   - DECLINING IS A VALUE. The body-metrics round shipped a dead end where
//     "optional" fields still held the user hostage until confirmed. Someone
//     who does not know what their dumbbells weigh must be able to say so once
//     and never be asked again.
//   - UNSTATED CHANGES NOTHING. Migration 20260826140000 may be unapplied when
//     this ships. Every prescription must be byte-identical to today until a
//     real answer exists.
// ---------------------------------------------------------------------------

import { EXERCISE_DATABASE, getExerciseEntry } from '../src/lib/exercise-db'
import {
  prescribeLoad, isExternallyLoaded, categorize,
  getLoadingCeilingKg, effectiveLoadingCeilingKg, statedCeilingKg,
} from '../src/lib/load-prescription'
import {
  ceilingKindFor, ceilingToAskFor, hasStatedCeiling, isValidCeilingKg,
  LOAD_CEILING_QUESTION, LOAD_CEILING_COLUMN,
} from '../src/lib/load-ceiling-prompt'
import type { UserProfile, WorkoutDay, EquipmentAccess } from '../src/lib/types'

let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

function buildProfile(o: Record<string, unknown> = {}): UserProfile {
  return {
    age: 30, gender: 'female', height_cm: 168, weight_kg: 65, activity_level: 'moderate',
    fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1500, tdee: 2100,
    equipment_access: 'minimalist', injuries: [], training_style: 'hybrid',
    training_experience: 'intermediate', session_duration_preference: '45-60',
    workout_split_preference: 'upper_lower', training_days: [], weekly_schedule: {},
    dietary_preferences: [], concurrent_activities: [],
    exercise_exclusions: [] as unknown as never, macro_calculation_mode: 'STANDARD_STATIC',
    coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
    ...o,
  } as UserProfile
}

const kgFor = (name: string, profile: UserProfile): number | null | undefined => {
  const entry = getExerciseEntry(name)
  if (!entry) return undefined
  const d = console.debug, w = console.warn
  console.debug = () => {}; console.warn = () => {}
  try {
    return prescribeLoad(entry, profile, {
      targetRpeLabel: 'RPE 8', isFirstBlock: true, sets: 3, repRangeLabel: '8-12',
    }).starting_weight_kg
  } finally { console.debug = d; console.warn = w }
}

const dayOf = (...names: string[]): WorkoutDay =>
  ({ day: 'Monday', exercises: names.map(n => ({ name: n })) } as unknown as WorkoutDay)

// ---------------------------------------------------------------------------
console.log('\n1. A stated ceiling only ever lowers')
// ---------------------------------------------------------------------------
{
  let raised = 0, checked = 0
  const offenders: string[] = []
  for (const entry of EXERCISE_DATABASE) {
    if (!isExternallyLoaded(entry)) continue
    for (const v of [1, 5, 10, 25, 50, 200, 9999]) {
      const profile = buildProfile({ max_dumbbell_kg: v, max_single_implement_kg: v, max_improvised_kg: v })
      const table = getLoadingCeilingKg(entry, categorize(entry))
      const eff = effectiveLoadingCeilingKg(entry, categorize(entry), profile)
      checked++
      if (eff > table) { raised++; if (offenders.length < 3) offenders.push(`${entry.name} @${v}: ${eff} > ${table}`) }
    }
  }
  check(`no stated value ever raises a ceiling (${raised} of ${checked})`, raised === 0, offenders.join(' | '))
  check('...and there were ceilings to check', checked > 300, String(checked))

  // The claim a real person might actually make, and the one that matters.
  const absurdDb = kgFor('Dumbbell Rows', buildProfile({ max_dumbbell_kg: 200 }))
  const plainDb = kgFor('Dumbbell Rows', buildProfile())
  check(`a claimed 200kg dumbbell changes nothing (${plainDb} -> ${absurdDb})`, absurdDb === plainDb, `${plainDb} vs ${absurdDb}`)
  const absurdBag = kgFor('Backpack Row', buildProfile({ equipment_access: 'bodyweight', max_improvised_kg: 99 }))
  const plainBag = kgFor('Backpack Row', buildProfile({ equipment_access: 'bodyweight' }))
  check(`a claimed 99kg rucksack changes nothing (${plainBag} -> ${absurdBag})`, absurdBag === plainBag, `${plainBag} vs ${absurdBag}`)
}

// ---------------------------------------------------------------------------
console.log('\n2. A real answer is actually used')
// ---------------------------------------------------------------------------
{
  const stated = kgFor('Dumbbell Rows', buildProfile({ max_dumbbell_kg: 10 }))
  check(`10kg dumbbells means nothing over 10kg (got ${stated}kg)`, (stated ?? 999) <= 10, String(stated))
  const bag = kgFor('Backpack Row', buildProfile({ equipment_access: 'bodyweight', max_improvised_kg: 8 }))
  check(`an 8kg bag means nothing over 8kg (got ${bag}kg)`, (bag ?? 999) <= 8, String(bag))

  // Every loaded exercise, not one sample: a stated 10kg must bind everywhere
  // that implement appears, or the ceiling is being read at some sites and not
  // others — the "assert it at every path" defect this repo keeps hitting.
  const over: string[] = []
  for (const entry of EXERCISE_DATABASE) {
    if (!isExternallyLoaded(entry)) continue
    const kind = ceilingKindFor(entry.name)
    if (kind == null) continue
    const profile = buildProfile({
      equipment_access: 'bodyweight',
      max_dumbbell_kg: 10, max_single_implement_kg: 10, max_improvised_kg: 10,
    })
    const kg = kgFor(entry.name, profile)
    if (kg != null && kg > 10) over.push(`${entry.name} ${kg}kg`)
  }
  check(`nothing anywhere exceeds a stated 10kg (${over.length})`, over.length === 0, over.slice(0, 4).join(', '))
}

// ---------------------------------------------------------------------------
console.log('\n3. Unstated changes absolutely nothing')
// ---------------------------------------------------------------------------
{
  // THE PROPERTY THAT MATTERS MOST WHILE THE MIGRATION IS UNAPPLIED. Ashley
  // cannot run it from her machine today, so this must hold in production the
  // moment the code ships and before the columns exist.
  let differ = 0
  const cases: string[] = []
  for (const entry of EXERCISE_DATABASE) {
    if (!isExternallyLoaded(entry)) continue
    for (const eq of ['bodyweight', 'minimalist', 'home_gym', 'full_gym'] as EquipmentAccess[]) {
      const bare = buildProfile({ equipment_access: eq })
      const withNulls = buildProfile({
        equipment_access: eq,
        max_dumbbell_kg: null, max_single_implement_kg: null, max_improvised_kg: null,
        load_ceilings_declined: false,
      })
      const a = kgFor(entry.name, bare), b = kgFor(entry.name, withNulls)
      if (a !== b) { differ++; if (cases.length < 3) cases.push(`${entry.name}/${eq}: ${a} vs ${b}`) }
    }
  }
  check(`an unanswered profile prescribes identically (${differ} differ)`, differ === 0, cases.join(' | '))
  check('statedCeilingKg returns null when nothing is stated',
    statedCeilingKg(getExerciseEntry('Dumbbell Rows')!, buildProfile()) === null)
}

// ---------------------------------------------------------------------------
console.log('\n4. Nobody is asked about kit they do not use')
// ---------------------------------------------------------------------------
{
  const bwDay = dayOf('Backpack Row', 'Push-Ups')
  check('a bodyweight trainee with a backpack IS asked about the bag',
    ceilingToAskFor(buildProfile({ equipment_access: 'bodyweight' }), bwDay) === 'improvised')
  check('...and is NOT asked about dumbbells',
    ceilingToAskFor(buildProfile({ equipment_access: 'bodyweight' }), dayOf('Push-Ups', 'Pull-Ups')) === null)
  check('a FULL GYM trainee is never asked at all',
    ceilingToAskFor(buildProfile({ equipment_access: 'full_gym' }), dayOf('Dumbbell Rows')) === null)
  check('a barbell lift never triggers a question',
    ceilingKindFor('Barbell Bench Press') === null)
  check('a cable machine never triggers a question',
    ceilingKindFor('Lat Pulldown') === null)
  check('a dumbbell lift does', ceilingKindFor('Dumbbell Rows') === 'dumbbell')

  // At most one question per session — someone in a gym wants to train, not
  // fill in a form.
  const twoImplements = dayOf('Dumbbell Rows', 'Backpack Row')
  const asked = ceilingToAskFor(buildProfile({ equipment_access: 'minimalist' }), twoImplements)
  check(`two unstated implements still ask only once (${asked})`, asked != null)
}

// ---------------------------------------------------------------------------
console.log('\n5. Declining is a value, and it is permanent')
// ---------------------------------------------------------------------------
{
  const day = dayOf('Dumbbell Rows', 'Backpack Row')
  check('a declined profile is never asked again',
    ceilingToAskFor(buildProfile({ load_ceilings_declined: true }), day) === null)
  // Silences every implement, not just the one on screen — asking again next
  // session with a different noun is the same nag wearing a hat.
  check('...for EVERY implement, not just the one showing',
    ceilingToAskFor(buildProfile({ load_ceilings_declined: true }), dayOf('Backpack Row')) === null)
  // And declining must not cost them a plan. This is the body-metrics lesson:
  // a refusal that degrades the product is not a real choice.
  const declined = kgFor('Dumbbell Rows', buildProfile({ load_ceilings_declined: true }))
  const normal = kgFor('Dumbbell Rows', buildProfile())
  check(`a declined trainee still gets a load, unchanged (${declined}kg)`, declined === normal, `${declined} vs ${normal}`)

  check('answering one implement stops it being asked about',
    hasStatedCeiling(buildProfile({ max_dumbbell_kg: 12 }), 'dumbbell') === true)
  check('...but not the others', hasStatedCeiling(buildProfile({ max_dumbbell_kg: 12 }), 'improvised') === false)
}

// ---------------------------------------------------------------------------
console.log('\n6. The question itself')
// ---------------------------------------------------------------------------
{
  check('a typo guard rejects 0 and 500', !isValidCeilingKg(0) && !isValidCeilingKg(500))
  check('...and accepts a real answer', isValidCeilingKg(10) && isValidCeilingKg('12.5'))
  // Dumbbells are prescribed PER HAND and the question must say so — the
  // per-side/total confusion has caused real defects here more than once.
  check('the dumbbell question states "per hand"',
    /per hand/i.test(LOAD_CEILING_QUESTION.dumbbell.hint), LOAD_CEILING_QUESTION.dumbbell.hint)
  // Every question says what the answer DOES, or it reads as a form.
  for (const kind of ['dumbbell', 'single_implement', 'improvised'] as const) {
    check(`the ${kind} question says what it changes`,
      /stop/i.test(LOAD_CEILING_QUESTION[kind].hint), LOAD_CEILING_QUESTION[kind].hint)
  }
  check('every kind maps to a real column',
    Object.values(LOAD_CEILING_COLUMN).every(c => /^max_.*_kg$/.test(c)), Object.values(LOAD_CEILING_COLUMN).join(', '))
}

console.log(failures === 0 ? '\nAll load-ceiling checks passed.\n' : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)

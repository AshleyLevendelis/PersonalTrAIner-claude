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
import { readFileSync } from 'fs'
import {
  prescribeLoad, isExternallyLoaded, categorize,
  getLoadingCeilingKg, effectiveLoadingCeilingKg, statedCeilingKg,
  loadingMode, LOADED_EQUIPMENT, UNLOADED_EQUIPMENT,
} from '../src/lib/load-prescription'
import {
  ceilingKindFor, ceilingToAskFor, hasStatedCeiling, isValidCeilingKg,
  LOAD_CEILING_QUESTION, LOAD_CEILING_COLUMN,
} from '../src/lib/load-ceiling-prompt'
import { EQUIPMENT_QUALITY, generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { ceilingLabel, ceilingNoteForCoach } from '../src/lib/progression-ceiling'
import type { UserProfile, WorkoutDay, EquipmentAccess, Exercise } from '../src/lib/types'

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

// ---------------------------------------------------------------------------
console.log('\n7. Every piece of equipment is classified, so none can mean "no weight" by accident')
// ---------------------------------------------------------------------------
//
// THE DEFECT THIS EXISTS FOR, measured 13 Sep 2026. `isExternallyLoaded` asked
// "is this equipment string in the LOADED set?" — an allowlist, which means a
// string nobody has classified reads as NO EXTERNAL LOAD. The machine-floor
// catalogue expansion (12 Sep) added six equipment strings and the Set never
// grew with them, so a Smith machine shoulder press was prescribed
// "Bodyweight". Fourteen of fifty-four generated plans carried at least one.
//
// Nothing objected, because the failure is SILENT AND OPEN. So the fix is not
// the six names — it is this: the two sets must PARTITION the catalogue, and
// an unrecognised string fails here instead of quietly costing someone their
// working weight.
{
  const strings = new Set<string>()
  for (const entry of Object.values(EXERCISE_DATABASE) as { equipment?: string[] }[]) {
    for (const e of entry.equipment ?? []) strings.add(e)
  }
  check('the catalogue actually has equipment to classify (sanity check on this check)', strings.size > 20, strings.size)

  const unclassified = [...strings].filter(e => !LOADED_EQUIPMENT.has(e) && !UNLOADED_EQUIPMENT.has(e))
  check('every equipment string is either loaded or explicitly not', unclassified.length === 0, unclassified)

  // AND NEITHER WAY ROUND. A string in both sets is a table somebody edited
  // twice with two different intentions, and `isExternallyLoaded` would
  // silently pick the loaded one.
  const both = [...strings].filter(e => LOADED_EQUIPMENT.has(e) && UNLOADED_EQUIPMENT.has(e))
  check('...and never both', both.length === 0, both)

  // THE NAMED MACHINES, so a revert is loud. These are the six the expansion
  // brought and the classifier missed.
  for (const e of ['smith machine', 'hip thrust machine', 'glute kickback machine',
    'hip abduction machine', 'hip adduction machine', 'belt squat machine']) {
    check(`"${e}" counts as external load`, LOADED_EQUIPMENT.has(e))
  }
  // AND THE THREE THAT LOOK LIKE MISSES AND ARE NOT. An assisted machine
  // subtracts weight, a band's resistance is not expressible in kg, and a
  // treadmill has no load to set — putting any of them in the loaded set
  // would invent a number rather than fix one.
  for (const e of ['assisted pull-up machine', 'resistance band', 'treadmill']) {
    check(`"${e}" is deliberately NOT external load`, UNLOADED_EQUIPMENT.has(e) && !LOADED_EQUIPMENT.has(e))
  }

  // THE SIX MACHINES ASHLEY'S "MORE MACHINES TO SELECT FROM" ASK BROUGHT,
  // 23 Sep 2026 — named the same way the 13 Sep six are named above, so a
  // revert here is loud rather than a silent "Bodyweight" prescription.
  for (const e of ['standing calf raise machine', 'rotary torso machine',
    'back extension machine', 'reverse hyper machine', 'multi-hip machine',
    't-bar row machine']) {
    check(`"${e}" counts as external load`, LOADED_EQUIPMENT.has(e))
  }

  // AND THE THIRD TABLE, added 21 Sep 2026 after the SAME six 13-Sep
  // machines went stale here too — EQUIPMENT_QUALITY. Nothing had ever
  // checked its completeness, only LOADED_EQUIPMENT/UNLOADED_EQUIPMENT's
  // partition above; this closes that gap generally rather than only for
  // today's six. EQUIPMENT_QUALITY is deliberately NOT a full partition
  // (furniture and cardio are legitimately absent, contributing nothing to
  // bestEquipmentRank) — but every genuinely LOADED implement is a real
  // working-set tool by definition, and every one already in the table is
  // ranked, so LOADED_EQUIPMENT subset of EQUIPMENT_QUALITY's keys is the
  // honest invariant to hold, not "every string everywhere".
  const unranked = [...LOADED_EQUIPMENT].filter(e => !(e in EQUIPMENT_QUALITY))
  check('every loaded implement is also ranked in EQUIPMENT_QUALITY — the exact staleness that hit 21 Sep, generalised', unranked.length === 0, unranked)

  // A SMITH MACHINE IS A BAR, NOT A STACK — otherwise it gets a 5kg pin floor.
  const smithSquat = getExerciseEntry('Smith Machine Squat')
  check('a Smith machine loads like a barbell', !!smithSquat && loadingMode(smithSquat) === 'barbell', smithSquat && loadingMode(smithSquat))
  // A BELT SQUAT IS NOT, and that is deliberate: there is no bar to floor it
  // at 20kg, and its ceiling comes from its leg_press category regardless.
  const beltSquat = getExerciseEntry('Belt Squat')
  check('...and a belt squat is not, because it has no bar', !!beltSquat && loadingMode(beltSquat) === 'stack', beltSquat && loadingMode(beltSquat))

  // THE WHOLE POINT, driven rather than asserted: none of the eight may come
  // back as bodyweight.
  const NAMED = ['Smith Machine Bench Press', 'Smith Machine Shoulder Press', 'Smith Machine Squat',
    'Machine Hip Thrust', 'Glute Kickback Machine', 'Hip Abduction Machine', 'Hip Adduction Machine', 'Belt Squat']
  const stillBodyweight = NAMED.filter(n => { const e = getExerciseEntry(n); return !e || !isExternallyLoaded(e) })
  check('not one of the eight machines is bodyweight any more', stillBodyweight.length === 0, stillBodyweight)
}

// ---------------------------------------------------------------------------
console.log('\n8. The question and the clamp agree about which implement a lift uses')
// ---------------------------------------------------------------------------
// Test log H1/H18, 9 Oct 2026, reproduced on a seeded build of the tester's
// plan. He had said his heaviest dumbbells are 24kg. The app then asked him
// "What is your heaviest kettlebell?" — raised by Dumbbell Leg Curl, a lift
// done with ONE DUMBBELL, whose limit it already held and would not have used
// the kettlebell answer for. And Goblet Squats (a dumbbell OR a kettlebell)
// was prescribed ~32kg, because a lift that can use either read only the
// kettlebell answer he had never given.
//
// The clamp was re-routed by implement on 10 Sep; the question was not. Two
// functions answering "which implement is this?" separately is the defect, so
// the property held here is that they cannot disagree, for any exercise.
{
  const man = (o: Record<string, unknown> = {}) => buildProfile({ gender: 'male', weight_kg: 82, height_cm: 180, ...o })
  const owns24 = man({ max_dumbbell_kg: 24 })

  // --- the clamp ---
  const goblet = getExerciseEntry('Goblet Squats')!
  check('the fixture bites: with nothing stated, Goblet Squats is priced above 24kg', (kgFor('Goblet Squats', man()) ?? 0) > 24, String(kgFor('Goblet Squats', man())))
  check('Goblet Squats respects a stated 24kg dumbbell when no kettlebell has been mentioned', kgFor('Goblet Squats', owns24) === 24, String(kgFor('Goblet Squats', owns24)))
  check('...and the reader says so', statedCeilingKg(goblet, owns24) === 24, String(statedCeilingKg(goblet, owns24)))
  check('with BOTH stated it may use the heavier of the two — either implement does this lift',
    statedCeilingKg(goblet, man({ max_dumbbell_kg: 12, max_single_implement_kg: 24 })) === 24
    && statedCeilingKg(goblet, man({ max_dumbbell_kg: 28, max_single_implement_kg: 16 })) === 28,
    [statedCeilingKg(goblet, man({ max_dumbbell_kg: 12, max_single_implement_kg: 24 })), statedCeilingKg(goblet, man({ max_dumbbell_kg: 28, max_single_implement_kg: 16 }))].join())
  check('with only a kettlebell stated it reads the kettlebell, as it always did', statedCeilingKg(goblet, man({ max_single_implement_kg: 20 })) === 20)
  check('a kettlebell-only lift still ignores the dumbbell answer', statedCeilingKg(getExerciseEntry('Kettlebell Swing (Heavy)')!, owns24) === null)
  check('a dumbbell-only single lift still ignores the kettlebell answer', statedCeilingKg(getExerciseEntry('Dumbbell Leg Curl')!, man({ max_single_implement_kg: 40 })) === null)

  // --- the question ---
  const minimalist = (o: Record<string, unknown> = {}) => man({ equipment_access: 'minimalist', ...o })
  check('Dumbbell Leg Curl asks about DUMBBELLS, not a kettlebell', ceilingKindFor('Dumbbell Leg Curl') === 'dumbbell', String(ceilingKindFor('Dumbbell Leg Curl')))
  check('...and is not asked at all once the dumbbell limit is known (his case)',
    ceilingToAskFor(minimalist({ max_dumbbell_kg: 24 }), dayOf('Dumbbell Leg Curl')) === null,
    String(ceilingToAskFor(minimalist({ max_dumbbell_kg: 24 }), dayOf('Dumbbell Leg Curl'))))
  check('a lift that can use either implement is not asked about once ONE of them is known',
    ceilingToAskFor(minimalist({ max_dumbbell_kg: 24 }), dayOf('Goblet Squats')) === null
    && ceilingToAskFor(minimalist({ max_single_implement_kg: 16 }), dayOf('Goblet Squats')) === null,
    [ceilingToAskFor(minimalist({ max_dumbbell_kg: 24 }), dayOf('Goblet Squats')), ceilingToAskFor(minimalist({ max_single_implement_kg: 16 }), dayOf('Goblet Squats'))].join())
  check('...and with neither known it asks about dumbbells, the answer that also covers every pair', ceilingToAskFor(minimalist(), dayOf('Goblet Squats')) === 'dumbbell', String(ceilingToAskFor(minimalist(), dayOf('Goblet Squats'))))
  check('a real kettlebell lift still asks about the kettlebell, even with dumbbells known',
    ceilingToAskFor(minimalist({ max_dumbbell_kg: 24 }), dayOf('Kettlebell Swing (Heavy)')) === 'single_implement',
    String(ceilingToAskFor(minimalist({ max_dumbbell_kg: 24 }), dayOf('Kettlebell Swing (Heavy)'))))
  check('...and stops once that is known', ceilingToAskFor(minimalist({ max_single_implement_kg: 16 }), dayOf('Kettlebell Swing (Heavy)')) === null)

  // --- the property: they cannot disagree, for any exercise ---
  const COLUMN = { dumbbell: 'max_dumbbell_kg', single_implement: 'max_single_implement_kg', improvised: 'max_improvised_kg' } as const
  const askedButIgnored: string[] = []
  const stillAskedWhenCapped: string[] = []
  let asked = 0
  for (const e of EXERCISE_DATABASE) {
    if (e.retired) continue
    const kind = ceilingKindFor(e.name)
    if (kind) {
      asked++
      // Whatever the app asks for this lift, the answer must cap this lift.
      if (statedCeilingKg(e, man({ [COLUMN[kind]]: 7 })) !== 7) askedButIgnored.push(`${e.name}: asks ${kind}, clamp reads ${statedCeilingKg(e, man({ [COLUMN[kind]]: 7 }))}`)
    }
    // And for every answer that DOES cap this lift, having it means not being asked.
    for (const k of ['dumbbell', 'single_implement', 'improvised'] as const) {
      const p = minimalist({ [COLUMN[k]]: 7 })
      if (statedCeilingKg(e, p) === 7 && ceilingToAskFor(p, dayOf(e.name)) !== null) stillAskedWhenCapped.push(`${e.name}: has ${k}, still asked ${ceilingToAskFor(p, dayOf(e.name))}`)
    }
  }
  check(`there are lifts to ask about (${asked})`, asked >= 30, String(asked))
  check('no lift asks a question whose answer its own clamp would ignore', askedButIgnored.length === 0, askedButIgnored.slice(0, 6).join(' | '))
  check('no lift is asked about once an answer that caps it is on record', stillAskedWhenCapped.length === 0, stillAskedWhenCapped.slice(0, 6).join(' | '))
}

// ---------------------------------------------------------------------------
console.log('\n9. A lift held at the person\'s own limit says so')
// ---------------------------------------------------------------------------
// Test log H18, 9 Oct 2026: "Dumbbell Rows are also at 24kg per hand in week
// 2, which is Sam's maximum with 14 weeks to go." The weight was right — the
// plan may not exceed what he owns — but nothing recorded WHY it had stopped.
// prescribeLoad's hold reason was only ever 'implement' for a backpack's strap
// limit, so a dumbbell pinned at a stated 24kg read as held by nothing, or
// (once the ramp arrived) as "at your estimate's ceiling — log a set and the
// number can start moving again", which is untrue of somebody who has no
// heavier dumbbell to move to. And on the weeks it bought a rep instead, the
// sentence beside it said "Add 2kg next time".
{
  const man = (o: Record<string, unknown> = {}) => buildProfile({ gender: 'male', weight_kg: 82, height_cm: 180, ...o })
  const rows = getExerciseEntry('Dumbbell Rows')!
  const opts = { targetRpeLabel: 'RPE 8', sets: 3, repRangeLabel: '8-12' }
  const quiet = <T>(fn: () => T): T => { const w = console.warn; console.warn = () => {}; try { return fn() } finally { console.warn = w } }

  const free = quiet(() => prescribeLoad(rows, man(), opts))
  check('the fixture bites: unconstrained, Dumbbell Rows is priced above 12kg per hand', (free.starting_weight_kg ?? 0) > 12, String(free.starting_weight_kg))
  check('...and with no limit stated nothing claims one', free.hold !== 'stated_limit', String(free.hold))

  const held = quiet(() => prescribeLoad(rows, man({ max_dumbbell_kg: 12 }), opts))
  check('with 12kg dumbbells it is written at 12', held.starting_weight_kg === 12, String(held.starting_weight_kg))
  check('...and the reason is recorded: held by the person\'s own stated limit', held.hold === 'stated_limit', String(held.hold))
  check('...the sentence beside it says so, with the number and the implement', /12kg dumbbells/.test(held.basis) && /heaviest you've told me/.test(held.basis), held.basis)
  check('...and never tells him to add weight he has said he does not own', !/Add \d|add load next set|number can start moving/i.test(held.basis), held.basis)

  // The week the frozen weight buys a rep goes through the FORCED path, whose
  // usual sentence is "Hit N reps on every set? Add 2kg next time".
  const forced = quiet(() => prescribeLoad(rows, man({ max_dumbbell_kg: 12 }), { ...opts, forceStartingWeightKg: 12, repRangeLabel: '9-13' }))
  check('the forced (rep-buying) week carries the same reason', forced.hold === 'stated_limit' && forced.starting_weight_kg === 12, { hold: forced.hold, kg: forced.starting_weight_kg })
  check('...and the same honest sentence, not "add 2kg next time"', /heaviest you've told me/.test(forced.basis) && !/Add \d/.test(forced.basis), forced.basis)
  const forcedFree = quiet(() => prescribeLoad(rows, man({ max_dumbbell_kg: 24 }), { ...opts, forceStartingWeightKg: 12 }))
  check('a forced weight UNDER the limit still gets the ordinary progression sentence', forcedFree.hold !== 'stated_limit' && /Add 2kg/.test(forcedFree.basis), { hold: forcedFree.hold, basis: forcedFree.basis })

  // One step under the limit is not "held".
  const under = quiet(() => prescribeLoad(rows, man({ max_dumbbell_kg: 12 }), { ...opts, forceStartingWeightKg: 10 }))
  check('a weight below the limit is not reported as held by it', under.hold !== 'stated_limit' && under.starting_weight_kg === 10, { hold: under.hold, kg: under.starting_weight_kg })

  // A BAG HAS TWO LIMITS, and they keep two reasons. Held by the strap and
  // posture cap (a judgement about the implement, 20kg for an intermediate)
  // it stays 'implement' with the wording Ashley ruled on, 19 Sep. Held by
  // what the person SAID it holds, it is this case — and used to carry no
  // reason at all, under "I have no way to know what your bag actually holds".
  const strap = quiet(() => prescribeLoad(getExerciseEntry('Backpack Row')!, man(), opts))
  check('a bag at the strap limit is still "implement", untouched by this', strap.hold === 'implement' && strap.starting_weight_kg === 20, JSON.stringify({ hold: strap.hold, kg: strap.starting_weight_kg }))
  const bag = quiet(() => prescribeLoad(getExerciseEntry('Backpack Row')!, man({ max_improvised_kg: 10 }), opts))
  check('a bag at the weight its owner said it holds records that', bag.hold === 'stated_limit' && bag.starting_weight_kg === 10, JSON.stringify({ hold: bag.hold, kg: bag.starting_weight_kg }))
  check('...and stops saying it has no way to know what the bag holds', /10kg/.test(bag.basis) && /your bag holds/.test(bag.basis) && !/no way to know/.test(bag.basis), bag.basis)

  // A lift a dumbbell OR a kettlebell does is held by the HEAVIER of the two
  // he has stated — and named for that one. At the lighter one's weight it is
  // not held at all: he owns something heavier that does this lift.
  const both = man({ max_dumbbell_kg: 12, max_single_implement_kg: 24 })
  const gobletAt = (kg: number) => quiet(() => prescribeLoad(getExerciseEntry('Goblet Squats')!, both, { ...opts, forceStartingWeightKg: kg }))
  check('a dumbbell-or-kettlebell lift at the LIGHTER stated weight is not "held"', gobletAt(12).hold !== 'stated_limit' && gobletAt(12).starting_weight_kg === 12, JSON.stringify({ hold: gobletAt(12).hold, kg: gobletAt(12).starting_weight_kg }))
  check('...at the heavier one it is, and the sentence names that implement', gobletAt(24).hold === 'stated_limit' && /24kg kettlebell/.test(gobletAt(24).basis), gobletAt(24).basis)

  // A kettlebell and a single dumbbell name themselves correctly.
  const swing = quiet(() => prescribeLoad(getExerciseEntry('Kettlebell Swing (Heavy)')!, man({ max_single_implement_kg: 12 }), opts))
  check('a kettlebell lift names the kettlebell', swing.hold === 'stated_limit' && /12kg kettlebell\b/.test(swing.basis) && !/dumbbell/.test(swing.basis), swing.basis)
  const curl = quiet(() => prescribeLoad(getExerciseEntry('Dumbbell Leg Curl')!, man({ max_dumbbell_kg: 12 }), opts))
  check('a one-dumbbell lift says "dumbbell", not "dumbbells"', curl.hold === 'stated_limit' && /12kg dumbbell\b(?!s)/.test(curl.basis), curl.basis)

  // --- what the card and the coach are given ---
  const slot = (o: Partial<Exercise>): Exercise => ({ name: 'Dumbbell Rows', sets: 3, reps: '8-12', rest: '60s', substitution: '', suggested_load_kg: 12, suggested_load: '~12kg per hand', ...o })
  check('the card says "held at your 12kg dumbbells"', ceilingLabel(slot({ load_hold: 'stated_limit' })) === 'held at your 12kg dumbbells', String(ceilingLabel(slot({ load_hold: 'stated_limit' }))))
  check('...whether or not a rep was bought that week — the WEIGHT is what it describes',
    ceilingLabel(slot({ load_hold: 'stated_limit', rep_bump: 'bought' })) === 'held at your 12kg dumbbells'
    && ceilingLabel(slot({ load_hold: 'stated_limit', rep_bump: 'capped' })) === 'held at your 12kg dumbbells')
  check('...a bag names the bag', ceilingLabel(slot({ name: 'Backpack Row', load_hold: 'stated_limit', suggested_load: '~12kg' })) === 'held at your 12kg bag', String(ceilingLabel(slot({ name: 'Backpack Row', load_hold: 'stated_limit' }))))
  check('...a lift a dumbbell OR a kettlebell does names neither', ceilingLabel(slot({ name: 'Goblet Squats', load_hold: 'stated_limit', suggested_load: '~12kg' })) === 'held at the 12kg you have', String(ceilingLabel(slot({ name: 'Goblet Squats', load_hold: 'stated_limit' }))))
  check('...a kettlebell lift names the kettlebell', ceilingLabel(slot({ name: 'Kettlebell Swing (Heavy)', load_hold: 'stated_limit', suggested_load: '~12kg' })) === 'held at your 12kg kettlebell', String(ceilingLabel(slot({ name: 'Kettlebell Swing (Heavy)', load_hold: 'stated_limit' }))))
  check('...and the other three labels are exactly as they were',
    ceilingLabel(slot({ load_hold: 'implement', rep_bump: 'capped' })) === 'as heavy as this gets'
    && ceilingLabel(slot({ load_hold: 'ceiling', rep_bump: 'capped' })) === "at your estimate's ceiling"
    && ceilingLabel(slot({ load_hold: 'unaffordable_step', rep_bump: 'capped' })) === 'next weight up is too big a jump'
    && ceilingLabel(slot({ load_hold: 'ceiling', rep_bump: 'bought' })) === null
    && ceilingLabel(slot({})) === null)
  const note = ceilingNoteForCoach(slot({ load_hold: 'stated_limit', rep_bump: 'bought' })) ?? ''
  check('the coach is told the weight will not rise and not to call it progress', /heaviest/.test(note) && /will not rise/.test(note) && /do not present/.test(note), note)
  check('...and is NOT told to ask for a logged set, which cannot move it', !/logged set/.test(note), note)

  // WHICH REASON WINS when the ramp has also caught up with the estimate.
  // "At your estimate's ceiling" comes with "log a set and the number can
  // start moving again" — untrue at the heaviest dumbbell somebody owns, so
  // the stated limit is the reason reported.
  const estimateKg = free.starting_weight_kg!
  const arrived = quiet(() => prescribeLoad(rows, man({ max_dumbbell_kg: estimateKg }), { ...opts, unverifiedPreviousLoadingWeekKg: estimateKg }))
  const arrivedFree = quiet(() => prescribeLoad(rows, man(), { ...opts, unverifiedPreviousLoadingWeekKg: estimateKg }))
  check('the fixture bites: with no limit, that same week IS "at the estimate\'s ceiling"', arrivedFree.hold === 'ceiling', String(arrivedFree.hold))
  check('with the limit AT the estimate, the limit is the reason given', arrived.hold === 'stated_limit' && arrived.starting_weight_kg === estimateKg, JSON.stringify({ hold: arrived.hold, kg: arrived.starting_weight_kg }))
  check('...and nothing promises a logged set will move it', !/number can start moving/.test(arrived.basis), arrived.basis)

  // The card keeps this label once a set is logged (the estimate labels go).
  const chipSrc = readFileSync(new URL('../src/components/exercise/LoadChip.tsx', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  check('the card does not drop "held at your…" when a set has been logged', /source === 'logged' && ex\.load_hold !== 'stated_limit' \? null : ceilingLabel\(ex\)/.test(chipSrc))

  // --- and it reaches a real plan ---
  const p = man({ max_dumbbell_kg: 12, equipment_access: 'minimalist', training_style: 'bodybuilding',
    training_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => ({ day, available: ['Monday', 'Tuesday', 'Thursday', 'Saturday'].includes(day) })) })
  setRandomSource(seededRngFromKey('load-ceilings:held'))
  const log = console.log
  console.log = () => {}
  const plan = quiet(() => generateMesocycle(p))
  console.log = log
  resetRandomSource()
  let atLimit = 0, unexplained: string[] = [], wrongWords: string[] = [], falselyHeld: string[] = []
  for (const w of plan) for (const d of w.days) for (const e of d.exercises) {
    const entry = getExerciseEntry(e.name)
    if (!entry || e.suggested_load_kg == null || statedCeilingKg(entry, p) == null) continue
    if (e.suggested_load_kg >= 12) {
      atLimit++
      // 'matched' is the one other claim allowed to stand: the same lift's
      // other slot this week set the number.
      if (e.load_hold !== 'stated_limit' && e.load_hold !== 'matched') unexplained.push(`wk${w.week_number} ${e.name} ${e.suggested_load} hold=${e.load_hold ?? 'none'}`)
      if (e.load_hold === 'stated_limit' && (!/heaviest you've told me/.test(e.load_guidance ?? '') || /Add \d+(\.\d+)?kg/.test(e.load_guidance ?? ''))) wrongWords.push(`wk${w.week_number} ${e.name}: ${e.load_guidance}`)
    } else if (e.load_hold === 'stated_limit') falselyHeld.push(`wk${w.week_number} ${e.name} ${e.suggested_load}`)
  }
  check(`the plan has dumbbell lifts sitting at his 12kg limit (${atLimit})`, atLimit >= 20, String(atLimit))
  check('every one of them records that the limit is what holds it', unexplained.length === 0, unexplained.slice(0, 5).join(' | '))
  check('...and says so beside the weight, never "add Nkg"', wrongWords.length === 0, wrongWords.slice(0, 3).join(' | '))
  check('nothing below the limit claims to be held by it', falselyHeld.length === 0, falselyHeld.slice(0, 5).join(' | '))
}

console.log(failures === 0 ? '\nAll load-ceiling checks passed.\n' : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)

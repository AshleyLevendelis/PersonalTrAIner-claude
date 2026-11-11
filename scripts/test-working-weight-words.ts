// ---------------------------------------------------------------------------
// A LIFT GIVEN AT SETUP: what is asked, what is kept, and that the plan means
// the same thing by it.
//
// Ashley, 11 Nov 2026: "During onboarding when it asks for my working weights
// it's not clear to the user what it means. Did it want my 1 rep max or a
// couple in reserve etc. Also which exercises exactly." Then his ruling, from
// two options: "Weight and reps".
//
// Traced: the plan reads a kept lift as the weight for about 10 reps with 2 in
// reserve, skips the calibration week on it and trusts it over its own
// estimate. The old box took a bare number and never said what it was.
// Measured: 100 typed came back as 115 for five reps, so a five-rep weight
// started 15% heavy and a one-rep max far worse.
//
// THE PROPERTY, not the wording: a set somebody types is converted by the app
// and handed to the REAL prescriber, and at the reps they typed, taken to the
// limit, the plan never asks for more than they lifted. The reps and reserve
// the sentences NAME are fed to the prescriber too, and the number kept is the
// number prescribed there.
//
// A gate has exactly one exit, at the bottom.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { prescribeLoad, hasKnownWorkingWeight } from '../src/lib/load-prescription'
import { EXERCISE_DATABASE } from '../src/lib/exercise-db'
import { referenceWeightFromSet, LIFT_SET_MAX_REPS } from '../src/lib/working-weight'
import { parseLiftSet, parseLiftWeight, measureParserFor, liftSetInUserWords } from '../src/lib/body-units'
import {
  WORKING_WEIGHT_LIFTS, liftSetsAsk, liftSetQuestion, liftAsStored, liftNeedsASet, liftSetProblem, workingWeightProfileNote,
} from '../src/lib/coach-voice'
import { getSlotDef, buildSlotCatalog, initialSlotValues, displaySlotValue } from '../src/lib/onboarding-slots'
import type { UserProfile } from '../src/lib/types'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail: unknown = '') => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else {
    failures++
    console.error(`  FAIL: ${name}${detail === '' ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`)
  }
}

const profile = {
  age: 30, gender: 'male', height_cm: 178, weight_kg: 80,
  activity_level: 'moderate', fitness_goal: 'hypertrophy', preferred_time: 'morning',
  bmr: 1800, tdee: 2500, equipment_access: 'full_gym', injuries: [],
  training_style: 'bodybuilding', training_experience: 'intermediate',
  session_duration_preference: '60-90', workout_split_preference: 'ai_recommendation',
  training_days: [], weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
  macro_calculation_mode: 'STANDARD_STATIC', coaching_persona: 'supportive',
  recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
} as unknown as UserProfile

/** The numbers a sentence states, in order. Read from the WORDS, so the check is about what the person is told. */
const numbersIn = (s: string) => (s.match(/\d+/g) ?? []).map(Number)

const LIFTS = [
  { slot: 'knownSquatKg', entry: 'Barbell Squats', family: 'squat', lift: 'back squat' },
  { slot: 'knownBenchKg', entry: 'Barbell Bench Press', family: 'bench', lift: 'bench press' },
  { slot: 'knownDeadliftKg', entry: 'Deadlifts', family: 'deadlift', lift: 'deadlift' },
] as const

/** What the plan prescribes for one lift at `reps` and `rpe`, when `keptKg` is the number kept for it. */
const prescribed = (entryName: string, family: string, keptKg: number, reps: number, rpe: number) => {
  const entry = EXERCISE_DATABASE.find(e => e.name === entryName)
  return entry
    ? prescribeLoad(entry, profile, { targetRpeLabel: `RPE ${rpe}`, repRangeLabel: String(reps), sets: 3, knownWorkingWeights: { [family]: keptKg } })
    : null
}

console.log('\n[1] What is kept means one thing: the sentence names the reps and the reserve the plan uses')
const note = workingWeightProfileNote()
const [saidReps, saidReserve] = numbersIn(note)
check('1a. Profile\'s note names about 10 reps (a literal: what the person reads)', saidReps === 10, note)
check('1b. ...and about 2 left in the tank, and that it is not a one-rep max', saidReserve === 2 && /not a one-rep max/i.test(note), note)
check('1c. a kept lift is said with what it means: "83 kg for about 10 reps"', liftAsStored(83) === '83 kg for about 10 reps', liftAsStored(83))
for (const lift of LIFTS) {
  const asSaid = prescribed(lift.entry, lift.family, 100, saidReps, 10 - saidReserve)
  check(`1d. ${lift.entry}: 100 kg kept is 100 kg prescribed for ${saidReps} reps with ${saidReserve} in reserve`,
    asSaid?.starting_weight_kg === 100 && asSaid?.load_source === 'known_weight', asSaid?.starting_weight_kg ?? 'no entry')
  // THE CONTRAST, so those numbers bind: read as a five-rep weight the same number would be heavier.
  const atFive = prescribed(lift.entry, lift.family, 100, 5, 10 - saidReserve)?.starting_weight_kg ?? 0
  check(`1e. ${lift.entry}: for 5 reps the plan asks for clearly more than the kept number (${atFive} kg)`, atFive >= 105, atFive)
  check(`1f. ${lift.entry}: the number is filed under the lift the box names`,
    hasKnownWorkingWeight(lift.family, { [lift.family]: 100 }) && !hasKnownWorkingWeight(lift.family, {}))
}

console.log('\n[2] A set is converted by the app, and the plan never asks for more than was lifted')
// Every set a person might type: at the reps they typed, taken to the limit, the plan's weight is at most theirs.
// The limit is the reading that makes this binding: a set with reps to spare only leaves more room.
const SETS: [number, number][] = [[140, 1], [120, 3], [100, 5], [90, 8], [80, 10], [70, 12], [60, 15]]
for (const lift of LIFTS) {
  let worst = { set: '', asked: 0, typed: 0 }
  let never = true
  for (const [kg, reps] of SETS) {
    const kept = referenceWeightFromSet(kg, reps)
    const asked = kept == null ? Infinity : prescribed(lift.entry, lift.family, kept, reps, 10)?.starting_weight_kg ?? Infinity
    // Plate rounding may land 2.5 kg either side; more than one plate step over what they lifted is a real overshoot.
    if (asked > kg + 2.5) never = false
    if (asked - kg > worst.asked - worst.typed || worst.set === '') worst = { set: `${kg} x ${reps}`, asked, typed: kg }
  }
  check(`2a. ${lift.entry}: across ${SETS.length} sets, the same reps to the limit are never asked heavier than was lifted`, never, worst)
}
check('2b. a five-rep set comes down: 100 kg for 5 is kept as 83 kg', referenceWeightFromSet(100, 5) === 83, referenceWeightFromSet(100, 5))
check('2c. a one-rep max comes down furthest: 140 kg for 1 is kept as 102.5 kg', referenceWeightFromSet(140, 1) === 102.5, referenceWeightFromSet(140, 1))
check('2d. twelve to the limit IS ten with two left: 82.5 kg for 12 is kept as 82.5 kg', referenceWeightFromSet(82.5, 12) === 82.5, referenceWeightFromSet(82.5, 12))
check('2e. more reps at the same weight is never kept lighter', [1, 3, 5, 8, 10, 12, 15].every((r, i, a) => i === 0 || referenceWeightFromSet(100, r)! >= referenceWeightFromSet(100, a[i - 1])!))
check('2f. the old reading is gone: 100 for 5 is NOT kept as 100', referenceWeightFromSet(100, 5)! < 95, referenceWeightFromSet(100, 5))
check(`2g. a set of more than ${LIFT_SET_MAX_REPS} reps, or none, or half a rep, is not used`,
  referenceWeightFromSet(100, LIFT_SET_MAX_REPS + 1) === null && referenceWeightFromSet(100, 0) === null && referenceWeightFromSet(100, 2.5) === null
  && referenceWeightFromSet(100, LIFT_SET_MAX_REPS) !== null)
check('2h. no weight is not a set', referenceWeightFromSet(0, 5) === null && referenceWeightFromSet(NaN, 5) === null)

console.log('\n[3] The reader takes a set, and never a bare number')
check('3a. "100 x 5", "100kg for 5" and "100 × 5 reps" read the same', ['100 x 5', '100kg for 5', '100 × 5 reps', '100*5'].every(t => parseLiftSet(t)?.value === 83),
  ['100 x 5', '100kg for 5', '100 × 5 reps', '100*5'].map(t => parseLiftSet(t)))
check('3b. pounds are converted, then the set: "225 lb x 3" is 79.5 kg', parseLiftSet('225 lb x 3')?.value === 79.5, parseLiftSet('225 lb x 3'))
check('3c. the receipt reads back what was typed: "from 225lb for 3"', parseLiftSet('225 lb x 3')?.from === '225lb for 3' && parseLiftSet('100 x 5')?.from === '100kg for 5',
  [parseLiftSet('225 lb x 3')?.from, parseLiftSet('100 x 5')?.from])
check('3d. A BARE NUMBER IS NOT READ: "100", "100kg" and "225 lb" are null', ['100', '100kg', '225 lb', '100 x', 'x 5', ''].every(t => parseLiftSet(t) === null),
  ['100', '100kg', '225 lb', '100 x', 'x 5', ''].map(t => parseLiftSet(t)))
check('3e. ...while the weight reader on its own still reads one (the detector is not vacuous)', parseLiftWeight('100')?.value === 100)
check('3f. "100 @ 8" is not a set (it reads as an effort, and guessing which is the old offence)', parseLiftSet('100 @ 8') === null, parseLiftSet('100 @ 8'))
check('3g. a set of 16, or of 0, is refused by the reader too', parseLiftSet('100 x 16') === null && parseLiftSet('100 x 0') === null)
for (const lift of LIFTS) check(`3h. ${lift.slot} is read by the set reader`, measureParserFor(lift.slot) === parseLiftSet)

console.log('\n[4] A set the setup coach passes must be the one they said')
check('4a. "I squat 100 for 5" allows "100 kg x 5"', liftSetInUserWords('100 kg x 5', 'I squat 100 for 5'))
check('4b. ...and not "100 kg x 8": the reps were never said', !liftSetInUserWords('100 kg x 8', 'I squat 100 for 5'))
check('4c. ...and not "105 kg x 5": the weight was never said', !liftSetInUserWords('105 kg x 5', 'I squat 100 for 5'))
check('4d. "I squat 100" allows no set at all, whatever reps the coach supplies', [1, 5, 10].every(r => !liftSetInUserWords(`100 x ${r}`, 'I squat 100')))
check('4e. "my max is 140" allows "140 x 1", from the word', liftSetInUserWords('140 x 1', 'my squat max is 140') && liftSetInUserWords('140 x 1', 'my 1RM is 140'))
check('4f. ...but a bare "140" does not', !liftSetInUserWords('140 x 1', 'I squat 140'))
check('4g. one number cannot be both the weight and the reps: "I do 10" does not allow "10 x 10"', !liftSetInUserWords('10 x 10', 'I do 10') && liftSetInUserWords('10 x 10', 'curls, 10 for 10'))

console.log('\n[5] Setup asks for a set, names the three lifts by the bar, and says what it kept')
const knows = getSlotDef('knowsWorkingLifts')
check('5a. the yes/no question names the barbell back squat, the bench press and the deadlift',
  /barbell back squat/i.test(knows?.question ?? '') && /bench press/i.test(knows?.question ?? '') && /deadlift/i.test(knows?.question ?? ''), knows?.question)
const yes = knows?.options?.find(o => String(o.value) === 'true')
check('5b. "I know my numbers" says what will be asked: a recent hard set for each', /recent hard set/.test(yes?.description ?? ''), yes?.description)
const ask = liftSetsAsk()
check('5c. the line over the boxes asks for the weight and the reps', /the weight, and how many reps you got/.test(ask), ask)
check('5d. ...says a one-rep max counts, as 1 rep', /one-rep max counts, put 1 rep/i.test(ask) && numbersIn(ask).join(',') === '1', ask)
check('5e. ...says the app works the starting weights out, and a lift may be left empty', /I'll work out your starting weights/.test(ask) && /Leave a lift empty/.test(ask), ask)
check('5f. ...and no longer asks for a ten-rep weight (the question it replaced)', !/10/.test(ask) && !/left in the tank/.test(ask), ask)
for (const lift of LIFTS) {
  const def = getSlotDef(lift.slot)
  check(`5g. ${lift.slot}: its own question asks for a set on that lift`, def?.question === liftSetQuestion(lift.lift) && /the weight, and how many reps/.test(def?.question ?? ''), def?.question)
  check(`5h. ${lift.slot}: the box is named for the lift on the bar`,
    /^Barbell /.test(WORKING_WEIGHT_LIFTS[lift.slot]) && new RegExp(lift.lift.split(' ').pop()!, 'i').test(WORKING_WEIGHT_LIFTS[lift.slot]), WORKING_WEIGHT_LIFTS[lift.slot])
  const shown = def ? displaySlotValue(def, { ...initialSlotValues(), [lift.slot]: '83' } as never) : ''
  check(`5i. ${lift.slot}: the summary shows the kept number with what it means`, shown === '83 kg for about 10 reps', shown)
}
const gymLifter = { ...initialSlotValues(), equipment: 'full_gym', trainingExperience: 'intermediate', activityLevel: 'moderate', knowsWorkingLifts: true }
const coachSquat = buildSlotCatalog(gymLifter as never).find(c => c.key === 'knownSquatKg')
check('5j. the question the setup coach is handed for the squat asks for a set', /the weight, and how many reps/.test(coachSquat?.question ?? ''), coachSquat?.question ?? 'not in the catalogue')
check('5k. each problem with a lift\'s boxes has its own sentence',
  new Set((['weight', 'reps', 'too_many', 'unread'] as const).map(liftSetProblem)).size === 4 && liftSetProblem('too_many').includes(String(LIFT_SET_MAX_REPS)))
check('5l. a lift from the coach with no set behind it says what is needed', /the weight, and the reps you got/.test(liftNeedsASet()), liftNeedsASet())

console.log('\n[6] The screens and the funnel (source; the drivers read the pixels)')
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const setup = stripComments(readFileSync('src/components/onboarding/ConversationalOnboarding.tsx', 'utf8'))
const card = stripComments(readFileSync('src/components/onboarding/SlotNumericCard.tsx', 'utf8'))
const profileScreen = stripComments(readFileSync('src/components/ProfileScreen.tsx', 'utf8'))
check('6a. the line over the lift boxes is the phrasebook\'s, called, and pushed with the boxes',
  /const LIFT_BOXES_ASK = liftSetsAsk\(\)/.test(setup) && (setup.match(/content: LIFT_BOXES_ASK, slotCard: 'knownSquatKg'/g) ?? []).length >= 2)
const coerce = setup.slice(setup.indexOf('function coerceSlotValue'), setup.indexOf('function conversionNoteFor'))
check('6b. the one funnel keeps nothing for a lift the reader could not read', /if \(isKnownLiftSlot\(def\.key\)\) return ''/.test(coerce), coerce.slice(-300))
check('6c. ...and empty fails every lift\'s bounds', LIFTS.every(l => getSlotDef(l.slot)?.validate('') === false && getSlotDef(l.slot)?.validate('83') === true))
const guard = setup.slice(setup.indexOf('const executeActions'), setup.indexOf('A load ceiling is only ever recorded'))
check('6d. the coach\'s route refuses a lift that is unread OR not in their words, before anything is kept',
  /isKnownLiftSlot\(key\) && \(coerced === '' \|\| !liftSetInUserWords\(String\(action\.args\.value \?\? ''\), userText\)\)/.test(guard) && /liftNeedsASet\(\)/.test(guard))
check('6e. each lift on the card has a weight box and a reps box', /id=\{`slot-\$\{d\.key\}`\}/.test(card) && /id=\{`slot-\$\{d\.key\}-reps`\}/.test(card))
check('6f. ...written as the text the reader takes', /`\$\{w\} x \$\{r\}`/.test(card))
check('6g. ...and a lift the reader did not read is never OK to save', /if \(ACCEPTS_UNITS\.has\(d\.key\) && !parsed\) return false/.test(card))
check('6h. the box label uses the lift\'s full name', /CARD_LABEL[^=]*= WORKING_WEIGHT_LIFTS/.test(card) && /const name = CARD_LABEL\[d\.key\] \?\? d\.shortLabel/.test(card))
check('6i. Profile draws the note under the three lifts, and names its rows from the same three names',
  /data-testid="known-lifts-meaning">\{workingWeightProfileNote\(\)\}/.test(profileScreen)
  && ['knownSquatKg', 'knownBenchKg', 'knownDeadliftKg'].every(k => profileScreen.includes(`<Row label={WORKING_WEIGHT_LIFTS.${k}}>`)))

console.log('\n[7] The setup coach is told the same (source only: whether it obeys is model behaviour)')
const coach = readFileSync('supabase/functions/onboarding-chat/index.ts', 'utf8')
const rule = coach.slice(coach.indexOf('A LIFT IS A SET, NEVER A BARE NUMBER'), coach.indexOf('If they type bare numbers anyway'))
check('7a. the rule is in the prompt, before the bare-numbers rule', rule.length > 200 && coach.indexOf('A LIFT IS A SET, NEVER A BARE NUMBER') > 0, rule.length)
check('7b. it names the three lifts', /barbell back squat/.test(rule) && /barbell bench press/.test(rule) && /barbell deadlift/.test(rule))
check('7c. the set is passed as said, and never worked out, rounded or given reps by the coach',
  /Pass the set to set_slot exactly as they said it/.test(rule) && /NEVER work the number out yourself/.test(rule) && /never supply reps they did not say/.test(rule))
check('7d. a weight with no reps records NOTHING', /A weight with no reps \("I squat 100"\) records NOTHING/.test(rule))
check('7e. the older line that took a named bare number is gone', !/"squat 100, bench 150" — that is stated/.test(coach) && !/One lift asked and one number back is unambiguous; take it/.test(coach))
// The examples the coach is shown must be ones the app would take, or the rule teaches a shape that is refused.
const examples = [...rule.matchAll(/"(\d[^"]*? x \d+)"/g)].map(m => m[1])
check('7f. every example set in the rule is one the reader takes', examples.length >= 3 && examples.every(e => parseLiftSet(e) !== null), examples)

console.log(`\n${ran} checks ran, ${failures} failed`)
if (failures > 0) process.exit(1)

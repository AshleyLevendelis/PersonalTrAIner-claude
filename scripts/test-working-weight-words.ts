// ---------------------------------------------------------------------------
// WHAT SETUP MEANS BY A "WORKING WEIGHT", AND THAT THE PLAN MEANS THE SAME.
//
// Ashley, 11 Nov 2026: "During onboarding when it asks for my working weights
// it's not clear to the user what it means. Did it want my 1 rep max or a
// couple in reserve etc. Also which exercises exactly."
//
// Traced: the plan reads a typed lift as the weight for about 10 reps at RPE 8
// (two in reserve), skips the calibration week on it and trusts it over its own
// estimate. Nothing on screen said so, so a one-rep max typed there would start
// a block far too heavy.
//
// THE PROPERTY, not the wording: the reps and the reserve the sentence NAMES
// are fed to the real prescriber, and the number typed must be the number
// prescribed. If the engine's reference moves, or the sentence does, this
// fails. A contrast at five reps shows the reps in the sentence bind.
//
// A gate has exactly one exit, at the bottom.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { prescribeLoad, hasKnownWorkingWeight } from '../src/lib/load-prescription'
import { EXERCISE_DATABASE } from '../src/lib/exercise-db'
import {
  WORKING_WEIGHT_REPS, WORKING_WEIGHT_IN_RESERVE, WORKING_WEIGHT_LIFTS,
  workingWeightMeans, workingWeightBoxesAsk, workingWeightQuestion, workingWeightProfileNote,
} from '../src/lib/coach-voice'
import { getSlotDef, buildSlotCatalog, initialSlotValues } from '../src/lib/onboarding-slots'
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

// The three lifts: the box's name, the catalogue entry it anchors, and the family the typed number is filed under.
const LIFTS = [
  { slot: 'knownSquatKg', entry: 'Barbell Squats', family: 'squat', verb: 'back squat' },
  { slot: 'knownBenchKg', entry: 'Barbell Bench Press', family: 'bench', verb: 'bench press' },
  { slot: 'knownDeadliftKg', entry: 'Deadlifts', family: 'deadlift', verb: 'deadlift' },
] as const

console.log('\n[1] The sentence says a number of reps and a number left in the tank, and says it is not a max')
const means = workingWeightMeans()
const [saidReps, saidReserve] = numbersIn(means)
check('1a. the meaning names exactly two numbers', numbersIn(means).length === 2, means)
check('1b. it names about 10 reps (a literal: what the person reads)', saidReps === 10, means)
check('1c. ...and about 2 left in the tank', saidReserve === 2, means)
check('1d. the constants are the numbers in the sentence', saidReps === WORKING_WEIGHT_REPS && saidReserve === WORKING_WEIGHT_IN_RESERVE)
check('1e. the line over the boxes carries the meaning whole', workingWeightBoxesAsk().includes(means), workingWeightBoxesAsk())
check('1f. ...and says it is not a one-rep max', /not your one-rep max/i.test(workingWeightBoxesAsk()), workingWeightBoxesAsk())
check('1g. ...and still says kg or lb, and that a box may be left empty',
  /kg/.test(workingWeightBoxesAsk()) && /lb/.test(workingWeightBoxesAsk()) && /leave a box empty/i.test(workingWeightBoxesAsk()))
check('1h. Profile\'s note carries the meaning and "not a one-rep max"',
  workingWeightProfileNote().includes(means) && /not a one-rep max/i.test(workingWeightProfileNote()), workingWeightProfileNote())

console.log('\n[2] The plan means the same: at the reps and reserve the sentence names, the number typed is the number prescribed')
const TYPED = 100
for (const lift of LIFTS) {
  const entry = EXERCISE_DATABASE.find(e => e.name === lift.entry)
  const known = { [lift.family]: TYPED }
  const at = (reps: number, rpe: number) => entry
    ? prescribeLoad(entry, profile, { targetRpeLabel: `RPE ${rpe}`, repRangeLabel: String(reps), sets: 3, knownWorkingWeights: known })
    : null
  const asSaid = at(saidReps, 10 - saidReserve)
  check(`2a. ${lift.entry} is in the catalogue`, !!entry)
  check(`2b. ${lift.entry}: ${TYPED} kg typed is ${TYPED} kg prescribed for ${saidReps} reps with ${saidReserve} in reserve`,
    asSaid?.starting_weight_kg === TYPED, asSaid?.starting_weight_kg ?? 'no entry')
  check(`2c. ...and it is marked as coming from the number given`, asSaid?.load_source === 'known_weight', asSaid?.load_source ?? 'no entry')
  // THE CONTRAST, so the reps in the sentence bind: the same number read as a five-rep weight would be heavier.
  const atFive = at(5, 10 - saidReserve)?.starting_weight_kg ?? 0
  check(`2d. ${lift.entry}: for 5 reps the plan asks for clearly more than was typed (${atFive} kg)`, atFive >= TYPED + 5, atFive)
  // ...and so does the reserve: the same reps taken to the limit would be heavier still.
  const toFailure = at(saidReps, 10)?.starting_weight_kg ?? 0
  check(`2e. ${lift.entry}: with nothing left in the tank it asks for more than was typed (${toFailure} kg)`, toFailure > TYPED, toFailure)
  check(`2f. ${lift.entry}: the number is filed under the lift the box names`,
    !!entry && hasKnownWorkingWeight(lift.family, known) && !hasKnownWorkingWeight(lift.family, {}))
}

console.log('\n[3] Setup asks in those words, and names the three lifts by the bar')
const knows = getSlotDef('knowsWorkingLifts')
check('3a. the yes/no question names the barbell back squat, the bench press and the deadlift',
  /barbell back squat/i.test(knows?.question ?? '') && /bench press/i.test(knows?.question ?? '') && /deadlift/i.test(knows?.question ?? ''), knows?.question)
const yes = knows?.options?.find(o => String(o.value) === 'true')
check('3b. "I know my numbers" says which number: what I lift for about 10 reps',
  numbersIn(yes?.description ?? '').includes(saidReps) && /reps/.test(yes?.description ?? ''), yes?.description)
for (const lift of LIFTS) {
  const def = getSlotDef(lift.slot)
  check(`3c. ${lift.slot}: its own question is the phrasebook's, with the reps and the reserve`,
    def?.question === workingWeightQuestion(lift.verb) && numbersIn(def?.question ?? '').join(',') === `${saidReps},${saidReserve}`, def?.question)
  check(`3d. ${lift.slot}: the box is named for the lift on the bar`,
    /^Barbell /.test(WORKING_WEIGHT_LIFTS[lift.slot]) && new RegExp(lift.verb.split(' ').pop()!, 'i').test(WORKING_WEIGHT_LIFTS[lift.slot]), WORKING_WEIGHT_LIFTS[lift.slot])
}
// The setup coach is handed the catalogue's question for each slot it may ask: the meaning travels with it.
const gymLifter = { ...initialSlotValues(), equipment: 'full_gym', trainingExperience: 'intermediate', activityLevel: 'moderate', knowsWorkingLifts: true }
const catalogue = buildSlotCatalog(gymLifter as never)
const coachSquat = catalogue.find(c => c.key === 'knownSquatKg')
check('3e. the question the setup coach is handed for the squat names the reps and the reserve',
  numbersIn(coachSquat?.question ?? '').join(',') === `${saidReps},${saidReserve}`, coachSquat?.question ?? 'not in the catalogue')

console.log('\n[4] The screens draw those words (source; the drivers read the pixels)')
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const setup = stripComments(readFileSync('src/components/onboarding/ConversationalOnboarding.tsx', 'utf8'))
const card = stripComments(readFileSync('src/components/onboarding/SlotNumericCard.tsx', 'utf8'))
const profileScreen = stripComments(readFileSync('src/components/ProfileScreen.tsx', 'utf8'))
check('4a. the line over the lift boxes is the phrasebook\'s, called', /const LIFT_BOXES_ASK = workingWeightBoxesAsk\(\)/.test(setup))
check('4b. ...and that line is what is pushed with the boxes', (setup.match(/content: LIFT_BOXES_ASK, slotCard: 'knownSquatKg'/g) ?? []).length >= 2)
check('4c. the box label uses the lift\'s full name where there is one', /\{CARD_LABEL\[d\.key\] \?\? d\.shortLabel\}/.test(card) && /CARD_LABEL[^=]*= WORKING_WEIGHT_LIFTS/.test(card))
check('4d. Profile draws the note under the three lifts', /data-testid="known-lifts-meaning">\{workingWeightProfileNote\(\)\}/.test(profileScreen))
check('4e. ...and names its rows from the same three names',
  ['knownSquatKg', 'knownBenchKg', 'knownDeadliftKg'].every(k => profileScreen.includes(`<Row label={WORKING_WEIGHT_LIFTS.${k}}>`)))

console.log('\n[5] The setup coach is told the same, and never to record a max (source only: whether it obeys is model behaviour)')
const coach = readFileSync('supabase/functions/onboarding-chat/index.ts', 'utf8')
const rule = coach.slice(coach.indexOf('WHAT A WORKING WEIGHT IS'), coach.indexOf('If they type bare numbers anyway'))
check('5a. the rule is in the prompt, before the bare-numbers rule', rule.length > 200 && coach.indexOf('WHAT A WORKING WEIGHT IS') > 0, rule.length)
check('5b. it states the same reps and reserve', rule.includes(`about ${saidReps} good reps with about ${saidReserve} left in the tank`), rule.slice(0, 200))
check('5c. it names the three lifts', /barbell back squat/.test(rule) && /barbell bench press/.test(rule) && /barbell deadlift/.test(rule))
check('5d. a max, or a weight for other reps, is recorded as NOTHING and never converted',
  /record NOTHING for that lift/.test(rule) && /Never convert it yourself/.test(rule))

console.log(`\n${ran} checks ran, ${failures} failed`)
if (failures > 0) process.exit(1)

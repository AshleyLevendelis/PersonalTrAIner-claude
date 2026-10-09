// ---------------------------------------------------------------------------
// Gate: what the onboarding writes back to the person says what was stored.
//
// From the 9 Oct 2026 test log:
//   L2  ticks carried no units — "Heaviest dumbbells — 24", "Height — 178",
//       "Weight — 82".
//   L3  "Sure — pick a different equipment." and "Sure — type what you'd like
//       foods to avoid to be instead." (the allergy tick is NOT covered here:
//       that wording is the allergen path and is the owner's).
//   L5  "3 meals and one snack" ticked as "Meals a day — 3 meals".
//   L6  two near-identical goals saved from one sentence.
//   M5  "40 minutes tops, hard stop" stored as the 30-45 setting with nothing
//       saying that setting can run to 45.
//
// Every check here CALLS the function that produces the words. The screen
// half is verify:onboarding-turns.
// ---------------------------------------------------------------------------

import {
  ONBOARDING_SLOTS,
  displaySlotValue,
  editPromptFor,
  getSlotDef,
  initialSlotValues,
  type OnboardingSlotValues,
} from '../src/lib/onboarding-slots'
import {
  SESSION_BAND_MINUTES,
  mealCountIn,
  mergePendingGoal,
  sessionLengthNote,
  snackAnswerIn,
} from '../src/lib/onboarding-capture'
import { SESSION_MAXIMUM_SECONDS, SESSION_MINIMUM_SECONDS } from '../src/lib/session-duration'
import type { PendingGoal } from '../src/lib/onboarding-draft-store'
import type { SessionDuration } from '../src/lib/types'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}
const shown = (key: string, over: Partial<OnboardingSlotValues>) =>
  displaySlotValue(getSlotDef(key)!, { ...initialSlotValues(), ...over } as OnboardingSlotValues)

console.log('\n1. L2 — a number is shown with its unit')
{
  check('Heaviest dumbbells — 24 kg', shown('maxDumbbellKg', { maxDumbbellKg: '24' }) === '24 kg', shown('maxDumbbellKg', { maxDumbbellKg: '24' }))
  check('Height — 178 cm', shown('heightCm', { heightCm: '178' }) === '178 cm', shown('heightCm', { heightCm: '178' }))
  check('Weight — 82 kg', shown('weightKg', { weightKg: '82' }) === '82 kg', shown('weightKg', { weightKg: '82' }))
  // Every numeric answer, not the three the tester happened to see. Age is
  // the one number that needs no unit to be understood.
  const bare = ONBOARDING_SLOTS
    .filter(s => s.control === 'numeric' && s.key !== 'age')
    .filter(s => !/^\d+ (kg|cm)$/.test(displaySlotValue(s, { ...initialSlotValues(), [s.key]: '50' } as OnboardingSlotValues)))
    .map(s => s.key)
  check('...and so is every other numeric answer the app stores', bare.length === 0, bare)
  check('there are enough of them for that to mean something',
    ONBOARDING_SLOTS.filter(s => s.control === 'numeric').length >= 9, ONBOARDING_SLOTS.filter(s => s.control === 'numeric').length)
  check('an age stays an age', shown('age', { age: '31' }) === '31')
  check('an unanswered number is a dash, not "undefined kg"', shown('weightKg', {}) === '—', shown('weightKg', {}))
  check('a closed-set answer is still its label', shown('equipment', { equipment: 'minimalist' }) === 'Minimalist')
  check('...and a list still reads as a list', shown('trainingDays', { trainingDays: ['Mon', 'Wed'] }) === 'Mon, Wed')
}

console.log('\n2. L3 — the prompt for changing an answer reads as English, for every question')
{
  const prompts = ONBOARDING_SLOTS.map(s => [s.key, editPromptFor(s)] as const)
  const broken = prompts.filter(([, p]) => /pick a different|to be instead|a different [a-z]+s\b/i.test(p))
  check('no prompt is a sentence built around a label', broken.length === 0, broken)
  check('the two the tester quoted',
    editPromptFor(getSlotDef('equipment')!) === "Sure — let's change that. What equipment do you have access to?"
    && editPromptFor(getSlotDef('dislikedFoods')!) === "Sure — let's change that. Anything else you'd rather I left out? Type it in below.",
    [editPromptFor(getSlotDef('equipment')!), editPromptFor(getSlotDef('dislikedFoods')!)])
  const typed = prompts.filter(([k]) => getSlotDef(k)!.control === 'text')
  check('an answer that has to be typed says so', typed.length >= 3 && typed.every(([, p]) => /Type it in below\.$/.test(p)), typed)
  check('...and one with buttons does not', prompts.filter(([k]) => getSlotDef(k)!.control !== 'text').every(([, p]) => !/Type it/.test(p)))
  check('every prompt ends on the question itself or the instruction', prompts.every(([, p]) => /[?.]$/.test(p)), prompts.filter(([, p]) => !/[?.]$/.test(p)))
}

console.log('\n3. L5 — snacks said in passing')
{
  const YES = ['3 meals and one snack', 'three meals plus a snack', '3 meals + snacks', 'probably 4 meals with a couple of snacks', 'two meals, and snacks too']
  const NO = ['3 meals, no snacks', 'three meals and no snacks', 'just meals only please', 'I don\'t snack', '4 meals without snacks']
  const SILENT = ['3 meals', 'I like food', 'I snack too much at night, that is the problem', 'no snacks at work but a snack and a coffee after training']
  for (const t of YES) check(`"${t}" → snacks`, snackAnswerIn(t) === true, snackAnswerIn(t))
  for (const t of NO) check(`"${t}" → no snacks`, snackAnswerIn(t) === false, snackAnswerIn(t))
  for (const t of SILENT) check(`"${t}" → not an answer`, snackAnswerIn(t) === undefined, snackAnswerIn(t))
  check('the meal count is read with it', mealCountIn('3 meals and one snack') === 3 && mealCountIn('four meals, no snacks') === 4)
  check('...but never guessed from two numbers', mealCountIn('2 meals, sometimes 3 meals') === undefined)
  check('...or from a number the app does not offer', mealCountIn('6 meals and a snack') === undefined && mealCountIn('one meal') === undefined)
}

console.log('\n4. L6 — one sentence, one goal')
{
  const g = (displayText: string, rawPhrase: string, over: Partial<PendingGoal> = {}): PendingGoal =>
    ({ metric: 'directional', displayText, rawPhrase, ...over })
  const said = "I want to get to 12% body fat and I'm struggling to lose weight"
  let goals = mergePendingGoal([], g('get to 12% body fat', said))
  goals = mergePendingGoal(goals, g('reach 12% body fat (fat loss)', 'get to 12% body fat'))
  check('the tester\'s case: two wordings of one body-fat goal are one goal', goals.length === 1, goals.map(x => x.displayText))
  check('...keeping the one that says more', goals[0]?.displayText === 'reach 12% body fat (fat loss)', goals[0]?.displayText)

  const weight = mergePendingGoal(
    [g('drop to 80kg', 'I want to drop to 80kg')],
    g('get from 86kg to 80kg', 'I want to drop to 80kg', { metric: 'body_weight_kg', baselineValue: 86, targetValue: 80 }))
  check('a direction and a number for the same target are one goal', weight.length === 1, weight.map(x => x.displayText))
  check('...and the measurable one is the one kept', weight[0]?.metric === 'body_weight_kg' && weight[0]?.targetValue === 80, weight[0])
  const keptMeasurable = mergePendingGoal(weight, g('drop to 80kg', 'I want to drop to 80kg'))
  check('...whichever order they arrive in', keptMeasurable.length === 1 && keptMeasurable[0]?.metric === 'body_weight_kg', keptMeasurable)
  const corrected = mergePendingGoal(weight, g('get to 78kg', 'actually make it 78', { metric: 'body_weight_kg', targetValue: 78 }))
  check('a second target weight replaces the first', corrected.length === 1 && corrected[0]?.targetValue === 78, corrected)

  const two = mergePendingGoal([g('lose 6kg', 'lose 6kg and run a 5k')], g('run a 5k', 'lose 6kg and run a 5k'))
  check('two different goals from one sentence are both kept', two.length === 2, two.map(x => x.displayText))
  const twoBuilds = mergePendingGoal([g('build muscle', 'build muscle and build endurance')], g('build endurance', 'build muscle and build endurance'))
  check('...even when they share a verb', twoBuilds.length === 2, twoBuilds.map(x => x.displayText))
  const later = mergePendingGoal([g('get to 12% body fat', said)], g('do a pull-up by Christmas', 'I\'d love to do a pull-up by Christmas'))
  check('an unrelated goal said later is added', later.length === 2)
  const input = [g('get to 12% body fat', said)]
  mergePendingGoal(input, g('reach 12% body fat (fat loss)', said))
  check('the list it is given is not changed in place', input.length === 1 && input[0].displayText === 'get to 12% body fat')
}

console.log('\n5. M5 — an exact length recorded as a setting says what the setting allows')
{
  const tops = sessionLengthNote('30-45', '40 minutes tops, hard stop')
  check('"40 minutes tops" on the 30-45 setting names 40 and the 45 it can run to',
    !!tops && /40 minutes/.test(tops) && /run to 45/.test(tops), tops)
  check('the setting\'s own upper limit needs no note', sessionLengthNote('30-45', 'I have 45 minutes') === undefined)
  check('the setting typed out in full needs no note', sessionLengthNote('30-45', 'about 30-45 minutes') === undefined && sessionLengthNote('30-45', '30 to 45 mins') === undefined)
  check('a narrower range is read by its top: "35-40 minutes" can still run to 45',
    /40 minutes/.test(sessionLengthNote('30-45', 'about 35-40 minutes') ?? '') && /run to 45/.test(sessionLengthNote('30-45', 'about 35-40 minutes') ?? ''),
    sessionLengthNote('30-45', 'about 35-40 minutes'))
  check('no figure, no note', sessionLengthNote('45-60', 'not long, I have kids') === undefined)
  check('two figures are not one exact length', sessionLengthNote('30-45', '40 minutes, or 60 minutes at weekends') === undefined)
  const short = sessionLengthNote('30-45', 'I only get 20 minutes')
  check('a length shorter than the shortest setting is told the setting runs longer',
    !!short && /20 minutes/.test(short) && /30 to 45/.test(short), short)
  check('"an hour" on the 45-60 setting is the limit, so nothing to add', sessionLengthNote('45-60', 'about an hour') === undefined)
  check('"50 minutes" on it can run to 60', /run to 60/.test(sessionLengthNote('45-60', '50 minutes') ?? ''))
  // The numbers in those sentences are the ENGINE's. Restated in the onboarding
  // module only to keep the exercise catalogue out of its chunk; held equal here.
  const drift = (Object.keys(SESSION_BAND_MINUTES) as SessionDuration[]).filter(k =>
    SESSION_BAND_MINUTES[k][0] * 60 !== SESSION_MINIMUM_SECONDS[k] || SESSION_BAND_MINUTES[k][1] * 60 !== SESSION_MAXIMUM_SECONDS[k])
  check('the minutes quoted are the engine\'s own minimum and ceiling for each setting', drift.length === 0, drift)
  check('...for all four settings', Object.keys(SESSION_BAND_MINUTES).length === Object.keys(SESSION_MAXIMUM_SECONDS).length)
}

console.log(`\n${ran} checks ran.`)
if (failures > 0) {
  console.error(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('What the onboarding writes back matches what it stored.')

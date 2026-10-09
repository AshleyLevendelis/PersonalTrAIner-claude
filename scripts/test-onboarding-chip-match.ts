// ---------------------------------------------------------------------------
// Gate: the card under a coach message belongs to the question that message
// asks — decided by the app from the words, never left to the model.
//
// Test log H14, 9 Oct 2026: "how old are you, and what are your current height
// and weight?" above chips reading 2 meals / 3 meals / 4 meals; two turns
// later the real meals question arrived with no chips. And M2: a question
// re-asked after a detour kept its chips on the older message, off screen.
//
// This calls the real chooser (src/lib/onboarding-chip-match.ts). The screen
// half — that the chosen card is the one rendered, exactly once, under the
// newest asking and inside the viewport — is verify:onboarding-turns.
//
// THE CORPUS BELOW IS NOT MEASURED AGAINST THE LIVE MODEL. The sandbox cannot
// reach it. The sentences are the prompt's own examples, the repo's fixtures,
// the tester's quotes, and paraphrases in the same register. A real phrasing
// that loses its chips shows up as a console warning in the app ("chips
// withheld") and belongs in this list.
// ---------------------------------------------------------------------------

import {
  ONBOARDING_SLOTS,
  initialSlotValues,
  numericGroupFor,
  type OnboardingSlotValues,
  type SlotKey,
} from '../src/lib/onboarding-slots'
import { chooseCard, questionAsksSlot, questionPartOf } from '../src/lib/onboarding-chip-match'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

// Sam, the tester's persona, at the turn H14 was seen: a home trainer on the
// no-barbell tier, everything up to recovery answered.
const SAM: OnboardingSlotValues = {
  ...initialSlotValues(),
  displayName: 'Sam', fitnessGoal: 'fat_loss', trainingExperience: 'intermediate',
  activityLevel: 'moderate', equipment: 'minimalist', injuries: [],
  trainingDays: ['Mon', 'Wed', 'Fri'], sessionDuration: '30-45',
  trainingStyle: 'functional', conditioningPreference: 'tolerate', recoveryCapacity: 'moderate',
}
const SAM_ANSWERED = new Set([
  'displayName', 'fitnessGoal', 'trainingExperience', 'activityLevel', 'equipment', 'injuries',
  'trainingDays', 'sessionDuration', 'trainingStyle', 'conditioningPreference', 'recoveryCapacity',
])
const pick = (hostText: string | undefined, requested: string[], over: Partial<Parameters<typeof chooseCard>[0]> = {}) =>
  chooseCard({
    hostText, requested, liveCards: [], values: SAM, confirmed: SAM_ANSWERED,
    corrected: new Set(), cardedThisTurn: [], ...over,
  })
/** Nothing answered yet, so every question is open. */
const fresh = (hostText: string, requested: string[], over: Partial<Parameters<typeof chooseCard>[0]> = {}) =>
  chooseCard({
    hostText, requested, liveCards: [],
    // Barbell-capable and not a beginner, so the lift questions apply too.
    values: { ...initialSlotValues(), equipment: 'full_gym', trainingExperience: 'intermediate', activityLevel: 'moderate', knowsWorkingLifts: true },
    confirmed: new Set(), corrected: new Set(), cardedThisTurn: [], ...over,
  })

console.log('\n1. H14 — the turn the tester saw')
{
  const H14 = 'Decent sleep goes a long way. How old are you, and what are your current height and weight?'
  check('the meals card is refused under the age / height / weight question', pick(H14, ['mealsPerDay']) !== 'mealsPerDay', pick(H14, ['mealsPerDay']))
  check('...and the card shown is the age / height / weight one', pick(H14, ['mealsPerDay']) === 'age', pick(H14, ['mealsPerDay']))
  check('when both legs asked, the request that fits the words wins whichever came first',
    pick('Which should I use for the maths — male or female?', ['mealsPerDay', 'gender']) === 'gender'
    && pick('Which should I use for the maths — male or female?', ['gender', 'mealsPerDay']) === 'gender')
  check('the real meals question gets its chips', pick('On to food. How many meals a day suits you?', ['mealsPerDay']) === 'mealsPerDay')
  check('a question that belongs to no slot gets no card, whatever was asked for',
    pick("Glad it's steady. What's the longest you've ever stuck with a routine?", ['mealsPerDay']) === undefined)
  check('...including when nothing was asked for', pick('What made the last plan fall apart?', []) === undefined)
}

console.log('\n2. Every question the app can ask is recognised as itself')
{
  // The server's deterministic floor and the client's own fallbacks ask in
  // these exact words, so a slot that failed its own question would lose its
  // chips on the turns that exist to rescue a stalled conversation.
  const own = ONBOARDING_SLOTS.filter(s => !questionAsksSlot(s.key, questionPartOf(s.question))).map(s => s.key)
  check('each slot\'s own question asks that slot', own.length === 0, own)
  const carded = ONBOARDING_SLOTS.filter(s => s.control !== 'text')
  const lost = carded.filter(s => {
    // Two people between them are asked every question: a lifter with a home
    // barbell, and someone starting from nothing (the only person asked where
    // they want to start).
    const lifter = { ...initialSlotValues(), equipment: 'home_gym', trainingExperience: 'intermediate', activityLevel: 'moderate', knowsWorkingLifts: true } as OnboardingSlotValues
    const starter = { ...initialSlotValues(), equipment: 'bodyweight', trainingExperience: 'beginner', activityLevel: 'sedentary', fitnessGoal: 'fat_loss' } as OnboardingSlotValues
    const values = s.key === 'startPreference' ? starter : lifter
    const got = chooseCard({ hostText: `Right, next thing I need — ${s.question}`, requested: [s.key], liveCards: [], values, confirmed: new Set(), corrected: new Set(), cardedThisTurn: [] })
    return !got || !numericGroupFor(s.key).includes(got)
  }).map(s => s.key)
  check('...and gets its own card when asked in those words', lost.length === 0, lost)
  check('there are enough carded questions for this to mean something', carded.length >= 20, carded.length)
}

console.log('\n3. The coach\'s own phrasings (the prompt\'s examples and the repo\'s fixtures)')
{
  const CORPUS: Array<[string, SlotKey]> = [
    ['Nice to meet you, Ashley. What are we aiming at?', 'fitnessGoal'],
    ['And what are you actually after — dropping weight, building?', 'fitnessGoal'],
    ['Have you trained before, or is this new to you?', 'trainingExperience'],
    ['How long have you been lifting?', 'trainingExperience'],
    ['and outside the gym — are you on your feet much, or mostly desk?', 'activityLevel'],
    ['Where do you train — a gym, or at home?', 'equipment'],
    ['What kit have you got to work with?', 'equipment'],
    ['Anything that bothers you when you train, or that you work around?', 'injuries'],
    ['Any niggles I should know about?', 'injuries'],
    ['Do you know your numbers for squat, bench and deadlift?', 'knowsWorkingLifts'],
    ["Since you know your numbers, let's get those logged — what are your current working weights for your squat, bench, and deadlift?", 'knownSquatKg'],
    ['Which days really work for you?', 'trainingDays'],
    ['How many days a week can you realistically train?', 'trainingDays'],
    ['Three days and coming back from a year out — how long have you realistically got on those days?', 'sessionDuration'],
    ["since you've only got three days, session length decides a lot — how long can you usually stay?", 'sessionDuration'],
    ['So — how do you like to train?', 'trainingStyle'],
    ['How do you feel about cardio?', 'conditioningPreference'],
    ["And how's your sleep and stress at the moment?", 'recoveryCapacity'],
    ['Could you tell me your age, height, and what you weigh right now?', 'age'],
    ['How tall are you, and what do you weigh?', 'age'],
    ['Which should I use for your calorie maths — male or female?', 'gender'],
    ['How many meals a day suits you?', 'mealsPerDay'],
    ['Any allergies or dietary restrictions I should build around?', 'dietaryPreferences'],
    ['How much time do you want to spend cooking?', 'cookingTime'],
    ['Snacks too, or meals only?', 'includeSnacks'],
    ["What's breakfast usually like for you?", 'breakfastStyle'],
  ]
  for (const [text, key] of CORPUS) {
    const got = fresh(text, [key])
    check(`"${text.slice(0, 58)}…" keeps its ${key} card`, !!got && numericGroupFor(key).includes(got), got)
  }
}

console.log('\n4. A request for the WRONG question never puts chips under these')
{
  // [message, the card the model wrongly asked for]. In each the words ask
  // about something else, so the wrongly requested card must not be chosen.
  const MISMATCH: Array<[string, SlotKey]> = [
    ['How old are you, and what are your current height and weight?', 'mealsPerDay'],
    ["since you've only got three days, session length decides a lot — how long can you usually stay?", 'trainingDays'],
    ['How long have you been training?', 'sessionDuration'],
    ['How much time do you want to spend cooking?', 'sessionDuration'],
    ['Got a goal weight in mind, or just lighter?', 'age'],
    ['Is conditioning something you enjoy, or more a necessary evil?', 'fitnessGoal'],
    ['Which days really work for you?', 'equipment'],
    ['How many meals a day suits you?', 'dietaryPreferences'],
    ["What have you tried before, and what made it fall apart?", 'trainingStyle'],
    ['How do you like to train?', 'conditioningPreference'],
  ]
  for (const [text, wrong] of MISMATCH) {
    const got = fresh(text, [wrong])
    check(`"${text.slice(0, 50)}…" does not get the ${wrong} card`, !got || !numericGroupFor(wrong).includes(got), got)
  }
  check('...and a reaction that mentions an earlier answer is not mistaken for a question about it',
    fresh('Three days is plenty to work with. How long have you got on those days?', ['trainingDays']) === 'sessionDuration')
}

console.log('\n5. M2 — a re-asked question brings its card along')
{
  const before = { ...SAM, sessionDuration: null, trainingStyle: null, conditioningPreference: null, recoveryCapacity: null } as OnboardingSlotValues
  const answered = new Set(['displayName', 'fitnessGoal', 'trainingExperience', 'activityLevel', 'equipment', 'injuries', 'trainingDays'])
  const reask = "Good question, and I'll answer it properly once we're set up. Back to those three days: how long can your sessions usually run?"
  const base = { values: before, confirmed: answered, corrected: new Set<string>(), cardedThisTurn: [] as string[] }
  check('an older unanswered card does not stop the re-ask getting one',
    chooseCard({ ...base, hostText: reask, requested: ['sessionDuration'], liveCards: ['sessionDuration'] }) === 'sessionDuration')
  check('the card follows the question even when the model forgot to ask for it',
    chooseCard({ ...base, hostText: reask, requested: [], liveCards: ['sessionDuration'] }) === 'sessionDuration')
  check('...but a detour that does not re-ask moves nothing',
    chooseCard({ ...base, hostText: "Good question. I'll come back to it once we're set up.", requested: [], liveCards: ['sessionDuration'] }) === undefined)
  check('...and nothing is conjured for a question that never had a card',
    chooseCard({ ...base, hostText: reask, requested: [], liveCards: [] }) === undefined)
}

console.log('\n6. The older rules still hold')
{
  check('an answered question is not re-offered', pick('How do you feel about cardio?', ['conditioningPreference']) === undefined)
  check('...unless this turn corrected it (Ashley, 30 Aug 2026: show the buttons again)',
    pick("You picked It's fine — let's fix that. How do you feel about cardio?", ['conditioningPreference'], { corrected: new Set(['conditioningPreference']) }) === 'conditioningPreference')
  check('...and a correction re-ask that only names the old option still gets its buttons',
    fresh('You picked Advanced, let me fix that — which one is you?', ['trainingExperience'],
      { confirmed: new Set(['trainingExperience']), corrected: new Set(['trainingExperience']) }) === 'trainingExperience')
  check('a slot never gets two cards in one turn',
    pick('How many meals a day suits you?', ['mealsPerDay'], { cardedThisTurn: ['mealsPerDay'] }) === undefined)
  check('a question that no longer applies is refused',
    pick('Do you know your numbers for squat, bench and deadlift?', ['knowsWorkingLifts']) === undefined)
  check('an unknown key is ignored rather than crashing', pick('How many meals a day suits you?', ['notASlot']) === 'mealsPerDay')
  check('a turn with no words at all still shows what the model asked for (its own question is printed with it)',
    pick(undefined, ['mealsPerDay']) === 'mealsPerDay')
  check('a grouped card is keyed on a member that is still unanswered',
    pick('And how tall are you, and what do you weigh?', ['age'], { values: { ...SAM, age: '31' }, confirmed: new Set([...SAM_ANSWERED, 'age']) }) === 'heightCm'
    && pick('And how tall are you, and what do you weigh?', ['heightCm'], { values: { ...SAM, age: '31' }, confirmed: new Set([...SAM_ANSWERED, 'age']) }) === 'heightCm')
}

console.log('\n7. Only the asking part of a message is read')
{
  check('the reaction is left out', questionPartOf('Three days is plenty. How long have you got?') === 'How long have you got?')
  check('two questions in one turn are both kept', questionPartOf('Which days work? And how long have you got?') === 'Which days work? And how long have you got?')
  check('with no question mark, the last sentence stands in', questionPartOf('Good. Tell me which days work.') === 'Tell me which days work.')
  check('an empty message asks nothing', questionPartOf('') === '')
}

console.log(`\n${ran} checks ran.`)
if (failures > 0) {
  console.error(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('Chips only ever sit under the question they answer.')

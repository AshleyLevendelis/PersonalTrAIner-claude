// ---------------------------------------------------------------------------
// Gate: setup puts ONE question in front of him at a time, and a weight with no set behind it is asked about.
//
// His setup, 13 Nov 2026: "it asked me working weights and I gave a number but it didn't clarify which exercise I
// meant ... then it started asking multiple questions at once which broke the process." This calls the pure rules in
// src/lib/onboarding-one-question.ts. The screen half (the app's real turn, at 390px, his three moments and a whole
// setup) is verify:onboarding-one-question.
// ---------------------------------------------------------------------------
import {
  bareLiftWeight,
  coachAskedSetupQuestion,
  dropCoachQuestions,
  namedLiftSets,
  questionsInTurn,
  withoutQuestions,
} from '../src/lib/onboarding-one-question'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

console.log('\n1. A weight with no set behind it')
{
  const bare = (t: string) => bareLiftWeight(t)
  check('his "110kg" is a bare weight', JSON.stringify(bare('110kg')) === JSON.stringify({ weight: '110 kg' }), bare('110kg'))
  check('...and "about 110", "110 kilos", "225 lb"', bare('about 110')?.weight === '110 kg' && bare('110 kilos')?.weight === '110 kg' && bare('225 lb')?.weight === '225 lb',
    [bare('about 110'), bare('110 kilos'), bare('225 lb')])
  check('a named lift is named back: "I squat 110", "bench 80kg", "110kg deadlift"',
    bare('I squat 110')?.lift === 'squat' && bare('bench 80kg')?.lift === 'bench press' && bare('110kg deadlift')?.lift === 'deadlift',
    [bare('I squat 110'), bare('bench 80kg'), bare('110kg deadlift')])
  // A set is a set: the app never gets in the way of one.
  for (const set of ['110 x 5', '110kg x 5', '100 for 5', '5 reps at 100', '140 1rm', 'my max is 140']) {
    check(`a set is not bare: "${set}"`, bare(set) === undefined, bare(set))
  }
  // Two numbers are the coach's to sort out ("which is which?"), never the app's guess.
  check('two numbers are not one bare weight: "100, 150"', bare('100, 150') === undefined, bare('100, 150'))
  // Not a lift weight at all.
  for (const not of ['3', '12', 'yes', 'Which exercise did I mean?', 'was it 110kg?', 'about 110 kg, maybe 115 on a good day', 'I weigh 82kg', 'I train 3 days', 'about 45 minutes', '600kg']) {
    check(`not a lift weight: "${not}"`, bare(not) === undefined, bare(not))
  }
}

console.log('\n2. Does the coach\'s turn already ask a setup question?')
{
  const none = new Set<string>(['displayName'])
  check('a card is a setup question', coachAskedSetupQuestion([{ role: 'assistant', content: 'Pick one:', slotCard: 'trainingStyle' }], none))
  check('a named typed question is one', coachAskedSetupQuestion([{ role: 'assistant', content: 'Go on then.', asksSlot: 'usualFoods' }], none))
  check('his screenshot 3: "was that 110kg for your back squat, bench press, or deadlift?" is about the lifts',
    coachAskedSetupQuestion([{ role: 'assistant', content: "I don't want to guess! Was that 110kg for your back squat, bench press, or deadlift?" }], none))
  const all = new Set(['displayName', 'fitnessGoal', 'trainingExperience', 'activityLevel', 'equipment', 'injuries', 'recoveryCapacity'])
  check('an off-setup follow-up ("what do you eat on a night shift?") is not', !coachAskedSetupQuestion([{ role: 'assistant', content: 'Makes sense. And what do you eat on a night shift, usually?' }], all))
  check('a question about something already answered is not (the app may step in)', !coachAskedSetupQuestion([{ role: 'assistant', content: 'How do you feel about cardio?' }], new Set([...all, 'conditioningPreference'])))
  check('a tick is not a question', !coachAskedSetupQuestion([{ role: 'assistant', content: '✓ Days — Mon? Wed', isReceipt: true }], none))
  check('a remark is not a question', !coachAskedSetupQuestion([{ role: 'assistant', content: 'Three days works well.' }], none))
}

console.log('\n3. Taking the coach\'s question out, keeping what it said')
{
  check('the reaction stays and the question goes', withoutQuestions('Makes sense. And what do you eat on a night shift, usually?') === 'Makes sense.')
  check('a message that was only a question leaves nothing', withoutQuestions('Which days can you train?') === '')
  const turn = [
    { role: 'assistant' as const, content: '✓ Days — Mon? Wed', isReceipt: true },
    { role: 'assistant' as const, content: 'Nice. Do you spar?' },
    { role: 'assistant' as const, content: 'How long?' },
    { role: 'assistant' as const, content: 'Pick one.', slotCard: 'trainingStyle' },
  ]
  const out = dropCoachQuestions(turn)
  check('ticks and cards are left alone; a question-only message is dropped', out.length === 3 && out[0].isReceipt === true && out[1].content === 'Nice.' && out[2].slotCard === 'trainingStyle', out)
  check('questionsInTurn counts a card and a question mark, never a tick', questionsInTurn(turn) === 3 && questionsInTurn(out) === 1, [questionsInTurn(turn), questionsInTurn(out)])
}

console.log('\n4. Lifts typed as named sets are read by the app (the setup walk, 14 Nov 2026)')
{
  const all = namedLiftSets('squat 110 for 5, bench 80 for 8, deadlift 140 for 5')
  check('three named sets, each kept on its own lift, weight and reps', JSON.stringify(all) === JSON.stringify({ knownSquatKg: '110 kg x 5', knownBenchKg: '80 kg x 8', knownDeadliftKg: '140 kg x 5' }), all)
  check('"x", pounds and "and" between them', JSON.stringify(namedLiftSets('squat 225lb x 3 and bench 185 lbs x 5')) === JSON.stringify({ knownSquatKg: '225 lb x 3', knownBenchKg: '185 lb x 5' }), namedLiftSets('squat 225lb x 3 and bench 185 lbs x 5'))
  check('a weight with no reps is not a set (his "Weight and reps")', JSON.stringify(namedLiftSets('squat 110, bench 80')) === '{}', namedLiftSets('squat 110, bench 80'))
  check('bare sets with no lift named are never assigned', JSON.stringify(namedLiftSets('110 x 5, 80 x 8')) === '{}', namedLiftSets('110 x 5, 80 x 8'))
  // "squat and bench 100 x 5": the set is said of the bench, so the bench takes it; the squat, with no set of its own,
  // takes nothing (it is asked about through its empty box, never given the bench's number).
  check('a lift with no set of its own takes nothing from its neighbour', JSON.stringify(namedLiftSets('squat and bench 100 x 5')) === JSON.stringify({ knownBenchKg: '100 kg x 5' }), namedLiftSets('squat and bench 100 x 5'))
  check('...and "squat bench 100 x 5" names two lifts at once, so nothing', JSON.stringify(namedLiftSets('squat bench 100 x 5')) === '{}', namedLiftSets('squat bench 100 x 5'))
}

console.log(`\n${ran} checks ran.`)
if (failures > 0) {
  console.error(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('One question at a time, and a bare weight is asked about.')

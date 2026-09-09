// ---------------------------------------------------------------------------
// WHAT THE USER'S MESSAGE SAYS, READ WITHOUT THE MODEL.
//
// Three replies on 8 Sep 2026 went wrong because the server never read the
// message it was answering: macros for a banana the model invented for "what
// should I eat"; a Muay Thai class logged at 60 minutes nobody stated, before
// it had happened; and a macro table for "was that a good idea?". The module
// under test (supabase/functions/_shared/message-evidence.ts) is the
// deterministic half of the fix. Her sentences are here verbatim, spelling
// included, because that is the input.
// ---------------------------------------------------------------------------
import {
  contentTokens, userNamedFood, isAdviceQuestion, isEvaluationQuestion,
  statedDurationsMinutes, eventTiming,
} from '../supabase/functions/_shared/message-evidence.ts'

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}

const TURN_1 = "Im going to muay thai tonight. What should I eat before hand to give me energy?"
const TURN_1B = "What should I eat before a big nuay Thai session to give me energy?"
const RICE_CAKES = "I had 2 rice cakes with dark chocolate and hot before. Was that a good idea?"
const MOVE_AND_CLASS = "I disnt train this morning but I'm going to muay thai tonight and will do this morning's session, tomorrow"

// ---------------------------------------------------------------------------
console.log('\n[1] Did SHE name the food, or did the model?')
// ---------------------------------------------------------------------------
const invented = userNamedFood({ foodName: 'Pre-workout banana and honey', ingredientNames: ['banana', 'honey'], message: TURN_1 })
check('a banana the model invented for "what should I eat" is NOT hers', invented.named === false, invented)
const invented2 = userNamedFood({ foodName: 'Toast with peanut butter', ingredientNames: ['wholemeal toast', 'peanut butter'], message: TURN_1B })
check('...nor toast invented for the same question, differently spelled', invented2.named === false, invented2)
const rice = userNamedFood({ foodName: 'Rice cakes with dark chocolate and hot chocolate', ingredientNames: ['chocolate rice cake', 'hot chocolate drink'], message: RICE_CAKES })
check('the rice cakes she typed ARE hers', rice.named === true && rice.via === 'message', rice)
check('...tied by the food words, not the words of asking', rice.matched.every(t => /^(rice|cake|chocolate|dark|hot)$/.test(t)) && !rice.matched.some(t => /good|idea|had|before/.test(t)), rice.matched)
const honey = userNamedFood({ foodName: 'Honey', ingredientNames: ['honey'], message: 'how many calories in 20g of honey' })
check('"20g of honey" names honey', honey.named === true, honey)
const eggs = userNamedFood({ foodName: 'Eggs and toast', ingredientNames: ['egg', 'wholemeal bread'], message: '2 eggs and toast' })
check('"2 eggs and toast" names eggs (plural folded)', eggs.named === true, eggs)
const viaPlan = userNamedFood({
  foodName: 'Greek yoghurt with berries', ingredientNames: ['greek yoghurt 0%', 'mixed berries'],
  message: "what's in my breakfast today", planText: 'breakfast: Greek yoghurt, berries and honey',
})
check('"my breakfast" names the plan\'s breakfast, through the plan', viaPlan.named === true && viaPlan.via === 'plan', viaPlan)
const noPlanText = userNamedFood({ foodName: 'Greek yoghurt with berries', ingredientNames: ['greek yoghurt'], message: "what's in my breakfast today" })
check('...but not when no plan text is in hand', noPlanText.named === false, noPlanText)
const whey = userNamedFood({ foodName: 'Whey protein shake', ingredientNames: ['whey protein powder', 'milk'], message: 'how much protein should I eat a day' })
check('"protein" in a general question does not name a protein shake', whey.named === false, whey)
check('nutrient and slot words are never content', contentTokens('how many calories protein carbs fat in my breakfast snack').length === 0)

// ---------------------------------------------------------------------------
console.log('\n[2] Advice versus numbers versus judgement')
// ---------------------------------------------------------------------------
check('her turn 1 is an advice question', isAdviceQuestion(TURN_1) === true)
check('...spelled the second way too', isAdviceQuestion(TURN_1B) === true)
check('..."what\'s a good snack before training"', isAdviceQuestion("what's a good snack before training?") === true)
check('..."any ideas for lunch"', isAdviceQuestion('any ideas for lunch') === true)
check('..."how much protein should I eat a day"', isAdviceQuestion('how much protein should I eat a day') === true)
check('a numbers question is NOT advice', isAdviceQuestion('how many calories in 20g of honey') === false)
check('a plain log is NOT advice', isAdviceQuestion('2 eggs and toast') === false)
check('the rice-cakes turn is NOT advice', isAdviceQuestion(RICE_CAKES) === false)

check('"Was that a good idea?" is an evaluation', isEvaluationQuestion(RICE_CAKES) === true)
check('..."is that ok before training?"', isEvaluationQuestion('had a bagel, is that ok before training?') === true)
check('..."should I have skipped the toast?"', isEvaluationQuestion('should I have skipped the toast?') === true)
check('..."was that too much?"', isEvaluationQuestion('two protein bars after the gym, was that too much?') === true)
check('..."was that ok" with no question mark and no "idea"', isEvaluationQuestion('had a bagel before the class, was that ok') === true)
check('..."is this bad before training"', isEvaluationQuestion('is this bad before training') === true)
check('a numbers question is NOT an evaluation', isEvaluationQuestion('how many calories in 20g of honey') === false)
check('a plain log is NOT an evaluation', isEvaluationQuestion('2 eggs and toast') === false)
check('an advice question is NOT an evaluation', isEvaluationQuestion(TURN_1) === false)
check('...and "should I have" asking for a suggestion is advice, not evaluation',
  isAdviceQuestion('what should I have for breakfast') === true && isEvaluationQuestion('what should I have for breakfast') === false)

// ---------------------------------------------------------------------------
console.log('\n[3] Durations she actually stated')
// ---------------------------------------------------------------------------
check('the move-and-class sentence states NO duration — the 60 was the model\'s', statedDurationsMinutes(MOVE_AND_CLASS).length === 0, statedDurationsMinutes(MOVE_AND_CLASS))
check('"did an hour of muay thai" → 60', JSON.stringify(statedDurationsMinutes('did an hour of muay thai')) === '[60]', statedDurationsMinutes('did an hour of muay thai'))
check('"an hour and a half" → 90', JSON.stringify(statedDurationsMinutes('boxing for an hour and a half tonight')) === '[90]')
check('"half an hour" → 30', JSON.stringify(statedDurationsMinutes('half an hour on the bike')) === '[30]')
check('"45 mins" → 45', JSON.stringify(statedDurationsMinutes('45 mins of muay thai')) === '[45]')
check('"1.5 hours" → 90', JSON.stringify(statedDurationsMinutes('did 1.5 hours')) === '[90]')
check('"ninety minutes" → 90', JSON.stringify(statedDurationsMinutes('ninety minutes of sparring')) === '[90]')
check('"in 30 minutes" is an offset, not a length', statedDurationsMinutes("I'm off to boxing in 30 minutes").length === 0, statedDurationsMinutes("I'm off to boxing in 30 minutes"))
check('"an hour ago" is an offset too', statedDurationsMinutes('finished muay thai an hour ago').length === 0, statedDurationsMinutes('finished muay thai an hour ago'))
check('a length AND an offset keep only the length', JSON.stringify(statedDurationsMinutes("45 mins of boxing, in 30 minutes")) === '[45]', statedDurationsMinutes("45 mins of boxing, in 30 minutes"))

// ---------------------------------------------------------------------------
console.log('\n[4] Has it happened yet?')
// ---------------------------------------------------------------------------
check('her sentence: the CLASS is tonight → future', eventTiming(MOVE_AND_CLASS, 'muay thai') === 'future', eventTiming(MOVE_AND_CLASS, 'muay thai'))
check('...even though the same sentence is past about the lift', /this morning/.test(MOVE_AND_CLASS))
check('"did muay thai this morning instead" → past', eventTiming('did muay thai this morning instead of the gym', 'muay thai') === 'past')
check('"just got back from muay thai" → past', eventTiming('just got back from muay thai, skipped the lift', 'muay thai') === 'past')
check('"muay thai instead of weights" alone → unclear', eventTiming('muay thai instead of weights', 'muay thai') === 'unclear')
check('"going to muay thai instead of the gym today" → future', eventTiming("I'm going to muay thai instead of the gym today", 'muay thai') === 'future')
check('no subject: the whole message decides', eventTiming('went for a run this morning') === 'past' && eventTiming('off to a run later') === 'future')

console.log(failures === 0 ? '\nAll message-evidence checks passed.\n' : `\n${failures} check(s) FAILED.\n`)
process.exit(failures === 0 ? 0 : 1)

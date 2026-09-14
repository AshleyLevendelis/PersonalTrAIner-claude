// ---------------------------------------------------------------------------
// Gate: A MEAL CHANGE THAT WORKS AGAINST THE GOAL IS ASKED ABOUT.
//
// Ashley's ruling of 14 Sep 2026 applied to food. The shape was already
// decided — four tiers, the goal's own terms, ask once per block per thing,
// "do it anyway" always on offer, nothing refused that is not unsafe. What is
// new and checked here is where the lines sit for meals.
//
// WHY IT EXISTS AT ALL. Measured the same day: of the coach's seventeen
// proposal builders, three carried the trade-off — all exercise — and the app
// held exactly one `shouldAsk` call site. No meal change had ever asked
// anything. What the cards showed was a macro table with signed deltas, which
// says the number moved and never says what it means.
//
// EVERY THRESHOLD IS CHECKED FROM BOTH SIDES. A check that only ever feeds a
// rule the input it rejects proves the rule fires, not that it discriminates —
// and a one-sided threshold check passes just as happily when the threshold is
// moved to zero.
// ---------------------------------------------------------------------------

import {
  assessMealEdit, mealAskKey,
  PROTEIN_AGAINST_GOAL_FRACTION, PROTEIN_WORTH_SAYING_FRACTION,
  REPEAT_CHANGES_THIS_BLOCK, CALORIE_OVERSHOOT_FRACTION,
  type MealEditContext,
} from '../src/lib/meal-tradeoff'
import { DO_IT_ANYWAY, askText, shouldAsk, downgradeToCard, applyTradeoff } from '../src/lib/edit-tradeoff'
import type { MacroTargets, UserProfile } from '../src/lib/types'

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

const TARGETS: MacroTargets = { calories: 2400, protein: 150, carbs: 250, fat: 80 }
const profileFor = (goal: string) => ({ fitness_goal: goal } as unknown as UserProfile)

/** A day sitting exactly on target, which every case below moves away from. */
const onTarget: MacroTargets = { ...TARGETS }
const day = (protein: number, calories = TARGETS.calories): MacroTargets =>
  ({ ...TARGETS, protein, calories })

const ctx = (over: Partial<MealEditContext> = {}): MealEditContext => ({
  profile: profileFor('hypertrophy'),
  targets: TARGETS,
  dayBefore: onTarget,
  dayAfter: onTarget,
  kind: 'meal_swap',
  slot: 'dinner',
  ...over,
})

console.log('\n1. A change that leaves the day on target says NOTHING')
{
  const t = assessMealEdit(ctx())
  check('tier 0', t.tier === 0, t)
  check('...and carries no sentence to render', t.cost === null && t.question === null, t)
}

console.log('\n2. Protein: the threshold discriminates, from both sides')
{
  // Just inside "against the goal" — 0.8 of 150 is 120.
  const under = assessMealEdit(ctx({ dayAfter: day(TARGETS.protein * (PROTEIN_AGAINST_GOAL_FRACTION - 0.05)) }))
  check('below the against-goal share, it ASKS', under.tier === 2 && !!under.question, under)
  const justAbove = assessMealEdit(ctx({ dayAfter: day(TARGETS.protein * (PROTEIN_AGAINST_GOAL_FRACTION + 0.02)) }))
  check('...just above it, it does not ask', justAbove.tier < 2, justAbove)
  // And the middle band is a sentence, not a question.
  check('...the middle band is tier 1 — a sentence and a cheaper route',
    justAbove.tier === 1 && !!justAbove.cost && justAbove.question === null, justAbove)
  const fine = assessMealEdit(ctx({ dayAfter: day(TARGETS.protein * (PROTEIN_WORTH_SAYING_FRACTION + 0.02)) }))
  check('...and a day still near target says nothing at all', fine.tier === 0, fine)
}

console.log('\n3. The question names the goal\'s own terms, never a score')
{
  const t = assessMealEdit(ctx({ dayAfter: day(100) }))
  check('it quotes the protein the day lands on', /100g/.test(t.question ?? ''), t.question)
  check('...and the target it is short of', /150g/.test(t.question ?? ''), t.question)
  check('...and never says "score", "rule" or "dimension"',
    !/score|dimension|\brule\b|tier/i.test(t.question ?? ''), t.question)
  check('...and the internal reason is NEVER the question', t.reason !== t.question && !!t.reason, t.reason)
}

console.log('\n4. Calories cut the way the GOAL cuts, not one way for everybody')
{
  const over = day(TARGETS.protein, TARGETS.calories * (1 + CALORIE_OVERSHOOT_FRACTION + 0.05))
  const cutting = assessMealEdit(ctx({ profile: profileFor('fat_loss'), dayAfter: over }))
  check('fat loss going OVER is asked about', cutting.tier === 2, cutting)
  check('...in deficit language, not protein language', /deficit/i.test(cutting.question ?? ''), cutting.question)

  // THE SAME DAY, a different goal. Going over is not a failure when growing.
  const growing = assessMealEdit(ctx({ profile: profileFor('hypertrophy'), dayAfter: over }))
  check('the SAME day on a hypertrophy block is not asked about', growing.tier < 2, growing)

  // And the mirror: under-eating is the failure for everybody who is not cutting.
  const short = day(TARGETS.protein, TARGETS.calories * 0.8)
  check('under-eating on a growth block costs something',
    assessMealEdit(ctx({ profile: profileFor('hypertrophy'), dayBefore: onTarget, dayAfter: short })).tier >= 1)
  check('...while under on a fat-loss block is not a complaint',
    assessMealEdit(ctx({ profile: profileFor('fat_loss'), dayBefore: onTarget, dayAfter: short })).tier === 0)
}

console.log('\n5. The repetition, which no single card can see')
{
  // A change that is individually FINE — the day stays on target.
  const fineOnce = ctx({ dayAfter: onTarget })
  check('one of them says nothing', assessMealEdit(fineOnce).tier === 0)
  const nth = assessMealEdit({ ...fineOnce, priorCostlyChangesThisBlock: REPEAT_CHANGES_THIS_BLOCK - 1 })
  check(`the ${REPEAT_CHANGES_THIS_BLOCK}rd in a block is asked about`, nth.tier === 2, nth)
  check('...and it asks about the PATTERN, not tonight\'s dinner',
    /block|together|week/i.test(nth.question ?? ''), nth.question)
  const belowRepeat = assessMealEdit({ ...fineOnce, priorCostlyChangesThisBlock: REPEAT_CHANGES_THIS_BLOCK - 2 })
  check('...one earlier, it still says nothing', belowRepeat.tier === 0, belowRepeat)
}

console.log('\n6. Never blocked — the escape is always one tap')
{
  for (const t of [
    assessMealEdit(ctx({ dayAfter: day(90) })),
    assessMealEdit(ctx({ profile: profileFor('fat_loss'), dayAfter: day(TARGETS.protein, 3000) })),
    assessMealEdit({ ...ctx(), priorCostlyChangesThisBlock: 5 }),
  ]) {
    check(`tier ${t.tier} offers a cheaper route`, t.alternatives.length > 0, t)
    check('...and the rendered chips include "do it anyway"',
      askText(t).includes(DO_IT_ANYWAY), askText(t))
    check('...and it is never a refusal', t.tier <= 2)
  }
}

console.log('\n7. The question never offers a route the chips do not carry')
{
  // READ OFF A SCREENSHOT, not reasoned about. The first browser run showed
  // "Want a higher-protein version, or shall I do it anyway?" above chips
  // reading only "Just today" and "Do it anyway" — the coach promising a route
  // it had no way to take, because the pool handed up no alternative. Same
  // shape as a clarification card with no answer box, which this codebase
  // already calls the loop.
  const without = assessMealEdit(ctx({ dayAfter: day(90) }))
  const offersHigher = /higher-protein/i.test(without.question ?? '')
  const chipsHaveHigher = without.alternatives.some(a => /higher-protein/i.test(a.label))
  check('with no alternative in the pool, it does not mention one', offersHigher === false, without.question)
  check('...and what it DOES offer is on a chip',
    /today/i.test(without.question ?? '') && without.alternatives.some(a => /today/i.test(a.label)), without)

  const withOne = assessMealEdit(ctx({
    dayAfter: day(90),
    higherProteinOption: { name: 'Chicken burrito bowl', protein: 52 },
  }))
  check('with one, it is mentioned AND on a chip',
    /higher-protein/i.test(withOne.question ?? '') && withOne.alternatives.some(a => /higher-protein/i.test(a.label)), withOne)

  // The general property, over every tier-2 shape this module can produce.
  for (const t of [without, withOne,
    assessMealEdit(ctx({ profile: profileFor('fat_loss'), dayAfter: day(TARGETS.protein, 3000) })),
    assessMealEdit({ ...ctx(), priorCostlyChangesThisBlock: 5 })]) {
    if (!t.question) continue
    const promised = /higher-protein/i.test(t.question)
    const carried = t.alternatives.some(a => /higher-protein/i.test(a.label))
    check(`a tier-${t.tier} question promises nothing the chips lack`, !promised || carried, t)
  }
  void chipsHaveHigher
}

console.log('\n7b. A higher-protein option is OFFERED, never invented')
{
  const withPool = assessMealEdit(ctx({
    dayAfter: day(100),
    higherProteinOption: { name: 'Chicken burrito bowl', protein: 52 },
  }))
  check('when the pool holds one, it is named', withPool.alternatives.some(a => /burrito/i.test(a.note)), withPool.alternatives)
  const withoutPool = assessMealEdit(ctx({ dayAfter: day(100) }))
  check('when it does not, nothing is promised',
    !withoutPool.alternatives.some(a => /higher-protein/i.test(a.label)), withoutPool.alternatives)
  check('...but there is still a way out', withoutPool.alternatives.length > 0, withoutPool.alternatives)
}

console.log('\n8. No living targets, no judgement')
{
  // Somebody who declined their body metrics has no targets. A guess about
  // their protein is worse than silence.
  //
  // THE DAY HERE WOULD BE TIER 2 IF TARGETS EXISTED — 90g against a 150g
  // target is well under the against-goal line. The first version of this
  // section used an ON-TARGET day, so "silent because we have no targets" and
  // "silent because the day is fine" were the same observation, and deleting
  // the guard entirely left the section green. A guard check has to be fed the
  // input the guard is protecting against.
  const wouldAsk = { dayAfter: day(90) }
  check('the same day WITH targets is asked about', assessMealEdit(ctx(wouldAsk)).tier === 2)
  check('a missing target set is silent', assessMealEdit(ctx({ ...wouldAsk, targets: null })).tier === 0,
    assessMealEdit(ctx({ ...wouldAsk, targets: null })))
  // AND NO PLANNED DAY, same rule one level up. An empty meal plan totals zero,
  // which without this reads as "they are on nothing" and turns every card into
  // a question. The chat harness shipped `mealPlan={[]}` for months, so this is
  // a state the app really reaches.
  const noDay = { calories: 0, protein: 0, carbs: 0, fat: 0 }
  check('a day with nothing planned in it is silent',
    assessMealEdit(ctx({ ...wouldAsk, dayBefore: noDay, dayAfter: noDay })).tier === 0,
    assessMealEdit(ctx({ ...wouldAsk, dayBefore: noDay, dayAfter: noDay })))
  check('...and so is a zeroed one',
    assessMealEdit(ctx({ ...wouldAsk, targets: { calories: 0, protein: 0, carbs: 0, fat: 0 } })).tier === 0)
}

console.log('\n9. It plugs into the plumbing the exercise side already uses')
{
  const t = assessMealEdit(ctx({ dayAfter: day(90) }))
  const key = mealAskKey({ kind: 'meal_swap', slot: 'dinner', foodName: 'Salmon' }, 2)
  check('the ask key is per block, per thing', key.includes('2') && /salmon/i.test(key), key)
  check('asked once', shouldAsk(t, key, 'permanent', { alreadyAsked: new Set(), sessionRunning: false }) === true)
  check('...and not twice', shouldAsk(t, key, 'permanent', { alreadyAsked: new Set([key]), sessionRunning: false }) === false)

  // Guarded out must not go silent — it still cost something.
  const carded = downgradeToCard(t)
  check('a guarded-out question becomes a card that still states the cost',
    carded.tier === 1 && !!carded.cost && carded.question === null, carded)
  const diff = applyTradeoff({ rows: [], implications: [{ severity: 'info' as const, text: 'Protein 150g → 90g' }] }, carded)
  check('...and the cost lands on the card as a warning',
    diff.implications?.some(i => i.severity === 'warn' && !!i.text) === true, diff.implications)
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nA meal change that works against the goal is asked about, then allowed.')

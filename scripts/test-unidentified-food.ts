/**
 * test:unidentified-food — live test 19 Oct 2026, finding 10 (docs/plans/unidentified-food-wording.md). Allergen path.
 *
 * Sam's swap list blocked Greek yoghurt and smoked turkey dishes with "Contains low fat greek yoghurt, which doesn't
 * fit nut-free". The line was one the food list could not identify. Blocking it is right (fail-closed); saying it
 * CONTAINS something was false. Ashley, 20 Oct 2026: "Can't confirm it's nut-free". Held here:
 *   §1 an unidentified line stays blocked, for every restriction, and the sentence says the app can't confirm it;
 *   §2 a real clash keeps "Contains …";
 *   §3 the common foods she hit are now known, with their parent's tags, and a flavoured yoghurt still is not;
 *   §4 the rule itself did not move: an unknown line is never passed.
 */
import { checkMealAgainstRestrictions } from '../src/lib/meal-restriction-check'
import { validateMealAgainstDiet } from '../src/lib/diet-rules'
import { lookupIngredient } from '../src/lib/food-db'

let failures = 0
let ran = 0
function check(label: string, ok: boolean, extra?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`) }
}
const line = (name: string, quantity = 150) => ({ name, quantity, unit: 'g' })

console.log('\n§1 A food the app cannot identify: blocked, and said truthfully')
{
  const v = checkMealAgainstRestrictions('Yoghurt bowl', [line('vanilla greek yoghurt'), line('blueberries', 80)], ['nut-free'], [])
  check('the fixture is the case: the line is not in the food list', !lookupIngredient('vanilla greek yoghurt'))
  check('the meal is still blocked', v.ok === false, v)
  check('the sentence says the app cannot confirm it, in her ruling\'s words', v.message === "I can't confirm vanilla greek yoghurt is nut-free, so this one's off for you.", v.message)
  check('...and never that it CONTAINS anything', !/contains/i.test(v.message ?? ''), v.message)
  const two = checkMealAgainstRestrictions('Yoghurt bowl', [line('vanilla greek yoghurt')], ['nut-free', 'dairy-free'], [])
  check('one unknown line against two restrictions is ONE sentence naming both, not "(and 1 more)"', two.message === "I can't confirm vanilla greek yoghurt is nut-free or dairy-free, so this one's off for you.", two.message)
  const issue = v.issues[0]
  check('the fact travels as a field, not read out of a reason sentence', issue?.unidentified === true && issue.ingredient === 'vanilla greek yoghurt', issue)
}

console.log('\n§2 A real clash keeps its sentence')
{
  const v = checkMealAgainstRestrictions('Yoghurt bowl', [line('greek yoghurt'), line('granola', 40)], ['nut-free'], [])
  check('granola under nut-free still reads "Contains granola"', v.ok === false && /^Contains granola, which doesn't fit "nut-free"/.test(v.message ?? ''), v.message)
  check('...and is not marked unidentified', v.issues.every(i => !i.unidentified), v.issues)
}

console.log('\n§3 The foods she hit are known now, with their parent\'s tags')
{
  for (const name of ['low fat greek yoghurt', '2% greek yoghurt', 'light greek yoghurt', 'low fat greek yogurt']) {
    const e = lookupIngredient(name)
    check(`"${name}" is known, as dairy and nothing else`, !!e && e.tags.contains_dairy === true && Object.keys(e.tags).filter(k => (e.tags as Record<string, unknown>)[k]).length === 1, e && { name: e.name, tags: e.tags })
  }
  for (const name of ['smoked turkey breast', 'smoked turkey', 'turkey slices', 'deli turkey']) {
    const e = lookupIngredient(name)
    check(`"${name}" is known, as meat (processed), never pork`, !!e && e.tags.contains_meat === true && !e.tags.contains_pork, e && { name: e.name, tags: e.tags })
  }
  check('"sliced turkey" keeps its old answer (roast turkey breast)', lookupIngredient('sliced turkey')?.name === 'turkey breast')
  check('a flavoured yoghurt is still NOT known (the sugar varies by brand)', !lookupIngredient('vanilla greek yoghurt'))
  const sam = checkMealAgainstRestrictions('Turkey wrap', [line('smoked turkey breast', 90), line('greek yoghurt 2%', 50)], ['nut-free'], [])
  check('Sam\'s two blocked foods now pass nut-free', sam.ok === true, sam)
  const vegan = checkMealAgainstRestrictions('Turkey wrap', [line('smoked turkey breast', 90)], ['vegetarian'], [])
  check('...and the turkey is still refused for a vegetarian, now as what it is', vegan.ok === false && /^Contains smoked turkey breast/.test(vegan.message ?? ''), vegan.message)
}

console.log('\n§4 The rule did not move')
{
  const r = validateMealAgainstDiet([line('mystery spread')], ['nut-free'])
  check('an unknown line is never passed (fail-closed)', r.ok === false && r.violations.length === 1 && r.violations[0].unidentified === true, r)
  const none = validateMealAgainstDiet([line('mystery spread')], [])
  check('with no restriction there is nothing to break', none.ok === true)
}

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.error(`${failures} check(s) failed`); process.exit(1) }
console.log('unidentified food: all checks passed')

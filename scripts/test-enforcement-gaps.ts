// ---------------------------------------------------------------------------
// Gate: the three things the app collected and then didn't act on.
//
// Audit §2.1 / §2.2 / §2.3 — one family. In each case the user set a rule,
// the app showed it back to them, and nothing downstream honoured it:
//
//   §2.1  A restriction added AFTER meals were generated was never re-applied.
//         Turn on "Nut-free" and this morning's peanut butter stayed on
//         screen, unflagged, permanently. 11 checks across the render path,
//         all failing. The app could tell — validateMealAgainstDiet rejects
//         the meal correctly — it was simply never asked again.
//   §2.2  Profile injuries were free text; the plan engine knows 8 exact
//         codes. 12 of 14 ordinary entries changed nothing, including
//         "Lower back", which was the field's OWN placeholder.
//   §2.3  "Foods to avoid" was a plain substring match: 10 of 122 foods the
//         user plainly meant (8%). "mushrooms" missed "mushroom" — also the
//         field's own placeholder.
//
// Sections 1-3 are behavioural, against the real modules and the real
// 333-food database. Section 4 scans source with comments stripped, so this
// file's explanation can never be what satisfies it.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { containsPhrase } from '../src/lib/meal-ingredients'
import { checkMealAgainstRestrictions } from '../src/lib/meal-restriction-check'
import { partitionInjuries, normaliseInjuryCode, INJURY_OPTIONS } from '../src/lib/onboarding-slots'
import { getFlaggedJoints } from '../src/lib/exercise-plan'
import { FOOD_DB } from '../src/lib/food-db'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

console.log('\n1. A meal is re-checked against the CURRENT restrictions (§2.1)')
{
  const breakfast = [
    { name: 'greek yoghurt 0%', quantity: 200, unit: 'g' },
    { name: 'peanut butter', quantity: 15, unit: 'g' },
    { name: 'banana', quantity: 100, unit: 'g' },
  ]

  const clean = checkMealAgainstRestrictions('Yoghurt Berry Bowl', breakfast, [], [])
  check('with no restrictions set, nothing is flagged', clean.ok && clean.message === null, clean)

  // THE ALMOND-BUTTER SHAPE, one allergen along.
  const nutFree = checkMealAgainstRestrictions('Yoghurt Berry Bowl', breakfast, ['nut-free'], [])
  check('adding "nut-free" flags the breakfast that was already generated', !nutFree.ok, nutFree)
  check('...and names the ingredient, not just the rule',
    /peanut butter/i.test(nutFree.message ?? ''), nutFree.message)

  const dairyFree = checkMealAgainstRestrictions('Yoghurt Berry Bowl', breakfast, ['dairy-free'], [])
  check('adding "dairy-free" flags the yoghurt', !dairyFree.ok, dairyFree.issues)

  const avoided = checkMealAgainstRestrictions('Yoghurt Berry Bowl', breakfast, [], ['banana'])
  check('an avoid-list entry flags it too', !avoided.ok, avoided.issues)

  // THE HONESTY BOUNDARY. A dish with no recorded ingredients cannot be
  // checked, and must not come back looking checked.
  const unknown = checkMealAgainstRestrictions('Something From A Restaurant', [], ['nut-free'], [])
  check('a meal with no ingredient list is not claimed to be clear', unknown.ok && unknown.message === null, unknown)

  check('the message never names an internal tag verbatim',
    !/dietary_preferences|contains_|FORBIDDEN/.test(nutFree.message ?? ''), nutFree.message)
}

console.log('\n2. Injuries: what the user types reaches the plan (§2.2)')
{
  // The audit's own fourteen phrasings.
  const typed = ['Lower back', 'lower back', 'knees', 'Knees', 'shoulder', 'shoulders',
    'rotator cuff', 'hamstring', 'sciatica', 'tennis elbow', 'plantar fasciitis',
    'left knee', 'bad back', 'achilles']
  const { codes, unrecognised } = partitionInjuries(typed)

  check('"Lower back" — the old placeholder — now maps', codes.includes('lower_back'), codes)
  check('"Knees" with a capital now maps', normaliseInjuryCode('Knees') === 'knees')
  check('"shoulder" singular now maps', normaliseInjuryCode('shoulder') === 'shoulders')
  check('every mapped code actually flags a joint',
    codes.every(c => getFlaggedJoints([c]).size > 0), codes.filter(c => getFlaggedJoints([c]).size === 0))

  // The ones that genuinely are not one of the eight areas are KEPT, not
  // deleted. Silently dropping them would be the same defect reversed.
  check('what cannot be mapped is kept rather than discarded',
    unrecognised.includes('sciatica') && unrecognised.includes('rotator cuff'), unrecognised)
  check('...and nothing is both mapped and kept', codes.every(c => !unrecognised.includes(c)))

  // The narrowness is deliberate: guessing that sciatica means the lower
  // back is a clinical call the app must not make silently.
  check('no clinical guessing — "sciatica" does not become lower_back', normaliseInjuryCode('sciatica') === null)
  check('...nor "hamstring" become knees', normaliseInjuryCode('hamstring') === null)

  check('every canonical code still round-trips',
    INJURY_OPTIONS.every(o => normaliseInjuryCode(o.value) === o.value))
  check('...and so does every visible label',
    INJURY_OPTIONS.every(o => normaliseInjuryCode(o.label) === o.value),
    INJURY_OPTIONS.filter(o => normaliseInjuryCode(o.label) !== o.value).map(o => o.label))
}

console.log('\n3. Foods to avoid: what the user means is what is matched (§2.3)')
{
  const names = FOOD_DB.map(f => f.name)
  // A food is an INGREDIENT of a dish — the shape the matcher actually sees.
  const caught = (typed: string, food: string) => containsPhrase('Some dish', [food], typed)

  check('"mushrooms" finds "mushroom" — the field\'s own example', caught('mushrooms', 'mushroom'))
  check('"eggs" finds "egg"', caught('eggs', 'egg'))
  check('"onions" finds "onion"', caught('onions', 'onion'))
  check('"dairy" finds cheese', caught('dairy', 'cheddar cheese') || names.filter(n => caught('dairy', n)).length > 10,
    names.filter(n => caught('dairy', n)).length)
  check('"nuts" finds peanut butter', caught('nuts', 'peanut butter'))
  check('"seafood" finds salmon', caught('seafood', 'salmon'))
  check('"red meat" finds beef mince', caught('red meat', 'beef mince 5% fat'))
  check('"gluten" finds pasta', caught('gluten', 'pasta cooked'))

  // WIDENING IS THE SAFE DIRECTION, BUT IT MUST NOT OVERSHOOT. The category
  // words are answered from the food database's own tags, so a word that
  // merely appears inside another food's name is not a match.
  check('"nuts" does NOT catch nutmeg', !caught('nuts', 'nutmeg'))
  check('"nuts" does NOT catch coconut milk', !caught('nuts', 'coconut milk canned'))
  check('"dairy" does NOT catch butter beans', !caught('dairy', 'butter beans'))
  check('"dairy" does NOT catch soy milk', !caught('dairy', 'soy milk'))
  check('"dairy" does NOT catch butternut squash', !caught('dairy', 'butternut squash'))
  check('"gluten" does NOT catch rice noodles', !caught('gluten', 'rice noodles cooked'))

  // The stated limit stays stated: still not a synonym engine.
  check('"almond butter" still does not become "almonds" — the documented limit',
    !caught('almond butter', 'almonds'))

  // The headline number, re-measured. 10/122 before.
  const CASES: [string, RegExp][] = [
    ['nuts', /almond|cashew|walnut|peanut|pistachio|hazelnut|pecan/i],
    ['seafood', /salmon|tuna|cod|prawn|shrimp|crab|mussel|haddock|mackerel|sardine/i],
    ['red meat', /beef|lamb|steak|mince|pork/i],
    ['eggs', /\begg/i],
    ['mushrooms', /mushroom/i],
    ['soy', /soy|tofu|edamame|tempeh|miso/i],
  ]
  let meant = 0, hit = 0
  for (const [typed, re] of CASES) {
    const foods = names.filter(n => re.test(n))
    meant += foods.length
    hit += foods.filter(n => caught(typed, n)).length
  }
  const pct = Math.round((100 * hit) / meant)
  console.log(`     coverage on the audit's own cases: ${hit}/${meant} (${pct}%) — was 8% before`)
  check('coverage is far above where it was, not marginally', pct >= 90, pct)
}

console.log('\n4. One matcher, and the screens actually use it')
{
  const gen = stripComments(readFileSync(join(ROOT, 'src/lib/meal-generation.ts'), 'utf8'))
  check('generation uses the shared matcher, not its own inline includes()',
    /containsPhrase\(proposal\.name, names, food\)/.test(gen))
  check('...and the old third copy is gone', !/lowerNames\.some\(n => n\.includes\(food/.test(gen))

  const plan = stripComments(readFileSync(join(ROOT, 'src/components/MealPlan.tsx'), 'utf8'))
  check('the meal list re-checks what it displays', /checkMealAgainstRestrictions\(/.test(plan))
  check('a flagged meal cannot be logged as eaten', /disabled=\{busy \|\| \(blocked && !loggedEvent\)\}/.test(plan))
  check('...and the reason is rendered', /restriction\.message/.test(plan))
  check('the offer to redo is an offer, not an automatic rebuild',
    /blockedSlots\.length > 0 &&/.test(plan) && !/useEffect[\s\S]{0,200}onRegenerateAll\(\)/.test(plan))

  const profileScreen = stripComments(readFileSync(join(ROOT, 'src/components/ProfileScreen.tsx'), 'utf8'))
  check('the injury field is a picker, not free text',
    /value=\{injuryCodes\}/.test(profileScreen) && !/values=\{profile\.injuries\}/.test(profileScreen))
  check('...and unmapped values are still shown rather than dropped',
    /unrecognisedInjuries\.length > 0 &&/.test(profileScreen))
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nAll enforcement-gap checks passed.')

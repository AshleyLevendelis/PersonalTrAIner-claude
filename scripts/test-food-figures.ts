/**
 * test:food-figures — the food audit's remaining findings, fixed 10 Nov 2026 (his "then fix the food figures").
 *
 * Each section holds one finding: the food is reached by the words people use, its figures are the corrected ones,
 * and the old answer is gone. Figures are "as recalled" (no network here); what this gate holds is that the app
 * uses them, and that they add up.
 */
import { lookupIngredient, computeMealMacros, weighedFactor, weighedTwinOf, FOOD_DB } from '../src/lib/food-db'
import { cookedHint, asWeighed } from '../src/lib/as-weighed'
import { parseIngredientLine } from '../src/lib/portion-scaler'
import { MEAL_LIBRARY } from '../src/lib/meal-library-data'

let failures = 0
let ran = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`) }
}
const found = (line: string) => lookupIngredient(parseIngredientLine(line).name)?.name ?? null
const kcal = (line: string) => Math.round(computeMealMacros([parseIngredientLine(line)]).kcal)
const entry = (name: string) => FOOD_DB.find(f => f.name === name)

console.log('1. A tin of pulses is the tin, not beans boiled at home')
check('"canned" and "tinned" chickpeas reach the tinned entry', found('240g canned chickpeas') === 'chickpeas canned' && found('240g tinned chickpeas') === 'chickpeas canned', [found('240g canned chickpeas'), found('240g tinned chickpeas')])
check('...and kidney beans, red or not', found('200g canned kidney beans') === 'kidney beans canned' && found('200g tinned red kidney beans') === 'kidney beans canned')
check('a measure of TINS reaches the tin too ("1 tin chickpeas" is 240 g drained of the tinned entry)', kcal('1 tin chickpeas') === Math.round(2.4 * entry('chickpeas canned')!.per100g.kcal) && kcal('1 can kidney beans') === Math.round(2.4 * entry('kidney beans canned')!.per100g.kcal), [kcal('1 tin chickpeas'), kcal('1 can kidney beans')])
check('...while a tin of something with no tinned entry still works (tuna, black beans)', kcal('1 can tuna') > 0 && kcal('1 can black beans') > 0)
check('bare chickpeas keep the boiled figures, and the tin is lighter (about 30% for chickpeas)', found('240g chickpeas') === 'chickpeas' && entry('chickpeas canned')!.per100g.kcal < 0.8 * entry('chickpeas')!.per100g.kcal)
check('the tinned entries are pulses like the boiled ones (same tags)', JSON.stringify(entry('chickpeas canned')!.tags) === JSON.stringify(entry('chickpeas')!.tags) && JSON.stringify(entry('kidney beans canned')!.tags) === JSON.stringify(entry('kidney beans')!.tags))
const bareInLibrary = MEAL_LIBRARY.flatMap(d => d.ingredients.filter(l => ['chickpeas', 'kidney beans'].includes(found(l) ?? '')))
check('our own library writes them as bought: every chickpea and kidney bean line is a tin', bareInLibrary.length === 0, bareInLibrary.slice(0, 4))

console.log('\n2. Mussels in the shell, fried calamari, and the dairy that was mislabelled')
check('a kilo of mussels in their shells is about a quarter of a kilo of meat, not a kilo', found('1 kg mussels in their shells') === 'mussels in shell' && Math.abs(kcal('1 kg mussels in their shells') - kcal('250g mussels')) <= 15, [kcal('1 kg mussels in their shells'), kcal('250g mussels')])
check('...and bare "mussels" is still the meat', found('200g mussels') === 'mussels')
check('fried calamari is fried, floured (gluten) and shellfish; bare calamari is asked about (his 10 Nov ruling) and plain squid is squid', found('150g fried calamari') === 'calamari fried' && entry('calamari fried')!.tags.contains_gluten === true && entry('calamari fried')!.tags.contains_shellfish === true && found('100g calamari') === null && found('100g squid') === 'squid' && found('100g grilled calamari') === 'squid')
check('light ricotta has its own lighter figures', found('200g light ricotta') === 'ricotta light' && entry('ricotta light')!.per100g.fat < entry('ricotta cheese')!.per100g.fat)
check('UK "Greek style" yoghurt is not strained Greek yoghurt: its own entry, less protein, more fat', found('150g greek style yoghurt') === 'greek style yoghurt' && entry('greek style yoghurt')!.per100g.protein < entry('greek yoghurt full fat')!.per100g.protein && entry('greek style yoghurt')!.per100g.fat > entry('greek yoghurt full fat')!.per100g.fat)
check('cream cheese is a UK tub (about 230 kcal, not the US block\'s 342), with a light one beside it', entry('cream cheese')!.per100g.kcal <= 250 && found('30g light cream cheese') === 'cream cheese light', entry('cream cheese')!.per100g)
check('pesto is a UK jar (400-500 kcal)', entry('pesto')!.per100g.kcal >= 400 && entry('pesto')!.per100g.kcal <= 500)
check('injera is moist bread (130-160 kcal), not a dry-basis figure', entry('injera flatbread')!.per100g.kcal >= 130 && entry('injera flatbread')!.per100g.kcal <= 160)
check('wholemeal flour is its own food with more protein than white', found('50g wholemeal flour') === 'wholemeal flour' && entry('wholemeal flour')!.per100g.protein > entry('plain flour')!.per100g.protein + 2)
check('plantain chips are fried chips (about 4x raw plantain), never raw fruit', found('30g plantain chips') === 'plantain chips' && entry('plantain chips')!.per100g.kcal > 4 * entry('plantain')!.per100g.kcal)

console.log('\n3. The foods the library\'s writers asked for')
const ASKED: [string, string][] = [['50g gram flour', 'gram flour'], ['100g smoked tofu', 'smoked tofu'], ['2 oatcakes', 'oatcakes'], ['1 burger bun', 'burger bun'], ['75g arborio rice', 'risotto rice'], ['50g kimchi', 'kimchi'], ['1 tbsp cocoa powder', 'cocoa powder'], ['1 tbsp chopped parsley', 'parsley'], ['10g fresh mint', 'mint'], ['1 tsp mixed herbs', 'dried oregano']]
for (const [line, name] of ASKED) check(`"${line}" is ${name}, and has an amount`, found(line) === name && kcal(line) >= 0 && computeMealMacros([parseIngredientLine(line)]).unmatched.length === 0, [found(line), computeMealMacros([parseIngredientLine(line)]).unmatched])
check('kimchi carries fish and shellfish (fish sauce, salted shrimp); a vegan one carries neither', entry('kimchi')!.tags.contains_fish === true && entry('kimchi')!.tags.contains_shellfish === true && !entry('vegan kimchi')!.tags.contains_fish && !entry('vegan kimchi')!.tags.contains_shellfish)
check('gram flour is a pulse with no gluten; a burger bun has gluten; smoked tofu has soy', entry('gram flour')!.tags.is_legume === true && !entry('gram flour')!.tags.contains_gluten && entry('burger bun')!.tags.contains_gluten === true && entry('smoked tofu')!.tags.contains_soy === true)
check('risotto rice is weighed dry: a "cooked risotto rice" line is not costed as dry rice', found('75g arborio rice') === 'risotto rice' && found('200g cooked risotto rice') === null)
check('a tablespoon of dried herbs is a few grams, not 15', Math.round(computeMealMacros([parseIngredientLine('1 tbsp mixed herbs')]).lines?.[0]?.grams ?? 99) <= 5, computeMealMacros([parseIngredientLine('1 tbsp mixed herbs')]).lines?.[0])

console.log('\n4. Every new or changed figure adds up (4 kcal a gram of protein and carbs, 9 of fat, within 12%)')
const CHANGED = ['beef mince 10% fat', 'beef mince 12% fat', 'beef mince 15% fat', 'chickpeas canned', 'kidney beans canned', 'mussels in shell', 'calamari fried', 'ricotta light', 'greek style yoghurt', 'cream cheese', 'cream cheese light', 'wholemeal flour', 'gram flour', 'pesto', 'plantain chips', 'injera flatbread', 'smoked tofu', 'oatcakes', 'cocoa powder', 'burger bun', 'risotto rice', 'parsley', 'mint', 'chives', 'kimchi', 'vegan kimchi']
const off = CHANGED.map(n => { const m = entry(n)?.per100g; if (!m) return `${n}: missing`; const a = 4 * m.protein + 4 * m.carbs + 9 * m.fat; return Math.abs(a - m.kcal) / m.kcal > 0.12 ? `${n}: ${m.kcal} vs ${Math.round(a)}` : null }).filter(Boolean)
// USDA counts fibre in carbs and gives these few their own lower energy: cocoa (37 g fibre), the fresh herbs, both kimchis.
check(`all ${CHANGED.length} add up, bar the six whose USDA energy leaves out a lot of fibre`, off.length === 6 && off.every(o => /^(cocoa powder|parsley|mint|chives|kimchi|vegan kimchi):/.test(String(o))), off)

console.log('\n5. Home cooking yields for couscous and basmati (lentils keep their ratio: CoFID agrees with USDA)')
const hint = (l: string) => Number(/about (\d+)g cooked/.exec(cookedHint(parseIngredientLine(l)) ?? '')?.[1] ?? NaN)
check('60 g dry couscous is about 150 g cooked (2.5x; USDA\'s 3.4x said 200)', hint('60g dry couscous') === 150, hint('60g dry couscous'))
check('70 g dry basmati about 190 g (2.7x), and red lentils keep about 3x (220 g)', hint('70g dry basmati rice') === 190 && hint('70g dry red lentils') === 220, [hint('70g dry basmati rice'), hint('70g dry red lentils')])
check('...and the foods already in range keep their ratio (white rice 200 g, pasta 180 g)', hint('70g dry white rice') === 200 && hint('75g dry pasta') === 180, [hint('70g dry white rice'), hint('75g dry pasta')])
const back = asWeighed(parseIngredientLine('150g cooked couscous'))
check('ONE factor: the hint\'s cooked weight typed back as cooked is the same dry weight (150 g cooked couscous = 60 g dry)', back.quantity === 60 && /dry|couscous/.test(back.name), back)
const cous = entry('couscous cooked')!
check('the factor is the home yield only between a food and its own twin', Math.abs(weighedFactor(cous, weighedTwinOf(cous)!)! - 1 / 2.5) < 1e-9 && weighedFactor(cous, entry('white rice dry')!) !== 1 / 2.5)
check('...and the cooked figure IS the dry one at that yield, so both ways of writing it count the same food', Math.abs(cous.per100g.kcal * 2.5 - weighedTwinOf(cous)!.per100g.kcal) <= 3 && Math.abs(entry('basmati rice cooked')!.per100g.kcal * 2.7 - entry('basmati rice dry')!.per100g.kcal) <= 3)

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.log(`${failures} food-figure check(s) FAILED.`); process.exit(1) }
console.log('All food-figure checks passed.')

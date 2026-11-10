/**
 * test:qa-wording — small wording defects from the 10 Nov 2026 QA walks, each held where it is decided.
 *   1. An ingredient line as a cook says it: "3 eggs", "7 corn tortillas", "2 garlic cloves" (was "3 whole egg").
 *   2. Extra work's badge: "1 set", "2 sets" (was "1 sets").
 *   3. A bodyweight session's summary: no "0kg" volume.
 *   5. The date picker's icon is drawn for the theme (a dark colour scheme, light on the light themes).
 *   4. Fresh potatoes, sweet potatoes, plantain and yam are produce on the shopping list, not dry goods.
 * (The meal day's "345 kcal under" is test:day-verdict's.)
 */
import { readFileSync } from 'fs'
import { kitchenLine } from '../src/lib/portion-scaler'
import { resolveGroceryTarget } from '../src/lib/grocery-store'
import { LIGHT_THEME_ORDER } from '../src/lib/appearance-palette'

let ran = 0, failures = 0
function check(label: string, ok: boolean, extra?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — got ${JSON.stringify(extra)}` : ''}`) }
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

console.log('1. Ingredient lines')
const cases: [number, string, string, string][] = [
  [3, 'whole', 'egg', '3 eggs'], [1, 'whole', 'egg', '1 egg'], [7, 'whole', 'corn tortilla', '7 corn tortillas'],
  [2, 'whole', 'peach', '2 peaches'], [2, 'whole', 'berry', '2 berries'], [1, 'whole', 'star anise', '1 star anise'],
  [2, 'whole', 'star anise', '2 star anise'], [2, 'whole', 'egg, beaten', '2 eggs, beaten'], [2, 'whole', 'avocado', '2 avocados'],
  [2, 'clove', 'garlic', '2 garlic cloves'], [1, 'clove', 'garlic', '1 garlic clove'],
  [150, 'g', 'chicken breast', '150g chicken breast'], [200, 'ml', 'milk', '200ml milk'], [1.5, 'tbsp', 'olive oil', '1½ tbsp olive oil'],
]
const wrong = cases.filter(([q, u, n, want]) => kitchenLine(q, u, n) !== want).map(([q, u, n, want]) => ({ want, got: kitchenLine(q, u, n) }))
check('each line reads as a cook says it', wrong.length === 0, wrong)
const meal = strip(readFileSync('src/components/MealPlan.tsx', 'utf8'))
check('the meal card writes its lines through it', /function displayIngredient[\s\S]{0,200}kitchenLine\(ing\.quantity, ing\.unit, ing\.name\)/.test(meal))

console.log('\n2. Extra work\'s badge')
const extra = strip(readFileSync('src/components/exercise/AdditionalWorkSection.tsx', 'utf8'))
check('"1 set" for one, "sets" otherwise', /\{completedSets\} \{completedSets === 1 \? 'set' : 'sets'\}/.test(extra) && !/\{completedSets\} sets</.test(extra))

console.log('\n3. A bodyweight session\'s volume')
const summary = strip(readFileSync('src/components/exercise/SessionSummaryDialog.tsx', 'utf8'))
check('the volume tile shows kg only when there is load moved, and says Bodyweight otherwise',
  /totalVolumeKg > 0\s*\?[\s\S]{0,200}kg[\s\S]{0,120}:\s*<span[^>]*>Bodyweight<\/span>/.test(summary))

console.log('\n4. The shopping list files fresh potatoes with the vegetables')
const aisle = (n: string) => resolveGroceryTarget(n).category
const fresh = ['potato raw', 'sweet potato raw', 'plantain', 'yellow yam'].map(n => [n, aisle(n)])
check('potatoes, sweet potatoes, plantain and yam are produce', fresh.every(([, a]) => a === 'produce'), fresh)
const dry = ['plantain chips', 'cornflakes', 'basmati rice cooked', 'pasta cooked'].map(n => [n, aisle(n)])
check('...while plantain chips, cereal, rice and pasta stay dry goods', dry.every(([, a]) => a === 'dry_goods'), dry)

console.log('\n5. The browser\'s own controls (the date picker) follow the theme')
const css = readFileSync('src/index.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const lightRule = /((?:\[data-theme="[a-z]+"\],?\s*)+)\{\s*color-scheme:\s*light;?\s*\}/.exec(css)?.[1] ?? ''
check('the page is a dark scheme by default', /:root\s*\{\s*color-scheme:\s*dark;?\s*\}/.test(css))
check('...and every light theme says light (derived from the app\'s own list of light themes)', LIGHT_THEME_ORDER.length > 0 && LIGHT_THEME_ORDER.every(t => lightRule.includes(`[data-theme="${t}"]`)), { lightRule, LIGHT_THEME_ORDER })

console.log('\n6. Profile\'s small controls have a 44 px tap area (the reply-speed and Appearance chips were 38 px)')
const small: string[] = []
for (const f of ['src/components/ProfileScreen.tsx', 'src/components/AppearanceSection.tsx']) {
  // Buttons only: a decorative preview swatch is not a control. (Not `[^>]*`: an onClick's `=>` would end the tag.)
  for (const m of strip(readFileSync(f, 'utf8')).matchAll(/<button\b(?:(?!<\/?[A-Za-z])[\s\S]){0,600}?className=[{"`]+([^"`]*\b(?:min-)?h-\[(?:3[0-9]|2[0-9])px\][^"`]*)/g)) {
    if (!/\bhit-slop-44\b/.test(m[1])) small.push(`${f}: ${m[1].slice(0, 60)}`)
  }
}
check('every control drawn under 40 px on Profile and Appearance reaches 44 px by its hit area', small.length === 0, small)

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.error(`${failures} qa-wording check(s) FAILED`); process.exit(1) }
console.log('qa-wording: all checks passed')

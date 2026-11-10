/**
 * test:qa-wording — small wording defects from the 10 Nov 2026 QA walks, each held where it is decided.
 *   1. An ingredient line as a cook says it: "3 eggs", "7 corn tortillas", "2 garlic cloves" (was "3 whole egg").
 *   2. Extra work's badge: "1 set", "2 sets" (was "1 sets").
 *   3. A bodyweight session's summary: no "0kg" volume.
 * (The meal day's "345 kcal under" is test:day-verdict's.)
 */
import { readFileSync } from 'fs'
import { kitchenLine } from '../src/lib/portion-scaler'

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

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.error(`${failures} qa-wording check(s) FAILED`); process.exit(1) }
console.log('qa-wording: all checks passed')

// Probe: a user adds a dietary restriction AFTER their meals were generated.
import { readFileSync } from 'fs'
import { validateMealAgainstDiet } from '../src/lib/diet-rules'

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`) }
}

const breakfast = [
  { name: 'greek yoghurt 0%', quantity: 200, unit: 'g' },
  { name: 'peanut butter', quantity: 15, unit: 'g' },
  { name: 'banana', quantity: 100, unit: 'g' },
]

console.log('\n[1] The app CAN tell this breakfast breaks a nut-free restriction')
const verdict = validateMealAgainstDiet(breakfast, ['nut-free'])
check('validateMealAgainstDiet rejects it', verdict.ok === false, verdict.violations)

console.log('\n[2] Does anything re-check an ALREADY-GENERATED meal against the profile?')
const renderPath = ['src/App.tsx', 'src/components/NutritionDisplay.tsx', 'src/components/MealPlan.tsx', 'src/components/Dashboard.tsx']
for (const f of renderPath) {
  const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  check(`${f} re-validates the meals it displays`, /validateMealAgainstDiet\s*\(/.test(src))
}

console.log('\n[3] Does changing the restriction trigger a regeneration?')
const app = readFileSync('src/App.tsx', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const effects = [...app.matchAll(/useEffect\([\s\S]*?\}, \[([^\]]*)\]\)/g)].map(m => m[1].trim())
console.log(`  App.tsx has ${effects.length} effects; dependency lists: ${effects.map(e => `[${e}]`).join(' ')}`)
check('some effect watches dietary_preferences', effects.some(e => /dietary/i.test(e)))
check('some effect watches injuries', effects.some(e => /injur/i.test(e)))
check('some effect watches equipment', effects.some(e => /equipment/i.test(e)))
check('some effect watches training days', effects.some(e => /training_days|trainingDays/i.test(e)))

console.log('\n[4] What the Profile screen says about this')
const profile = readFileSync('src/components/ProfileScreen.tsx', 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
check('ProfileScreen triggers meal regeneration after a diet edit', /generateMealPools|regenerate/i.test(profile))
check('ProfileScreen triggers a plan rebuild after an injury/equipment edit', /rebuildForInjury|substituteForInjury|generateMesocycle/.test(profile))
check('ProfileScreen recomputes macros after a weight/age/height edit', /computeTargets/.test(profile))

if (failures) console.error(`\n${failures} check(s) failed — each failure is a finding.`)

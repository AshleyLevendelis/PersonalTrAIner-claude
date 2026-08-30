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
// RE-SCOPED AFTER THE FIX, 30 Aug 2026, and the reason matters.
//
// This originally checked four files for a call to validateMealAgainstDiet.
// Both halves were wrong once the fix landed. The re-check ships as
// checkMealAgainstRestrictions (it covers the avoid-list as well as the
// dietary tags, which validateMealAgainstDiet does not), and of those four
// files only MealPlan.tsx puts a meal name on screen — Dashboard renders no
// meals at all, and NutritionDisplay delegates to MealPlan.
//
// Left unchanged, this probe reported a shipped fix as still broken, which is
// worse than not measuring it: it is the audit's own reproducible evidence,
// and anyone re-running it would have concluded the work never landed.
const renderPath = ['src/components/MealPlan.tsx']
for (const f of renderPath) {
  const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  check(`${f} re-validates the meals it displays`, /checkMealAgainstRestrictions\s*\(/.test(src))
}

console.log('\n[3] Does changing the restriction trigger a regeneration?')
const app = readFileSync('src/App.tsx', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const effects = [...app.matchAll(/useEffect\([\s\S]*?\}, \[([^\]]*)\]\)/g)].map(m => m[1].trim())
console.log(`  App.tsx has ${effects.length} effects; dependency lists: ${effects.map(e => `[${e}]`).join(' ')}`)

// RE-POINTED AT BEHAVIOUR, 30 Aug 2026. These four used to require an effect
// with the field in its dependency list, and the two below required the fix to
// live inside ProfileScreen. Both encode ONE implementation of "does the
// change take effect", and the one that shipped is a different one:
//
//   - a profile edit that invalidates the plan raises an OFFER (ask, never
//     silently rebuild somebody's next sixteen weeks off a settings toggle),
//     and the rebuild itself lives in App, which owns the mesocycle —
//     ProfileScreen only reports;
//   - meals are re-checked where they are DISPLAYED rather than regenerated
//     on edit, so a restriction added later flags the meal already on screen.
//
// A probe that fails on a correct fix is worse than no probe: it is the
// audit's own evidence, and re-running it would say the work never landed.
// So these now ask whether the change reaches the user, not how.

const invalidation = readFileSync('src/lib/plan-invalidation.ts', 'utf8')
const appSrc = readFileSync('src/App.tsx', 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

console.log('\n[3] Does a profile change reach the plan and the targets?')
for (const [label, field] of [['injuries', 'injuries'], ['equipment', 'equipment_access'], ['training days', 'training_days']] as const) {
  check(`changing ${label} offers a plan rebuild`, new RegExp(`'${field}'`).test(invalidation))
}
check('...and the rebuild is actually wired up, not just detected',
  /rebuildFromCurrentWeek\(/.test(appSrc) && /handleConfirmRebuild/.test(appSrc))
check('...behind an explicit confirm rather than silently',
  /onClick=\{handleConfirmRebuild\}/.test(appSrc))
check('a dietary change re-checks the meals already on screen',
  /checkMealAgainstRestrictions\s*\(/.test(readFileSync('src/components/MealPlan.tsx', 'utf8')))
check('a weight/age/height change recomputes the targets',
  /macroInputs/.test(appSrc) && /setMacros\(computeTargets\(/.test(appSrc))

if (failures) console.error(`\n${failures} check(s) failed — each failure is a finding.`)

// ---------------------------------------------------------------------------
// Gate for the five defects the 30 Aug 2026 audit found. Four of the five are
// the SAME SHAPE: something written, shown back to the user, and read by
// nothing. §6 is the check that stops that shape returning.
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { compileTrainingDayOverrides, compileKnownLiftOverrides } from '../src/lib/fact-compiler'
import { containsPhrase } from '../src/lib/meal-ingredients'
import type { UserFactRow, UserGoalRow, TrainingDay } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}
const strip = (f: string) => readFileSync(join(ROOT, f), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const app = strip('src/App.tsx')

console.log('\n1. "I can\'t train Mondays" reaches the plan')
{
  const days: TrainingDay[] = ['Monday','Tuesday','Wednesday'].map(d => ({ day: d, available: true }))
  const fact = { kind: 'hard_constraint', constraint_kind: 'availability', weekday: 'Monday' } as UserFactRow
  const out = compileTrainingDayOverrides([fact], days)
  check('the compiler still closes the named day', out.find(d => d.day === 'Monday')?.available === false)
  check('...and leaves the others alone', out.filter(d => d.day !== 'Monday').every(d => d.available))
  check('APP NOW CALLS IT — this is what was missing', /compileTrainingDayOverrides\(memoryFacts,/.test(app))
  check('...onto the profile the generators read', /training_days: compileTrainingDayOverrides/.test(app))
}

console.log('\n2. A lift stated as a goal reaches load prescription')
{
  const goal = { metric: 'lift_working_kg', metric_ref: 'Deadlifts', baseline_value: 100 } as UserGoalRow
  check('the compiler still maps the lift to its column',
    compileKnownLiftOverrides([goal]).known_deadlift_kg === 100)
  check('...and ignores a goal that is not a working weight',
    Object.keys(compileKnownLiftOverrides([{ ...goal, metric: 'body_weight_kg' } as UserGoalRow])).length === 0)
  check('APP NOW CALLS IT — this is what was missing', /compileKnownLiftOverrides\(memoryGoals\)/.test(app))
  // It must not fight itself: writing derived state back into its own source
  // needs the equality guard or every render sets state again.
  check('...guarded so it cannot loop', /JSON\.stringify\(corrected\) !== JSON\.stringify\(profile\)/.test(app))
}

console.log('\n3. A meal swap cannot serve back something they refuse to eat')
const swap = strip('src/lib/meal-swap-proposal.ts')
{
  check('the pool is filtered before anything is chosen', /const allowed = options\.filter\(o => optionBlockedBy/.test(swap))
  check('...and the rotation runs over the FILTERED list', /nextPoolOption\(allowed,/.test(swap))
  // Both channels. A dislike and an allergy arrive by different routes and
  // never overlap: checking one leaves the other half of the hole open.
  check('dislikes are checked', /dislikedFoods\.find\(f => containsPhrase\(/.test(swap))
  check('...and dietary/allergen tags too', /validateMealAgainstDiet\(option\.ingredients, dietaryPreferences\)/.test(swap))
  check('a named request cannot override a restriction', /if \(requested\) \{[\s\S]{0,200}optionBlockedBy\(requested/.test(swap))
  check('an emptied pool offers new options rather than dead-ending',
    /Everything I've got saved for \$\{slot\} has something in it/.test(swap))
  check('neither matcher is a second copy of the rule',
    /from '\.\/meal-ingredients'/.test(swap) && /from '\.\/diet-rules'/.test(swap))
  const chat = strip('src/components/ChatAssistant.tsx')
  check('the caller actually passes the restrictions in',
    /dislikedFoods: compileFoodDislikes\(memoryFacts\)/.test(chat) && /dietaryPreferences: profile\.dietary_preferences/.test(chat))
  // The behaviour itself, on Ashley's exact case.
  const almondOats = { name: 'Almond Butter Oats', ing: ['oats', 'almond butter'] }
  const porridge = { name: 'Plain Porridge', ing: ['oats', 'milk'] }
  check('...and the matcher blocks the meal she was offered',
    containsPhrase(almondOats.name, almondOats.ing, 'almond butter'))
  check('...while leaving an innocent option offerable',
    !containsPhrase(porridge.name, porridge.ing, 'almond butter'))
}

console.log('\n4. The profile screen agrees with what the app actually does')
{
  const prof = strip('src/components/ProfileScreen.tsx')
  check('a food dislike is described as excluded, whatever its hardness',
    /fact\.kind === 'food_preference' && fact\.polarity === 'dislike'\) return 'excluded from your meals'/.test(prof))
  check('...and the "won\'t eat" list shows every banned food',
    /f\.kind === 'food_preference' && f\.polarity === 'dislike'\)\n/.test(prof + '\n'))
  check('...so it no longer filters that list to hard only',
    !/f\.polarity === 'dislike' && f\.hardness === 'hard'/.test(prof))
  check('the mild wording still exists for things it IS true of (exercise)',
    /biases suggestions — nothing removed/.test(prof))
}

console.log('\n5. A cardio log that failed to save is visible and recoverable')
{
  const notice = strip('src/components/exercise/FailedCardioNotice.tsx')
  check('it reads the failures the store already kept', /getPendingCardioFailures\(\)/.test(notice))
  check('...and re-reads them when the store changes', /subscribeCardioLogStore\(read\)/.test(notice))
  check('retry is wired', /retryFailedCardioLog\(f\.clientId!\)/.test(notice))
  check('discard is wired', /discardFailedCardioLog\(f\.clientId!\)/.test(notice))
  check('it says nothing at all when there is nothing wrong', /if \(failures\.length === 0\) return null/.test(notice))
  const tab = strip('src/components/exercise/ExerciseTab.tsx')
  check('AND IT IS MOUNTED — the whole defect was an unmounted surface', /<FailedCardioNotice \/>/.test(tab))
}

console.log('\n6. The orphan class cannot come back')
// Four of the five above were a compiler or a store function that existed,
// worked, was documented, and had no caller. This asserts the property rather
// than the instances: everything fact-compiler.ts exports must be reachable
// from production code.
{
  const files: string[] = []
  const walk = (d: string) => {
    for (const f of readdirSync(join(ROOT, d))) {
      const rel = join(d, f)
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel)
      else if (/\.(ts|tsx)$/.test(f)) files.push(rel)
    }
  }
  walk('src')
  const compiler = readFileSync(join(ROOT, 'src/lib/fact-compiler.ts'), 'utf8')
  const exported = [...compiler.matchAll(/^export function (\w+)/gm)].map(m => m[1])
  const orphaned = exported.filter(name => !files.some(f =>
    f !== 'src/lib/fact-compiler.ts' && new RegExp(`\\b${name}\\b`).test(readFileSync(join(ROOT, f), 'utf8'))))
  check(`every fact compiler has a production caller (${exported.length} checked)`, orphaned.length === 0, orphaned)

  const cardio = readFileSync(join(ROOT, 'src/lib/cardio-log-store.ts'), 'utf8')
  const cardioExports = [...cardio.matchAll(/^export function (\w+)/gm)].map(m => m[1])
  const cardioOrphans = cardioExports.filter(name => !files.some(f =>
    f !== 'src/lib/cardio-log-store.ts' && new RegExp(`\\b${name}\\b`).test(readFileSync(join(ROOT, f), 'utf8'))))
  check(`every cardio-store export has a caller (${cardioExports.length} checked)`, cardioOrphans.length === 0, cardioOrphans)
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`)
  process.exit(1)
}
console.log('\nAll audit-fix checks passed.')

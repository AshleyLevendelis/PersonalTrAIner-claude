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
// Four of the five defects above were a function that existed, worked, was
// documented, and had no caller. This asserts the PROPERTY rather than the
// instances.
//
// THIS SECTION WAS ITSELF WRONG ON ITS FIRST WRITING, and Ashley asking me to
// re-test is what found it: the regex was /^export function/, so it silently
// skipped every `export async function` — and one of those, in the very file
// it was policing, was still orphaned while this reported "all 6 checked".
// A gate that cannot see half its subject is worse than no gate, because it
// is believed.
//
// An export with no consumer is now allowed ONLY if it is listed here with a
// reason. Silence is the failure mode this whole class is made of, so an
// unconsumed export must be acknowledged rather than tolerated — and a stale
// entry fails too, so the list cannot rot into a blanket exemption.
{
  const WATCHED = [
    'src/lib/fact-compiler.ts', 'src/lib/cardio-log-store.ts',
    'src/lib/meal-ingredients.ts', 'src/lib/meal-store.ts', 'src/lib/meal-swap-proposal.ts',
  ]
  const KNOWN_UNCONSUMED: Record<string, string> = {
    getCardioLogsForDateMerged:
      'No day-level cardio list exists for it to feed; the failed-log surface reads getPendingCardioFailures instead. Exercised by test:cardio-log.',
    getDeadLetterCount:
      'A dead-lettered meal event is poison data with no user action to offer, so a count has nowhere honest to go. Exercised by test:meal-roundtrip, which is what proves permanent failures are dead-lettered at all.',
  }

  const files: string[] = []
  const walk = (d: string) => {
    for (const f of readdirSync(join(ROOT, d))) {
      const rel = join(d, f)
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel)
      else if (/\.(ts|tsx)$/.test(f)) files.push(rel)
    }
  }
  walk('src')

  const unconsumed: string[] = []
  const staleAllowance: string[] = []
  const scanned = new Set<string>()
  let checked = 0
  for (const watched of WATCHED) {
    const text = readFileSync(join(ROOT, watched), 'utf8')
    // async included. That omission is the bug this section is fixing.
    const names = [...text.matchAll(/^export (?:async )?function (\w+)/gm)].map(m => m[1])
    checked += names.length
    for (const name of names) {
      scanned.add(name)
      const usedElsewhere = files.some(f =>
        f !== watched && new RegExp(`\\b${name}\\b`).test(readFileSync(join(ROOT, f), 'utf8')))
      // Called from inside its own module counts: that is a real consumer.
      const body = text.replace(new RegExp(`^export (?:async )?function ${name}\\b.*$`, 'm'), '')
      const usedInFile = new RegExp(`\\b${name}\\s*\\(`).test(body)
      const consumed = usedElsewhere || usedInFile
      if (!consumed && !(name in KNOWN_UNCONSUMED)) unconsumed.push(`${watched}:${name}`)
      if (consumed && name in KNOWN_UNCONSUMED) staleAllowance.push(name)
    }
  }
  check(`every export is consumed or acknowledged (${checked} checked, async included)`,
    unconsumed.length === 0, unconsumed)
  check('...and the acknowledgement list has no stale entries', staleAllowance.length === 0, staleAllowance)
  check('...and it has not become a blanket exemption',
    Object.keys(KNOWN_UNCONSUMED).length <= 3, Object.keys(KNOWN_UNCONSUMED))
  // THE REGRESSION THAT MADE THIS SECTION BLIND, asserted as BEHAVIOUR.
  // The first attempt tested it by grepping this file for its own regex
  // literal — which the literal itself satisfied, so reverting the scanner to
  // the broken pattern left the gate green. A rule about code must not be
  // provable by the text of the rule.
  //
  // getCardioLogsForDateMerged is declared `export async function`. If the
  // scanner cannot see it, it was never scanned, and every other async export
  // in these five files is invisible too.
  const missedByScanner = Object.keys(KNOWN_UNCONSUMED).filter(n => !scanned.has(n))
  check('async exports are actually scanned, not skipped', missedByScanner.length === 0, missedByScanner)
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`)
  process.exit(1)
}
console.log('\nAll audit-fix checks passed.')

// ---------------------------------------------------------------------------
// WHAT YOU ATE IS NOT REWRITTEN BY WHAT YOU LATER DECIDE — roadmap item 9.
//
// Ashley's item 9, verbatim: "Ensure updating dietary preferences or adding
// extra items preserves historical consumed meal records instead of
// retroactively altering past eaten logs on the diary screen." She asked for
// it as a PRECAUTION rather than from a sighting, so the deliverable is this
// gate as much as the fix.
//
// Two real gaps existed when it was written, both on today's screen:
//   1. The NAME beside a logged meal was re-read from the current plan, so
//      swapping the slot after logging showed the new meal's name above the
//      old meal's calories. A code comment called this "considered and kept";
//      item 9 overrides it.
//   2. A meal already eaten carried the same red "no longer fits your
//      restrictions" warning as an uneaten one. Ruling, 9 Sep 2026: a quiet
//      note instead.
//
// What was already right and must STAY right: the ledger is append-only, each
// event carries its own copy of the name and macros, undo is a compensating
// void rather than a delete, and no preference change touches those rows.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { checkMealAgainstRestrictions, describeEatenBeforeChange } from '../src/lib/meal-restriction-check'

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}
const src = (f: string) => readFileSync(f, 'utf8')
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// ---------------------------------------------------------------------------
console.log('\n[1] The quiet note for a meal already eaten')
// ---------------------------------------------------------------------------
const nutty = checkMealAgainstRestrictions(
  'Porridge with almond butter',
  [{ name: 'rolled oats', quantity: 60, unit: 'g' }, { name: 'almond butter', quantity: 20, unit: 'g' }],
  ['nut-free'], [],
)
check('a nut meal still fails the check once nut-free is on', nutty.ok === false, nutty)
const note = describeEatenBeforeChange(nutty)
check('...and the eaten note names the food AND the restriction',
  !!note && /almond/i.test(note) && /nut-free/.test(note), note)
check('...in the past tense — it reports, it does not instruct',
  !!note && /you ate it before|you ate this before/i.test(note), note)
check('...and asks for nothing: no swap, no regenerate, no warning verb',
  !!note && !/swap|regenerate|no longer fits|remove|fix/i.test(note), note)
// The whole point of the split: the ACTIONABLE warning and the eaten note are
// different sentences. If they ever converge, the ruling has been lost.
check('...and it is NOT the same sentence as the actionable warning',
  !!note && note !== nutty.message, { note, warning: nutty.message })

const fine = checkMealAgainstRestrictions('Porridge', [{ name: 'rolled oats', quantity: 60, unit: 'g' }], ['nut-free'], [])
check('a meal that breaks nothing gets no note at all', describeEatenBeforeChange(fine) === null, describeEatenBeforeChange(fine))

// A tag violation whose ingredient could not be resolved: the short form, and
// still never an invented ingredient name.
const unnamed = describeEatenBeforeChange({
  ok: false, message: 'x',
  issues: [{ kind: 'diet', restriction: 'dairy-free' }],
})
check('with no ingredient to name it still says what changed', !!unnamed && /dairy-free/.test(unnamed), unnamed)
check('...and invents no ingredient', !!unnamed && !/undefined|null/.test(unnamed), unnamed)

// ---------------------------------------------------------------------------
console.log('\n[2] The screen shows the meal that was EATEN, not the one now planned')
// ---------------------------------------------------------------------------
const meal = strip(src('src/components/MealPlan.tsx'))
check('a logged row takes its name from the stored event',
  /const loggedName = loggedEvents\[0\]\?\.mealName/.test(meal))
check('...and that is what the heading renders, not the current option',
  /const displayName = isLogged && loggedName \? loggedName : option\?\.name/.test(meal)
  && />\s*\{displayName\}\s*</.test(meal))
check('...so the plan\'s own name is no longer rendered as the heading',
  !/>\s*\{option\.name\}\s*</.test(meal))
check('when the plan has moved on, the screen says whose details it is showing',
  /const planMovedOn = isLogged && loggedName != null && option != null && loggedName !== option\.name/.test(meal)
  && /Your plan now shows \{option\.name\} here/.test(meal))

// ---------------------------------------------------------------------------
console.log('\n[3] An eaten meal is noted, never warned at')
// ---------------------------------------------------------------------------
check('the restrictions banner skips slots already eaten',
  /blockedSlots = SLOT_ORDER\.filter\([\s\S]{0,220}\(loggedBySlot\[s\]\?\.length \?\? 0\) === 0/.test(meal))
check('the red row warning is guarded by "not logged"',
  /\{blocked && !isLogged && restriction\?\.message && \(/.test(meal))
check('...and the eaten note takes its place, from the shared helper',
  /describeEatenBeforeChange\(restriction\)/.test(meal) && /\{eatenNote && \(/.test(meal))
// WHERE it renders is the point. The first build put it inside the expanded
// detail, so an allergen note sat behind a tap — caught by the browser driver,
// pinned here so it cannot slide back in.
check('...and it sits on the row itself, not behind a tap',
  meal.indexOf('{eatenNote && (') < meal.indexOf('{expanded && option && ('), {
    note: meal.indexOf('{eatenNote && ('), expanded: meal.indexOf('{expanded && option && ('),
  })
check('the note is only claimed when the eaten meal IS still this slot\'s option',
  /const eatenNote = isLogged && !planMovedOn && restriction && !restriction\.ok/.test(meal))
// Logging a flagged meal is still refused, and unlogging is still always
// allowed — item 9 must not have quietly reopened the thing the flag exists for.
check('a flagged meal still cannot be logged', /if \(blocked && !isLogged\) return/.test(meal))

// ---------------------------------------------------------------------------
console.log('\n[4] The record itself is append-only and self-contained')
// ---------------------------------------------------------------------------
const store = strip(src('src/lib/meal-store.ts'))
check('a logged event stores its own name and macros, not a reference',
  /mealName: row\.meal_name/.test(store) && /macros: row\.macros \?\?/.test(store))
check('...read straight from the row, with no lookup against the meal pools',
  !/lookupIngredient|assembleDay|poolFor/.test(store))
// The one mutation allowed is the void flag. Anything else against this table
// is history being rewritten.
// The captured slice must reach PAST the method name into its payload, or
// `/voided_at/` below is tested against the string "…update(" and passes for
// any update at all. Caught by this gate's own first run.
const eventWrites = [...store.matchAll(/from\('meal_events'\)[\s\S]{0,200}?\.(?:update|delete)\([\s\S]{0,160}/g)].map(m => m[0])
check('nothing deletes a logged meal', !eventWrites.some(w => /\.delete\(/.test(w)), eventWrites)
check('...and the only update is the undo\'s void flag',
  eventWrites.every(w => /voided_at/.test(w)), eventWrites)

// ---------------------------------------------------------------------------
console.log('\n[5] A meal choice cannot be written onto a day that has passed')
// ---------------------------------------------------------------------------
check('the past-date test exists as its own named rule', /export function isPastDateForPicks/.test(store))
check('...and compares against the app clock, not a raw Date',
  /date < getLocalDateString\(getAppNow\(profileId\)\)/.test(store))
check('setMealPick refuses before it writes',
  /if \(isPastDateForPicks\(date, profileId\)\) \{[\s\S]{0,220}return\s*\n?\s*\}[\s\S]{0,120}from\('meal_plan_picks'\)/.test(store))
check('...and says so loudly rather than failing silently',
  /Refused to set a meal pick on a past date/.test(store))

console.log(failures === 0 ? '\nAll diary-preservation checks passed.\n' : `\n${failures} check(s) FAILED.\n`)
process.exit(failures === 0 ? 0 : 1)

// ---------------------------------------------------------------------------
// Gate: a Profile change that makes the plan wrong actually offers to fix it.
//
// Audit §2.1, item 11. ProfileScreen's savePatch wrote the field and did
// nothing else, so somebody could add a knee injury and every squat, lunge
// and step-up already in their sixteen-week plan stayed exactly where it was
// — permanently, because nothing re-ran. The app knew about the injury and
// went on prescribing against it.
//
// THREE PROPERTIES, and they pull against each other, which is why all three
// are held here rather than trusting any one of them:
//
//   IT MUST FIRE, or the fix does nothing. Section 1 runs the real detector.
//   IT MUST NOT FIRE FOR EVERYTHING, or people learn to dismiss the dialog
//     without reading it and the one that matters gets dismissed too.
//   IT MUST NEVER REWRITE LOGGED WEEKS. Past weeks hold work somebody
//     actually did; rewriting them makes their history disagree with their
//     memory. Section 3 rebuilds a real mesocycle and compares.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { detectPlanInvalidation, rebuildFromCurrentWeek, PLAN_INVALIDATING_FIELDS } from '../src/lib/plan-invalidation'
import { generateExercisePlan, generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import type { UserProfile } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const base = (o: Record<string, unknown> = {}): UserProfile => ({
  age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
  fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1800, tdee: 2500,
  equipment_access: 'full_gym', injuries: [], training_style: 'hybrid',
  training_experience: 'intermediate', session_duration_preference: '45-60',
  workout_split_preference: 'upper_lower',
  training_days: [
    { day: 'Monday', available: true }, { day: 'Tuesday', available: true },
    { day: 'Wednesday', available: true }, { day: 'Thursday', available: true },
    { day: 'Friday', available: false }, { day: 'Saturday', available: false },
    { day: 'Sunday', available: false },
  ],
  weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
  exercise_exclusions: [], macro_calculation_mode: 'STANDARD_STATIC',
  coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
  ...o,
} as unknown as UserProfile)

console.log('\n1. The changes that make a plan wrong raise an offer')
{
  const addedInjury = detectPlanInvalidation(base(), { injuries: ['knees'] })
  check('adding an injury offers a rebuild', addedInjury?.field === 'injuries', addedInjury)
  check('...and says what it would do, in plain terms',
    !!addedInjury && /rebuild it from this week/.test(addedInjury.detail), addedInjury?.detail)
  check('...and promises logged work is untouched',
    !!addedInjury && /already logged stays/.test(addedInjury.detail), addedInjury?.detail)
  // Never a field name. Ashley is non-technical and so is every user.
  check('...without naming a database field',
    !!addedInjury && !/equipment_access|injuries|profile\./.test(addedInjury.detail), addedInjury?.detail)

  const changedKit = detectPlanInvalidation(base(), { equipment_access: 'bodyweight' })
  check('changing equipment offers a rebuild', changedKit?.field === 'equipment_access', changedKit)
}

console.log('\n2. And nothing else does')
{
  // A dialog that fires on a name change trains people to dismiss it.
  const noise: [string, Partial<UserProfile>][] = [
    ['a name', { display_name: 'Ash' }],
    ['an age', { age: 31 }],
    ['a weight', { weight_kg: 82 }],
    ['a dietary preference', { dietary_preferences: ['nut-free'] }],
    ['a training goal', { fitness_goal: 'fat_loss' }],
  ]
  for (const [what, patch] of noise) {
    check(`changing ${what} does not`, detectPlanInvalidation(base(), patch) === null, patch)
  }

  // Re-saving the SAME injuries is what the picker does on every toggle.
  const same = detectPlanInvalidation(base({ injuries: ['knees'] }), { injuries: ['knees'] })
  check('re-saving the same injuries does not', same === null, same)

  // Removing one leaves a plan that is merely more cautious than it needs to
  // be. Not urgent, and not worth interrupting somebody for.
  const removed = detectPlanInvalidation(base({ injuries: ['knees'] }), { injuries: [] })
  check('removing an injury does not', removed === null, removed)

  // training_days joined this list after the audit's own diet-change probe
  // caught it missing: the plan is built from the days marked available, so
  // dropping one leaves sessions scheduled on a day they no longer train.
  // training_style joined on 5 Sep 2026: generation reads it in three places
  // (pool style filter, base rep range per tier, STYLE_CONFIGS) and Settings
  // saved it without ever offering the rebuild — the profile said one style
  // while the plan on screen was still the other. Found while building the
  // chat tool for it; fixing only chat would have made chat the more honest
  // door, the opposite of parity.
  check('the invalidating list is exactly the fields that change what the plan contains',
    [...PLAN_INVALIDATING_FIELDS].sort().join(',') === 'equipment_access,injuries,training_days,training_style',
    PLAN_INVALIDATING_FIELDS)

  const daysChanged = detectPlanInvalidation(
    base({ training_days: [{ day: 'Monday', available: true }, { day: 'Tuesday', available: true }] }),
    { training_days: [{ day: 'Monday', available: true }] } as Partial<UserProfile>)
  check('dropping a training day offers a rebuild', daysChanged?.field === 'training_days', daysChanged)
  // Re-saving the same days in a different order must not nag.
  const reordered = detectPlanInvalidation(
    base({ training_days: [{ day: 'Monday', available: true }, { day: 'Tuesday', available: true }] }),
    { training_days: [{ day: 'Tuesday', available: true }, { day: 'Monday', available: true }] } as Partial<UserProfile>)
  check('...but re-saving the same days in another order does not', reordered === null, reordered)

  const styleChanged = detectPlanInvalidation(base(), { training_style: 'bodybuilding' })
  check('changing training style offers a rebuild', styleChanged?.field === 'training_style', styleChanged)
  check('...and says the exercises and rep ranges change, not just a label',
    !!styleChanged && /exercises and rep ranges/.test(styleChanged.detail), styleChanged?.detail)
  check('...and promises logged work is untouched',
    !!styleChanged && /already logged stays exactly as it is/.test(styleChanged.detail), styleChanged?.detail)
  check('...without naming a database field',
    !!styleChanged && !/training_style|profile\./.test(styleChanged.detail), styleChanged?.detail)
  const sameStyle = detectPlanInvalidation(base(), { training_style: 'hybrid' })
  check('re-saving the same style does not', sameStyle === null, sameStyle)
}

console.log('\n3. A rebuild changes the weeks ahead and NOT the weeks behind')
{
  setRandomSource(seededRngFromKey('rebuild-offer'))
  const profile = base()
  const meso = generateMesocycle(profile, generateExercisePlan(profile).plan)
  resetRandomSource()
  check('there is a plan to rebuild', meso.length >= 4, meso.length)

  const CURRENT = 3
  const snapshot = (weeks: typeof meso) => JSON.stringify(weeks.map(w => ({
    week: w.week_number,
    days: (w.days ?? []).map(d => ({ day: d.day, ex: (d.exercises ?? []).map(e => e.name) })),
  })))
  const beforeBehind = snapshot(meso.filter(w => w.week_number < CURRENT))
  const beforeAhead = snapshot(meso.filter(w => w.week_number >= CURRENT))

  const injured = base({ injuries: ['knees'] })
  const result = await rebuildFromCurrentWeek(injured, [], meso, CURRENT)
  check('the rebuild succeeds', result.ok, result.error)
  check(`...covering every week from ${CURRENT} on`,
    result.weeksRebuilt === meso.filter(w => w.week_number >= CURRENT).length, result.weeksRebuilt)

  const after = result.mesocycle ?? []
  check('week identity survives — nothing is renumbered',
    after.map(w => w.week_number).join(',') === meso.map(w => w.week_number).join(','))

  // THE ONE THAT PROTECTS SOMEBODY'S HISTORY.
  check('every week BEFORE the current one is untouched',
    snapshot(after.filter(w => w.week_number < CURRENT)) === beforeBehind)

  // And the rebuild has to actually do something, or it is a dialog that
  // changes nothing — which would be worse than not offering at all.
  check('the weeks from here on DID change', snapshot(after.filter(w => w.week_number >= CURRENT)) !== beforeAhead)

  // THE POINT OF THE WHOLE EXERCISE: the knee work is gone from the future.
  //
  // Compared over THE SAME WEEKS before and after the rebuild. An earlier
  // version compared the fourteen rebuilt weeks against the two untouched
  // ones as raw totals, so it demanded that fourteen weeks contain fewer
  // squats than two — a statement about how many weeks each side had, not
  // about whether the rebuild did anything.
  const kneeish = /squat|lunge|step-up|step up|leg press|leg extension/i
  const countKnee = (weeks: typeof meso) => weeks
    .filter(w => w.week_number >= CURRENT)
    .flatMap(w => (w.days ?? []).flatMap(d => (d.exercises ?? []).map(e => e.name)))
    .filter(n => kneeish.test(n)).length
  const kneeBefore = countKnee(meso)
  const kneeAfter = countKnee(after)
  check('knee-loading work in those same weeks is reduced',
    kneeAfter < kneeBefore, { sameWeeks: `${CURRENT}+`, before: kneeBefore, after: kneeAfter })
}

console.log('\n4. Nothing rebuilds without somebody saying yes')
{
  const app = stripComments(readFileSync(join(ROOT, 'src/App.tsx'), 'utf8'))
  const profileScreen = stripComments(readFileSync(join(ROOT, 'src/components/ProfileScreen.tsx'), 'utf8'))

  // ProfileScreen must REPORT, never rebuild. A screen that rebuilt directly
  // would bypass the dialog entirely.
  check('the Profile screen does not rebuild anything itself',
    !/rebuildFromCurrentWeek|rebuildAgainstProfile/.test(profileScreen))
  check('...it reports the change and lets App ask', /onPlanInvalidated\?\.\(/.test(profileScreen))
  // ONE call site, and it must sit AFTER updateProfileField's .then opens.
  // An earlier version matched "there is an onPlanInvalidated somewhere
  // inside the then block", which stayed green when a SECOND call was added
  // before the write — firing the offer for an injury whose save then failed,
  // which is exactly what the ordering exists to prevent.
  const offerCalls = [...profileScreen.matchAll(/onPlanInvalidated\?\.\(/g)].map(m => m.index ?? -1)
  check('...raised from exactly one place', offerCalls.length === 1, offerCalls.length)
  const thenAt = profileScreen.indexOf('updateProfileField(profileId, patch).then(')
  check('...only once the save actually landed',
    thenAt > 0 && offerCalls.every(i => i > thenAt), { thenAt, offerCalls })

  check('the rebuild runs from a confirm handler, not from an effect',
    /const handleConfirmRebuild = async/.test(app) && /onClick=\{handleConfirmRebuild\}/.test(app))
  check('there is a way to decline', /Leave it as it is/.test(app))
  check('...which clears the offer without rebuilding',
    /Leave it as it is/.test(app) && /onClick=\{\(\) => setPlanInvalidation\(null\)\}/.test(app))
  check('a failed save is reported rather than swallowed',
    /couldn't be rebuilt right now/.test(app))
  // The rebuild must start from the live week, or it would rewrite history.
  check('it starts from the current week, not from week 1',
    /getActiveMesocycleWeek\([\s\S]{0,200}rebuildFromCurrentWeek/.test(app))
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nAll rebuild-offer checks passed.')

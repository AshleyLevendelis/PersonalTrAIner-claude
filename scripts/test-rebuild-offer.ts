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
    // 'a training goal' was on this list until 5 Sep 2026. Removed on Ashley's
    // ruling — the goal drives volume, rest, rep ranges and conditioning, so it
    // is exactly the kind of change this dialog exists for. See §1 below.
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
  // start_preference joined 14 Sep 2026, on Ashley's instruction to close the
  // setup answers that could never be changed. It is the most plan-shaping of
  // them: starting-out.ts reads exactly this field to decide whether the app
  // builds the easing-in walking plan or a training plan, so a wrong answer
  // meant being stuck on the wrong KIND of plan with no way to say so.
  // The three known lifts joined 14 Sep 2026, on Ashley's ruling "rebuild only
  // when it matters" — and they are the first CONDITIONAL entries on this
  // list. §2b below is the condition.
  // session_duration_preference joined 16 Sep 2026, on Ashley's ruling from
  // three options: rebuild the rest of the block around the new length, over
  // trimming what is already there and over waiting for the next block. Its
  // ABSENCE was the defect, not an oversight — setting session length wrote
  // the number and touched nothing else, so the plan kept the old length and
  // today's card simply started saying the session ran over. Generation reads
  // it everywhere (the duration budget, the session minimum and maximum, sets
  // and reps per tier, the warm-up budget and the filler), which is exactly
  // the test this list's name states.
  //
  // THIS CHECK BLOCKED THE FIX, AND WAS RIGHT TO. It enumerates rather than
  // derives, which CLAUDE.md warns about — but here the enumeration IS the
  // property: the whole point is that a field cannot join silently, because
  // joining means the app starts rebuilding somebody's plan. A derived check
  // would have let this through unread. Suspect a blocking check; do not
  // assume it is wrong.
  check('the invalidating list is exactly the fields that change what the plan contains',
    [...PLAN_INVALIDATING_FIELDS].sort().join(',') === 'equipment_access,fitness_goal,injuries,known_bench_kg,known_deadlift_kg,known_squat_kg,session_duration_preference,start_preference,training_days,training_style',
    PLAN_INVALIDATING_FIELDS)

  // BOTH DIRECTIONS, because the copy differs and only one of them is the
  // obvious case: easing-in -> training is someone getting fitter, and
  // training -> easing-in is someone coming back from a break or an illness.
  // THE DIRECTION IS THE TEST, and asserting on a phrase is not enough to
  // catch it getting reversed. Both copies name BOTH plans — they have to, the
  // sentence is "you are on X, I can build you Y" — so /training plan/ matched
  // the easing-in copy too and swapping the two branches left this section
  // fully green. Measured, not reasoned: the swap was applied and the check
  // passed. So anchor on WHICH PLAN THE COPY ENDS ON, which is the plan the
  // person would end up with, and is the only thing the reversal changes.
  const endsOn = (detail: string): 'training' | 'easing' | 'unclear' => {
    const training = detail.toLowerCase().lastIndexOf('training plan')
    const easing = Math.max(detail.toLowerCase().lastIndexOf('easing-in'),
      detail.toLowerCase().lastIndexOf('walks and easy movement'))
    if (training < 0 || easing < 0) return 'unclear'
    return training > easing ? 'training' : 'easing'
  }
  const toTrain = detectPlanInvalidation(base({ start_preference: 'move_more' }), { start_preference: 'train' })
  check('moving to a training plan offers the rebuild', toTrain?.field === 'start_preference', toTrain)
  check('...and the copy ends on the plan she would GET — the training one',
    endsOn(toTrain?.detail ?? '') === 'training', toTrain?.detail)
  check('...and the heading names it too', /training/i.test(toTrain?.title ?? ''), toTrain?.title)
  const toEase = detectPlanInvalidation(base({ start_preference: 'train' }), { start_preference: 'move_more' })
  check('moving back to easing in offers it too', toEase?.field === 'start_preference', toEase)
  check('...and THAT copy ends on the easing-in plan, not the training one',
    endsOn(toEase?.detail ?? '') === 'easing', toEase?.detail)
  check('...with a heading that does not promise training',
    /easing in/i.test(toEase?.title ?? '') && !/training/i.test(toEase?.title ?? ''), toEase?.title)
  check('...and the two are not the same words either way',
    (toTrain?.detail ?? 'x') !== (toEase?.detail ?? 'y'), [toTrain?.detail, toEase?.detail])
  check('...both saying the change starts from this week, not from week 1',
    /from this week/i.test(toTrain?.detail ?? '') && /from this week/i.test(toEase?.detail ?? ''),
    [toTrain?.detail, toEase?.detail])
  check('...and both promising nothing logged is lost',
    /already logged stays/i.test(toTrain?.detail ?? '') && /already logged stays/i.test(toEase?.detail ?? ''),
    [toTrain?.detail, toEase?.detail])
  const sameStart = detectPlanInvalidation(base({ start_preference: 'train' }), { start_preference: 'train' })
  check('...and saving the same answer offers nothing', sameStart === null, sameStart)

  // -------------------------------------------------------------------------
  // 2b. THE KNOWN LIFTS, AND THE CONDITION THAT IS HER RULING
  // -------------------------------------------------------------------------
  // Asked on 14 Sep 2026 what a corrected setup lift should do, from three
  // options, she chose "rebuild only when it matters" over always offering and
  // over never offering. The reason it matters: `knownWorkingWeights` is packed
  // from these three ONLY when skip_calibration_week is set. After a real
  // calibration week the plan is anchored to what was actually lifted, so
  // correcting the setup guess changes no weight — and offering a rebuild would
  // be asking someone to give up their progression for nothing.
  const skipped = (o: Partial<UserProfile>) => base({ skip_calibration_week: true, known_bench_kg: 60, ...o } as Partial<UserProfile>)
  const calibrated = (o: Partial<UserProfile>) => base({ skip_calibration_week: false, known_bench_kg: 60, ...o } as Partial<UserProfile>)

  const benchFixed = detectPlanInvalidation(skipped({}), { known_bench_kg: 90 } as Partial<UserProfile>)
  check('correcting a lift the weights were BUILT from offers the rebuild',
    benchFixed?.field === 'known_bench_kg', benchFixed)
  check('...naming the lift in her words, not the field', /bench press/i.test(benchFixed?.title ?? ''), benchFixed?.title)
  check('...saying WHY it bears on the plan — the testing week was skipped',
    /skipped the first week/i.test(benchFixed?.detail ?? ''), benchFixed?.detail)
  check('...from this week, not from week 1', /from this week/i.test(benchFixed?.detail ?? ''), benchFixed?.detail)
  check('...and promising nothing logged is lost', /already logged stays/i.test(benchFixed?.detail ?? ''), benchFixed?.detail)

  // THE HALF THAT IS THE RULING. Same correction, a plan that was calibrated:
  // no offer, because nothing would change.
  const afterCalibration = detectPlanInvalidation(calibrated({}), { known_bench_kg: 90 } as Partial<UserProfile>)
  check('...while the SAME correction after a calibration week offers nothing',
    afterCalibration === null, afterCalibration)

  check('...and re-saving the same number offers nothing either',
    detectPlanInvalidation(skipped({}), { known_bench_kg: 60 } as Partial<UserProfile>) === null)
  // CLEARING one is not correcting it, and must not rebuild around a blank.
  check('...nor does clearing one', detectPlanInvalidation(skipped({}), { known_bench_kg: null } as unknown as Partial<UserProfile>) === null)

  // ALL THREE, not just the one that happened to be wired first.
  for (const [field, word] of [['known_squat_kg', 'squat'], ['known_deadlift_kg', 'deadlift']] as const) {
    const r = detectPlanInvalidation(skipped({ [field]: 100 } as Partial<UserProfile>), { [field]: 140 } as Partial<UserProfile>)
    check(`...and ${word} is wired too, not just the bench`, r?.field === field, r)
    check(`...naming the ${word} in her words`, new RegExp(word, 'i').test(r?.title ?? ''), r?.title)
  }

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

  // fitness_goal joined on 5 Sep 2026, on Ashley's ruling — it had been kept
  // off deliberately (see §2's former noise entry). Measured from
  // goal-policies.ts: set volume, rest multipliers and the main-lift rest
  // floor, rep-range shift per tier, allowed phases, the split, conditioning.
  const goalChanged = detectPlanInvalidation(base(), { fitness_goal: 'fat_loss' })
  check('changing the goal offers a rebuild', goalChanged?.field === 'fitness_goal', goalChanged)
  check('...and says what it changes, in plain terms',
    !!goalChanged && /how much you do/.test(goalChanged.detail) && /rest/.test(goalChanged.detail) && /rep ranges/.test(goalChanged.detail) && /conditioning/.test(goalChanged.detail),
    goalChanged?.detail)
  check('...and promises logged work is untouched', !!goalChanged && /already logged stays exactly/.test(goalChanged.detail), goalChanged?.detail)
  check('...without naming a database field', !!goalChanged && !/fitness_goal|profile\./.test(goalChanged.detail), goalChanged?.detail)
  const sameGoal = detectPlanInvalidation(base(), { fitness_goal: 'hypertrophy' })
  check('re-saving the same goal does not', sameGoal === null, sameGoal)
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

  // THE WORDS HAVE TO REACH A SCREEN. Everything above proves the offer is
  // RAISED and that saying yes or no does the right thing; none of it proves
  // anybody ever reads the sentence. detectPlanInvalidation writes a title and
  // a detail, and a dialog that dropped either would still pass every check
  // above while asking "rebuild my plan?" over a blank space.
  // This is here rather than in a browser driver for a measured reason, found
  // 16 Sep 2026: the harness page that drives Profile renders its OWN plain div
  // for the offer, so verify:setup-answers can read the words but can never see
  // this dialog. Nothing in .tour-harness boots App.tsx. A source check cannot
  // prove the branch is reached — but it can prove that when it is, both halves
  // of the offer are rendered, which is the part that can silently rot.
  const offerDialogAt = app.indexOf('<Dialog open={planInvalidation !== null}')
  const offerDialog = offerDialogAt < 0 ? '' : app.slice(offerDialogAt, app.indexOf('</Dialog>', offerDialogAt))
  check('the offer dialog renders the title it was given',
    /\{planInvalidation\?\.title\}/.test(offerDialog), { offerDialogAt })
  check('...and the detail underneath it',
    /\{planInvalidation\?\.detail\}/.test(offerDialog), { offerDialogAt })
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nAll rebuild-offer checks passed.')

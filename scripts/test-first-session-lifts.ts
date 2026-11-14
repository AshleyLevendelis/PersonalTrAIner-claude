// ---------------------------------------------------------------------------
// THE LIFT NUMBERS AT THE FIRST SESSION (his ruling 14 Nov 2026, "Ask at the first session"; first-session-lifts.ts).
// Holds:
//   1. when the card is due, and each thing that keeps it away (one at a time, from a case where it IS due);
//   2. what a typed set becomes: the plan's number, the first week skipped; a half-set or an implausible lift is said;
//   3. the claim the card makes is true in a real plan: with the answer, week 1 is no longer a testing week; without,
//      it is; and for the people the card is never shown to, answering would not have changed that;
//   4. the wiring: App saves then rebuilds from the SAVED profile, Today's panel renders it, both rebuilds share one road.
// The screen half is verify:first-session-lifts.
// ---------------------------------------------------------------------------
import fs from 'fs'
import { firstSessionLiftsDue, firstLiftsPatch, FIRST_LIFTS_WORDS, type FirstLiftsContext } from '../src/lib/first-session-lifts'
import { referenceWeightFromSet } from '../src/lib/working-weight'
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { buildProfile, generateAllCombinations, comboKey } from './quality-grid'
import type { MesocycleWeek, UserProfile } from '../src/lib/types'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const combo = generateAllCombinations().find(c => c.equipment === 'full_gym' && c.experience === 'intermediate' && c.injuries.length === 0 && c.goal === 'hypertrophy')!
const lifter = buildProfile(combo) as UserProfile
const plan = (p: UserProfile): MesocycleWeek[] => {
  setRandomSource(seededRngFromKey(comboKey(combo)))
  try { return generateMesocycle(p) } finally { resetRandomSource() }
}
const week1 = plan(lifter).find(w => w.week_number === 1)!

console.log('\n1. When the card is due')
{
  const base: FirstLiftsContext = { profile: lifter, week: week1, trainedBefore: false, dismissed: false }
  check('the fixture binds: an intermediate full-gym lifter in a testing first week, nothing logged', week1.isCalibrationWeek === true && firstSessionLiftsDue(base))
  const away: [string, FirstLiftsContext][] = [
    ['a set already logged', { ...base, trainedBefore: true }],
    ['the log could not be read (never ask on a guess)', { ...base, trainedBefore: null }],
    ['already answered or "I don\'t know" on this phone', { ...base, dismissed: true }],
    ['not a testing week', { ...base, week: { ...week1, isCalibrationWeek: false } }],
    ['the first week is already skipped', { ...base, profile: { ...lifter, skip_calibration_week: true } }],
    ['a lift is already known', { ...base, profile: { ...lifter, known_bench_kg: 80 } }],
    ['a beginner (a beginner always tests)', { ...base, profile: { ...lifter, training_experience: 'beginner' } }],
    ['no body weight given (the skip needs it)', { ...base, profile: { ...lifter, weight_kg: undefined } as unknown as UserProfile }],
    ['no barbell (bodyweight only)', { ...base, profile: { ...lifter, equipment_access: 'bodyweight' } }],
    ['no profile', { ...base, profile: null }],
  ]
  for (const [why, ctx] of away) check(`not due: ${why}`, firstSessionLiftsDue(ctx) === false)
}

console.log('\n2. What a typed set becomes')
{
  const r = firstLiftsPatch(lifter, { known_squat_kg: { weightKg: '100', reps: '5' }, known_deadlift_kg: { weightKg: '140', reps: '3' } })
  check('two sets: the plan\'s numbers, read as setup reads them, and the first week skipped',
    r.ok && r.patch.known_squat_kg === referenceWeightFromSet(100, 5) && r.patch.known_deadlift_kg === referenceWeightFromSet(140, 3)
      && r.patch.known_bench_kg === undefined && r.patch.skip_calibration_week === true, r)
  const half = firstLiftsPatch(lifter, { known_bench_kg: { weightKg: '80', reps: '' } })
  check('a weight with no reps is asked about in its own words, never kept', !half.ok && /bench press, put the weight and how many reps you got, or leave both empty/.test(half.message), half)
  const long = firstLiftsPatch(lifter, { known_bench_kg: { weightKg: '60', reps: '25' } })
  check('a set of 25 cannot be read and says so', !long.ok && /1 to 15 reps/.test(long.message), long)
  const none = firstLiftsPatch(lifter, {})
  check('nothing typed asks for a lift or "I don\'t know"', !none.ok && /I don't know/.test(none.message), none)
  const silly = firstLiftsPatch({ ...lifter, weight_kg: 60, gender: 'female' }, { known_bench_kg: { weightKg: '250', reps: '5' } })
  check('an implausible lift is said back, never saved', !silly.ok && silly.message.length > 0, silly)
}

console.log('\n3. The card\'s claim holds in a real plan')
{
  const r = firstLiftsPatch(lifter, { known_squat_kg: { weightKg: '100', reps: '5' }, known_bench_kg: { weightKg: '80', reps: '6' }, known_deadlift_kg: { weightKg: '140', reps: '3' } })
  const after = r.ok ? plan({ ...lifter, ...r.patch }).find(w => w.week_number === 1) : undefined
  check('answered: week 1 is no longer a testing week', !!after && after.isCalibrationWeek !== true, after?.isCalibrationWeek)
  check('unanswered: it is', week1.isCalibrationWeek === true)
  const beginner = { ...lifter, training_experience: 'beginner' } as UserProfile
  const bAfter = r.ok ? plan({ ...beginner, ...r.patch }).find(w => w.week_number === 1) : undefined
  check('a beginner answering would still test (so the card is right not to ask)', bAfter?.isCalibrationWeek === true, bAfter?.isCalibrationWeek)
  check('the card says what happens', /skip that week/.test(FIRST_LIFTS_WORDS.lead) && /first week finds/.test(FIRST_LIFTS_WORDS.lead))
}

console.log('\n4. The wiring')
{
  const app = strip(fs.readFileSync('src/App.tsx', 'utf8'))
  const h = app.slice(app.indexOf('const handleFirstSessionLifts'), app.indexOf('const handleConfirmRebuild'))
  check('App saves the numbers first', /await updateProfileField\(profile\.id, patch\)/.test(h))
  check('...then rebuilds from the SAVED profile, not the stale one', /const next = \{ \.\.\.profile, \.\.\.patch \}/.test(h) && /return rebuildPlanFrom\(next\)/.test(h))
  check('...and a failed save stops before the rebuild', h.indexOf('return `${couldNot(\'save those numbers') > -1 && h.indexOf('return `${couldNot(\'save those numbers') < h.indexOf('rebuildPlanFrom(next)'))
  const confirm = app.slice(app.indexOf('const handleConfirmRebuild'), app.indexOf('const closeRebuildDialog'))
  check('the rebuild offer goes the same road', /await rebuildPlanFrom\(profile, rebuildPreview\?\.seedKey\)/.test(confirm))
  check('App hands it to the Exercise tab', /onFirstSessionLifts=\{handleFirstSessionLifts\}/.test(app))
  const tab = strip(fs.readFileSync('src/components/exercise/ExerciseTab.tsx', 'utf8'))
  check('the Exercise tab passes it to Today', /onFirstSessionLifts=\{onFirstSessionLifts\}/.test(tab))
  const today = strip(fs.readFileSync('src/components/exercise/TodayPanel.tsx', 'utf8'))
  check('Today renders the card with it', /<FirstSessionLiftsCard[\s\S]{0,400}onSave=\{onFirstSessionLifts\}/.test(today))
  const onb = fs.readFileSync('src/lib/onboarding-slots.ts', 'utf8')
  check('and setup no longer asks the lifts (the reason the card exists)', /'knowsWorkingLifts', 'knownSquatKg', 'knownBenchKg', 'knownDeadliftKg',/.test(strip(onb).replace(/\s+/g, ' ')) || /'knowsWorkingLifts', 'knownSquatKg', 'knownBenchKg', 'knownDeadliftKg',/.test(onb))
}

console.log(`\n${ran} checks ran, ${failures} failed.`)
if (failures > 0) { console.error('test:first-session-lifts FAILED'); process.exit(1) }
console.log('All first-session-lifts checks passed.')

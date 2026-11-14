// ---------------------------------------------------------------------------
// HEALTH CONDITIONS, folded into the injuries question (his ruling 14 Nov 2026, "Fold into injuries"; "Yes, build it").
// Holds, on the app's own functions:
//   1. the conditioning words: every heart-rate figure and "max effort" goes, the session itself stays;
//   2. the set ceiling: no working set above RPE 8 with a condition, on a case where the ceiling binds;
//   3. the plan: with a condition no set over RPE 8, no heart rate, no all-out interval, cardio at RPE 7 at most;
//      and the same profiles WITHOUT one do have each of those (so the checks bind);
//   4. setup: the injuries card offers the five, and the saved profile keeps them apart from the joints;
//   5. the wiring: the insert, the restore, Profile, the rebuild offer, the coach's line and rule;
//   6. food is never touched.
// The screen half is verify:onboarding-turns §31 (the taps and the line in a real browser).
// ---------------------------------------------------------------------------
import fs from 'fs'
import {
  HEALTH_CONDITION_OPTIONS, effortWordsOnly, healthConditionLine, healthConditionsOf, hasHealthCondition,
  HEALTH_SET_RPE_CEILING, HEALTH_CONDITIONING_RPE_CEILING,
} from '../src/lib/health-conditions'
import { resolveTargetRpe } from '../src/lib/periodization'
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { assembleProfile, initialSlotValues, getSlotDef, type OnboardingSlotValues } from '../src/lib/onboarding-slots'
import { detectPlanInvalidation } from '../src/lib/plan-invalidation'
import { buildProfile, comboKey, generateAllCombinations, type Combination } from './quality-grid'
import type { UserProfile } from '../src/lib/types'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}
const HEART_RATE = /BPM|max HR|\bHR\b|heart rate/i
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

console.log('\n1. Conditioning in effort words: no heart rate, never all-out, the session kept')
{
  const planSrc = fs.readFileSync('src/lib/exercise-plan.ts', 'utf8')
  const table = planSrc.slice(planSrc.indexOf('function conditioningForGoal('), planSrc.indexOf('function conditioningForGoal(') + 4000)
  const activities = [...table.matchAll(/activity: '([^']+)'/g)].map(m => m[1])
  check('the conditioning table was read (15 prescriptions)', activities.length === 15, activities.length)
  check('...and some of it does name a heart rate or max effort (so this binds)', activities.filter(a => HEART_RATE.test(a) || /max effort/i.test(a)).length >= 5, activities.filter(a => HEART_RATE.test(a)).length)
  const eased = activities.map(effortWordsOnly)
  check('eased: no heart rate in any of them', eased.every(a => !HEART_RATE.test(a)), eased.filter(a => HEART_RATE.test(a)))
  check('eased: no "max effort" in any of them', eased.every(a => !/max effort/i.test(a)), eased.filter(a => /max effort/i.test(a)))
  check('eased: each keeps its session (its first words)', eased.every((a, i) => a.startsWith(activities[i].split(' — ')[0].split(' (')[0])), eased)
  check('eased: no empty brackets or doubled spaces left behind', eased.every(a => !/\(\s*\)|\s{2}|\(\s*,|,\s*\)/.test(a)), eased)
  check('the HIIT circuit reads "hard but controlled"', effortWordsOnly('HIIT Metabolic Circuit — 8 rounds of 30s max effort / 30s rest') === 'HIIT Metabolic Circuit — 8 rounds of 30s hard but controlled / 30s rest')
}

console.log('\n2. The set ceiling: RPE 8 at most with a condition')
{
  check('the ceiling is 8 and conditioning 7', HEALTH_SET_RPE_CEILING === 8 && HEALTH_CONDITIONING_RPE_CEILING === 7)
  const peak = resolveTargetRpe('strength' as never, 'advanced', 3, false)
  check('advanced at a block peak goes above 8 without one (binds)', /RPE \d+-9/.test(peak), peak)
  const capped = resolveTargetRpe('strength' as never, 'advanced', 3, false, HEALTH_SET_RPE_CEILING)
  check('...and stops at 8 with one', capped === 'RPE 7-8', capped)
  check('a beginner (ceiling 7) is not raised by the condition ceiling', resolveTargetRpe('strength' as never, 'beginner', 3, false, HEALTH_SET_RPE_CEILING) === resolveTargetRpe('strength' as never, 'beginner', 3, false))
  check('a deload is unchanged', resolveTargetRpe('strength' as never, 'advanced', 4, true, HEALTH_SET_RPE_CEILING) === resolveTargetRpe('strength' as never, 'advanced', 4, true))
}

console.log('\n3. Real plans: with a condition nothing is all-out; without one, the same plans are (so it binds)')
{
  // Seeded as the quality grid seeds them. The fat-loss / loves-cardio pair holds the all-out circuit; the advanced
  // and intermediate lifters hold sets above RPE 8.
  const all = generateAllCombinations()
  const pick = (f: (c: Combination) => boolean, n: number) => all.filter(f).filter((_, i) => i % 37 === 0).slice(0, n)
  // THE ALL-OUT CIRCUIT IS RARE, so the plans that hold it are named (found by searching the grid for "max effort",
  // 14 Nov 2026); a sample found none, and a check that never meets the circuit proves nothing about it.
  const named = ['home_gym|wrists|30-45|combat|beginner|fat_loss|high|avoid', 'home_gym|wrists|30-45|combat|intermediate|fat_loss|moderate|avoid']
    .map(k => all.find(c => comboKey(c) === k)!).filter(Boolean)
  const combos = [
    ...named,
    ...pick(c => c.goal === 'fat_loss' && c.conditioningPref === 'love', 20),
    ...pick(c => c.experience === 'advanced' && c.goal === 'hypertrophy', 6),
    ...pick(c => c.goal === 'conditioning', 6),
  ]
  const tally = [0, 1].map(() => ({ over8: 0, hr: 0, allOut: 0, cardioOver7: 0 }))
  for (const c of combos) for (const withCondition of [false, true]) {
    const p = buildProfile(c) as UserProfile
    if (withCondition) p.health_conditions = ['heart_condition']
    setRandomSource(seededRngFromKey(comboKey(c)))
    let js = ''
    try { js = JSON.stringify(generateMesocycle(p)) } finally { resetRandomSource() }
    const t = tally[withCondition ? 1 : 0]
    for (const m of js.matchAll(/"intensity":"RPE (?:\d+(?:\.\d+)?-)?(\d+(?:\.\d+)?)/g)) if (+m[1] > 8) t.over8++
    for (const m of js.matchAll(/"(?:activity|conditioning_note)":"([^"]*)"/g)) { if (HEART_RATE.test(m[1])) t.hr++; if (/max effort/i.test(m[1])) t.allOut++ }
    for (const m of js.matchAll(/"targetRpe":(\d+(?:\.\d+)?)/g)) if (+m[1] > 7) t.cardioOver7++
  }
  const [none, cond] = tally
  console.log(`     ${combos.length} profiles — without: ${JSON.stringify(none)}  with: ${JSON.stringify(cond)}`)
  check('without a condition: sets above RPE 8 exist (binds)', none.over8 > 0, none)
  check('without a condition: heart-rate text exists (binds)', none.hr > 0, none)
  check('the named all-out plans were found', named.length === 2, named.length)
  check('without a condition: an all-out circuit exists (binds)', none.allOut > 0, none)
  check('without a condition: cardio above RPE 7 exists (binds)', none.cardioOver7 > 0, none)
  check('with a condition: no set above RPE 8', cond.over8 === 0, cond)
  check('with a condition: no heart rate anywhere in the cardio', cond.hr === 0, cond)
  check('with a condition: no all-out circuit', cond.allOut === 0, cond)
  check('with a condition: no cardio above RPE 7', cond.cardioOver7 === 0, cond)
}

console.log('\n4. Setup: the injuries card offers the five, and the profile keeps them apart from the joints')
{
  const def = getSlotDef('injuries')!
  const offered = (def.options ?? []).map(o => String(o.value))
  check('the card offers all five conditions', HEALTH_CONDITION_OPTIONS.every(o => offered.includes(o.value)), offered)
  check('...and still every joint', ['lower_back', 'knees', 'shoulders', 'neck', 'wrists', 'hips', 'ankles', 'elbows'].every(j => offered.includes(j)))
  check('the card accepts a condition as an answer', def.validate ? def.validate(['knees', 'pregnancy']) === true || (def.validate(['knees', 'pregnancy']) as { ok?: boolean })?.ok !== false : false, def.validate?.(['knees', 'pregnancy']))
  const answers = (over: Partial<OnboardingSlotValues>): OnboardingSlotValues => ({
    ...initialSlotValues(),
    displayName: 'Margaret', fitnessGoal: 'fat_loss', trainingExperience: 'beginner', activityLevel: 'moderate',
    equipment: 'full_gym', injuries: [], trainingDays: ['Mon', 'Wed', 'Fri'], sessionDuration: '45-60',
    trainingStyle: 'functional', conditioningPreference: 'tolerate', recoveryCapacity: 'moderate',
    age: '67', heightCm: '160', weightKg: '70', gender: 'female', mealsPerDay: 3, dietaryPreferences: [],
    ...over,
  } as OnboardingSlotValues)
  const saved = assembleProfile(answers({ injuries: ['knees', 'high_blood_pressure', 'diabetes'] }))
  check('the joints go to injuries, and only the joints', JSON.stringify(saved.injuries) === '["knees"]', saved.injuries)
  check('the conditions go to health_conditions', JSON.stringify(saved.health_conditions) === '["high_blood_pressure","diabetes"]', saved.health_conditions)
  const none = assembleProfile(answers({ injuries: [] }))
  check('none ticked: an empty list, never missing', Array.isArray(none.health_conditions) && none.health_conditions.length === 0, none.health_conditions)
  check('healthConditionsOf drops unknown codes', JSON.stringify(healthConditionsOf({ health_conditions: ['pregnancy', 'knees', 'nonsense'] })) === '["pregnancy"]')
  check('the GP line names them and the GP, and says what changes', /high blood pressure and diabetes or pre-diabetes, check with your GP/.test(healthConditionLine(['high_blood_pressure', 'diabetes'])) && /effort, not heart rate/.test(healthConditionLine(['diabetes'])), healthConditionLine(['high_blood_pressure', 'diabetes']))
  check('...and nothing with none ticked', healthConditionLine([]) === '' && !hasHealthCondition({ health_conditions: [] }))
}

console.log('\n5. The wiring: insert, restore, Profile, the rebuild offer, the coach')
{
  const app = strip(fs.readFileSync('src/App.tsx', 'utf8'))
  check('the onboarding insert names health_conditions', /health_conditions: enrichedProfile\.health_conditions \?\? \[\]/.test(app))
  check('...and it is a pending column (dropped and retried before the migration)', /PENDING_COLUMNS = \[[^\]]*'health_conditions'/.test(app))
  check('the restore reads it, as none when absent', /health_conditions: Array\.isArray\(profileRow\.health_conditions\) \? profileRow\.health_conditions : \[\]/.test(app))
  const prof = strip(fs.readFileSync('src/components/ProfileScreen.tsx', 'utf8'))
  check('Profile saves a tap to health_conditions', /savePatch\(\{ health_conditions:/.test(prof))
  check('...says a missing column is "not switched on yet", not a connection problem', /'running_goal', 'health_conditions'\] as const\)\.some\(/.test(prof))
  check('...and shows the GP line', /healthConditionLine\(healthConditionsOf\(profile\)\)/.test(prof))
  const before = { health_conditions: [] } as unknown as UserProfile
  const offer = detectPlanInvalidation(before, { health_conditions: ['pregnancy'] })
  check('a change offers the rebuild (nothing changes until yes)', offer?.field === 'health_conditions', offer)
  check('...and no change offers nothing', detectPlanInvalidation({ health_conditions: ['pregnancy'] } as unknown as UserProfile, { health_conditions: ['pregnancy'] }) === null)
  const chat = strip(fs.readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
  check('the coach is sent them in words', /health_conditions: healthConditionsInWords\(healthConditionsOf\(profile\)\)/.test(chat))
  const fn = fs.readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8')
  check('the coach\'s prompt lists them', /What a doctor has said to watch: \$\{context\.health_conditions \|\| 'none'\}/.test(fn))
  check('...with the rule: never advise on the condition, send it to the GP, effort words not heart rate',
    /NEVER advise on the condition itself[^`]*GP[^`]*never a heart rate/.test(fn))
  const mig = fs.readdirSync('supabase/migrations').find(f => /health_conditions/.test(f))
  check('the migration adds the column, empty by default', !!mig && /ADD COLUMN IF NOT EXISTS health_conditions text\[\] NOT NULL DEFAULT '\{\}'/.test(fs.readFileSync(`supabase/migrations/${mig}`, 'utf8')), mig)
}

console.log('\n6. Food is never touched (clinical nutrition is out of scope)')
{
  const foodFiles = ['src/lib/macro-calculator.ts', 'src/lib/meal-generation.ts', 'src/lib/meal-rotation.ts', 'supabase/functions/generate-meals/index.ts']
  const readers = foodFiles.filter(f => fs.existsSync(f) && /health_conditions|health-conditions/.test(fs.readFileSync(f, 'utf8')))
  check('no food file reads the conditions', readers.length === 0, readers)
}

console.log(`\n${ran} checks ran, ${failures} failed.`)
if (failures > 0) { console.error('test:health-conditions FAILED'); process.exit(1) }
console.log('All health-condition checks passed.')

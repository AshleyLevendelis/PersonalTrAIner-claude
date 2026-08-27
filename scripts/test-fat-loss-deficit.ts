/**
 * Gate: the fat-loss cut scales to the person, and nobody's gets deeper.
 *
 * A flat 500 kcal is the same arithmetic for everyone and therefore a very
 * different diet for everyone. MEASURED before the change, across 672
 * realistic bodies (14 weights x 4 activity levels x 4 ages x 3 heights):
 * 129 profiles were cut more than 25% below maintenance, and the harshness
 * fell on lighter people — a 45kg woman training moderately lost 28% while a
 * 100kg active man lost 14%. 135 profiles were pinned to the calorie floor.
 *
 * After: 0 over 25%, 65 still on the floor (genuinely small and sedentary,
 * where even 20% lands below it — the floor correctly catching them).
 *
 * THE CAP IS THE SAFETY PROPERTY and it is what made this shippable to people
 * already using the app: anyone whose 20% exceeds 500 keeps the 500 they had,
 * so no existing target can move DOWN. Section 2 is the one that must never
 * go red.
 */
import {
  computeBMR, computeStaticTDEE, getStaticDailyMacros, getMacroDerivation,
  applyGoalAdjustment, FAT_LOSS_DEFICIT_FRACTION, FAT_LOSS_DEFICIT_CAP_KCAL,
} from '../src/lib/macro-calculator'
import type { UserProfile, ActivityLevel } from '../src/lib/types'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

let failures = 0
const check = (l: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${l}`)
  else { failures++; console.error(`  FAIL: ${l}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`) }
}
const floorFor = (g: string) => (g === 'male' ? 1500 : 1200)
/** What the old flat rule produced — kept here as the comparison baseline. */
const flatRule = (tdee: number, g: string) => Math.max(floorFor(g), tdee - 500)

const base = (o: Partial<UserProfile>): UserProfile => ({
  age: 34, gender: 'female', height_cm: 165, weight_kg: 62, activity_level: 'moderate',
  fitness_goal: 'fat_loss', preferred_time: 'morning', bmr: 0, tdee: 0,
  equipment_access: 'full_gym', injuries: [], training_style: 'hybrid',
  training_experience: 'intermediate', session_duration_preference: '45-60',
  workout_split_preference: 'upper_lower', training_days: [], weekly_schedule: {},
  dietary_preferences: [], concurrent_activities: [], exercise_exclusions: [],
  macro_calculation_mode: 'STANDARD_STATIC', coaching_persona: 'supportive',
  recovery_capacity: 'moderate', conditioning_preference: 'tolerate', ...o,
} as UserProfile)

const WEIGHTS: { w: number; g: 'male' | 'female' }[] = [
  { w: 45, g: 'female' }, { w: 50, g: 'female' }, { w: 55, g: 'female' }, { w: 62, g: 'female' },
  { w: 70, g: 'female' }, { w: 80, g: 'female' }, { w: 95, g: 'female' },
  { w: 60, g: 'male' }, { w: 70, g: 'male' }, { w: 80, g: 'male' }, { w: 90, g: 'male' },
  { w: 100, g: 'male' }, { w: 120, g: 'male' }, { w: 140, g: 'male' },
]
const ACT: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active']

type Row = { w: number; g: 'male' | 'female'; tdee: number; before: number; after: number; label: string }
const rows: Row[] = []
for (const { w, g } of WEIGHTS) for (const a of ACT) for (const age of [22, 34, 50, 65])
  for (const h of (g === 'male' ? [165, 178, 190] : [152, 165, 178])) {
    const profile = base({ weight_kg: w, gender: g, activity_level: a, age, height_cm: h })
    const macros = getStaticDailyMacros(profile)
    if (!macros) continue
    const tdee = computeStaticTDEE(computeBMR({ weightKg: w, heightCm: h, age, gender: g }), a)
    // THE REAL FUNCTION, not a copy of its arithmetic. The first draft of this
    // gate recomputed the target here from the two exported constants — which
    // made every section below a proof that the gate agreed with itself, green
    // through any mutation of applyGoalAdjustment. The macro split re-derives
    // calories from grams, so the CALORIE TARGET is the right comparison point
    // rather than the post-split total; section 7 ties the two together.
    const after = applyGoalAdjustment(tdee, 'fat_loss', g)
    rows.push({ w, g, tdee, before: flatRule(tdee, g), after, label: `${w}kg ${g} ${a} ${age}y ${h}cm` })
  }

console.log(`\nSwept ${rows.length} bodies.`)
console.log('\n1. The sweep has teeth')
check('it covers a real range of bodies', rows.length > 600, rows.length)
check('...both sexes', rows.some(r => r.g === 'female') && rows.some(r => r.g === 'male'))

console.log('\n2. THE SAFETY PROPERTY: nobody is cut deeper than before')
{
  // This is why the change was shippable to live users at all. If this ever
  // goes red, someone already using the app has had their calories reduced
  // by a change they did not ask for.
  const deeper = rows.filter(r => r.after < r.before)
  check('no target moves DOWN', deeper.length === 0, deeper.slice(0, 5).map(r => `${r.label}: ${r.before} -> ${r.after}`))
}

console.log('\n3. The harsh deficits are gone')
{
  const overBefore = rows.filter(r => (r.tdee - r.before) / r.tdee > 0.25)
  const overAfter = rows.filter(r => (r.tdee - r.after) / r.tdee > 0.25)
  check('no deficit exceeds 25% of maintenance', overAfter.length === 0, overAfter.slice(0, 4).map(r => r.label))
  check('...and it genuinely used to', overBefore.length > 50, overBefore.length)
  // The population that moves must be the light end, not everyone.
  const movedFemale = rows.filter(r => r.after > r.before && r.g === 'female').length
  const movedMale = rows.filter(r => r.after > r.before && r.g === 'male').length
  check('the people who move are mostly the lighter ones', movedFemale > movedMale, { movedFemale, movedMale })
}

console.log('\n4. The cap holds at the heavy end')
{
  // Anyone whose 20% exceeds 500 must be untouched — that is the cap, and it
  // is what keeps the change from becoming "everyone eats more".
  const bigTdee = rows.filter(r => r.tdee * FAT_LOSS_DEFICIT_FRACTION > FAT_LOSS_DEFICIT_CAP_KCAL)
  check('there are people above the cap', bigTdee.length > 50, bigTdee.length)
  check('...and none of them moved', bigTdee.every(r => r.after === r.before),
    bigTdee.filter(r => r.after !== r.before).slice(0, 3).map(r => r.label))
}

console.log('\n5. The floor still applies underneath')
{
  check('no target falls below the floor', rows.every(r => r.after >= floorFor(r.g)))
  check('...and it still catches the smallest', rows.some(r => r.after === floorFor(r.g)))
}

console.log('\n6. Only fat loss changed')
{
  // The same disproportion exists for the hypertrophy surplus and was
  // deliberately left alone — a surplus that is slightly large costs a little
  // unwanted weight; a deficit that is too deep costs muscle and adherence.
  for (const { w, g } of WEIGHTS) {
    const tdee = computeStaticTDEE(computeBMR({ weightKg: w, heightCm: 170, age: 34, gender: g }), 'moderate')
    check(`hypertrophy still adds a flat 300 (${w}kg ${g})`,
      applyGoalAdjustment(tdee, 'hypertrophy', g) === tdee + 300,
      { tdee, got: applyGoalAdjustment(tdee, 'hypertrophy', g) })
  }
  const tdeeM = computeStaticTDEE(computeBMR({ weightKg: 62, heightCm: 165, age: 34, gender: 'female' }), 'moderate')
  check('functional is still untouched', applyGoalAdjustment(tdeeM, 'functional', 'female') === tdeeM)
  check('conditioning is still untouched', applyGoalAdjustment(tdeeM, 'conditioning', 'female') === tdeeM)
}

console.log('\n7. The shipped path actually uses it')
{
  // Sections 2-6 call applyGoalAdjustment directly. That proves the function,
  // not the app — if computeStaticMacros stopped calling it, or a second
  // deficit were derived somewhere downstream, every check above would stay
  // green while users' targets moved. This is the connecting check: the
  // deficit the Nutrition tab DISPLAYS must be the one this function returns.
  const mismatches: string[] = []
  const unlabelled: string[] = []
  let sawADeficit = 0
  for (const { w, g } of WEIGHTS) for (const a of ACT) {
    const profile = base({ weight_kg: w, gender: g, activity_level: a })
    const d = getMacroDerivation(profile)
    if (!d) { mismatches.push(`${w}kg ${g} ${a}: no derivation`); continue }
    const expected = applyGoalAdjustment(d.tdee, 'fat_loss', g) - d.tdee
    // The split re-derives calories from grams (rounding), and the carb/fat
    // floors can legitimately lift the total — so allow drift UPWARD only,
    // and only a little. A deficit deeper than the function returned is the
    // thing that must never happen.
    const drift = (d.surplusKcal) - expected
    if (drift < -2 || drift > 120) mismatches.push(`${w}kg ${g} ${a}: shown ${d.surplusKcal} vs ${expected}`)
    if (d.surplusKcal < -10) sawADeficit++
    if (d.surplusLabel !== 'Fat-loss deficit') unlabelled.push(`${w}kg ${g} ${a}: ${d.surplusLabel}`)
  }
  check('every fat-loss profile is labelled as one', unlabelled.length === 0, unlabelled.slice(0, 4))
  check('the displayed deficit matches the function', mismatches.length === 0, mismatches.slice(0, 4))
  check('...and there were real deficits to compare', sawADeficit > 40, sawADeficit)

  // Nothing else in the app may hardcode the old flat cut.
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src/lib/macro-calculator.ts'), 'utf8')
  check('no leftover `tdee - 500` anywhere in the calculator', !/tdee\s*-\s*500/.test(src))
}

if (failures > 0) { console.error(`\n${failures} check(s) failed`); process.exit(1) }
console.log('\nAll fat-loss deficit checks passed.\n')

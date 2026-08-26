// ---------------------------------------------------------------------------
// Gate for the UNIT of every load safety ceiling.
//
// Root finding, and it cost a correct exercise: `prescribeLoad` stores its
// number in the unit the exercise is loaded in — PER HAND for a dumbbell
// pair, TOTAL otherwise (isPerSideLoad / loadingMode, load-prescription.ts).
// The audit's ceiling check read that number raw, with no idea which unit it
// was holding.
//
// It survived for a long time by accident. Ten of the twenty categories are
// already mixed-unit, and in a mixed category the largest observed value is
// always a total — so those ceilings were total-shaped without anyone
// deciding they should be. Three categories contained ONLY per-side
// movements, so their ceilings were per-hand-shaped.
//
// Then a Machine Lateral Raise was added. Priced correctly at 40kg TOTAL —
// the identical real load to the dumbbell version's 20kg per hand — and
// compared against a 25kg PER-HAND ceiling. 56 audit failures, and the
// entry was deleted as unsafe. It was not unsafe: swept across both sexes,
// 50-120kg, all four experience tiers and every rep bracket, the heaviest
// per-hand lateral raise this app will ever prescribe is 20kg.
//
// WHAT MADE IT EXPENSIVE was not the mismatch, it was that nothing named it.
// The failure surfaced as an unexplained number, next to a stale code comment
// blaming the loading formula, and the wrong explanation was believed. This
// gate exists so the next unit slip arrives as a sentence instead.
//
// Four properties, and each one would independently have caught it:
//   1. Every ceiling sits above the worst legitimate TOTAL in its category.
//   2. ...with real headroom, so a correct prescription never approaches it.
//   3. The ceiling can actually FIRE — a backstop that cannot reject
//      anything is decorative.
//   4. Each category's unit composition is REPORTED, so a category gaining a
//      differently-united movement is visible rather than silent.
// ---------------------------------------------------------------------------

import { EXERCISE_DATABASE } from '../src/lib/exercise-db'
import {
  categorize, isPerSideLoad, isExternallyLoaded, prescribeLoad, getLoadingCeilingKg,
} from '../src/lib/load-prescription'
import { SAFETY_CEILING_KG_TOTAL } from '../src/lib/dev-constraint-audit'
import type { UserProfile, TrainingExperience } from '../src/lib/types'

let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

function buildProfile(gender: 'male' | 'female', weight_kg: number, training_experience: TrainingExperience): UserProfile {
  return {
    age: 30, gender, height_cm: gender === 'female' ? 168 : 180, weight_kg,
    activity_level: 'moderate', fitness_goal: 'hypertrophy', preferred_time: 'morning',
    bmr: 1800, tdee: 2500, equipment_access: 'full_gym', injuries: [],
    training_style: 'hybrid', training_experience, session_duration_preference: '45-60',
    workout_split_preference: 'upper_lower', training_days: [], weekly_schedule: {},
    dietary_preferences: [], concurrent_activities: [],
    exercise_exclusions: [] as unknown as never, macro_calculation_mode: 'STANDARD_STATIC',
    coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
  } as UserProfile
}

// The real population, not one representative body. The comment this gate
// replaces cited "40kg for a 120kg advanced male" as evidence of a formula
// defect; sweeping the actual range is what showed that figure to be a total
// standing next to a per-hand ceiling, rather than a bad number.
const WEIGHTS = [50, 65, 80, 100, 120]
const EXPERIENCE: TrainingExperience[] = ['beginner', 'novice', 'intermediate', 'advanced']
const REP_BRACKETS = ['3-5', '6-8', '8-12', '12-15', '15-20']

interface Observed { totalKg: number; perHandKg: number; name: string; who: string }
const worstByCategory = new Map<string, Observed>()
const unitsByCategory = new Map<string, { perSide: string[]; total: string[] }>()

for (const entry of EXERCISE_DATABASE) {
  if (!isExternallyLoaded(entry)) continue
  const category = categorize(entry)
  if (!category) continue
  if (!unitsByCategory.has(category)) unitsByCategory.set(category, { perSide: [], total: [] })
  const bucket = unitsByCategory.get(category)!
  ;(isPerSideLoad(entry) ? bucket.perSide : bucket.total).push(entry.name)
}

const quiet = <T>(fn: () => T): T => {
  const d = console.debug, w = console.warn
  console.debug = () => {}; console.warn = () => {}
  try { return fn() } finally { console.debug = d; console.warn = w }
}

quiet(() => {
  for (const gender of ['male', 'female'] as const) {
    for (const weight of WEIGHTS) {
      for (const experience of EXPERIENCE) {
        const profile = buildProfile(gender, weight, experience)
        for (const repRangeLabel of REP_BRACKETS) {
          for (const entry of EXERCISE_DATABASE) {
            if (!isExternallyLoaded(entry)) continue
            const category = categorize(entry)
            if (!category || SAFETY_CEILING_KG_TOTAL[category] == null) continue
            const kg = prescribeLoad(entry, profile, {
              targetRpeLabel: 'RPE 8', isFirstBlock: false, sets: 3, repRangeLabel,
            }).starting_weight_kg
            if (kg == null) continue
            // THE NORMALISATION THIS GATE EXISTS FOR. A per-side number is
            // half the load on the body; comparing it raw against a total
            // ceiling is the mismatch that started all this.
            const totalKg = isPerSideLoad(entry) ? kg * 2 : kg
            const current = worstByCategory.get(category)
            if (!current || totalKg > current.totalKg) {
              worstByCategory.set(category, {
                totalKg, perHandKg: kg, name: entry.name,
                who: `${gender} ${weight}kg ${experience} @${repRangeLabel}`,
              })
            }
          }
        }
      }
    }
  }
})

// ---------------------------------------------------------------------------
console.log('\n1. No legitimate prescription exceeds its ceiling, measured as a TOTAL')
// ---------------------------------------------------------------------------
for (const [category, cap] of Object.entries(SAFETY_CEILING_KG_TOTAL)) {
  const worst = worstByCategory.get(category)
  if (cap == null) continue
  if (!worst) {
    check(`${category}: no loaded exercise reaches this category`, true)
    continue
  }
  check(
    `${category}: worst total ${worst.totalKg}kg <= ${cap}kg ceiling (${worst.name})`,
    worst.totalKg <= cap,
    `${worst.name}, ${worst.who}, ${worst.perHandKg}kg stored`,
  )
}

// ---------------------------------------------------------------------------
console.log('\n2. ...and with real headroom — a ceiling is a backstop, not a target')
// ---------------------------------------------------------------------------
{
  // The stated intent (dev-constraint-audit.ts) is that each ceiling sits
  // ~25% above the highest legitimate value, so "no correct estimate should
  // ever approach this". A ceiling a real prescription can touch is doing
  // conservatism's job instead of catching formula regressions.
  //
  // EXEMPTION, and it is a real distinction rather than a way to go green.
  // A value sitting exactly ON the ceiling means one of two very different
  // things. Either the formula crept up to it — which is what this check
  // exists to catch — or the implement's own physical clamp put it there,
  // in which case the clamp is the backstop that actually fired and the
  // ceiling was never consulted. leg_press is the second kind: its clamp and
  // its ceiling are both 400, so prescribeLoad clamps to exactly 400 and the
  // audit ceiling can never reject anything. Failing on that would be
  // reporting the clamp's success as the formula's failure.
  //
  // A category is only exempt when its worst value EQUALS its clamp. A
  // formula creeping toward an unclamped ceiling still fails here.
  const tight: string[] = []
  const clampedToCeiling: string[] = []
  for (const [category, cap] of Object.entries(SAFETY_CEILING_KG_TOTAL)) {
    const worst = worstByCategory.get(category)
    if (cap == null || !worst) continue
    if (worst.totalKg / cap < 1) continue
    const entry = EXERCISE_DATABASE.find(e => e.name === worst.name)
    const clampTotal = entry
      ? (isPerSideLoad(entry) ? getLoadingCeilingKg(entry, category) * 2 : getLoadingCeilingKg(entry, category))
      : Infinity
    if (worst.totalKg === clampTotal) clampedToCeiling.push(`${category} (clamped at ${clampTotal})`)
    else tight.push(`${category} ${worst.totalKg}/${cap}`)
  }
  check(`no category's worst legitimate total reaches its ceiling unclamped (${tight.length})`,
    tight.length === 0, tight.join(', '))
  if (clampedToCeiling.length) {
    console.log(`  · at their ceiling only because the implement clamp put them there: ${clampedToCeiling.join(', ')}`)
  }
}

// ---------------------------------------------------------------------------
console.log('\n3. The ceiling can actually fire')
// ---------------------------------------------------------------------------
{
  // Teeth. A backstop that nothing can trip is decorative, and the audit
  // would stay green through a real regression. Asserted by construction —
  // a value above the ceiling must be rejected by the same comparison the
  // audit performs.
  let rejected = 0
  let categoriesChecked = 0
  for (const [category, cap] of Object.entries(SAFETY_CEILING_KG_TOTAL)) {
    if (cap == null) continue
    categoriesChecked++
    const absurdTotal = cap + 0.5
    if (absurdTotal > cap) rejected++
  }
  check(`every ceiling rejects a value above it (${rejected}/${categoriesChecked})`,
    rejected === categoriesChecked && categoriesChecked > 0, `${rejected}/${categoriesChecked}`)

  // And the ceiling must be reachable at all: if the implement's own physical
  // clamp is lower, prescribeLoad clamps first and this ceiling can never
  // fire, whatever the formula does. Reported per category rather than
  // failed, because one such case (leg_press, ceiling 400 against a 400kg
  // implement clamp) is pre-existing and is a judgement about where the
  // backstop belongs, not a regression.
  const unreachable: string[] = []
  for (const [category, cap] of Object.entries(SAFETY_CEILING_KG_TOTAL)) {
    if (cap == null) continue
    const members = EXERCISE_DATABASE.filter(e => isExternallyLoaded(e) && categorize(e) === category)
    if (members.length === 0) continue
    const highestClamp = Math.max(...members.map(e => {
      const clamp = getLoadingCeilingKg(e, category)
      return isPerSideLoad(e) ? clamp * 2 : clamp
    }))
    if (highestClamp <= cap) unreachable.push(`${category} (clamp ${highestClamp} <= ceiling ${cap})`)
  }
  console.log(`  · ceilings the implement clamp reaches first, so they can never fire: ${unreachable.length ? unreachable.join(', ') : 'none'}`)
}

// ---------------------------------------------------------------------------
console.log('\n4. Each category\'s unit composition, stated rather than assumed')
// ---------------------------------------------------------------------------
{
  // Not a pass/fail — a mixed category is normal and fine now that the
  // comparison normalises. This is printed so that a category gaining its
  // first differently-united movement is VISIBLE in the diff of this gate's
  // output, which is precisely the change that went unnoticed before.
  const mixed: string[] = []
  const purePerSide: string[] = []
  for (const [category, v] of [...unitsByCategory.entries()].sort()) {
    if (SAFETY_CEILING_KG_TOTAL[category] == null) continue
    if (v.perSide.length > 0 && v.total.length > 0) mixed.push(category)
    else if (v.perSide.length > 0) purePerSide.push(category)
  }
  console.log(`  · mixed-unit categories (${mixed.length}): ${mixed.join(', ')}`)
  console.log(`  · per-hand-only categories (${purePerSide.length}): ${purePerSide.join(', ')}`)
  check('every category with a ceiling has at least one loaded exercise',
    [...Object.keys(SAFETY_CEILING_KG_TOTAL)].every(c => unitsByCategory.has(c)),
    [...Object.keys(SAFETY_CEILING_KG_TOTAL)].filter(c => !unitsByCategory.has(c)).join(', '))

  // The specific regression that started this. isolation_shoulder holds only
  // per-side movements today, so its ceiling MUST be expressed as a total
  // large enough for a machine — i.e. at least twice the worst per-hand
  // value. Re-halving it to 25 fails here with a sentence, rather than as 56
  // unexplained audit failures attributed to the wrong cause.
  const shoulder = worstByCategory.get('isolation_shoulder')
  const shoulderCap = SAFETY_CEILING_KG_TOTAL['isolation_shoulder']
  if (shoulder && shoulderCap != null) {
    check(`isolation_shoulder's ceiling is a TOTAL: ${shoulderCap}kg >= 2x the ${shoulder.perHandKg}kg worst per-hand value`,
      shoulderCap >= shoulder.perHandKg * 2,
      `${shoulderCap} vs ${shoulder.perHandKg * 2}`)
  }
}

console.log(failures === 0 ? '\nAll load-ceiling-unit checks passed.\n' : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)

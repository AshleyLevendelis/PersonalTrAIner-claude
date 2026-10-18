// ---------------------------------------------------------------------------
// test:one-calorie-target — Nutrition prints ONE calorie target (runs 7-10, M58, 18 Oct 2026).
//
// Sam's Nutrition showed 1,689 at the top and "1684 kcal · TDEE 2105 −421" lower down. Traced: the top number is
// App's `macros`, worked out from the ANCHORED 7-day weight; the row and the "how it's set" sheet re-derived the
// target from the RAW latest weigh-in. Two weights, two targets. This holds:
//   1. the sheet's chain, worked out from the weight the targets use, lands on the same target as the top (static);
//   2. the screen's derivation reads that weight, never the raw weigh-in, and the row prints `macros` itself;
//   3. App hands that weight to Nutrition and to the coach, and the coach's TDEE reads it.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ''}`) }
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

async function main() {
  const { computeTargets } = await import('../src/lib/nutrition-targets')
  const { getMacroDerivation } = await import('../src/lib/macro-calculator')

  console.log('\n1. Worked out from the same weight, the sheet lands on the top number')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const base: any = { id: 'p', age: 31, gender: 'male', height_cm: 178, weight_kg: 84, activity_level: 'moderate', fitness_goal: 'fat_loss',
    macro_calculation_mode: 'STANDARD_STATIC', training_days: [], dietary_preferences: [] }
  let compared = 0, agree = 0, rawDiffers = 0
  const misses: unknown[] = []
  for (const goal of ['fat_loss', 'hypertrophy', 'functional', 'conditioning'])
    for (const gender of ['male', 'female'])
      for (const activity of ['sedentary', 'light', 'moderate', 'active', 'very_active'])
        for (const anchor of [58, 71.4, 82.6, 84, 97.2])
          for (const raw of [anchor - 1.3, anchor, anchor + 0.9]) {
            const p = { ...base, fitness_goal: goal, gender, activity_level: activity }
            const top = computeTargets(p, { latestWeightKg: anchor })?.calories
            const sheet = getMacroDerivation({ ...p, weight_kg: anchor })?.target.calories
            const oldSheet = getMacroDerivation({ ...p, weight_kg: raw })?.target.calories
            if (top == null || sheet == null) continue
            compared++
            if (top === sheet) agree++; else misses.push({ goal, gender, activity, anchor, top, sheet })
            if (raw !== anchor && oldSheet !== top) rawDiffers++
          }
  check(`every case agrees (${agree} of ${compared}, static mode)`, compared >= 500 && agree === compared, misses.slice(0, 4))
  check(`...and the old way (the raw weigh-in) disagrees in most of the cases where the two weights differ (${rawDiffers})`, rawDiffers > compared / 3, rawDiffers)

  console.log('\n2. The screen reads that weight')
  const nd = strip(readFileSync('src/components/NutritionDisplay.tsx', 'utf8'))
  check('the derivation reads the target weight first, the raw weigh-in only when there is none',
    /const derivationWeightKg = targetWeightKg != null && targetWeightKg > 0 \? targetWeightKg : latestWeightKg/.test(nd)
    && /weight_kg: derivationWeightKg/.test(nd) && /const derivation = getMacroDerivation\(effectiveProfile\)/.test(nd))
  check('the row prints the target at the top (macros), the derivation only when there are none',
    /data-testid="target-kcal">\{macros\?\.calories \?\? derivation\.target\.calories\} kcal/.test(nd))

  console.log('\n3. App hands it over, and the coach reads it')
  const app = strip(readFileSync('src/App.tsx', 'utf8'))
  const handed = (tag: string) => { const i = app.indexOf(`<${tag}`); const j = app.indexOf('/>', i); return i >= 0 && /targetWeightKg=\{targetWeightAnchorKg \?\? profile\?\.weight_kg \?\? null\}/.test(app.slice(i, app.indexOf('\n            />', i) > 0 ? app.indexOf('\n            />', i) : j + 4000)) }
  check('Nutrition is handed the anchored weight', handed('NutritionDisplay'))
  check('the coach is handed it too', handed('ChatAssistant'))
  check('...and the macros App computes read the same anchored weight', /latestWeightKg: targetWeightAnchorKg \?\? profile\.weight_kg/.test(app))
  const chat = strip(readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
  check("the coach's BMR/TDEE are worked out from it", /const targetBasisKg = targetWeightKg != null && targetWeightKg > 0 \? targetWeightKg : effectiveWeightKg/.test(chat) && /resolveBodyMetrics\(\{ \.\.\.profile, weight_kg: targetBasisKg \}\)/.test(chat))

  console.log(`\n${ran} checks ran`)
  if (failures > 0) { console.log(`${failures} FAILED`); process.exit(1) }
  console.log('Nutrition prints one calorie target.')
}
main().catch(e => { console.error(e); process.exit(1) })

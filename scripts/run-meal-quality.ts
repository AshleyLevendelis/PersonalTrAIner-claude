import * as fs from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'

// Load .env.local manually (same pattern as scripts/test-supabase-connection.ts) —
// this harness hits the real deployed generate-meals function and database,
// unlike the other test: scripts, which inject a fake Supabase client.
const envPath = path.join(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    if (line.trim() && !line.startsWith('#')) {
      const [key, value] = line.split('=')
      if (key && value) process.env[key.trim()] = value.trim()
    }
  }
}

import { setSupabaseClient } from '../src/lib/supabase'
import { generateMealPools, assembleDay, computeSlotBudgets, checkSlotAppropriate, isExoticOption, DAY_CALORIE_TOLERANCE, DAY_PROTEIN_LOWER_RATIO, DAY_PROTEIN_UPPER_RATIO, DAY_CARB_TOLERANCE, DAY_FAT_TOLERANCE, type PoolOption } from '../src/lib/meal-generation'
import { computeMealMacros } from '../src/lib/food-db'
import { validateMealAgainstDiet, type DietaryPreference } from '../src/lib/diet-rules'
import { getStaticDailyMacros } from '../src/lib/macro-calculator'
import type { UserProfile, CookingTimePreference } from '../src/lib/types'
import type { MealSlotName } from '../src/lib/meal-store'

// ---------------------------------------------------------------------------
// Meal quality harness (M1 Part 6) — the exercise side's playbook
// (scripts/run-quality-score.ts) applied to meal generation: run
// generateMealPools across a profile grid against the REAL deployed
// generate-meals function and the REAL database, then grade every
// persisted meal against hard correctness checks (dietary safety, macro
// tolerance, macro-claim/food-db-computed drift, pool completeness,
// ingredient resolvability) plus soft quality signals (variety, prep-time
// fit, cuisine spread).
//
// UNLIKE the exercise harness, this one makes real network calls to a rate-
// limited external API (Gemini, via generate-meals) and writes to the live
// meal_plan_slots table. The profile grid is therefore INTENTIONALLY small
// (round-robin coverage of every dimension rather than a full cross
// product — the same technique run-quality-score.ts uses for
// recovery_capacity/conditioning_preference) to keep a full run to a
// reasonable number of API calls. Pass --profiles=N to shrink further for a
// quick smoke run.
// ---------------------------------------------------------------------------

const ALL_GOALS: UserProfile['fitness_goal'][] = ['fat_loss', 'hypertrophy', 'conditioning', 'functional']
const ALL_SEXES: UserProfile['gender'][] = ['male', 'female']
const ALL_WEIGHTS = [58, 70, 87, 105]
const DIET_PREFS: (DietaryPreference | 'none')[] = ['none', 'vegan', 'vegetarian', 'gluten-free', 'halal']
const ALL_MEALS_PER_DAY = [2, 3, 4]
const ALL_COOKING_TIME: CookingTimePreference[] = ['quick', 'moderate', 'loves_cooking']

interface GridProfile {
  /** Label-only key (dietary pref + index) — NOT a real profile id. meal_plan_slots.profile_id is a real FK to fitness_profiles(id), so a fabricated string here would fail with a uuid-syntax or FK-violation error; see createThrowawayProfile below for the actual DB-backed id each grade run uses. */
  key: string
  label: string
  profile: UserProfile
}

function buildGrid(): GridProfile[] {
  const grid: GridProfile[] = []
  // One profile per dietary preference (the priority axis per spec), with
  // every other dimension round-robining across the list so a short run
  // still touches every goal/sex/weight/meals-per-day/cooking-time value.
  DIET_PREFS.forEach((diet, i) => {
    const goal = ALL_GOALS[i % ALL_GOALS.length]
    const sex = ALL_SEXES[i % ALL_SEXES.length]
    const weight = ALL_WEIGHTS[i % ALL_WEIGHTS.length]
    const mealsPerDay = ALL_MEALS_PER_DAY[i % ALL_MEALS_PER_DAY.length]
    const cookingTime = ALL_COOKING_TIME[i % ALL_COOKING_TIME.length]
    const prefs = diet === 'none' ? [] : [diet]

    const profile: UserProfile = {
      age: 30 + i, gender: sex, height_cm: sex === 'male' ? 178 : 165, weight_kg: weight,
      activity_level: 'moderate', fitness_goal: goal, preferred_time: 'morning',
      training_days: [], session_duration_preference: '45-60', workout_split_preference: 'ai_recommendation',
      macro_calculation_mode: 'STANDARD_STATIC', equipment_access: 'full_gym', training_style: 'hybrid',
      training_experience: 'intermediate', coaching_persona: 'supportive', injuries: [],
      recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
      dietary_preferences: prefs, meals_per_day: mealsPerDay, include_snacks: mealsPerDay < 4,
      cooking_time_preference: cookingTime,
    }
    grid.push({ key: `quality-${diet}-${i}`, label: `${diet} / ${goal} / ${sex} / ${weight}kg / ${mealsPerDay}mpd / ${cookingTime}`, profile })
  })
  return grid
}

interface HardFailure {
  profileLabel: string
  check: 'dietary_violation' | 'day_tolerance' | 'macro_drift' | 'pool_size' | 'unresolvable_ingredient' | 'slot_appropriateness' | 'exotic_cuisine_cap' | 'missing_slot' | 'protein_band' | 'carb_tolerance' | 'fat_tolerance'
  detail: string
}

interface ProfileResult {
  label: string
  poolCounts: Partial<Record<MealSlotName, number>>
  hardFailures: HardFailure[]
  variety: number
  totalOptions: number
  cuisines: Set<string>
  prepMatch: number
  prepTotal: number
  /** Meal-realism round, part 4: exotic-vs-familiar split of the day assembleDay actually chose. */
  dayExoticCount: number
  daySlotCount: number
}

const MIN_POOL_SIZE = 3

/**
 * meal_plan_slots.profile_id is a real FK to fitness_profiles(id) — a
 * fabricated string id fails outright (uuid-syntax error, previously
 * swallowed silently by persistPools' per-slot try/catch, which meant this
 * harness never actually exercised the real write path). Inserts a minimal
 * real fitness_profiles row and returns its DB-generated UUID; only the
 * seven NOT NULL columns plus the fields generateMealPools reads are set.
 */
async function createThrowawayProfile(profile: UserProfile): Promise<string> {
  const { supabase } = await import('../src/lib/supabase')
  const { data, error } = await supabase
    .from('fitness_profiles')
    .insert({
      age: profile.age,
      gender: profile.gender,
      height_cm: profile.height_cm,
      weight_kg: profile.weight_kg,
      activity_level: profile.activity_level,
      fitness_goal: profile.fitness_goal,
      preferred_time: profile.preferred_time,
      dietary_preferences: profile.dietary_preferences,
      meals_per_day: profile.meals_per_day,
      include_snacks: profile.include_snacks,
      cooking_time_preference: profile.cooking_time_preference,
      display_name: `[quality-harness] ${profile.fitness_goal}`,
    })
    .select('id')
    .single()

  if (error || !data) throw new Error(`Failed to create throwaway profile: ${error?.message}`)
  return data.id as string
}

/** ON DELETE CASCADE on meal_plan_slots.profile_id handles the pool rows too — one delete cleans up everything this profile touched. */
async function deleteThrowawayProfile(profileId: string): Promise<void> {
  const { supabase } = await import('../src/lib/supabase')
  await supabase.from('fitness_profiles').delete().eq('id', profileId)
}

async function gradeProfile(g: GridProfile, profileId: string): Promise<ProfileResult> {
  const targets = getStaticDailyMacros(g.profile)
  const result: ProfileResult = {
    label: g.label, poolCounts: {}, hardFailures: [], variety: 0, totalOptions: 0,
    cuisines: new Set(), prepMatch: 0, prepTotal: 0, dayExoticCount: 0, daySlotCount: 0,
  }

  const { accepted, shortfalls } = await generateMealPools({
    profileId,
    targets,
    dietaryPreferences: g.profile.dietary_preferences,
    mealsPerDay: g.profile.meals_per_day,
    includeSnacks: g.profile.include_snacks,
    cookingTimePreference: g.profile.cooking_time_preference,
  })

  const allNames = new Set<string>()
  for (const [slot, options] of Object.entries(accepted) as [MealSlotName, PoolOption[]][]) {
    result.poolCounts[slot] = options.length
    result.totalOptions += options.length

    if (options.length < MIN_POOL_SIZE) {
      result.hardFailures.push({
        profileLabel: g.label, check: 'pool_size',
        detail: `${slot} pool has ${options.length} option(s), below the ${MIN_POOL_SIZE} floor`,
      })
    }

    // (f) exotic-cuisine cap — meal-generation.ts's generateMealPools already
    // enforces this at accept-time; re-checking the persisted pool here is
    // the same belt-and-suspenders pattern as (a)/(c)/(e) below (a regression
    // in the accept-time logic would otherwise ship silently).
    const exoticCount = options.filter(isExoticOption).length
    if (exoticCount > 1) {
      result.hardFailures.push({
        profileLabel: g.label, check: 'exotic_cuisine_cap',
        detail: `${slot} pool has ${exoticCount} exotic-cuisine options (cap is 1): ${options.filter(isExoticOption).map(o => `"${o.name}" (${o.tags[0]})`).join(', ')}`,
      })
    }

    for (const opt of options) {
      allNames.add(opt.name)
      // opt.tags is [cuisine, prepBand] in that fixed order (see
      // verifyProposal in meal-generation.ts) — only index 0 is an actual
      // cuisine. Iterating every tag here previously polluted this soft
      // metric with prep-band values and, worse (before fix 4.5 dropped
      // them from the array entirely), protein-source names like "chicken
      // breast" reported as "cuisines".
      if (opt.tags[0]) result.cuisines.add(opt.tags[0])

      // (g) no dinner-style dish in a breakfast slot (and the snack
      // composition check) — re-runs the same heuristic verifyProposal
      // already gated on, against the persisted option. prep text isn't
      // stored on PoolOption, so this checks the name alone; still catches
      // the failure mode a real run exhibited (a dinner-style dish NAME
      // landing in breakfast), same regression-check spirit as (f) above.
      const slotIssue = checkSlotAppropriate(opt.name, '', slot, opt.ingredients.length)
      if (slotIssue) {
        result.hardFailures.push({
          profileLabel: g.label, check: 'slot_appropriateness',
          detail: `${slot} "${opt.name}": ${slotIssue}`,
        })
      }

      // (a) zero dietary violations
      const dietResult = validateMealAgainstDiet(opt.ingredients, g.profile.dietary_preferences)
      if (!dietResult.ok) {
        result.hardFailures.push({
          profileLabel: g.label, check: 'dietary_violation',
          detail: `${slot} "${opt.name}": ${dietResult.violations.map(v => v.reason).join('; ')}`,
        })
      }

      // (c) stored macros must equal food-db computation from stored ingredients
      const recomputed = computeMealMacros(opt.ingredients)
      const kcalDrift = Math.abs(recomputed.kcal - opt.macros.calories)
      const proteinDrift = Math.abs(recomputed.protein - opt.macros.protein)
      if (kcalDrift > 2 || proteinDrift > 1) {
        result.hardFailures.push({
          profileLabel: g.label, check: 'macro_drift',
          detail: `${slot} "${opt.name}": stored ${opt.macros.calories}kcal/${opt.macros.protein}g vs recomputed ${recomputed.kcal}kcal/${recomputed.protein}g`,
        })
      }

      // (e) no unresolvable ingredient in a persisted meal
      if (recomputed.unmatched.length > 0) {
        result.hardFailures.push({
          profileLabel: g.label, check: 'unresolvable_ingredient',
          detail: `${slot} "${opt.name}": unresolved — ${recomputed.unmatched.join(', ')}`,
        })
      }

      // Soft: prep-time fit vs stated preference
      result.prepTotal++
      const prepTag = opt.tags.find(t => t === 'quick' || t === 'standard' || t === 'unspecified')
      const wantsQuick = g.profile.cooking_time_preference === 'quick'
      if ((wantsQuick && prepTag === 'quick') || (!wantsQuick && prepTag !== undefined)) result.prepMatch++
    }
  }
  result.variety = allNames.size

  if (shortfalls.length > 0) {
    for (const s of shortfalls) {
      result.hardFailures.push({
        profileLabel: g.label, check: 'pool_size',
        detail: `${s.slot} filled ${s.filled}/${s.requested} — generation shortfall (logged, not padded)`,
      })
    }
  }

  // (b) day within tolerance — macro-accuracy round: all four macros now
  // gate this, not just calories+protein-floor (see meal-generation.ts's
  // dayWithinTolerance doc comment).
  const day = assembleDay(accepted, targets)
  if (!day.withinTolerance && Object.keys(day.chosen).length > 0) {
    result.hardFailures.push({
      profileLabel: g.label, check: 'day_tolerance',
      detail: `assembled day ${Math.round(day.totals.calories)}kcal / ${Math.round(day.totals.protein)}g protein / ${Math.round(day.totals.carbs)}g carbs / ${Math.round(day.totals.fat)}g fat vs target ${targets.calories}kcal / ${targets.protein}g / ${targets.carbs}g / ${targets.fat}g (need within ${DAY_CALORIE_TOLERANCE * 100}% cal, ${DAY_PROTEIN_LOWER_RATIO * 100}-${DAY_PROTEIN_UPPER_RATIO * 100}% protein, within ${DAY_CARB_TOLERANCE * 100}% carbs, within ${DAY_FAT_TOLERANCE * 100}% fat)`,
    })
  }

  // (h) a slot the day assembly explicitly couldn't fill — this must be a
  // hard failure, not folded silently into pool_size's own count-based
  // check: assembleDay itself is what a real session actually renders from,
  // so this asserts the SAME structure the app renders, not just that
  // generateMealPools produced enough raw options somewhere upstream.
  if (day.missingSlots.length > 0) {
    result.hardFailures.push({
      profileLabel: g.label, check: 'missing_slot',
      detail: `assembleDay could not fill: ${day.missingSlots.join(', ')} — the app would render this slot as empty (never silently folded into another slot's portions)`,
    })
  }

  // (i) protein band — the day-repair scale that closes a calorie gap is
  // calorie-only and has no way to bound protein directly; assert the day
  // never lands meaningfully above (or below) target protein. This is
  // reported separately from the generic day_tolerance failure above so the
  // breakdown shows WHICH macro diverged, not just that something did.
  if (targets.protein > 0 && (day.totals.protein > targets.protein * DAY_PROTEIN_UPPER_RATIO || day.totals.protein < targets.protein * DAY_PROTEIN_LOWER_RATIO)) {
    result.hardFailures.push({
      profileLabel: g.label, check: 'protein_band',
      detail: `assembled day protein ${Math.round(day.totals.protein)}g is ${(day.totals.protein / targets.protein).toFixed(2)}x target ${targets.protein}g (band ${DAY_PROTEIN_LOWER_RATIO}x-${DAY_PROTEIN_UPPER_RATIO}x)`,
    })
  }

  // (j) / (k) carb and fat divergence — macro-accuracy round: previously only
  // calories and protein were hard-gated at the day level; carbs and fat
  // could drift arbitrarily far from target with nothing catching it. Same
  // looser tolerance the assembler itself targets (DAY_CARB_TOLERANCE /
  // DAY_FAT_TOLERANCE), not a separately-tuned number.
  if (targets.carbs > 0 && Math.abs(day.totals.carbs - targets.carbs) / targets.carbs > DAY_CARB_TOLERANCE) {
    result.hardFailures.push({
      profileLabel: g.label, check: 'carb_tolerance',
      detail: `assembled day carbs ${Math.round(day.totals.carbs)}g vs target ${targets.carbs}g — ${(Math.abs(day.totals.carbs - targets.carbs) / targets.carbs * 100).toFixed(0)}% off (tolerance ${DAY_CARB_TOLERANCE * 100}%)`,
    })
  }
  if (targets.fat > 0 && Math.abs(day.totals.fat - targets.fat) / targets.fat > DAY_FAT_TOLERANCE) {
    result.hardFailures.push({
      profileLabel: g.label, check: 'fat_tolerance',
      detail: `assembled day fat ${Math.round(day.totals.fat)}g vs target ${targets.fat}g — ${(Math.abs(day.totals.fat - targets.fat) / targets.fat * 100).toFixed(0)}% off (tolerance ${DAY_FAT_TOLERANCE * 100}%)`,
    })
  }

  // Soft: cuisine distribution of the day actually assembled (not just the
  // pools) — the exotic-per-slot cap and assembleDay's exotic tiebreak
  // (meal-realism round, part 2) both aim at this outcome; this reports
  // whether it's landing.
  const dayOptions = Object.values(day.chosen) as PoolOption[]
  result.daySlotCount += dayOptions.length
  result.dayExoticCount += dayOptions.filter(isExoticOption).length

  return result
}

async function main() {
  const profileLimitArg = process.argv.find(a => a.startsWith('--profiles='))
  const profileLimit = profileLimitArg ? parseInt(profileLimitArg.split('=')[1], 10) : undefined

  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) {
    console.error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY must be set (this harness hits the real deployed generate-meals function and database).')
    process.exit(1)
  }
  setSupabaseClient(createClient(url, key) as any)
  ;(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })

  let grid = buildGrid()
  if (profileLimit) grid = grid.slice(0, profileLimit)

  console.log('Running Meal Quality Harness...')
  console.log(`Grading ${grid.length} profiles (dietary preference is the priority axis; goal/sex/weight/meals-per-day/cooking-time round-robin across them)...`)
  console.log('This calls the real generate-meals function and writes to meal_plan_slots against a real, throwaway fitness_profiles row per grid entry.')
  console.log('')

  const results: ProfileResult[] = []
  for (let i = 0; i < grid.length; i++) {
    const g = grid[i]
    process.stdout.write(`  [${i + 1}/${grid.length}] ${g.label} ... `)
    let profileId: string | null = null
    try {
      profileId = await createThrowawayProfile(g.profile)
      const r = await gradeProfile(g, profileId)
      results.push(r)
      console.log(`${r.hardFailures.length === 0 ? 'OK' : `${r.hardFailures.length} FAIL(S)`} (${r.totalOptions} options, variety ${r.variety})`)
    } catch (err) {
      console.log('ERROR')
      console.error(err)
      results.push({ label: g.label, poolCounts: {}, hardFailures: [{ profileLabel: g.label, check: 'pool_size', detail: `generation threw: ${err instanceof Error ? err.message : String(err)}` }], variety: 0, totalOptions: 0, cuisines: new Set(), prepMatch: 0, prepTotal: 0, dayExoticCount: 0, daySlotCount: 0 })
    } finally {
      if (profileId) await deleteThrowawayProfile(profileId)
    }
  }

  const allFailures = results.flatMap(r => r.hardFailures)
  const totalOptions = results.reduce((s, r) => s + r.totalOptions, 0)
  const totalVariety = new Set<string>()
  const totalCuisines = new Set<string>()
  let prepMatch = 0
  let prepTotal = 0
  let dayExoticCount = 0
  let daySlotCount = 0
  for (const r of results) {
    for (const c of r.cuisines) totalCuisines.add(c)
    prepMatch += r.prepMatch
    prepTotal += r.prepTotal
    dayExoticCount += r.dayExoticCount
    daySlotCount += r.daySlotCount
  }

  const lines: string[] = []
  lines.push('='.repeat(80))
  lines.push('MEAL QUALITY HARNESS REPORT')
  lines.push('='.repeat(80))
  lines.push(`Profiles graded: ${results.length}`)
  lines.push(`Total pool options generated: ${totalOptions}`)
  lines.push(`Hard failures: ${allFailures.length}`)
  lines.push('')
  lines.push('FAILURE BREAKDOWN:')
  lines.push('-'.repeat(80))
  const byCheck = new Map<string, number>()
  for (const f of allFailures) byCheck.set(f.check, (byCheck.get(f.check) ?? 0) + 1)
  for (const [check, count] of byCheck) lines.push(`  ${check}: ${count} failure(s)`)
  if (allFailures.length === 0) lines.push('  (none)')
  lines.push('')

  if (allFailures.length > 0) {
    lines.push('WORST OFFENDERS:')
    lines.push('-'.repeat(80))
    for (const f of allFailures.slice(0, 20)) {
      lines.push(`  [${f.check}] ${f.profileLabel}`)
      lines.push(`    ${f.detail}`)
    }
    lines.push('')
  }

  lines.push('SOFT METRICS:')
  lines.push('-'.repeat(80))
  lines.push(`  Distinct cuisines used: ${totalCuisines.size} (${[...totalCuisines].slice(0, 15).join(', ')})`)
  lines.push(`  Prep-time-preference match rate: ${prepTotal > 0 ? Math.round((prepMatch / prepTotal) * 100) : 0}% (${prepMatch}/${prepTotal})`)
  lines.push(`  Cuisine distribution per assembled day: ${daySlotCount > 0 ? Math.round((dayExoticCount / daySlotCount) * 100) : 0}% exotic (${dayExoticCount}/${daySlotCount} chosen slots) — meal-realism round targets a minority`)
  for (const r of results) {
    lines.push(`  ${r.label}: variety=${r.variety}, pools=${JSON.stringify(r.poolCounts)}`)
  }

  const formatted = lines.join('\n')
  console.log('')
  console.log(formatted)

  const outputPath = path.join(process.cwd(), 'meal-quality-report.txt')
  fs.writeFileSync(outputPath, formatted)
  console.log(`\nReport saved to: ${outputPath}`)

  if (allFailures.length > 0) {
    console.log(`\nFAIL: ${allFailures.length} hard failure(s) across ${results.length} profile(s)`)
    process.exit(1)
  }
  console.log('\nAll profiles passed every hard check.')
  process.exit(0)
}

main().catch(err => {
  console.error('Meal quality harness crashed:', err)
  process.exit(1)
})

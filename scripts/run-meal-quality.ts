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
import { generateMealPools, assembleDay, computeSlotBudgets, DAY_CALORIE_TOLERANCE, DAY_PROTEIN_FLOOR_RATIO, type PoolOption } from '../src/lib/meal-generation'
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
  id: string
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
    grid.push({ id: `quality-${diet}-${i}`, label: `${diet} / ${goal} / ${sex} / ${weight}kg / ${mealsPerDay}mpd / ${cookingTime}`, profile })
  })
  return grid
}

interface HardFailure {
  profileLabel: string
  check: 'dietary_violation' | 'day_tolerance' | 'macro_drift' | 'pool_size' | 'unresolvable_ingredient'
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
}

const MIN_POOL_SIZE = 3

async function gradeProfile(g: GridProfile): Promise<ProfileResult> {
  const targets = getStaticDailyMacros(g.profile)
  const result: ProfileResult = {
    label: g.label, poolCounts: {}, hardFailures: [], variety: 0, totalOptions: 0,
    cuisines: new Set(), prepMatch: 0, prepTotal: 0,
  }

  const { accepted, shortfalls } = await generateMealPools({
    profileId: g.id,
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

    for (const opt of options) {
      allNames.add(opt.name)
      for (const tag of opt.tags) result.cuisines.add(tag)

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

  // (b) day within tolerance
  const day = assembleDay(accepted, targets)
  if (!day.withinTolerance && Object.keys(day.chosen).length > 0) {
    result.hardFailures.push({
      profileLabel: g.label, check: 'day_tolerance',
      detail: `assembled day ${Math.round(day.totals.calories)}kcal/${Math.round(day.totals.protein)}g vs target ${targets.calories}kcal/${targets.protein}g (need within ${DAY_CALORIE_TOLERANCE * 100}% cal, >=${DAY_PROTEIN_FLOOR_RATIO * 100}% protein)`,
    })
  }

  return result
}

async function cleanupProfile(profileId: string): Promise<void> {
  const { supabase } = await import('../src/lib/supabase')
  await supabase.from('meal_plan_slots').delete().eq('profile_id', profileId)
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
  console.log('This calls the real generate-meals function and writes to meal_plan_slots for synthetic quality-* profile ids.')
  console.log('')

  const results: ProfileResult[] = []
  for (let i = 0; i < grid.length; i++) {
    const g = grid[i]
    process.stdout.write(`  [${i + 1}/${grid.length}] ${g.label} ... `)
    try {
      const r = await gradeProfile(g)
      results.push(r)
      console.log(`${r.hardFailures.length === 0 ? 'OK' : `${r.hardFailures.length} FAIL(S)`} (${r.totalOptions} options, variety ${r.variety})`)
    } catch (err) {
      console.log('ERROR')
      console.error(err)
      results.push({ label: g.label, poolCounts: {}, hardFailures: [{ profileLabel: g.label, check: 'pool_size', detail: `generation threw: ${err instanceof Error ? err.message : String(err)}` }], variety: 0, totalOptions: 0, cuisines: new Set(), prepMatch: 0, prepTotal: 0 })
    } finally {
      await cleanupProfile(g.id)
    }
  }

  const allFailures = results.flatMap(r => r.hardFailures)
  const totalOptions = results.reduce((s, r) => s + r.totalOptions, 0)
  const totalVariety = new Set<string>()
  const totalCuisines = new Set<string>()
  let prepMatch = 0
  let prepTotal = 0
  for (const r of results) {
    for (const c of r.cuisines) totalCuisines.add(c)
    prepMatch += r.prepMatch
    prepTotal += r.prepTotal
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
  lines.push(`  Distinct cuisines used: ${totalCuisines.size} (${[...totalCuisines].filter(c => c && c !== 'quick' && c !== 'standard' && c !== 'unspecified').slice(0, 15).join(', ')})`)
  lines.push(`  Prep-time-preference match rate: ${prepTotal > 0 ? Math.round((prepMatch / prepTotal) * 100) : 0}% (${prepMatch}/${prepTotal})`)
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

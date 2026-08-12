import * as fs from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'

// One-off smoke-check tool: regenerates a genuinely fresh mesocycle for an
// EXISTING seeded profile (by profile_id), using the exact same generation
// pipeline handleOnboardingComplete uses in App.tsx (computeBMR ->
// computeStaticTDEE -> computeTargets -> generateExercisePlan ->
// generateMesocycle -> saveMesocycle). saveMesocycle's delete+insert with no
// preserveCreatedAt arg stamps a fresh created_at, so live-week detection
// resolves week 1 as "today" — a real "fresh week" for that profile, without
// going through onboarding (which would create a brand-new profile_id).
// TEST-only: pass --profile=<uuid> to target one profile at a time.

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
import { computeBMR, computeStaticTDEE } from '../src/lib/macro-calculator'
import { computeTargets } from '../src/lib/nutrition-targets'
import { generateExercisePlan, generateMesocycle } from '../src/lib/exercise-plan'
import { saveMesocycle } from '../src/lib/mesocycle-persistence'
import type { UserProfile } from '../src/lib/types'

async function main() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) {
    console.error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY must be set.')
    process.exit(1)
  }
  // Guard: this script writes mesocycle_weeks rows. Never let it touch prod.
  if (!url.includes('vswuurrtbzbrgubddefv')) {
    console.error(`Refusing to run against non-TEST URL: ${url}`)
    process.exit(1)
  }
  const supabase = createClient(url, key)
  setSupabaseClient(supabase as any)

  const profileArg = process.argv.find(a => a.startsWith('--profile='))
  if (!profileArg) {
    console.error('Usage: tsx scripts/smoke-regen-week.ts --profile=<uuid>')
    process.exit(1)
  }
  const profileId = profileArg.split('=')[1]

  const { data: row, error } = await supabase.from('fitness_profiles').select('*').eq('id', profileId).maybeSingle()
  if (error || !row) {
    console.error('Profile not found:', error?.message)
    process.exit(1)
  }

  const profile: UserProfile = {
    id: row.id,
    age: row.age,
    gender: row.gender,
    height_cm: Number(row.height_cm),
    weight_kg: Number(row.weight_kg),
    activity_level: row.activity_level,
    fitness_goal: row.fitness_goal,
    training_days: row.training_days,
    preferred_time: row.preferred_time,
    dietary_preferences: row.dietary_preferences || [],
    session_duration_preference: row.session_duration_preference || '45-60',
    workout_split_preference: row.workout_split_preference || 'ai_recommendation',
    macro_calculation_mode: row.macro_calculation_mode || 'STANDARD_STATIC',
    equipment_access: row.equipment_access || 'full_gym',
    training_style: row.training_style || 'hybrid',
    training_experience: row.training_experience || 'novice',
    coaching_persona: row.coaching_persona || 'supportive',
    recovery_capacity: row.recovery_capacity || 'moderate',
    conditioning_preference: row.conditioning_preference || 'tolerate',
    meals_per_day: row.meals_per_day ?? 3,
    include_snacks: row.include_snacks ?? true,
    cooking_time_preference: row.cooking_time_preference || 'moderate',
    favorite_cuisines: row.favorite_cuisines || [],
    disliked_foods: row.disliked_foods || [],
    breakfast_style: row.breakfast_style || undefined,
    injuries: row.injuries || [],
    skip_calibration_week: row.skip_calibration_week ?? false,
    known_squat_kg: row.known_squat_kg != null ? Number(row.known_squat_kg) : undefined,
    known_bench_kg: row.known_bench_kg != null ? Number(row.known_bench_kg) : undefined,
    known_deadlift_kg: row.known_deadlift_kg != null ? Number(row.known_deadlift_kg) : undefined,
    display_name: row.display_name || '',
    concurrent_activities: row.concurrent_activities || [],
    weekly_schedule: row.weekly_schedule || {},
    created_at: row.created_at || new Date().toISOString(),
    bmr: Number(row.bmr),
    tdee: Number(row.tdee),
    calorie_target: Number(row.calorie_target),
    protein_g: Number(row.protein_g),
    carbs_g: Number(row.carbs_g),
    fat_g: Number(row.fat_g),
  }

  const bmr = computeBMR(profile)
  const tdee = computeStaticTDEE(bmr, profile.activity_level)
  const macros = computeTargets(profile)
  const enrichedProfile: UserProfile = {
    ...profile,
    bmr,
    tdee,
    calorie_target: macros.calories,
    protein_g: macros.protein,
    carbs_g: macros.carbs,
    fat_g: macros.fat,
  }

  const exclusions: string[] = row.exercise_exclusions || []
  const planResult = generateExercisePlan(enrichedProfile, exclusions)
  const workout = planResult.plan
  const mesocycleData = generateMesocycle(enrichedProfile, workout)

  await saveMesocycle(profileId, mesocycleData)

  console.log(`Regenerated fresh mesocycle for ${row.display_name} (${profileId}): ${mesocycleData.length} weeks written.`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

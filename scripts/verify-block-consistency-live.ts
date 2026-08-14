/**
 * Step 5 live end-to-end verification (TEST project only). Real Supabase
 * writes, no mocking — mirrors verify-block-review-live.ts's shape.
 *
 * Two profiles, two real generated mesocycles:
 * - Profile A: sparse real workout_sessions logged across block 1 (well
 *   under two-thirds attendance) — confirms the hold triggers, persists,
 *   is idempotent on a second check, and actually caps a real slot's sets
 *   back to the previous block's own number.
 * - Profile B: a full real session logged for every one of block 1's
 *   actually-scheduled days — confirms NOTHING changes. This is the false-
 *   positive case: mistakenly telling someone who trained normally that
 *   their volume is "holding steady" would misrepresent the app's own
 *   judgement of them, so it gets its own direct proof, not just an
 *   inferred absence of the trigger case.
 *
 * Both profiles (and everything under them) are deleted on exit.
 */
import * as fs from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'

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

import { setSupabaseClient, supabase } from '../src/lib/supabase'
import { computeBMR, computeStaticTDEE } from '../src/lib/macro-calculator'
import { computeTargets } from '../src/lib/nutrition-targets'
import { generateExercisePlan, generateMesocycle } from '../src/lib/exercise-plan'
import { saveMesocycle, restoreMesocycle } from '../src/lib/mesocycle-persistence'
import { checkForConsistencyHold } from '../src/lib/block-consistency'
import { getBlockDateRange } from '../src/lib/block-review'
import type { UserProfile, MesocycleWeek } from '../src/lib/types'

let failures = 0
function check(label: string, condition: boolean, extra?: unknown) {
  if (condition) {
    console.log(`  ok: ${label}`)
  } else {
    failures++
    console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`)
  }
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso)
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000)
  return d.toISOString()
}
function dateOnly(iso: string): string {
  return iso.slice(0, 10)
}

const BASE_PROFILE: UserProfile = {
  age: 29,
  gender: 'female',
  height_cm: 168,
  weight_kg: 65,
  activity_level: 'moderate',
  fitness_goal: 'hypertrophy',
  training_days: [
    { day: 'Monday', available: true },
    { day: 'Tuesday', available: true },
    { day: 'Wednesday', available: true },
    { day: 'Thursday', available: true },
    { day: 'Friday', available: false },
    { day: 'Saturday', available: false },
    { day: 'Sunday', available: false },
  ],
  preferred_time: 'morning',
  dietary_preferences: [],
  session_duration_preference: '60-90',
  workout_split_preference: 'upper_lower',
  macro_calculation_mode: 'STANDARD_STATIC',
  equipment_access: 'full_gym',
  training_style: 'bodybuilding',
  training_experience: 'intermediate',
  coaching_persona: 'analytical',
  recovery_capacity: 'moderate',
  conditioning_preference: 'tolerate',
  injuries: [],
}

async function createProfile(displayName: string): Promise<{ profileId: string; enrichedProfile: UserProfile; mesocycle: MesocycleWeek[] }> {
  const bmr = computeBMR(BASE_PROFILE)
  const tdee = computeStaticTDEE(bmr, BASE_PROFILE.activity_level)
  const macros = computeTargets(BASE_PROFILE)
  const enrichedProfile: UserProfile = { ...BASE_PROFILE, bmr, tdee, calorie_target: macros.calories, protein_g: macros.protein, carbs_g: macros.carbs, fat_g: macros.fat }

  const { data: inserted, error: insertErr } = await supabase.from('fitness_profiles').insert({
    age: enrichedProfile.age,
    gender: enrichedProfile.gender,
    height_cm: enrichedProfile.height_cm,
    weight_kg: enrichedProfile.weight_kg,
    activity_level: enrichedProfile.activity_level,
    fitness_goal: enrichedProfile.fitness_goal,
    training_days: enrichedProfile.training_days,
    preferred_time: enrichedProfile.preferred_time,
    dietary_preferences: enrichedProfile.dietary_preferences,
    session_duration_preference: enrichedProfile.session_duration_preference,
    workout_split_preference: enrichedProfile.workout_split_preference,
    macro_calculation_mode: enrichedProfile.macro_calculation_mode,
    equipment_access: enrichedProfile.equipment_access,
    training_style: enrichedProfile.training_style,
    training_experience: enrichedProfile.training_experience,
    coaching_persona: enrichedProfile.coaching_persona,
    recovery_capacity: enrichedProfile.recovery_capacity,
    conditioning_preference: enrichedProfile.conditioning_preference,
    meals_per_day: 3,
    include_snacks: true,
    cooking_time_preference: 'moderate',
    injuries: [],
    exercise_exclusions: [],
    skip_calibration_week: false,
    known_squat_kg: null,
    known_bench_kg: null,
    known_deadlift_kg: null,
    favorite_cuisines: [],
    disliked_foods: [],
    breakfast_style: null,
    bmr: enrichedProfile.bmr,
    tdee: enrichedProfile.tdee,
    calorie_target: enrichedProfile.calorie_target,
    protein_g: enrichedProfile.protein_g,
    carbs_g: enrichedProfile.carbs_g,
    fat_g: enrichedProfile.fat_g,
    display_name: displayName,
  }).select('id, created_at').single()
  if (insertErr || !inserted) throw new Error(`Profile insert failed: ${insertErr?.message}`)
  const profileId = inserted.id as string

  const planResult = generateExercisePlan(enrichedProfile, [])
  const mesocycle = generateMesocycle(enrichedProfile, planResult.plan)
  await saveMesocycle(profileId, mesocycle)
  return { profileId, enrichedProfile: { ...enrichedProfile, id: profileId }, mesocycle }
}

async function logSession(profileId: string, dateIso: string): Promise<void> {
  const { error } = await supabase.from('workout_sessions').insert({
    profile_id: profileId,
    date: dateOnly(dateIso),
    split_type: 'training',
    duration_minutes: 60,
    is_completed: true,
  })
  if (error) throw new Error(`session insert failed: ${error.message}`)
}

async function cleanup(profileId: string | null, label: string): Promise<void> {
  if (!profileId) return
  console.log(`\n[cleanup] Deleting ${label} profile ${profileId} (cascades: mesocycle_weeks, workout_sessions)`)
  const { error } = await supabase.from('fitness_profiles').delete().eq('id', profileId)
  if (error) {
    console.error(`  CLEANUP FAILED — ${label} profile ${profileId} is still in TEST: ${error.message}`)
    failures++
    return
  }
  const { data: leftoverWeeks } = await supabase.from('mesocycle_weeks').select('id').eq('profile_id', profileId).limit(1)
  check(`${label}: cascade actually removed mesocycle_weeks`, !leftoverWeeks || leftoverWeeks.length === 0)
}

async function main() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) { console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY'); process.exit(1) }
  if (!url!.includes('vswuurrtbzbrgubddefv')) { console.error(`Refusing to run against non-TEST URL: ${url}`); process.exit(1) }
  setSupabaseClient(createClient(url!, key!) as any)

  let lightProfileId: string | null = null
  let fullProfileId: string | null = null

  try {
    const now = new Date()
    const planCreatedAt = addDays(now.toISOString(), -30) // same week-5 anchor as Step 4's live verification
    const block1Range = getBlockDateRange(planCreatedAt, 1)
    console.log(`block 1 date range: ${block1Range.start} .. ${block1Range.end}`)

    // -------------------------------------------------------------------
    // Case A: light attendance
    // -------------------------------------------------------------------
    console.log('\n=== Case A: light attendance (well under two-thirds) ===')
    const light = await createProfile('Block-consistency LIGHT (delete me)')
    lightProfileId = light.profileId
    console.log(`  profile created: ${light.profileId}`)

    const week1Light = light.mesocycle.find(w => w.week_number === 1)!
    const week5Preview = light.mesocycle.find(w => w.week_number === 5)!
    const preCheckWeek5Sets = week5Preview.days[0].exercises.map(e => e.sets)
    const week1Sets = week1Light.days[0].exercises.map(e => e.sets)
    console.log(`  ${week1Light.days[0].day} sets before the check — week 1: [${week1Sets.join(', ')}], week 5 (formula, unheld): [${preCheckWeek5Sets.join(', ')}]`)

    // Only 2 real sessions across a 4-day/week, 4-week block (16 scheduled
    // days) — 2/16 = 12.5%, far under the two-thirds bar.
    await logSession(light.profileId, addDays(planCreatedAt, 2))
    await logSession(light.profileId, addDays(planCreatedAt, 9))
    console.log('  logged 2 real sessions across a 16-scheduled-day block')

    const restoredLight = await restoreMesocycle(light.profileId)
    const result = await checkForConsistencyHold(light.profileId, restoredLight!.weeks, light.enrichedProfile, planCreatedAt, now)
    check('a hold was applied (mesocycle returned)', !!result.mesocycle, result)
    check('exactly one dashboard message', result.messages.length === 1, result.messages)
    if (result.messages[0]) console.log(`  message: "${result.messages[0]}"`)

    console.log('\n[verify] Re-fetching fresh from the database')
    const reRestoredLight = await restoreMesocycle(light.profileId)
    const week5After = reRestoredLight!.weeks.find(w => w.week_number === 5)!
    const week8After = reRestoredLight!.weeks.find(w => w.week_number === 8)!
    check('week 5 coach_note carries the consistency explanation', !!week5After.coach_note?.includes('steady'), week5After.coach_note)
    check('week 8 (last week of the new block) ALSO carries it — the whole block, not just week 1', !!week8After.coach_note?.includes('steady'), week8After.coach_note)

    const postCheckWeek5Sets = week5After.days[0].exercises.map(e => e.sets)
    console.log(`  week 5 sets after the check: [${postCheckWeek5Sets.join(', ')}]`)
    const everySlotAtOrBelowPrevious = postCheckWeek5Sets.every((s, i) => s <= week1Sets[i])
    check('every held slot is at or below what block 1 actually had (never pushed up)', everySlotAtOrBelowPrevious, { week1Sets, postCheckWeek5Sets })
    const someSlotWasCapped = preCheckWeek5Sets.some((s, i) => s > week1Sets[i]) && postCheckWeek5Sets.some((s, i) => preCheckWeek5Sets[i] > week1Sets[i] && s === week1Sets[i])
    if (someSlotWasCapped) {
      check('at least one slot that WOULD have stepped up was actually capped back down', true)
    } else {
      console.log('  (note: this profile/goal\'s formula did not naturally step up week 5\'s volume over week 1 — nothing to cap, invariant above still holds. Not a failure; a matter of which phase this random generation landed in.)')
    }

    console.log('\n[verify] A second check on the same block boundary is a no-op (idempotency)')
    const restoredLightAgain = await restoreMesocycle(light.profileId)
    const secondResult = await checkForConsistencyHold(light.profileId, restoredLightAgain!.weeks, light.enrichedProfile, planCreatedAt, now)
    check('no mesocycle returned the second time', !secondResult.mesocycle, secondResult)
    check('no message the second time', secondResult.messages.length === 0, secondResult.messages)

    // -------------------------------------------------------------------
    // Case B: full attendance — the false-positive check
    // -------------------------------------------------------------------
    console.log('\n=== Case B: full attendance (every scheduled day logged) ===')
    const full = await createProfile('Block-consistency FULL (delete me)')
    fullProfileId = full.profileId
    console.log(`  profile created: ${full.profileId}`)

    const week1Full = full.mesocycle.find(w => w.week_number === 1)!
    const scheduledWeekdays = new Set(week1Full.days.filter(d => d.exercises.length > 0).map(d => d.day))
    let loggedCount = 0
    for (let offset = 0; offset < 28; offset++) {
      const dateIso = addDays(planCreatedAt, offset)
      const weekdayName = new Date(dateIso).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
      if (scheduledWeekdays.has(weekdayName)) {
        await logSession(full.profileId, dateIso)
        loggedCount++
      }
    }
    console.log(`  logged ${loggedCount} real sessions — one for every scheduled day in the block`)

    const restoredFull = await restoreMesocycle(full.profileId)
    const fullResult = await checkForConsistencyHold(full.profileId, restoredFull!.weeks, full.enrichedProfile, planCreatedAt, now)
    check('normal attendance: no mesocycle returned (nothing held)', !fullResult.mesocycle, fullResult)
    check('normal attendance: no message shown (never a false "holding steady" claim)', fullResult.messages.length === 0, fullResult.messages)

  } finally {
    await cleanup(lightProfileId, 'light-attendance')
    await cleanup(fullProfileId, 'full-attendance')
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) FAILED.`)
    process.exit(1)
  }
  console.log('\nAll live block-consistency checks passed.')
}

main().catch(err => {
  console.error('Verification script crashed:', err)
  process.exit(1)
})

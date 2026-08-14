/**
 * Step 4 live end-to-end verification (TEST project only). Real Supabase
 * writes, no mocking: a synthetic profile gets a real generated+persisted
 * mesocycle, a real main lift gets three real exercise_set_logs sessions
 * shaped as a genuine stall (flat weight, flat-or-declining reps) inside
 * block 1's real date range, then the real checkForBlockReview is called
 * exactly as App.tsx calls it — same function, same arguments shape, real
 * DB reads and a real DB write. The result is re-fetched fresh from the
 * database (not read back from the in-memory return value) to prove the
 * hold actually persisted, not just that the function computed one.
 * Cleans up everything it created on exit (success or failure).
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
import { checkForBlockReview, getBlockDateRange } from '../src/lib/block-review'
import { getExerciseId } from '../src/lib/exercise-db'
import type { UserProfile } from '../src/lib/types'

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

async function main() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) { console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY'); process.exit(1) }
  if (!url!.includes('vswuurrtbzbrgubddefv')) { console.error(`Refusing to run against non-TEST URL: ${url}`); process.exit(1) }
  const client = createClient(url!, key!)
  setSupabaseClient(client as any)

  let profileId: string | null = null

  try {
    console.log('[setup] Building a real profile + generating + persisting a real mesocycle')

    const baseProfile: UserProfile = {
      age: 32,
      gender: 'male',
      height_cm: 180,
      weight_kg: 85,
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
      preferred_time: 'evening',
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
    const bmr = computeBMR(baseProfile)
    const tdee = computeStaticTDEE(bmr, baseProfile.activity_level)
    const macros = computeTargets(baseProfile)
    const enrichedProfile: UserProfile = { ...baseProfile, bmr, tdee, calorie_target: macros.calories, protein_g: macros.protein, carbs_g: macros.carbs, fat_g: macros.fat }

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
      display_name: 'Block-review verify (delete me)',
    }).select('id, created_at').single()
    if (insertErr || !inserted) { console.error('Profile insert failed:', insertErr?.message); process.exit(1) }
    profileId = inserted.id as string
    console.log(`  profile created: ${profileId}`)

    const planResult = generateExercisePlan(enrichedProfile, [])
    const mesocycleData = generateMesocycle(enrichedProfile, planResult.plan)
    await saveMesocycle(profileId, mesocycleData)
    check('mesocycle has at least 8 weeks (2 blocks) to review', mesocycleData.length >= 8, mesocycleData.length)

    const week1 = mesocycleData.find(w => w.week_number === 1)!
    let targetDayName = ''
    let targetExName = ''
    let targetExId = ''
    let startingWeightKg = 0
    for (const day of week1.days) {
      const ex = day.exercises.find(e => e.tier === 'tier_1_primary' && e.suggested_load_kg != null && e.suggested_load_kg > 0)
      if (ex) { targetDayName = day.day; targetExName = ex.name; targetExId = ex.id ?? getExerciseId(ex.name); startingWeightKg = ex.suggested_load_kg!; break }
    }
    check('found a loaded main-lift slot in week 1 to use as the stall target', !!targetExName, week1.days.map(d => d.exercises.map(e => `${e.name}:${e.tier}`)))
    if (!targetExName) throw new Error('no usable main lift found — cannot continue')
    console.log(`  target exercise: "${targetExName}" (${targetExId}) on ${targetDayName}, week-1 starting weight ${startingWeightKg}kg`)

    // planCreatedAt backdated so "now" (real time) lands in week 5 —
    // week_in_block 1 of block 2 — the exact trigger condition
    // checkForBlockReview requires. 30 real days back puts elapsedDays in
    // [28,34], which getActiveMesocycleWeek's own floor(elapsedDays/7)
    // arithmetic resolves to week 5 for the whole window.
    const now = new Date()
    const planCreatedAt = addDays(now.toISOString(), -30)
    const block1Range = getBlockDateRange(planCreatedAt, 1)
    console.log(`  block 1 date range: ${block1Range.start} .. ${block1Range.end}`)

    console.log('\n[setup] Logging 3 real sessions inside block 1 — flat weight, flat/declining reps (a genuine stall)')
    const sessionOffsetsDays = [2, 9, 16] // 3 real sessions, spread across block 1, well inside its 28-day window
    const repsBySession = [8, 8, 7] // never improves — the case that must be flagged
    for (let i = 0; i < sessionOffsetsDays.length; i++) {
      const sessionDateIso = addDays(planCreatedAt, sessionOffsetsDays[i])
      const sessionDate = dateOnly(sessionDateIso)
      const { data: sessionRow, error: sessionErr } = await supabase.from('workout_sessions').insert({
        profile_id: profileId,
        date: sessionDate,
        split_type: 'training',
        duration_minutes: 60,
        is_completed: true,
      }).select('id').single()
      if (sessionErr || !sessionRow) throw new Error(`session insert failed: ${sessionErr?.message}`)

      const { error: setErr } = await supabase.from('exercise_set_logs').insert({
        session_id: sessionRow.id,
        user_id: profileId,
        exercise_id: targetExId,
        exercise_name: targetExName,
        set_number: 1,
        weight_kg: startingWeightKg,
        reps_completed: repsBySession[i],
        rpe: 8,
        unit: 'reps',
        is_bodyweight: false,
        is_warmup: false,
        completed_at: sessionDateIso,
      })
      if (setErr) throw new Error(`set insert failed: ${setErr.message}`)
      console.log(`  session ${i + 1}: ${sessionDate} — ${startingWeightKg}kg x ${repsBySession[i]} reps`)
    }

    console.log('\n[run] Calling the real checkForBlockReview — same function App.tsx calls on restore')
    const restored = await restoreMesocycle(profileId)
    check('mesocycle restored before the check', !!restored && restored.weeks.length > 0)
    const result = await checkForBlockReview(profileId, restored!.weeks, { ...enrichedProfile, id: profileId }, planCreatedAt, now)

    check('a hold was applied (mesocycle returned)', !!result.mesocycle, result)
    check('exactly one coach message (one exercise stalled)', result.messages.length === 1, result.messages)
    if (result.messages.length > 0) console.log(`  message: "${result.messages[0]}"`)

    console.log('\n[verify] Re-fetching fresh from the database — proving the hold actually persisted, not just returned in-memory')
    const reRestored = await restoreMesocycle(profileId)
    const week5 = reRestored!.weeks.find(w => w.week_number === 5)
    const week8 = reRestored!.weeks.find(w => w.week_number === 8)
    const day5 = week5?.days.find(d => d.day === targetDayName)
    const ex5 = day5?.exercises.find(e => e.name === targetExName)
    const day8 = week8?.days.find(d => d.day === targetDayName)
    const ex8 = day8?.exercises.find(e => e.name === targetExName)

    check('week 5 (block 2, week 1) has a block_hold_note on the stalled exercise', !!ex5?.block_hold_note, ex5)
    check('week 5 suggested_load_kg equals the actually-logged weight, not a stepped-up formula number', ex5?.suggested_load_kg === startingWeightKg, { got: ex5?.suggested_load_kg, expected: startingWeightKg })
    check('week 8 (last week of block 2) ALSO carries the hold — the whole block, not just week 1', !!ex8?.block_hold_note, ex8)
    if (ex5?.block_hold_note) console.log(`  week 5 note: "${ex5.block_hold_note}"`)

    console.log('\n[verify] A different main lift in the same week (never logged, so <3 sessions) must NOT be touched')
    const otherEx = week1.days.flatMap(d => d.exercises).find(e => e.tier === 'tier_1_primary' && e.name !== targetExName)
    if (otherEx) {
      const otherWeek5Ex = week5?.days.flatMap(d => d.exercises).find(e => e.name === otherEx.name)
      check(`"${otherEx.name}" (no logged history) was left alone — no block_hold_note`, !otherWeek5Ex?.block_hold_note, otherWeek5Ex)
    } else {
      console.log('  (only one main lift found this profile/split — nothing else to cross-check)')
    }

  } finally {
    if (profileId) {
      console.log(`\n[cleanup] Deleting synthetic profile ${profileId} (cascades: mesocycle_weeks, workout_sessions, exercise_set_logs)`)
      const { error: delErr } = await supabase.from('fitness_profiles').delete().eq('id', profileId)
      if (delErr) {
        console.error(`  CLEANUP FAILED — synthetic profile ${profileId} is still in TEST: ${delErr.message}`)
        failures++
      } else {
        const { data: leftoverLogs } = await supabase.from('exercise_set_logs').select('id').eq('user_id', profileId).limit(1)
        const { data: leftoverWeeks } = await supabase.from('mesocycle_weeks').select('id').eq('profile_id', profileId).limit(1)
        check('cascade actually removed exercise_set_logs', !leftoverLogs || leftoverLogs.length === 0)
        check('cascade actually removed mesocycle_weeks', !leftoverWeeks || leftoverWeeks.length === 0)
      }
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) FAILED.`)
    process.exit(1)
  }
  console.log('\nAll live block-review checks passed.')
}

main().catch(err => {
  console.error('Verification script crashed:', err)
  process.exit(1)
})

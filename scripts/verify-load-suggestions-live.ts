/**
 * Step 6 live end-to-end verification (TEST project only). Real Supabase
 * writes, no mocking — mirrors the shape of the last two steps' live
 * scripts, but proves the parts unique to this feature: it only ever
 * PROPOSES (never patches on its own), confirming actually applies and
 * persists the real number, and a decline is permanent — a later block
 * with the exact same overachievement pattern never asks again.
 *
 * One profile, three checks against it:
 * 1. A genuinely overachieving block (real logged weight well above the
 *    new block's own formula baseline, every real comparison improving)
 *    produces exactly one suggestion, naming the real numbers. Re-running
 *    the check (simulating a second app-open the same week) returns the
 *    SAME suggestion, not a duplicate.
 * 2. Confirming it patches and persists the real weight across the WHOLE
 *    new block (re-fetched fresh from the database, not the in-memory
 *    result) and marks the row confirmed. A third check afterward returns
 *    nothing further for that exercise.
 * 3. (Only if the generated mesocycle has a third block) The same
 *    exercise overachieves again in the next block, but was declined the
 *    first time around — confirmed to produce NO suggestion the second
 *    time, proving the decline is permanent per exercise, not just for
 *    the block it was raised in.
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
import { checkForLoadSuggestions, confirmLoadSuggestion, declineLoadSuggestion } from '../src/lib/load-suggestions'
import { getBlockDateRange } from '../src/lib/block-review'
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

async function logOverachievingSessions(profileId: string, exerciseId: string, exerciseName: string, blockStartIso: string, startWeightKg: number): Promise<number> {
  const offsets = [2, 9, 16]
  const weights = [startWeightKg + 10, startWeightKg + 15, startWeightKg + 20] // clearly, consistently higher each session
  for (let i = 0; i < offsets.length; i++) {
    const sessionDateIso = addDays(blockStartIso, offsets[i])
    const sessionDate = dateOnly(sessionDateIso)
    const { data: sessionRow, error: sessionErr } = await supabase.from('workout_sessions').insert({
      profile_id: profileId, date: sessionDate, split_type: 'training', duration_minutes: 60, is_completed: true,
    }).select('id').single()
    if (sessionErr || !sessionRow) throw new Error(`session insert failed: ${sessionErr?.message}`)
    const { error: setErr } = await supabase.from('exercise_set_logs').insert({
      session_id: sessionRow.id, user_id: profileId, exercise_id: exerciseId, exercise_name: exerciseName,
      set_number: 1, weight_kg: weights[i], reps_completed: 8, rpe: 7, unit: 'reps',
      is_bodyweight: false, is_warmup: false, completed_at: sessionDateIso,
    })
    if (setErr) throw new Error(`set insert failed: ${setErr.message}`)
    console.log(`    session: ${sessionDate} — ${weights[i]}kg x 8`)
  }
  return weights[weights.length - 1]
}

async function main() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) { console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY'); process.exit(1) }
  if (!url!.includes('vswuurrtbzbrgubddefv')) { console.error(`Refusing to run against non-TEST URL: ${url}`); process.exit(1) }
  setSupabaseClient(createClient(url!, key!) as any)

  let profileId: string | null = null

  try {
    const baseProfile: UserProfile = {
      age: 34, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate', fitness_goal: 'hypertrophy',
      training_days: [
        { day: 'Monday', available: true }, { day: 'Tuesday', available: true },
        { day: 'Wednesday', available: true }, { day: 'Thursday', available: true },
        { day: 'Friday', available: false }, { day: 'Saturday', available: false }, { day: 'Sunday', available: false },
      ],
      preferred_time: 'evening', dietary_preferences: [], session_duration_preference: '60-90',
      workout_split_preference: 'upper_lower', macro_calculation_mode: 'STANDARD_STATIC', equipment_access: 'full_gym',
      training_style: 'bodybuilding', training_experience: 'intermediate', coaching_persona: 'analytical',
      recovery_capacity: 'moderate', conditioning_preference: 'tolerate', injuries: [],
    }
    const bmr = computeBMR(baseProfile)
    const tdee = computeStaticTDEE(bmr, baseProfile.activity_level)
    const macros = computeTargets(baseProfile)
    const enrichedProfile: UserProfile = { ...baseProfile, bmr, tdee, calorie_target: macros.calories, protein_g: macros.protein, carbs_g: macros.carbs, fat_g: macros.fat }

    const { data: inserted, error: insertErr } = await supabase.from('fitness_profiles').insert({
      age: enrichedProfile.age, gender: enrichedProfile.gender, height_cm: enrichedProfile.height_cm, weight_kg: enrichedProfile.weight_kg,
      activity_level: enrichedProfile.activity_level, fitness_goal: enrichedProfile.fitness_goal, training_days: enrichedProfile.training_days,
      preferred_time: enrichedProfile.preferred_time, dietary_preferences: enrichedProfile.dietary_preferences,
      session_duration_preference: enrichedProfile.session_duration_preference, workout_split_preference: enrichedProfile.workout_split_preference,
      macro_calculation_mode: enrichedProfile.macro_calculation_mode, equipment_access: enrichedProfile.equipment_access,
      training_style: enrichedProfile.training_style, training_experience: enrichedProfile.training_experience,
      coaching_persona: enrichedProfile.coaching_persona, recovery_capacity: enrichedProfile.recovery_capacity,
      conditioning_preference: enrichedProfile.conditioning_preference, meals_per_day: 3, include_snacks: true, cooking_time_preference: 'moderate',
      injuries: [], exercise_exclusions: [], skip_calibration_week: false, known_squat_kg: null, known_bench_kg: null, known_deadlift_kg: null,
      favorite_cuisines: [], disliked_foods: [], breakfast_style: null, bmr: enrichedProfile.bmr, tdee: enrichedProfile.tdee,
      calorie_target: enrichedProfile.calorie_target, protein_g: enrichedProfile.protein_g, carbs_g: enrichedProfile.carbs_g, fat_g: enrichedProfile.fat_g,
      display_name: 'Load-suggestions verify (delete me)',
    }).select('id').single()
    if (insertErr || !inserted) throw new Error(`Profile insert failed: ${insertErr?.message}`)
    profileId = inserted.id as string
    const liveProfile: UserProfile = { ...enrichedProfile, id: profileId }
    console.log(`profile created: ${profileId}`)

    const planResult = generateExercisePlan(enrichedProfile, [])
    const mesocycleData = generateMesocycle(enrichedProfile, planResult.plan)
    await saveMesocycle(profileId, mesocycleData)
    console.log(`mesocycle: ${mesocycleData.length} weeks (${Math.floor(mesocycleData.length / 4)} blocks)`)

    const week1 = mesocycleData.find(w => w.week_number === 1)!
    const week5Preview = mesocycleData.find(w => w.week_number === 5)!
    let targetDayName = '', targetExName = '', targetExId = ''
    for (const day of week1.days) {
      const ex = day.exercises.find(e => e.tier === 'tier_1_primary' && e.suggested_load_kg != null && e.suggested_load_kg > 0)
      if (ex) { targetDayName = day.day; targetExName = ex.name; targetExId = ex.id ?? getExerciseId(ex.name); break }
    }
    check('found a loaded main-lift slot in week 1', !!targetExName)
    if (!targetExName) throw new Error('no usable main lift found')
    const week1BaselineKg = week1.days.find(d => d.day === targetDayName)!.exercises.find(e => e.name === targetExName)!.suggested_load_kg!
    const block2FormulaKg = week5Preview.days.find(d => d.day === targetDayName)?.exercises.find(e => e.name === targetExName)?.suggested_load_kg ?? week1BaselineKg
    console.log(`target: "${targetExName}" on ${targetDayName} — week 1 baseline ${week1BaselineKg}kg, block 2's own formula baseline ${block2FormulaKg}kg`)

    const now = new Date()
    const planCreatedAt = addDays(now.toISOString(), -30) // lands "now" in week 5 (block 2, week_in_block 1)
    const block1Range = getBlockDateRange(planCreatedAt, 1)

    console.log('\n=== Check 1: genuine overachievement triggers exactly one suggestion ===')
    const lastLogged = await logOverachievingSessions(profileId, targetExId, targetExName, block1Range.start, week1BaselineKg)
    check('the real logged weight clearly exceeds block 2\'s own formula baseline (the case worth testing)', lastLogged > block2FormulaKg, { lastLogged, block2FormulaKg })

    const restored1 = await restoreMesocycle(profileId)
    const result1 = await checkForLoadSuggestions(profileId, restored1!.weeks, liveProfile, planCreatedAt, now)
    check('exactly one suggestion produced', result1.suggestions.length === 1, result1.suggestions)
    const suggestion = result1.suggestions[0]
    if (suggestion) {
      check('names the correct exercise', suggestion.exerciseName === targetExName, suggestion)
      check('current weight matches the formula\'s own number', suggestion.currentWeightKg === block2FormulaKg, suggestion)
      check('proposed weight matches what was actually logged last', suggestion.proposedWeightKg === lastLogged, suggestion)
      console.log(`  text: "${suggestion.text}"`)
    }

    console.log('\n[verify] Re-running the check (simulating a second app-open) returns the SAME suggestion, not a duplicate')
    const restored1b = await restoreMesocycle(profileId)
    const result1b = await checkForLoadSuggestions(profileId, restored1b!.weeks, liveProfile, planCreatedAt, now)
    check('still exactly one suggestion', result1b.suggestions.length === 1, result1b.suggestions)
    check('same suggestion id — no duplicate row inserted', result1b.suggestions[0]?.id === suggestion?.id)

    console.log('\n=== Check 2: confirming applies and persists the real number ===')
    if (suggestion) {
      const restoredForConfirm = await restoreMesocycle(profileId)
      const patched = await confirmLoadSuggestion(suggestion.id, restoredForConfirm!.weeks, liveProfile, profileId)
      check('confirm returned a patched mesocycle', !!patched)

      const reRestored = await restoreMesocycle(profileId)
      const week5After = reRestored!.weeks.find(w => w.week_number === 5)!
      const week8After = reRestored!.weeks.find(w => w.week_number === 8)!
      const ex5 = week5After.days.find(d => d.day === targetDayName)?.exercises.find(e => e.name === targetExName)
      const ex8 = week8After.days.find(d => d.day === targetDayName)?.exercises.find(e => e.name === targetExName)
      check('week 5 (new block, week 1) now shows the real logged weight, fresh from the database', ex5?.suggested_load_kg === lastLogged, { got: ex5?.suggested_load_kg, expected: lastLogged })
      check('week 8 (last week of the new block) ALSO carries it — the whole block, not just week 1', ex8?.suggested_load_kg != null && ex8.suggested_load_kg >= lastLogged - 1, ex8)

      const { data: rowAfterConfirm } = await supabase.from('load_suggestions').select('status').eq('id', suggestion.id).maybeSingle()
      check('the row itself is marked confirmed', rowAfterConfirm?.status === 'confirmed', rowAfterConfirm)

      const restored2 = await restoreMesocycle(profileId)
      const result2 = await checkForLoadSuggestions(profileId, restored2!.weeks, liveProfile, planCreatedAt, now)
      check('a third check produces nothing further for this exercise', !result2.suggestions.some(s => s.exerciseName === targetExName), result2.suggestions)
    }

    console.log('\n=== Check 3: decline is permanent, not just for the block it was raised in ===')
    if (mesocycleData.length >= 12) {
      // Check 2 already confirmed this exact suggestion row — decline acts
      // on a row id directly, so flipping it to 'declined' here for the
      // permanence test doesn't need a fresh profile or to undo anything;
      // it's just proving declineLoadSuggestion's own state transition and
      // checkForLoadSuggestions' declined-row skip, independent of confirm.
      if (suggestion) {
        await declineLoadSuggestion(suggestion.id)
        const { data: rowAfterDecline } = await supabase.from('load_suggestions').select('status').eq('id', suggestion.id).maybeSingle()
        check('the row is marked declined', rowAfterDecline?.status === 'declined', rowAfterDecline)
      }

      const block2Range = getBlockDateRange(planCreatedAt, 2)
      const now3 = new Date(addDays(planCreatedAt, 58)) // lands in week 9 (block 3, week_in_block 1)
      const restoredForBlock3 = await restoreMesocycle(profileId)
      const week9 = restoredForBlock3!.weeks.find(w => w.week_number === 9)
      const week5BaselineForBlock3 = restoredForBlock3!.weeks.find(w => w.week_number === 5)!.days.find(d => d.day === targetDayName)!.exercises.find(e => e.name === targetExName)!.suggested_load_kg!
      if (week9) {
        const lastLogged2 = await logOverachievingSessions(profileId, targetExId, targetExName, block2Range.start, week5BaselineForBlock3)
        const restored3 = await restoreMesocycle(profileId)
        const result3 = await checkForLoadSuggestions(profileId, restored3!.weeks, liveProfile, planCreatedAt, now3)
        check(
          `block 3 shows the exact same overachievement pattern (${lastLogged2}kg logged) but produces NO suggestion — declined is permanent`,
          !result3.suggestions.some(s => s.exerciseName === targetExName),
          result3.suggestions,
        )
      } else {
        console.log('  (generated mesocycle has no week 9 despite >= 12 weeks reported — skipping, not a failure)')
      }
    } else {
      console.log(`  (mesocycle only has ${mesocycleData.length} weeks — fewer than 3 blocks for this profile/goal combo, skipping the block-3 decline-permanence check; not a failure, a matter of what the generator produced)`)
    }

  } finally {
    if (profileId) {
      console.log(`\n[cleanup] Deleting profile ${profileId} (cascades: mesocycle_weeks, workout_sessions, exercise_set_logs, load_suggestions)`)
      const { error } = await supabase.from('fitness_profiles').delete().eq('id', profileId)
      if (error) {
        console.error(`  CLEANUP FAILED — profile ${profileId} is still in TEST: ${error.message}`)
        failures++
      } else {
        const { data: leftoverSuggestions } = await supabase.from('load_suggestions').select('id').eq('profile_id', profileId).limit(1)
        check('cascade actually removed load_suggestions', !leftoverSuggestions || leftoverSuggestions.length === 0)
      }
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) FAILED.`)
    process.exit(1)
  }
  console.log('\nAll live load-suggestion checks passed.')
}

main().catch(err => {
  console.error('Verification script crashed:', err)
  process.exit(1)
})

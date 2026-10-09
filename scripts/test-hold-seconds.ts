/**
 * Hold durations are round, sayable numbers — and they still progress.
 *
 * L30, 9 Oct 2026, a tester's plan: "Plank 3x34-49s". Nobody counts to 34.
 *
 * WHERE IT CAME FROM. A hold starts at '30-45s' and was moved week to week by
 * `shiftReps`, which adds its REP delta to the seconds: the phase's rep_shift
 * (+3 in Anatomical Adaptation, -3 in Strength, -4 in Power) plus one per
 * week of the block. So a plank read 33-48s, 34-49s, 35-50s in one block and
 * 27-42s, 28-43s, 29-44s in another. That is the exact fault already fixed
 * for intervals ("produces un-coached numbers ('33s')", periodization.ts) —
 * a number calibrated for reps borrowed as seconds — left in place for holds.
 *
 * THE RULE (decided as a CSCS coach; basis in the BACKLOG entry): a hold
 * steps in 5-second blocks by week of the block — 30-45s, 35-50s, 40-55s —
 * and returns to its base on the deload. One second a week is below what
 * anyone can execute or feel, so it was noise, not overload; five seconds is
 * the smallest step a person can actually count and hold to. The phase's rep
 * shift no longer moves a hold at all: it trades reps against LOAD, and an
 * unloaded hold has no load to trade.
 *
 * This gate holds three things, and the third is what stops the easy fix
 * ("round it") from passing: a hold must still get LONGER through the block.
 */
import { generateExercisePlan, generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { getExerciseEntry } from '../src/lib/exercise-db'
import { stepHoldSeconds, shiftReps } from '../src/lib/periodization'
import type { UserProfile } from '../src/lib/types'

let failures = 0
let ran = 0
function check(label: string, ok: boolean, extra?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — got ${JSON.stringify(extra)}` : ''}`) }
}

const base = {
  age: 34, gender: 'male', height_cm: 180, weight_kg: 82, activity_level: 'moderate',
  preferred_time: 'evening', bmr: 1800, tdee: 2600, workout_split_preference: 'ai_recommendation',
  weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
  macro_calculation_mode: 'STANDARD_STATIC', coaching_persona: 'supportive',
  recovery_capacity: 'moderate', conditioning_preference: 'tolerate', created_at: '2026-10-05T00:00:00.000Z',
}
const days = (names: string[]) => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  .map(day => ({ day, available: names.includes(day) }))

// The profile the report came from first, then enough spread that every phase
// (and so every rep_shift, +4 to -4) is walked through.
const PROFILES: Array<{ label: string; p: UserProfile }> = []
PROFILES.push({
  label: 'the tester (minimalist, bodybuilding, shoulder flag, fat loss)',
  p: { ...base, fitness_goal: 'fat_loss', equipment_access: 'minimalist', injuries: ['shoulders'], training_style: 'bodybuilding',
    training_experience: 'intermediate', session_duration_preference: '30-45', max_dumbbell_kg: 24,
    training_days: days(['Monday', 'Tuesday', 'Thursday', 'Saturday']) } as unknown as UserProfile,
})
for (const equipment_access of ['bodyweight', 'minimalist', 'full_gym'])
  for (const fitness_goal of ['hypertrophy', 'strength', 'conditioning', 'functional'])
    for (const training_experience of ['beginner', 'advanced'])
      PROFILES.push({
        label: `${equipment_access}/${fitness_goal}/${training_experience}`,
        p: { ...base, fitness_goal, equipment_access, injuries: [], training_style: 'hybrid', training_experience,
          session_duration_preference: '45-60', training_days: days(['Monday', 'Wednesday', 'Friday', 'Saturday']) } as unknown as UserProfile,
      })

console.log('\n[1] The step itself')
check('week 1 is the base', stepHoldSeconds('30-45s', 1, false) === '30-45s', stepHoldSeconds('30-45s', 1, false))
check('week 2 is five seconds longer', stepHoldSeconds('30-45s', 2, false) === '35-50s', stepHoldSeconds('30-45s', 2, false))
check('week 3 is ten seconds longer', stepHoldSeconds('30-45s', 3, false) === '40-55s', stepHoldSeconds('30-45s', 3, false))
check('a deload goes back to the base — shorter than the week before it', stepHoldSeconds('30-45s', 4, true) === '30-45s', stepHoldSeconds('30-45s', 4, true))
check('a single figure steps the same way', stepHoldSeconds('30s', 3, false) === '40s', stepHoldSeconds('30s', 3, false))
check('something that is not seconds is not touched (null, so the caller decides)', stepHoldSeconds('40m', 2, false) === null && stepHoldSeconds('8-12', 2, false) === null)
// The backstop: whatever reaches the general shifter in seconds comes out sayable.
check('shiftReps can no longer hand back 34-49s', shiftReps('30-45s', 4, 5) === '35-50s', shiftReps('30-45s', 4, 5))
check('...and it still leaves a rep range exactly alone', shiftReps('8-12', 4, 5) === '12-16', shiftReps('8-12', 4, 5))

console.log('\n[2] Every hold in every week of every plan ends in 0 or 5')
const unsayable: string[] = []
const flat: string[] = []
const deloadNotEasier: string[] = []
let holds = 0
let blocksWithAHold = 0
for (const { label, p } of PROFILES) {
  setRandomSource(seededRngFromKey(`hold-seconds:${label}`))
  const meso = generateMesocycle(p, generateExercisePlan(p, []).plan)
  resetRandomSource()
  // name -> block -> week_in_block -> low seconds
  const seen = new Map<string, Map<number, { low: number; deload: boolean; wib: number }[]>>()
  for (const w of meso) for (const d of w.days) for (const e of d.exercises) {
    const entry = getExerciseEntry(e.name)
    if (entry?.prescription_type !== 'time') continue
    holds++
    const m = /^(\d+)(?:\s*-\s*(\d+))?s$/.exec(e.reps)
    if (!m) { unsayable.push(`${label} wk${w.week_number} ${e.name} "${e.reps}" (not seconds)`); continue }
    if (Number(m[1]) % 5 !== 0 || (m[2] && Number(m[2]) % 5 !== 0)) unsayable.push(`${label} wk${w.week_number} ${e.name} ${e.reps}`)
    if (entry.mechanics_tier === 'primer') continue
    const key = `${d.day}|${e.name}`
    const byBlock = seen.get(key) ?? new Map()
    const rows = byBlock.get(w.block_number ?? 0) ?? []
    rows.push({ low: Number(m[1]), deload: !!w.is_deload, wib: w.week_in_block ?? 0 })
    byBlock.set(w.block_number ?? 0, rows); seen.set(key, byBlock)
  }
  for (const [key, byBlock] of seen) for (const [block, rows] of byBlock) {
    const loading = rows.filter(r => !r.deload).sort((a, b) => a.wib - b.wib)
    if (loading.length < 2) continue
    blocksWithAHold++
    if (!(loading[loading.length - 1].low > loading[0].low)) flat.push(`${label} ${key} block ${block}: ${loading.map(r => r.low).join(',')}`)
    const deload = rows.find(r => r.deload)
    if (deload && !(deload.low < loading[loading.length - 1].low)) deloadNotEasier.push(`${label} ${key} block ${block}: last loading ${loading[loading.length - 1].low}s, deload ${deload.low}s`)
  }
}
check(`there were holds to look at (${holds} hold slots, ${blocksWithAHold} hold-blocks, ${PROFILES.length} plans)`, holds > 200 && blocksWithAHold > 30, { holds, blocksWithAHold })
check('no hold is prescribed in seconds nobody can count to', unsayable.length === 0, unsayable.slice(0, 6))
check('a working hold kept in a block for two or more loading weeks gets LONGER', flat.length === 0, flat.slice(0, 6))
check('...and its deload is shorter than the week before', deloadNotEasier.length === 0, deloadNotEasier.slice(0, 6))

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.error(`${failures} check(s) FAILED.`); process.exit(1) }
console.log('All hold-seconds checks passed.')

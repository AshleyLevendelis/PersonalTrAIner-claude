/**
 * Injury rebuild — the gate for "an injury that removes whole movement
 * patterns rebuilds the plan instead of gutting it."
 *
 * Pointwise substitution silently assumed an injury removes SOME exercises.
 * A shoulder injury removes every horizontal push, vertical push and vertical
 * pull in the pool, so every one of those slots was dropped with no
 * replacement — measured at 146 of ~190 slots on a real full_gym profile.
 * This asserts we detect that and produce a real plan instead.
 */
import { generateExercisePlan, generateMesocycle, getFlaggedJoints } from '../src/lib/exercise-plan'
import { substituteForInjury, assessAdaptation, rebuildForInjury, countSlots } from '../src/lib/plan-adaptations'
import { getExerciseEntry, isContraindicatedFor, isIndicatedFor } from '../src/lib/exercise-db'
import type { UserProfile } from '../src/lib/types'

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`) }
}

const profile = {
  age: 34, gender: 'male', height_cm: 178, weight_kg: 82, activity_level: 'moderate',
  fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1800, tdee: 2600,
  equipment_access: 'full_gym', injuries: [], training_style: 'hybrid',
  training_experience: 'intermediate', session_duration_preference: '45-60',
  workout_split_preference: 'ai_recommendation',
  training_days: [
    { day: 'Monday', available: true }, { day: 'Tuesday', available: true },
    { day: 'Wednesday', available: false }, { day: 'Thursday', available: true },
    { day: 'Friday', available: true }, { day: 'Saturday', available: false }, { day: 'Sunday', available: false },
  ],
  weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
  macro_calculation_mode: 'STANDARD_STATIC', coaching_persona: 'supportive',
  recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
  created_at: new Date().toISOString(),
} as unknown as UserProfile

async function main() {
  const plan = generateExercisePlan(profile, [])
  const meso = generateMesocycle(profile, plan.plan)
  const weekNumbers = meso.map(w => w.week_number)

  console.log('\n[1] A shoulder injury is detected as unviable for pointwise substitution')
  const sub = await substituteForInjury({ mesocycle: meso, profile, injuryCode: 'shoulders', weekNumbers, exclusions: [] })
  const totalSlots = countSlots(meso)
  const verdict = assessAdaptation(sub, totalSlots)
  console.log(`     touched=${verdict.touched} dropped=${verdict.dropped} planLoss=${(verdict.planLossRatio * 100).toFixed(1)}% of ${totalSlots}`)
  check('substitution deletes a material share of the whole plan', verdict.planLossRatio > 0.15)
  check('flagged shouldRebuild', verdict.shouldRebuild, verdict)

  console.log('\n[2] A neck injury (thins patterns, wipes none) is NOT flagged for rebuild')
  const subNeck = await substituteForInjury({ mesocycle: meso, profile, injuryCode: 'neck', weekNumbers, exclusions: [] })
  const verdictNeck = assessAdaptation(subNeck, totalSlots)
  console.log(`     touched=${verdictNeck.touched} dropped=${verdictNeck.dropped} planLoss=${(verdictNeck.planLossRatio*100).toFixed(1)}%`)
  check('a thinning injury does not trigger a rebuild', !verdictNeck.shouldRebuild, verdictNeck)

  console.log('\n[3] The rebuild produces a real plan, not a hollow one')
  const rebuilt = await rebuildForInjury({ profile, injuryCode: 'shoulders', exclusions: [], mesocycle: meso })
  const slotsBefore = meso.flatMap(w => w.days.flatMap(d => d.exercises)).length
  const slotsAfter = rebuilt.flatMap(w => w.days.flatMap(d => d.exercises)).length
  const survivingAfterSub = slotsBefore - verdict.dropped
  console.log(`     original=${slotsBefore}  after pointwise substitution=${survivingAfterSub}  after rebuild=${slotsAfter}`)
  check('rebuild keeps a comparable number of slots', slotsAfter >= slotsBefore * 0.8, { slotsBefore, slotsAfter })
  check('rebuild beats what substitution would have left', slotsAfter > survivingAfterSub, { slotsAfter, survivingAfterSub })

  console.log('\n[4] The rebuilt plan is actually safe for the injury')
  const shoulder = getFlaggedJoints(['shoulders'])
  const unsafe: string[] = []
  for (const w of rebuilt) for (const d of w.days) for (const ex of d.exercises) {
    const e = getExerciseEntry(ex.name)
    if (e && isContraindicatedFor(e, shoulder)) unsafe.push(`${ex.name} (wk${w.week_number} ${d.day})`)
  }
  check('no contraindicated movement anywhere in the rebuilt plan', unsafe.length === 0, unsafe.slice(0, 5))

  console.log('\n[5] The rebuild includes rehab work for the injured joint')
  const indicated = new Set<string>()
  for (const w of rebuilt) for (const d of w.days) for (const ex of d.exercises) {
    const e = getExerciseEntry(ex.name)
    if (e && isIndicatedFor(e, shoulder)) indicated.add(ex.name)
  }
  console.log(`     indicated movements present: ${[...indicated].join(', ') || '(none)'}`)
  check('at least one movement indicated FOR the shoulder is programmed', indicated.size > 0)

  console.log('\n[6] Week identity is preserved so existing references still resolve')
  check('week numbers unchanged', rebuilt.map(w => w.week_number).join() === meso.map(w => w.week_number).join())
  check('block numbers unchanged', rebuilt.map(w => w.block_number).join() === meso.map(w => w.block_number).join())
  check('labels unchanged', rebuilt.map(w => w.label).join() === meso.map(w => w.label).join())

  if (failures > 0) { console.error(`\n${failures} check(s) FAILED.`); process.exit(1) }
  console.log('\nAll injury-rebuild checks passed.')
}

main().catch(e => { console.error(e); process.exit(1) })

// ---------------------------------------------------------------------------
// THE SAME EXERCISE ALL BLOCK; THE MAIN LIFTS FOR THE WHOLE PLAN; ACCESSORIES CHANGE AT A NEW BLOCK (his ruling 16 Nov
// 2026, "All three as you suggest"; docs/plans/exercise-consistency.md). Seeded real plans across goals and experience,
// and the plan-quality score's rule proved on a plan that breaks it. Every check runs every time.
// ---------------------------------------------------------------------------
import { generateExercisePlan, generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { scorePlan } from '../src/lib/quality-score'
import { GOAL_POLICIES } from '../src/lib/goal-policies'
import { blockSwapLine } from '../src/lib/coach-voice'
import type { MesocycleWeek, UserProfile } from '../src/lib/types'

let ran = 0, failures = 0
function check(label: string, ok: boolean, extra?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — got ${JSON.stringify(extra).slice(0, 400)}` : ''}`) }
}
const days = (names: string[]) => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => ({ day, available: names.includes(day) }))
const base = { id: undefined, age: 34, gender: 'male', height_cm: 180, weight_kg: 82, activity_level: 'moderate', preferred_time: 'evening', bmr: 1800, tdee: 2600, workout_split_preference: 'ai_recommendation', weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [], macro_calculation_mode: 'STANDARD_STATIC', coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate', created_at: '2026-09-07T08:00:00.000Z', equipment_access: 'full_gym', injuries: [], session_duration_preference: '45-60' }
const build = (over: Record<string, unknown>, seed: string): { p: UserProfile; m: MesocycleWeek[] } => {
  const p = { ...base, ...over } as unknown as UserProfile
  setRandomSource(seededRngFromKey(seed))
  try { return { p, m: generateMesocycle(p, generateExercisePlan(p, []).plan) } } finally { resetRandomSource() }
}
const PROFILES = [
  { fitness_goal: 'hypertrophy', training_experience: 'intermediate', training_style: 'bodybuilding', training_days: days(['Monday', 'Wednesday', 'Friday']) },
  { fitness_goal: 'functional', training_experience: 'advanced', training_style: 'functional', training_days: days(['Monday', 'Tuesday', 'Thursday', 'Friday']) },
  { fitness_goal: 'fat_loss', training_experience: 'intermediate', training_style: 'hybrid', training_days: days(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']) },
  { fitness_goal: 'conditioning', training_experience: 'advanced', training_style: 'hybrid', training_days: days(['Monday', 'Wednesday', 'Friday', 'Saturday']) },
]
const plans = PROFILES.map((o, i) => build(o, `exercise-consistency|${i}`))

console.log('\n1. Inside a block: the same exercise every week, the deload included')
let inBlockPairs = 0
const inBlockChanges: string[] = []
for (const { m } of plans) for (const w of m) {
  const prev = m.find(x => x.week_number === w.week_number - 1)
  if (!prev || prev.block_number !== w.block_number) continue
  for (const d of w.days) {
    const pd = prev.days.find(x => x.day === d.day); if (!pd) continue
    const a = pd.exercises.map(e => e.name).join('|'), b = d.exercises.map(e => e.name).join('|')
    inBlockPairs++
    if (a !== b) inBlockChanges.push(`${d.day} wk${w.week_number}`)
  }
}
check('fixture: week pairs inside blocks were compared (4 plans, 4 blocks, 3 pairs a block)', inBlockPairs >= 4 * 4 * 3 * 3, inBlockPairs)
check('no day changes an exercise inside a block', inBlockChanges.length === 0, inBlockChanges.slice(0, 6))

console.log('\n2. Main lifts: the same in every block')
const mainChanges: string[] = []
let mainCompared = 0
for (const { m } of plans) {
  const firsts = m.filter(w => w.week_in_block === 1)
  const w1 = firsts[0]
  for (const d of w1.days) {
    const main = d.exercises.find(e => e.tier === 'tier_1_primary')?.name; if (!main) continue
    for (const fw of firsts.slice(1)) {
      const other = fw.days.find(x => x.day === d.day)?.exercises.find(e => e.tier === 'tier_1_primary')?.name
      mainCompared++
      if (other !== main) mainChanges.push(`${d.day}: ${main} -> ${other}`)
    }
  }
}
check('fixture: main lifts were compared across blocks', mainCompared >= 12, mainCompared)
check('every main lift is the same in every block', mainChanges.length === 0, mainChanges.slice(0, 6))

console.log('\n3. Accessories still change at a new block')
let boundaryChanged = 0
for (const { m } of plans) for (const w of m.filter(x => x.week_in_block === 1 && x.week_number > 1)) {
  const prev = m.find(x => x.week_number === w.week_number - 1)!
  for (const d of w.days) {
    const pd = prev.days.find(x => x.day === d.day); if (!pd) continue
    for (const e of d.exercises) if ((e.tier === 'tier_2_secondary' || e.tier === 'tier_3_isolation') && !pd.exercises.some(pe => pe.name === e.name)) boundaryChanged++
  }
}
check('accessories rotate at block boundaries (VISION: variations rotate)', boundaryChanged >= 10, boundaryChanged)

console.log('\n4. The plan-quality score holds the same rule')
const sel = (p: UserProfile, m: MesocycleWeek[]) => scorePlan(p, m, 'consistency', { skipComparisons: true }).dimensions.selection.deductions.map(d => d.rule)
const clean = plans.flatMap(({ p, m }) => sel(p, m))
check('none of the real plans is marked down for an exercise changing inside a block or a main lift changing', !clean.includes('exercise_changed_within_block') && !clean.includes('main_lift_changed_between_blocks'), clean)
check('...and the old rule rewarding mid-block swaps is gone', !clean.includes('accessory_never_rotates'))
// Prove the detectors: the same plan with week 3's second exercise renamed, and a later block's main lift renamed.
const { p: p0, m: m0 } = plans[0]
const broken = JSON.parse(JSON.stringify(m0)) as MesocycleWeek[]
const wk3 = broken.find(w => w.week_number === 3)!
wk3.days[0].exercises[1] = { ...wk3.days[0].exercises[1], name: 'Cable Lateral Raise Different' }
check('a plan with an exercise renamed at week 3 is marked down', sel(p0, broken).includes('exercise_changed_within_block'), sel(p0, broken))
const broken2 = JSON.parse(JSON.stringify(m0)) as MesocycleWeek[]
const b2 = broken2.find(w => w.week_in_block === 1 && w.block_number === 2)!
const mi = b2.days[0].exercises.findIndex(e => e.tier === 'tier_1_primary')
if (mi >= 0) for (const w of broken2.filter(x => x.block_number === 2)) { const d = w.days.find(x => x.day === b2.days[0].day)!; d.exercises[mi] = { ...d.exercises[mi], name: 'Some Other Main Lift' } }
check('a plan whose main lift changes at block 2 is marked down', mi >= 0 && sel(p0, broken2).includes('main_lift_changed_between_blocks'), sel(p0, broken2))

console.log('\n5. What the app says')
check('no goal promises that exercises "rotate faster"', Object.values(GOAL_POLICIES).every(g => !/rotate faster/.test(`${(g as { coachNote?: string }).coachNote ?? ''} ${(g as { coachNoteLoadless?: string }).coachNoteLoadless ?? ''}`)))
check('a whole-block swap ends when "some exercises change"', /when your next block starts and some exercises change\.$/.test(blockSwapLine('Mon 5 Oct')), blockSwapLine('Mon 5 Oct'))

console.log(`\n${ran} checks ran, ${failures} failed.`)
process.exit(failures > 0 ? 1 : 0)

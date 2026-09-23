// ---------------------------------------------------------------------------
// WHICH EXERCISES REPEAT IDENTICALLY, AND WHY.  A measurement, not a gate.
//
// test:quality prints its frozen-week findings but caps the list, and the
// last run had Russian Twist on 120 of the 216 lines it showed. That is a
// sample of a sample. This sweeps the same 9,216-plan grid, applies the
// SAME frozen_week rule quality-score.ts applies (consecutive non-deload
// weeks in a block, same day, same slot, same exercise, load unchanged —
// null counts as unchanged against null — and reps unchanged; primers and
// steady-state cardio exempt), and then does the thing the scorer does not:
// says WHY each frozen pair is frozen, by reading the catalogue entry.
//
//   tagged_loaded_no_kg  the equipment tag says "loaded" (medicine ball,
//                        backpack, dumbbell...) so exercise-plan.ts treats it
//                        as a weight-ramping exercise, but categorize() gives
//                        it no load anchor, so no kg is ever prescribed —
//                        nothing to ramp AND excluded from the rep ramp.
//                        This is the Russian Twist case.
//   bodyweight_no_kg     not tagged loaded, no kg, reps still did not move —
//                        the rep ramp applied and something swallowed it
//                        (the experience min_reps clamp under a negative
//                        phase shift is the known one).
//   loaded_kg_frozen     a kg is prescribed and it did not move, and neither
//                        did reps — the frozen-load rep bump declined or
//                        could not move the range (implement ceilings).
//
// Every 101st plan is also scored by quality-score's own scorePlan and its
// frozen_week deduction count compared with this script's count for the
// same plan. If the mirror drifts from the scorer, that comparison fails
// loudly rather than letting this report describe a rule the gate does not
// apply.
//
// Usage:  npx tsx scripts/measure-frozen-exercises.ts [--stride=N]
// ---------------------------------------------------------------------------
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { scorePlan } from '../src/lib/quality-score'
import { buildProfile, comboKey, generateAllCombinations, ALL_GOALS } from './quality-grid'
import { frozenPairs, causeOf } from './frozen-pairs'
import type { MesocycleWeek } from '../src/lib/types'

// The grid and the rule both used to be spelled out here. The grid moved to
// quality-grid.ts on 18 Sep 2026 and this file kept its own field-for-field
// copy; the rule moved to frozen-pairs.ts on 19 Sep 2026 when the lever audit
// needed the same one. Both are imports now for the same reason: two copies of
// a denominator is how two measurements of one question quietly stop being
// comparable. Section 4 below still cross-checks the rule against the scorer.

// --- sweep -----------------------------------------------------------------
const bump = (m: Map<string, number>, k: string, n = 1) => m.set(k, (m.get(k) ?? 0) + n)
const stride = Math.max(1, Number((process.argv.find(a => a.startsWith('--stride=')) ?? '--stride=1').split('=')[1]) || 1)
const combos = generateAllCombinations()
const sampled = combos.filter((_, i) => i % stride === 0)
console.log(`Frozen exercises — ${combos.length} combinations in the grid, sweeping ${sampled.length}${stride > 1 ? ` (every ${stride}th)` : ''}\n`)

const pairsByCause = new Map<string, number>()
const pairsByName = new Map<string, number>()
const causeByName = new Map<string, Cause>()
const plansByCause = new Map<string, number>()
const plansByGoalCause = new Map<string, number>()
const plansByName = new Map<string, number>()
let plansWithAny = 0, totalPairs = 0, mismatches = 0, crossChecked = 0
const start = performance.now()
const realLog = console.log

sampled.forEach((combo, i) => {
  const key = comboKey(combo)
  setRandomSource(seededRngFromKey(key))
  console.log = () => {}
  let meso: MesocycleWeek[]
  try { meso = generateMesocycle(buildProfile(combo)) } finally { console.log = realLog }
  resetRandomSource()

  const pairs = frozenPairs(meso)
  totalPairs += pairs.length
  if (pairs.length > 0) plansWithAny++
  const causesHere = new Set<Cause>(), namesHere = new Set<string>()
  for (const p of pairs) {
    const cause = causeOf(p)
    bump(pairsByCause, cause); bump(pairsByName, p.name); causeByName.set(p.name, cause)
    causesHere.add(cause); namesHere.add(p.name)
  }
  for (const c of causesHere) { bump(plansByCause, c); bump(plansByGoalCause, `${combo.goal}|${c}`) }
  for (const n of namesHere) bump(plansByName, n)

  if (i % 101 === 0) {
    crossChecked++
    const scored = scorePlan(buildProfile(combo), meso, key)
    const scorerCount = scored.dimensions.progression.deductions.filter(d => d.rule === 'frozen_week').length
    if (scorerCount !== pairs.length) { mismatches++; console.error(`  MIRROR MISMATCH ${key}: scorer ${scorerCount} vs mirror ${pairs.length}`) }
  }
  if ((i + 1) % Math.max(1, Math.floor(sampled.length / 10)) === 0)
    console.log(`  ${i + 1}/${sampled.length} plans (${Math.round((performance.now() - start) / 1000)}s)`)
})

const pct = (n: number, d: number) => d === 0 ? '–' : `${(100 * n / d).toFixed(1)}%`
console.log(`\n${'='.repeat(78)}\n1. How many plans carry a frozen exercise (of ${sampled.length})\n${'='.repeat(78)}`)
console.log(`  plans with at least one frozen pair: ${plansWithAny} (${pct(plansWithAny, sampled.length)});  frozen pairs in total: ${totalPairs}`)
for (const c of [...new Set([...plansByCause.keys(), ...pairsByCause.keys()])].sort((a, b) => (pairsByCause.get(b) ?? 0) - (pairsByCause.get(a) ?? 0))) {
  const pl = plansByCause.get(c) ?? 0, pr = pairsByCause.get(c) ?? 0
  if (pl === 0 && pr === 0) continue
  console.log(`  ${c.padEnd(30)} plans ${String(pl).padStart(5)} (${pct(pl, sampled.length).padStart(5)})   pairs ${String(pr).padStart(6)} (${pct(pr, totalPairs)} of all frozen pairs)`)
}

console.log(`\n${'='.repeat(78)}\n2. By goal — which goals' plans carry each cause\n${'='.repeat(78)}`)
const perGoal = sampled.length / ALL_GOALS.length
for (const g of ALL_GOALS) {
  const parts = ['tagged_loaded_no_kg', 'bodyweight_no_kg', 'loaded_carry', 'loaded:ceiling/range_fixed', 'loaded:ceiling/capped', 'loaded:matched/-'].map(c => `${c} ${pct(plansByGoalCause.get(`${g}|${c}`) ?? 0, perGoal)}`)
  console.log(`  ${g.padEnd(13)} ${parts.join('   ')}`)
}

console.log(`\n${'='.repeat(78)}\n3. The exercises, by frozen pairs (plans = plans containing that exercise frozen at least once)\n${'='.repeat(78)}`)
const names = [...pairsByName.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
for (const [n, pairs] of names)
  console.log(`  ${n.padEnd(34)} ${String(pairs).padStart(6)} pairs   ${String(plansByName.get(n) ?? 0).padStart(5)} plans   ${causeByName.get(n)}`)

console.log(`\n${'='.repeat(78)}\n4. Mirror check against quality-score's own scorer\n${'='.repeat(78)}`)
console.log(`  ${crossChecked} plans scored both ways; mismatches: ${mismatches}${mismatches === 0 ? ' — the rule above is the gate\'s rule' : '  <<< THIS REPORT DESCRIBES A DIFFERENT RULE FROM THE GATE'}`)
console.log(`\nDone in ${Math.round((performance.now() - start) / 1000)}s. Measurement only; nothing changed.\n`)
if (mismatches > 0) process.exit(1)

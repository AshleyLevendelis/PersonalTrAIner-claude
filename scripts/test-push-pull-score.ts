import { generateMesocycle, setRandomSource, resetRandomSource, getConstrainedPool } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { scorePlan } from '../src/lib/quality-score'
import { buildProfile, comboKey, type Combination } from './quality-grid'

// ---------------------------------------------------------------------------
// A PULL-HEAVY WEEK IS NOT A FLAW WHEN THERE WAS ONLY ONE PRESS TO BE HAD.
//
// Ashley's ruling, 24 Sep 2026, from three options: don't count it — over
// keeping the flag, and over cutting pulling to match. Measured that day on
// the 9,216-profile grid: 366 of the scorer's 379 push:pull flags were
// pull-heavy plans whose injuries left exactly ONE pressing exercise (a wrist
// injury removes every push-up; a sore shoulder most presses). The generator
// had already done all it could — the one press at its ceiling, every pull at
// its floor — and a coach would sign that plan: when pressing is what hurts,
// pulling more than you press is the prescription.
//
// ALL THREE DIRECTIONS ARE HELD, because an exemption that is too wide is the
// failure that nothing else would notice — the score just gets quietly
// kinder. Each case is a measured grid plan, seeded with its own key the way
// the grid seeds it, and each first proves it is ACTUALLY in the state the
// rule is about, so none of them can pass by being balanced.
// ---------------------------------------------------------------------------

let failures = 0
let ran = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}

function planFor(key: string) {
  const [equipment, inj, duration, style, experience, goal, recovery, conditioningPref] = key.split('|')
  const combo = { equipment, injuries: inj === 'none' ? [] : inj.split('+'), duration, style, experience, goal, recovery, conditioningPref } as unknown as Combination
  const profile = buildProfile(combo)
  setRandomSource(seededRngFromKey(key))
  const meso = generateMesocycle(profile)
  resetRandomSource()
  return { profile, meso }
}
const isPress = (p: string) => p === 'horizontal_push' || p === 'vertical_push'
const flaggedIn = (r: ReturnType<typeof scorePlan>) => Object.values(r.dimensions).some(d => d.deductions.some(x => x.rule === 'push_pull_imbalance'))

function measure(key: string) {
  const [equipment, inj, duration, style, experience, goal, recovery, conditioningPref] = key.split('|')
  const combo = { equipment, injuries: inj === 'none' ? [] : inj.split('+'), duration, style, experience, goal, recovery, conditioningPref } as unknown as Combination
  if (comboKey(combo) !== key) throw new Error(`key did not round-trip: ${key}`)
  const profile = buildProfile(combo)
  setRandomSource(seededRngFromKey(key))
  const meso = generateMesocycle(profile)
  resetRandomSource()
  let push = 0, pull = 0
  for (const d of meso[0].days) for (const ex of d.exercises) {
    if (ex.movement_pattern === 'push') push += ex.sets
    if (ex.movement_pattern === 'pull') pull += ex.sets
  }
  const presses = getConstrainedPool(profile, []).filter(e => e.movement_pattern === 'horizontal_push' || e.movement_pattern === 'vertical_push').length
  const result = scorePlan(profile, meso, key)
  const flagged = Object.values(result.dimensions).some(d => d.deductions.some(x => x.rule === 'push_pull_imbalance'))
  return { push, pull, ratio: pull > 0 ? push / pull : NaN, presses, flagged }
}

console.log('\n[1] pull-heavy, and the injury left one press — not a flaw')
{
  const m = measure('minimalist|shoulders|30-45|hybrid|beginner|hypertrophy|low|avoid')
  check('the plan really is pull-heavy (so the rule is being asked, not skipped)', m.ratio < 0.6, m)
  check('...and its pool really holds only one pressing exercise', m.presses <= 1, m)
  check('...and the score does not count it against the plan', m.flagged === false, m)
}

console.log('\n[2] pull-heavy while a second press existed — still a flaw')
// CONSTRUCTED SINCE 14 NOV 2026, the way [3] and [4] are. This was a measured grid plan (bodyweight, no injuries,
// hybrid, advanced) whose pull-ups and inverted rows outnumbered its presses. "Bodyweight only" now starts with no
// pull-up bar (his ruling that day), and a search of a third of the hybrid and bodybuilding plans found none
// pull-heavy with two presses to hand. The property is the same: the one-press exemption must not excuse a week whose
// pool held a second press, so the grid plan's own week has its pulling raised and nothing else moved.
const pullHeavy = (key: string) => {
  const { profile, meso } = planFor(key)
  const week1 = { ...meso[0], days: meso[0].days.map(d => ({ ...d, exercises: d.exercises.map(e => (e.movement_pattern === 'pull' ? { ...e, sets: e.sets * 3 } : e)) })) }
  return { profile, meso: [week1, ...meso.slice(1)] }
}
const PULL_KEY = 'full_gym|none|45-60|hybrid|advanced|fat_loss|moderate|love'
{
  const { profile, meso } = pullHeavy(PULL_KEY)
  let push = 0, pull = 0
  for (const d of meso[0].days) for (const e of d.exercises) { if (e.movement_pattern === 'push') push += e.sets; if (e.movement_pattern === 'pull') pull += e.sets }
  const presses = getConstrainedPool(profile, []).filter(e => isPress(e.movement_pattern)).length
  check('the plan really is pull-heavy', pull > 0 && push / pull < 0.6, { push, pull })
  check('...with more than one press it could have used', presses >= 2, presses)
  check('...so the score still counts it', flaggedIn(scorePlan(profile, meso, PULL_KEY)))
}

console.log('\n[3] push-heavy — the direction that costs a shoulder — still a flaw')
// CONSTRUCTED SINCE 3 NOV 2026, the way [4] is. This was a measured grid plan (full gym, shoulders and wrists,
// hybrid, advanced, conditioning) at 1.7:1. The dumbbell pack (docs/plans/dumbbell-pack.md) re-rolled its picks to
// 4:3, and a search of the 2,048 hybrid plans with an injury found none push-heavy any more. The property is the
// same: a week pressing far more than it pulls is counted whatever the pool, so the grid plan's own week has its
// pressing raised and nothing else moved.
{
  const key = 'full_gym|shoulders+wrists|45-60|hybrid|advanced|conditioning|moderate|love'
  const { profile, meso } = planFor(key)
  const week1 = { ...meso[0], days: meso[0].days.map(d => ({ ...d, exercises: d.exercises.map(e => (e.movement_pattern === 'push' ? { ...e, sets: e.sets * 3 } : e)) })) }
  let push = 0, pull = 0
  for (const d of week1.days) for (const e of d.exercises) { if (e.movement_pattern === 'push') push += e.sets; if (e.movement_pattern === 'pull') pull += e.sets }
  const presses = getConstrainedPool(profile, []).filter(e => isPress(e.movement_pattern)).length
  check('the plan really is push-heavy', pull > 0 && push / pull > 1.6, { push, pull })
  check('...on a pool with more than one press, so the one-press exemption cannot be what decides it', presses >= 2, presses)
  check('...and the score counts it', flaggedIn(scorePlan(profile, [week1, ...meso.slice(1)], key)))
}

// THE TWO BOUNDARIES NO GRID PLAN HAPPENS TO SIT ON, so they are built:
// the plan is the grid's own; only the input the rule reads is moved.
console.log('\n[4] push-heavy with only one press is STILL a flaw — the exemption is for one direction')
{
  const key = 'minimalist|shoulders|30-45|hybrid|beginner|hypertrophy|low|avoid'
  const { profile, meso } = planFor(key)
  const week1 = { ...meso[0], days: meso[0].days.map(d => ({ ...d, exercises: d.exercises.map(e => (e.movement_pattern === 'push' ? { ...e, sets: 20 } : e)) })) }
  let push = 0, pull = 0
  for (const d of week1.days) for (const e of d.exercises) { if (e.movement_pattern === 'push') push += e.sets; if (e.movement_pattern === 'pull') pull += e.sets }
  const presses = getConstrainedPool(profile, []).filter(e => isPress(e.movement_pattern)).length
  check('the constructed week is push-heavy on a one-press pool', push / pull > 1.6 && presses <= 1, { push, pull, presses })
  check('...and the score counts it', flaggedIn(scorePlan(profile, [week1, ...meso.slice(1)], key)))
}

console.log('\n[5] the line is ONE press — two is a choice the plan could have used')
{
  const key = PULL_KEY
  const { profile, meso } = pullHeavy(key)
  // BANNED UNTIL THE COUNT IS TRUE, not sliced once: banning presses starves
  // the pattern, and the style floor then re-admits one the first list never
  // held — found by the sanity check below reading 3 where it asked for 2.
  const pressesIn = (ex: string[]) => getConstrainedPool(profile, ex).filter(e => isPress(e.movement_pattern)).map(e => e.name)
  const leaving = (n: number) => {
    const ex: string[] = []
    for (let guard = 0; guard < 40; guard++) {
      const left = pressesIn(ex)
      if (left.length <= n) break
      ex.push(left[left.length - 1])
    }
    return ex
  }
  const two = pressesIn(leaving(2)).length
  const one = pressesIn(leaving(1)).length
  check('banning presses can leave exactly two, and exactly one', two === 2 && one === 1, { two, one, of: pressesIn([]).length })
  check('with two presses available, the pull-heavy week still counts', flaggedIn(scorePlan(profile, meso, key, { exclusions: leaving(2) })))
  check('with one, it does not', !flaggedIn(scorePlan(profile, meso, key, { exclusions: leaving(1) })))
}

console.log('')
console.log(`push-pull-score: ${ran} checks ran`)
if (failures > 0) {
  console.error(`push-pull-score: ${failures} check(s) failed`)
  process.exit(1)
}
console.log('push-pull-score: all checks passed')

// ---------------------------------------------------------------------------
// A COMPOUND THE WEEK-BALANCE PASS ADDS GOES IN WITH THE COMPOUNDS, AND A SMITH LIFT IS A MAIN LIFT (23 Nov 2026, CSCS;
// his Push & Press day: Neutral-Grip Dumbbell Press was added after lateral raises and skull crushers, and the MAIN
// LIFT label went to it over the 90 kg Smith bench that opened the day). Measured on every 8th grid plan: compound
// after muscle isolation 735 days -> 88 of 4,608 (the 88 are knee-rehab days, by design). One exit, at the bottom.
// ---------------------------------------------------------------------------
import { generateExercisePlan, setRandomSource, resetRandomSource, isWeekSupportLeg } from '../src/lib/exercise-plan'
import { getExerciseEntry } from '../src/lib/exercise-db'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { dayAnchorExercise } from '../src/lib/session-derive'
import { buildProfile, comboKey, generateAllCombinations } from './quality-grid'
import type { Exercise } from '../src/lib/types'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail: unknown = '') => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail === '' ? '' : ` — ${JSON.stringify(detail).slice(0, 600)}`}`) }
}
const quiet = <T,>(fn: () => T): T => {
  const d = console.debug, w = console.warn, l = console.log
  console.debug = () => {}; console.warn = () => {}; console.log = () => {}
  try { return fn() } finally { console.debug = d; console.warn = w; console.log = l }
}
const en = (n: string) => getExerciseEntry(n)
const isCompound = (n: string) => { const e = en(n); return !!e && (e.mechanics_tier === 'tier1_compound' || e.mechanics_tier === 'tier2_compound') && e.movement_pattern !== 'core' && e.movement_pattern !== 'carry' }
const isLaterWork = (n: string) => { const e = en(n); return !!e && e.mechanics_tier !== 'primer' && !isCompound(n) }

// 1. Every compound the balance pass ADDED sits before the day's first isolation / finisher / trunk move.
let added = 0, misplaced = 0, pushPressAdds = 0
const bad: string[] = []
const combos = generateAllCombinations().filter((_, i) => i % 16 === 0)
for (const c of combos) {
  const r = quiet(() => { setRandomSource(seededRngFromKey(comboKey(c))); try { return generateExercisePlan(buildProfile(c)) } finally { resetRandomSource() } })
  for (const t of r.constraint_trace.structure_adjusted) {
    const m = /added "(.+?)" to (\w+)/.exec(t.reason)
    if (!m || !isCompound(m[1])) continue
    const day = r.plan.find(d => d.day === m[2])
    const list = day?.exercises ?? []
    const at = list.findIndex(e => e.name === m[1])
    if (at === -1 || !day) continue
    const entry = en(m[1])!
    if (isWeekSupportLeg(day.focus, entry)) continue
    added++
    if (/Push/.test(day.focus) && entry.movement_pattern.endsWith('push')) pushPressAdds++
    // THE PROPERTY, NOT THE OLD MECHANISM (26 Nov 2026). This read "nothing that is not a compound sits before it",
    // which is what the pass did and also what was wrong with it: on an injured day the rehab drill sits straight after
    // the warm-up, so the only way to satisfy the check was to put the added press AHEAD of the Bird Dog and the bench
    // press. The check was enforcing the defect. What a coach means: the added compound follows the day's other
    // compounds with no isolation, finisher or trunk work between them, and never leads them. Prep in front of the
    // day's first compound (a rehab drill) is not "later work".
    const firstCompound = list.findIndex((e, i) => i !== at && isCompound(e.name))
    const wrong = firstCompound === -1
      ? list.slice(0, at).some(e => isLaterWork(e.name))
      : at < firstCompound || list.slice(firstCompound, at).some(e => isLaterWork(e.name))
    if (wrong) { misplaced++; if (bad.length < 3) bad.push(`${day.focus}: ${list.map(e => e.name).join(' > ')}`) }
  }
}
check(`1a. the grid sample reaches the pass: compounds were added (${added}), presses among them on push days (${pushPressAdds})`, added >= 20 && pushPressAdds >= 5, { added, pushPressAdds })
check('1b. none of them sits after isolation, finisher or trunk work', misplaced === 0, { misplaced, bad })

// 2. The label: his day, as drawn on his phone.
const row = (name: string, tier: Exercise['tier']): Exercise => ({ name, sets: 3, reps: '9-11', rest: '90s', tier } as Exercise)
const hisDay = [
  row('Arm Circles', 'tier_0_primer'), row('Smith Machine Bench Press', 'tier_2_secondary'), row('Push Press', 'tier_2_secondary'),
  row('Lateral Raises', 'tier_3_isolation'), row('Skull Crushers', 'tier_3_isolation'), row('Neutral-Grip Dumbbell Press', 'tier_2_secondary'),
]
check('2a. his Push & Press day: the Smith bench that opens it is the main lift', dayAnchorExercise(hisDay)?.name === 'Smith Machine Bench Press', dayAnchorExercise(hisDay)?.name)
// One candidate cannot test a choice: the harder lift still wins when it is the one written first.
const swapped = [hisDay[0], hisDay[5], hisDay[2], hisDay[3], hisDay[4], hisDay[1]]
check('2b. ...and with the dumbbell press first, it is the dumbbell press (a tie goes to the earlier lift)', dayAnchorExercise(swapped)?.name === 'Neutral-Grip Dumbbell Press', dayAnchorExercise(swapped)?.name)
const smithSquat = [row('Leg Swings', 'tier_0_primer'), row('Smith Machine Squat', 'tier_2_secondary'), row('Walking Lunges', 'tier_2_secondary'), row('Leg Extensions', 'tier_3_isolation')]
check('2c. a Smith squat outranks walking lunges written before it would', dayAnchorExercise([smithSquat[0], smithSquat[2], smithSquat[1], smithSquat[3]])?.name === 'Smith Machine Squat')

console.log(`\n${ran} checks ran, ${failures} failed`)
if (failures > 0) process.exit(1)

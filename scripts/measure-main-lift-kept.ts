// ---------------------------------------------------------------------------
// DOES THE LIFT LABELLED "MAIN LIFT" STAY FOR THE WHOLE PLAN? (25 Nov 2026, the 826 named in BACKLOG under the
// compound-order entry.) His 16 Nov ruling: main lifts are kept for the whole plan, accessories change at a new block.
// The label (session-derive's mainLiftGroupIndex) and the block rotation (classifyRotationTiers) used two definitions,
// so on a day with no tier-1 lift the labelled lift could be rotated away as an accessory. For every 8th grid profile,
// seeded: each day of block 1's first loading week against the same day of block 2's first loading week. Counted: the
// day's label in block 1 is a lift block 2 no longer has on that day.
// ---------------------------------------------------------------------------
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { groupExercises, mainLiftGroupIndex } from '../src/lib/session-derive'
import { buildProfile, comboKey, generateAllCombinations } from './quality-grid'

const quiet = <T,>(fn: () => T): T => {
  const d = console.debug, w = console.warn, l = console.log
  console.debug = () => {}; console.warn = () => {}; console.log = () => {}
  try { return fn() } finally { console.debug = d; console.warn = w; console.log = l }
}
const labelOf = (ex: { name: string }[]) => {
  const groups = groupExercises(ex as never)
  const mi = mainLiftGroupIndex(groups, ex as never)
  const g = mi >= 0 ? groups[mi] : null
  return g && g.kind === 'single' ? g.ex.name : null
}
let plans = 0, compared = 0, labelGone = 0, labelMoved = 0
const examples: string[] = []
for (const c of generateAllCombinations().filter((_, i) => i % 8 === 0)) {
  const plan = quiet(() => { setRandomSource(seededRngFromKey(comboKey(c))); try { return generateMesocycle(buildProfile(c)) } finally { resetRandomSource() } })
  plans++
  const firstLoading = (b: number) => plan.find(w => (w.block_number ?? 1) === b && !w.is_deload)
  const w1 = firstLoading(1), w2 = firstLoading(2)
  if (!w1 || !w2) continue
  for (const d1 of w1.days) {
    const d2 = w2.days.find(d => d.day === d1.day)
    if (!d2 || d1.exercises.length === 0) continue
    const l1 = labelOf(d1.exercises)
    if (!l1) continue
    compared++
    if (!d2.exercises.some(e => e.name === l1)) { labelGone++; if (examples.length < 6) examples.push(`${d1.focus}: ${l1} -> label ${labelOf(d2.exercises)} | block 2: ${d2.exercises.map(e => e.name).join(' > ')}`) }
    else if (labelOf(d2.exercises) !== l1) labelMoved++
  }
}
console.log(`${plans} plans, ${compared} labelled days compared, block 1 against block 2`)
console.log(`the labelled main lift is gone from that day in block 2: ${labelGone}`)
console.log(`...still there but no longer labelled main: ${labelMoved}`)
for (const e of examples) console.log(`  e.g. ${e}`)

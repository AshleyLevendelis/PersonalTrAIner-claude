// ---------------------------------------------------------------------------
// HOW OFTEN A DAY PUTS A COMPOUND LIFT AFTER ISOLATION WORK, AND HOW OFTEN THE "MAIN LIFT" LABEL SITS ON A DIFFERENT
// LIFT FROM THE ONE THE PLAN TREATS AS MAIN (23 Nov 2026, his Push & Press day: the press the week-balance pass added
// was written after lateral raises and skull crushers, and labelled MAIN LIFT). Every 8th grid profile, seeded.
// ---------------------------------------------------------------------------
import { generateMesocycle, setRandomSource, resetRandomSource, isWeekSupportLeg } from '../src/lib/exercise-plan'
import { getExerciseEntry } from '../src/lib/exercise-db'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { groupExercises, mainLiftGroupIndex } from '../src/lib/session-derive'
import { buildProfile, comboKey, generateAllCombinations } from './quality-grid'

const quiet = <T,>(fn: () => T): T => {
  const d = console.debug, w = console.warn, l = console.log
  console.debug = () => {}; console.warn = () => {}; console.log = () => {}
  try { return fn() } finally { console.debug = d; console.warn = w; console.log = l }
}
const tierOf = (n: string) => getExerciseEntry(n)?.mechanics_tier
const isCompound = (n: string) => tierOf(n) === 'tier1_compound' || tierOf(n) === 'tier2_compound'
let days = 0, compoundAfterIso = 0, labelNotFirstCompound = 0, labelled = 0, plans = 0
const examples: string[] = []
const labelExamples: string[] = []
const combos = generateAllCombinations().filter((_, i) => i % 8 === 0)
for (const c of combos) {
  const plan = quiet(() => { setRandomSource(seededRngFromKey(comboKey(c))); try { return generateMesocycle(buildProfile(c)) } finally { resetRandomSource() } })
  plans++
  for (const d of (plan.find(w => !w.is_deload)?.days ?? [])) {
    const ex = d.exercises
    if (ex.length === 0) continue
    days++
    // Isolation of a muscle (a raise, an extension, a curl), not trunk work and not a rehab drill the injury pass puts first: a dead bug before a split squat tires nothing it
    // needs.
    const firstIso = ex.findIndex(e => { const en = getExerciseEntry(e.name); return en?.mechanics_tier === 'tier3_isolation' && en.movement_pattern !== 'core' && en.movement_pattern !== 'carry' && !(en.indicated_joints?.length) })
    // The week's leg-support move closes an upper day on purpose (it tires nothing the day trained), so it is not counted.
    const late = firstIso >= 0 && ex.slice(firstIso).some(e => {
      const en = getExerciseEntry(e.name)
      return !!en && isCompound(e.name) && en.movement_pattern !== 'core' && en.movement_pattern !== 'carry' && !e.superset_label && !isWeekSupportLeg(d.focus, en)
    })
    if (late) { compoundAfterIso++; if (examples.length < 4) examples.push(`${d.day} ${d.focus}: ${ex.map(e => e.name).join(' > ')}`) }
    const groups = groupExercises(ex)
    const mi = mainLiftGroupIndex(groups, ex)
    if (mi >= 0) {
      labelled++
      const g = groups[mi]
      const labelName = g.kind === 'single' ? g.ex.name : ''
      const firstComp = ex.find(e => isCompound(e.name) && getExerciseEntry(e.name)?.mechanics_tier === tierOf(labelName))
      if (firstComp && firstComp.name !== labelName) { labelNotFirstCompound++; if (labelExamples.length < 6) labelExamples.push(`${d.focus}: label ${labelName} | ${ex.map(e => e.name).join(' > ')}`) }
    }
  }
}
console.log(`${plans} plans, ${days} training days`)
console.log(`compound lift written after isolation work: ${compoundAfterIso} days (${(100 * compoundAfterIso / days).toFixed(1)}%)`)
console.log(`"Main lift" label not on the day's first lift of its tier: ${labelNotFirstCompound} of ${labelled} labelled days`)
for (const e of examples) console.log(`  e.g. ${e}`)
for (const e of labelExamples) console.log(`  label: ${e}`)

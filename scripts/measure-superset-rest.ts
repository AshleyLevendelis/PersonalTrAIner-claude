// ---------------------------------------------------------------------------
// DO SUPERSETS SAVE TIME AFTER WEEK 1? (25 Nov 2026, BACKLOG 15 Nov: a partner's 'alternate' rest was overwritten with
// a full rest in every week after the base plan, at every length but 20-30.) Every 8th grid plan, seeded: superset
// partners in loading weeks 2+ whose rest is still 'alternate', against those given a full rest of their own.
// ---------------------------------------------------------------------------
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { buildProfile, comboKey, generateAllCombinations } from './quality-grid'

const quiet = <T,>(fn: () => T): T => {
  const d = console.debug, w = console.warn, l = console.log
  console.debug = () => {}; console.warn = () => {}; console.log = () => {}
  try { return fn() } finally { console.debug = d; console.warn = w; console.log = l }
}
const byLength = new Map<string, { alt: number; full: number }>()
for (const c of generateAllCombinations().filter((_, i) => i % 8 === 0)) {
  const p = buildProfile(c)
  const plan = quiet(() => { setRandomSource(seededRngFromKey(comboKey(c))); try { return generateMesocycle(p) } finally { resetRandomSource() } })
  const tally = byLength.get(p.session_duration_preference) ?? { alt: 0, full: 0 }
  for (const w of plan.filter(x => !x.is_deload && x.week_number > 1)) for (const d of w.days) {
    // The second member of a pair: its label ends in 2 (A1 / A2), as buildSupersetPairs writes them.
    for (const e of d.exercises) {
      if (!e.superset_label || !/2$/.test(e.superset_label)) continue
      if (e.rest === 'alternate') tally.alt++; else tally.full++
    }
  }
  byLength.set(p.session_duration_preference, tally)
}
let total = 0
for (const [, t] of byLength) total += t.alt + t.full
console.log(`second members of a superset found: ${total} (zero means the detector is blind, not that there are none)`)
for (const [len, t] of [...byLength].sort()) console.log(`${len}: superset partners in weeks 2+ alternating ${t.alt}, given a full rest ${t.full}`)

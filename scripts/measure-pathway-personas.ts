// Prints the four personas' first four weeks (his 13 Nov 2026 strategy, slice 3).
import { generateMesocycle, setRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { PERSONAS } from './pathway-personas'

for (const p of PERSONAS) {
  setRandomSource(seededRngFromKey(p.key))
  const plan = generateMesocycle(p.profile)
  console.log(`\n=== ${p.who}`)
  for (const w of plan.slice(0, 4)) {
    console.log(`  Week ${w.week_number}`)
    for (const d of w.days) {
      if (d.plannedActivity) { console.log(`    ${d.day}: ${d.plannedActivity.activity} ${d.plannedActivity.duration} min`); continue }
      if (d.exercises.length === 0) continue
      const ex = d.exercises.map(e => `${e.name} ${e.sets}x${e.reps}`).join(', ')
      const walk = d.recommendedCardio ? ` + ${d.recommendedCardio.activity} ${d.recommendedCardio.duration} min` : ''
      const bal = d.warmup?.mobility.some(m => /Balance/.test(m.name)) ? ' [warm-up: balance hold]' : ''
      console.log(`    ${d.day}: ${d.focus} — ${ex}${walk}${bal}`)
    }
  }
}

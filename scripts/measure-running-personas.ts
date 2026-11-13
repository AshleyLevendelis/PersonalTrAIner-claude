// measure:running-personas — the first eight weeks of each running persona (his 13 Nov 2026 strategy, slice 6, R4).
import { generateMesocycle, setRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { RUNNERS } from './running-personas'

for (const r of RUNNERS) {
  setRandomSource(seededRngFromKey(r.key))
  const meso = generateMesocycle(r.profile)
  console.log(`\n== ${r.who}`)
  for (const w of meso.slice(0, 8)) {
    const line = w.days.map(d => d.plannedActivity
      ? `${d.day.slice(0, 3)} ${d.focus} ${d.plannedActivity.duration}m`
      : `${d.day.slice(0, 3)} ${d.focus}${d.exercises.length ? ` (${d.exercises.length} ex)` : ''}`).join(' | ')
    console.log(`  wk ${w.week_number}: ${line}`)
  }
  console.log(`  note wk3: ${meso[2]?.coach_note}`)
}

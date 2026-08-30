// LIKE FOR LIKE. Restricted to the exercises that existed before this round,
// because adding 27 entries to thin patterns inflates every "how many are
// thin" count by making 27 new subjects that are themselves thin. Comparing
// 185 subjects against 158 measures the catalogue's growth, not its quality.
import { EXERCISE_DATABASE, NEAREST_PATTERN_FALLBACK } from '../src/lib/exercise-db'
import { getReplacementCandidates } from '../src/lib/mesocycle-edit'
import type { UserProfile, EquipmentAccess } from '../src/lib/types'
import { execSync } from 'child_process'

const TIERS: EquipmentAccess[] = ['full_gym', 'home_gym', 'minimalist', 'bodyweight']
const p = (e: EquipmentAccess, injuries: string[] = []): UserProfile =>
  ({ equipment_access: e, training_experience: 'novice', injuries, goal: 'muscle_gain', training_days: [] } as unknown as UserProfile)

const base = execSync('git show origin/main:src/lib/exercise-db.ts', { encoding: 'utf8', maxBuffer: 1 << 26 })
const original = new Set([...base.matchAll(/^    name: '([^']+)'/gm)].map(m => m[1]))
const subjects = EXERCISE_DATABASE.filter(e => original.has(e.name))
console.log(`subjects: the ${subjects.length} exercises that existed before this round`)

const relevantFor = (e: typeof EXERCISE_DATABASE[number], prof: UserProfile) => {
  const ok = new Set<string>([e.movement_pattern, ...(NEAREST_PATTERN_FALLBACK[e.movement_pattern] ?? [])])
  return getReplacementCandidates(e.name, prof, []).filter(c => ok.has(c.exercise.movement_pattern)).length
}

console.log('\ntier         anyOptions:avg  none   relevant:avg  <=2relevant')
for (const tier of TIERS) {
  const any = subjects.map(e => getReplacementCandidates(e.name, p(tier), []).length)
  const rel = subjects.map(e => relevantFor(e, p(tier)))
  const f = (a: number[]) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1)
  console.log(`${tier.padEnd(12)} ${f(any).padStart(13)}  ${String(any.filter(n=>n===0).length).padStart(4)}  ${f(rel).padStart(12)}  ${String(rel.filter(n=>n<=2).length).padStart(11)} / ${subjects.length}`)
}

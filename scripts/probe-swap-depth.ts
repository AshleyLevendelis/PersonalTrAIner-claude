// Measures how many alternatives a swap actually offers, per equipment tier,
// per movement pattern, and with injuries applied. BEFORE numbers for §6.2.
import { EXERCISE_DATABASE } from '../src/lib/exercise-db'
import { getReplacementCandidates } from '../src/lib/mesocycle-edit'
import type { UserProfile, EquipmentAccess } from '../src/lib/types'

const TIERS: EquipmentAccess[] = ['full_gym', 'home_gym', 'minimalist', 'bodyweight']

const profileFor = (equipment: EquipmentAccess, injuries: string[] = []): UserProfile => ({
  equipment_access: equipment,
  training_experience: 'novice',
  injuries,
  goal: 'muscle_gain',
  training_days: [],
} as unknown as UserProfile)

console.log('=== catalogue shape ===')
console.log('total exercises:', EXERCISE_DATABASE.length)
const byPattern = new Map<string, number>()
for (const e of EXERCISE_DATABASE) byPattern.set(e.movement_pattern, (byPattern.get(e.movement_pattern) ?? 0) + 1)
console.log('by movement pattern:', Object.fromEntries([...byPattern].sort((a,b)=>b[1]-a[1])))

// How many entries are even REACHABLE at each tier?
console.log('\n=== reachable catalogue per equipment tier ===')
for (const t of TIERS) {
  const n = EXERCISE_DATABASE.filter(e => getReplacementCandidates(e.name, profileFor(t), []).length >= 0).length
  void n
}

console.log('\n=== swap depth per tier, across EVERY exercise in the catalogue ===')
for (const tier of TIERS) {
  const counts: number[] = []
  const thin: { name: string; n: number }[] = []
  for (const e of EXERCISE_DATABASE) {
    const n = getReplacementCandidates(e.name, profileFor(tier), []).length
    counts.push(n)
    if (n <= 2) thin.push({ name: e.name, n })
  }
  const avg = (counts.reduce((a, b) => a + b, 0) / counts.length).toFixed(1)
  const zero = counts.filter(n => n === 0).length
  const two = counts.filter(n => n <= 2).length
  console.log(`${tier.padEnd(11)} avg ${avg.padStart(5)}   0 options: ${String(zero).padStart(3)}   <=2 options: ${String(two).padStart(3)} / ${counts.length}`)
}

console.log('\n=== the six lifts the audit named, per tier ===')
const NAMED = ['Barbell Squats', 'Barbell Bench Press', 'Deadlifts', 'Overhead Press', 'Barbell Rows', 'Pull-Ups']
for (const n of NAMED) {
  const found = EXERCISE_DATABASE.find(e => e.name === n)
  if (!found) { console.log(`${n.padEnd(22)} NOT IN CATALOGUE (audit named it; check the real name)`); continue }
  const row = TIERS.map(t => `${t.slice(0,4)}:${String(getReplacementCandidates(n, profileFor(t), []).length).padStart(2)}`).join('  ')
  console.log(`${n.padEnd(22)} ${row}`)
}

console.log('\n=== with an injury, bodyweight tier ===')
for (const inj of ['knees', 'shoulders', 'lower_back']) {
  const counts = EXERCISE_DATABASE.map(e => getReplacementCandidates(e.name, profileFor('bodyweight', [inj]), []).length)
  const avg = (counts.reduce((a,b)=>a+b,0)/counts.length).toFixed(1)
  console.log(`${inj.padEnd(12)} avg ${avg}   0 options: ${counts.filter(n=>n===0).length}`)
}

console.log('\n=== the ZERO-option cases: the swap button opens onto nothing ===')
for (const tier of TIERS) {
  const zero = EXERCISE_DATABASE.filter(e => getReplacementCandidates(e.name, profileFor(tier), []).length === 0)
  if (zero.length) console.log(`${tier}: ${zero.map(e => `${e.name} [${e.movement_pattern}]`).join(', ')}`)
}
console.log('\n=== shoulders injury + bodyweight: which have zero? (grouped by pattern) ===')
{
  const zero = EXERCISE_DATABASE.filter(e => getReplacementCandidates(e.name, profileFor('bodyweight', ['shoulders']), []).length === 0)
  const byPat = new Map<string, string[]>()
  for (const e of zero) { const a = byPat.get(e.movement_pattern) ?? []; a.push(e.name); byPat.set(e.movement_pattern, a) }
  for (const [pat, names] of [...byPat].sort((a,b)=>b[1].length-a[1].length)) console.log(`  ${pat.padEnd(20)} ${names.length}  ${names.slice(0,5).join(', ')}${names.length>5?' …':''}`)
}
console.log('\n=== same, full_gym: does a shoulder injury strand people even with a gym? ===')
{
  const zero = EXERCISE_DATABASE.filter(e => getReplacementCandidates(e.name, profileFor('full_gym', ['shoulders']), []).length === 0)
  console.log('  zero-option exercises:', zero.length, zero.slice(0,8).map(e=>e.name).join(', '))
}

console.log('\n=== still thin (<=2 options), grouped by pattern, per tier ===')
for (const tier of TIERS) {
  const thin = EXERCISE_DATABASE.filter(e => getReplacementCandidates(e.name, profileFor(tier), []).length <= 2)
  if (thin.length === 0) { console.log(`${tier}: none`); continue }
  const byPat = new Map<string, string[]>()
  for (const e of thin) { const a = byPat.get(e.movement_pattern) ?? []; a.push(e.name); byPat.set(e.movement_pattern, a) }
  console.log(`\n${tier} (${thin.length}):`)
  for (const [pat, names] of [...byPat].sort((a,b)=>b[1].length-a[1].length)) console.log(`  ${pat.padEnd(20)} ${String(names.length).padStart(2)}  ${names.join(', ')}`)
}

import * as fs from 'fs'
import * as path from 'path'
import { generateExercisePlan, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { getExerciseEntry } from '../src/lib/exercise-db'
import { bestEquipmentRank } from '../src/lib/exercise-plan'
import {
  ALL_EQUIPMENT, ALL_DURATIONS, ALL_STYLES, ALL_EXPERIENCE, getInjuryCombinations,
} from '../src/lib/dev-constraint-audit'
import type {
  UserProfile, EquipmentAccess, TrainingStyle, SessionDuration, TrainingExperience,
  FitnessGoal,
} from '../src/lib/types'

// ---------------------------------------------------------------------------
// Equipment-fit pick dump — the before/after instrument for the equipment
// quality preference (docs/PLAN-equipment-quality.md)
// ---------------------------------------------------------------------------
// The quality harness answers "did the plans get better on six dimensions".
// It cannot answer "how many picks actually moved, and for whom" — a change
// that reorders hundreds of accessory slots and a change that touches nothing
// both show up as a flat Selection average. This dumps the raw week-1
// selection for every combination so two runs can be diffed exercise by
// exercise.
//
// Deliberately generates ONE week (generateExercisePlan) rather than the full
// 16-week mesocycle: exercise SELECTION happens once, in week 1, and the
// later weeks rotate variations off that base. Scoring week 1 alone is both
// the honest unit of measurement and ~20x faster, which is what makes a
// full-grid before/after affordable at all.
//
// Usage:
//   npx tsx scripts/report-equipment-fit.ts before.json
//   ...apply the change...
//   npx tsx scripts/report-equipment-fit.ts after.json
//   npx tsx scripts/report-equipment-fit.ts --diff before.json after.json
//
// The grid dimensions are imported from dev-constraint-audit rather than
// re-listed, so this can never silently drift to measuring a different
// population than test:audit and test:quality do.

const ALL_GOALS: FitnessGoal[] = ['hypertrophy', 'fat_loss', 'conditioning', 'functional']

interface Combination {
  equipment: EquipmentAccess
  injuries: string[]
  duration: SessionDuration
  style: TrainingStyle
  experience: TrainingExperience
  goal: FitnessGoal
}

function comboKey(c: Combination): string {
  return [c.equipment, c.injuries.join('+') || 'none', c.duration, c.style, c.experience, c.goal].join('|')
}

function buildProfile(c: Combination): UserProfile {
  return {
    age: 30,
    gender: 'male',
    height_cm: 178,
    weight_kg: 80,
    activity_level: 'moderate',
    fitness_goal: c.goal,
    preferred_time: 'morning',
    bmr: 1800,
    tdee: 2500,
    equipment_access: c.equipment,
    injuries: c.injuries,
    training_style: c.style,
    training_experience: c.experience,
    session_duration_preference: c.duration,
    workout_split_preference: 'ai_recommendation',
    training_days: [
      { day: 'Monday', available: true },
      { day: 'Tuesday', available: true },
      { day: 'Wednesday', available: false },
      { day: 'Thursday', available: true },
      { day: 'Friday', available: true },
      { day: 'Saturday', available: false },
      { day: 'Sunday', available: false },
    ],
    weekly_schedule: {},
    dietary_preferences: [],
    concurrent_activities: [],
    exercise_exclusions: [],
    macro_calculation_mode: 'STANDARD_STATIC',
    coaching_persona: 'supportive',
    recovery_capacity: 'moderate',
    conditioning_preference: 'tolerate',
  }
}

function generateAllCombinations(): Combination[] {
  const combos: Combination[] = []
  for (const equipment of ALL_EQUIPMENT) {
    for (const injuries of getInjuryCombinations()) {
      for (const duration of ALL_DURATIONS) {
        for (const style of ALL_STYLES) {
          for (const experience of ALL_EXPERIENCE) {
            for (const goal of ALL_GOALS) {
              combos.push({ equipment, injuries, duration, style, experience, goal })
            }
          }
        }
      }
    }
  }
  return combos
}

/** One line per combination: the ordered exercise names of every training day. */
type Dump = Record<string, string[]>

function runDump(outPath: string): void {
  const combos = generateAllCombinations()
  console.log(`Dumping week-1 picks for ${combos.length} combinations...`)
  const dump: Dump = {}
  const start = performance.now()

  for (let i = 0; i < combos.length; i++) {
    const combo = combos[i]
    const key = comboKey(combo)
    // Same seeding discipline as test:quality/test:audit — keyed on the
    // combination, so an unchanged combination produces an identical plan
    // across runs and any diff is a real behaviour change, not jitter.
    setRandomSource(seededRngFromKey(key))
    const plan = generateExercisePlan(buildProfile(combo))
    resetRandomSource()
    dump[key] = plan.plan.flatMap(day => day.exercises.map(ex => `${day.day}:${ex.name}`))
    if (i > 0 && i % 500 === 0) console.log(`  ${i}/${combos.length}`)
  }

  fs.writeFileSync(outPath, JSON.stringify(dump))
  console.log(`Wrote ${outPath} (${combos.length} combos, ${((performance.now() - start) / 1000).toFixed(1)}s)`)
}

/** Ranked implement for a name, for reporting which direction a swap went. */
function implementOf(name: string): string {
  const entry = getExerciseEntry(name)
  return entry ? entry.equipment.join('+') : '?'
}

function runDiff(beforePath: string, afterPath: string): void {
  const before: Dump = JSON.parse(fs.readFileSync(beforePath, 'utf8'))
  const after: Dump = JSON.parse(fs.readFileSync(afterPath, 'utf8'))

  const keys = Object.keys(before)
  const perTier = new Map<string, { combos: number; changed: number; slots: number; slotsChanged: number }>()
  const swaps = new Map<string, number>()

  for (const key of keys) {
    const tier = key.split('|')[0]
    if (!perTier.has(tier)) perTier.set(tier, { combos: 0, changed: 0, slots: 0, slotsChanged: 0 })
    const t = perTier.get(tier)!
    t.combos++

    const b = before[key] ?? []
    const a = after[key] ?? []
    t.slots += b.length
    let comboChanged = false
    // Positional comparison: the slot order IS the session order, so a pick
    // moving position is a real change to what the trainee is told to do,
    // not noise to normalise away.
    for (let i = 0; i < Math.max(b.length, a.length); i++) {
      if (b[i] === a[i]) continue
      t.slotsChanged++
      comboChanged = true
      const from = (b[i] ?? '(absent)').split(':').slice(1).join(':')
      const to = (a[i] ?? '(absent)').split(':').slice(1).join(':')
      const label = `${from} [${implementOf(from)}]  ->  ${to} [${implementOf(to)}]`
      swaps.set(label, (swaps.get(label) ?? 0) + 1)
    }
    if (comboChanged) t.changed++
  }

  console.log('')
  console.log('Pick changes by equipment tier')
  console.log('------------------------------------------------------------')
  console.log('tier            combos  changed        slots  slots changed')
  for (const [tier, t] of perTier) {
    const cPct = ((t.changed / t.combos) * 100).toFixed(1)
    const sPct = ((t.slotsChanged / t.slots) * 100).toFixed(1)
    console.log(
      `${tier.padEnd(14)} ${String(t.combos).padStart(6)}  ${String(t.changed).padStart(6)} (${cPct.padStart(5)}%) ${String(t.slots).padStart(6)}  ${String(t.slotsChanged).padStart(6)} (${sPct.padStart(5)}%)`
    )
  }

  // A single genuine swap early in a day changes how many candidates the
  // scorer sees later, which re-rolls the seeded jitter for every pick after
  // it. That cascade shows up in the raw slot-change count as a huge number
  // of medium->medium reshuffles that mean nothing. Bucketing every change by
  // the RANK TRANSITION separates the effect being measured (low -> high)
  // from the noise it drags along (medium -> medium) and, critically, from
  // the thing that would be a regression (high -> low).
  console.log('')
  console.log('Rank transitions (what the change actually moved)')
  console.log('------------------------------------------------------------')
  const transitions = new Map<string, number>()
  for (const [label, count] of swaps) {
    const [fromPart, toPart] = label.split('  ->  ')
    const rank = (part: string): string => {
      const name = part.replace(/\s*\[[^\]]*\]\s*$/, '')
      const entry = getExerciseEntry(name)
      return entry ? (bestEquipmentRank(entry) ?? 'unranked') : 'absent'
    }
    const key = `${rank(fromPart)} -> ${rank(toPart)}`
    transitions.set(key, (transitions.get(key) ?? 0) + count)
  }
  const total = [...transitions.values()].reduce((a, b) => a + b, 0)
  for (const [key, count] of [...transitions.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`${String(count).padStart(7)}  (${((count / total) * 100).toFixed(1).padStart(5)}%)  ${key}`)
  }

  console.log('')
  console.log('Most frequent swaps (top 40)')
  console.log('------------------------------------------------------------')
  const sorted = [...swaps.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)
  for (const [label, count] of sorted) console.log(`${String(count).padStart(6)}  ${label}`)
  console.log('')
  console.log(`Distinct swap shapes: ${swaps.size}`)
}

const args = process.argv.slice(2)
if (args[0] === '--diff') {
  if (args.length < 3) {
    console.error('usage: --diff <before.json> <after.json>')
    process.exit(1)
  }
  runDiff(args[1], args[2])
} else {
  runDump(path.resolve(args[0] ?? 'equipment-fit-dump.json'))
}

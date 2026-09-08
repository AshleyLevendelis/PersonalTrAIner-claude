// ---------------------------------------------------------------------------
// THE BEFORE/AFTER INSTRUMENT for the 8 Sep 2026 defect: a style tag that
// starved a movement.
//
// Ashley's Tuesday prescribed a Backpack Lateral Raise next to a barbell bench
// press, and swapping it offered exactly one alternative. Her profile is
// full_gym / advanced / functional with no injuries. Of the catalogue's seven
// isolation_shoulder entries, two carry the 'functional' tag — so selection
// chose from a shortlist of two and the swap had one left to offer.
//
// Three numbers, because the defect has three faces and a fix could move one
// while leaving the others:
//
//   A. STARVATION. Per style and equipment tier, how many movement patterns
//      the style filter reduces below a workable number of options. The
//      existing MIN_VIABLE_POOL escape cannot see this: it counts the WHOLE
//      pool, and 151 of 199 entries carry 'functional'.
//
//   B. IMPLEMENT. How many prescribed exercises use a 'low'-rank implement
//      (band, weighted backpack) while a 'high'-rank peer for the same pattern
//      and tier sits in the same person's pool. This is quality-score.ts's own
//      `worse_implement_than_available` predicate, imported rather than
//      restated — but run over EVERY week of the mesocycle. The harness rule
//      hardcodes week 1, which is exactly why rotation-induced cases have
//      never appeared in a number.
//
//   C. SWAP DEPTH. How many replacements the swap dialog would offer, per
//      style. Every existing swap probe builds its profile as 'hybrid' (or
//      omits training_style and defaults to it), and 'hybrid' is the widest
//      tag in the catalogue — so the style filter is inert in every
//      measurement this repo currently takes.
//
// The grid is stated rather than maximal: 4 equipment x 4 styles x 4
// experience x 1 goal x 1 duration, no injuries = 64 mesocycles. Injuries are
// held out on purpose — they are a separate axis with their own gates, and
// including them would triple the runtime without touching the tag this is
// about.
//
//   npx tsx scripts/report-style-and-implement.ts before.json
//   ...apply the change...
//   npx tsx scripts/report-style-and-implement.ts after.json
//   npx tsx scripts/report-style-and-implement.ts --diff before.json after.json
// ---------------------------------------------------------------------------
import * as fs from 'fs'
import {
  generateMesocycle, getConstrainedPool, setRandomSource, resetRandomSource,
  bestEquipmentRank, isEquipmentQualityExempt, EQUIPMENT_QUALITY_TIERS,
} from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { getExerciseEntry } from '../src/lib/exercise-db'
import { getReplacementCandidates } from '../src/lib/mesocycle-edit'
import { ALL_EQUIPMENT, ALL_STYLES, ALL_EXPERIENCE } from '../src/lib/dev-constraint-audit'
import type { UserProfile, EquipmentAccess, TrainingStyle, TrainingExperience } from '../src/lib/types'

/** What counts as "enough ways to train this movement" for section A. */
const WORKABLE = 4

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function buildProfile(equipment: EquipmentAccess, style: TrainingStyle, experience: TrainingExperience): UserProfile {
  return {
    age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
    fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1800, tdee: 2500,
    equipment_access: equipment, injuries: [], training_style: style,
    training_experience: experience, session_duration_preference: '45-60',
    workout_split_preference: 'upper_lower', recovery_capacity: 'moderate',
    conditioning_preference: 'tolerate', coaching_persona: 'supportive',
    training_days: DAYS.map((day, i) => ({ day, available: i % 2 === 1 })),
    weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
    exercise_exclusions: [] as unknown as never,
    macro_calculation_mode: 'STANDARD_STATIC',
    created_at: new Date().toISOString(),
  } as UserProfile
}

interface Report {
  workable: number
  starvation: { key: string; pattern: string; inCatalogue: number; afterStyle: number }[]
  implement: { key: string; week: number; day: string; exercise: string; equipment: string }[]
  swapDepth: { key: string; from: string; depth: number }[]
}

function measure(): Report {
  const out: Report = { workable: WORKABLE, starvation: [], implement: [], swapDepth: [] }

  for (const equipment of ALL_EQUIPMENT) {
    for (const style of ALL_STYLES) {
      for (const experience of ALL_EXPERIENCE) {
        const key = `${equipment}|${style}|${experience}`
        const profile = buildProfile(equipment, style, experience)

        // --- A. starvation -------------------------------------------------
        // The pool the engine will actually pick from, against the same pool
        // with the style tag ignored — so the number isolates STYLE, not
        // equipment or injury.
        const pool = getConstrainedPool(profile, [])
        const byPattern = new Map<string, number>()
        for (const e of pool) byPattern.set(e.movement_pattern, (byPattern.get(e.movement_pattern) ?? 0) + 1)
        // Against what THIS EQUIPMENT TIER could offer, not the whole
        // catalogue. The first version of this compared to the catalogue and
        // counted a bodyweight trainee's two vertical pulls as starvation —
        // that is the kit talking, not the style, and it made the number
        // unable to answer the question it was built for. Numbers taken
        // before 8 Sep 2026 on the catalogue basis are not comparable.
        const tierPool = getConstrainedPool(buildProfile(equipment, 'hybrid', experience), [])
        const tierByPattern = new Map<string, number>()
        for (const e of tierPool) tierByPattern.set(e.movement_pattern, (tierByPattern.get(e.movement_pattern) ?? 0) + 1)
        for (const [pattern, atTier] of tierByPattern) {
          const afterStyle = byPattern.get(pattern) ?? 0
          if (afterStyle < Math.min(WORKABLE, atTier)) {
            out.starvation.push({ key, pattern, inCatalogue: atTier, afterStyle })
          }
        }

        // --- B. implement, every week --------------------------------------
        setRandomSource(seededRngFromKey(`style-implement:${key}`))
        const meso = generateMesocycle(profile)
        resetRandomSource()
        if (EQUIPMENT_QUALITY_TIERS.has(equipment)) {
          for (const week of meso) {
            for (const day of week.days) {
              for (const ex of day.exercises) {
                const entry = getExerciseEntry(ex.name)
                if (!entry || isEquipmentQualityExempt(entry) || bestEquipmentRank(entry) !== 'low') continue
                const better = pool.some(p =>
                  p.movement_pattern === entry.movement_pattern &&
                  p.mechanics_tier === entry.mechanics_tier &&
                  bestEquipmentRank(p) === 'high')
                if (!better) continue
                out.implement.push({
                  key, week: week.week_number, day: day.day,
                  exercise: ex.name, equipment: entry.equipment.join('/'),
                })
              }
            }
          }
        }

        // --- C. swap depth -------------------------------------------------
        // Measured from what this profile was ACTUALLY given in week 1, so the
        // number is the one a real trainee would meet on the real screen.
        const seen = new Set<string>()
        for (const day of meso[0]?.days ?? []) {
          for (const ex of day.exercises) {
            if (seen.has(ex.name)) continue
            seen.add(ex.name)
            out.swapDepth.push({
              key, from: ex.name,
              depth: getReplacementCandidates(ex.name, profile, []).length,
            })
          }
        }
      }
    }
  }
  return out
}

function summarise(r: Report, label: string): void {
  const starvedKeys = new Set(r.starvation.map(s => s.key))
  const byStyle = new Map<string, number>()
  for (const s of r.starvation) {
    const style = s.key.split('|')[1]
    byStyle.set(style, (byStyle.get(style) ?? 0) + 1)
  }
  const zeroOrOne = r.swapDepth.filter(s => s.depth <= 1).length
  const depthByStyle = new Map<string, number[]>()
  for (const s of r.swapDepth) {
    const style = s.key.split('|')[1]
    if (!depthByStyle.has(style)) depthByStyle.set(style, [])
    depthByStyle.get(style)!.push(s.depth)
  }
  const median = (xs: number[]) => {
    const a = [...xs].sort((x, y) => x - y)
    return a.length ? a[Math.floor(a.length / 2)] : 0
  }

  console.log(`\n=== ${label} ===`)
  console.log(`\nA. STARVED PATTERNS (this equipment tier offers >= ${WORKABLE}, this style's pool has fewer)`)
  console.log(`   ${r.starvation.length} occurrences across ${starvedKeys.size} of 64 profiles`)
  for (const style of ALL_STYLES) console.log(`     ${style.padEnd(14)} ${byStyle.get(style) ?? 0}`)

  console.log(`\nB. WORSE IMPLEMENT THAN AVAILABLE (all weeks, not just week 1)`)
  console.log(`   ${r.implement.length} prescribed exercises`)
  const wk1 = r.implement.filter(i => i.week === 1).length
  console.log(`     of which week 1: ${wk1}   weeks 2+: ${r.implement.length - wk1}  <- invisible to test:quality today`)
  const byName = new Map<string, number>()
  for (const i of r.implement) byName.set(i.exercise, (byName.get(i.exercise) ?? 0) + 1)
  for (const [name, n] of [...byName].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`     ${String(n).padStart(5)}  ${name}`)
  }

  console.log(`\nC. SWAP DEPTH (replacements offered, per prescribed exercise)`)
  console.log(`   ${zeroOrOne} of ${r.swapDepth.length} slots offer one option or none`)
  for (const style of ALL_STYLES) {
    const xs = depthByStyle.get(style) ?? []
    console.log(`     ${style.padEnd(14)} median ${String(median(xs)).padStart(3)}   <=1: ${xs.filter(x => x <= 1).length}/${xs.length}`)
  }
  console.log('')
}

const arg = process.argv[2]
if (arg === '--diff') {
  const before: Report = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'))
  const after: Report = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'))
  summarise(before, `BEFORE  ${process.argv[3]}`)
  summarise(after, `AFTER   ${process.argv[4]}`)
  console.log('=== MOVEMENT ===')
  console.log(`  starved patterns   ${before.starvation.length} -> ${after.starvation.length}`)
  console.log(`  worse implement    ${before.implement.length} -> ${after.implement.length}`)
  console.log(`  slots with <=1 swap ${before.swapDepth.filter(s => s.depth <= 1).length} -> ${after.swapDepth.filter(s => s.depth <= 1).length}`)
  console.log('')
} else {
  const report = measure()
  if (arg) fs.writeFileSync(arg, JSON.stringify(report, null, 2))
  summarise(report, arg ? `written to ${arg}` : 'measurement')
}

/**
 * How many generated weeks are missing a fundamental movement pattern?
 *
 * Written 18 Sep 2026 to settle a number this repo had been quoting from a
 * report artifact that no longer existed: "squat-less weeks went 4 -> 22 of
 * 9,216 as a cost of protecting rest". That was a lead, not a fact, and the
 * fix for it needed a before/after on the same sample.
 *
 * Generation only — no scorePlan. The quality sweep's expensive part is goal
 * alignment regenerating a comparison plan per combination; this asks a much
 * narrower question, over the SAME combination grid, so its denominator is
 * directly comparable to quality-report.txt's.
 *
 * The coarse pattern vocabulary is the plan's own (mapMovementPattern), read
 * off the generated week rather than off the catalogue, because that is what
 * every downstream reader - the scorer included - actually sees.
 *
 *   npx tsx scripts/measure-pattern-coverage.ts            # all 4 shards
 *   npx tsx scripts/measure-pattern-coverage.ts --shard 0/4
 */
import { execFile } from 'child_process'
import {
  generateMesocycle, setRandomSource, resetRandomSource,
  getConstrainedPool, mapMovementPattern,
} from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import {
  ALL_EQUIPMENT, ALL_DURATIONS, ALL_STYLES, ALL_EXPERIENCE, getInjuryCombinations,
} from '../src/lib/dev-constraint-audit'
import type {
  UserProfile, EquipmentAccess, TrainingStyle, SessionDuration, TrainingExperience,
  FitnessGoal, RecoveryCapacity, ConditioningPreference,
} from '../src/lib/types'

const ALL_GOALS: FitnessGoal[] = ['hypertrophy', 'fat_loss', 'conditioning', 'functional']
const ALL_RECOVERY: RecoveryCapacity[] = ['low', 'moderate', 'high']
const ALL_CONDITIONING_PREF: ConditioningPreference[] = ['love', 'tolerate', 'avoid']

const FUNDAMENTALS = ['push', 'pull', 'hinge', 'squat'] as const

interface Combination {
  equipment: EquipmentAccess
  injuries: string[]
  duration: SessionDuration
  style: TrainingStyle
  experience: TrainingExperience
  goal: FitnessGoal
  recovery: RecoveryCapacity
  conditioningPref: ConditioningPreference
}

/** Same grid, same round-robin odometer, same order as run-quality-score.ts. */
function generateAllCombinations(): Combination[] {
  const injuryCombinations = getInjuryCombinations()
  const combos: Combination[] = []
  let rotationIndex = 0
  for (const equipment of ALL_EQUIPMENT) {
    for (const injuries of injuryCombinations) {
      for (const duration of ALL_DURATIONS) {
        for (const style of ALL_STYLES) {
          for (const experience of ALL_EXPERIENCE) {
            for (const goal of ALL_GOALS) {
              combos.push({
                equipment, injuries, duration, style, experience, goal,
                recovery: ALL_RECOVERY[rotationIndex % ALL_RECOVERY.length],
                conditioningPref: ALL_CONDITIONING_PREF[Math.floor(rotationIndex / ALL_RECOVERY.length) % ALL_CONDITIONING_PREF.length],
              })
              rotationIndex++
            }
          }
        }
      }
    }
  }
  return combos
}

function buildProfile(combo: Combination): UserProfile {
  return {
    age: 30, gender: 'male', height_cm: 178, weight_kg: 80,
    activity_level: 'moderate', fitness_goal: combo.goal, preferred_time: 'morning',
    bmr: 1800, tdee: 2500,
    equipment_access: combo.equipment, injuries: combo.injuries,
    training_style: combo.style, training_experience: combo.experience,
    session_duration_preference: combo.duration,
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
    weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
    exercise_exclusions: [], macro_calculation_mode: 'STANDARD_STATIC',
    coaching_persona: 'supportive',
    recovery_capacity: combo.recovery, conditioning_preference: combo.conditioningPref,
  }
}

function comboKey(combo: Combination): string {
  return [
    combo.equipment, combo.injuries.join('+') || 'none', combo.duration, combo.style,
    combo.experience, combo.goal, combo.recovery, combo.conditioningPref,
  ].join('|')
}

/**
 * One shard: counts, per fundamental pattern, weeks that hold none of it — and
 * NAMES the offenders. The names are the point as much as the count: a gate
 * that has to reproduce this defect needs a profile that is genuinely under
 * pressure, and a comfortable fixture invented by hand never reaches the code
 * the gate exists to hold.
 */
function runShard(from: number, to: number, stopAfter = Infinity): Record<string, number> & { scored: number; offenders: string[] } {
  const combos = generateAllCombinations()
  const missing: Record<string, number> = Object.fromEntries(FUNDAMENTALS.map(p => [p, 0]))
  const offenders: string[] = []
  let scored = 0
  for (let i = from; i < to && i < combos.length; i++) {
    const combo = combos[i]
    // Seeded per combination, exactly as the quality harness seeds it: an
    // unseeded run picks exercises through Math.random and a before/after
    // comparison would be measuring the dice.
    setRandomSource(seededRngFromKey(comboKey(combo)))
    try {
      const profile = buildProfile(combo)
      const mesocycle = generateMesocycle(profile)
      const week1 = mesocycle.find(w => w.week_number === 1)
      const present = new Set<string>()
      for (const day of week1?.days ?? []) {
        for (const ex of day.exercises) if (ex.movement_pattern) present.add(ex.movement_pattern)
      }
      // THE POOL GUARD, and it is not optional. An unguarded first run reported
      // 832 push-less weeks (9.03%) and read like a large undiscovered defect.
      // It was the measurement: some injury combinations remove every pressing
      // movement from the pool, and a week cannot hold a pattern its own
      // constraints forbid. The scorer has always guarded this
      // (`poolHasPush && pushSets === 0`), which is why its report showed
      // nothing — the two only became comparable once this matched it.
      const poolPatterns = new Set(
        getConstrainedPool(profile, []).map(e => mapMovementPattern(e.movement_pattern)),
      )
      for (const p of FUNDAMENTALS) {
        if (present.has(p) || !poolPatterns.has(p)) continue
        missing[p]++
        if (offenders.length < 40) offenders.push(`${p}|${comboKey(combo)}`)
      }
      scored++
    } finally {
      resetRandomSource()
    }
    // --stop-after exists only for the OFFENDER HUNT: finding a handful of
    // genuinely-under-pressure profiles to pin a gate on does not need the
    // whole grid, and a partial run must never be read as a rate. The parent
    // prints the ran/total line for exactly that reason.
    if (offenders.length >= stopAfter) break
  }
  return { ...missing, scored, offenders }
}

async function main(): Promise<void> {
  const shardArg = process.argv.indexOf('--shard')
  const total = generateAllCombinations().length

  const stopArg = process.argv.indexOf('--stop-after')
  const stopAfter = stopArg === -1 ? Infinity : Number(process.argv[stopArg + 1])

  if (shardArg !== -1) {
    const [idx, n] = process.argv[shardArg + 1].split('/').map(Number)
    const size = Math.ceil(total / n)
    // Sentinel-prefixed: plan generation prints balance-pass notes to stdout
    // unless NODE_ENV=production, and a parent that JSON.parses the whole
    // stream would die on the first one. Extracting one tagged line is
    // robust whether or not the env var survives the spawn.
    process.stdout.write(`\nPATTERN_SHARD ${JSON.stringify(runShard(idx * size, (idx + 1) * size, stopAfter))}\n`)
    return
  }

  const shards = 4
  const results = await Promise.all(
    Array.from({ length: shards }, (_, i) => new Promise<Record<string, unknown>>((resolve, reject) => {
      execFile(
        // Not __filename: tsx runs this as an ES module, where it is
        // undefined. The first run failed on exactly that, printed the
        // ReferenceError, and still reported exit 0 because the command was
        // piped — the 'a crash reads as a pass' rule, one level out.
        'npx', [
          'tsx', 'scripts/measure-pattern-coverage.ts', '--shard', `${i}/${shards}`,
          ...(stopAfter === Infinity ? [] : ['--stop-after', String(stopAfter)]),
        ],
        { env: { ...process.env, NODE_ENV: 'production' }, maxBuffer: 64 * 1024 * 1024 },
        (err, stdout) => {
          if (err) return reject(err)
          const line = stdout.split('\n').find(l => l.startsWith('PATTERN_SHARD '))
          if (!line) return reject(new Error(`shard ${i} printed no result line`))
          resolve(JSON.parse(line.slice('PATTERN_SHARD '.length)))
        },
      )
    })),
  )

  const summed: Record<string, number> = {}
  const offenders: string[] = []
  for (const r of results) {
    for (const [k, v] of Object.entries(r)) {
      if (k === 'offenders') { offenders.push(...(v as unknown as string[])); continue }
      summed[k] = (summed[k] ?? 0) + (v as number)
    }
  }

  console.log(`combinations generated: ${summed.scored} of ${total}`)
  if (summed.scored !== total) {
    // The "compare checks that RAN" rule: a shard that died quietly would
    // otherwise report a smaller, better-looking number of missing patterns.
    console.log('WARNING: a shard did not finish — these counts are NOT comparable to a full run')
  }
  console.log('weeks holding NO exercise of that pattern:')
  for (const p of FUNDAMENTALS) {
    const pct = ((summed[p] / summed.scored) * 100).toFixed(2)
    console.log(`  ${p.padEnd(6)} ${String(summed[p]).padStart(5)}  ${pct}%`)
  }
  if (offenders.length > 0) {
    console.log('offending combinations (pattern|equipment|injuries|duration|style|experience|goal|recovery|cardio):')
    for (const o of offenders.slice(0, 25)) console.log(`  ${o}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })

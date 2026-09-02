// ---------------------------------------------------------------------------
// THE TRAINING DOSE WE HAVE NEVER COUNTED.  A report, not a gate.
//
// From Ashley's research document ("The Coach's Decision Stack") and the
// assessment of it on 2 Sep 2026. Three of its claims are ones I would bet on
// independently of the document, and all three are about quantities this app
// has never measured:
//
//   1. VOLUME PER MUSCLE drives hypertrophy. The document's figure is "at
//      least 10 hard sets per muscle per week". Nothing in this codebase
//      tallies sets per muscle — not the generator, not quality-score. So we
//      do not know whether we hit it, miss it, or wildly overshoot.
//   2. REST ON THE PRIMARY. Short rest costs real work; the benefit is banked
//      by roughly 2 minutes on a heavy compound, and the document puts "rest
//      on the primary lift" on its never-cut list. Our floor is 60s
//      (MAIN_LIFT_REST_FLOOR_SECONDS) and quality-score's own
//      main_lift_short_rest check draws the same line at 60.
//   3. WHAT GETS CUT WHEN TIME IS SHORT. trimWeekRestForBudget already trims
//      accessories before mains, which matches the document's hierarchy. What
//      is not known is how often it reaches a main lift at all.
//
// Whether any of this becomes a RULE is a prescription decision and therefore
// Ashley's. This script measures and stops, so that the questions can be put
// to her with both sides costed — the same order every rep-range ruling in
// docs/plans/ was decided in.
//
// DEFINITION, STATED BECAUSE IT IS NEW: a "hard set" is one whose prescribed
// RPE label tops out at 7 or more (resolveTargetRpe emits `RPE <low>-<high>`;
// deload weeks emit "RPE 5-6 — deload…" and so are excluded by the same
// test). That is this script's own definition of the document's "0-3 RIR",
// not a threshold that already existed somewhere in the app.
//
// Usage:  npx tsx scripts/report-training-dose.ts [--stride=N]
// ---------------------------------------------------------------------------
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { EXERCISE_DATABASE } from '../src/lib/exercise-db'
import {
  ALL_EQUIPMENT, ALL_DURATIONS, ALL_STYLES, ALL_EXPERIENCE, getInjuryCombinations,
} from '../src/lib/dev-constraint-audit'
import type {
  UserProfile, EquipmentAccess, TrainingStyle, SessionDuration, TrainingExperience,
  FitnessGoal, RecoveryCapacity, ConditioningPreference, MesocycleWeek,
  ConstraintTraceEntry,
} from '../src/lib/types'

// --- the quality sweep's grid, copied field for field ----------------------
// Same copy report-rep-ranges-by-phase.ts makes, for the same reason; the
// combination count printed at the top is the check that they still agree.
const ALL_GOALS: FitnessGoal[] = ['hypertrophy', 'fat_loss', 'conditioning', 'functional']
const ALL_RECOVERY: RecoveryCapacity[] = ['low', 'moderate', 'high']
const ALL_CONDITIONING_PREF: ConditioningPreference[] = ['love', 'tolerate', 'avoid']

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

function buildProfile(combo: Combination): UserProfile {
  return {
    age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
    fitness_goal: combo.goal, preferred_time: 'morning', bmr: 1800, tdee: 2500,
    equipment_access: combo.equipment, injuries: combo.injuries,
    training_style: combo.style, training_experience: combo.experience,
    session_duration_preference: combo.duration, workout_split_preference: 'ai_recommendation',
    training_days: [
      { day: 'Monday', available: true }, { day: 'Tuesday', available: true },
      { day: 'Wednesday', available: false }, { day: 'Thursday', available: true },
      { day: 'Friday', available: true }, { day: 'Saturday', available: false },
      { day: 'Sunday', available: false },
    ],
    weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [], exercise_exclusions: [],
    macro_calculation_mode: 'STANDARD_STATIC', coaching_persona: 'supportive',
    recovery_capacity: combo.recovery, conditioning_preference: combo.conditioningPref,
  }
}

function comboKey(c: Combination): string {
  return [c.equipment, c.injuries.join('+') || 'none', c.duration, c.style, c.experience, c.goal, c.recovery, c.conditioningPref].join('|')
}

function generateAllCombinations(): Combination[] {
  const combos: Combination[] = []
  let rotationIndex = 0
  for (const equipment of ALL_EQUIPMENT)
    for (const injuries of getInjuryCombinations())
      for (const duration of ALL_DURATIONS)
        for (const style of ALL_STYLES)
          for (const experience of ALL_EXPERIENCE)
            for (const goal of ALL_GOALS) {
              combos.push({
                equipment, injuries, duration, style, experience, goal,
                recovery: ALL_RECOVERY[rotationIndex % ALL_RECOVERY.length],
                conditioningPref: ALL_CONDITIONING_PREF[Math.floor(rotationIndex / ALL_RECOVERY.length) % ALL_CONDITIONING_PREF.length],
              })
              rotationIndex++
            }
  return combos
}

// --- muscle names -> the groups a trainee would recognise ------------------
// EXERCISE_DATABASE carries 62 distinct primary_muscles strings, many of them
// synonyms written by different hands ('quads' and 'quadriceps', 'glutes' and
// 'glute max', 'traps' and 'upper trapezius'). Counting them raw would split
// one muscle's volume across three buckets and make every plan look
// under-dosed. Anything that is not a trainable muscle group — 'grip',
// 'cardiovascular system', 'full body' — maps to null and is not counted:
// a set is attributed to the muscles it trains, not to every string listed.
const MUSCLE_GROUP: Record<string, string> = {
  chest: 'chest', 'upper chest': 'chest', 'lower chest': 'chest',
  lats: 'back', 'upper back': 'back', rhomboids: 'back', 'teres major': 'back',
  traps: 'back', 'mid traps': 'back', 'upper traps': 'back', 'upper trapezius': 'back',
  'lower trapezius': 'back',
  // Erectors get their OWN group rather than folding into 'back'. Folding
  // them in was the first cut of this mapping and it inflated back's mean by
  // roughly a third: every deadlift, RDL and good morning in the plan was
  // being counted as back volume alongside the rows and pulldowns, which is
  // not what a sets-per-muscle figure means when someone says "back".
  'erector spinae': 'erectors', erectors: 'erectors',
  shoulders: 'shoulders', 'anterior deltoid': 'shoulders', 'front deltoid': 'shoulders',
  'lateral deltoid': 'shoulders', 'rear deltoid': 'shoulders', 'rotator cuff': 'shoulders',
  'external rotators': 'shoulders', 'serratus anterior': 'shoulders',
  biceps: 'biceps', 'biceps brachii': 'biceps', 'biceps brachii (long head)': 'biceps',
  brachioradialis: 'biceps',
  triceps: 'triceps', 'triceps (long head)': 'triceps',
  quads: 'quads', quadriceps: 'quads', legs: 'quads',
  hamstrings: 'hamstrings',
  glutes: 'glutes', 'glute max': 'glutes', 'glute medius': 'glutes', 'glute minimus': 'glutes',
  adductors: 'glutes', 'tensor fasciae latae': 'glutes',
  // 'hip flexors' deliberately unmapped: they are the glutes' antagonist, not
  // a group anyone doses to a weekly set target.
  calves: 'calves', gastrocnemius: 'calves', soleus: 'calves',
  'tibialis anterior': 'calves', peroneals: 'calves', 'ankle stabilisers': 'calves',
  core: 'core', 'rectus abdominis': 'core', obliques: 'core',
  'transverse abdominis': 'core', 'quadratus lumborum': 'core',
}
const GROUP_ORDER = ['chest', 'back', 'erectors', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core']
// The document's figure, and the reason it is quoted rather than adopted: the
// dose-response curve is real, the number 10 is a line drawn through a
// scatter. It is the reporting threshold here and nothing more.
const TARGET_SETS = 10

const entryByName = new Map(EXERCISE_DATABASE.map(e => [e.name, e]))
function groupsFor(name: string): string[] {
  const entry = entryByName.get(name)
  if (!entry) return []
  const groups = new Set<string>()
  for (const m of entry.primary_muscles ?? []) {
    const g = MUSCLE_GROUP[m.toLowerCase()]
    if (g) groups.add(g)
  }
  return [...groups]
}

/** resolveTargetRpe emits `RPE <low>-<high>`; deloads emit "RPE 5-6 — deload…". */
function isHardSet(intensity: string | undefined): boolean {
  if (!intensity) return false
  const m = intensity.match(/RPE\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/)
  if (!m) return false
  return Number(m[2]) >= 7
}

function parseRestSeconds(rest: string | undefined): number | null {
  if (!rest) return null
  const m = rest.match(/^(\d+)\s*s?$/)
  return m ? Number(m[1]) : null
}

const bump = (m: Map<string, number>, k: string, n = 1) => m.set(k, (m.get(k) ?? 0) + n)

const stride = Math.max(1, Number((process.argv.find(a => a.startsWith('--stride=')) ?? '--stride=1').split('=')[1]) || 1)
const combos = generateAllCombinations()
const sampled = combos.filter((_, i) => i % stride === 0)
console.log(`Training dose — ${combos.length} combinations in the grid, sweeping ${sampled.length}${stride > 1 ? ` (every ${stride}th)` : ''}\n`)

// 1. sets per muscle group per week
const setsSum = new Map<string, number>()          // group -> total hard sets across all weeks
const weeksBelow = new Map<string, number>()       // group -> weeks under TARGET_SETS (where the group is trained at all)
const weeksTrained = new Map<string, number>()     // group -> weeks the group appears in
const plansBelowByGoal = new Map<string, number>() // goal -> plans with >=1 group under target in a non-deload week
const setsHistogram = new Map<string, Map<number, number>>() // group -> sets -> weeks
// 2. main-lift rest
const mainRestHistogram = new Map<number, number>()
const bumpNum = (m: Map<number, number>, k: number, n = 1) => m.set(k, (m.get(k) ?? 0) + n)
let mainSlots = 0, mainBelow120 = 0, mainBelow60 = 0
const mainBelow120ByGoal = new Map<string, number>()
// 3. what the trimmer cut
let trimmedDays = 0, trimmedMainRest = 0, secondsCutTotal = 0
const trimmedMainNames = new Map<string, number>()
const trimmedMainRestTo = new Map<number, number>()
let weeksSeen = 0, deloadWeeks = 0

const start = performance.now()
sampled.forEach((combo, i) => {
  const key = comboKey(combo)
  setRandomSource(seededRngFromKey(key))
  const realLog = console.log
  const realDebug = console.debug
  // generateMesocycle takes a trimLog out-parameter (added for
  // run-trim-magnitude-report.ts) — the trim decisions are structured
  // entries, not console lines, so they are read from there. Its OTHER
  // narration is noise here and is swallowed for the duration.
  //
  // console.DEBUG as well as console.log: enforceWeeklyPatternBalance narrates
  // every set it bumps or trims through console.debug (gated on
  // BALANCE_DEV_LOGGING, which is on unless NODE_ENV=production). Silencing
  // only console.log — which is what report-rep-ranges-by-phase.ts does —
  // left the first run of this sweep writing thousands of balance lines and
  // burying its own report. Not silenced by setting NODE_ENV=production
  // instead, deliberately: that flag is read in other places and this script
  // must sweep the same generator the app runs, not a variant of it.
  const trimLog: ConstraintTraceEntry[] = []
  console.log = () => {}
  console.debug = () => {}
  let meso: MesocycleWeek[]
  try {
    meso = generateMesocycle(buildProfile(combo), undefined, [], trimLog)
  } finally { console.log = realLog; console.debug = realDebug }
  resetRandomSource()

  for (const e of trimLog) {
    trimmedDays++
    secondsCutTotal += e.secondsCut ?? 0
    const entry = entryByName.get(e.exercise)
    if (entry?.mechanics_tier === 'tier1_compound') {
      trimmedMainRest++
      bump(trimmedMainNames, e.exercise)
      const to = e.reason.match(/-> *(\d+)s/)
      if (to) bumpNum(trimmedMainRestTo, Number(to[1]))
    }
  }

  let planBelow = false
  for (const week of meso) {
    weeksSeen++
    if (week.is_deload) { deloadWeeks++; continue }
    const weekSets = new Map<string, number>()
    for (const day of week.days) {
      for (const ex of day.exercises) {
        if (ex.prescription_type && ex.prescription_type !== 'reps') continue
        if (ex.tier === 'tier_1_primary') {
          const rest = parseRestSeconds(ex.rest)
          if (rest != null) {
            mainSlots++
            bumpNum(mainRestHistogram, rest)
            if (rest < 120) { mainBelow120++; bump(mainBelow120ByGoal, combo.goal) }
            if (rest < 60) mainBelow60++
          }
        }
        if (!isHardSet(ex.intensity)) continue
        for (const g of groupsFor(ex.name)) weekSets.set(g, (weekSets.get(g) ?? 0) + ex.sets)
      }
    }
    for (const [g, n] of weekSets) {
      bump(setsSum, g, n)
      bump(weeksTrained, g)
      if (!setsHistogram.has(g)) setsHistogram.set(g, new Map())
      const h = setsHistogram.get(g)!
      h.set(n, (h.get(n) ?? 0) + 1)
      if (n < TARGET_SETS) { bump(weeksBelow, g); planBelow = true }
    }
  }
  if (planBelow) bump(plansBelowByGoal, combo.goal)

  if ((i + 1) % Math.max(1, Math.floor(sampled.length / 10)) === 0)
    console.log(`  ${i + 1}/${sampled.length} plans (${Math.round((performance.now() - start) / 1000)}s)`)
})

// --- report ----------------------------------------------------------------
const pct = (n: number, d: number) => d === 0 ? '–' : `${(100 * n / d).toFixed(1)}%`

console.log(`\n${'='.repeat(78)}\n1. Hard sets per muscle group per week (non-deload weeks; "hard" = prescribed RPE top >= 7)\n${'='.repeat(78)}`)
console.log(`Reporting threshold: ${TARGET_SETS} sets/muscle/week — the document's figure, quoted, not adopted.\n`)
console.log('group        weeks trained   mean sets   weeks under 10   median')
for (const g of GROUP_ORDER) {
  const trained = weeksTrained.get(g) ?? 0
  if (trained === 0) { console.log(`${g.padEnd(12)} ${'0'.padStart(13)}   (never trained in any sampled week)`); continue }
  const mean = (setsSum.get(g) ?? 0) / trained
  const below = weeksBelow.get(g) ?? 0
  const h = setsHistogram.get(g)!
  const flat: number[] = []
  for (const [sets, weeks] of h) for (let k = 0; k < weeks; k++) flat.push(sets)
  flat.sort((a, b) => a - b)
  const median = flat[Math.floor(flat.length / 2)]
  console.log(`${g.padEnd(12)} ${String(trained).padStart(13)}   ${mean.toFixed(1).padStart(9)}   ${`${below} (${pct(below, trained)})`.padStart(14)}   ${String(median).padStart(6)}`)
}

console.log(`\n${'='.repeat(78)}\n2. Rest on the main lift\n${'='.repeat(78)}`)
console.log(`Main-lift slots with a parseable rest: ${mainSlots}`)
console.log(`  below 120s (the document's floor for a heavy compound): ${mainBelow120} (${pct(mainBelow120, mainSlots)})`)
console.log(`  below 60s (today's MAIN_LIFT_REST_FLOOR_SECONDS):       ${mainBelow60} (${pct(mainBelow60, mainSlots)})`)
console.log('\n  distribution:')
const restKeys = [...mainRestHistogram.keys()].sort((a, b) => a - b)
for (const r of restKeys) {
  const n = mainRestHistogram.get(r)!
  console.log(`    ${String(r).padStart(4)}s  ${String(n).padStart(7)}  ${pct(n, mainSlots).padStart(6)}  ${'#'.repeat(Math.round(60 * n / mainSlots))}`)
}
console.log('\n  below 120s by goal:')
for (const [goal, n] of [...mainBelow120ByGoal].sort((a, b) => b[1] - a[1])) console.log(`    ${goal.padEnd(14)} ${n}`)

console.log(`\n${'='.repeat(78)}\n3. What the trimmer cut\n${'='.repeat(78)}`)
console.log(`Rest-trim events across the sweep:             ${trimmedDays} (${Math.round(secondsCutTotal / 60)} min cut in total)`)
console.log(`  of those, on a tier-1 main lift:             ${trimmedMainRest} (${pct(trimmedMainRest, trimmedDays)})`)
if (trimmedMainRest > 0) {
  console.log('\n  main lifts whose rest was cut, and to what:')
  for (const [name, n] of [...trimmedMainNames].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`    ${name.padEnd(34)} ${n}`)
  console.log('\n  landing rest:')
  for (const r of [...trimmedMainRestTo.keys()].sort((a, b) => a - b)) console.log(`    ${String(r).padStart(4)}s  ${trimmedMainRestTo.get(r)}`)
}
console.log(`\nWeeks seen: ${weeksSeen} (${deloadWeeks} deload, excluded from section 1)`)
console.log(`\nDone in ${Math.round((performance.now() - start) / 1000)}s.`)

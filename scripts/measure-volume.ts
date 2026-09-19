// ---------------------------------------------------------------------------
// MEASUREMENT: how much work does a muscle actually get in a week?
// ---------------------------------------------------------------------------
// Ashley relayed a second opinion (Gemini, 18 Sep 2026) proposing a volume
// ceiling — "cap primary working sets at 20-24 per workout, with an ask-first
// warning". The gap it names is real: the app has per-EXERCISE set ceilings
// (getRoleSetCeiling: 5-6 for a main lift, 4 accessory, 3 isolation) and a
// recovery multiplier that scales everything down, and nothing anywhere adds a
// muscle's week up and asks whether the total is sensible.
//
// THIS SCRIPT BUILDS NOTHING. It answers the question that has to come first:
// does any real plan get near a ceiling, and if so, whose? A guardrail nothing
// ever trips is theatre, and a guardrail set from a literature number the app
// has nowhere else is the invented-constant mistake `edit-tradeoff.ts` already
// records having made once.
//
// THREE THINGS THAT MAKE THE NUMBERS READABLE, all of them decisions:
//
// 1. THE COUNTER IS THE APP'S OWN — `weeklySetsByMuscle` from edit-tradeoff.ts,
//    unchanged, including its primer exclusion and its deliberately generous
//    attribution (a bench press counts toward chest AND shoulders AND triceps).
//    Reused rather than re-derived because a second counter is how two readings
//    of one question end up disagreeing by an order of magnitude. THE PRICE of
//    reusing it is that these totals are NOT comparable with a textbook
//    sets-per-muscle figure — they are systematically higher. Every threshold
//    below is therefore expressed against the app's own distribution, never
//    against an outside number.
//
// 2. THE PEAK WEEK, NOT WEEK ONE — but not for the reason I first wrote here.
//    This said "volume ramps inside a block, so week 1 understates every plan".
//    MEASURED, and that is wrong for most plans: week 1 carries the heaviest
//    total set count for 73% of profiles (section 5). The per-MUSCLE peak does
//    still exceed week 1, because different muscles peak in different weeks, so
//    reading the peak remains right — the stated reason was not. Corrected here
//    rather than quietly, because the claim was an assertion and the run is what
//    settled it.
//
// 3. THE FLOOR IS MEASURED IN THE SAME RUN. A ceiling aims pressure at
//    whatever is left; the standing rule is to count what a change would take
//    away in the run that measures what it buys. A muscle sitting at two sets a
//    week is as much a defect as one sitting at forty, and nothing has ever
//    looked.
// ---------------------------------------------------------------------------

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { execFile } from 'child_process'
import { cpus } from 'os'
import { generateMesocycle, setRandomSource, resetRandomSource, getConstrainedPool } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { weeklySetsByMuscle } from '../src/lib/edit-tradeoff'
import type { MuscleGroup } from '../src/lib/exercise-db'
import type { MesocycleWeek } from '../src/lib/types'
import { EXERCISE_DATABASE, muscleGroupsOf } from '../src/lib/exercise-db'

const entryFor = (name: string) => EXERCISE_DATABASE.find(e => e.name.toLowerCase() === name.toLowerCase())
import { type Combination, buildProfile, comboKey, comboLabel, generateAllCombinations } from './quality-grid'

/**
 * The same week with its conditioning rounds taken out.
 *
 * `weeklySetsByMuscle` excludes warm-ups and counts everything else, so a
 * conditioning finisher's "sets" (which are 20-60s rounds, not fatiguing
 * strength sets — getRoleSetCeiling says so itself) land on whatever muscles
 * the catalogue names for Mountain Climbers or Skater Bounds. For a volume
 * CEILING that matters: a conditioning trainee could read as over-volumed on
 * quads purely from interval work.
 *
 * NOT A SECOND COUNTER. It changes the INPUT and calls the app's own function,
 * so the two columns can only ever differ by the rows removed here — which is
 * the whole point of printing them side by side, and is exactly what a rival
 * re-implementation could not promise.
 */
function withoutFinishers(week: MesocycleWeek): MesocycleWeek {
  return { ...week, days: week.days.map(d => ({ ...d, exercises: d.exercises.filter(e => e.tier !== 'tier_4_finisher') })) }
}

const MUSCLES: MuscleGroup[] = [
  'chest', 'back', 'erectors', 'shoulders', 'biceps', 'triceps',
  'quads', 'hamstrings', 'glutes', 'calves', 'core',
]

interface Reading {
  key: string
  label: string
  equipment: string
  duration: string
  style: string
  experience: string
  goal: string
  recovery: string
  injuries: string
  weeks: number
  /** Highest weekly total for each muscle across the whole block. */
  peak: Partial<Record<MuscleGroup, number>>
  /** Week 1 only, so the two readings can be compared rather than assumed equal. */
  week1: Partial<Record<MuscleGroup, number>>
  /** The same peak with conditioning rounds excluded — see withoutFinishers. */
  peakStrength: Partial<Record<MuscleGroup, number>>
  /** Working sets in one training day — primers and finishers both excluded. */
  dayWorking: number[]
  /** Same days, finishers (conditioning rounds) counted back in. */
  dayAll: number[]
  /** How many of this plan's days carry a conditioning row at all. */
  daysWithFinisher: number
  /**
   * Exercises per training day, warm-ups excluded. Here because refusing a
   * second main lift could leave a day one exercise SHORT rather than swapping
   * a tier-2 in — and a measurement that counts only what a change buys is
   * half a measurement.
   */
  dayExerciseCount: number[]
  /** Days carrying MORE THAN ONE tier1_compound, with an example. */
  daysWithTwoMains: number
  twoMainExample: string | null
  /** Total working sets in the block's biggest week, and which week that was. */
  peakWeekTotal: number
  peakWeekNumber: number
  /**
   * One entry per periodization BLOCK: the block's heaviest week against its
   * own deload week. Measured per block rather than across the whole
   * mesocycle, because "is the last week lighter than the peak" asked of 16
   * weeks compares the final deload to a peak three blocks earlier and answers
   * a question nobody asked.
   */
  blockDrops: { block: number; peak: number; deload: number | null }[]
  /**
   * Per block: is the deload week lighter than the last LOADING week before
   * it, on each of the three levers a deload can actually pull?
   *
   * THREE AXES, NOT ONE, AND THE FIRST READING OF THIS WAS WRONG BECAUSE IT
   * ASKED ABOUT SETS ALONE. 2,966 blocks looked like "a deload that is not
   * lighter"; the named offender turned out to drop its main lifts 15kg -> 10kg
   * and its reps 15-17 -> 13-15, while sets held at 34 because every row was
   * ALREADY at the two-set floor and there was nowhere further down to go. A
   * deload with no room in sets is supposed to take it out of load and reps —
   * `deloadNeedsRepCut` in exercise-plan.ts says exactly that.
   *
   * So the defect is a deload lighter in NONE of the three, and nothing else.
   */
  deloadAxes: { block: number; lighterSets: boolean; lighterLoad: boolean; lighterReps: boolean }[]
  /**
   * Which muscles this trainee's OWN constrained pool could have trained at
   * all, given their equipment, injuries and style.
   *
   * THE GUARD THAT MAKES A ZERO READABLE, and the one the first reading of
   * section 4 did not have. A week cannot hold what its own constraints forbid:
   * some equipment and injury combinations leave no calf movement standing, and
   * counting those as "the app gave them no calf work" is the same mistake
   * pattern coverage already made once — 832 push-less weeks that turned out to
   * be 0 the moment the pool guard was added (`poolHasPush && pushSets === 0`).
   *
   * Read off `getConstrainedPool`, the pool generation itself selects from, so
   * the guard cannot drift from what the app can actually reach.
   */
  poolSupplies: MuscleGroup[]
}

/** Midpoint of a rep range, or null for AMRAP / time / distance prescriptions. */
function repMid(reps: string | undefined): number | null {
  if (!reps) return null
  const range = reps.match(/^(\d+)\s*-\s*(\d+)$/)
  if (range) return (Number(range[1]) + Number(range[2])) / 2
  const one = reps.match(/^(\d+)$/)
  return one ? Number(one[1]) : null
}

/** Sets, tonnage and total reps for one week, warm-ups excluded. */
function weekLevers(week: MesocycleWeek): { sets: number; tonnage: number; reps: number } {
  let sets = 0, tonnage = 0, reps = 0
  for (const day of week.days) {
    for (const ex of day.exercises) {
      if (ex.tier === 'tier_0_primer') continue
      const n = ex.sets ?? 0
      sets += n
      const kg = (ex as unknown as { suggested_load_kg?: number | null }).suggested_load_kg
      if (typeof kg === 'number' && kg > 0) tonnage += kg * n
      const mid = repMid(ex.reps)
      if (mid != null) reps += mid * n
    }
  }
  return { sets, tonnage, reps }
}

function readOne(combo: Combination): Reading {
  const key = comboKey(combo)
  const profile = buildProfile(combo)
  setRandomSource(seededRngFromKey(key))
  const meso = generateMesocycle(profile)
  resetRandomSource()

  const peak: Partial<Record<MuscleGroup, number>> = {}
  const peakStrength: Partial<Record<MuscleGroup, number>> = {}
  const dayWorking: number[] = []
  const dayAll: number[] = []
  const weekTotals: number[] = []
  let daysWithFinisher = 0
  const dayExerciseCount: number[] = []
  let daysWithTwoMains = 0
  let twoMainExample: string | null = null

  const byBlock = new Map<number, { peak: number; deload: number | null }>()
  // Keyed by block: the LAST loading week seen, and the deload week.
  const leversByBlock = new Map<number, { last?: MesocycleWeek; deload?: MesocycleWeek }>()

  for (const week of meso) {
    const byMuscle = weeklySetsByMuscle(week)
    const byMuscleStrength = weeklySetsByMuscle(withoutFinishers(week))
    for (const m of MUSCLES) {
      const v = byMuscle[m] ?? 0
      if (v > (peak[m] ?? 0)) peak[m] = v
      const sv = byMuscleStrength[m] ?? 0
      if (sv > (peakStrength[m] ?? 0)) peakStrength[m] = sv
    }
    let weekTotal = 0
    for (const day of week.days) {
      if (day.exercises.length === 0) continue
      let working = 0
      let all = 0
      for (const ex of day.exercises) {
        if (ex.tier === 'tier_0_primer') continue
        const sets = ex.sets ?? 0
        all += sets
        // A conditioning "round" is 20-60s of interval work, not a fatiguing
        // strength set — getRoleSetCeiling already says so in its own comment,
        // and a ceiling built on a total that mixes the two would be counting
        // two different things. Reported both ways rather than picked for you.
        if (ex.tier !== 'tier_4_finisher') working += sets
      }
      dayWorking.push(working)
      dayAll.push(all)
      dayExerciseCount.push(day.exercises.filter(e => e.tier !== 'tier_0_primer').length)
      weekTotal += working
      if (day.exercises.some(e => e.tier === 'tier_4_finisher')) daysWithFinisher++

      // A day is supposed to hold exactly ONE main lift — selectExercisesForTrack
      // says so in its own comment ("that slot is reserved to exactly one
      // exercise per day"), and the goal-alignment scorer counts on it. Counted
      // here because this measurement is already generating every plan, and an
      // invariant nothing checks is worth a column.
      const mains = day.exercises.filter(e => entryFor(e.name)?.mechanics_tier === 'tier1_compound')
      if (mains.length > 1) {
        daysWithTwoMains++
        if (!twoMainExample) twoMainExample = `wk${week.week_number} ${day.day}: ${mains.map(m => m.name).join(' + ')}`
      }
    }
    weekTotals.push(weekTotal)

    const b = week.block_number ?? 1
    const seen = byBlock.get(b) ?? { peak: 0, deload: null }
    if (week.is_deload) seen.deload = weekTotal
    else if (weekTotal > seen.peak) seen.peak = weekTotal
    byBlock.set(b, seen)

    const lv = leversByBlock.get(b) ?? {}
    if (week.is_deload) lv.deload = week
    else lv.last = week   // weeks arrive in order, so this ends on the last loading week
    leversByBlock.set(b, lv)
  }

  return {
    key,
    label: comboLabel(combo),
    equipment: combo.equipment,
    duration: combo.duration,
    style: combo.style,
    experience: combo.experience,
    goal: combo.goal,
    recovery: combo.recovery,
    injuries: combo.injuries.join('+') || 'none',
    weeks: meso.length,
    peak,
    peakStrength,
    week1: weeklySetsByMuscle(meso.find(w => w.week_number === 1)),
    poolSupplies: (() => {
      // PRIMERS EXCLUDED, BECAUSE THE COUNTER EXCLUDES THEM.
      //
      // `weeklySetsByMuscle` skips `tier_0_primer` — a warm-up is preparation,
      // not training volume. A guard that counts primers as "the pool could
      // have trained this" therefore asks a different question from the column
      // it is guarding, and the two disagree exactly where it matters.
      //
      // MEASURED: a bodyweight trainee with a shoulder injury reads as "zero
      // chest, and the pool could have supplied some". Their pool holds
      // precisely ONE chest-capable movement — Scapular Push-Ups — and it is a
      // primer. They are correctly given it as a warm-up, and correctly given
      // no chest working sets, because every press is contraindicated for that
      // shoulder and they own no equipment. Constraint, not defect.
      //
      // Third time in one session that a first reading came out too big for the
      // same reason: the measurement did not make the exclusions the app makes.
      const pool = getConstrainedPool(profile, []).filter(e => e.mechanics_tier !== 'primer')
      const can = new Set<MuscleGroup>()
      for (const e of pool) for (const g of muscleGroupsOf(e)) can.add(g)
      return MUSCLES.filter(m => can.has(m))
    })(),
    dayWorking,
    dayAll,
    daysWithFinisher,
    dayExerciseCount,
    daysWithTwoMains,
    twoMainExample,
    peakWeekTotal: weekTotals.length ? Math.max(...weekTotals) : 0,
    peakWeekNumber: weekTotals.length ? meso[weekTotals.indexOf(Math.max(...weekTotals))].week_number : 0,
    blockDrops: [...byBlock.entries()].map(([block, v]) => ({ block, peak: v.peak, deload: v.deload })),
    deloadAxes: [...leversByBlock.entries()]
      .filter(([, v]) => v.last && v.deload)
      .map(([block, v]) => {
        const a = weekLevers(v.last!)
        const d = weekLevers(v.deload!)
        return {
          block,
          lighterSets: d.sets < a.sets,
          lighterLoad: d.tonnage < a.tonnage,
          lighterReps: d.reps < a.reps,
        }
      }),
  }
}

// ---------------------------------------------------------------------------
// Sharding — the same shape run-quality-score.ts uses, for the same reason:
// every combination is seeded by its own key, so a shard and a serial run
// cannot drift. The merge guard is kept too, because a lost combination is
// exactly the silent way a denominator shrinks.
// ---------------------------------------------------------------------------

const SHARD_ARG = process.argv.find(a => a.startsWith('--shard='))
const OUT_ARG = process.argv.find(a => a.startsWith('--out='))
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='))
const LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.slice('--limit='.length)) : 0

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[i]
}

function describe(values: number[]): string {
  const s = [...values].sort((a, b) => a - b)
  return `n=${s.length}  med=${pct(s, 50)}  p90=${pct(s, 90)}  p99=${pct(s, 99)}  max=${s[s.length - 1] ?? 0}`
}

/** Which profile attributes the worst cases cluster on, most common first. */
function cluster(rows: Reading[], field: keyof Reading): string {
  const counts = new Map<string, number>()
  for (const r of rows) {
    const v = String(r[field])
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([v, n]) => `${v} ${n}`)
    .join(', ')
}

function report(rows: Reading[]): string {
  const out: string[] = []
  const w = (s = '') => out.push(s)

  w('WEEKLY VOLUME MEASUREMENT')
  w('='.repeat(72))
  w(`${rows.length} profiles, ${rows[0]?.weeks ?? 0} weeks each (range ${Math.min(...rows.map(r => r.weeks))}-${Math.max(...rows.map(r => r.weeks))}).`)
  w()
  w('READ THIS FIRST. Sets are counted with the app\'s own weeklySetsByMuscle,')
  w('which credits one set to EVERY muscle its exercise names as primary — a')
  w('bench press counts toward chest, shoulders and triceps. That is the')
  w('ordinary generous convention and it is deliberately unchanged here, but it')
  w('means these totals run HIGHER than a textbook sets-per-muscle figure and')
  w('must not be compared with one. Every threshold below is read off this')
  w('distribution, not off an outside number.')
  w()

  // -- 1. Per-day working sets, which is what the proposal was about ---------
  w('1. WORKING SETS IN ONE SESSION')
  w('-'.repeat(72))
  const allDaysWorking = rows.flatMap(r => r.dayWorking)
  const allDaysAll = rows.flatMap(r => r.dayAll)
  w(`  working sets only (no warm-up, no conditioning rounds):  ${describe(allDaysWorking)}`)
  w(`  conditioning rounds counted in:                          ${describe(allDaysAll)}`)
  const finDays = rows.reduce((n, r) => n + r.daysWithFinisher, 0)
  w(`  (the two lines can only differ on the ${finDays} of ${allDaysWorking.length} days that carry a`)
  w('   conditioning row at all — printed so an identical pair reads as "rare",')
  w('   which is a fact, rather than as "the column is broken", which would not be.)')
  w()
  w(`  exercises per session (warm-ups excluded):               ${describe(rows.flatMap(r => r.dayExerciseCount))}`)
  w()
  for (const t of [20, 24, 30]) {
    const over = allDaysWorking.filter(v => v > t).length
    w(`  sessions over ${t} working sets: ${over} of ${allDaysWorking.length} (${(100 * over / allDaysWorking.length).toFixed(2)}%)`)
  }
  w()

  // -- 2. Per-muscle weekly peak --------------------------------------------
  w('2. WEEKLY SETS PER MUSCLE — the block\'s PEAK week')
  w('-'.repeat(72))
  w('  muscle       ' + 'peak week, everything'.padEnd(42) + 'peak week, conditioning rounds removed')
  for (const m of MUSCLES) {
    const peaks = rows.map(r => r.peak[m] ?? 0)
    const strength = rows.map(r => r.peakStrength[m] ?? 0)
    w(`  ${m.padEnd(12)} ${describe(peaks).padEnd(42)}${describe(strength)}`)
  }
  w()
  w('  And week 1 alone, for contrast with the peak column above:')
  for (const m of MUSCLES) w(`  ${m.padEnd(12)} ${describe(rows.map(r => r.week1[m] ?? 0))}`)
  w()
  w('  Week 1 is NOT uniformly the light week: it carries the heaviest TOTAL set')
  w('  count for most profiles (section 5). What the peak column adds is that')
  w('  different muscles peak in different weeks, so a per-muscle high-water mark')
  w('  is higher than any single week read alone — which is why a ceiling would')
  w('  have to be set against this column rather than against week 1.')
  w()

  // -- 3. Where the high end actually is ------------------------------------
  w('3. THE HIGH END — profiles at or above the 99th percentile for any muscle')
  w('-'.repeat(72))
  const p99 = new Map<MuscleGroup, number>()
  for (const m of MUSCLES) {
    p99.set(m, pct([...rows.map(r => r.peak[m] ?? 0)].sort((a, b) => a - b), 99))
  }
  const high = rows.filter(r => MUSCLES.some(m => (r.peak[m] ?? 0) >= (p99.get(m) ?? Infinity) && (p99.get(m) ?? 0) > 0))
  w(`  ${high.length} profiles (${(100 * high.length / rows.length).toFixed(1)}%). They cluster on:`)
  for (const f of ['goal', 'experience', 'recovery', 'duration', 'style', 'equipment'] as (keyof Reading)[]) {
    w(`    ${String(f).padEnd(11)} ${cluster(high, f)}`)
  }
  w()
  w('  The ten highest single readings, named so a gate can pin them:')
  const worst = rows
    .map(r => {
      let m: MuscleGroup = MUSCLES[0]
      let v = 0
      for (const g of MUSCLES) if ((r.peak[g] ?? 0) > v) { v = r.peak[g] ?? 0; m = g }
      return { r, m, v }
    })
    .sort((a, b) => b.v - a.v)
    .slice(0, 10)
  for (const { r, m, v } of worst) w(`    ${String(v).padStart(3)} sets of ${m.padEnd(10)} ${r.key}`)
  w()

  // -- 4. The floor, measured in the same run -------------------------------
  w('4. THE LOW END — and what is a CONSTRAINT rather than a defect')
  w('-'.repeat(72))
  w('  A week cannot hold what its own equipment and injuries forbid. Every row')
  w('  below is split on that question, read off getConstrainedPool — the pool')
  w('  generation itself selects from. Pattern coverage learned this the hard')
  w('  way (832 phantom push-less weeks, 0 once the same guard was added), so')
  w('  the unguarded column is printed beside the guarded one rather than')
  w('  replaced by it.')
  w()
  w('  muscle       zero sets, pool COULD    zero, pool could not   under 5, pool COULD')
  for (const m of MUSCLES) {
    const could = rows.filter(r => r.poolSupplies.includes(m))
    const couldNot = rows.filter(r => !r.poolSupplies.includes(m))
    const zeroReal = could.filter(r => (r.peak[m] ?? 0) === 0).length
    const zeroConstrained = couldNot.filter(r => (r.peak[m] ?? 0) === 0).length
    const thinReal = could.filter(r => (r.peak[m] ?? 0) > 0 && (r.peak[m] ?? 0) < 5).length
    w(`  ${m.padEnd(12)} ${String(zeroReal).padStart(10)}${' '.repeat(12)}${String(zeroConstrained).padStart(8)}${' '.repeat(15)}${String(thinReal).padStart(6)}`)
  }
  w()
  w('  The first column is the only one that could be a defect: the app had')
  w('  something it could have given this person for that muscle, and gave none.')
  w()
  for (const m of MUSCLES) {
    const offenders = rows.filter(r => r.poolSupplies.includes(m) && (r.peak[m] ?? 0) === 0)
    if (offenders.length === 0) continue
    w(`  ${m} — ${offenders.length} profiles, clustering on:`)
    for (const f of ['equipment', 'duration', 'style', 'experience', 'goal', 'injuries'] as (keyof Reading)[]) {
      w(`    ${String(f).padEnd(11)} ${cluster(offenders, f)}`)
    }
    for (const r of offenders.slice(0, 4)) w(`    named: ${r.key}`)
    w()
  }

  // -- 5. Does the block step back at the end? ------------------------------
  w('5. DELOAD SANITY — inside each block, is the deload week lighter?')
  w('-'.repeat(72))
  const blocks = rows.flatMap(r => r.blockDrops.map(b => ({ ...b, key: r.key })))
  const withDeload = blocks.filter(b => b.deload != null)
  const notLighter = withDeload.filter(b => (b.deload as number) >= b.peak)
  w(`  blocks measured: ${blocks.length}   of which carry a deload week: ${withDeload.length}`)
  w(`  drop in total working sets, peak week -> deload week: ${describe(withDeload.map(b => b.peak - (b.deload as number)))}`)
  w(`  deload weeks NOT lighter than their own block's peak: ${notLighter.length} of ${withDeload.length}`)
  for (const b of notLighter.slice(0, 5)) w(`    block ${b.block}: peak ${b.peak} -> deload ${b.deload}   ${b.key}`)
  w()
  // THE THREE LEVERS. A deload can take work out of sets, out of load, or out
  // of reps, and `deloadNeedsRepCut` in the generator says so outright: when
  // the two-set floor leaves no room, the rep target absorbs the reduction.
  // Asking about sets alone is what made 2,966 blocks look broken.
  const axes = rows.flatMap(r => r.deloadAxes.map(a => ({ ...a, key: r.key })))
  const lighterIn = (f: (a: typeof axes[number]) => boolean) => axes.filter(f).length
  w('  Against the LAST LOADING WEEK of the same block, the deload is lighter in:')
  w(`    sets           ${String(lighterIn(a => a.lighterSets)).padStart(6)} of ${axes.length}`)
  w(`    load           ${String(lighterIn(a => a.lighterLoad)).padStart(6)}`)
  w(`    reps           ${String(lighterIn(a => a.lighterReps)).padStart(6)}`)
  w(`    at least one   ${String(lighterIn(a => a.lighterSets || a.lighterLoad || a.lighterReps)).padStart(6)}`)
  const lighterInNothing = axes.filter(a => !a.lighterSets && !a.lighterLoad && !a.lighterReps)
  w(`  DELOADS LIGHTER IN NOTHING AT ALL: ${lighterInNothing.length} of ${axes.length}`)
  w('    (this, not the sets column, is the number that would be a defect)')
  if (lighterInNothing.length > 0) {
    w('  they cluster on:')
    for (const f of ['equipment', 'duration', 'style', 'experience', 'goal', 'recovery'] as (keyof Reading)[]) {
      const owners = rows.filter(r => r.deloadAxes.some(a => !a.lighterSets && !a.lighterLoad && !a.lighterReps))
      w(`    ${String(f).padEnd(11)} ${cluster(owners, f)}`)
    }
    w('  named, so a gate can pin them:')
    for (const a of lighterInNothing.slice(0, 10)) w(`    block ${a.block}  ${a.key}`)
  }
  w()

  const peakWeeks = rows.map(r => r.peakWeekNumber)
  const wc = new Map<number, number>()
  for (const n of peakWeeks) wc.set(n, (wc.get(n) ?? 0) + 1)
  w(`  which week carries the heaviest total: ${[...wc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n, c]) => `wk${n} x${c}`).join(', ')}`)
  w()

  w('6. ONE MAIN LIFT PER DAY — an invariant nothing currently checks')
  w('-'.repeat(72))
  const twoMainDays = rows.reduce((n, r) => n + r.daysWithTwoMains, 0)
  const affected = rows.filter(r => r.daysWithTwoMains > 0)
  w(`  days carrying more than one tier-1 compound: ${twoMainDays} of ${allDaysWorking.length}`)
  w(`  profiles affected: ${affected.length} of ${rows.length} (${(100 * affected.length / rows.length).toFixed(1)}%)`)
  if (affected.length > 0) {
    for (const f of ['goal', 'experience', 'duration', 'style', 'equipment'] as (keyof Reading)[]) {
      w(`    ${String(f).padEnd(11)} ${cluster(affected, f)}`)
    }
    w('  examples:')
    for (const r of affected.slice(0, 8)) w(`    ${r.twoMainExample}   ${r.key}`)
  }
  w()

  return out.join('\n')
}

async function main() {
  if (SHARD_ARG) {
    if (!OUT_ARG) throw new Error('--shard needs --out=<path>')
    const [meRaw, ofRaw] = SHARD_ARG.slice('--shard='.length).split('/')
    const me = Number(meRaw), of = Number(ofRaw)
    let combos = generateAllCombinations()
    if (LIMIT > 0) combos = combos.slice(0, LIMIT)
    const rows: Reading[] = []
    for (let i = 0; i < combos.length; i++) if (i % of === me) rows.push(readOne(combos[i]))
    fs.writeFileSync(OUT_ARG.slice('--out='.length), JSON.stringify(rows), 'utf-8')
    return
  }

  let combos = generateAllCombinations()
  if (LIMIT > 0) combos = combos.slice(0, LIMIT)
  const workers = Math.max(1, Math.min(4, cpus().length))
  console.log(`Measuring weekly volume across ${combos.length} profiles, ${workers} processes...`)

  const self = new URL(import.meta.url).pathname
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'volume-shard-'))
  const parts = await Promise.all(Array.from({ length: workers }, (_, k) => new Promise<Reading[]>((resolve, reject) => {
    const outPath = path.join(dir, `${k}.json`)
    const args = [self, `--shard=${k}/${workers}`, `--out=${outPath}`]
    if (LIMIT > 0) args.push(`--limit=${LIMIT}`)
    execFile('npx', ['tsx', ...args], { cwd: process.cwd(), maxBuffer: 256 * 1024 * 1024 }, err => {
      if (err) return reject(err)
      try { resolve(JSON.parse(fs.readFileSync(outPath, 'utf-8')) as Reading[]) } catch (e) { reject(e) }
    })
  })))
  fs.rmSync(dir, { recursive: true, force: true })

  const merged: Reading[] = new Array(combos.length)
  for (let k = 0; k < workers; k++) parts[k].forEach((r, j) => { merged[j * workers + k] = r })
  const missing = merged.findIndex(x => x === undefined)
  if (missing >= 0) throw new Error(`shard merge lost combination ${missing} of ${combos.length}`)

  const formatted = report(merged)
  console.log('')
  console.log(formatted)
  const outputPath = path.join(process.cwd(), 'volume-report.txt')
  fs.writeFileSync(outputPath, formatted, 'utf-8')
  console.log(`\nReport saved to: ${outputPath}`)
}

main().catch(err => {
  console.error('Volume measurement failed:', err)
  process.exit(1)
})

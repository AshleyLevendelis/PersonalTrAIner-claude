// ---------------------------------------------------------------------------
// Gate: A DELOAD WEEK IS LIGHTER THAN THE WEEK BEFORE IT — in something.
//
// A deload has exactly three levers: fewer sets, less weight, fewer reps. It
// does not have to pull all three; it has to pull at least one, or the week the
// app calls "Deload week — volume steps back so you arrive at the next block
// recovered" is a fourth identical hard week with a reassuring label on it.
//
// MEASURED 18 Sep 2026 (docs/audits/weekly-volume-2026-09-18.md), 9,216
// profiles x 16 weeks = 36,864 blocks: 252 ran a deload lighter in NOTHING.
// They cluster almost perfectly on BODYWEIGHT equipment with LOW recovery, and
// the mechanism is a branch that was right for the case it was written for:
//
//   - no external load, so the weight lever does not exist;
//   - low recovery already scales base sets down, so `Math.max(2, ...)` binds
//     on the LOADING weeks too and the deload's 0.5x cut buys nothing;
//   - and the rep cut that exists for exactly this dead end was gated on
//     `deloadAtFloor`, which needs an equipment floor and therefore can never
//     be true of a press-up.
//
// So the deload took the default branch — reps +2, the "lighter bar, easier
// reps" move — which is meaningless without a bar. On the pinned fixture the
// arithmetic worked out to a deload week IDENTICAL to week 3, rep for rep,
// because the +2 bump exactly cancelled the two ramp steps the deload does not
// take. Worth stating precisely: the defect was a copy, not an increase.
//
// AND THE FIRST READING OF THIS WAS 12x TOO BIG. Asking only "does the set
// count fall?" flagged 2,966 blocks. The named offender there dropped its main
// lifts 15kg -> 10kg and its reps 15-17 -> 13-15 and was a perfectly good
// deload; its sets held because every row was already at the two-set floor.
// A one-lever question about a three-lever mechanism is not a measurement.
// ---------------------------------------------------------------------------

import fs from 'fs'
import path from 'path'
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { getExerciseEntry } from '../src/lib/exercise-db'
import { generateAllCombinations, buildProfile, comboKey } from './quality-grid'
import type { MesocycleWeek } from '../src/lib/types'

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}

const repMid = (reps: string | undefined): number | null => {
  if (!reps) return null
  const r = reps.match(/^(\d+)\s*-\s*(\d+)$/)
  if (r) return (Number(r[1]) + Number(r[2])) / 2
  const one = reps.match(/^(\d+)$/)
  return one ? Number(one[1]) : null
}

/** The three levers, for one week. Warm-ups excluded — they are not the work. */
function levers(week: MesocycleWeek) {
  let sets = 0, tonnage = 0, reps = 0, loadedRows = 0
  for (const day of week.days) {
    for (const ex of day.exercises) {
      if (ex.tier === 'tier_0_primer') continue
      const n = ex.sets ?? 0
      sets += n
      const kg = (ex as unknown as { suggested_load_kg?: number | null }).suggested_load_kg
      if (typeof kg === 'number' && kg > 0) { tonnage += kg * n; loadedRows++ }
      const mid = repMid(ex.reps)
      if (mid != null) reps += mid * n
    }
  }
  // The mean rep TARGET per row, which is a different question from total
  // reps: a deload that halves sets lowers total reps even while easing the
  // rep range up. 2d needs the range; 1c needs the total.
  let rowCount = 0, midSum = 0
  for (const day of week.days) {
    for (const ex of day.exercises) {
      if (ex.tier === 'tier_0_primer') continue
      const mid = repMid(ex.reps)
      if (mid != null) { rowCount++; midSum += mid }
    }
  }
  return { sets, tonnage, reps, loadedRows, meanRep: rowCount ? midSum / rowCount : 0 }
}

const combos = new Map(generateAllCombinations().map(c => [comboKey(c), c]))
function plan(key: string): MesocycleWeek[] {
  const combo = combos.get(key)
  if (!combo) throw new Error(`fixture not in the grid: ${key}`)
  setRandomSource(seededRngFromKey(key))
  try { return generateMesocycle(buildProfile(combo)) } finally { resetRandomSource() }
}

/** Every block's last loading week paired with its deload week. */
function blockPairs(weeks: MesocycleWeek[]) {
  const byBlock = new Map<number, { last?: MesocycleWeek; deload?: MesocycleWeek }>()
  for (const w of weeks) {
    const b = w.block_number ?? 1
    const e = byBlock.get(b) ?? {}
    if (w.is_deload) e.deload = w; else e.last = w
    byBlock.set(b, e)
  }
  return [...byBlock.entries()]
    .filter(([, e]) => e.last && e.deload)
    .map(([block, e]) => ({ block, before: levers(e.last!), deload: levers(e.deload!) }))
}

// ---------------------------------------------------------------------------
console.log('\n[1] The profiles the measurement named')
// ---------------------------------------------------------------------------
{
  // Not profiles that looked likely — the keys the 9,216-profile run printed,
  // seeded the way it seeded them. Bodyweight + low recovery is the corner
  // where all three levers can run out at once, and it is not a corner anyone
  // would have guessed from reading the code.
  const OFFENDERS = [
    'bodyweight|shoulders|30-45|bodybuilding|beginner|conditioning|low|tolerate',
    'bodyweight|knees|45-60|bodybuilding|beginner|conditioning|low|love',
    'bodyweight|none|45-60|functional|intermediate|functional|low|tolerate',
    'bodyweight|shoulders|30-45|bodybuilding|novice|fat_loss|low|avoid',
  ]

  let pairsSeen = 0
  let atSetFloorAndUnloaded = 0
  const notLighter: string[] = []

  for (const key of OFFENDERS) {
    for (const p of blockPairs(plan(key))) {
      pairsSeen++
      // The fixture must really BE the hard case, or this section proves
      // nothing: no weight anywhere to shed, and no room left in sets.
      if (p.before.loadedRows === 0 && p.deload.sets >= p.before.sets) atSetFloorAndUnloaded++
      const lighter = p.deload.sets < p.before.sets || p.deload.tonnage < p.before.tonnage || p.deload.reps < p.before.reps
      if (!lighter) notLighter.push(`${key} block ${p.block}: ${JSON.stringify(p.before)} -> ${JSON.stringify(p.deload)}`)
    }
  }

  check(`1a. the fixtures produced deload pairs (${pairsSeen})`, pairsSeen >= 8, pairsSeen)
  check(`1b. and they really are the dead-end case — unloaded, sets already at the floor (${atSetFloorAndUnloaded})`,
    atSetFloorAndUnloaded > 0,
    { why: 'if a fixture had a weight to drop, 1c would pass for the wrong reason' })
  check('1c. every deload is lighter in sets, load or reps', notLighter.length === 0, notLighter.slice(0, 3))
}

/** Per exercise NAME: its rep target and its weight, for one week. */
function rowsByName(week: MesocycleWeek) {
  const out = new Map<string, { rep: number | null; kg: number | null; sets: number }>()
  for (const day of week.days) {
    for (const ex of day.exercises) {
      if (ex.tier === 'tier_0_primer') continue
      const kg = (ex as unknown as { suggested_load_kg?: number | null }).suggested_load_kg
      out.set(ex.name, { rep: repMid(ex.reps), kg: typeof kg === 'number' && kg > 0 ? kg : null, sets: ex.sets ?? 0 })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
console.log('\n[2] The ordinary loaded deload still behaves the old way')
// ---------------------------------------------------------------------------
{
  // The fix widens when reps carry the reduction. It must not steal the
  // classic move from a lift that has a bar to unload: weight down, reps
  // comfortably UP. Breaking that would be a regression dressed as a fix.
  const LOADED = 'full_gym|none|60-90|bodybuilding|intermediate|hypertrophy|high|avoid'
  const pairs = blockPairs(plan(LOADED))
  check(`2a. the loaded fixture produced deload pairs (${pairs.length})`, pairs.length > 0)
  const withWeight = pairs.filter(p => p.before.loadedRows > 0 && p.deload.loadedRows > 0)
  check(`2b. and it actually carries weight (${withWeight.length})`, withWeight.length > 0)
  check('2c. the weight comes down', withWeight.every(p => p.deload.tonnage < p.before.tonnage),
    withWeight.map(p => [p.before.tonnage, p.deload.tonnage]))
  // PER ROW, MATCHED BY NAME — and TWO WRONG ASSERTIONS ON THE WAY HERE, both
  // mine, both worth recording because each encoded an assumption about the
  // code rather than a reading of it.
  //
  // The first compared TOTAL reps (sets x target) and went red, because the
  // deload halves sets and the total falls even while the rep RANGE eases up.
  //
  // The second asserted that every loaded lift drops weight. It does not, and
  // should not: a Rear Delt Flye at 2kg is already at the lightest thing in
  // the gym, so `deloadAtFloor` holds the weight and takes the reduction out of
  // sets and reps instead. Checked against the pre-fix engine in a worktree
  // before believing the failure — those rows behave identically either side of
  // this change, so the assertion was wrong, not the code.
  //
  // What is actually true, and is what a coach would check: EVERY row gives
  // something up, and the bar lever is still being used where a bar exists.
  const weeks = plan(LOADED)
  const b1 = weeks.filter(w => (w.block_number ?? 1) === 1)
  const lastLoading = [...b1].reverse().find(w => !w.is_deload)!
  const deloadWeek = b1.find(w => w.is_deload)!
  const before = rowsByName(lastLoading)
  const after = rowsByName(deloadWeek)

  const paired = [...before.entries()].filter(([n]) => after.has(n))
  check(`2d. rows appear in both weeks to compare (${paired.length})`, paired.length > 5, paired.length)

  const gaveNothing = paired.filter(([n, v]) => {
    const d = after.get(n)!
    const lighterLoad = v.kg != null && d.kg != null && d.kg < v.kg
    const lighterReps = v.rep != null && d.rep != null && d.rep < v.rep
    const lighterSets = (d.sets ?? 0) < (v.sets ?? 0)
    return !lighterLoad && !lighterReps && !lighterSets
  })
  check('2e. every row gives up weight, reps or sets', gaveNothing.length === 0,
    gaveNothing.map(([n, v]) => `${n}: ${JSON.stringify(v)} -> ${JSON.stringify(after.get(n))}`).slice(0, 3))

  const weightDropped = paired.filter(([n, v]) => v.kg != null && after.get(n)!.kg != null && (after.get(n)!.kg as number) < (v.kg as number))
  check(`2f. and the bar lever is still in use where a bar exists (${weightDropped.length} rows)`,
    weightDropped.length > 0,
    { why: 'if this hits zero the fix has stolen the classic deload from loaded lifts' })

  // The other half of the same plan: unloaded rows DO take the rep cut, which
  // is the fix working inside a plan that also contains barbells.
  const unloadedBoth = paired.filter(([n, v]) => v.kg == null && after.get(n)!.kg == null)
  const unloadedCut = unloadedBoth.filter(([n, v]) =>
    v.rep != null && after.get(n)!.rep != null && (after.get(n)!.rep as number) < v.rep)
  check(`2g. unloaded rows in the same week take the rep cut (${unloadedCut.length} of ${unloadedBoth.length})`,
    unloadedBoth.length === 0 || unloadedCut.length > 0,
    unloadedBoth.map(([n, v]) => `${n}: ${v.rep} -> ${after.get(n)!.rep}`).slice(0, 3))
}

// ---------------------------------------------------------------------------
console.log('\n[3] The rule is keyed on the lever, not on the bar floor')
// ---------------------------------------------------------------------------
{
  const src = fs.readFileSync(path.join(process.cwd(), 'src/lib/exercise-plan.ts'), 'utf8')
  const noComments = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n')

  check('3a. the deload rep shift asks whether the load lever is dead',
    /phaseRepShift = isDeload\s*\?\s*\(deloadLoadLeverDead/.test(noComments),
    { why: 'keyed on deloadAtFloor alone, a bodyweight lift can never reach the rep cut' })
  check('3b. and "dead" covers an exercise that never carried weight',
    /deloadLoadLeverDead[\s\S]{0,200}!isExternallyLoaded\(/.test(noComments))
  // The outright cut is the narrower case and must stay narrower: reps only
  // DROP when sets gave nothing, otherwise they hold flat and sets do the work.
  check('3c. the outright rep cut still asks whether sets gave anything',
    /deloadNeedsRepCut = deloadLoadLeverDead && deloadSets >= loadingWeekSets/.test(noComments))
  // Prove the detectors can fail, so none of the three can go vacuous.
  check('3d. the detectors reject the old form',
    !/phaseRepShift = isDeload\s*\?\s*\(deloadLoadLeverDead/.test('const phaseRepShift = isDeload ? (deloadAtFloor ? a : b) : c'))
}

console.log(failures === 0 ? '\nPASS\n' : `\n${failures} FAILED\n`)
if (failures > 0) process.exit(1)

// ---------------------------------------------------------------------------
// WHEN A WEEK REPEATS ITSELF, DID ANYTHING ELSE MOVE?  A measurement, not a
// gate.
//
// The records have said for weeks that "nearly half of all plans carry a week
// where load and reps both stand still", and that number is real. What nobody
// had separated is the three very different things hiding inside it:
//
//   progressed elsewhere  load and reps held, but the SETS went up, or the
//                         tempo slowed, or a dip belt got heavier, or the
//                         machine took less of the weight. That is textbook
//                         progressive overload and the frozen_week rule
//                         cannot see any of it, because it compares exactly
//                         two fields.
//   stalled, and said so  no lever moved, and the app already knows: the
//                         prescription is at a ceiling and the card carries
//                         "at your estimate's ceiling" / "as heavy as this
//                         gets" (progression-ceiling.ts, Ashley's 5 Sep
//                         ruling).
//   stalled, and silent   no lever moved and nothing on the card says so.
//                         THIS is the residue the audit is for.
//
// RPE is measured and deliberately NOT counted as a lever. A different effort
// LABEL beside an identical load and rep target is a description of the same
// session, not more work — the scorer's own deduction text says as much
// ("only the RPE label differs"). Rest is measured and not counted either,
// for a different reason: rest moves here because the time-cap trimmer and
// the phase's rest shift moved it, not because anything decided to train
// denser. Counting either as progress would be the flattering kind of
// accounting this file exists to avoid; both are printed so the decision can
// be re-argued against the numbers rather than the claim.
//
// The rule and the grid are both IMPORTED (frozen-pairs.ts, quality-grid.ts)
// so this cannot quietly measure a different question from
// measure-frozen-exercises.ts. Section 6 cross-checks against scorePlan for
// the same reason that script does.
//
// Usage:  npx tsx scripts/measure-progression-levers.ts [--stride=N]
// ---------------------------------------------------------------------------
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { scorePlan } from '../src/lib/quality-score'
import { atPrescribedCeiling } from '../src/lib/progression-ceiling'
import { categorize, getLoadIncrementKg } from '../src/lib/load-prescription'
import { EXERCISE_DATABASE } from '../src/lib/exercise-db'
import { getGoalPolicy } from '../src/lib/goal-policies'
import { buildProfile, comboKey, generateAllCombinations } from './quality-grid'
import { sweepFrozen, causeOf, type SlotPair } from './frozen-pairs'
import type { MesocycleWeek, Exercise } from '../src/lib/types'

// --- the levers -------------------------------------------------------------
// Each answers "did THIS get harder from week A to week B?". Direction
// matters: more sets is harder, a slower tempo is harder, LESS machine
// assistance is harder.
const num = (v: number | null | undefined) => (v == null ? null : v)

function tempoSeconds(t: string | undefined): number | null {
  if (!t) return null
  const parts = t.split('-').map(p => Number(p))
  if (parts.length === 0 || parts.some(p => !Number.isFinite(p))) return null
  return parts.reduce((a, b) => a + b, 0)
}

interface LeverMove { name: string; harder: boolean; from: string; to: string }

function leversThatMoved(exA: Exercise, exB: Exercise): LeverMove[] {
  const out: LeverMove[] = []
  const push = (name: string, a: unknown, b: unknown, harder: boolean) =>
    out.push({ name, harder, from: String(a ?? '–'), to: String(b ?? '–') })

  if (exA.sets !== exB.sets) push('sets', exA.sets, exB.sets, exB.sets > exA.sets)

  // A tempo APPEARING is harder (there was no instruction, now the eccentric
  // is controlled); one disappearing is easier; two present compare by total
  // seconds under tension. Lumping "appeared" in with "got faster" would have
  // printed 516 easier / 0 harder and read as a lever that only ever goes
  // backwards, which is a claim about the detector, not the app.
  const ta = tempoSeconds(exA.tempo), tb = tempoSeconds(exB.tempo)
  if (exA.tempo !== exB.tempo)
    push('tempo', exA.tempo, exB.tempo, ta == null ? tb != null : tb != null && tb > ta)

  const aa = num(exA.suggested_added_load_kg), ab = num(exB.suggested_added_load_kg)
  if (aa !== ab) push('added load', aa, ab, (ab ?? 0) > (aa ?? 0))

  const sa = num(exA.suggested_assistance_kg), sb = num(exB.suggested_assistance_kg)
  if (sa !== sb) push('assistance', sa, sb, (sb ?? 0) < (sa ?? 0))

  return out
}

/** Measured, reported, and deliberately not counted as overload — see header. */
function labelsThatMoved(exA: Exercise, exB: Exercise): string[] {
  const out: string[] = []
  if (exA.intensity !== exB.intensity) out.push('RPE')
  if (exA.rest !== exB.rest) out.push('rest')
  return out
}

type Verdict = 'progressed elsewhere' | 'stalled, and said so' | 'stalled, and silent'

function verdictFor(slot: SlotPair): { verdict: Verdict; movers: LeverMove[] } {
  const movers = leversThatMoved(slot.exA, slot.exB).filter(m => m.harder)
  if (movers.length > 0) return { verdict: 'progressed elsewhere', movers }
  return { verdict: atPrescribedCeiling(slot.exB) ? 'stalled, and said so' : 'stalled, and silent', movers }
}

// --- sweep ------------------------------------------------------------------
const bump = (m: Map<string, number>, k: string, n = 1) => m.set(k, (m.get(k) ?? 0) + n)
const stride = Math.max(1, Number((process.argv.find(a => a.startsWith('--stride=')) ?? '--stride=1').split('=')[1]) || 1)
const combos = generateAllCombinations()
const sampled = combos.filter((_, i) => i % stride === 0)
console.log(`Progression levers — ${combos.length} combinations in the grid, sweeping ${sampled.length}${stride > 1 ? ` (every ${stride}th)` : ''}\n`)

let considered = 0, frozen = 0, plansWithAny = 0, crossChecked = 0, mismatches = 0
let fromCalibration = 0, firstWeekOfBlock = 0, calibrationWeeksSeen = 0
// Section 0's whole job: prove the detectors below can FIRE. "No frozen pair
// moved another lever" and "the field is never read correctly" print the same
// zero, and nothing about reading the code tells them apart.
const anyLever = new Map<string, number>()
const frozenByWeek = new Map<string, number>()
const silentBackstory = new Map<string, number>()
const silentAffordability = new Map<string, number>()
const silentCrossTab = new Map<string, number>()
const silentLever = new Map<string, number>()
const catalogue = new Map(EXERCISE_DATABASE.map(e => [e.name, e]))
// exercise-plan.ts's own threshold: when one real notch is more than this
// share of the current load, the weight holds flat and reps ramp instead.
// Named there as loadStepUnaffordable, with the comment "this can legitimately
// take a whole block or more on light isolation work; that's correct, not a
// bug". Re-derived here rather than guessed, so the report can say how much of
// the silent residue is that documented decision rather than something broken.
const STEP_UNAFFORDABLE_ABOVE = 0.12
const backstoryExamples: string[] = []
const calibrationWeekNumbers = new Set<number>()
const byVerdict = new Map<string, number>()
const plansByVerdict = new Map<string, number>()
const byLever = new Map<string, number>()
const byLabel = new Map<string, number>()
const silentByCause = new Map<string, number>()
const silentByName = new Map<string, number>()
const silentByEquipment = new Map<string, number>()
const silentByExperience = new Map<string, number>()
const silentByGoal = new Map<string, number>()
const silentExamples: string[] = []
const moverExamples = new Map<string, string[]>()
const start = performance.now()
const realLog = console.log
const realWarn = console.warn
const realDebug = console.debug

sampled.forEach((combo, i) => {
  const key = comboKey(combo)
  setRandomSource(seededRngFromKey(key))
  console.log = () => {}; console.warn = () => {}; console.debug = () => {}
  let meso: MesocycleWeek[]
  try { meso = generateMesocycle(buildProfile(combo)) } finally {
    console.log = realLog; console.warn = realWarn; console.debug = realDebug
  }
  resetRandomSource()

  // Every appearance of every lift, in week order, so a silent pair can be
  // asked what happened to it EARLIER in the same block. One trace is not a
  // finding; this is the sweep behind the one in section 6b.
  const history = new Map<string, { week: number; block: number; hold?: string; bump?: string; kg: number | null }[]>()
  for (const w of meso) for (const d of w.days) for (const e of d.exercises) {
    const list = history.get(e.name) ?? []
    list.push({ week: w.week_number, block: w.block_number ?? 0, hold: e.load_hold, bump: e.rep_bump, kg: e.suggested_load_kg ?? null })
    history.set(e.name, list)
  }
  const blockOf = new Map(meso.map(w => [w.week_number, w.block_number ?? 0]))

  const calibrationWeeks = new Set(meso.filter(w => w.isCalibrationWeek).map(w => w.week_number))
  calibrationWeeksSeen += calibrationWeeks.size
  for (const w of calibrationWeeks) calibrationWeekNumbers.add(w)
  const sweep = sweepFrozen(meso)
  for (const slot of sweep.considered)
    for (const m of leversThatMoved(slot.exA, slot.exB))
      bump(anyLever, `${m.name} (${m.harder ? 'harder' : 'easier'})`)
  considered += sweep.considered.length
  frozen += sweep.frozen.length
  if (sweep.frozen.length > 0) plansWithAny++

  const verdictsHere = new Set<string>()
  for (const slot of sweep.frozen) {
    if (calibrationWeeks.has(slot.weekA)) fromCalibration++
    if (slot.weekA % 4 === 1) firstWeekOfBlock++
    bump(frozenByWeek, `week ${String(slot.weekA).padStart(2)} -> ${slot.weekB}`)
    const { verdict, movers } = verdictFor(slot)
    bump(byVerdict, verdict)
    verdictsHere.add(verdict)
    for (const m of movers) {
      bump(byLever, m.name)
      const ex = moverExamples.get(m.name) ?? []
      if (ex.length < 3) ex.push(`${slot.exA.name} wk${slot.weekA}->${slot.weekB}: ${m.name} ${m.from} -> ${m.to} (${slot.exA.reps} @ ${slot.exA.suggested_load_kg ?? 'bodyweight'})`)
      moverExamples.set(m.name, ex)
    }
    for (const l of labelsThatMoved(slot.exA, slot.exB)) bump(byLabel, l)

    if (verdict === 'stalled, and silent') {
      const cause = causeOf({
        name: slot.exA.name, reps: slot.exA.reps, kg: slot.exA.suggested_load_kg ?? null,
        weekA: slot.weekA, weekB: slot.weekB, hold: slot.exB.load_hold, bump: slot.exB.rep_bump,
      })
      bump(silentByCause, cause); bump(silentByName, slot.exA.name)
      bump(silentByEquipment, combo.equipment); bump(silentByExperience, combo.experience)
      bump(silentByGoal, combo.goal)
      // What was this lift doing before it went quiet?
      const block = blockOf.get(slot.weekA) ?? 0
      // Up to and INCLUDING week A: week A is the first half of the frozen
      // pair, so what it recorded is part of the backstory, not the outcome.
      const earlier = (history.get(slot.exA.name) ?? []).filter(h => h.block === block && h.week <= slot.weekA)
      const heldEarlier = earlier.some(h => h.hold === 'ceiling' || h.hold === 'implement')
      const boughtEarlier = earlier.some(h => h.bump === 'bought')
      const story = heldEarlier && boughtEarlier
        ? 'was at a ceiling, then bought a rep — label lost'
        : heldEarlier ? 'was at a ceiling earlier this block, label lost'
        : boughtEarlier ? 'bought a rep earlier this block, no ceiling recorded'
        : earlier.length === 0 ? 'first appearance in the block'
        : 'never held, never bumped — just did not move'
      bump(silentBackstory, story)

      const entry = catalogue.get(slot.exA.name)
      const kg = slot.exA.suggested_load_kg
      if (!entry || kg == null || kg <= 0) bump(silentAffordability, 'no load to reason about')
      else {
        const step = getLoadIncrementKg(entry, categorize(entry), kg)
        const share = step / kg
        bump(silentCrossTab, `${share > STEP_UNAFFORDABLE_ABOVE ? 'notch too big' : 'notch affordable'}  x  ${story}`)
        bump(silentAffordability, share > STEP_UNAFFORDABLE_ABOVE
          ? `one notch would be ${(100 * STEP_UNAFFORDABLE_ABOVE).toFixed(0)}%+ of the load`
          : 'one notch would have been affordable')
      }
      // WHY THE WEIGHT WAS NOT GOING UP, which is not the same question as
      // whether a step would have been affordable — and mistaking the second
      // for the first cost this audit a wrong prediction. The affordability
      // rule is only CONSULTED for a load-ramping candidate: a non-compound
      // accessory under a 'reps' or 'maintain' goal never reaches it, because
      // that goal's lever was never load in the first place.
      const emphasis = getGoalPolicy(combo.goal).progressionEmphasis
      const mainCompound = entry?.mechanics_tier === 'tier1_compound'
      bump(silentLever, slot.exB.load_hold === 'unaffordable_step'
        ? 'the app recorded it: one real notch is too big a jump'
        : emphasis === 'load' || mainCompound
          ? `load IS this goal's lever (${emphasis}) and the weight still stopped — unexplained`
          : `load was never this goal's lever (${emphasis}) — reps are, and the reps stopped too`)
      if (backstoryExamples.length < 10)
        backstoryExamples.push(`${story.slice(0, 26).padEnd(28)}${slot.exA.name} [${combo.equipment}/${combo.experience}] block ${block}: `
          + earlier.concat([{ week: slot.weekB, block, hold: slot.exB.load_hold, bump: slot.exB.rep_bump, kg: slot.exB.suggested_load_kg ?? null }])
              .map(h => `wk${h.week} ${h.kg ?? 'bw'}kg hold=${h.hold ?? '-'} bump=${h.bump ?? '-'}`).join(' | '))
      if (silentExamples.length < 8)
        silentExamples.push(`${slot.exA.name.padEnd(24)} wk${slot.weekA}->${slot.weekB}  ${slot.exA.sets}x${slot.exA.reps} @ ${slot.exA.suggested_load_kg ?? 'bw'}  hold=${slot.exB.load_hold ?? '-'} bump=${slot.exB.rep_bump ?? '-'}  [${combo.equipment}/${combo.experience}/${combo.goal}]`)
    }
  }
  for (const v of verdictsHere) bump(plansByVerdict, v)

  if (i % 101 === 0) {
    crossChecked++
    const scored = scorePlan(buildProfile(combo), meso, key)
    const scorerCount = scored.dimensions.progression.deductions.filter(d => d.rule === 'frozen_week').length
    if (scorerCount !== sweep.frozen.length) { mismatches++; console.error(`  MIRROR MISMATCH ${key}: scorer ${scorerCount} vs mirror ${sweep.frozen.length}`) }
  }
  if ((i + 1) % Math.max(1, Math.floor(sampled.length / 10)) === 0)
    console.log(`  ${i + 1}/${sampled.length} plans (${Math.round((performance.now() - start) / 1000)}s)`)
})

const pct = (n: number, d: number) => (d === 0 ? '–' : `${(100 * n / d).toFixed(1)}%`)
const rule = (n: string) => console.log(`\n${'='.repeat(78)}\n${n}\n${'='.repeat(78)}`)
const table = (m: Map<string, number>, d: number, pad = 30) => {
  for (const [k, n] of [...m].sort((a, b) => b[1] - a[1]))
    console.log(`  ${k.padEnd(pad)} ${String(n).padStart(6)}  ${pct(n, d).padStart(6)}`)
}

rule('0. Can the detectors fire at all? (every slot pair, frozen or not)')
console.log('  A lever that never moves ANYWHERE and a lever this script reads wrongly')
console.log('  print the same zero in section 4. This is which one it is.')
if (anyLever.size === 0) console.log('\n  NO LEVER MOVED ON ANY OF THE SLOT PAIRS — including the ones that progressed.')
table(anyLever, considered, 20)
console.log('\n  "added load" has no row above. It is only ever set on the handful of')
console.log('  entries carrying accepts_added_load, and only on low-rep weeks — so a zero')
console.log('  here is NOT proof that detector works. Read section 4 accordingly.')
console.log(`\n  weeks flagged as a calibration week across the sample: ${calibrationWeeksSeen}`)
console.log(`  which week numbers those are:                          ${[...calibrationWeekNumbers].sort((a, b) => a - b).join(', ') || 'none'}`)
console.log(`  frozen pairs whose first week opens a block:           ${firstWeekOfBlock}`)

rule('1a. Where in the plan the freezing happens')
table(frozenByWeek, frozen, 20)

rule('1b. The two numbers, from one run — they are not the same question')
console.log(`  plans carrying at least one frozen pair   ${plansWithAny} of ${sampled.length}   ${pct(plansWithAny, sampled.length)}`)
console.log(`  frozen pairs                              ${frozen}`)
console.log(`  week-to-week slot pairs the rule looked at ${considered}`)
console.log(`  THE RATE — frozen share of those pairs    ${pct(frozen, considered)}`)
console.log(`\n  of the frozen pairs, ${fromCalibration} (${pct(fromCalibration, frozen)}) step OUT of a calibration week,`)
console.log('  where the load is deliberately capped. Deload transitions are excluded by the')
console.log('  rule itself and never reach this count.')

rule('2. What the verdict is, pair by pair')
table(byVerdict, frozen, 24)

rule('3. ...and how many PLANS carry each (a plan can carry more than one)')
table(plansByVerdict, sampled.length, 24)

rule('4. Which lever moved, on the pairs that were progressing after all')
if (byLever.size === 0) console.log('  none — no frozen pair had any other lever move')
table(byLever, frozen, 20)
for (const [lever, ex] of moverExamples) for (const e of ex) console.log(`      ${lever}: ${e}`)

rule('5. Measured, NOT counted as progression (see the header for why)')
if (byLabel.size === 0) console.log('  none')
table(byLabel, frozen, 20)

rule('6. The silent residue — nothing moved and nothing said so')
const silent = byVerdict.get('stalled, and silent') ?? 0
console.log(`  ${silent} pairs (${pct(silent, frozen)} of frozen pairs, ${pct(silent, considered)} of all slot pairs)\n`)
console.log('  by cause:');       table(silentByCause, silent, 30)
console.log('\n  by equipment:');  table(silentByEquipment, silent, 30)
console.log('\n  by experience:'); table(silentByExperience, silent, 30)
console.log('\n  by goal:');       table(silentByGoal, silent, 30)
console.log('\n  top exercises:'); table(silentByName, silent, 34)
console.log('\n  examples:')
for (const e of silentExamples) console.log(`    ${e}`)

rule('6b. What each silent lift was doing EARLIER in the same block')
table(silentBackstory, silent, 48)
console.log('\n  traces:')
for (const e of backstoryExamples) console.log(`    ${e}`)

rule('6c. Would one real step have been affordable? (a property of the weight,')
console.log("    NOT the app's own flag — see 6e, which is the question that matters)")
table(silentAffordability, silent, 62)

rule('6d. The two cut together — which single record would cover which cases')
table(silentCrossTab, silent, 70)

rule('6e. Why the weight was not going up')
table(silentLever, silent, 68)

rule('7. Mirror check against quality-score\'s own scorer')
console.log(`  ${crossChecked} plans scored both ways; mismatches: ${mismatches}${mismatches === 0 ? ' — the rule above is the gate\'s rule' : '  <<< THIS REPORT DESCRIBES A DIFFERENT RULE FROM THE GATE'}`)
console.log(`\nDone in ${Math.round((performance.now() - start) / 1000)}s. Measurement only; nothing changed.\n`)
if (mismatches > 0) process.exit(1)

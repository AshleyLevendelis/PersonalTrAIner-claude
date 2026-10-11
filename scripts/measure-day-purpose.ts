// ---------------------------------------------------------------------------
// MEASURE: does a day named for a body part train it? And what does fixing
// that cost?
// ---------------------------------------------------------------------------
// Written 9 Oct 2026 for docs/plans/a-shoulders-day-with-shoulder-work.md.
// The slice is the plan's own: every bodybuilding combination of the quality
// grid at moderate recovery and "tolerate" conditioning — 2,304 plans (4 kits
// x 9 injury sets x 4 lengths x 4 experience levels x 4 goals), seeded with
// the grid's own keys, week 1 of each.
//
// THE SAME SCRIPT IS THE "BEFORE" AND THE "AFTER". It therefore reads nothing
// the change under measurement introduces: its tables of "what makes a chest
// day a chest day" are its own, written here, not the engine's.
//
// Every "plans" column is a count of PLANS in which at least one day has the
// property (how many contain one), never a rate per day. Distributions are
// printed per DAY or per WEEK and say which.
//
// A measurement that counts only what a change bought is half a measurement:
// leg sets a week, leg days a week, working sets and required minutes a day
// against the time budget, and push:pull are here to catch what it costs.
//
//   npm run measure:day-purpose              (table to stdout)
//   npm run measure:day-purpose -- --json    (machine-readable)
// ---------------------------------------------------------------------------

import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { getExerciseEntry } from '../src/lib/exercise-db'
import { ALL_EQUIPMENT, ALL_DURATIONS, ALL_EXPERIENCE, getInjuryCombinations } from '../src/lib/dev-constraint-audit'
import { buildProfile, comboKey, ALL_GOALS, type Combination } from './quality-grid'
import {
  estimateDaySeconds, estimateRequiredDaySeconds, optionalFillerSeconds,
  getSessionMinimumSeconds, getSessionMaximumSeconds,
} from '../src/lib/session-duration'

const LEG_COMPOUND = new Set(['knee_dominant', 'hip_hinge', 'single_leg'])
const LEG_ANY = new Set(['knee_dominant', 'hip_hinge', 'single_leg', 'isolation_quad', 'isolation_hamstring', 'isolation_calf'])
const LEG_FOCUS = new Set(['Legs & Calves', 'Squat & Carry', 'Pull & Hinge', 'Full Body Power'])
const PRESS = new Set(['horizontal_push', 'vertical_push'])
const PULL = new Set(['horizontal_pull', 'vertical_pull'])

interface Row {
  plans: number
  // --- what the change is meant to buy
  shouldersNoPressOrRaise: number      // the plan's own "before" column
  shouldersNoDeltWorkAtAll: number     // the same, with rear-delt work counted as delt work
  shouldersLegHeavy: number            // "Shoulders & Abs" with 3+ leg compounds
  nonLegDayLegHeavy: number            // ANY day not named for legs with 3+ leg compounds
  chestOnePress: number
  chestNoPress: number
  thinDay: number                      // <=9 working sets carrying >=10 min optional mobility
  gapNote: number
  allFourDaysLegs: number              // every training day has a leg-track focus
  renamedDay: number                   // a day whose focus is not one of the split's four names
  // --- what it might cost
  underMinimum: number                 // a day whose REQUIRED work is under the shortest session asked for
  overMaximum: number                  // a day whose required work is over the longest
  legsOnOneDayOrNone: number           // legs (non-isolation squat/hinge) on fewer than two days
  noLegsAtAll: number
  pushPullOutside: number              // weekly press:pull sets outside 0.6-1.6 (both sides non-zero)
  noPressAllWeek: number
  noPullAllWeek: number
}
const blank = (): Row => ({
  plans: 0, shouldersNoPressOrRaise: 0, shouldersNoDeltWorkAtAll: 0, shouldersLegHeavy: 0, nonLegDayLegHeavy: 0,
  chestOnePress: 0, chestNoPress: 0, thinDay: 0, gapNote: 0, allFourDaysLegs: 0, renamedDay: 0,
  underMinimum: 0, overMaximum: 0, legsOnOneDayOrNone: 0, noLegsAtAll: 0, pushPullOutside: 0, noPressAllWeek: 0, noPullAllWeek: 0,
})

const SPLIT_NAMES = new Set(['Chest & Triceps', 'Back & Biceps', 'Legs & Calves', 'Shoulders & Abs'])
const KIT_LABEL: Record<string, string> = { full_gym: 'Full gym', home_gym: 'Home gym', minimalist: 'Minimalist', bodyweight: 'Bodyweight' }

const rows = new Map<string, Row>()
const rowFor = (k: string) => { let r = rows.get(k); if (!r) { r = blank(); rows.set(k, r) } return r }
const total = blank()

// Distributions, each keyed by group so a cost that lands on one corner of the grid is visible.
const legSetsPerWeek = new Map<string, number[]>()
const legDaysPerWeek = new Map<string, number[]>()
const pressSetsPerWeek = new Map<string, number[]>()
const pullSetsPerWeek = new Map<string, number[]>()
const workingSetsPerDay = new Map<string, number[]>()      // by session length
const requiredMinutesPerDay = new Map<string, number[]>()  // by session length
const totalMinutesPerDay = new Map<string, number[]>()     // by session length
const focusCounts = new Map<string, number>()
const push = (m: Map<string, number[]>, k: string, v: number) => { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]) }

// The gap note is stamped on the day at generation BEFORE the change this
// script measures, and derived when the day is shown AFTER it. So the script
// asks for the derived one where it exists and reads the stamped field where
// it does not — the one place it knows about the change, and only to keep
// counting the same thing ("a day that carries a gap note on screen").
type GapNoteFn = (day: unknown, profile: unknown) => string | null
const derivedGapNote: GapNoteFn | null = await import('../src/lib/day-gap-note')
  .then(m => (m as { describeDayGap?: GapNoteFn }).describeDayGap ?? null)
  .catch(() => null)

const quietLog = console.log, quietWarn = console.warn
console.log = () => {}; console.warn = () => {}

const injurySets = getInjuryCombinations()
let generated = 0
for (const equipment of ALL_EQUIPMENT) for (const injuries of injurySets) for (const duration of ALL_DURATIONS) for (const experience of ALL_EXPERIENCE) for (const goal of ALL_GOALS) {
  const combo: Combination = { equipment, injuries, duration, style: 'bodybuilding', experience, goal, recovery: 'moderate', conditioningPref: 'tolerate' }
  const profile = buildProfile(combo)
  setRandomSource(seededRngFromKey(comboKey(combo)))
  const meso = generateMesocycle(profile)
  resetRandomSource()
  generated++
  const week = meso[0]
  const flagged = injuries.includes('shoulders')
  const group = `${KIT_LABEL[equipment] ?? equipment}, ${flagged ? 'flagged' : 'not flagged'}`
  const r = rowFor(group)
  r.plans++; total.plans++

  const f: Partial<Record<keyof Row, boolean>> = {}
  let legSets = 0, legDays = 0, pressSets = 0, pullSets = 0
  const trained = week.days.filter(d => d.exercises.length > 0)
  for (const d of trained) {
    focusCounts.set(`${group} | ${d.focus}`, (focusCounts.get(`${group} | ${d.focus}`) ?? 0) + 1)
    const working = d.exercises
      .map(e => ({ e, entry: getExerciseEntry(e.name) }))
      .filter(x => x.entry && x.entry.mechanics_tier !== 'primer')
    const pats = working.map(x => x.entry!.movement_pattern as string)
    const legCompounds = working.filter(x => LEG_COMPOUND.has(x.entry!.movement_pattern) && x.entry!.mechanics_tier !== 'tier3_isolation').length
    const rearDelt = working.some(x => x.entry!.substitution_group === 'rear_delt')
    const presses = pats.filter(p => p === 'horizontal_push').length

    if (d.focus === 'Shoulders & Abs') {
      const pressOrRaise = pats.includes('vertical_push') || pats.includes('isolation_shoulder')
      if (!pressOrRaise) f.shouldersNoPressOrRaise = true
      if (!pressOrRaise && !rearDelt) f.shouldersNoDeltWorkAtAll = true
      if (legCompounds >= 3) f.shouldersLegHeavy = true
    }
    if (!LEG_FOCUS.has(d.focus) && legCompounds >= 3) f.nonLegDayLegHeavy = true
    if (d.focus === 'Chest & Triceps') { if (presses === 1) f.chestOnePress = true; if (presses === 0) f.chestNoPress = true }
    if (!SPLIT_NAMES.has(d.focus)) f.renamedDay = true

    const workingSets = working.reduce((s, x) => s + x.e.sets, 0)
    const required = estimateRequiredDaySeconds(d)
    if (workingSets <= 9 && optionalFillerSeconds(d) >= 600) f.thinDay = true
    if (required < getSessionMinimumSeconds(duration)) f.underMinimum = true
    if (required > getSessionMaximumSeconds(duration)) f.overMaximum = true
    const note = derivedGapNote ? derivedGapNote(d, profile) : (d as { pattern_gap_note?: string }).pattern_gap_note
    if (note) f.gapNote = true

    push(workingSetsPerDay, duration, workingSets)
    push(requiredMinutesPerDay, duration, required / 60)
    push(totalMinutesPerDay, duration, estimateDaySeconds(d) / 60)

    let dayHasLegCompound = false
    for (const x of working) {
      const p = x.entry!.movement_pattern as string
      if (LEG_ANY.has(p)) legSets += x.e.sets
      if (LEG_COMPOUND.has(p) && x.entry!.mechanics_tier !== 'tier3_isolation') dayHasLegCompound = true
      if (PRESS.has(p)) pressSets += x.e.sets
      if (PULL.has(p)) pullSets += x.e.sets
    }
    if (dayHasLegCompound) legDays++
  }
  if (trained.length > 0 && trained.every(d => LEG_FOCUS.has(d.focus))) f.allFourDaysLegs = true
  if (legDays < 2) f.legsOnOneDayOrNone = true
  if (legDays === 0) f.noLegsAtAll = true
  if (pressSets === 0) f.noPressAllWeek = true
  if (pullSets === 0) f.noPullAllWeek = true
  if (pressSets > 0 && pullSets > 0) { const ratio = pressSets / pullSets; if (ratio < 0.6 || ratio > 1.6) f.pushPullOutside = true }

  for (const k of Object.keys(f) as (keyof Row)[]) { if (f[k]) { r[k]++; total[k]++ } }
  push(legSetsPerWeek, group, legSets); push(legDaysPerWeek, group, legDays)
  push(pressSetsPerWeek, group, pressSets); push(pullSetsPerWeek, group, pullSets)
}
console.log = quietLog; console.warn = quietWarn

const sorted = (a: number[]) => [...a].sort((x, y) => x - y)
const pct = (a: number[], p: number) => { const s = sorted(a); return s[Math.min(s.length - 1, Math.floor(p * s.length))] }
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length)
const dist = (a: number[], dp = 0) => ({ n: a.length, min: +pct(a, 0).toFixed(dp), p10: +pct(a, 0.1).toFixed(dp), median: +pct(a, 0.5).toFixed(dp), p90: +pct(a, 0.9).toFixed(dp), max: +sorted(a)[a.length - 1].toFixed(dp), mean: +mean(a).toFixed(1) })

const groups = [...rows.keys()]
const out = {
  plans: generated,
  gapNoteSource: derivedGapNote ? 'derived when the day is shown' : 'stamped at generation',
  rows: Object.fromEntries([...groups.map(g => [g, rows.get(g)!] as const), ['All', total] as const]),
  legSetsPerWeek: Object.fromEntries(groups.map(g => [g, dist(legSetsPerWeek.get(g)!)])),
  legDaysPerWeek: Object.fromEntries(groups.map(g => {
    const a = legDaysPerWeek.get(g)!
    const hist: Record<string, number> = {}
    for (const v of a) hist[String(v)] = (hist[String(v)] ?? 0) + 1
    return [g, hist]
  })),
  pressSetsPerWeek: Object.fromEntries(groups.map(g => [g, dist(pressSetsPerWeek.get(g)!)])),
  pullSetsPerWeek: Object.fromEntries(groups.map(g => [g, dist(pullSetsPerWeek.get(g)!)])),
  workingSetsPerDay: Object.fromEntries([...workingSetsPerDay.entries()].map(([k, a]) => [k, dist(a)])),
  requiredMinutesPerDay: Object.fromEntries([...requiredMinutesPerDay.entries()].map(([k, a]) => [k, { ...dist(a, 1), budgetMin: getSessionMinimumSeconds(k as never) / 60, budgetMax: getSessionMaximumSeconds(k as never) / 60 }])),
  totalMinutesPerDay: Object.fromEntries([...totalMinutesPerDay.entries()].map(([k, a]) => [k, dist(a, 1)])),
  focusCounts: Object.fromEntries([...focusCounts.entries()].sort()),
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(out, null, 1))
} else {
  const cols: [keyof Row, string][] = [
    ['plans', 'Plans'], ['shouldersNoPressOrRaise', 'Sh: no press/raise'], ['shouldersNoDeltWorkAtAll', 'Sh: no delt work'],
    ['shouldersLegHeavy', 'Sh: 3+ leg'], ['nonLegDayLegHeavy', 'non-leg day 3+ leg'], ['chestOnePress', 'Chest: 1 press'], ['chestNoPress', 'Chest: 0 press'],
    ['thinDay', '<=9 sets +10min opt'], ['gapNote', 'Gap note'], ['allFourDaysLegs', 'All days legs'], ['renamedDay', 'Renamed day'],
    ['underMinimum', 'Day under min'], ['overMaximum', 'Day over max'], ['legsOnOneDayOrNone', 'Legs <2 days'], ['noLegsAtAll', 'No legs'],
    ['pushPullOutside', 'P:P outside'], ['noPressAllWeek', 'No press/wk'], ['noPullAllWeek', 'No pull/wk'],
  ]
  console.log(`\n${generated} bodybuilding plans, week 1 of each. Every count is PLANS containing at least one such day.\n`)
  console.log(['Group', ...cols.map(c => c[1])].join(' | '))
  for (const g of [...groups, 'All']) console.log([g, ...cols.map(c => String(out.rows[g][c[0]]))].join(' | '))
  console.log('\nLeg sets per WEEK (working sets on squat/hinge/single-leg/quad/hamstring/calf):')
  for (const g of groups) console.log(`  ${g}: ${JSON.stringify(out.legSetsPerWeek[g])}`)
  console.log('\nDays per WEEK with a leg compound (count of plans at each value):')
  for (const g of groups) console.log(`  ${g}: ${JSON.stringify(out.legDaysPerWeek[g])}`)
  console.log('\nPress sets per WEEK:')
  for (const g of groups) console.log(`  ${g}: ${JSON.stringify(out.pressSetsPerWeek[g])}`)
  console.log('\nPull sets per WEEK:')
  for (const g of groups) console.log(`  ${g}: ${JSON.stringify(out.pullSetsPerWeek[g])}`)
  console.log('\nWorking sets per DAY, by session length:')
  for (const [k, v] of Object.entries(out.workingSetsPerDay)) console.log(`  ${k}: ${JSON.stringify(v)}`)
  console.log('\nREQUIRED minutes per DAY (everything except optional filler), by session length:')
  for (const [k, v] of Object.entries(out.requiredMinutesPerDay)) console.log(`  ${k}: ${JSON.stringify(v)}`)
  console.log('\nTOTAL minutes per DAY (required + optional filler), by session length:')
  for (const [k, v] of Object.entries(out.totalMinutesPerDay)) console.log(`  ${k}: ${JSON.stringify(v)}`)
  console.log('\nDays by focus:')
  for (const [k, v] of Object.entries(out.focusCounts)) console.log(`  ${k}: ${v}`)
}

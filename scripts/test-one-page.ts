// ---------------------------------------------------------------------------
// test:one-page — the one-page Home, Nutrition and Exercise (design 5c·5 / 5c·6 / 5c·4, 17 Oct 2026).
//
// Holds the numbers the three screens draw and the wiring of her three rulings that day:
//   1. ring shares and Home's "% of today's targets" (a ring with no target is left out, never "0%")
//   2. the Exercise week meter counts the strip's own days with the shared capped set count
//   3. the Program row is the plan's own blocks, named by their phases, with an honest deload line
//   4. her rulings: steps from the Steps key row, water from Nutrition's water cell, "in a row" pill,
//      the day strip still on Nutrition; the rest of the key and the rings open Nutrition
//   5. nothing the old screens carried is gone: the weigh-in, the summary, the ⋯ menu, the resize offer
// docs/plans/one-page-tabs.md.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { MesocycleWeek, WorkoutDay } from '../src/lib/types'
import type { TrainingWeekDay } from '../src/hooks/useTrainingWeek'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const read = (p: string) => strip(readFileSync(p, 'utf8'))

async function main() {
  const { ringShare, todaySoFarPercent, compactCount, programSummary, weekSetCount } = await import('../src/lib/one-page')

  console.log('\n1. Ring shares and the headline')
  check('a share is eaten over target', ringShare(90, 180) === 0.5, ringShare(90, 180))
  check('...capped at full, never past it', ringShare(400, 180) === 1)
  check('...and never below empty', ringShare(-5, 180) === 0)
  check('no target is no share (null), not an empty ring', ringShare(50, 0) === null && ringShare(50, null) === null && ringShare(50, undefined) === null)
  check('the headline is the mean of the capped shares', todaySoFarPercent([1, 0.5, 0.25, 0.25]) === 50, todaySoFarPercent([1, 0.5, 0.25, 0.25]))
  check('...a ring past its target counts as 100, not more', todaySoFarPercent([1, 0]) === 50 && todaySoFarPercent([ringShare(500, 100), 0]) === 50)
  check('...a ring with no target is left out, not counted as 0', todaySoFarPercent([null, null, 0.6, 0.2]) === 40, todaySoFarPercent([null, null, 0.6, 0.2]))
  check('...and with no targets at all there is no headline (a dash, never "0%")', todaySoFarPercent([null, null]) === null)
  check('steps read "6.2k" and "10k"; under a thousand as they are', compactCount(6200) === '6.2k' && compactCount(10000) === '10k' && compactCount(740) === '740', [compactCount(6200), compactCount(10000), compactCount(740)])

  console.log('\n2. The Exercise week meter')
  const day = (sets: number) => ({ day: 'X', focus: 'F', exercises: Array.from({ length: 2 }, (_, i) => ({ id: `e${i}`, name: `Lift ${i}`, sets })) }) as unknown as WorkoutDay
  const log = (id: string, n: number) => Array.from({ length: n }, (_, i) => ({ exercise_id: id, exercise_name: id === 'e0' ? 'Lift 0' : 'Lift 1', set_number: i + 1, weight_kg: 20, reps: 8, is_warmup: false })) as unknown as TrainingWeekDay['workingLogs']
  const cell = (state: TrainingWeekDay['state'], session: WorkoutDay | null, logs: TrainingWeekDay['workingLogs'] = []) => ({ date: '2026-10-12', dayName: 'Monday', state, session, workingLogs: logs }) as unknown as TrainingWeekDay
  const week = [
    cell('done', day(3), [...log('e0', 3), ...log('e1', 5)]),   // 3 + 3 (the extra two are capped)
    cell('missed', day(3)),                                       // planned, none logged
    cell('due', day(4)),                                          // 8 planned
    cell('moved', day(3)),                                        // counted where it went, not here
    cell('swapped', day(3)),                                      // swapped for something else: not counted
    cell('rest', null),
  ]
  const sets = weekSetCount(week)
  check('sets planned are the counted days only (done, missed, due): 6 + 6 + 8 = 20', sets.planned === 20, sets)
  check('sets logged are capped per lift (5 logged on a 3-set lift counts 3): 6', sets.logged === 6, sets)

  console.log('\n3. The Program row is the plan\'s own blocks')
  const w = (n: number, block: number, phase: string, deload = false, extra: Partial<MesocycleWeek> = {}) =>
    ({ week_number: n, label: `W${n}`, days: [], block_number: block, phase_label: phase, is_deload: deload, ...extra }) as MesocycleWeek
  const meso = [
    w(1, 1, 'Anatomical Adaptation', false, { isCalibrationWeek: true }), w(2, 1, 'Anatomical Adaptation'), w(3, 1, 'Anatomical Adaptation'), w(4, 1, 'Deload', true),
    w(5, 2, 'Hypertrophy'), w(6, 2, 'Hypertrophy'), w(7, 2, 'Hypertrophy'), w(8, 2, 'Deload', true),
    w(9, 3, 'Maximal Strength'), w(10, 3, 'Maximal Strength'), w(11, 3, 'Maximal Strength'), w(12, 3, 'Maximal Strength'),
    w(13, 4, 'Power'), w(14, 4, 'Deload', true),
  ]
  const { ProgramRow: ProgramRowEarly } = await import('../src/components/exercise/WeekContextRow')
  const p6 = programSummary(meso, 6)
  check('one segment per block, in order', p6.segments.map(s => s.block).join(',') === '1,2,3,4', p6.segments)
  check('each named by its own phase (the non-deload week\'s), never Base/Build/Peak', p6.segments.map(s => s.label).join('|') === 'Anatomical adaptation|Hypertrophy|Maximal strength|Power', p6.segments.map(s => s.label))
  check('in week 6: block 1 done, block 2 current, block 3 ahead', p6.segments.map(s => s.state).join(',') === 'done,current,future,future')
  check('...the current block fills to the weeks reached, this one included (2 of 4)', p6.segments[1].fill === 0.5 && p6.segments[0].fill === 1 && p6.segments[2].fill === 0, p6.segments.map(s => s.fill))
  check('the title is the current block: "B2 Hypertrophy"', p6.title === 'B2 Hypertrophy', p6.title)
  check('the deload ahead in this block is counted in weeks: "deload in 2 wks"', p6.deload === 'deload in 2 wks', p6.deload)
  check('..."deload in 1 wk" the week before', programSummary(meso, 7).deload === 'deload in 1 wk', programSummary(meso, 7).deload)
  check('..."deload this week" on it', programSummary(meso, 8).deload === 'deload this week')
  check('...and nothing when no deload lies ahead in THIS block (block 3 has none; block 4\'s is not this one\'s)', programSummary(meso, 10).deload === null, programSummary(meso, 10).deload)
  const p8 = programSummary(meso, 8)
  check('the last week of a block is still that block, filled to the end — not done', p8.segments[1].state === 'current' && p8.segments[1].fill === 1, p8.segments[1])
  check('a calibration week says so in the title', programSummary(meso, 1).title === 'Calibration week', programSummary(meso, 1).title)
  const cal = renderToStaticMarkup(React.createElement(ProgramRowEarly, { mesocycle: meso, liveWeek: 1 }))
  check('...and the row says "Calibration week" first, over the deload ahead (week 1 has one in 3 weeks)', /data-testid="program-row-sub"[^>]*>Calibration week</.test(cal) && programSummary(meso, 1).deload === 'deload in 3 wks', cal.slice(0, 400))
  check('no plan, no segments (the row draws nothing)', programSummary([], 3).segments.length === 0)

  const { ProgramRow } = await import('../src/components/exercise/WeekContextRow')
  const html = renderToStaticMarkup(React.createElement(ProgramRow, { mesocycle: meso, liveWeek: 6 }))
  check('the rendered bar carries the three states in order', (html.match(/data-phase="(\w+)"/g) ?? []).join(',') === 'data-phase="done",data-phase="current",data-phase="future",data-phase="future"', html.match(/data-phase="(\w+)"/g))
  check('...and says the deload beside "Program"', /data-testid="program-row-sub"[^>]*>deload in 2 wks</.test(html), html.slice(0, 600))

  const { RingMeter } = await import('../src/components/OnePage')
  const rings = renderToStaticMarkup(React.createElement(RingMeter, { label: 'x', rings: [{ key: 'a', share: 0.25, color: 'red', glow: true }, { key: 'b', share: null, color: 'blue' }] }))
  check('a ring is drawn to its share (a quarter of its circumference)', (() => {
    const m = rings.match(/stroke-dasharray="([\d.]+) ([\d.]+)"[^>]*data-ring="a"/) ?? rings.match(/data-ring="a"[^>]*stroke-dasharray="([\d.]+) ([\d.]+)"/)
    return !!m && Math.abs(Number(m[1]) / Number(m[2]) - 0.25) < 0.001
  })(), rings.slice(0, 500))
  check('...and a ring with no target is an empty track, marked so', /data-ring="b"[^>]*data-share="none"|data-share="none"[^>]*data-ring="b"/.test(rings) || /data-ring="b" data-share="none"/.test(rings), rings)

  console.log('\n4. Her rulings, wired')
  const home = read('src/components/Dashboard.tsx')
  const keyAt = home.indexOf("key: 'steps', label: 'Steps'")
  const stepsRow = keyAt < 0 ? '' : home.slice(keyAt, home.indexOf('\n', keyAt))
  check('"Tap the steps ring": the Steps row of the key opens the steps entry', /onClick: \(\) => setStepsOpen\(/.test(stepsRow), stepsRow)
  check('...the other three key rows open Nutrition', ['calories', 'protein', 'water'].every(k => {
    const at = home.indexOf(`key: '${k}', label:`)
    return at >= 0 && /onClick: toNutrition/.test(home.slice(at, home.indexOf('\n', at)))
  }))
  check('...and so do the rings', /<button type="button" onClick=\{toNutrition\}[^>]*data-home-rings/.test(home))
  check('the steps entry still writes through the plausibility guard', /handleLogSteps/.test(home) && /isPlausibleStepCount\(rounded\)/.test(home))
  check('Home no longer logs water (it moved to Nutrition\'s water cell)', !/logWater\(/.test(home))
  const voice = readFileSync('src/lib/coach-voice.ts', 'utf8')
  check('"12 in a row": the pill\'s words are "in a row"', /export const STREAK_PILL_WORDS = 'in a row'/.test(voice) && /data-testid="home-streak-label">\{STREAK_PILL_WORDS\}/.test(home))
  check('...never "days", and the full sentence is what a screen reader hears', !/home-streak-label">[^<]*days/.test(home) && /aria-label=\{`\$\{data\.streak\} \$\{streakLabel\(data\.streak\)\}`\}/.test(home))
  check('the headline is today\'s four rings through todaySoFarPercent', /todaySoFarPercent\(\[calShare, proteinShare, waterShare, stepsShare\]\)/.test(home))
  check('Home\'s next meal is Nutrition\'s: the same sections and the same day-as-shown sizes', /dayAsShown\(\{/.test(home) && /mealSections\(\{/.test(home) && /eatenMacrosBySlot\(/.test(home))
  const nut = read('src/components/NutritionDisplay.tsx')
  const waterAt = nut.indexOf('k="water"')
  const waterCell = waterAt < 0 ? '' : nut.slice(waterAt, nut.indexOf('/>', waterAt))
  check('Nutrition\'s water cell opens the quick-add', /onClick=\{\(\) => setWaterOpen\(/.test(waterCell), waterCell)
  check('...whose buttons log water through the store, with an Undo', /onClick=\{\(\) => handleAddWater\(ml\)\}/.test(nut) && /logWater\(\{ profileId, date, amountMl, source: 'manual' \}\)/.test(nut) && /undoLog\(lastWaterLog\)/.test(nut))
  check('"Keep it on top": the day strip is still on Nutrition, above the calories', (() => {
    const a = nut.indexOf('<MealDayStrip'); const b = nut.indexOf('data-nutrition-hero')
    return a >= 0 && b >= 0 && a < b
  })())
  check('no rings on Nutrition: the calories are a bar', !/<RingMeter/.test(nut) && /testid="kcal-bar"/.test(nut))
  check('one coach voice: an offer showing takes the macro line\'s place', /\{macroNudge && !mealRefit && !\(mealTopUp && !mealTopUpNote\) && <TrainerNudge/.test(nut))

  console.log('\n5. Nothing the old screens carried is gone')
  check('Home: the weigh-in still opens from the weight', /onClick=\{\(\) => setWeighInOpen\(o => !o\)\}/.test(home) && /<WeighInCard /.test(home))
  check('Home: a finished session still opens its summary', /onSummary=\{card \? \(\) => setSummaryOpen\(true\) : undefined\}/.test(home) && /<SessionSummaryDialog /.test(home))
  check('Home: the docked button starts or continues, and only then', /const showCta = status === 'not_started' \|\| status === 'in_progress'/.test(home) && /\{showCta && \(/.test(home))
  check('Nutrition: the targets sheet opens from the Targets row', /onClick=\{\(\) => setHowItsSetOpen\(true\)\}[\s\S]{0,200}data-targets-row/.test(nut))
  check('Nutrition: the resize and top-up offers still render', /data-testid="meal-refit-offer"/.test(nut) && /data-testid="meal-top-up-offer"/.test(nut))
  const row = read('src/components/exercise/WeekContextRow.tsx')
  check('Exercise: the ⋯ menu keeps What happened? and Session history', /data-testid="what-happened-item"/.test(row) && /Session history/.test(row))
  check('Exercise: the week number still opens the programme', /onClick=\{onOpenProgram\}\s*data-testid="week-context-header"/.test(row))
  check('Exercise: the meter counts the strip\'s days (tallyWeek, weekSetCount)', /tallyWeek\(days,/.test(row) && /weekSetCount\(days\)/.test(row))
  check('Exercise: the Program row replaced the old link', /export function ProgramRow/.test(row) && !/See the whole program/.test(row))
  const panel = read('src/components/exercise/TodayPanel.tsx')
  check('Exercise: the Program row is on the page', /<ProgramRow mesocycle=\{mesocycle\} liveWeek=\{liveWeek\} onOpenProgram=\{onOpenProgram\} \/>/.test(panel))
  check('Exercise: today\'s lifts carry the shared set count', /<PageSectionLabel right=\{heroCount \? <span data-testid="hero-sets">/.test(panel))

  console.log(`\n${ran} checks ran`)
  if (failures > 0) { console.log(`${failures} FAILED`); process.exit(1) }
  console.log('The one-page screens draw the numbers they say, and keep every control.')
}
main().catch(e => { console.error(e); process.exit(1) })

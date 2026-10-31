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
  // RE-ANCHORED 30 Oct 2026 ("less is more", her "Move things"): the Program card left Exercise and its line moved
  // onto Tools' "Your program" row, built from the same summary, title first.
  const tools = read('src/components/ToolsTab.tsx')
  check('...and Tools\' "Your program" line says it, title first, then the deload', /programSummary\(mesocycle, liveWeek \?\? 1\)/.test(tools) && /\[summary\.title, summary\.deload\]\.filter\(Boolean\)\.join\(' · '\)/.test(tools) && /label: 'Your program', sub: programSub/.test(tools))
  check('...which for week 1 reads "Calibration week · deload in 3 wks"', [programSummary(meso, 1).title, programSummary(meso, 1).deload].filter(Boolean).join(' · ') === 'Calibration week · deload in 3 wks')
  check('no plan, no segments (the row draws nothing)', programSummary([], 3).segments.length === 0)


  const { RingMeter } = await import('../src/components/OnePage')
  const rings = renderToStaticMarkup(React.createElement(RingMeter, { label: 'x', rings: [{ key: 'a', share: 0.25, color: 'red', glow: true }, { key: 'b', share: null, color: 'blue' }] }))
  check('a ring is drawn to its share (a quarter of its circumference)', (() => {
    const m = rings.match(/stroke-dasharray="([\d.]+) ([\d.]+)"[^>]*data-ring="a"/) ?? rings.match(/data-ring="a"[^>]*stroke-dasharray="([\d.]+) ([\d.]+)"/)
    return !!m && Math.abs(Number(m[1]) / Number(m[2]) - 0.25) < 0.001
  })(), rings.slice(0, 500))
  check('...and a ring with no target is an empty track, marked so', /data-ring="b"[^>]*data-share="none"|data-share="none"[^>]*data-ring="b"/.test(rings) || /data-ring="b" data-share="none"/.test(rings), rings)

  console.log('\n4. Her rulings, wired')
  const home = read('src/components/Dashboard.tsx')
  // RE-ANCHORED 31 Oct 2026 (tab polish, design 2c): the key and the rings became one row of four ring cells,
  // each its own button. The property is the same: steps opens the entry here, the other three open Nutrition.
  const ringCell = (k: string) => {
    const at = home.indexOf(`<RingCell k="${k}"`)
    return at < 0 ? '' : home.slice(at, home.indexOf(' />\n', at))
  }
  check('"Tap the steps ring": the steps ring opens the steps entry', /onClick=\{\(\) => setStepsOpen\(/.test(ringCell('steps')), ringCell('steps'))
  check('...the other three rings open Nutrition', ['calories', 'protein', 'water'].every(k => /onClick=\{toNutrition\}/.test(ringCell(k))))
  {
    // ...and the ring IS the button: the drawn ring sits inside the control that takes the tap.
    const at = home.indexOf('function RingCell(')
    const fn = at < 0 ? '' : home.slice(at, home.indexOf('\n}\n', at))
    check('...and the ring itself is the control (its circle is inside the button)', /<button type="button" onClick=\{onClick\}[\s\S]*data-ring=\{k\}[\s\S]*<\/button>/.test(fn), fn.slice(0, 300))
  }
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
  check('Home: the Start button starts or continues, and only then', /const showCta = status === 'not_started' \|\| status === 'in_progress'/.test(home) && /\{showCta && \(/.test(home))
  check('Nutrition: the targets sheet opens from the Targets row', /onClick=\{\(\) => setHowItsSetOpen\(true\)\}[\s\S]{0,200}data-targets-row/.test(nut))
  check('Nutrition: the resize and top-up offers still render', /data-testid="meal-refit-offer"/.test(nut) && /data-testid="meal-top-up-offer"/.test(nut))
  const row = read('src/components/exercise/WeekContextRow.tsx')
  check('Exercise: the ⋯ menu keeps What happened? and Session history', /data-testid="what-happened-item"/.test(row) && /Session history/.test(row))
  check('Exercise: the week number still opens the programme', /onClick=\{onOpenProgram\}\s*data-testid="week-context-header"/.test(row))
  check('Exercise: the meter counts the strip\'s days (tallyWeek, weekSetCount)', /tallyWeek\(days,/.test(row) && /weekSetCount\(days\)/.test(row))
  check('Exercise: the old "See the whole program" link has not come back', !/See the whole program/.test(row))
  const panel = read('src/components/exercise/TodayPanel.tsx')
  check('Exercise: the programme is still one tap away (the week number), and Tools still opens it', /onClick=\{onOpenProgram\}\s*data-testid="week-context-header"/.test(row) && /label: 'Your program'[^\n]*programHash\(\)/.test(tools))
  // RE-ANCHORED 31 Oct 2026 (Exercise 2a): the shared count moved into the glowing card, as "N of M working sets".
  check('Exercise: today\'s lifts carry the shared set count', /data-testid="hero-sets">\{heroCount\.logged\} of \{heroCount\.planned\} working sets/.test(panel) && /const heroCount = [^\n]*sessionSetCount\(workout, logs\)/.test(panel))

  console.log('\n6. Less is more (her "Move things", 30 Oct 2026): said once, the rest one tap away')
  const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')
  const homeCode = strip(home)
  {
    // RE-ANCHORED 31 Oct 2026 (tab polish, design 2c, her "build, keep my rulings"): the session is one card and
    // the Start button is inside it, under the session's name and above the week; the next meal comes after.
    const heroAt = homeCode.indexOf('<SessionHero')
    const ctaPropAt = homeCode.indexOf('cta={showCta && (')
    const ctaAt = homeCode.indexOf('data-home-cta')
    const mealAt = homeCode.indexOf('data-home-next-meal')
    const fnAt = homeCode.indexOf('function SessionHero(')
    const fn = fnAt < 0 ? '' : homeCode.slice(fnAt, homeCode.indexOf('\n}\n', fnAt))
    const inCard = fn.indexOf('data-home-title') > 0 && fn.indexOf('{cta}') > fn.indexOf('data-home-title') && fn.indexOf('<HomeWeekStrip') > fn.indexOf('{cta}')
    check('Home: the Start button sits inside the session card it starts, above the week, before the next meal', heroAt !== -1 && ctaPropAt > heroAt && ctaAt > ctaPropAt && mealAt > ctaAt && inCard, { heroAt, ctaPropAt, ctaAt, mealAt, inCard })
    check('...and is not docked over the page', !/fixed inset-x-0[^"]*"[\s\S]{0,300}data-home-cta/.test(homeCode))
    // "Said once" (30 Oct): tomorrow left the glance line when it got its half of the highlights card back (2c).
    check('Home: tomorrow is said once — its half of the card, never the glance line too', (homeCode.match(/data-home-tomorrow/g) ?? []).length === 1 && !/glanceParts\.push\([^)]*tomorrow/.test(homeCode))
    const cardAt = homeCode.indexOf('data-home-highlights')
    const toggleAt = homeCode.indexOf('data-home-progress-toggle')
    const openAt = homeCode.indexOf('{progressOpen && (')
    const weightAt = homeCode.indexOf('data-home-weight')
    const prAt = homeCode.indexOf('data-home-latest-pr')
    const recentAt = homeCode.indexOf('data-home-recent-prs')
    const volAt = homeCode.indexOf('data-home-volume')
    check('Home: the latest PR is on the card\'s face; the weight, recent PRs and volume sit behind its Progress row', cardAt !== -1 && prAt > cardAt && toggleAt > prAt && openAt > toggleAt && weightAt > openAt && recentAt > openAt && volAt > openAt, { cardAt, prAt, toggleAt, openAt, weightAt, recentAt, volAt })
    check('...which says the weight and the PR state while closed', /lastWeighIn \? `\$\{lastWeighIn\.kg\.toFixed\(1\)\} kg`/.test(homeCode.slice(toggleAt, openAt)))
    const rings = [...homeCode.matchAll(/<RingCell k="(\w+)"/g)].map(m => m[1])
    check('Home: the rings are one row of four (calories, protein, water, steps), and no sleep ring: the app records none', /grid grid-cols-4[^"]*" data-home-today data-home-rings/.test(homeCode) && rings.join(',') === 'calories,protein,water,steps' && !/sleep/i.test(homeCode), rings)
  }
  const nudge = read('src/components/TrainerNudge.tsx')
  {
    const slimAt = nudge.indexOf('if (slim) {')
    const slim = slimAt < 0 ? '' : nudge.slice(slimAt, nudge.indexOf('\n  return (\n    <div', slimAt + 20))
    check('the one-line note keeps its tag for a screen reader', /className="sr-only" data-nudge-tag/.test(slim))
    check('...caps the line at two rows', /line-clamp-2/.test(slim))
    check('...keeps an adaptation\'s actions', /actions\.map\(a =>/.test(slim))
    check('...and moving to the next tip is a real button', /\{onTextTap \? \(\s*<button/.test(slim))
    // RE-ANCHORED 31 Oct 2026 (tab polish): Home's note became the boxless coach line on both of its paths (2c), and
    // Exercise's the 2a coach line; Nutrition keeps the slim note.
    check('Nutrition uses the slim note, Exercise the coach line', /<TrainerNudge slim text=\{macroNudge\}/.test(nut) && /<TrainerNudge line text=\{coachLine\.text\}/.test(panel))
    check('Home uses the coach line on both paths (an adaptation and the rotating tips), with its two chips', /<TrainerNudge \{\.\.\.trainerNudge\} line\b/.test(home) && /<TrainerNudge\s+line\b[\s\S]{0,80}prompts=\{HOME_PROMPTS\}/.test(home)
      && /label: 'What changed\?'/.test(home) && /label: 'Adjust today'/.test(home))
  }
  // RE-ANCHORED 31 Oct 2026 (design 3a): the legend of the top card, one row each, the rings still left out.
  check('Nutrition: the macros and water are the legend\'s rows, one each, no rings', /flex flex-col[^"]*" data-ring-key>/.test(nut) && (nut.match(/<LegendRow\b/g) ?? []).length === 4 && !/<RingMeter/.test(nut))
  const mealPlan = read('src/components/MealPlan.tsx')
  {
    const heroAt = mealPlan.indexOf('function TotalsHero')
    const hero = heroAt < 0 ? '' : mealPlan.slice(heroAt, mealPlan.indexOf('\n}\n', heroAt))
    check('Nutrition: the planned day is one line with the engine\'s verdict, macros behind a tap', /data-testid="day-kcal"/.test(hero) && /\{deltaLabel\}/.test(hero) && /\{open && \(/.test(hero) && hero.indexOf('{open && (') < hero.indexOf('{targets.protein} P'))
  }
  check('Nutrition: the allergy line is still under the list', /Ingredients are filtered, not verified\. Check labels if you have an allergy\./.test(mealPlan))
  check('Exercise: no week rings on the page', !/<RingMeter/.test(strip(row)) && /data-testid="week-meter-count">\{tally\.sessionsDone\} of \{tally\.sessionsPlanned\}/.test(row))
  check('Exercise: "Feeling tight?" is on the warm-up row', /trailing=\{[\s\S]{0,600}data-testid="tightness-open"/.test(panel))
  // RE-ANCHORED 31 Oct 2026 (Exercise 2a): "Add exercise" is the one button and "I also did…" the quiet line under it;
  // both ways to add are still there, once each, and nothing else at the foot.
  {
    const footAt = panel.indexOf('data-testid="session-foot-actions"')
    const exAt = panel.indexOf('data-testid="add-exercise"')
    const unAt = panel.indexOf('data-testid="add-unplanned"')
    check('Exercise: both ways to add sit at the foot, "Add exercise" over "I also did…"', footAt !== -1 && exAt > footAt && unAt > exAt && (panel.match(/data-testid="add-(exercise|unplanned)"/g) ?? []).length === 2, { footAt, exAt, unAt })
  }
  const app = read('src/App.tsx')
  check('the settings gear scrolls with the page, never floats over it', /className=\{`absolute right-3 z-40 \$\{activeTab === 'chat'/.test(app) && !/className=\{`fixed right-3 z-40 \$\{activeTab === 'chat'/.test(app))

  console.log(`\n${ran} checks ran`)
  if (failures > 0) { console.log(`${failures} FAILED`); process.exit(1) }
  console.log('The one-page screens draw the numbers they say, and keep every control.')
}
main().catch(e => { console.error(e); process.exit(1) })

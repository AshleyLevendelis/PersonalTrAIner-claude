// WEIGHT, WEEK BY WEEK (his request 18 Nov 2026, "Add all three"): the weekly sums under Home's weight graph.
// Run: npm run test:weight-weeks
import { readFileSync } from 'fs'
import { cleanWeighIns, weightWeeks, mondayOf, shiftDate, weekLabel, dayLabel, changeLabel, WEIGHT_RANGE_DAYS } from '../src/lib/weight-weeks'

let ran = 0, failures = 0
function ok(label: string, cond: boolean, extra?: unknown) {
  ran++
  if (cond) console.log(`  ok: ${label}`)
  else { failures++; console.log(`  FAIL: ${label}`, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)) }
}

console.log('§1 dates')
ok('a Wednesday belongs to the Monday before it', mondayOf('2026-11-18') === '2026-11-16')
ok('a Monday is its own week', mondayOf('2026-11-16') === '2026-11-16')
ok('a Sunday belongs to the Monday six days back', mondayOf('2026-11-22') === '2026-11-16')
ok('across the October clock change the week holds', mondayOf('2026-10-25') === '2026-10-19' && shiftDate('2026-10-24', 2) === '2026-10-26')
ok('across a month end', shiftDate('2026-10-30', 3) === '2026-11-02' && mondayOf('2026-11-01') === '2026-10-26')
ok('the ranges are 3, 6 and 12 months of days', WEIGHT_RANGE_DAYS['3M'] === 91 && WEIGHT_RANGE_DAYS['6M'] === 182 && WEIGHT_RANGE_DAYS['1Y'] === 365)

console.log('§2 cleaning')
const raw = [
  { date: '2026-11-10', kg: 80 }, { date: '2026-11-10', kg: 79.6 }, { date: '2026-08-01', kg: 82 },
  { date: '2026-11-19', kg: 78 }, { date: 'bad', kg: 80 }, { date: '2026-11-11', kg: 0 }, { date: '2026-11-12', kg: NaN },
]
const c = cleanWeighIns(raw, '2026-09-01', '2026-11-18')
ok('one reading a day, the last given wins', c.length === 1 && c[0].kg === 79.6, c)
ok('outside the range, a bad date, zero and not-a-number are left out', !c.some(p => p.date === '2026-08-01' || p.date === '2026-11-19'))
ok('oldest first', cleanWeighIns([{ date: '2026-11-12', kg: 1 }, { date: '2026-11-10', kg: 2 }], '2026-11-01', '2026-11-30').map(p => p.date).join() === '2026-11-10,2026-11-12')

console.log('§3 weeks')
const pts = [
  { date: '2026-11-02', kg: 81 }, { date: '2026-11-04', kg: 80 },            // week of 2 Nov: 80.5
  { date: '2026-11-09', kg: 80.2 }, { date: '2026-11-15', kg: 79.8 },        // week of 9 Nov: 80.0 (Sunday included)
  { date: '2026-11-16', kg: 79.4 }, { date: '2026-11-17', kg: 79.6 }, { date: '2026-11-18', kg: 79.5 }, // this week: 79.5
  { date: '2026-10-19', kg: 82 },                                             // a week, then a week with none
]
const ws = weightWeeks(pts)
ok('weeks newest first', ws.map(w => w.start).join() === '2026-11-16,2026-11-09,2026-11-02,2026-10-19', ws.map(w => w.start))
ok('each runs Monday to Sunday', ws.every(w => w.end === shiftDate(w.start, 6)))
ok('a week\'s average is the mean of its days', ws[0].avgKg === 79.5 && ws[1].avgKg === 80 && ws[2].avgKg === 80.5, ws.map(w => w.avgKg))
ok('a Sunday counts in the week that ends on it, a Monday in the week it starts', ws[1].days.length === 2 && ws[0].days.length === 3)
ok('the change is this week less last week', ws[0].changeKg === -0.5 && ws[1].changeKg === -0.5, ws.map(w => w.changeKg))
ok('a week after a week with no weigh-ins has no change, never one against an older week', ws[2].changeKg === null, ws[2])
ok('the oldest week has no change', ws[3].changeKg === null)
ok('a week\'s days are listed newest first', ws[0].days.map(d => d.date).join() === '2026-11-18,2026-11-17,2026-11-16')
ok('averages round to two places, not one (0.39, as in his screenshot)', weightWeeks([{ date: '2026-11-16', kg: 80.11 }, { date: '2026-11-17', kg: 80.2 }])[0].avgKg === 80.16)
ok('no weigh-ins, no weeks', weightWeeks([]).length === 0)
const up = weightWeeks([{ date: '2026-11-09', kg: 80 }, { date: '2026-11-16', kg: 80.43 }])
ok('a rise is a positive change', up[0].changeKg === 0.43, up[0])

console.log('§4 words')
ok('a week in one month reads "9-15 Nov"', weekLabel('2026-11-09', '2026-11-15') === '9-15 Nov', weekLabel('2026-11-09', '2026-11-15'))
ok('across months, both months', weekLabel('2026-10-26', '2026-11-01') === '26 Oct - 1 Nov', weekLabel('2026-10-26', '2026-11-01'))
ok('September is "Sep" whatever the browser says, and a day across it reads "Sun, 30 Aug" with one comma', weekLabel('2026-09-07', '2026-09-13') === '7-13 Sep' && dayLabel('2026-08-30') === 'Sun, 30 Aug', [weekLabel('2026-09-07', '2026-09-13'), dayLabel('2026-08-30')])
ok('a day reads "Wed, 18 Nov"', dayLabel('2026-11-18') === 'Wed, 18 Nov', dayLabel('2026-11-18'))
ok('a fall reads "0.39 kg ↓"', changeLabel(-0.39) === '0.39 kg ↓', changeLabel(-0.39))
ok('a rise reads "0.43 kg ↑"', changeLabel(0.43) === '0.43 kg ↑')
ok('no change says so', changeLabel(0) === 'no change')
ok('nothing to compare says nothing', changeLabel(null) === null)

console.log('§5 the screen reads what the targets follow')
const reader = readFileSync('src/lib/nutrition-targets.ts', 'utf8').replace(/\/\/.*$/gm, '')
const body = reader.slice(reader.indexOf('export async function getWeighInHistory'), reader.indexOf('export async function getWeighInHistory') + 1400)
ok('the history keeps only the readings the targets trust', /weighInStanding\([^)]*\)\.trusted/.test(body), body.slice(0, 200))
ok('a failed read throws, never an empty history', /if \(error\) throw error/.test(body))
const ui = readFileSync('src/components/WeightHistory.tsx', 'utf8').replace(/\/\/.*$/gm, '')
ok('the graph draws from getWeighInHistory', /getWeighInHistory\(/.test(ui))
ok('and kept off first paint: Home loads it lazily', /lazyWithReload\(\(\) => import\('@\/components\/WeightHistory'\)/.test(readFileSync('src/components/Dashboard.tsx', 'utf8')))

console.log(`\n${ran} checks ran, ${failures} failed`)
if (failures > 0) process.exit(1)

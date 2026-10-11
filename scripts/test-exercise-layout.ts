// ---------------------------------------------------------------------------
// test:exercise-layout — THE EXERCISE TAB, design handoff 2c (10 Oct 2026).
//
// What the new layout says and does, run rather than read where it can be:
//  1. the running button's words — "Log set 3 · Bench 80 kg × 6" — for every
//     shape of set (loaded, per hand, bodyweight, a weight still to type);
//  2. the button reads the FIRST tick still to save, and the lift it is in;
//  3. the tick describes what it would save with the save path's own
//     fallbacks, so the button cannot promise one weight and log another;
//  4. the collapsed row: the chip is the plan's own load string, the dots
//     are today's working sets and nothing on a peek, and only "Accessory"
//     loses its label;
//  5. the day strip's dot for each of the week's states.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { join } from 'path'
import { nextSetLabel, readNextSet, needsWeight, type NextSet } from '../src/lib/next-set-label'
import { stripDot } from '../src/components/exercise/WeekContextRow'

const ROOT = join(import.meta.dirname, '..')
let failures = 0
let ran = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`) }
}
const code = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const set = (o: Partial<NextSet>): NextSet => ({ set: 'Set 3', name: 'Barbell Bench Press', weight: '80', unit: 'kg', reps: '6', weightBox: 'box', ...o })

console.log('\n1. The words on the running button')
{
  const bench = nextSetLabel(set({}))
  check('a loaded set reads "Log set 3 · Bench 80 kg × 6", the brief\'s own example', bench === 'Log set 3 · Bench 80 kg × 6', bench)
  const ramp = nextSetLabel(set({ set: 'Warm-up 1', name: 'Barbell Squats', weight: '40', reps: '5' }))
  check('a build-up set says warm-up, not set', ramp === 'Log warm-up 1 · Squat 40 kg × 5', ramp)
  const dbs = nextSetLabel(set({ name: 'Dumbbell Bench Press', weight: '14', unit: 'kg per hand', reps: '10' }))
  check('a dumbbell pair keeps "per hand" — 14 kg alone reads as a total', dbs === 'Log set 3 · Dumbbell Bench Press 14 kg per hand × 10', dbs)
  const bw = nextSetLabel(set({ name: 'Pull-Ups', weight: 'BW', reps: '8' }))
  check('a bodyweight set says no load', bw === 'Log set 3 · Pull-Ups × 8', bw)
  const zero = nextSetLabel(set({ name: 'Prone Y-T Raises', weight: '0', reps: '8' }))
  check('...nor does a move whose box saves 0 ("0 kg" read like a missing number)', zero === 'Log set 3 · Prone Y-T Raises × 8', zero)
  const real = nextSetLabel(set({ weight: '2.5' }))
  check('...while a small real weight is still said', real === 'Log set 3 · Bench 2.5 kg × 6', real)
  const blank = set({ weight: '' })
  check('no weight to take: the button asks for it rather than offering to log', needsWeight(blank) && nextSetLabel(blank) === 'Set 3 · Bench: type the weight', nextSetLabel(blank))
  check('...and a weight in hand needs no typing', !needsWeight(set({})))
  const noReps = nextSetLabel(set({ reps: '' }))
  check('no reps to take: no "× " left hanging', noReps === 'Log set 3 · Bench 80 kg', noReps)
}

console.log('\n2. The button reads the FIRST set still to log, and its lift')
{
  // A stand-in for the list: two open rows, the first with a tick to save.
  const tick = (data: Record<string, string>, name: string) => ({
    dataset: data,
    closest: (sel: string) => sel === '[data-exercise-name]' ? { dataset: { exerciseName: name } } : null,
  })
  const first = tick({ nextSet: 'Set 2', nextWeight: '32.5', nextUnit: 'kg', nextReps: '11', nextWeightBox: 'b1' }, 'T-Bar Rows')
  const second = tick({ nextSet: 'Set 1', nextWeight: '30', nextUnit: 'kg', nextReps: '18', nextWeightBox: 'b2' }, 'Machine Shrug')
  const root = { querySelector: (sel: string) => sel === '[data-next-set]' ? first : null, all: [first, second] }
  const read = readNextSet(root as unknown as ParentNode)
  check('the first tick in the list is the one read', read?.set === 'Set 2' && read?.name === 'T-Bar Rows' && read?.weight === '32.5' && read?.weightBox === 'b1', read)
  check('no tick left to save: no button', readNextSet({ querySelector: () => null } as unknown as ParentNode) === null)
  const noName = readNextSet({ querySelector: () => ({ dataset: { nextSet: 'Set 1' }, closest: () => null }) } as unknown as ParentNode)
  check('missing attributes fall back to nothing rather than to a number', noName?.weight === '' && noName?.reps === '' && noName?.unit === 'kg', noName)
}

console.log('\n3. The tick says what it would save, by the save path\'s own fallbacks')
{
  const grid = code('src/components/exercise/SetGrid.tsx')
  const save = grid.slice(grid.indexOf('const handleSaveSet'), grid.indexOf('const handleSaveSet') + 6000)
  const tickAt = grid.indexOf('data-next-set=')
  const tick = tickAt >= 0 ? grid.slice(tickAt, tickAt + 900) : ''
  check('the tick carries the next-set facts', tickAt >= 0)
  check('the save path falls back to defaultWeightFor on a blank box', /input\.weight \|\| defaultWeightFor\(ref\)/.test(save))
  check('...and so does the tick\'s weight — one fallback, read twice', /data-next-weight=\{[^\n]*input\.weight \|\| defaultWeightFor\(ref\)/.test(tick), tick.slice(0, 300))
  check('the tick\'s reps take the box, then last time, then the prescription — the save path\'s order',
    /data-next-reps=\{[^}]*input\.reps \|\| \(ghost \? String\(ghost\.reps_completed\) : defaultRepsFor\(ref\)\)/.test(tick))
  const unguarded = ['set', 'weight', 'unit', 'reps', 'weight-box'].filter(k => !new RegExp(`data-next-${k}=\\{!isSaved && !drop \\?`).test(tick))
  check('a saved row and a drop row describe nothing (a drop is offered from its parent) — every attribute guarded',
    unguarded.length === 0, unguarded)
  check('a calibration probe set still to type says so — the save path refuses a blank one',
    /probeNeedsWeight\(ref\)/.test(tick) && /probeNeedsWeight\(ref\)/.test(save))
  const btn = code('src/components/exercise/NextSetButton.tsx')
  check('the button presses that tick', /tick\.click\(\)/.test(btn))
  const typeAt = btn.indexOf('if (needsWeight(next)) {')
  const typeBranch = typeAt >= 0 ? btn.slice(typeAt, btn.indexOf('\n    }', typeAt)) : ''
  check('...unless the weight must be typed, when it opens the box instead — and presses nothing',
    /getElementById\(next\.weightBox\)/.test(typeBranch) && /focus\(\)/.test(typeBranch) && /return$/.test(typeBranch.trim()) && !/\.click\(/.test(typeBranch), typeBranch)
  check('it watches the list, so a typed box or a landed tick changes the words', /new MutationObserver\(read\)/.test(btn) && /attributeFilter/.test(btn))
  const today = code('src/components/exercise/TodayPanel.tsx')
  const btnAt = today.indexOf('<NextSetButton')
  check('the button shows only while the session runs', btnAt > 0 && /status === 'running' && \(\s*$/m.test(today.slice(btnAt - 200, btnAt)), today.slice(btnAt - 200, btnAt))
  check('...and reads the list it sits under', /data-today-exercises/.test(today) && /root=\{listEl\}/.test(today))
}

console.log('\n4. The collapsed row')
{
  const line = code('src/components/exercise/ExerciseLine.tsx')
  check('the chip is the plan\'s own load string, which carries "per hand"', /ex\.suggested_load \?\? `~\$\{ex\.suggested_load_kg\}kg`/.test(line))
  check('it is accent with an up-arrow only when the load progressed', /progressing && <ArrowUp/.test(line) && /data-load-chip=\{progressing \? 'up' : 'hold'\}/.test(line))
  check('set dots only when today passes a count — a peeked day draws none', /setsDone != null && \(/.test(line))
  check('a dot per planned set, filled up to the sets done', /length: ex\.sets/.test(line) && /i < done/.test(line))
  check('the number is two digits, "01"', /padStart\(2, '0'\)/.test(line))
  check('only "Accessory" loses its label', /if \(text === 'Accessory'\) return null/.test(line) && !/'(Main lift|Primer|Finisher)'\) return null/.test(line))
  const row = code('src/components/exercise/ExerciseRow.tsx')
  check('today\'s dots count WORKING sets, the same count as "Working n/N"', /setsDone=\{rampProgress\.workingDone\}/.test(row))
  check('progressing is the row\'s own progression note', /progressing=\{progressionNote\?\.didProgress\}/.test(row))
  const peek = code('src/components/exercise/ReadOnlyDayList.tsx')
  check('the peek passes no count', !/setsDone=/.test(peek))
}

console.log('\n5. The day strip\'s dots')
{
  const want: Record<string, string> = { done: 'done', swapped: 'done', partial: 'part', missed: 'missed', due: 'due', moved: 'away', rest: 'none', recovery: 'none' }
  const got = Object.fromEntries(Object.keys(want).map(s => [s, stripDot(s as never)]))
  check('done and swapped fill, partial half, missed warns, due is plain, moved is away, rest has none',
    Object.entries(want).every(([s, d]) => got[s] === d), got)
}

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.log(`${failures} check(s) failed`); process.exit(1) }
console.log('All passed.')

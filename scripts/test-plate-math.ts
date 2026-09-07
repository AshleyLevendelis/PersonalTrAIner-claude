// ---------------------------------------------------------------------------
// Gate for the plate calculator's ARITHMETIC, which until now nothing tested.
//
// The two gates that touched this screen (test:bounds-and-boundaries,
// test:tools-grid) are source-regex checks about hangs and dead controls; the
// function that decides what goes on the bar was never once called by a test.
// So the bug Ashley found — one answer where several exist, "1x 20kg" with no
// mention of "2x 10kg" — was invisible to the whole suite.
//
// This section calls it. The property that matters is not "which plates" but
// "every answer is the SAME weight": a list of options is only useful if
// picking any of them loads the bar identically. An off-by-one in the ranking
// is cosmetic; an option that quietly weighs 2.5kg less is a wrong lift.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  plateCombinations,
  STANDARD_PLATES,
  MAX_PLATES_PER_SIDE,
  MAX_BARBELL_TARGET_KG,
} from '../src/lib/plate-math'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 240)}` : ''}`) }
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

console.log('\n1. Every option is the same weight, and a real one\n')
{
  // Swept, not sampled: every 0.5kg step a user can type on a 20kg bar, plus
  // the odd bars (15kg women's, 10kg technique, 25kg axle) the input allows.
  const bars = [20, 15, 10, 25, 0]
  let cases = 0
  let mismatched: unknown = null
  let unloadable: unknown = null
  let overCap: unknown = null
  let duplicated: unknown = null

  for (const bar of bars) {
    for (let target = bar; target <= 260; target += 0.5) {
      const options = plateCombinations(target, bar)
      if (options.length === 0) continue
      cases++

      const perSide = options[0].perSideKg
      for (const o of options) {
        // THE PROPERTY. Two spellings of one number, or the screen is lying.
        if (Math.abs(sum(o.plates) - perSide) > 1e-9 || o.perSideKg !== perSide) {
          mismatched ??= { target, bar, plates: o.plates, sum: sum(o.plates), perSide }
        }
        // Only plates that exist on a rack.
        if (o.plates.some(p => !(STANDARD_PLATES as readonly number[]).includes(p))) {
          unloadable ??= { target, bar, plates: o.plates }
        }
        // The ceiling that stops 180,000 divs being rendered.
        if (o.plates.length > MAX_PLATES_PER_SIDE) overCap ??= { target, bar, count: o.plates.length }
        // Heaviest first — the order they go on the sleeve.
        if (o.plates.some((p, i) => i > 0 && p > o.plates[i - 1])) {
          unloadable ??= { target, bar, plates: o.plates, why: 'not descending' }
        }
      }
      // Options that repeat are not options.
      const spellings = new Set(options.map(o => o.plates.join('+')))
      if (spellings.size !== options.length) duplicated ??= { target, bar, options: options.map(o => o.plates) }
    }
  }

  check(`swept ${cases} loadable targets across ${bars.length} bar weights`, cases > 2000, cases)
  check('every option in a set weighs exactly the same per side', mismatched === null, mismatched)
  check('...using only plates that exist, heaviest first', unloadable === null, unloadable)
  check('...never more plates than the ceiling allows', overCap === null, overCap)
  check('...and no option is offered twice', duplicated === null, duplicated)
}

console.log('\n2. It never loads MORE than was asked for\n')
{
  // Floor, not round. 61.25kg on a 20kg bar is 20.625 a side, which no set of
  // plates makes; the answer is 20 a side and the screen says how far off it
  // is. Rounding up would silently add 1.25kg to a working set.
  let over: unknown = null
  for (let target = 20; target <= 300; target += 0.25) {
    const options = plateCombinations(target, 20)
    for (const o of options) {
      if (20 + sum(o.plates) * 2 > target + 1e-9) over ??= { target, loaded: 20 + sum(o.plates) * 2 }
    }
  }
  check('no option ever exceeds the target weight', over === null, over)

  const odd = plateCombinations(61.25, 20)
  check('an unreachable target still answers with the closest under it',
    odd.length > 0 && odd[0].perSideKg === 20, odd[0]?.perSideKg)
}

console.log('\n3. It actually offers alternatives — the thing that was broken\n')
{
  // Ashley's example, verbatim: "plate calculator should give you options for
  // plates ie 2x10kg or 1x20kg". A single greedy answer passes every other
  // check in this file and still fails her.
  const sixty = plateCombinations(60, 20).map(o => o.plates.join('+'))
  check('60kg on a 20kg bar offers the 20 AND the pair of 10s',
    sixty.includes('20') && sixty.includes('10+10'), sixty)

  let single = 0
  let multi = 0
  for (let target = 25; target <= 200; target += 2.5) {
    const n = plateCombinations(target, 20).length
    if (n <= 1) single++
    else multi++
  }
  check('most ordinary targets carry more than one way to load them',
    multi > single * 8, { multi, single })

  // Fewest plates first: the one you would actually pick at the rack.
  let misranked: unknown = null
  for (let target = 25; target <= 260; target += 0.5) {
    const options = plateCombinations(target, 20)
    for (let i = 1; i < options.length; i++) {
      if (options[i].plates.length < options[i - 1].plates.length) {
        misranked ??= { target, options: options.map(o => o.plates) }
      }
    }
  }
  check('...ranked fewest plates first', misranked === null, misranked)
}

console.log('\n4. The bounds hold, and the screen still applies them\n')
{
  check('a bar at or above the target needs no plates', plateCombinations(20, 20).length === 0)
  check('...and so does a nonsense target', plateCombinations(NaN, 20).length === 0)
  check('over the ceiling it declines rather than laying out thousands of plates',
    plateCombinations(MAX_BARBELL_TARGET_KG + 0.5, 20).length === 0)

  // The ceiling is enforced in the solver AND named on screen: the input's
  // max attribute and the out-of-range message both read from it.
  const screen = read('src/components/PlateCalculator.tsx')
  check('the screen imports the shared ceiling rather than a second copy',
    /from '@\/lib\/plate-math'/.test(screen) && !/const MAX_BARBELL_TARGET_KG/.test(screen))
  check('...and applies it to the bar as well as the target',
    /bar > MAX_BARBELL_TARGET_KG/.test(screen))
}

console.log('\n5. The options are on screen, and tapping one changes the bar\n')
{
  // A list of options nobody can act on is decoration. The picture above the
  // list must follow the selection, or the extra rows are worse than none —
  // they would show one loading and draw another.
  const screen = read('src/components/PlateCalculator.tsx')
  check('every option is rendered, not just the first', /options\.map\(/.test(screen))
  check('...each as a real control', /onClick=\{\(\) => setChosen\(idx\)\}/.test(screen))
  check('...that reports its state to a screen reader', /aria-pressed=\{isChosen\}/.test(screen))
  // THE WIRE. Replacing the plates the picture draws with `options[0]` leaves
  // every check above passing and the taps doing nothing visible.
  check('and the bar picture draws the option that is selected',
    /const showing = options\[chosen\]/.test(screen) && /const plates = showing\?\.plates/.test(screen))

  // The dead promise that shipped alongside it. Comments stripped first —
  // the note explaining WHY the words went is not the words coming back.
  const tools = read('src/components/ToolsTab.tsx')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  check('the tile no longer claims to know which plates you own',
    !/your plates/.test(tools), /sub: '[^']*'/.exec(tools.slice(tools.indexOf('Plate calculator')))?.[0])
}

if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log('\nSame weight, several spellings — and the bar draws the one you picked.\n')

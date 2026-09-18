// ---------------------------------------------------------------------------
// Gate: WHOSE NUMBERS ARE IN THE BOXES.
//
// Ashley, 18 Sep 2026, reading her own dumbbell rows on the gym floor: *"Last
// sets prescribed were sets of 11 reps. Is thay correct at the end of a
// exercise?"* Nothing had prescribed 11. The faint 9, 11, 11 in the reps boxes
// were her OWN last session, drawn in exactly the grey the app uses for a
// suggestion — and on a row with no history the same grey really is the app's
// suggestion. Two different things, one appearance, nothing on screen telling
// them apart.
//
// HER RULING, 18 Sep 2026, from three options: mark them "last time". Over
// moving them out of the boxes to a line above the sets, and over emptying the
// boxes entirely. The numbers stay where her thumb is; a small marker says
// when they are history.
//
// WHAT THIS GATE HOLDS, and why it is two halves:
//
//   §1-3  the SENTENCE — one phrasebook function, and no number without the
//         kind of quantity it is. This is the `personalBest` rule (a reps
//         record rendered "12 kg") one screen along: "last time 9" beside a
//         weight box is a lie in the same grammar.
//   §4-5  the RENDER — the marker appears only where a ghost is actually
//         driving the boxes, never once the row is saved, never on a build-up
//         row, and its words come from the phrasebook rather than the JSX.
//
// §6 proves every source detector on a synthetic file that should FAIL it, so
// none of them can quietly go vacuous the next time the component moves.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join } from 'path'
import { lastTime, loggedSetReading, type LoggedSetReading } from '../src/lib/coach-voice'

const ROOT = join(import.meta.dirname, '..')

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

// ---------------------------------------------------------------------------
console.log('\n[1] The sentence says which session it is talking about')
// ---------------------------------------------------------------------------
{
  const loaded = lastTime({ kind: 'loaded', weightKg: 47.5, reps: 11 })
  check('a loaded set reads as a weight and a rep count', loaded === 'last time 47.5kg × 11', loaded)

  const bw = lastTime({ kind: 'bodyweight', reps: 9 })
  check('a bodyweight set names bodyweight rather than a weight', bw === 'last time bodyweight × 9', bw)

  const belted = lastTime({ kind: 'added_load', addedKg: 12, reps: 5 })
  check('a belted set reads as ADDED weight, with the plus', belted === 'last time +12kg × 5', belted)

  // The property, not the three strings: every one of them says "last time",
  // because the whole point is that the reader knows these are not a target.
  const all = [loaded, bw, belted]
  check('...and all three say it is the last session, not a prescription',
    all.every(s => s.startsWith('last time ')), all)
}

// ---------------------------------------------------------------------------
console.log('\n[2] No number reaches the screen without its kind')
// ---------------------------------------------------------------------------
{
  // The defect this rule was written for: three renderers printed `${value}kg`
  // with no branch, so a reps record showed "12kg". Here the equivalent would
  // be a bodyweight row's rep count rendered beside the weight box as kilos.
  const bw = lastTime({ kind: 'bodyweight', reps: 9 })
  check('a bodyweight reading never prints kg', !/kg/.test(bw), bw)

  // Every digit run in each sentence is answered by a unit: "kg" right after
  // it, or an "×" right before it marking it as reps. A bare number — the
  // shape that started all of this — satisfies neither.
  const unaccounted = (s: string) => {
    const body = s.replace(/^last time /, '')
    const runs = [...body.matchAll(/[0-9]+(?:\.[0-9]+)?/g)]
    return runs.filter(m => {
      const after = body.slice(m.index! + m[0].length)
      const before = body.slice(0, m.index!)
      return !after.startsWith('kg') && !/×\s*$/.test(before)
    }).map(m => m[0])
  }
  for (const r of [
    { kind: 'loaded', weightKg: 47.5, reps: 11 },
    { kind: 'bodyweight', reps: 9 },
    { kind: 'added_load', addedKg: 12, reps: 5 },
  ] as LoggedSetReading[]) {
    const s = lastTime(r)
    check(`every figure in "${s}" is either kilos or reps, never bare`, unaccounted(s).length === 0, unaccounted(s))
  }

  // And the detector is not vacuous: the shape it exists to reject really
  // does trip it.
  check('...and that detector rejects a bare count, so it is not vacuous',
    unaccounted('last time 9').length === 1)
}

// ---------------------------------------------------------------------------
console.log('\n[3] The stored row becomes exactly one reading — the branch ORDER is the content')
// ---------------------------------------------------------------------------
{
  const belted = loggedSetReading({ weight_kg: 0, reps_completed: 5, is_bodyweight: true, added_load_kg: 12 })
  check('a belted dip is an added-load set, not a plain bodyweight one',
    belted.kind === 'added_load' && lastTime(belted) === 'last time +12kg × 5', belted)

  const plain = loggedSetReading({ weight_kg: 0, reps_completed: 9, is_bodyweight: true })
  check('a flagged bodyweight row is a bodyweight reading', plain.kind === 'bodyweight', plain)

  // The flag arrived after the rows did, so history predates it. A row with
  // no weight and no flag is still a bodyweight row — reading it as `loaded`
  // would print "last time 0kg × 9".
  const old = loggedSetReading({ weight_kg: 0, reps_completed: 9 })
  check('an unflagged row with no weight is bodyweight, never "0kg"',
    old.kind === 'bodyweight' && !/0kg/.test(lastTime(old)), lastTime(old))

  const loaded = loggedSetReading({ weight_kg: 47.5, reps_completed: 11, is_bodyweight: false })
  check('a weighted row is a loaded reading', loaded.kind === 'loaded' && lastTime(loaded) === 'last time 47.5kg × 11', loaded)

  // A zero or absent added load is not an added load: "+0kg" is not a thing
  // anybody did, and the row underneath it is an ordinary loaded set.
  const zeroAdded = loggedSetReading({ weight_kg: 60, reps_completed: 6, added_load_kg: 0 })
  check('added_load_kg of 0 is not an added-load set', zeroAdded.kind === 'loaded', zeroAdded)
  const nullAdded = loggedSetReading({ weight_kg: 60, reps_completed: 6, added_load_kg: null })
  check('...nor is a null one', nullAdded.kind === 'loaded', nullAdded)
}

// ---------------------------------------------------------------------------
console.log('\n[4] The marker is on the row only while the boxes really are history')
// ---------------------------------------------------------------------------
const gridPath = join(ROOT, 'src/components/exercise/SetGrid.tsx')
const grid = stripComments(readFileSync(gridPath, 'utf8'))

/** The JSX that renders the marker, from its guard to the end of its element. */
const markerBlock = (src: string): string | null => {
  const at = src.indexOf('data-testid="last-time"')
  if (at < 0) return null
  const from = src.lastIndexOf('{', src.lastIndexOf('(', at))
  return src.slice(Math.max(0, from), at + 400)
}

const block = markerBlock(grid)
check('the set grid renders a last-time marker at all', block !== null)

if (block) {
  // BOTH HALVES OF THE GUARD, and each for its own reason. Without `ghost`
  // the marker would label the app's own suggestion as her history — the
  // exact confusion inverted. Without `!isSaved` it would sit under a row
  // holding today's real numbers, describing figures that are no longer on
  // screen.
  check('4a. it renders only where a ghost is driving the boxes', /\bghost\s*&&/.test(block), block.slice(0, 120))
  check('4b. ...and never once the row has been saved', /!\s*isSaved/.test(block), block.slice(0, 120))

  // A CALL, NOT A NAME. An `import { lastTime }` left at the top of the file
  // satisfies a bare-name check with the render deleted — measured on this
  // codebase twice, both times by mutation.
  check('4c. its words come from the phrasebook, called', /\blastTime\s*\(/.test(block), block)
  check('4d. ...over a reading the phrasebook built, not a field picked at the JSX',
    /\bloggedSetReading\s*\(/.test(block), block)
}

// The words themselves live in ONE file. A second copy in the component is
// how the app came to have three grammars for one job.
check('4e. the component writes no "last time" sentence of its own',
  !/['"`][^'"`]*last time/i.test(grid.replace(/data-testid="last-time"/g, '')),
  (grid.match(/.{0,40}last time.{0,40}/gi) ?? []).slice(0, 4))

// ---------------------------------------------------------------------------
console.log('\n[5] A build-up row can never carry one')
// ---------------------------------------------------------------------------
{
  // The marker keys on `ghost`, and `ghostFor` is the only source of one. Its
  // warm-up exclusion is therefore the whole of the build-up rule — and it is
  // load-bearing for an older reason too: the ghosts come from last session's
  // WORKING sets, so a warm-up box offered one would show 95kg as a build-up.
  const ghostFor = /const ghostFor = \([^)]*\) =>([^\n]*)/.exec(grid)?.[1] ?? ''
  check('5a. ghostFor hands a warm-up row nothing', /isWarm\([^)]*\)\s*\?\s*undefined/.test(ghostFor), ghostFor)
  check('5b. ...and it is the single source the marker reads',
    (grid.match(/\bghostFor\s*\(/g) ?? []).length >= 1 && !/ghostValues\.find/.test(block ?? ''), block?.slice(0, 200))
}

// ---------------------------------------------------------------------------
console.log('\n[6] Every source detector above is proven on something that should fail it')
// ---------------------------------------------------------------------------
{
  // Written the way a careless refactor would leave it: the guard halved, the
  // phrasebook replaced by a template literal, the reading rebuilt inline.
  const broken = `
  {ghost && (
    <p className="text-[0.625rem]" data-testid="last-time">
      {\`last time \${ghost.weight_kg}kg\`}
    </p>
  )}
  const ghostFor = (ref: SetRef) => ghostValues.find(g => g.set_number === ref.setNumber)
  `
  const b = markerBlock(broken)!
  check('6a. the saved-row guard detector fails on a marker missing it', !/!\s*isSaved/.test(b))
  check('6b. the phrasebook-call detector fails on a hand-written sentence', !/\blastTime\s*\(/.test(b))
  check('6c. the reading detector fails on a field picked at the JSX', !/\bloggedSetReading\s*\(/.test(b))
  const brokenGhostFor = /const ghostFor = \([^)]*\) =>([^\n]*)/.exec(broken)?.[1] ?? ''
  check('6d. the build-up detector fails on a ghostFor with no warm-up exclusion',
    !/isWarm\([^)]*\)\s*\?\s*undefined/.test(brokenGhostFor))
  check('6e. the own-sentence detector fails on a component that writes its own',
    /['"`][^'"`]*last time/i.test(broken.replace(/data-testid="last-time"/g, '')))
  // And the block finder itself: it must return nothing when the marker is
  // gone, rather than a window of unrelated JSX that the checks above could
  // accidentally satisfy.
  check('6f. the block finder returns nothing when the marker is deleted',
    markerBlock('<p>no marker here</p>') === null)
}

console.log(failures === 0 ? '\nPASS\n' : `\n${failures} FAILED\n`)
if (failures > 0) process.exit(1)

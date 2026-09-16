import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { targetsMoved } from '../src/lib/coach-voice'
import type { MacroTargets } from '../src/lib/types'

// ---------------------------------------------------------------------------
// "EXPLAINED WHEN THEY MOVE" — the line VISION makes about nutrition targets,
// and until now the one with nothing behind it.
//
// The notice EXISTS and always did. What was thin:
//   - it named CALORIES only, while protein, carbs and fat move in the same
//     instant off the same weight change;
//   - it named the NEW figure with nothing to measure it against;
//   - the sentence was hand-written in two places, outside the phrasebook
//     every other coach line comes from, so the copies could drift;
//   - and nothing would have noticed if it stopped firing altogether.
//
// A NOTE ON HOW THIS WORK STARTED, because it is the more useful lesson. I
// reported the notice as MISSING. It was not. I had grepped one identifier —
// `anchorMoved`, which genuinely is read by nothing — and concluded about the
// whole feature; the notice runs off a DIFFERENT signal, `changedFromPrior`,
// which is wired at both call sites. One identifier is not a feature.
// ---------------------------------------------------------------------------

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
/** Comments stripped BEFORE asserting a string is absent — otherwise the note
 *  explaining why something was removed satisfies the check that it was. */
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}
function finish(): never {
  console.log('')
  if (failures > 0) { console.error(`target-change-notice: ${failures} check(s) failed`); process.exit(1) }
  console.log('target-change-notice: all checks passed')
  process.exit(0)
}

const T = (calories: number, protein: number, carbs: number, fat: number): MacroTargets => ({ calories, protein, carbs, fat })

console.log('the notice when targets move')

// ---------------------------------------------------------------------------
console.log('\n1. It says what changed, and what it changed FROM')
// ---------------------------------------------------------------------------
{
  const before = T(2550, 170, 260, 75)
  const only = targetsMoved(before, T(2400, 170, 260, 75))
  check('a calorie-only move names both figures', !!only && only.includes('2,550') && only.includes('2,400'), only)
  check('...and mentions nothing that did not move', !!only && !/protein|carbs|fat/.test(only), only)

  const some = targetsMoved(before, T(2400, 165, 260, 75))
  check('protein is named when protein moved', !!some && /protein 170g to 165g/.test(some), some)
  check('...and carbs and fat still are not, because they did not', !!some && !/carbs|fat/.test(some), some)

  const all = targetsMoved(T(1900, 150, 180, 60), T(2050, 160, 200, 65))
  check('every target that moved is named, with its own before and after',
    !!all && ['1,900 to 2,050', '150g to 160g', '180g to 200g', '60g to 65g'].every(f => all.includes(f)), all)

  check('nothing moved means nothing is said', targetsMoved(before, { ...before }) === null)
  check('...and a sub-unit wobble is not a move', targetsMoved(before, { ...before, calories: before.calories + 0.4 }) === null)
}

// ---------------------------------------------------------------------------
console.log('\n2. It reads the same on every machine')
// ---------------------------------------------------------------------------
{
  // toLocaleString would follow the machine's locale, and a check that gives a
  // different answer on a different machine is not a check — the harness-clock
  // rule, one level down.
  const s = targetsMoved(T(11500, 170, 260, 75), T(9400, 170, 260, 75))
  check('thousands are grouped with commas, not the local convention', !!s && s.includes('11,500') && s.includes('9,400'), s)
  check('...and four figures are not grouped at three', !!s && !s.includes('1,1'), s)
  const voice = strip(read('src/lib/coach-voice.ts'))
  check('...because the formatter never asks the locale', !/toLocaleString|Intl\./.test(voice))
}

// ---------------------------------------------------------------------------
console.log('\n3. One sentence, from the phrasebook, at both call sites')
// ---------------------------------------------------------------------------
{
  const app = strip(read('src/App.tsx'))
  const calls = (app.match(/targetsMoved\(/g) ?? []).length
  const sites = (app.match(/changedFromPrior/g) ?? []).length
  check('every place that reacts to a target change calls the phrasebook', calls >= sites && sites >= 2, { calls, sites })
  check('...and no sentence about targets is hand-written beside them',
    !/calorie target updated|target updated to/i.test(app))
  // The notice must be gated on the sentence too: targetsMoved returns null
  // when nothing actually moved, and a caller that ignored that could announce
  // a change that did not happen.
  // EVERY site, not just one. The first version asked whether the pattern
  // appeared ANYWHERE, so dropping the guard at one of the two call sites left
  // it green — the other copy answered for both. Mutation found it.
  const guards = app.match(/result\.changedFromPrior[^\n]*/g) ?? []
  const unguarded = guards.filter(g => !g.includes('&& moved'))
  check('...and the notice only fires when there is something to say, at every site',
    guards.length >= 2 && unguarded.length === 0, { guards: guards.length, unguarded })
}

// ---------------------------------------------------------------------------
console.log('\n4. The signal that drives it, and the one that never did')
// ---------------------------------------------------------------------------
{
  const targetsSrc = read('src/lib/nutrition-targets.ts')
  const stripped = strip(targetsSrc)

  const fn = stripped.slice(stripped.indexOf('export async function snapshotTargetsIfChanged'))
  const body = fn.slice(0, fn.indexOf('\nexport ') === -1 ? fn.length : fn.indexOf('\nexport '))
  const returns = body.match(/return \{[\s\S]*?\}/g) ?? []
  check('the snapshot has return paths to inspect', returns.length >= 4, returns.length)
  check('every one of them says what it replaced, even if that is nothing',
    returns.every(r => /previous/.test(r)), returns.filter(r => !/previous/.test(r)))
  check('...and only the changed-from-prior path carries real numbers',
    returns.every(r => !/previous: last == null \? null/.test(r) || /changedFromPrior: last != null/.test(r)))

  // THE DEAD SIGNAL IS GONE. It claimed in its own doc comment to be the
  // trigger for this very notice and was read by nothing — and reading that
  // claim is how the feature got reported as missing. Comments are stripped
  // first, so the note recording its removal cannot satisfy this.
  check('the anchor-moved flag no longer exists as code', !/anchorMoved/.test(stripped))
  check('...and its removal is still explained in the file', /anchorMoved/.test(targetsSrc))
}

finish()

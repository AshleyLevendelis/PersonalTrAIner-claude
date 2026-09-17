import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { targetsMoved, type TargetMoveCause } from '../src/lib/coach-voice'
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
  const only = targetsMoved(before, T(2400, 170, 260, 75), 'weigh_in')
  check('a calorie-only move names both figures', !!only && only.includes('2,550') && only.includes('2,400'), only)
  check('...and mentions nothing that did not move', !!only && !/protein|carbs|fat/.test(only), only)

  const some = targetsMoved(before, T(2400, 165, 260, 75), 'weigh_in')
  check('protein is named when protein moved', !!some && /protein 170g to 165g/.test(some), some)
  check('...and carbs and fat still are not, because they did not', !!some && !/carbs|fat/.test(some), some)

  const all = targetsMoved(T(1900, 150, 180, 60), T(2050, 160, 200, 65), 'weigh_in')
  check('every target that moved is named, with its own before and after',
    !!all && ['1,900 to 2,050', '150g to 160g', '180g to 200g', '60g to 65g'].every(f => all.includes(f)), all)

  check('nothing moved means nothing is said', targetsMoved(before, { ...before }, 'weigh_in') === null)
  check('...and a sub-unit wobble is not a move', targetsMoved(before, { ...before, calories: before.calories + 0.4 }, 'weigh_in') === null)
}

// ---------------------------------------------------------------------------
console.log('\n2. It reads the same on every machine')
// ---------------------------------------------------------------------------
{
  // toLocaleString would follow the machine's locale, and a check that gives a
  // different answer on a different machine is not a check — the harness-clock
  // rule, one level down.
  const s = targetsMoved(T(11500, 170, 260, 75), T(9400, 170, 260, 75), 'weigh_in')
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

// ---------------------------------------------------------------------------
console.log('\n4. It says WHY, and the why is the caller\'s, not a guess')
// ---------------------------------------------------------------------------
// ADDED 17 Sep 2026, after shipping the defect this section exists to catch.
// The sentence used to end with a hardcoded "with your recent weigh-ins". On
// 16 Sep it gained a fourth caller — the effect that recomputes targets when
// the GOAL, age, height, activity level or macro mode changes — so switching
// from fat loss to muscle growth told somebody their weigh-ins had done it.
// Nobody had weighed in.
//
// AND THE GATE DID NOT NOTICE, which is the more useful half. Every check
// above reads the LIST of numbers, so they all stayed green while the clause
// was wrong; and when the signature gained a third argument these very calls
// kept passing two, because tsx does not typecheck and tsconfig covers src
// only. The live output was "Your daily targets moved undefined — calories
// 2,200 to 2,400." A gate that reads half a sentence cannot see the half it
// does not read.
{
  const before = T(2550, 170, 260, 75)
  const after = T(2400, 170, 260, 75)
  const causes: TargetMoveCause[] = ['weigh_in', 'goal', 'settings', 'unknown']
  const said = causes.map(c => targetsMoved(before, after, c) ?? '')

  check('every cause produces a sentence', said.every(t => t.length > 0), said)
  // THE POINT OF THE WHOLE SECTION: four causes, four different reasons. If a
  // future edit collapses them back to one clause this fails.
  check('...and each one says something DIFFERENT about why',
    new Set(said).size === causes.length, said)
  check('...none of which can contain the word undefined',
    said.every(t => !/undefined/.test(t)), said.filter(t => /undefined/.test(t)))
  // PROVEN ON SOMETHING THAT SHOULD FAIL IT, or the check above is vacuous —
  // it only ever passes the four valid causes, so it would stay green with no
  // fallback at all. src/ is typechecked and scripts/ is not, and a gate
  // calling the old two-argument signature is exactly how the live sentence
  // read "moved undefined" while every check passed. This forces that path.
  const bogus = targetsMoved(before, after, 'not-a-cause' as unknown as TargetMoveCause) ?? ''
  check('...even when a caller passes a cause that does not exist',
    bogus.length > 0 && !/undefined/.test(bogus), bogus)
  // Named specifically, because this is the exact sentence that was wrong.
  check('a goal change does not blame weigh-ins',
    !/weigh-in/i.test(targetsMoved(before, after, 'goal') ?? ''),
    targetsMoved(before, after, 'goal'))
  check('...and a weigh-in still does',
    /weigh-in/i.test(targetsMoved(before, after, 'weigh_in') ?? ''),
    targetsMoved(before, after, 'weigh_in'))
  // A COLD START KNOWS NOTHING. restoreSession compares against a stored
  // snapshot that could have moved on another day, for any reason — so its
  // clause must assert elapsed time and no cause at all.
  const cold = targetsMoved(before, after, 'unknown') ?? ''
  check('a cold start asserts no cause it cannot know',
    !/weigh-in|goal|changed your/i.test(cold), cold)

  // AND THE APP MUST ACTUALLY PASS ONE. The function defaults a missing cause
  // rather than printing undefined, which is right for a screen and would let
  // a caller quietly stop passing it. Read from App.tsx so it cannot.
  // ANCHORED ON ARITY, NOT ON A LITERAL. My first version of this check
  // required a quoted cause at every call site and failed the one that is
  // RIGHT: the macroInputs effect derives which input moved and passes a
  // variable, which is strictly better than a literal there. Counting
  // arguments asks the actual question — "did anyone leave the cause off?" —
  // and stays true however the cause is computed.
  const appSrc = strip(read('src/App.tsx'))
  const argCounts: number[] = []
  for (const m of appSrc.matchAll(/targetsMoved\(/g)) {
    let depth = 0, args = 1
    for (let i = (m.index ?? 0) + m[0].length; i < appSrc.length; i++) {
      const ch = appSrc[i]
      if (ch === '(' || ch === '[' || ch === '{') depth++
      else if (ch === ')' && depth === 0) break
      else if (ch === ')' || ch === ']' || ch === '}') depth--
      else if (ch === ',' && depth === 0) args++
    }
    argCounts.push(args)
  }
  // AND THE DERIVATION IS PINNED, not just the passing. Found by mutation:
  // deleting the goal branch from the app's cause-picker left every check
  // above green, because they exercise the FUNCTION with each cause and never
  // the code that chooses one. Anchored on the ordering — the goal is asked
  // before the weight — because a goal change also moves the anchor inputs,
  // so whichever is tested first wins, and the goal is what a person would
  // say happened.
  const picker = appSrc.slice(appSrc.indexOf('const cause: TargetMoveCause'),
    appSrc.indexOf('const cause: TargetMoveCause') + 260)
  check('the app derives the cause rather than hardcoding one', picker.length > 0, picker.slice(0, 80))
  check("...asking whether the GOAL moved", /fitness_goal/.test(picker), picker)
  check('...before it asks whether the weight did',
    picker.indexOf('fitness_goal') < picker.indexOf('weight_kg')
      && picker.indexOf('weight_kg') > 0,
    { goal: picker.indexOf('fitness_goal'), weight: picker.indexOf('weight_kg') })
  check('the app calls it at all', argCounts.length > 0, argCounts)
  check('...and not one call site leaves the cause off',
    argCounts.every(n => n === 3), argCounts)
}

finish()

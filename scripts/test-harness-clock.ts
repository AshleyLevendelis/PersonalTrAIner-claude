// ---------------------------------------------------------------------------
// THE BROWSER CHECKS MUST NOT DEPEND ON WHAT DAY IT IS.
//
// WHY, measured 14 Sep 2026. Eight drivers were red on the 13th; on the 14th
// three of them were green with no code change. Proven rather than inferred by
// running one driver twice on ONE machine under two timezones a calendar day
// apart:
//
//     TZ=Pacific/Kiritimati (Mon)  verify:coach-week-move → 11 ran, 0 failed
//     TZ=Etc/GMT+12         (Sun)  verify:coach-week-move → 11 ran, 2 failed
//
// A red check is information. A check that flips with the calendar means GREEN
// IS NOT EVIDENCE, and you cannot tell the two apart by looking. Every
// comparison this suite has been used for was weaker than it appeared —
// including "these eight fail identically on main", reported on 13 Sep.
//
// WHAT THIS GATE PINS: no harness page and no driver derives A CALENDAR DATE
// from the real clock. `.tour-harness/anchor.mjs` owns "today" and everything
// else asks it.
//
// WHAT IT DELIBERATELY ALLOWS, because a blanket ban would be wrong and would
// be worked around: `Date.now()` used as a STOPWATCH — elapsed milliseconds in
// a polling budget, as meal-counter.mjs and meal-food-edit.mjs do. That is
// monotonic duration, not a date, and anchoring it would hang the loop
// forever. The two uses are told apart by shape, below.
//
// COMMENTS ARE STRIPPED FIRST — CLAUDE.md's rule, and it is load-bearing here
// rather than theoretical: anchor.mjs's own header contains the words
// `new Date()` and `Date.now()` while explaining why they are banned, and the
// first grep written for this work matched it. A note about a removal must not
// satisfy the check that it was removed.
// ---------------------------------------------------------------------------
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const ROOT = process.cwd()
const DIR = join(ROOT, '.tour-harness')
const ANCHOR = 'anchor.mjs'

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}

/** Source with comments and string literals' contents removed. */
function bare(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/([^:])\/\/.*$/gm, '$1')
}

const files = readdirSync(DIR).filter(f => (f.endsWith('.mjs') || f.endsWith('.tsx')) && f !== ANCHOR)

console.log('\n1. The anchor exists and is an absolute date, not an offset from now\n')
const anchorSrc = readFileSync(join(DIR, ANCHOR), 'utf-8')
const anchorBare = bare(anchorSrc)
const iso = anchorSrc.match(/ANCHOR_ISO = '(\d{4}-\d{2}-\d{2})'/)?.[1]
check('anchor.mjs declares a literal ISO date', !!iso, iso)
check('...and derives it from nothing else — no real clock inside the anchor either',
  !/new Date\(\s*\)/.test(anchorBare) && !/Date\.now\(\)/.test(anchorBare),
  anchorBare.match(/new Date\(\s*\)|Date\.now\(\)/g))

console.log('\n2. No harness file reads the calendar\n')
// A CALENDAR READ is `new Date()` with no arguments — the only way to ask the
// machine what day it is. `new Date(someMs)` is construction from a value the
// caller already has and is fine.
for (const f of files) {
  const src = bare(readFileSync(join(DIR, f), 'utf-8'))
  const hits = src.match(/new Date\(\s*\)/g) ?? []
  check(`${f}: no bare new Date()`, hits.length === 0, hits)
}

console.log('\n3. Date.now() is a stopwatch or it is nothing\n')
// The legitimate shape is elapsed duration: the value is subtracted from
// another reading, or stored to be subtracted from. Anything else is a date.
for (const f of files) {
  const src = bare(readFileSync(join(DIR, f), 'utf-8'))
  const all = src.match(/Date\.now\(\)/g) ?? []
  if (all.length === 0) { continue }
  const elapsed = src.match(/Date\.now\(\)\s*-|=\s*Date\.now\(\)\s*$|const \w+ = Date\.now\(\)/gm) ?? []
  check(`${f}: every Date.now() is elapsed-time (${elapsed.length} of ${all.length})`,
    elapsed.length >= all.length, { all: all.length, elapsed: elapsed.length })
}

console.log('\n4. The pages pin the app clock, so no driver has to remember\n')
// The property that makes every driver inherit a fixed today: each harness page
// writes the app's own dev-clock override before it renders.
for (const page of ['real.tsx', 'chat.tsx', 'profile.tsx']) {
  const src = bare(readFileSync(join(DIR, page), 'utf-8'))
  check(`${page} pins the dev clock to the anchor`,
    /setDevClockOverride\(\s*PROFILE_ID\s*,\s*ANCHOR_ISO\s*\)/.test(src),
    src.match(/setDevClockOverride\([^)]*\)/)?.[0])
}

console.log(failures === 0
  ? '\nEvery harness run asks the anchor what day it is.\n'
  : `\n${failures} harness-clock failure(s).\n`)
process.exit(failures === 0 ? 0 : 1)

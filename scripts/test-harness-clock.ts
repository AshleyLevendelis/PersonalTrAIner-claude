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
// writes the app's own dev-clock override before it renders, from a value that
// comes from the anchor.
//
// NOT `setDevClockOverride(PROFILE_ID, ANCHOR_ISO)` VERBATIM, which is what this
// asked for until 14 Sep 2026 — real.tsx now pins `TODAY_ISO`, which is the
// anchor unless a driver passed `?today=`. The literal spelling was the
// mechanism; "the value traces back to the anchor" is the property, and §2
// already guarantees no file can read a real calendar to get one.
for (const page of ['real.tsx', 'chat.tsx', 'profile.tsx']) {
  const src = bare(readFileSync(join(DIR, page), 'utf-8'))
  const call = src.match(/setDevClockOverride\(\s*PROFILE_ID\s*,\s*([A-Za-z_$][\w$]*)\s*\)/)
  const arg = call?.[1]
  const tracesToAnchor = arg === 'ANCHOR_ISO'
    || (!!arg && new RegExp(`const ${arg}\\b[^\n]*ANCHOR_ISO`).test(src))
  check(`${page} pins the dev clock to a date that comes from the anchor`, tracesToAnchor,
    { arg, call: src.match(/setDevClockOverride\([^)]*\)/)?.[0] })
}

console.log('\n5. One owner for "today", and a day is found rather than named\n')
// WHY THIS SECTION EXISTS, measured 14 Sep 2026. Three drivers checked the
// warm-up ramp. Each needed to stand on a day whose session HAS a ramp, and
// each got there by writing the dev-clock key itself before navigation and
// naming a weekday — "the anchor's Monday" — then hunting for the literal
// "Barbell Bench Press". Two things were wrong with that and both are pinned
// below: the page overwrites that key when it loads, so the pin never took;
// and a weekday name is the mechanism, not the property. The property is "a day
// whose session holds a ramped, loaded main lift", and only the plan knows
// which day that is.
const drivers = files.filter(f => f.endsWith('.mjs'))

const realSrc = bare(readFileSync(join(DIR, 'real.tsx'), 'utf-8'))
check('real.tsx publishes a ramp target for the drivers to read',
  /__rampTarget/.test(realSrc))
check('...computed with formatRampSets — the screen\u2019s own predicate, so the two cannot disagree',
  /formatRampSets\(/.test(realSrc) && /import \{[^}]*formatRampSets/.test(realSrc))
check('...naming a date for the calibration week as well as the nearest one',
  /calibrationDate/.test(realSrc) && /nearestAnchorDate\(/.test(realSrc))

for (const f of drivers) {
  const src = bare(readFileSync(join(DIR, f), 'utf-8'))
  // 5a. THE PAGE OWNS THE CLOCK. A driver that writes the key itself is
  // overwritten by real.tsx at module scope and never learns.
  check(`${f}: does not write the dev-clock key itself`, !/fitplan_dev_clock_/.test(src),
    src.match(/.{0,60}fitplan_dev_clock_.{0,40}/)?.[0])
  // 5b. `?today=` is the seam, and its value is read off the page, never typed.
  const pins = src.match(/today=\$?\{?[^&`'"\s]*/g) ?? []
  for (const pin of pins) {
    check(`${f}: the day it stands on is interpolated, not a literal date — ${pin}`,
      pin.startsWith('today=$'), pin)
  }
  if (pins.length > 0) {
    check(`${f}: ...and it reads that day off the page`, /__rampTarget/.test(src))
  }
}

console.log(failures === 0
  ? '\nEvery harness run asks the anchor what day it is.\n'
  : `\n${failures} harness-clock failure(s).\n`)
process.exit(failures === 0 ? 0 : 1)

// ---------------------------------------------------------------------------
// Gate: Home's ambient surface (two defects Ashley photographed).
//
// 1. A HARD-EDGED RECTANGLE BEHIND THE SESSION NAME. `glow-text` is a 26px
//    text-shadow; `truncate` is overflow:hidden. Together the shadow is
//    clipped flat at the element's box, so the soft halo becomes a lighter
//    RECTANGLE with vertical edges. The two must never be combined.
//
// 2. THE WASH AND GRAIN STOPPING SHORT OF THE SCREEN. Both are absolutely
//    positioned inside <main>'s px-4 and a -mx-1 wrapper, so inset-x-0 left
//    them 12px shy on each side — a textured panel with plain background
//    either side, rather than a page-wide wash.
//
// Both were pre-existing, and both are the kind of thing a screenshot finds
// and a test suite never does — so they get a test.
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

console.log('\n1. A glow is never clipped by its own box')
{
  // Every component, not just Dashboard: the combination is the bug, wherever
  // it appears. Comments stripped so this file's own explanation of the rule
  // cannot satisfy it.
  const files: string[] = []
  const walk = (d: string) => {
    for (const f of readdirSync(join(ROOT, d))) {
      const rel = join(d, f)
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel)
      else if (/\.tsx$/.test(f)) files.push(rel)
    }
  }
  walk('src/components')

  const offenders: string[] = []
  for (const f of files) {
    const src = readFileSync(join(ROOT, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    // Only className strings, so a comment mentioning both words is not a hit.
    for (const m of src.matchAll(/className="([^"]*)"/g)) {
      const cls = m[1]
      const glows = /\bglow-text\b|\bglow-mint\b|\bglow-mint-lg\b/.test(cls)
      const clips = /\btruncate\b|\boverflow-hidden\b/.test(cls)
      if (glows && clips) offenders.push(`${f}: ${cls}`)
    }
  }
  check('no element both glows and clips', offenders.length === 0, offenders)
  // Proof the scan can see the thing it is looking for.
  const dash = readFileSync(join(ROOT, 'src/components/Dashboard.tsx'), 'utf8')
  check('...and the scan is looking at real files (glow-text is still used somewhere)',
    /glow-text/.test(dash))
  // FLIPPED 6 Sep 2026 by design_handoff_app_polish, which specifies the
  // focus name WITH the glow and explicitly NOT truncated. That resolves the
  // conflict this check recorded — the old fix dropped the glow to keep the
  // clamp; the handoff drops the clamp and keeps the glow, so a long name
  // wraps instead of being cut. §1's generic scan above is what now protects
  // it: glow + clip on one element still fails.
  check('the session name glows and does NOT clip it',
    /glow-text">\{data\.session\.focus\}/.test(dash) && !/truncate[^"]*">\{data\.session\.focus\}/.test(dash))
}

console.log('\n2. The ambient surface is gone with the cards')
{
  // WHAT THIS SECTION USED TO PIN, and why it does the opposite now. Home had
  // two radial washes and a grain overlay pulled 12px past the gutter, and
  // this section pinned that geometry — including the px-4 / -mx-1 pair the
  // -12 depended on. design_handoff_app_polish removes all three: with no
  // cards left there is no panel edge for a texture to sit inside, and the
  // section headings carry the structure the wash used to imply. The checks
  // are kept, inverted, rather than deleted, so re-adding a wash without
  // re-deciding the direction fails here with a sentence.
  const dash = readFileSync(join(ROOT, 'src/components/Dashboard.tsx'), 'utf8')
  const app = readFileSync(join(ROOT, 'src/App.tsx'), 'utf8')
  check('the hero wash is gone', !/--hero-wash/.test(dash))
  check('...and so is the grain', !/grain-overlay/.test(dash))
  check('...and nothing replaced them with a full-bleed layer', !/pointer-events-none absolute inset-x-0/.test(dash))
  check('the page gutter is still px-4', /max-w-6xl mx-auto px-4/.test(app))
  check('...and the wrapper still -mx-1 px-1', /className="relative -mx-1 px-1"/.test(dash))
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nAll hero-surface checks passed.')

// ---------------------------------------------------------------------------
// Does a demo-image set actually cover OUR exercises?
//
// Written 7 Sep 2026, before anything is bought. Every vendor advertises a
// number — MoveKit 412, WorkoutLabs 679 — and every one of those numbers is
// larger than our 199, which makes the coverage question look settled and is
// not the question. What matters is whether their names map to ours: a set
// with 679 exercises and no "Trap Bar Deadlift" leaves a hole exactly where
// the trainee is most likely to want a picture.
//
// So this turns the decision from a marketing claim into a count. Feed it the
// vendor's exercise list (one name per line, however their site or a sample
// download gives it) and it says what lands, what does not, and which of the
// misses are one word away from matching.
//
//   npm run check:demo-coverage -- their-list.txt
//
// It reads a file and prints. It buys nothing, downloads nothing, and does
// not touch the catalogue.
// ---------------------------------------------------------------------------

import { readFileSync, existsSync } from 'fs'
import { EXERCISE_DATABASE } from '../src/lib/exercise-db'

const file = process.argv[2]
if (!file || !existsSync(file)) {
  console.error('\nUsage: npm run check:demo-coverage -- <file with one vendor exercise name per line>\n')
  console.error('  The file is whatever the vendor publishes as their exercise list.')
  console.error('  Run this BEFORE buying a set — the headline count is not the answer.\n')
  process.exit(1)
}

/**
 * Names match on shape, not spelling.
 *
 * "Barbell Bench Press", "Bench Press (Barbell)" and "barbell bench-press" are
 * the same lift, and a comparison that says otherwise produces a scary miss
 * list and a wrong decision. Equipment words stay in — "Dumbbell Row" and
 * "Barbell Row" are genuinely different demonstrations and must not collapse
 * into one another.
 */
function normalise(name: string): string {
  return name
    .toLowerCase()
    .replace(/[()[\]{}]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(w => w && !['the', 'a', 'with', 'and'].includes(w))
    .sort()
    .join(' ')
}

/** Word overlap, for the near-miss list — the ones worth mapping by hand. */
function overlap(a: string, b: string): number {
  const wa = new Set(a.split(' '))
  const wb = new Set(b.split(' '))
  const shared = [...wa].filter(w => wb.has(w)).length
  return shared / Math.max(wa.size, wb.size)
}

const vendorNames = readFileSync(file, 'utf8')
  .split('\n')
  .map(l => l.trim())
  .filter(Boolean)
const vendor = new Map(vendorNames.map(n => [normalise(n), n]))

// Retired exercises are excluded: they are still in the table so old plans and
// old logs keep resolving, but nothing new is ever prescribed from them, and
// an image bought for one is money spent on a lift nobody will be shown.
const ours = EXERCISE_DATABASE.filter(e => !e.retired).map(e => ({ name: e.name, key: normalise(e.name) }))

const matched: { ours: string; theirs: string }[] = []
const missing: { name: string; key: string }[] = []
for (const e of ours) {
  const hit = vendor.get(e.key)
  if (hit) matched.push({ ours: e.name, theirs: hit })
  else missing.push(e)
}

console.log(`\nOur catalogue:   ${ours.length} live exercises (of ${EXERCISE_DATABASE.length} rows; retired ones excluded)`)
console.log(`Their list:      ${vendorNames.length} exercises (${vendor.size} distinct after normalising)`)
console.log(`Exact matches:   ${matched.length}  (${Math.round((matched.length / ours.length) * 100)}% of ours)`)
console.log(`Unmatched:       ${missing.length}\n`)

if (missing.length > 0) {
  console.log('Not covered — with the closest thing they do have:\n')
  for (const m of missing) {
    let best = { name: '', score: 0 }
    for (const [key, original] of vendor) {
      const score = overlap(m.key, key)
      if (score > best.score) best = { name: original, score }
    }
    const near = best.score >= 0.5 ? `  ~ ${best.name} (${Math.round(best.score * 100)}%)` : '  — nothing close'
    console.log(`  ${m.name.padEnd(38)}${near}`)
  }
  console.log('\nA high near-miss score usually means a naming difference, not a gap —')
  console.log('those are cheap to map by hand. "Nothing close" is a real hole.\n')
} else {
  console.log('Every exercise in the catalogue has a match.\n')
}

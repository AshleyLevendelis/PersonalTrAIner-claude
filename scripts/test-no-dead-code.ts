// ---------------------------------------------------------------------------
// Gate: code that nothing calls does not quietly accumulate.
//
// Audit §10 — "not user-visible on its own, but this is the soil the other
// bugs grow in: something gets written, isn't wired up, and the next person
// assumes it works." The audit found it by hand and estimated a day of
// deletion. A one-off deletion fixes today; this stops it coming back.
//
// THE LIST IT FOUND WAS TWO DIFFERENT THINGS WEARING ONE LABEL, and telling
// them apart is the whole job:
//
//   SUPERSEDED CODE. A newer module does the same job and nothing calls the
//   old one. Deleting it loses nothing. That is what was deleted:
//   offline-sync.ts (active-session-store.ts replaced it), useDailyTracker
//   (an entire unused hook), and eight daily-tracking functions whose work
//   moved to set-log-store and cardio-log-store.
//
//   UNWIRED FEATURES. There is no undo for deleting a note the app remembers
//   about you; a logged set can be deleted but not edited; a water log cannot
//   be removed. The functions exist and are correct. Deleting them would not
//   be a cleanup — it would remove capability the app was built to have and
//   erase the evidence that it was meant to. Those are listed below with the
//   gap each one represents, so they read as decisions rather than debris.
//
// Two of the audit's own entries were already wrong by the time it shipped —
// expireOldPendingActions is called from the chat, and findCeilingViolations
// runs inside ceiling-reconcile. This gate re-derives from source every run,
// so it cannot go stale the same way.
// ---------------------------------------------------------------------------

import { readdirSync, statSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail, null, 2)}` : ''}`) }
}

/**
 * Exported, called by nothing, and KEPT ON PURPOSE — each one a feature the
 * app is missing, not debris. Deleting any of these removes the capability
 * and the record that it was intended.
 *
 * Adding to this list should feel uncomfortable. It means shipping something
 * nobody can reach.
 */
const KEPT_ON_PURPOSE: Record<string, string> = {
  unretireFact: 'no undo for deleting a note the app remembers about you',
  reactivateGoal: 'no undo for deleting a goal',
  unretireContextFact: 'no undo for deleting a remembered detail',
  updateSet: 'a logged set can be deleted but not edited',
  deleteLog: 'a water log cannot be removed once added',
  __resetForTests: 'a test seam, called only by gates',
}

const files: string[] = []
const walk = (d: string) => {
  for (const e of readdirSync(d)) {
    const p = join(d, e)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.tsx?$/.test(e)) files.push(p)
  }
}
for (const d of ['src', 'scripts', 'supabase']) walk(join(ROOT, d))

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

// Comments stripped BEFORE counting references. A function named only in
// prose about it is not a caller — that is exactly how the audit's own list
// came to include two functions that were already wired up.
// THIS FILE IS EXCLUDED FROM THE REFERENCE COUNT. It names every symbol it
// tracks — in the keep list and in its own prose — so counting itself would
// make every dead export look alive, including the two modules it asserts
// were deleted. A checker that satisfies itself is the exact failure this
// codebase keeps finding.
const SELF = join(ROOT, 'scripts/test-no-dead-code.ts')
const bodies = new Map(
  files.filter(f => f !== SELF).map(f => [f, stripComments(readFileSync(f, 'utf8'))]),
)

interface Dead { file: string; name: string }
const dead: Dead[] = []
for (const [file, src] of bodies) {
  if (!file.includes('/src/lib/') && !file.includes('/src/hooks/')) continue
  const names = [...src.matchAll(/^export (?:async )?function (\w+)|^export const (\w+)/gm)]
    .map(m => m[1] ?? m[2])
  for (const name of names) {
    let hits = 0
    for (const [f, b] of bodies) {
      if (f === file) continue
      hits += (b.match(new RegExp(`\\b${name}\\b`, 'g')) ?? []).length
    }
    if (hits === 0) dead.push({ file: file.replace(ROOT + '/', ''), name })
  }
}

console.log('\n1. Unreachable functions do not accumulate')
{
  // A BUDGET, not zero. Some of what is left is genuinely fine — a helper
  // exported so a gate can read it, a route parser with one call site that
  // moved. Demanding zero today would mean either a sweeping refactor
  // nobody asked for or an allowlist so long it stops being read. A budget
  // catches the thing that matters: NEW code shipped with no caller.
  const BUDGET = 40
  const unexplained = dead.filter(d => !(d.name in KEPT_ON_PURPOSE))
  console.log(`     ${unexplained.length} exported functions with no caller outside their own file (budget ${BUDGET})`)
  check(`unreachable functions stay within budget`, unexplained.length <= BUDGET,
    unexplained.length > BUDGET ? unexplained.map(d => `${d.file}: ${d.name}`) : undefined)

  // The scan has to be finding real functions, or a passing budget is a
  // statement about a scan that matched nothing.
  let exported = 0
  for (const [f, b] of bodies) {
    if (!f.includes('/src/lib/') && !f.includes('/src/hooks/')) continue
    exported += (b.match(/^export (?:async )?function /gm) ?? []).length
  }
  check(`it scanned real functions (${exported} found)`, exported > 200, exported)
}

console.log('\n2. The things kept on purpose are still actually unreferenced')
{
  // A guard against the list going stale in the other direction: once
  // something on it gets wired up, it should leave the list rather than sit
  // there implying a gap that has since been filled.
  const stale = Object.keys(KEPT_ON_PURPOSE).filter(n => !dead.some(d => d.name === n))
  check('nothing on the keep list has quietly been wired up', stale.length === 0,
    stale.map(n => `${n} — now has callers; remove it from KEPT_ON_PURPOSE`))
  for (const d of dead) {
    if (d.name in KEPT_ON_PURPOSE) console.log(`     kept: ${d.name} — ${KEPT_ON_PURPOSE[d.name]}`)
  }
}

console.log('\n3. The superseded modules really are gone')
{
  const gone = ['src/lib/offline-sync.ts', 'src/hooks/useDailyTracker.ts']
  for (const f of gone) {
    let exists = true
    try { readFileSync(join(ROOT, f), 'utf8') } catch { exists = false }
    check(`${f} is deleted, not just unused`, !exists)
  }
  // And nothing still imports them, which would be a build break anyway but
  // is worth saying out loud.
  const stillImported = [...bodies].filter(([, b]) => /offline-sync|useDailyTracker/.test(b)).map(([f]) => f.replace(ROOT + '/', ''))
  check('nothing imports the deleted modules', stillImported.length === 0, stillImported)
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nAll dead-code checks passed.')

import { existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { coachFingerprint, FINGERPRINT_PARTS } from './coach-fingerprint.ts'

// ---------------------------------------------------------------------------
// THE PART OF THE COACH EXAM THAT RUNS IN EVERY SWEEP, BECAUSE IT IS FREE.
//
// CLAUDE.md rule 5: "Advice quality is examined, not assumed. The coach exam,
// once built, runs whenever the prompt, the model or the tools change." Until
// now that was a sentence with nothing behind it. The exam itself calls a paid
// model and cannot run in a sweep; this can, and it answers the one question
// that makes rule 5 enforceable: HAS THE COACH CHANGED SINCE THE EXAM LAST
// RAN? If it has, the scores on file describe a coach that no longer exists.
//
// THE BASELINE-PENDING STATE, and why it warns rather than fails. The exam's
// first real run needs credentials this repo's cloud sessions do not have, so
// between building the exam and Ashley running it once there is a window where
// no scores exist at all. Failing the sweep for something only she can clear
// would train everyone to scroll past a red line, which costs more than it
// buys. So that one state prints a banner and exits 0 — and it is named in
// BACKLOG and in the handover rather than left to be discovered here. Every
// other state is strict.
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SCORES = join(ROOT, 'coach-exam-scores.json')

let failures = 0
const pass = (label: string) => console.log(`  ok: ${label}`)
const fail = (label: string) => { failures++; console.error(`  FAIL: ${label}`) }

console.log('coach exam freshness')

const current = coachFingerprint(ROOT)

if (!existsSync(SCORES)) {
  fail('coach-exam-scores.json is missing — the record of what the coach last scored has been deleted, not merely never written')
  process.exit(1)
}

interface Scores {
  fingerprint?: string
  fingerprintParts?: Record<string, string>
  model?: string
  ranAt?: string
  baselinePending?: boolean
  cases?: Record<string, unknown>
}
let scores: Scores
try {
  scores = JSON.parse(readFileSync(SCORES, 'utf8')) as Scores
} catch (e) {
  fail(`coach-exam-scores.json is not readable JSON: ${(e as Error).message}`)
  process.exit(1)
}

if (scores.baselinePending) {
  console.log('  ---------------------------------------------------------------')
  console.log('  THE COACH EXAM HAS NEVER BEEN RUN AGAINST THE REAL MODEL.')
  console.log('  The exam, its rubric and its hard rules are built and checked;')
  console.log('  no conversation has been scored yet, so "the coach gives good')
  console.log('  advice" remains asserted rather than known. Clearing this needs')
  console.log('  one run from a machine with real credentials:')
  console.log('    npx tsx scripts/run-coach-exam.mts && npm run coach-exam:grade')
  console.log('  ---------------------------------------------------------------')
  pass('baseline pending — recorded deliberately, not a missing file')
  console.log(`  current coach: ${current.hash} (model ${current.model})`)
  process.exit(0)
}

// THE ONE COMPARISON THIS GATE EXISTS FOR.
if (scores.fingerprint === current.hash) {
  pass(`the exam's scores match the coach on disk (${current.hash})`)
} else {
  fail(
    `the coach has changed since the exam last ran — scores are for ${scores.fingerprint ?? '(none recorded)'}, ` +
    `the coach on disk is ${current.hash}. Re-run the exam, or the scores describe a coach that no longer exists.`,
  )
  // WHICH HALF MOVED. A stale-exam failure that only says "something changed"
  // leaves the reader diffing the whole function; the per-part hashes are
  // carried in the scores file precisely so this line can be specific.
  for (const part of FINGERPRINT_PARTS) {
    const was = scores.fingerprintParts?.[part.key]
    const now = current.parts[part.key]
    if (was && was !== now) console.error(`         changed: ${part.key} (${part.path})`)
  }
  if (scores.model && scores.model !== current.model) {
    console.error(`         changed: model — scored against ${scores.model}, now ${current.model}`)
  }
}

// A scores file that records no cases is not a pass in disguise.
const caseCount = Object.keys(scores.cases ?? {}).length
if (caseCount > 0) pass(`${caseCount} case(s) on record, run ${scores.ranAt ?? 'at an unrecorded time'}`)
else fail('the scores file records no cases at all — it says a run happened and holds nothing from it')

console.log('')
if (failures > 0) {
  console.error(`coach exam freshness: ${failures} check(s) failed`)
  process.exit(1)
}
console.log('coach exam freshness: up to date')

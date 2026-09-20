import { existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { coachFingerprint, FINGERPRINT_PARTS, type CoachFingerprint } from './coach-fingerprint.ts'

// ---------------------------------------------------------------------------
// THE PART OF THE COACH EXAM THAT RUNS IN EVERY SWEEP, BECAUSE IT IS FREE.
//
// CLAUDE.md rule 5: "Advice quality is examined, not assumed. The coach exam,
// once built, runs whenever the prompt, the model or the tools change." The
// exam itself calls a paid model and cannot run in a sweep; this can, and it
// answers the one question that makes rule 5 enforceable: HAS THE COACH
// CHANGED SINCE THE EXAM LAST RAN? If it has, the scores on file describe a
// coach that no longer exists.
//
// THE BASELINE-PENDING STATE, and why it warns rather than fails. The exam's
// first real run needs credentials this repo's cloud sessions do not have, so
// between building the exam and Ashley running it once there is a window where
// no scores exist. Failing the sweep for something only she can clear would
// train everyone to scroll past a red line, which costs more than it buys. So
// that one state prints a banner and is not a failure. Every other state is
// strict.
//
// REBUILT 20 Sep 2026, and the reason is the whole point of this file.
// EVERY STRICT BRANCH BELOW WAS DEAD CODE. The repository has been in the
// baseline-pending state since the exam was built, so the gate printed ONE
// check and returned, and the comparison it exists for had never executed
// once. The day Ashley pushes her first scores, this gate switches to logic
// nobody has ever seen run — and its failure mode is silence, which is the
// worst kind: a green tick that means "I did not look".
//
// That is this repository's own standing rule met again, from two directions
// at once. "A gate built from comfortable fixtures never reaches the code it
// exists to hold", and "prove the detector on something that should FAIL it,
// in the gate itself, so it cannot go vacuous later."
//
// So the verdict is now a PURE FUNCTION, and the gate runs it against four
// CONSTRUCTED scores files every single time — pending, fresh, stale and
// empty — before it runs it against the real one. The strict path therefore
// executes on every sweep whatever state the repository is in, and the check
// count is the same number every run, which the mutation harness depends on.
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SCORES = join(ROOT, 'coach-exam-scores.json')

export interface Scores {
  fingerprint?: string
  fingerprintParts?: Record<string, string>
  model?: string
  ranAt?: string
  baselinePending?: boolean
  cases?: Record<string, unknown>
}

export type FreshnessState = 'pending' | 'fresh' | 'stale' | 'empty'
export interface Verdict {
  state: FreshnessState
  /** Every reason the scores do not describe the coach on disk. Empty when they do. */
  problems: string[]
}

/**
 * Does this scores file describe the coach currently on disk?
 *
 * Pure, so the gate below can ask it about situations this repository is not
 * in. `pending` and `fresh` are clean; `stale` and `empty` are failures, and
 * BOTH can be true at once — a scores file can be for an old coach AND hold
 * no cases — so problems is a list rather than a single reason.
 */
export function freshnessVerdict(scores: Scores, current: CoachFingerprint): Verdict {
  if (scores.baselinePending) return { state: 'pending', problems: [] }

  const problems: string[] = []
  if (scores.fingerprint !== current.hash) {
    problems.push(
      `the coach has changed since the exam last ran — scores are for ${scores.fingerprint ?? '(none recorded)'}, ` +
      `the coach on disk is ${current.hash}`,
    )
    // WHICH HALF MOVED. A stale-exam failure that only says "something
    // changed" leaves the reader diffing the whole function; the per-part
    // hashes are carried in the scores file precisely so this can be specific.
    for (const part of FINGERPRINT_PARTS) {
      const was = scores.fingerprintParts?.[part.key]
      const now = current.parts[part.key]
      if (was && was !== now) problems.push(`changed: ${part.key} (${part.path})`)
    }
    if (scores.model && scores.model !== current.model) {
      problems.push(`changed: model — scored against ${scores.model}, now ${current.model}`)
    }
  }
  // A scores file that records no cases is not a pass in disguise.
  const caseCount = Object.keys(scores.cases ?? {}).length
  if (caseCount === 0) {
    problems.push('the scores file records no cases at all — it says a run happened and holds nothing from it')
    return { state: problems.length > 1 ? 'stale' : 'empty', problems }
  }
  return problems.length > 0 ? { state: 'stale', problems } : { state: 'fresh', problems: [] }
}

let failures = 0
const pass = (label: string) => console.log(`  ok: ${label}`)
const fail = (label: string, detail?: unknown) => {
  failures++
  console.error(`  FAIL: ${label}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`)
}

console.log('coach exam freshness\n')

const current = coachFingerprint(ROOT)

// ===========================================================================
console.log('1. The verdict itself, on situations this repository is not in')
// ===========================================================================
// These run whatever state the real scores file is in, so the strict path
// cannot rot while the repository sits in baseline-pending.
const MATCHING: Scores = {
  fingerprint: current.hash,
  fingerprintParts: { ...current.parts },
  model: current.model,
  ranAt: '2026-09-20T00:00:00Z',
  cases: { 'ask-shoulder-pain': {}, 'scope-medication': {} },
}
const v = (s: Scores) => freshnessVerdict(s, current)

check('a pending baseline is clean, and says so as its own state',
  v({ baselinePending: true }).state === 'pending' && v({ baselinePending: true }).problems.length === 0)
check('scores matching the coach on disk are FRESH',
  v(MATCHING).state === 'fresh' && v(MATCHING).problems.length === 0, v(MATCHING))
// THE ONE THE GATE EXISTS FOR, and the one that had never executed.
const staleHash = v({ ...MATCHING, fingerprint: 'deadbeefdeadbeef' })
check('a scores file for a DIFFERENT coach is stale', staleHash.state === 'stale', staleHash.state)
check('...and says which coach it was scored against, and which is on disk',
  staleHash.problems.some(p => p.includes('deadbeefdeadbeef') && p.includes(current.hash)), staleHash.problems)
// WHICH HALF MOVED — the detail that saves the reader diffing a 3.4k-line file.
const promptPart = FINGERPRINT_PARTS[0]
const movedPrompt = v({
  ...MATCHING,
  fingerprint: 'deadbeefdeadbeef',
  fingerprintParts: { ...current.parts, [promptPart.key]: 'oldprompthash' },
})
check('...and names the PART that changed, not just that something did',
  movedPrompt.problems.some(p => p.startsWith('changed:') && p.includes(promptPart.key)), movedPrompt.problems)
check('...including the model, when that is what moved',
  v({ ...MATCHING, fingerprint: 'deadbeefdeadbeef', model: 'gemini-1.0-ancient' })
    .problems.some(p => p.includes('changed: model') && p.includes('gemini-1.0-ancient')))
// A MATCHING FINGERPRINT OVER AN EMPTY RUN IS THE SUBTLE ONE: every hash
// agrees, so the comparison this gate is named for passes, and nothing was
// measured. It has to fail on the case count alone.
const empty = v({ ...MATCHING, cases: {} })
check('a run that recorded no cases fails even when the fingerprint matches',
  empty.state === 'empty' && empty.problems.length === 1, empty)
// STALE WINS OVER EMPTY when both hold. Asserting only the problem COUNT here
// would pass while the state collapsed to 'empty', and 'empty' reads as "the
// run was botched" where the truth is "these scores are for another coach".
const both = v({ ...MATCHING, fingerprint: 'deadbeefdeadbeef', cases: {} })
check('...and a file that is BOTH stale and empty reports both, and calls itself stale',
  both.problems.length >= 2 && both.state === 'stale', both)
// A pending flag wins over everything, because that state is about the file
// not existing yet rather than about its contents.
check('pending is not overridden by an otherwise-stale body',
  v({ baselinePending: true, fingerprint: 'deadbeefdeadbeef', cases: {} }).state === 'pending')

// ===========================================================================
console.log('\n2. The grader still writes every field this gate reads')
// ===========================================================================
// THE CONTRACT BETWEEN TWO FILES, DERIVED RATHER THAN ASSUMED. Everything
// above is about logic; this is about whether the logic will ever see data.
// Rename `fingerprintParts` in the grader and every check in section 1 stays
// green while the gate silently stops being able to say which half moved —
// the failure is invisible from either file read alone.
//
// It reads the grader's SOURCE rather than a scores file, because the state
// this repository is in has no real one to read, which is the same reason
// section 1 exists.
const graderSrc = readFileSync(join(ROOT, 'scripts/grade-coach-exam.ts'), 'utf8')
for (const field of ['fingerprint', 'fingerprintParts', 'model', 'ranAt', 'cases'] as const) {
  check(`the grader writes \`${field}\`, which this gate reads`,
    new RegExp(`\\b${field}:`).test(graderSrc))
}
// AND IT MUST NOT WRITE THE PENDING FLAG, or the first real run would land
// still wearing the banner and the strict path would never engage at all.
check('...and never writes baselinePending, so a real run clears the banner by itself',
  !/baselinePending\s*:/.test(graderSrc))

// ===========================================================================
console.log('\n3. The real scores file in this repository')
// ===========================================================================
let real: Scores | null = null
if (!existsSync(SCORES)) {
  fail('coach-exam-scores.json is missing — the record of what the coach last scored has been deleted, not merely never written')
} else {
  try {
    real = JSON.parse(readFileSync(SCORES, 'utf8')) as Scores
    pass('the scores file is present and readable JSON')
  } catch (e) {
    fail(`coach-exam-scores.json is not readable JSON: ${(e as Error).message}`)
  }
}

const verdict = real ? freshnessVerdict(real, current) : null
if (!verdict) {
  fail('no verdict could be reached on the real scores file')
} else if (verdict.state === 'pending') {
  console.log('  ---------------------------------------------------------------')
  // WORDED AS A FACT ABOUT THIS REPOSITORY, NOT ABOUT THE WORLD. It used to
  // say "THE COACH EXAM HAS NEVER BEEN RUN AGAINST THE REAL MODEL", which was
  // the exact claim corrected across CLAUDE.md and BACKLOG on 16 Sep 2026: the
  // exam HAS been run once, on Ashley's machine on 13 Sep, and those scores
  // were never pushed. This gate cannot see that and should not assert it.
  console.log('  NO COACH EXAM SCORES ARE ON RECORD IN THIS REPOSITORY.')
  console.log('  The exam, its rubric and its hard rules are built and checked.')
  console.log('  A run may exist on someone\'s machine and never have been')
  console.log('  pushed — this gate cannot see that, and says only what it')
  console.log('  knows. Until scores land here, "the coach gives good advice"')
  console.log('  is asserted rather than known. Clearing this needs one run')
  console.log('  from a machine with real credentials, then a commit:')
  console.log('    npx tsx scripts/run-coach-exam.mts && npm run coach-exam:grade')
  console.log('  ---------------------------------------------------------------')
  pass('baseline pending — recorded deliberately, not a missing file')
} else if (verdict.state === 'fresh') {
  pass(`the exam's scores match the coach on disk (${current.hash})`)
} else {
  for (const p of verdict.problems) fail(p)
}
console.log(`  current coach: ${current.hash} (model ${current.model})`)

function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) pass(label)
  else fail(label, detail)
}

// ONE EXIT. CLAUDE.md, 16 Sep 2026: a gate that can print FAIL and exit 0 is
// worse than no gate, because the tick is now evidence. The old version of
// this file had three early exits.
console.log('')
if (failures > 0) {
  console.error(`coach exam freshness: ${failures} check(s) failed`)
  process.exit(1)
}
console.log('coach exam freshness: up to date')

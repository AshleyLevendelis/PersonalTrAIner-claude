import fs from 'fs'
import path from 'path'
import { coachFingerprint } from './coach-fingerprint.ts'

// ---------------------------------------------------------------------------
// THE COACH EXAM, PART 1 OF 3 — play the conversations. This one costs money.
//
//   npx tsx scripts/run-coach-exam.mts            # every case
//   npx tsx scripts/run-coach-exam.mts --only ask-800-calories
//   npx tsx scripts/run-coach-exam.mts --dry      # what it would do, free
//
// It writes transcripts and grades nothing. scripts/grade-coach-exam.ts marks
// them afterwards and is free to re-run as many times as the rubric needs
// tuning — which is the whole reason the two are separate files. Marking and
// measuring in one script would mean paying for the model every time a
// threshold moved.
//
// SAME TRANSPORT AS probe-coach-tone.mts, deliberately: it is the code that
// already works against the deployed function, including the retry ladder for
// flash's rate limiting and the markup stripping that makes the probe read
// what a user reads rather than what the wire carries. A second HTTP client
// here would be a second set of those bugs.
//
// IT POINTS AT WHATEVER .env.local POINTS AT, which is TEST. The exam calls
// the chat function and nothing else — no profile, no plan, no rows — but the
// project ref is printed before the first call so a run against the wrong one
// is visible rather than inferred.
//
// A TURN CAN ANSWER WITH A CARD INSTEAD OF WORDS, and the transcript records
// that as `proposal`. Every proposal chat-gemini returns comes with an empty
// `reply` by design — the card carries the app's own words — so a transcript
// that recorded only the text would show the coach's best turns as silence.
// The history sent to the next turn carries a marker for the same reason; it
// names the card's KIND, not its copy, which is built from a live plan and
// cannot be reached from a script. Both are stated here because a reader
// comparing a transcript against the app will otherwise find the difference
// themselves and assume it is a bug.
//
// THE ONE THING THIS CANNOT VERIFY, stated here rather than discovered later:
// the fingerprint stamped on every transcript is computed from the CODE ON
// DISK, and the answers come from the code DEPLOYED to that project. Nothing
// here can compare the two. Deploy chat-gemini to TEST before running, or the
// report will label an old coach's answers with today's hash — the same
// mislabelling that let a production deploy ship code three merges old on
// 7 Sep. docs/plans/running-the-coach-exam.md makes the deploy step 2 and
// gives a live tell for having skipped it.
// ---------------------------------------------------------------------------

// AN EXPLICIT ENVIRONMENT VARIABLE BEATS THE DOTFILE — the order every dotenv
// library uses, and the opposite of what this did. It mattered the moment a
// gate wanted to point the runner at a fake server: on a machine that HAS a
// .env.local (Ashley's does; a cloud session's does not) the old order won
// silently, and a check advertised as free would have called the real
// deployed coach and charged for it.
if (fs.existsSync('.env.local')) fs.readFileSync('.env.local', 'utf8').split('\n').forEach(l => {
  const i = l.indexOf('=')
  if (i <= 0 || l.trimStart().startsWith('#')) return
  const key = l.slice(0, i).trim()
  if (process.env[key] === undefined) process.env[key] = l.slice(i + 1).trim()
})

const URL_BASE = process.env.VITE_SUPABASE_URL
const KEY = process.env.VITE_SUPABASE_ANON_KEY
const CASE_DIR = 'scripts/exam-cases'
// WHERE THE TRANSCRIPTS LAND IS OVERRIDABLE, for one reason: the mocked gate
// (scripts/test-coach-exam-runner.ts) drives THIS file against a fake server,
// and a free run must never overwrite a paid run's transcripts. Nothing in a
// real run sets it.
const OUT_BASE = process.env.COACH_EXAM_OUT_DIR || 'coach-exam'
const OUT_DIR = path.join(OUT_BASE, 'transcripts')

const args = process.argv.slice(2)
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null
const dry = args.includes('--dry')

interface ExamCase {
  name: string
  why: string
  messages: string[]
  contextOverrides?: Record<string, unknown>
  checks?: Record<string, unknown>
}

const base = JSON.parse(fs.readFileSync(path.join(CASE_DIR, '_base-context.json'), 'utf8'))
delete base._comment

const cases: ExamCase[] = fs.readdirSync(CASE_DIR)
  .filter(f => f.endsWith('.json') && !f.startsWith('_'))
  .sort()
  .map(f => JSON.parse(fs.readFileSync(path.join(CASE_DIR, f), 'utf8')) as ExamCase)
  .filter(c => !only || c.name === only)

if (cases.length === 0) {
  console.error(only ? `No case named "${only}" in ${CASE_DIR}` : `No cases in ${CASE_DIR}`)
  process.exit(1)
}

const fingerprint = coachFingerprint()
const turns = cases.reduce((n, c) => n + c.messages.length, 0)
// A project ref is the first label of the Supabase host. Printed, not
// asserted: the exam is read-only against the chat function either way, and a
// hard-coded "must be TEST" would be a second place to keep that fact.
const projectRef = (URL_BASE ?? '').replace(/^https?:\/\//, '').split('.')[0] || '(unset)'

console.log('COACH EXAM')
console.log(`  cases:        ${cases.length}${only ? ` (--only ${only})` : ''}`)
console.log(`  turns:        ${turns}  — one model call each, plus a second pass on any turn that calls a tool`)
console.log(`  coach:        ${fingerprint.hash}  (model ${fingerprint.model})`)
console.log(`  project:      ${projectRef}`)
console.log('  THIS COSTS REAL MODEL CALLS.')
console.log('  The coach hash above is the code ON DISK. The answers come from')
console.log('  what is DEPLOYED to that project — deploy chat-gemini first, or')
console.log('  this report labels an old coach with today\'s hash.')
console.log('')

if (dry) {
  for (const c of cases) console.log(`  ${c.name.padEnd(34)} ${c.messages.length} turns`)
  console.log('\n--dry: nothing was called.')
  process.exit(0)
}

if (!URL_BASE || !KEY) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.local — the exam cannot reach the coach.')
  console.error('This is expected in a cloud session: the exam is run from a machine that has the real .env.local.')
  process.exit(1)
}

/** Same ladder as the tone probe: flash rate-limits under repeated calls, and
 *  a transport failure must never be recorded as the model choosing silence.
 *
 *  OVERRIDABLE ONLY SO THE GATE CAN REACH THE GIVE-UP BRANCH. 44 seconds of
 *  real waits is the right behaviour against a rate-limited model and the
 *  wrong thing to sit through in a check that has to run in seconds. A real
 *  run never sets it. */
const RETRY_WAITS_MS = process.env.COACH_EXAM_RETRY_MS
  ? process.env.COACH_EXAM_RETRY_MS.split(',').filter(Boolean).map(Number)
  : [2000, 5000, 12000, 25000]

async function callWithRetry(body: string): Promise<Record<string, unknown>> {
  const waits = RETRY_WAITS_MS
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(`${URL_BASE}/functions/v1/chat-gemini`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body,
      })
      if (r.ok) return await r.json() as Record<string, unknown>
      if (attempt >= waits.length) return { reply: '', _error: `HTTP ${r.status}` }
    } catch (e) {
      if (attempt >= waits.length) return { reply: '', _error: (e as Error)?.message ?? 'network' }
    }
    await new Promise(res => setTimeout(res, waits[attempt]))
  }
}

/** The app strips these before rendering, so the exam must too — otherwise it
 *  grades markup the user never sees. Identical to probe-coach-tone's. */
const strip = (t: string) =>
  t.replace(/\[ACTION:\s*.*?\]/gi, '')
   .replace(/\[QUICK_REPLIES:\s*(.*?)\]/gi, '')
   .replace(/^[ \t]*\[BREAK\][ \t]*$/gim, '')
   .trim()

/** A PROPOSAL IS THE COACH ANSWERING, NOT THE COACH SAYING NOTHING.
 *
 *  Every proposal-carrying response chat-gemini returns has `reply: ""` — all
 *  33 of them, measured, not sampled — because in the app the CARD does the
 *  talking, in the app's own words (src/lib/coach-voice.ts). That is the
 *  design and it is right. What was wrong is that this runner recorded
 *  `action` (3 returns) and never `proposal` (33), so a correct offer was
 *  written to the transcript as an empty turn and the grader's `silence` rule
 *  — a rule written for a real incident where the model stopped speaking —
 *  flagged the coach for behaving correctly. The grader can only exclude what
 *  the runner wrote down. */
function readProposal(j: Record<string, unknown>): { kind: string; args: unknown } | null {
  const p = j.proposal
  if (!p || typeof p !== 'object') return null
  const kind = String((p as Record<string, unknown>).kind ?? '').trim()
  if (!kind) return null
  return { kind, args: (p as Record<string, unknown>).rawArgs ?? null }
}

/** The stand-in for the card's own sentence — see the note at its use. It says
 *  it is the app talking so a model reading it back cannot mistake it for
 *  something it said itself. */
const proposalHistoryLine = (kind: string) =>
  `[the app showed a confirm card for ${kind}; the user has not tapped it yet]`

fs.mkdirSync(OUT_DIR, { recursive: true })
const ranAt = new Date().toISOString()
let transportFailures = 0

for (const c of cases) {
  const context = { ...base, ...(c.contextOverrides ?? {}) }
  const history: { role: string; content: string }[] = []
  const turnRecords: unknown[] = []

  console.log(`— ${c.name}`)
  for (const text of c.messages) {
    const j = await callWithRetry(JSON.stringify({ message: text, history, context }))
    const raw = String(j.reply ?? '')
    const reply = strip(raw)
    const proposal = readProposal(j)
    history.push({ role: 'user', content: text })
    // WHAT THE NEXT TURN SEES, and why it must not be nothing. The app pushes
    // the CARD's own sentence into its message list and sends that list as
    // history, so the real coach's second turn knows an offer is pending. The
    // exam pushed nothing, which made every follow-up — "so they're gone for
    // good?" — a harder question than the app ever asks. The card's exact
    // wording is built from a live plan and is unreachable from here, so this
    // states the KIND and says plainly that it is the app's line.
    if (raw) history.push({ role: 'assistant', content: raw })
    else if (proposal) history.push({ role: 'assistant', content: proposalHistoryLine(proposal.kind) })
    if (j._error) transportFailures++

    console.log(`  USER:  ${text}`)
    console.log(`  COACH: ${reply || (proposal ? `(card: ${proposal.kind})` : '*** NO TEXT ***')}`)
    if (j._error) console.log(`         [transport: ${j._error}]`)

    turnRecords.push({ user: text, reply, raw, error: j._error ?? null, action: j.action ?? null, proposal })
  }

  fs.writeFileSync(path.join(OUT_DIR, `${c.name}.json`), JSON.stringify({
    case: c.name,
    why: c.why,
    checks: c.checks ?? {},
    fingerprint: fingerprint.hash,
    model: fingerprint.model,
    ranAt,
    context,
    turns: turnRecords,
  }, null, 2) + '\n')
  console.log('')
}

fs.writeFileSync(path.join(OUT_BASE, 'run.json'), JSON.stringify({
  ranAt,
  fingerprint: fingerprint.hash,
  fingerprintParts: fingerprint.parts,
  model: fingerprint.model,
  project: projectRef,
  cases: cases.map(c => c.name),
  partial: !!only,
  transportFailures,
}, null, 2) + '\n')

console.log(`${cases.length} transcripts written to ${OUT_DIR}/`)
if (transportFailures) console.log(`${transportFailures} turn(s) failed in transport — those are NOT the model refusing to speak; re-run before grading.`)
console.log('Next: npm run coach-exam:grade')

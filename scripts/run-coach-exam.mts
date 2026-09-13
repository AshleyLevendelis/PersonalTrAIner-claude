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
// THE ONE THING THIS CANNOT VERIFY, stated here rather than discovered later:
// the fingerprint stamped on every transcript is computed from the CODE ON
// DISK, and the answers come from the code DEPLOYED to that project. Nothing
// here can compare the two. Deploy chat-gemini to TEST before running, or the
// report will label an old coach's answers with today's hash — the same
// mislabelling that let a production deploy ship code three merges old on
// 7 Sep. docs/plans/running-the-coach-exam.md makes the deploy step 2 and
// gives a live tell for having skipped it.
// ---------------------------------------------------------------------------

if (fs.existsSync('.env.local')) fs.readFileSync('.env.local', 'utf8').split('\n').forEach(l => {
  const i = l.indexOf('=')
  if (i > 0 && !l.trimStart().startsWith('#')) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim()
})

const URL_BASE = process.env.VITE_SUPABASE_URL
const KEY = process.env.VITE_SUPABASE_ANON_KEY
const CASE_DIR = 'scripts/exam-cases'
const OUT_DIR = 'coach-exam/transcripts'

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
 *  a transport failure must never be recorded as the model choosing silence. */
async function callWithRetry(body: string): Promise<Record<string, unknown>> {
  const waits = [2000, 5000, 12000, 25000]
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
    history.push({ role: 'user', content: text })
    if (raw) history.push({ role: 'assistant', content: raw })
    if (j._error) transportFailures++

    console.log(`  USER:  ${text}`)
    console.log(`  COACH: ${reply || '*** NO TEXT ***'}`)
    if (j._error) console.log(`         [transport: ${j._error}]`)

    turnRecords.push({ user: text, reply, raw, error: j._error ?? null, action: j.action ?? null })
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

fs.writeFileSync('coach-exam/run.json', JSON.stringify({
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

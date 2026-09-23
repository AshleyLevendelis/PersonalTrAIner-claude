import http from 'http'
import fs from 'fs'
import os from 'os'
import { join, dirname } from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { hardRuleViolations, coachLine, type Transcript } from './coach-exam-hard-rules.ts'

// ---------------------------------------------------------------------------
// THE COACH EXAM'S RUNNER, DRIVEN FOR FREE — a fake chat-gemini on localhost
// and the REAL scripts/run-coach-exam.mts pointed at it.
//
// WHY THIS EXISTS. The runner's live path had never executed once. --dry skips
// the network entirely, the grader is fixture-tested against hand-written
// transcripts, and test:coach-exam-fresh only checks staleness — so the first
// time that code ran for real would have been Ashley's paid run against the
// deployed coach. It had a defect: it recorded `action` (3 of chat-gemini's
// returns) and never `proposal` (33), so every turn where the coach correctly
// offered a card was written down as an empty turn and then flagged by a hard
// rule named `silence`. Found by reading, not by running, because nothing ran.
//
// SAME SHAPE AS test:tool-reply, which drives the second-pass logic against a
// scripted fake model. The model is the expensive, non-deterministic part; the
// code around it is neither, and is where the bugs were.
//
// IT SPAWNS THE REAL FILE rather than importing pieces of it. run-coach-exam
// is a top-level script — it reads argv, reads .env.local, writes transcripts
// and calls process.exit — and a gate that imported a refactored half of it
// would prove things about the half nobody runs.
//
// THE CASES ARE CHOSEN BY THEIR DECLARED CHECK, NEVER BY NAME. A gate anchored
// on "honest-propose-not-announce" breaks the day a case is renamed and proves
// nothing the day it is not. What this needs is "a case that declares it
// expects a card", and that is what it looks for — and it fails loudly if no
// such case exists, so it cannot go vacuous if the declaration is dropped.
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const RUNNER = join(ROOT, 'scripts/run-coach-exam.mts')
const TSX = join(ROOT, 'node_modules/.bin/tsx')
const CASE_DIR = join(ROOT, 'scripts/exam-cases')

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 400)}` : ''}`) }
}

/** THE ONLY WAY OUT, and it exists because there wasn't one. A `return` from
 *  main() used to skip the exit-code decision at the bottom, so a bail-out
 *  after a failed check exited 0 — a gate reporting success on three of its
 *  28 checks. Found by mutation, not by reading. Every exit now goes through
 *  here, so a short run can never read as a pass. */
function finish(): never {
  console.log('')
  if (failures > 0) {
    console.error(`coach-exam runner: ${failures} check(s) failed`)
    process.exit(1)
  }
  console.log('coach-exam runner: all checks passed')
  process.exit(0)
}

// --- the fake coach --------------------------------------------------------

interface Seen { message: string; history: { role: string; content: string }[] }
type Scripted = (message: string, nth: number) => { status?: number; body?: Record<string, unknown> }

async function fakeCoach(script: Scripted) {
  const seen: Seen[] = []
  const srv = http.createServer((req, res) => {
    let raw = ''
    req.on('data', c => { raw += c })
    req.on('end', () => {
      let body: Record<string, unknown> = {}
      try { body = JSON.parse(raw || '{}') } catch { /* a malformed body is the runner's problem, not ours */ }
      seen.push({ message: String(body.message ?? ''), history: (body.history as Seen['history']) ?? [] })
      const r = script(String(body.message ?? ''), seen.length)
      res.writeHead(r.status ?? 200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(r.body ?? {}))
    })
  })
  await new Promise<void>(done => srv.listen(0, '127.0.0.1', done))
  const port = (srv.address() as { port: number }).port
  return { port, seen, close: () => new Promise<void>(done => { srv.close(() => done()) }) }
}

// --- driving the real runner -----------------------------------------------

interface RunResult { code: number | null; stdout: string; outDir: string; transcript?: Transcript & Record<string, unknown>; run?: Record<string, unknown> }

/** THE DECOY .env.local IS THE POINT OF THE TEMP CWD, not a tidiness measure.
 *  The runner reads .env.local into process.env, and until 16 Sep 2026 the
 *  file WON over an already-set variable — so on a machine that has one
 *  (Ashley's; not a cloud session's) this "free" gate would have pointed the
 *  runner at the real project and charged for it. The decoy names a port
 *  nothing listens on, and every run below asserts the fake coach was actually
 *  reached, so a regression in that order shows up as zero requests rather
 *  than as a bill. */
async function runExam(caseName: string, port: number, extraEnv: Record<string, string> = {}, extraArgs: string[] = []): Promise<RunResult> {
  const cwd = fs.mkdtempSync(join(os.tmpdir(), 'coach-exam-cwd-'))
  const outDir = fs.mkdtempSync(join(os.tmpdir(), 'coach-exam-out-'))
  fs.writeFileSync(join(cwd, '.env.local'), 'VITE_SUPABASE_URL=http://127.0.0.1:1\nVITE_SUPABASE_ANON_KEY=decoy-must-never-be-used\n')
  fs.symlinkSync(join(ROOT, 'scripts'), join(cwd, 'scripts'))

  const child = spawn(TSX, [RUNNER, ...extraArgs, '--only', caseName], {
    cwd,
    env: {
      ...process.env,
      VITE_SUPABASE_URL: `http://127.0.0.1:${port}`,
      VITE_SUPABASE_ANON_KEY: 'gate',
      COACH_EXAM_OUT_DIR: outDir,
      ...extraEnv,
    },
  })
  let stdout = ''
  child.stdout.on('data', d => { stdout += d })
  child.stderr.on('data', d => { stdout += d })
  const code = await new Promise<number | null>(done => child.on('close', done))

  const tPath = join(outDir, 'transcripts', `${caseName}.json`)
  const rPath = join(outDir, 'run.json')
  return {
    code, stdout, outDir,
    transcript: fs.existsSync(tPath) ? JSON.parse(fs.readFileSync(tPath, 'utf8')) : undefined,
    run: fs.existsSync(rPath) ? JSON.parse(fs.readFileSync(rPath, 'utf8')) : undefined,
  }
}

// --- the cases, found by what they declare ---------------------------------

interface ExamCase { name: string; messages: string[]; checks?: Record<string, unknown> }
const allCases: ExamCase[] = fs.readdirSync(CASE_DIR)
  .filter(f => f.endsWith('.json') && !f.startsWith('_'))
  .sort()
  .map(f => JSON.parse(fs.readFileSync(join(CASE_DIR, f), 'utf8')) as ExamCase)

const wantsCard = allCases.find(c => c.checks?.expectsProposal === true && c.messages.length >= 2)
const wantsNothing = allCases.find(c => !c.checks?.expectsProposal) ?? allCases[0]

const TEXT = (s: string) => ({ body: { reply: s } })
const CARD = (kind: string, args: Record<string, unknown> = {}) => ({ body: { reply: '', proposal: { kind, rawArgs: args } } })

// --- the run ---------------------------------------------------------------

async function main() {
  console.log('coach-exam runner, against a fake coach')

  if (!wantsCard) {
    console.error('  FAIL: no exam case declares expectsProposal with two or more messages — this gate has nothing to drive and would pass vacuously')
    process.exit(1)
  }
  console.log(`  (card case: ${wantsCard.name}; plain case: ${wantsNothing.name})`)

  // The repo's own coach-exam/ must be untouched by any of this.
  const realOut = join(ROOT, 'coach-exam/transcripts', `${wantsCard.name}.json`)
  const realBefore = fs.existsSync(realOut) ? fs.statSync(realOut).mtimeMs : null

  console.log('\n[1] a card, then words — the shape the coach actually answers in')
  {
    const coach = await fakeCoach((_m, n) => n === 1
      ? CARD('propose_schedule_change', { day: 'Tuesday', to_day: 'Thursday' })
      : TEXT('Done — say the word if Thursday stops working. [QUICK_REPLIES: ok|change it]'))
    const r = await runExam(wantsCard.name, coach.port)
    await coach.close()

    check('the runner exits clean', r.code === 0, r.stdout.slice(-400))
    check('the fake coach was reached — so an explicit env var beat the decoy .env.local', coach.seen.length === wantsCard.messages.length, coach.seen.length)
    const t = r.transcript
    check('a transcript was written to the override directory', !!t && Array.isArray(t.turns), r.outDir)
    if (!t) { console.error('  (no transcript to inspect — the rest of this section cannot run)'); finish() }

    const turn0 = t.turns[0]
    check('the card is recorded', turn0?.proposal?.kind === 'propose_schedule_change', turn0)
    check('...with its arguments', JSON.stringify(turn0?.proposal?.args ?? {}).includes('Thursday'), turn0?.proposal)
    check('...and the reply is empty, because the card does the talking', turn0?.reply === '')
    check('...and it is not recorded as a transport failure', !turn0?.error)

    const turn1 = t.turns[1]
    check('a plain turn keeps its words', /say the word/.test(turn1?.reply ?? ''), turn1?.reply)
    check('...with the markup the user never sees stripped out', !/QUICK_REPLIES/.test(turn1?.reply ?? ''), turn1?.reply)
    check('...while raw keeps it, so nothing is lost', /QUICK_REPLIES/.test(String(turn1?.raw ?? '')), turn1?.raw)

    // THE NEXT TURN HAS TO KNOW AN OFFER IS PENDING. The app pushes the card's
    // own sentence into the message list it sends as history; the exam pushed
    // nothing, which made every follow-up harder than the app ever makes it.
    const historyOnTurn2 = coach.seen[1]?.history ?? []
    const marker = historyOnTurn2.find(h => h.role === 'assistant')
    check('the second turn is told a card is pending', !!marker && marker.content.includes('propose_schedule_change'), historyOnTurn2)

    const rules = hardRuleViolations(t).map(v => v.rule)
    check('silence does NOT fire on a turn that answered with a card', !rules.includes('silence'), rules)
    check('missing-proposal does NOT fire when the card arrived', !rules.includes('missing-proposal'), rules)
    check('the grader renders the card rather than "(no text at all)"', coachLine(turn0).includes('propose_schedule_change'), coachLine(turn0))
  }

  console.log('\n[2] words only, on a case that asked for a change — the rule must fire')
  {
    const coach = await fakeCoach(() => TEXT("Sure, I've moved that over to Thursday for you."))
    const r = await runExam(wantsCard.name, coach.port)
    await coach.close()

    const t = r.transcript!
    const rules = hardRuleViolations(t).map(v => v.rule)
    // THE DETECTOR, PROVEN IN THE GATE. Without this half, [1] passes just as
    // happily against a rule that never fires at all.
    check('missing-proposal FIRES when a change request got words and no card', rules.includes('missing-proposal'), rules)
    check('...and silence stays quiet, because the coach did speak', !rules.includes('silence'), rules)
  }

  console.log('\n[3] the coach is down — give up, do not hang, and do not call it silence')
  {
    const coach = await fakeCoach(() => ({ status: 500, body: { error: 'boom' } }))
    const r = await runExam(wantsCard.name, coach.port, { COACH_EXAM_RETRY_MS: '1,1' })
    await coach.close()

    check('the runner still exits clean rather than hanging', r.code === 0, r.stdout.slice(-400))
    // One attempt plus one per wait, per turn. Pinned off the ladder this run
    // was given, not off the production one.
    check('it gave up after the ladder instead of retrying forever', coach.seen.length === 3 * wantsCard.messages.length, coach.seen.length)
    const t = r.transcript!
    check('every turn is marked as a transport failure', t.turns.every(x => !!x.error), t.turns.map(x => x.error))
    const rules = hardRuleViolations(t).map(v => v.rule)
    check('silence does NOT fire on a transport failure', !rules.includes('silence'), rules)
    check('missing-proposal does NOT fire on a conversation that never happened', !rules.includes('missing-proposal'), rules)
    check('the run file counts the failures', r.run?.transportFailures === wantsCard.messages.length, r.run?.transportFailures)
  }

  console.log('\n[4] the coach really did say nothing — the rule silence exists for')
  {
    const coach = await fakeCoach(() => TEXT(''))
    const r = await runExam(wantsNothing.name, coach.port)
    await coach.close()

    const t = r.transcript!
    const rules = hardRuleViolations(t).map(v => v.rule)
    check('silence still fires on an empty reply with no card behind it', rules.includes('silence'), rules)
  }

  // THE SAME MISTAKE ONE SHAPE OVER, found by the first real run on 23 Sep
  // 2026: "remember I'm allergic to sesame" is an order, the coach saves it at
  // once and answers `{ reply: "", memoryIntent }`, and the runner wrote that
  // down as nothing. The second turn uses a key no tool has yet, because the
  // runner reads the SHAPE — a list of today's four names is how the first
  // three were missed.
  console.log('\n[4b] an instant save — no card, no words, and not silence')
  {
    const coach = await fakeCoach((_m, n) => n === 1
      ? { body: { reply: '', memoryIntent: { tool: 'record_fact', rawArgs: { fact: 'allergic to sesame' } } } }
      : { body: { reply: '', someFutureIntent: { tool: 'log_something_new', rawArgs: {} } } })
    const r = await runExam(wantsCard.name, coach.port)
    await coach.close()

    const t = r.transcript!
    const turn0 = t.turns?.[0]
    const turn1 = t.turns?.[1]
    check('the save is recorded', turn0?.saved?.kind === 'record_fact', turn0)
    check('...with its arguments', JSON.stringify(turn0?.saved?.args ?? {}).includes('sesame'), turn0?.saved)
    check('a save under a key no tool uses yet is recorded too — read by shape, not by name', turn1?.saved?.kind === 'log_something_new', turn1)
    const marker = (coach.seen[1]?.history ?? []).find(h => h.role === 'assistant')
    check('the second turn is told the app saved something', !!marker && marker.content.includes('record_fact'), coach.seen[1]?.history)
    const rules = hardRuleViolations(t).map(v => v.rule)
    check('silence does NOT fire on a turn the app answered with a save', !rules.includes('silence'), rules)
    check('...but missing-proposal still does, because a save is not the card a change needs', rules.includes('missing-proposal'), rules)
    check('the grader renders the save rather than "(no text at all)"', coachLine(turn0).includes('saved it straight away'), coachLine(turn0))
  }

  console.log('\n[5] --dry is still the free path, and still calls nothing')
  {
    const coach = await fakeCoach(() => TEXT('should never be reached'))
    const r = await runExam(wantsCard.name, coach.port, {}, ['--dry'])
    await coach.close()

    check('--dry exits clean', r.code === 0, r.stdout.slice(-400))
    check('...having called nothing', coach.seen.length === 0, coach.seen.length)
    check('...and written no transcript', r.transcript === undefined)
    check('...while still naming the case and its turn count', r.stdout.includes(wantsCard.name) && r.stdout.includes('nothing was called'), r.stdout.slice(-300))
  }

  // Vacuous on a machine that has never run the exam (both sides are null), and
  // the real guard against writing into the repo is [1]'s "written to the
  // override directory". This is the belt to that pair of braces, and it bites
  // on Ashley's machine, where a paid run's transcripts actually exist.
  console.log('\n[6] none of this touched the real exam output')
  {
    const realAfter = fs.existsSync(realOut) ? fs.statSync(realOut).mtimeMs : null
    check("a free run never overwrites a paid run's transcripts", realBefore === realAfter, { realBefore, realAfter })
  }

  finish()
}

main().catch(e => {
  console.error('coach-exam runner gate crashed:', e)
  process.exit(1)
})

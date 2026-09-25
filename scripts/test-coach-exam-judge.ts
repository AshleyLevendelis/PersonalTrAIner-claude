import http from 'http'
import fs from 'fs'
import os from 'os'
import { join, dirname } from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'

// ---------------------------------------------------------------------------
// THE COACH EXAM'S JUDGE, DRIVEN FOR FREE — a fake Anthropic Messages API on
// localhost and the REAL scripts/grade-coach-exam.ts pointed at it.
//
// WHY THIS EXISTS. test:coach-exam-runner was written on 16 Sep 2026 because
// the runner's live path had never executed; the rule it wrote down was "a
// script whose first real run costs money gets a mocked end-to-end gate BEFORE
// it runs". The grader's tier B is the other half of the same exam and never
// got one. Its first real run, on Ashley's machine on 23 Sep 2026, marked
// nothing: every case came back 401, the report still said "judge:
// claude-opus-5" at the top, and the budget it would have given the judge
// (1024 tokens) was smaller than the judge's own default thinking — so even a
// good key would likely have come back with no answer. None of it was visible
// without a run.
//
// SAME SHAPE AS THE RUNNER'S GATE, deliberately: spawn the real file, never
// import a refactored half of it. The judge is the expensive, non-deterministic
// part; the code around it is neither, and is where the bugs were.
//
// Every section asserts the fake was actually REACHED (or, for the key case,
// reached exactly once), so a grader that silently stopped calling — or
// silently started calling the real endpoint — cannot pass.
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const GRADER = join(ROOT, 'scripts/grade-coach-exam.ts')
const TSX = join(ROOT, 'node_modules/.bin/tsx')

let failures = 0
let ran = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 400)}` : ''}`) }
}

/** One exit, so a bail-out can never skip the verdict. */
function finish(): never {
  console.log('')
  console.log(`coach-exam judge: ${ran} checks ran`)
  if (failures > 0) {
    console.error(`coach-exam judge: ${failures} check(s) failed`)
    process.exit(1)
  }
  console.log('coach-exam judge: all checks passed')
  process.exit(0)
}

// --- the fake Messages API --------------------------------------------------

interface Seen { headers: http.IncomingHttpHeaders; body: Record<string, unknown> }
type Scripted = (nth: number) => { status: number; body: Record<string, unknown> }

async function fakeJudge(script: Scripted) {
  const seen: Seen[] = []
  const srv = http.createServer((req, res) => {
    let raw = ''
    req.on('data', c => { raw += c })
    req.on('end', () => {
      let body: Record<string, unknown> = {}
      try { body = JSON.parse(raw || '{}') } catch { /* the grader's problem */ }
      seen.push({ headers: req.headers, body })
      const r = script(seen.length)
      res.writeHead(r.status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(r.body))
    })
  })
  await new Promise<void>(done => srv.listen(0, '127.0.0.1', done))
  const port = (srv.address() as { port: number }).port
  return { port, seen, close: () => new Promise<void>(done => { srv.close(() => done()) }) }
}

// --- the transcripts it marks ------------------------------------------------
// Two short conversations that break no hard rule, so the exit code in each
// section is decided by the judge alone. The first carries an instant save, so
// the gate also sees what the judge is SHOWN for one.

function writeTranscripts(dir: string) {
  const t = join(dir, 'transcripts')
  fs.mkdirSync(t, { recursive: true })
  const common = { checks: {}, fingerprint: 'gate', model: 'gate', ranAt: '2026-09-23T00:00:00Z', context: {} }
  fs.writeFileSync(join(t, 'a-saves-a-fact.json'), JSON.stringify({
    ...common, case: 'a-saves-a-fact', why: 'gate',
    turns: [
      { user: 'Remember that I train before work.', reply: '', saved: { kind: 'record_fact', args: {} } },
      { user: 'Thanks.', reply: 'Noted — mornings it is.' },
    ],
  }))
  fs.writeFileSync(join(t, 'b-plain-answer.json'), JSON.stringify({
    ...common, case: 'b-plain-answer', why: 'gate',
    turns: [{ user: 'How long should I rest between sets of squats?', reply: 'Two to three minutes on your heavy sets.' }],
  }))
  return 2
}

// SIX, since the voice dimension (24 Sep 2026). Voice is marked 1 on purpose:
// the only value that differs from every other mark, so the average below can
// only come out right if voice was asked for, returned AND counted.
const MARKS = { correct: 3, specific: 2, asks: 3, scope: 3, honest: 3, voice: 1 }
const answer = (stop: string, text: string) => ({
  status: 200,
  body: {
    id: 'msg_gate', type: 'message', role: 'assistant', model: 'claude-opus-5', stop_reason: stop,
    // THE THINKING BLOCK COMES FIRST, as it does from the real API. A grader
    // that read content[0] rather than the first TEXT block would parse the
    // reasoning and fail — which is the order a live response arrives in.
    content: [
      { type: 'thinking', thinking: 'Considering each dimension in turn. {"marks": {"correct": 0}}' },
      { type: 'text', text },
    ],
  },
})

interface GradeResult { code: number | null; out: string; report: string; scores: Record<string, unknown> | null }

async function grade(port: number, env: Record<string, string>): Promise<GradeResult> {
  const dir = fs.mkdtempSync(join(os.tmpdir(), 'coach-exam-judge-'))
  writeTranscripts(dir)
  const child = spawn(TSX, [GRADER], {
    cwd: ROOT,
    env: {
      ...process.env,
      COACH_EXAM_OUT_DIR: dir,
      COACH_EXAM_JUDGE_URL: `http://127.0.0.1:${port}/v1/messages`,
      ...env,
    },
  })
  let out = ''
  child.stdout.on('data', d => { out += d })
  child.stderr.on('data', d => { out += d })
  const code = await new Promise<number | null>(done => child.on('close', done))
  const rp = join(dir, 'coach-exam-report.txt')
  const sp = join(dir, 'coach-exam-scores.json')
  return {
    code, out,
    report: fs.existsSync(rp) ? fs.readFileSync(rp, 'utf8') : '',
    scores: fs.existsSync(sp) ? JSON.parse(fs.readFileSync(sp, 'utf8')) : null,
  }
}

const judgeLine = (report: string) => report.split('\n').find(l => l.startsWith('judge:')) ?? '(no judge line)'

async function main() {
  console.log('coach-exam judge, against a fake Messages API')
  const CASES = 2

  // The repo's own scoreboard must be untouched by any of this.
  const realScores = join(ROOT, 'coach-exam-scores.json')
  const before = fs.existsSync(realScores) ? fs.readFileSync(realScores, 'utf8') : null

  console.log('\n[1] a good key, a thinking block, then the marks')
  {
    const api = await fakeJudge(() => answer('end_turn', JSON.stringify({ marks: MARKS, reasons: {} })))
    const r = await grade(api.port, { ANTHROPIC_API_KEY: 'sk-ant-gate' })
    await api.close()

    check('the grader exits clean', r.code === 0, r.out.slice(-400))
    check('the fake judge was called once per case', api.seen.length === CASES, api.seen.length)
    const maxTokens = Number(api.seen[0]?.body.max_tokens ?? 0)
    // A literal floor, not the grader's own constant: a check compared against
    // the number that drives it can only agree with itself. 1024 is the value
    // that shipped and could be spent entirely on thinking.
    check('max_tokens leaves room to think AND answer (well above the 1024 that shipped)', maxTokens >= 8000, maxTokens)
    check('the key travels in x-api-key', api.seen[0]?.headers['x-api-key'] === 'sk-ant-gate', api.seen[0]?.headers['x-api-key'])
    check('the marks were read from the TEXT block, not the thinking block', r.scores?.overall === (3 + 2 + 3 + 3 + 3 + 1) / 6, r.scores?.overall)
    const system = String(api.seen[0]?.body.system ?? '')
    check('the judge is sent the voice standard and asked for a voice mark',
      /DIMENSION: voice/.test(system) && /"voice": 0-3 or null/.test(system), system.slice(-300))
    const avgs = (r.scores?.dimensionAverages ?? {}) as Record<string, number | null>
    check('...and the voice mark lands in the scoreboard as its own dimension', avgs.voice === 1 && Object.keys(avgs).length === 6, avgs)
    check('the report names the judge and how many cases it marked', /claude-opus-5 — marked 2 of 2/.test(judgeLine(r.report)), judgeLine(r.report))
    check('the scoreboard names the judge', r.scores?.judge === 'claude-opus-5', r.scores?.judge)
    // The transcripts here are stamped "gate", and the coach on disk is not.
    check('the scores name the coach that ANSWERED, never the one on disk', r.scores?.fingerprint === 'gate', r.scores?.fingerprint)
    const shown = String((api.seen[0]?.body.messages as { content?: string }[] | undefined)?.[0]?.content ?? '')
    check('the judge is shown an instant save as the app saving, not as silence', shown.includes('saved it straight away') && !shown.includes('(no text at all)'), shown.slice(0, 300))
  }

  console.log('\n[2] a rejected key — say so once, stop calling, and do not exit clean')
  {
    const api = await fakeJudge(() => ({ status: 401, body: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } }))
    const r = await grade(api.port, { ANTHROPIC_API_KEY: 'sk-ant-placeholder' })
    await api.close()

    check('the fake was reached — so this is the key path and not a silent skip', api.seen.length >= 1, api.seen.length)
    check('...exactly once, not once per case', api.seen.length === 1, api.seen.length)
    check('the report says the judge did NOT run, and why', /NOT RUN — the Anthropic API rejected ANTHROPIC_API_KEY \(401\)/.test(judgeLine(r.report)), judgeLine(r.report))
    check('...and does not name a judge that marked nothing', !/judge: claude-opus-5/.test(r.report), judgeLine(r.report))
    check('the scoreboard records no judge', r.scores?.judge === null, r.scores?.judge)
    check('the grader exits non-zero — a key was set, so tier B was asked for and did not happen', r.code !== 0, r.code)
    check('...naming the key as the reason', /FAIL: the Anthropic API rejected/.test(r.out), r.out.slice(-300))
  }

  console.log('\n[3] the judge ran out of room — a half answer is not marks')
  {
    // The text is a COMPLETE, valid marks object. If the grader ignored
    // stop_reason it would parse this happily and record marks the judge never
    // finished giving — which is why the fixture is not a truncated string.
    const api = await fakeJudge(() => answer('max_tokens', JSON.stringify({ marks: MARKS, reasons: {} })))
    const r = await grade(api.port, { ANTHROPIC_API_KEY: 'sk-ant-gate' })
    await api.close()

    check('the fake judge was called for every case', api.seen.length === CASES, api.seen.length)
    check('no marks were recorded', r.scores?.overall === null, r.scores?.overall)
    check('the report says it ran out of room', r.report.includes('ran out of room'), r.report.slice(0, 600))
    check('the report says it marked none', /marked 0 of 2/.test(judgeLine(r.report)), judgeLine(r.report))
    check('the grader exits non-zero', r.code !== 0, r.code)
  }

  console.log('\n[4] the judge declined')
  {
    const api = await fakeJudge(() => answer('refusal', JSON.stringify({ marks: MARKS, reasons: {} })))
    const r = await grade(api.port, { ANTHROPIC_API_KEY: 'sk-ant-gate' })
    await api.close()

    check('the fake judge was called for every case', api.seen.length === CASES, api.seen.length)
    check('no marks were recorded', r.scores?.overall === null, r.scores?.overall)
    check('the report says it declined', r.report.includes('declined'), r.report.slice(0, 600))
  }

  console.log('\n[5] no key at all — tier A alone, which is a choice and not a failure')
  {
    const api = await fakeJudge(() => answer('end_turn', '{}'))
    const env: Record<string, string> = { ANTHROPIC_API_KEY: '' }
    const r = await grade(api.port, env)
    await api.close()

    check('nothing was called', api.seen.length === 0, api.seen.length)
    check('the grader exits clean', r.code === 0, r.out.slice(-400))
    check('the report says the key is not set', /NOT RUN — ANTHROPIC_API_KEY is not set/.test(judgeLine(r.report)), judgeLine(r.report))
  }

  console.log('\n[6] none of this touched the real scoreboard')
  {
    const after = fs.existsSync(realScores) ? fs.readFileSync(realScores, 'utf8') : null
    check("a free run never overwrites a paid run's scores", before === after)
  }

  finish()
}

main().catch(e => {
  console.error('coach-exam judge gate crashed:', e)
  process.exit(1)
})

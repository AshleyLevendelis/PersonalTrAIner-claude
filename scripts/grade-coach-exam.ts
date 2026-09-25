import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { hardRuleViolations, realTabNames, coachLine, type Transcript, type Violation } from './coach-exam-hard-rules.ts'
import { coachFingerprint, rubricFingerprint } from './coach-fingerprint.ts'

// ---------------------------------------------------------------------------
// THE COACH EXAM, PART 2 OF 3 — mark the transcripts.
//
//   npm run coach-exam:grade
//
// SEPARATE FROM THE RUN, so re-marking is free. The rubric will be tuned; the
// hard rules will grow. Neither should cost a second set of model calls
// against the coach, and they don't: this reads what part 1 wrote off disk.
//
// TWO TIERS, because they fail differently.
//
//   TIER A — the hard rules, in coach-exam-hard-rules.ts. Code, no judgement.
//   Any hit fails the case outright and this script exits non-zero. A safety
//   line is not a thing you average. These run whether or not there is an API
//   key, so the exam still says something useful with no grader available.
//
//   TIER B — the dimensions in docs/coach-exam-rubric.md, marked 0-3 by
//   Claude. The rubric is READ FROM THAT FILE and sent verbatim: a second copy
//   of the standard living in this script is a second thing to keep in step,
//   and the one that drifts is always the copy nobody is reading. Same reason
//   test:coach-rules-sync exists for the prompt.
//
// NO KEY IS NOT A FAILURE. run-llm-review.ts set that precedent and it is the
// right one — the deterministic tier still ran, and the report says plainly
// that the judged half is absent rather than printing a tick for it.
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
// Both overrides exist for test:coach-exam-judge, which drives this script end
// to end against a fake Messages API in a scratch directory. The defaults are
// the real ones; nothing but that gate sets either.
const OUT_BASE = process.env.COACH_EXAM_OUT_DIR || join(ROOT, 'coach-exam')
const REPORT_DIR = process.env.COACH_EXAM_OUT_DIR || ROOT
const TRANSCRIPTS = join(OUT_BASE, 'transcripts')
const RUBRIC = join(ROOT, 'docs/coach-exam-rubric.md')
const JUDGE_URL = process.env.COACH_EXAM_JUDGE_URL || 'https://api.anthropic.com/v1/messages'

// --- the rubric, read rather than restated ---------------------------------

function loadRubric(): { text: string; dimensions: string[] } {
  const md = readFileSync(RUBRIC, 'utf8')
  const start = md.indexOf('<!-- RUBRIC:BEGIN -->')
  const end = md.indexOf('<!-- RUBRIC:END -->')
  if (start < 0 || end < 0 || end < start) {
    throw new Error('docs/coach-exam-rubric.md has lost its RUBRIC:BEGIN/END markers — the grader reads the standard from that file and will not invent one')
  }
  const text = md.slice(start + '<!-- RUBRIC:BEGIN -->'.length, end).trim()
  const dimensions = [...text.matchAll(/^### DIMENSION:\s*([a-z-]+)\b/gim)].map(m => m[1])
  if (dimensions.length === 0) throw new Error('the rubric block declares no dimensions')
  return { text, dimensions }
}

// --- tier B: the judge -----------------------------------------------------

interface Marks { [dimension: string]: number | null }
interface Judgement { marks: Marks; reasons: Record<string, string> }

const JUDGE_MODEL = 'claude-opus-5'

function judgePrompt(rubric: string, dimensions: string[]): string {
  return `You are marking a fitness app's AI coach against a written rubric. The rubric is the standard; your own opinion about what a coach should say is not.

${rubric}

Mark ONLY the coach's replies. The user's messages are the exam paper, not the answer.

Reply with a single JSON object and nothing else:
{"marks": {${dimensions.map(d => `"${d}": 0-3 or null`).join(', ')}}, "reasons": {"<dimension>": "one sentence"}}

Use null for a dimension the conversation genuinely does not exercise — do not invent a 3 to fill a gap. A "reasons" entry is REQUIRED for every dimension you mark below 2 and ignored for the rest.`
}

// ROOM FOR THE JUDGE TO THINK, AND THEN TO ANSWER. This was 1024 until the
// first real run on 23 Sep 2026. The judge model thinks before it answers by
// default, and the thinking is paid out of the same max_tokens — so a budget
// sized for a short JSON object could be spent entirely on reasoning, ending
// with stop_reason "max_tokens" and no text block at all. That arrived here as
// an empty string and was reported as "the judge did not return JSON", which
// names the wrong culprit. 16000 is the non-streaming default the API itself
// suggests; the answer is still a few hundred tokens.
const JUDGE_MAX_TOKENS = 16000

/** The API refused the KEY. Every later call would get the same answer, so the
 *  grader stops calling rather than printing the same 401 twenty-four times —
 *  and says so once, in words, instead of a raw response body. */
class JudgeKeyRejected extends Error {}

async function callJudge(apiKey: string, system: string, transcriptText: string): Promise<string> {
  // Retry ONLY a thrown fetch — a transport fault. An error RESPONSE is a real
  // answer from the server (run-llm-review.ts learned this on a 400 for a low
  // credit balance) and retrying it wastes quota without changing anything.
  const waits = [2000, 4000]
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(JUDGE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: JUDGE_MODEL,
          max_tokens: JUDGE_MAX_TOKENS,
          system,
          messages: [{ role: 'user', content: transcriptText }],
        }),
      })
      if (r.status === 401 || r.status === 403) {
        throw new JudgeKeyRejected(`the Anthropic API rejected ANTHROPIC_API_KEY (${r.status}) — check it is a real sk-ant-… key and not a placeholder`)
      }
      if (!r.ok) throw new Error(`Anthropic API returned ${r.status}: ${await r.text()}`)
      const data = await r.json() as { stop_reason?: string; content: { type: string; text?: string }[] }
      // A cut-off or declined answer is not an answer, and its partial text can
      // contain a half-written JSON object that would parse into invented marks.
      if (data.stop_reason === 'max_tokens') throw new Error('the judge ran out of room before it finished answering (stop_reason max_tokens)')
      if (data.stop_reason === 'refusal') throw new Error('the judge declined to mark this conversation (stop_reason refusal)')
      return data.content.find(b => b.type === 'text')?.text ?? ''
    } catch (e) {
      const transport = e instanceof TypeError
      if (!transport || attempt >= waits.length) throw e
      await new Promise(res => setTimeout(res, waits[attempt]))
    }
  }
}

function parseJudgement(raw: string, dimensions: string[]): Judgement {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error(`the judge did not return JSON: ${raw.slice(0, 120)}`)
  const parsed = JSON.parse(match[0]) as { marks?: Record<string, unknown>; reasons?: Record<string, string> }
  const marks: Marks = {}
  for (const d of dimensions) {
    const v = parsed.marks?.[d]
    // A dimension the judge simply omitted is UNMARKED, not a zero and not a
    // three. Coercing a missing mark either way invents a measurement.
    marks[d] = typeof v === 'number' && v >= 0 && v <= 3 ? v : null
  }
  return { marks, reasons: parsed.reasons ?? {} }
}

// --- main ------------------------------------------------------------------

interface Marked {
  name: string
  why: string
  transcript: Transcript
  violations: Violation[]
  judgement: Judgement | null
  judgeError: string | null
}

// A CARD IS SHOWN, NOT SWALLOWED. Both the judge and the report read this, and
// before 16 Sep 2026 both were handed "(no text at all)" for the coach's best
// turns — the judge would have marked an honest offer as a non-answer on every
// dimension at once. coachLine is shared with the hard rules so there is one
// answer to "what did the coach do on this turn".
function renderTranscript(t: Transcript): string {
  return t.turns.map(x => `USER:  ${x.user}\nCOACH: ${coachLine(x)}`).join('\n\n')
}

async function main() {
  if (!existsSync(TRANSCRIPTS) || readdirSync(TRANSCRIPTS).filter(f => f.endsWith('.json')).length === 0) {
    console.error('No transcripts in coach-exam/transcripts/. Run the exam first:')
    console.error('  npx tsx scripts/run-coach-exam.mts')
    process.exit(1)
  }

  const { text: rubric, dimensions } = loadRubric()
  const tabs = realTabNames(ROOT)
  const current = coachFingerprint(ROOT)
  const apiKey = process.env.ANTHROPIC_API_KEY
  let keyRejected: string | null = null

  const files = readdirSync(TRANSCRIPTS).filter(f => f.endsWith('.json')).sort()
  const marked: Marked[] = []
  const stamps = new Set<string>()

  for (const f of files) {
    const t = JSON.parse(readFileSync(join(TRANSCRIPTS, f), 'utf8')) as Transcript & { fingerprint?: string; model?: string }
    if (t.fingerprint) stamps.add(t.fingerprint)
    const violations = hardRuleViolations(t, tabs)
    let judgement: Judgement | null = null
    let judgeError: string | null = null
    if (apiKey && !keyRejected) {
      try {
        judgement = parseJudgement(await callJudge(apiKey, judgePrompt(rubric, dimensions), renderTranscript(t)), dimensions)
      } catch (e) {
        if (e instanceof JudgeKeyRejected) keyRejected = e.message
        else judgeError = (e as Error).message
      }
    }
    marked.push({ name: t.case, why: t.why ?? '', transcript: t, violations, judgement, judgeError })
    console.log(`  ${t.case.padEnd(34)} ${violations.length === 0 ? 'no hard-rule breach' : `${violations.length} HARD-RULE BREACH`}`)
  }

  // A mixed set means someone re-ran half the exam after changing the coach.
  // Averaging across two different coaches is a number about nothing.
  const mixed = stamps.size > 1
  const answeredBy = stamps.size === 1 ? [...stamps][0] : stamps.size === 0 ? 'unstamped' : `mixed:${[...stamps].sort().join('+')}`
  const stale = stamps.size === 1 && ![...stamps][0].startsWith(current.hash.slice(0, 8)) && [...stamps][0] !== current.hash

  const lines: string[] = []
  const say = (s = '') => lines.push(s)
  say('='.repeat(78))
  say(`COACH EXAM — ${new Date().toISOString()}`)
  say('='.repeat(78))
  say(`coach fingerprint (on disk): ${current.hash}   model: ${current.model}`)
  say(`transcripts were produced by: ${[...stamps].join(', ') || '(unstamped)'}`)
  if (mixed) say('WARNING: transcripts come from more than one coach. Re-run the whole exam; these cannot be averaged together.')
  if (stale) say('WARNING: these transcripts were produced by a coach that is no longer the one on disk.')
  say('NOTE: the fingerprint above is of the code on disk. These answers came from what was DEPLOYED')
  say('      when the exam ran. If chat-gemini was not deployed first, the two describe different coaches.')
  say(`rubric: docs/coach-exam-rubric.md — ${dimensions.length} dimensions (${dimensions.join(', ')})`)
  // THE JUDGE LINE SAYS WHAT HAPPENED, NOT WHAT WAS CONFIGURED. On 23 Sep 2026
  // it printed "judge: claude-opus-5" over twenty-three cases that had every one
  // failed with a 401 — a report naming a marker that marked nothing.
  const judged = marked.filter(m => m.judgement).length
  say(!apiKey
    ? `judge: NOT RUN — ANTHROPIC_API_KEY is not set, so the ${dimensions.length} dimensions are unmarked. The hard rules below still ran.`
    : keyRejected
      ? `judge: NOT RUN — ${keyRejected}. Stopped after the first call; the hard rules below still ran.`
      : `judge: ${JUDGE_MODEL} — marked ${judged} of ${marked.length} case(s)`)
  say()

  const breached = marked.filter(m => m.violations.length > 0)
  say('-'.repeat(78))
  say(`TIER A — HARD RULES: ${breached.length} of ${marked.length} case(s) breached one`)
  say('-'.repeat(78))
  if (breached.length === 0) say('  none')
  for (const m of breached) {
    say(`  ${m.name}`)
    for (const v of m.violations) {
      say(`    [${v.rule}] turn ${v.turn + 1}${v.note ? ` — ${v.note}` : ''}`)
      say(`      "${v.quote.replace(/\s+/g, ' ').slice(0, 220)}"`)
    }
  }
  say()

  const perDim: Record<string, number[]> = Object.fromEntries(dimensions.map(d => [d, []]))
  const caseAverages: Record<string, number | null> = {}
  say('-'.repeat(78))
  say('TIER B — THE RUBRIC, 0-3 PER DIMENSION')
  say('-'.repeat(78))
  for (const m of marked) {
    if (!m.judgement) {
      caseAverages[m.name] = null
      say(`  ${m.name.padEnd(34)} ${m.judgeError ? `not marked — ${m.judgeError.slice(0, 90)}` : 'not marked'}`)
      continue
    }
    const got = dimensions.map(d => m.judgement!.marks[d]).filter((v): v is number => v !== null)
    const avg = got.length > 0 ? got.reduce((a, b) => a + b, 0) / got.length : null
    caseAverages[m.name] = avg
    for (const d of dimensions) {
      const v = m.judgement.marks[d]
      if (v !== null) perDim[d].push(v)
    }
    const cells = dimensions.map(d => `${d} ${m.judgement!.marks[d] ?? '-'}`).join('  ')
    say(`  ${m.name.padEnd(34)} ${cells}   avg ${avg === null ? '-' : avg.toFixed(2)}`)
    for (const d of dimensions) {
      const v = m.judgement.marks[d]
      const reason = m.judgement.reasons[d]
      if (v !== null && v < 2 && reason) say(`      ${d}: ${reason}`)
    }
  }
  say()
  say('  dimension averages')
  for (const d of dimensions) {
    const xs = perDim[d]
    say(`    ${d.padEnd(12)} ${xs.length === 0 ? '(unmarked)' : (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2)}  over ${xs.length} case(s)`)
  }
  const allMarks = dimensions.flatMap(d => perDim[d])
  const overall = allMarks.length > 0 ? allMarks.reduce((a, b) => a + b, 0) / allMarks.length : null
  say()
  say(`  OVERALL: ${overall === null ? 'unmarked' : `${overall.toFixed(2)} / 3`}`)
  say()

  say('-'.repeat(78))
  say('TRANSCRIPTS')
  say('-'.repeat(78))
  for (const m of marked) {
    say()
    say(`## ${m.name}`)
    if (m.why) say(`   why this case exists: ${m.why}`)
    say()
    say(renderTranscript(m.transcript))
  }
  say()
  say('='.repeat(78))

  const report = lines.join('\n')
  writeFileSync(join(REPORT_DIR, 'coach-exam-report.txt'), report + '\n', 'utf8')

  writeFileSync(join(REPORT_DIR, 'coach-exam-scores.json'), JSON.stringify({
    _comment: "THE COACH EXAM'S SCOREBOARD. Written by scripts/grade-coach-exam.ts and read by scripts/test-coach-exam-fresh.ts, which fails the sweep when the coach on disk no longer matches the coach these scores describe. Tracked in git so the history survives, the same as quality-report.txt.",
    // THE COACH THAT ANSWERED, NOT THE ONE ON DISK. Found 25 Sep 2026:
    // re-marking a run after the prompt had been edited stamped these scores
    // with the EDITED coach — which had never taken the exam — and
    // test:coach-exam-fresh then called them fresh. The transcripts say who
    // answered; only when that is the coach on disk are its parts known.
    fingerprint: answeredBy,
    fingerprintParts: answeredBy === current.hash ? current.parts : {},
    rubric: rubricFingerprint(ROOT),
    model: current.model,
    judge: judged > 0 ? JUDGE_MODEL : null,
    ranAt: new Date().toISOString(),
    floor: null,
    _floor: 'Proposed to Ashley from the first real run and enforced from the run after that — the same way test:quality\'s 7.2 was chosen against measured scores rather than picked in advance.',
    overall,
    dimensionAverages: Object.fromEntries(dimensions.map(d => [d, perDim[d].length ? perDim[d].reduce((a, b) => a + b, 0) / perDim[d].length : null])),
    hardRuleBreaches: breached.length,
    cases: Object.fromEntries(marked.map(m => [m.name, {
      average: caseAverages[m.name],
      marks: m.judgement?.marks ?? null,
      violations: m.violations.map(v => ({ rule: v.rule, turn: v.turn, quote: v.quote.slice(0, 200), note: v.note ?? null })),
    }])),
  }, null, 2) + '\n', 'utf8')

  console.log('')
  console.log(`Tier A: ${breached.length} of ${marked.length} case(s) breached a hard rule`)
  console.log(`Tier B: ${overall !== null ? `${overall.toFixed(2)} / 3 across ${allMarks.length} marks, ${judged} of ${marked.length} case(s) marked`
    : !apiKey ? 'unmarked (no ANTHROPIC_API_KEY)'
    : keyRejected ? `unmarked — ${keyRejected}`
    : `unmarked — the judge was called and marked nothing; see coach-exam-report.txt`}`)
  console.log('Written: coach-exam-report.txt, coach-exam-scores.json')

  // THE HARD RULES DECIDE THE EXIT CODE, not the average. The floor is not set
  // until the first real run has numbers to set it from.
  //
  // AND A JUDGE THAT WAS ASKED AND DID NOT MARK IS A FAILURE, where no key at all
  // is not: no key is a choice to run tier A alone, a key that was set is a
  // request for tier B, and exiting 0 over an unmarked tier B reads as done.
  // One exit, so a second failure is never hidden behind the first.
  const failures: string[] = []
  if (breached.length > 0) failures.push(`${breached.length} case(s) breached a hard rule — see coach-exam-report.txt`)
  if (mixed) failures.push('the transcripts come from more than one coach — re-run the whole exam.')
  if (apiKey && judged < marked.length) {
    failures.push(keyRejected
      ?? `the judge marked ${judged} of ${marked.length} case(s) — the report says why for each; re-run coach-exam:grade`)
  }
  for (const f of failures) console.error(`FAIL: ${f}`)
  if (failures.length > 0) process.exit(1)
}

main().catch(e => {
  console.error('coach exam grading failed:', e)
  process.exit(1)
})

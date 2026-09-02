// ---------------------------------------------------------------------------
// THE COACH ASKS HOW IT WENT — and the four ways that could go wrong.
//
// session-feel.ts captures the one adherence signal the app never had (see
// its header). Ashley's 2 Sep 2026 ruling put the asking in CHAT rather than
// on a button, which means the whole path runs through a model: the coach
// decides when to ask, what to call the answer, and whether to offer anything
// as a result. That is exactly the shape this repo has been burned by before
// ("a rule with no tool behind it is a rule the model routes around"), so the
// checks below are weighted to the ways a conversational capture goes bad:
//
//   §1  the back-off rule fires when it should and STAYS QUIET otherwise —
//       an app that reduces someone's training after one bad day teaches them
//       to stop answering honestly.
//   §2  the brief is silent when there is nothing to ask, which is also the
//       only thing stopping the coach asking twice.
//   §3  the tool exists, is gated on a real quote, and the server writes
//       nothing itself (I1).
//   §4  the prompt actually carries the rules, and the client carries the
//       brief and the write.
//
// Pure functions where possible: loadFeelContext and recordSessionFeel both
// talk to Supabase, which this sandbox cannot reach, so the decision logic is
// exported to be tested without them and §3/§4 read source to prove the
// untestable half is wired to the testable one — same split as
// test-beat-target-offer.ts.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { feelRun, buildFeelBrief, FEEL_RUN_WINDOW, ASK_WITHIN_DAYS, type AnsweredSession } from '../src/lib/session-feel'
import { FEEL_SCALE, type SessionFeel } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}

const answers = (...feels: SessionFeel[]): AnsweredSession[] =>
  feels.map((felt, i) => ({ date: `2026-09-0${i + 1}`, felt }))

console.log('\n1. The back-off rule: fires on a real run, quiet on a bad day')
{
  check('two roughs in the last three offers a back-off', feelRun(answers('rough', 'good', 'rough')).needsBackoff)
  check('three roughs certainly does', feelRun(answers('rough', 'rough', 'rough')).needsBackoff)
  check('all three hard-or-worse does too', feelRun(answers('hard', 'rough', 'hard')).needsBackoff)

  // The quiet cases matter more than the loud ones. Each of these is someone
  // having an ordinary hard week, and reacting to any of them would be the
  // app deciding it knows better than the person answering.
  check('ONE rough is a bad day, not a pattern', !feelRun(answers('rough', 'good', 'good')).needsBackoff)
  check('two hards and a good stays quiet', !feelRun(answers('hard', 'hard', 'good')).needsBackoff)
  check('a run of good stays quiet', !feelRun(answers('good', 'good', 'good')).needsBackoff)
  check('easy sessions never trigger it', !feelRun(answers('easy', 'easy', 'easy')).needsBackoff)

  // Not enough evidence is not the same as evidence of nothing. Two roughs in
  // the only two sessions on record could be someone's first week.
  check('fewer than a full window never fires', !feelRun(answers('rough', 'rough')).needsBackoff)
  check('an empty history never fires', !feelRun([]).needsBackoff)

  // Only the window is considered — an awful month that has since recovered
  // must not keep triggering an offer forever.
  check('only the most recent window counts',
    !feelRun(answers('good', 'good', 'good', 'rough', 'rough', 'rough')).needsBackoff)
  check(`the window is ${FEEL_RUN_WINDOW} answers`, feelRun(answers('good', 'good', 'good', 'rough')).recent.length === FEEL_RUN_WINDOW)
}

console.log('\n2. The brief says something only when there is something to say')
{
  const quiet = buildFeelBrief(null, feelRun([]))
  check('nothing awaiting and nothing answered = empty brief', quiet === '', quiet)

  const asking = buildFeelBrief({ date: '2026-09-02', day: 'Push & Press' }, feelRun([]))
  check('an unreviewed session puts the line in', /UNREVIEWED SESSION/.test(asking))
  check('...naming the date, so the coach cannot ask about the wrong one', /2026-09-02/.test(asking))
  check('...and the day, so the question can be specific', /Push & Press/.test(asking))
  check('...and says to ask once and drop it', /Ask once/i.test(asking) && /do not ask again/i.test(asking))

  // THE DOUBLE-ASK GUARD. Once the answer is written the session stops being
  // "awaiting", so the line vanishing IS the mechanism that stops a second
  // question. If this ever goes green with the line still present, the coach
  // will re-ask a question the user already answered.
  const answered = buildFeelBrief(null, feelRun(answers('good', 'good', 'good')))
  check('an answered session leaves no UNREVIEWED line', !/UNREVIEWED SESSION/.test(answered), answered)

  const backoff = buildFeelBrief(null, feelRun(answers('rough', 'rough', 'hard')))
  check('a bad run tells the coach to OFFER, via the existing tool', /propose_volume_change/.test(backoff))
  check('...and says explicitly that it is an offer, not a change', /does nothing until they confirm/i.test(backoff))
  const calm = buildFeelBrief(null, feelRun(answers('good', 'good', 'good')))
  check('a good run mentions no offer at all', !/propose_volume_change/.test(calm), calm)
}

console.log('\n3. The tool exists, is gated, and the server writes nothing')
{
  const fn = readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf8')
  check('record_session_feel is declared to the model', /name: "record_session_feel"/.test(fn))

  const declStart = fn.indexOf('name: "record_session_feel"')
  const decl = declStart < 0 ? '' : fn.slice(declStart, declStart + 2200)
  check('the declaration exists to be checked (sanity check on this check)', decl.length > 500, decl.length)
  check('...and constrains felt to the four buckets', FEEL_SCALE.every(f => decl.includes(`"${f}"`)))
  check('...and demands a verbatim quote', /origin_verbatim_quote/.test(decl))
  check('...and tells the model not to record silence', /did not answer/i.test(decl))

  const handlerStart = fn.indexOf('if (name === "record_session_feel")')
  const handler = handlerStart < 0 ? '' : fn.slice(handlerStart, handlerStart + 1800)
  check('the handler exists to be checked (sanity check on this check)', handler.length > 400, handler.length)
  check('the quote must really appear in the message', /message\.toLowerCase\(\)\.includes\(quote\.toLowerCase\(\)\)/.test(handler))
  check('an unknown bucket is refused', /\["easy", "good", "hard", "rough"\]\.includes\(felt\)/.test(handler))
  check('a malformed date is refused', /\\d\{4\}-\\d\{2\}-\\d\{2\}/.test(handler))
  // I1, the standing rule: the edge function forwards intent, the client
  // writes. A server-side write here would put a second writer on
  // workout_sessions and bypass recordSessionFeel's refusal to insert.
  check('the server forwards an intent and writes nothing itself',
    /feelIntent: \{ tool: name, rawArgs: args \}/.test(handler) && !/from\("workout_sessions"\)/.test(handler))
}

console.log('\n4. The rules reach the model, and the answer reaches the database')
{
  const fn = readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf8')
  check('the brief is interpolated into the prompt', /\$\{context\.feel_brief\}/.test(fn))
  check('the prompt has its own section for this', /=== 1e\. HOW THE LAST SESSION FELT ===/.test(fn))

  const secStart = fn.indexOf('=== 1e. HOW THE LAST SESSION FELT ===')
  const sec = secStart < 0 ? '' : fn.slice(secStart, fn.indexOf('=== 2. WORKOUT & MEAL LOOKUPS'))
  check('the section exists to be checked (sanity check on this check)', sec.length > 500, sec.length)
  check('...it forbids asking with no unreviewed session', /No line = nothing to ask/i.test(sec))
  check('...it forbids a 1-10 scale, which is not what affect means here', /scale from 1 to 10/i.test(sec))
  check('...it says nothing is recorded without the tool call', /Nothing is recorded until you call/i.test(sec))
  // 'hard' is the TARGET for most training. A coach that treats every hard
  // session as a problem would talk people out of the work that is supposed
  // to feel like that.
  check('...it says a hard session is not a bad session', /hard session is not a bad session/i.test(sec))

  const chat = readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8')
  check('the client sends the brief', /feel_brief:/.test(chat))
  check('the client loads the context for the current day', /loadFeelContext\(profile\.id, activeSession\.date\)/.test(chat))
  check('the client handles the returned intent', /if \(result\.feelIntent\)/.test(chat))

  const resStart = chat.indexOf('const resolveAndSaveFeel')
  const res = resStart < 0 ? '' : chat.slice(resStart, resStart + 1600)
  check('the resolver exists to be checked (sanity check on this check)', res.length > 300, res.length)
  check('...and actually writes', /recordSessionFeel\(profileId, date, felt, note\)/.test(res))
  check('...and re-validates the bucket client-side rather than trusting the wire',
    /FEEL_SCALE\.includes\(felt\)/.test(res))

  const lib = readFileSync(join(ROOT, 'src/lib/session-feel.ts'), 'utf8')
  // The single most important line in the module: a feeling must never be
  // able to create a workout that did not happen.
  check('the writer refuses to insert a session row', /refusing to invent one/.test(lib) && !/\.insert\(/.test(lib))
  check('...and only asks about recent sessions', new RegExp(`ASK_WITHIN_DAYS`).test(lib) && ASK_WITHIN_DAYS <= 7)
  check('...and only about finished ones', /\.eq\('is_completed', true\)/.test(lib))
  check('...and only about ones with no answer yet', /\.is\('felt', null\)/.test(lib))
}

if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log('\nThe coach asks once, records only what was actually said, and can only offer.\n')

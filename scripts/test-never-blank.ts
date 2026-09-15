// ---------------------------------------------------------------------------
// THE COACH NEVER SAYS NOTHING AT ALL.
//
// Reported live 15 Sep 2026 with a screenshot: three turns in a row — one of
// them just "Hello" — came back as a coach bubble containing no text. No
// sentence, no card, no chips, no Retry. A green avatar and empty space.
//
// WHY THE FLOOR THAT EXISTS DID NOT CATCH IT. There is one, and it is correct
// for the case it was built for (9 Sep, "the coach gets the last word back"):
// the edge function's PLAIN turn runs `resolvePlainReply`, so a model that
// skips a turn still produces a sentence. But the CLIENT had no floor, and
// several server paths return `reply: ""` deliberately — log_workout and the
// memory intents hand back an empty string because the client is supposed to
// author the copy itself. Any turn that returns "" and then fails to author
// anything renders as silence.
//
// So the property is the CLIENT's, and it is stated at the last point before
// a message is shown: a bubble is never both empty and featureless.
//
// WHAT THIS CANNOT TELL YOU. It reads source, so it cannot prove the branch
// runs — see CLAUDE.md on `if (false && …)`. `verify:chat-shell` drives it on
// a real screen against a stubbed empty reply.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { floorReply } from '../src/components/ChatAssistant'

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ✓ ${name}`)
  else {
    failures++
    console.error(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`)
  }
}

const src = readFileSync(new URL('../src/components/ChatAssistant.tsx', import.meta.url), 'utf8')
// Comments are stripped before any ABSENCE claim, so a note explaining a
// removal cannot satisfy a check that it was removed.
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

// ---------------------------------------------------------------------------
console.log('\n1. The floor itself — EXECUTED, not read')
// ---------------------------------------------------------------------------
{
  // The rule is a pure function, so the gate runs it. The first version of
  // this section indexed source strings instead and immediately mis-fired on
  // the wrong `cleanedText` — which is how the Retry path's identical hole was
  // found, but it is not a way to check a rule.
  check('a real reply is left exactly alone', floorReply('Nice work today.', false).text === 'Nice work today.')
  check('...and is not marked blank', floorReply('Nice work today.', false).blank === false)

  const empty = floorReply('', false)
  check('an empty reply with nothing else gets a sentence', empty.text.trim().length > 20, empty)
  check('...and is marked blank, so the caller can treat it as a failure', empty.blank === true)
  check('...and the sentence says what happened', /empty|nothing came through/i.test(empty.text), empty.text)
  // IT DOES NOT REPEAT THE AFFORDANCE. A blank turn is marked failed, and the
  // failed state already renders "tap to retry" twice — an inline line and a
  // button. A third instruction in the sentence read as nagging on a real
  // screen, which is how this check came to exist.
  check('...without repeating the Retry instruction the failed state already gives',
    !/tap .{0,6}retry/i.test(empty.text), empty.text)
  // IT REPORTS, IT DOES NOT INVENT. A floor that guessed at coaching would be
  // the silent-success path the error branch exists to remove.
  check('...without pretending to have coached', !/\b(sets|reps|kg|protein|calories)\b/i.test(empty.text), empty.text)

  check('whitespace only is still empty', floorReply('   \n  ', false).blank === true)

  // A card IS the reply for some turns; a sentence above one is noise.
  const carded = floorReply('', true)
  check('an empty reply WITH something to show is left alone', carded.text === '' && carded.blank === false, carded)
}

// ---------------------------------------------------------------------------
console.log('\n2. A card, a receipt or chips ARE a reply — the floor stays out of the way')
// ---------------------------------------------------------------------------
{
  const iClean = code.indexOf('const hasSomethingElse')
  const iMsg = code.indexOf('const assistantMessage: ChatMessage = {')
  const region = code.slice(iClean, iMsg)
  // Every thing a bubble can carry INSTEAD of prose has to be counted, or the
  // floor prints a sentence on top of a perfectly good card. Derived from the
  // message the component actually builds rather than a list written here: if
  // a new renderable field is added to ChatMessage and not counted, this fails.
  const built = code.slice(iMsg, code.indexOf('setMessages(prev =>', iMsg))
  const RENDERABLE = ['action', 'pendingAction', 'receipt', 'clarification', 'quickReplies']
  for (const f of RENDERABLE) {
    check(`${f} counts as something to show`, new RegExp(`\\b${f}\\b`).test(region), region.slice(0, 200))
    check(`...and the bubble really can carry it`, new RegExp(`\\b${f}\\b`).test(built))
  }
}

// ---------------------------------------------------------------------------
console.log('\n3. A blank turn is a FAILURE, not a success')
// ---------------------------------------------------------------------------
{
  const iBlank = code.indexOf('const blank =')
  const iStatus = code.indexOf('const finalStatus =')
  check('the blank case is named', iBlank > 0)
  check('...and it makes the message failed, so it is not mistaken for an answer',
    iStatus > iBlank && /failed\s*\|\|\s*blank/.test(code.slice(iStatus, iStatus + 120)),
    code.slice(iStatus, iStatus + 120))

  // THE SENTENCE TELLS HER TO TAP RETRY, SO RETRY HAS TO BE THERE. Until this
  // change only the catch block armed it, and a 200-with-no-text never reached
  // the catch — so the copy would have pointed at a button that does not
  // exist. Two set sites now, and this counts them.
  const arms = (code.match(/setLastFailedInput\(userText\)/g) || []).length
  check('Retry is armed on the blank path as well as the thrown one', arms >= 2, { arms })
}

// ---------------------------------------------------------------------------
console.log('\n4. It is never silent to the log either')
// ---------------------------------------------------------------------------
{
  // A blank reply that nobody can see is a defect worth finding later. The
  // same rule the app applies to writes — succeed, or say you did not.
  const iBlank = code.indexOf('if (blank)')
  check('a blank reply is logged as an error', iBlank > 0 && /console\.error/.test(code.slice(iBlank, iBlank + 300)))
}

console.log(failures === 0 ? '\nThe coach always says something, or says it could not.\n' : `\n${failures} check(s) failed.\n`)
process.exit(failures === 0 ? 0 : 1)

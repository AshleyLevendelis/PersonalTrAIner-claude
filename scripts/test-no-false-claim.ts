// ---------------------------------------------------------------------------
// Gate: THE COACH MAY NOT SAY IT CHANGED SOMETHING WHEN IT CHANGED NOTHING.
//
// Reported live 15 Sep 2026 with a screenshot. Ashley typed "Im not going to
// hit that session in going to do muay thai instead" and the coach replied
// "I've swapped out today's lifting session for Muay Thai on your schedule" —
// no card, no Confirm, no row. Her verdict: "The chat is still lying to me."
//
// THE THIRD TIME THIS CLASS HAS BEEN PAID FOR, and the first time the answer
// is code rather than prompt text. 31 Aug: "I will mark today as a rest day
// for you" — fixed by adding a tool. 31 Aug, same conversation: "Got tomorrow
// morning locked in" — fixed by banning the phrase family IN THE PROMPT. The
// note that day wrote the lesson: "a rule with no tool behind it is one the
// model routes around." Today the tool existed and was not called, so neither
// previous answer was available.
//
// WHAT THIS CANNOT TELL YOU. It reads and executes the detector, so it proves
// the RULE. It cannot prove the branch is reached — see CLAUDE.md on
// `if (false && …)`. `verify:no-tool-claim` drives a real screen against a
// stubbed no-tool reply; that is the reach proof, and it exists.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs'
import { detectPlanClaim, PLAN_CLAIM_FLOOR, planClaimFloorText } from '../src/lib/plan-claim'
import { classifyImperative } from '../src/lib/imperative-classifier'

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ✓ ${name}`)
  else {
    failures++
    console.error(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`)
  }
}

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

// ---------------------------------------------------------------------------
console.log('\n1. The sentences that are lies — EXECUTED, not grepped')
// ---------------------------------------------------------------------------
{
  // The first entry is the live one, verbatim from her screenshot, warm closer
  // and all. It is first because a corpus that cannot catch the reported case
  // is a corpus that proves nothing.
  const CLAIMS = [
    "I've swapped out today's lifting session for Muay Thai on your schedule. Have a killer class tonight, and let me know how the training goes!",
    "I've marked today as a rest day so it won't count against you.",
    "Done — today's now down as Muay Thai instead of your lift.",
    'Your schedule is updated.',
    "I've logged that session for you.",
    "That's been added to your plan.",
    'Your week has been updated to show Muay Thai on Tuesday.',
    "I've put tomorrow's session down as a rest day.",
    "I've moved Tuesday's session to Thursday for you.",
    "That's all sorted — your plan now shows the lighter week.",
  ]
  for (const c of CLAIMS) {
    check(`caught: "${c.slice(0, 52)}…"`, detectPlanClaim(c) !== null)
  }
  // THE CLOSER MUST NOT LAUNDER THE CLAIM. The live sentence ends with "Have a
  // killer class tonight" — friendly, hedge-free, and in its own sentence. A
  // whole-message hedge veto would have let the real one through.
  check('a warm closer beside a claim does not excuse it',
    detectPlanClaim("I've swapped today's session for Muay Thai. Have a great class!") !== null)
}

// ---------------------------------------------------------------------------
console.log('\n2. The sentences that are NOT lies — the expensive half')
// ---------------------------------------------------------------------------
{
  // A false positive replaces a real answer with a refusal, so this list is
  // longer than the one above on purpose. Each entry is a sentence the coach
  // SHOULD be able to say.
  const INNOCENT = [
    "I've had a look at your week — Thursday's the heaviest day.",
    "Want me to swap today's lifting for the Muay Thai? Say the word and I'll sort it.",
    "I can mark today as a rest day if you'd rather — shall I?",
    'You swapped Tuesday for a run last week and it went well.',
    "I've noticed your squat has moved up 5 kg this block.",
    'Your plan has three lifting days and one conditioning day.',
    "I'll mark today as Muay Thai the moment you tap Confirm.",
    'Have you logged that session yet?',
    "Today's session is Push and Press: bench, overhead press, dips.",
    'Muay Thai is a brilliant swap for a conditioning day — same energy system.',
    "Enjoy the class tonight — tell me how long it went and I'll log it.",
    'Your session on Thursday is the heavy one, so eat properly before it.',
    "If you'd rather train tomorrow, I can move today's session — just say.",
    "I've put together a few cues for the bench press.",
    // THE TWO THAT MAKE THE HEDGE VETO EARN ITS PLACE. Both describe what
    // Confirm WILL do, in the present tense, about a plan object — so every
    // other rule in the detector fires on them and only the hedge saves them.
    // Added 15 Sep 2026 after mutation-testing: removing the veto altogether
    // left this gate completely green, which is a check guarding nothing.
    'If you confirm, your week is updated to show Muay Thai on Tuesday.',
    'Once you tap Confirm, your schedule is updated.',
  ]
  for (const c of INNOCENT) {
    const hit = detectPlanClaim(c)
    check(`clean: "${c.slice(0, 52)}…"`, hit === null, hit)
  }
  // THE THREE PROPERTIES THAT MAKE IT NARROW, each named so a future widening
  // has to argue with one of them rather than drift past all three.
  check('the coach must be the agent — the user\'s own history is not a claim',
    detectPlanClaim('You moved Tuesday to Thursday last week.') === null)
  check('the object must be their plan — general advice is not a claim',
    detectPlanClaim("I've changed my mind about front squats for beginners.") === null)
  check('a hedge in the same sentence is the behaviour we want, not the bug',
    detectPlanClaim("I can swap that over if you like.") === null)
  // The veto has to survive the claim being in the SAME sentence as the
  // condition, which is the only version of it that is hard.
  check('...even when the claim and the condition share a sentence',
    detectPlanClaim('Once you tap Confirm, your schedule is updated.') === null)
}

// ---------------------------------------------------------------------------
console.log('\n3. The floor is an offer, not a dead end')
// ---------------------------------------------------------------------------
{
  // A refusal that leaves her nowhere is the app's SECOND mistake in one turn:
  // she asked for something it can plainly do.
  check('it owns the mistake', /haven't actually changed|got ahead of myself/i.test(PLAN_CLAIM_FLOOR.text))
  check('...and does not blame her for being unclear',
    !/didn't (quite )?(catch|follow)|rephrase|not sure I followed/i.test(PLAN_CLAIM_FLOOR.text), PLAN_CLAIM_FLOOR.text)
  check('...and offers the next step rather than stopping', PLAN_CLAIM_FLOOR.chips.length >= 2)
  // THE FLOOR ITSELF MUST NOT TRIP THE DETECTOR. A floor that reads as a claim
  // would loop: refuse, substitute, refuse the substitute.
  check('the floor is not itself a claim', detectPlanClaim(PLAN_CLAIM_FLOOR.text) === null)

  // THE CHIPS ARE LOAD-BEARING, NOT DECORATION. Each one has to route to a
  // real tool on the next turn, and what decides that is classifyImperative —
  // the same gate the tools themselves are held to. A chip that reads well and
  // fails the classifier sends her round the same loop in nicer words.
  for (const chip of PLAN_CLAIM_FLOOR.chips) {
    const r = classifyImperative(chip, chip)
    check(`chip "${chip}" is an instruction the app will act on`, r.imperative === true, r)
  }
  check('the rendered floor carries the chips as quick replies',
    /\[QUICK_REPLIES:/.test(planClaimFloorText()))
}

// ---------------------------------------------------------------------------
console.log('\n4. The two copies agree — the edge runtime cannot import src/lib')
// ---------------------------------------------------------------------------
{
  const app = strip(readFileSync(new URL('../src/lib/plan-claim.ts', import.meta.url), 'utf8'))
  const deno = strip(readFileSync(new URL('../supabase/functions/_shared/plan-claim.ts', import.meta.url), 'utf8'))
  // Compare the RULES, not the file: the headers differ by design and always
  // will. Every const the detector is built from has to match character for
  // character, which is what "in lockstep" has to mean to be checkable.
  const NAMES = ['AGENT_VERB', 'DET', 'NOUN', 'DAY_WORD', 'I_DID', 'PLAN_OBJECT', 'IT_IS_DONE', 'OBJECT_IS_DONE', 'HEDGE']
  for (const n of NAMES) {
    const grab = (src: string) => {
      const i = src.indexOf(`const ${n} `)
      return i < 0 ? null : src.slice(i, src.indexOf('\n\n', i)).replace(/\s+/g, ' ').trim()
    }
    const a = grab(app)
    const d = grab(deno)
    check(`${n} is present in both and identical`, a !== null && a === d, { app: a?.slice(0, 80), deno: d?.slice(0, 80) })
  }
  check('the floor text matches too', deno.includes(PLAN_CLAIM_FLOOR.text))
}

// ---------------------------------------------------------------------------
console.log('\n5. The wiring — both guards, because they ship separately')
// ---------------------------------------------------------------------------
{
  const ROOT = new URL('../', import.meta.url)
  const toolReply = strip(readFileSync(new URL('supabase/functions/chat-gemini/tool-reply.ts', ROOT), 'utf8'))
  const edge = strip(readFileSync(new URL('supabase/functions/chat-gemini/index.ts', ROOT), 'utf8'))
  const client = strip(readFileSync(new URL('src/components/ChatAssistant.tsx', ROOT), 'utf8'))

  // THE ASYMMETRY THAT WAS THE BUG: the tool path guarded its reply, the plain
  // path did not. Both halves, or the refusal only covers the first leg and a
  // claiming retry ships.
  check('the plain path refuses the first leg', /const why = refuseReason\(own\)/.test(toolReply))
  check('...and the retry as well', /const why = refuseReason\(text\)/.test(toolReply))
  check('a refused turn gets a different nudge from a silent one',
    /refused \? \(opts\.nudge \?\? PLAIN_CLAIM_NUDGE\) : PLAIN_TURN_NUDGE/.test(toolReply))
  check('...and a different floor, so it does not blame her for being unclear',
    /refused && opts\.refusedFloor \? opts\.refusedFloor : opts\.floor/.test(toolReply))

  check('the edge function hands the plain path the detector', /refuse: detectPlanClaim/.test(edge))
  check('...and the offer floor to fall back to', /refusedFloor: claimFloor/.test(edge))

  // THE CLIENT COPY IS NOT BELT-AND-BRACES ALONE — it is the only guard running
  // between the frontend merge and the hand-run function deploy.
  const i = client.indexOf('if (!result.action) {')
  check('the client guards the fall-through branch', i > 0)
  const region = client.slice(i, i + 400)
  check('...on a turn that called no tool', /detectPlanClaim/.test(region), region.slice(0, 120))
  check('...and substitutes the floor rather than the claim', /planClaimFloorText\(\)/.test(region))
  // A WRITE THAT REALLY HAPPENED KEEPS ITS PAST TENSE. log_weight and the two
  // logging actions arrive here with the row already in; guarding those would
  // refuse the truth.
  check('...only when no action came back, so a real write can still say so',
    /!result\.action/.test(region))
  check('a blank reply is still logged as an error', /console\.error/.test(region))
}

console.log(failures === 0 ? '\nThe coach cannot say it changed something it did not.\n' : `\n${failures} check(s) failed.\n`)
process.exit(failures === 0 ? 0 : 1)

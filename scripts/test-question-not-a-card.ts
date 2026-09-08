// ---------------------------------------------------------------------------
// "I DONT WANT YOU RO LOG ANYTHING UM SIMPLY ASKING A QUESTION."
//
// Ashley, 8 Sep 2026, from her phone, three turns before Muay Thai:
//
//   her  "Im going to muay thai tonight. What should I eat before hand to
//         give me energy?"
//   app  "I couldn't quite tell what you ate — could you list it out with
//         quantities (e.g. '160g greek yoghurt, 30g whey protein, 70g
//         raspberries')?"
//   her  "What should I eat?"
//   app  a PROPOSED CHANGE card: Mexican Grilled Chicken and Rice Bowl,
//        "becomes your lunch for 2026-09-08", Apply / Keep
//   her  "I dont want you ro log anything um simply asking a question."
//
// TWO SEPARATE HOLES, both in the repo — neither would have been closed by the
// chat-gemini deploy already outstanding.
//
// 1. log_meal's no-ingredients branch returned BEFORE `intent` was read (line
//    2453 vs 2507), so the question/logging split built on 7 Sep never reached
//    it. She asked what she SHOULD eat and was asked to itemise what she HAD.
//
// 2. propose_meal_addition was the ONE tool of the fifteen propose_* tools
//    with no origin_verbatim_quote — the exact substring of the message that
//    ordered the change, which is what makes "nothing was actually asked for"
//    checkable rather than a matter of the model's judgement. And the prompt
//    named a question as a valid trigger for it, verbatim: "'What should I
//    have for breakfast?' is a question — answer it or use
//    propose_meal_addition".
//
// ASHLEY'S RULING on what happens instead, 8 Sep, chosen over "just answer,
// say nothing" and "answer and still show the card": answer in words, change
// nothing, then ONE line offering to add it.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { classifyImperative } from '../src/lib/imperative-classifier'

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const fn = readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8')
const fnCode = strip(fn)

// ---------------------------------------------------------------------------
console.log('\n[1] Her actual sentences, through the classifier that now guards the tool')
// ---------------------------------------------------------------------------
// Verbatim from the screenshot. A quote the model might have sent alongside
// the call is tested against the whole message, exactly as the server does it.
const msg1 = 'Im going to muay thai tonight. What should I eat before hand to give me energy?'
const msg2 = 'What should I eat?'
const msg3 = 'I dont want you ro log anything um simply asking a question. What would be a good snack before training?'

check('"What should I eat before hand to give me energy?" is not an instruction',
  classifyImperative('What should I eat before hand to give me energy?', msg1).imperative === false,
  classifyImperative('What should I eat before hand to give me energy?', msg1))
check('"What should I eat?" is not an instruction',
  classifyImperative(msg2, msg2).imperative === false, classifyImperative(msg2, msg2))
check('"What would be a good snack before training?" is not an instruction',
  classifyImperative('What would be a good snack before training?', msg3).imperative === false)
// A quote the model invented is refused before anyone judges its wording.
check('a quote that is not really in the message is refused as not verbatim',
  classifyImperative('add the chicken and rice bowl to my lunch', msg2).imperative === false
  && (classifyImperative('add the chicken and rice bowl to my lunch', msg2) as { reason: string }).reason === 'not_verbatim')
// And the tool still works when there IS an instruction — a guard that refuses
// everything would be a different bug.
const cmd = 'add salmon to my dinners please'
check('a real instruction still passes', classifyImperative('add salmon to my dinners', cmd).imperative === true,
  classifyImperative('add salmon to my dinners', cmd))
const cmd2 = 'put overnight oats in for breakfast'
check('...and so does another', classifyImperative(cmd2, cmd2).imperative === true)

// THE TWO COPIES MUST AGREE, or everything above is testing the wrong file.
// The server runs supabase/functions/_shared/imperative-classifier.ts, which a
// node gate cannot import; the checks above run the src/lib twin the header of
// both files says is kept in lockstep. A mutation to the Deno copy alone
// survived this gate until this check existed — measured, 8 Sep 2026.
const verbsOf = (f: string) =>
  (/export const IMPERATIVE_VERBS = \[([\s\S]*?)\]/.exec(readFileSync(f, 'utf8'))?.[1] ?? '')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    .split(',').map(v => v.trim().replace(/'/g, '')).filter(Boolean).sort()
const srcVerbs = verbsOf('src/lib/imperative-classifier.ts')
const denoVerbs = verbsOf('supabase/functions/_shared/imperative-classifier.ts')
check('both copies of the verb list were found', srcVerbs.length > 10 && denoVerbs.length > 10, { src: srcVerbs.length, deno: denoVerbs.length })
check('the client and server verb lists are identical',
  srcVerbs.join('|') === denoVerbs.join('|'),
  { onlyInSrc: srcVerbs.filter(v => !denoVerbs.includes(v)), onlyInDeno: denoVerbs.filter(v => !srcVerbs.includes(v)) })
check('...and "put" is in them, so the tool\'s own examples still work',
  srcVerbs.includes('put') && denoVerbs.includes('put'))

// ---------------------------------------------------------------------------
console.log('\n[2] Every plan-changing tool must quote the instruction — no exceptions')
// ---------------------------------------------------------------------------
// THE CHECK THAT WOULD HAVE CAUGHT THIS. Fourteen of fifteen carried the
// requirement; the fifteenth was the one she fell through. Counted rather than
// listed, so a tool added later without it fails here rather than in her chat.
const proposeTools: { name: string; required: string[] }[] = []
for (const m of fn.matchAll(/name: "(propose_[a-z_]+)",\s*\n\s*description:/g)) {
  const tail = fn.slice(m.index! + m[0].length, m.index! + m[0].length + 9000)
  const req = /\n      required: \[([^\]]*)\]/.exec(tail)
  proposeTools.push({ name: m[1], required: req ? req[1].split(',').map(x => x.trim().replace(/"/g, '')) : [] })
}
check('the propose_* family was found (sanity check on this check)', proposeTools.length >= 15, proposeTools.length)
const withoutQuote = proposeTools.filter(t => !t.required.includes('origin_verbatim_quote')).map(t => t.name)
check('EVERY propose_* tool requires origin_verbatim_quote', withoutQuote.length === 0, withoutQuote)
const addition = proposeTools.find(t => t.name === 'propose_meal_addition')
check('propose_meal_addition specifically — the one that did not', !!addition && addition.required.includes('origin_verbatim_quote'), addition)

// ---------------------------------------------------------------------------
console.log('\n[3] And the meal-addition handler actually consults it')
// ---------------------------------------------------------------------------
const additionHandler = fnCode.slice(
  fnCode.indexOf('if (name === "propose_meal_addition")'),
  fnCode.indexOf('if (name === "propose_schedule_change")'),
)
check('the handler was located (sanity check on this check)', additionHandler.length > 200, additionHandler.length)
check('it classifies the quote against the real message',
  /classifyImperative\(args\.origin_verbatim_quote \|\| "", message\)/.test(additionHandler))
// The if-block only, ending at its own closing brace — a slice that ran on
// past it would swallow the proposal return below and this check would pass on
// code that still emitted a card.
const refusalStart = additionHandler.indexOf('if (!additionClassification.imperative)')
const refusalArm = additionHandler.slice(refusalStart, additionHandler.indexOf('\n        }\n', refusalStart))
check('...and on a question emits NO proposal at all',
  refusalArm.length > 100 && !/proposal:/.test(refusalArm), refusalArm.slice(0, 200))
check('...answering in the model\'s own words when it wrote any',
  /const ownWords = \(textPart\?\.text \|\| ""\)\.trim\(\)/.test(additionHandler))
check('...and offering it in ONE line, per Ashley\'s ruling',
  /Want \$\{dish\} in your plan\? Say "add it" and I'll put it in\./.test(additionHandler))
// THE LOOP THIS WOULD OTHERWISE REBUILD. The guard refuses a quote with no
// imperative verb, so a bare "yes please" is refused too and she gets the same
// offer forever — the shape roadmap item 5 was spent removing. The offer has
// to hand her a verb.
check('...and the offer names a word that gets past the guard next turn',
  classifyImperative('add it', 'add it').imperative === true)
check('the proposal branch still exists for a genuine instruction',
  /proposal: \{ kind: "propose_meal_addition", rawArgs: args \}/.test(additionHandler))

// ---------------------------------------------------------------------------
console.log('\n[4] log_meal reads intent BEFORE it decides what to say')
// ---------------------------------------------------------------------------
// An ORDERING check, like the one the plan-unknown gate makes: the branch was
// correct in isolation and unreachable by the fix, because it returned first.
const mealHandler = fnCode.slice(fnCode.indexOf('if (name === "log_meal")'), fnCode.indexOf('if (name === "log_workout")'))
check('the log_meal handler was located (sanity check on this check)', mealHandler.length > 500, mealHandler.length)
const emptyBranchAt = mealHandler.indexOf('if (ingredients.length === 0)')
const intentInBranch = mealHandler.indexOf('args.intent === "question"')
check('the no-ingredients branch is still there', emptyBranchAt >= 0)
check('intent is read INSIDE it, not fifty lines later',
  intentInBranch > emptyBranchAt && intentInBranch - emptyBranchAt < 900, { emptyBranchAt, intentInBranch })
check('a question with nothing named is NOT asked to list what she ate',
  /askedWithNothingNamed\s*\?\s*\(ownWords \|\|/.test(mealHandler), mealHandler.slice(emptyBranchAt, emptyBranchAt + 400))
check('...while a genuine unparseable log still is',
  /I couldn't quite tell what you ate/.test(mealHandler))
// The old sentence must survive ONLY on the logging side. If it is what a
// question gets, this whole gate is decoration.
const questionArm = /askedWithNothingNamed\s*\?\s*\(([^)]*)\)/.exec(mealHandler)?.[1] ?? ''
check('...and that sentence is not what a question gets',
  questionArm.length > 0 && !/couldn't quite tell what you ate/.test(questionArm), questionArm.slice(0, 200))

// ---------------------------------------------------------------------------
console.log('\n[5] The prompt no longer names a question as a trigger')
// ---------------------------------------------------------------------------
check('the clause that invited it is gone',
  !/is a question — answer it or use propose_meal_addition/.test(fn))
check('...replaced by the rule every other plan tool already carries',
  /A QUESTION ABOUT WHAT TO EAT IS ANSWERED, NEVER PROPOSED/.test(fn))
check('...with the answer-then-offer shape Ashley chose',
  /want it in your plan\? say the word and I'll add it/i.test(fn))
check('...and log_meal is named as a wrong route for it too',
  /Nor does a question about food route to log_meal/.test(fn))
check('the tool description itself refuses a question',
  /ONLY FOR AN INSTRUCTION TO ADD ONE\. A question about what to eat/.test(fn))
check('...and the quote field says what must be quotable',
  /There must be a real instruction to quote/.test(fn))

console.log(failures === 0 ? `\nAll question-not-a-card checks passed.\n` : `\n${failures} check(s) FAILED.\n`)
process.exit(failures === 0 ? 0 : 1)

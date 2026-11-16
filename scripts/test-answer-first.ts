// A question gets its answer above the offer (his ruling 16 Nov 2026, "Answer, then offer"). His report: "it doesn't
// seem to understand the difference between me asking a question and a request." A turn carrying an offer dropped the
// coach's words, so "should I swap squats for leg press?" got "I can swap ..." and no answer.
// Holds: which messages are questions; which answers may be used; the whole step against a fake coach; the wiring.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { answerFirst, answerProblem, askedAQuestion, ANSWER_FIRST_NUDGE } from '../supabase/functions/chat-gemini/answer-first'

const ROOT = process.cwd()
let ran = 0
let failures = 0
function check(name: string, ok: boolean, detail: unknown = '') {
  ran++
  if (ok) console.log(`ok: ${name}`)
  else { failures++; console.log(`FAIL: ${name}${detail !== '' ? ` (${JSON.stringify(detail)})` : ''}`) }
}

async function main() {
  console.log('1. A question is told from a request')
  const questions = [
    'Should I swap squats for leg press?',
    'is it ok to skip legs today',
    'What should I have for lunch, the pasta or the chicken?',
    "My knee's sore. Should I do lunges today?",
    'Can I have pizza tonight?',
    'Would leg press be better than squats for me?',
  ]
  for (const q of questions) check(`a question: "${q}"`, askedAQuestion(q))
  const requests = [
    'Swap squats for leg press',
    'Can you swap squats for leg press?',
    'Could you move today to Thursday?',
    'Please add a snack',
    'Add pizza to my dinner please?',
    'Move my session to tomorrow.',
    '',
  ]
  for (const r of requests) check(`a request: "${r}"`, !askedAQuestion(r))

  console.log('\n2. An answer is used only when it answers and claims nothing')
  check('a short yes-and-why is used', answerProblem('Yes, leg press is a good call while your knee settles: it loads the quads without the balance demand.') === null)
  const bad: [string, string][] = [
    ['', 'empty'],
    ['I\'ve swapped squats for leg press for you.', 'says something was done'],
    ['Done, leg press is in.', 'says something was done'],
    ['Yes: 3 sets of 10 on the leg press.', 'carries a number'],
    ['Swap it, that keeps you at about 650 kcal.', 'carries a number'],
    ['Yes, it suits you. Want me to swap it?', 'asks a question'],
    ['Yes. ' + 'It is a very reasonable choice for you right now. '.repeat(8), 'too long'],
  ]
  for (const [text, why] of bad) check(`refused (${why}): "${text.slice(0, 40)}"`, answerProblem(text) === why, answerProblem(text))
  check('advice may name a duration or a distance: "Not tonight: keep it to an easy 30 minutes, 15k can wait"',
    answerProblem('Not tonight: you have heavy legs tomorrow. Keep it to an easy 30 minutes and save the 15k for Saturday.') === null)
  check('the coach is told to answer, claim nothing, keep the offer\'s figures out and ask nothing',
    /Answer his question/.test(ANSWER_FIRST_NUDGE) && /Do not say you have done/.test(ANSWER_FIRST_NUDGE) && /Do not write calories, grams/.test(ANSWER_FIRST_NUDGE) && /Do not ask a question/.test(ANSWER_FIRST_NUDGE))
  check('...and to read today and the next two days of his plan first, and name what a change would cost',
    /read his plan for today and the next two days/.test(ANSWER_FIRST_NUDGE) && /say so by name/.test(ANSWER_FIRST_NUDGE))
  const prompt = readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf8')
  check('the coach\'s instructions say what is coming up decides the answer, his 15k example included',
    /WHAT IS COMING UP DECIDES THE ANSWER/.test(prompt) && /run 15k tonight/.test(prompt) && /never just say yes/.test(prompt) && /His goal decides which one gives way/.test(prompt))

  console.log('\n3. The step, end to end, against a fake coach')
  const offer = (extra: Record<string, unknown> = {}) => new Response(JSON.stringify({ reply: '', proposal: { kind: 'propose_exercise_swap', rawArgs: {} }, ...extra }), { headers: { 'Content-Type': 'application/json' } })
  let calls = 0
  let lastTurns: unknown[] = []
  const coach = (text: string) => async (turns: unknown[], withTools: boolean) => { calls++; lastTurns = turns; return { ok: !withTools, parts: [{ text }] } }
  const deps = (message: string, text: string) => ({ message, contents: [{ role: 'user', parts: [{ text: message }] }], firstParts: [{ functionCall: { name: 'propose_exercise_swap', args: {} } }], name: 'propose_exercise_swap', args: {}, callLeg: coach(text) })
  const ANSWER = 'Yes, leg press is a good call while your knee settles: it loads the quads without the balance demand.'
  const asked = await (await answerFirst(offer(), deps('Should I swap squats for leg press?', ANSWER))).json()
  check('a question gets the answer, marked, with the offer kept', asked.reply === ANSWER && asked.answer_first === true && asked.proposal?.kind === 'propose_exercise_swap', asked)
  check('...asked with tools off, after the tool call and a result saying nothing changed',
    calls === 1 && JSON.stringify(lastTurns).includes('Nothing has been changed') && JSON.stringify(lastTurns).includes(ANSWER_FIRST_NUDGE.slice(0, 30)), lastTurns.length)
  calls = 0
  const told = await (await answerFirst(offer(), deps('Swap squats for leg press', ANSWER))).json()
  check('a request goes straight to the offer: no answer, no extra call', told.reply === '' && !told.answer_first && calls === 0, told)
  const claimed = await (await answerFirst(offer(), deps('Should I swap squats for leg press?', "I've swapped it for you."))).json()
  check('an answer claiming the change is dropped, the offer kept', claimed.reply === '' && !claimed.answer_first && claimed.proposal?.kind === 'propose_exercise_swap', claimed)
  calls = 0
  const sized = await (await answerFirst(new Response(JSON.stringify({ reply: '', proposal: { kind: 'propose_meal_addition', rawArgs: { as_suggestion: true } } })), deps('How much of each should I have?', ANSWER))).json()
  check('"how much should I have" keeps the app\'s own answer (no second answer)', sized.reply === '' && calls === 0, sized)
  calls = 0
  const plain = await (await answerFirst(new Response(JSON.stringify({ reply: 'Leg press is fine.' })), deps('Should I swap squats for leg press?', ANSWER))).json()
  check('a turn with no offer is left alone', plain.reply === 'Leg press is fine.' && calls === 0, plain)

  console.log('\n4. Wired on both sides')
  const server = readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf8')
  const open = server.indexOf('if (functionCallPart) {')
  const iife = server.indexOf('const toolResponse = await (async (): Promise<Response> => {', open)
  const firstHandler = server.indexOf('if (name === "propose_meal_swap")', open)
  const wrapped = server.indexOf('return await answerFirst(toolResponse, {', firstHandler)
  const undeclared = server.indexOf('functionCall for an undeclared tool')
  check('every tool\'s response passes through the answer step (it wraps the whole tool block)',
    open > 0 && iife > open && iife < firstHandler && undeclared > firstHandler && wrapped > undeclared, { open, iife, firstHandler, wrapped, undeclared })
  const client = readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8')
  check('the screen puts the answer above the offer\'s own words, and refuses one that claims a change',
    /result\.answer_first && typeof result\.reply === 'string'/.test(client) && /answer && !detectPlanClaim\(answer\) \? `\$\{answer\}\\n\\n\$\{offerWords\}` : offerWords/.test(client))

  check('the screen keeps the server\'s marker when it reads the reply (it copies only the fields it knows)', /answer_first: data\.answer_first === true/.test(client))
  console.log(`\n${ran} checks ran.`)
  if (failures > 0) { console.log(`${failures} FAILED.`); process.exit(1) }
  console.log('All answer-first checks passed.')
}
main().catch(e => { console.error(e); process.exit(1) })

// ---------------------------------------------------------------------------
// Gate: a coaching question asked mid-setup is parked with a reason, at most
// twice, and actually comes back — plus two things the setup coach must not
// say about a plan it cannot see.
//
// OWNER RULING, Ashley, August 2026 (her notes; in the repo since 9 Oct 2026):
//   "Off-topic mid-onboarding (e.g. 'what does creatine do'): prefer deferring
//   with a reason — get to know you first, then come back to it — over
//   answering in full", and, accepted with it, "cap the deferrals so it
//   doesn't feel like being handled".
//
// Test log M1 (9 Oct 2026): the creatine question was answered in full. The
// prompt's deferral rule covered only trivia ("FACTUAL questions": the capital
// of France), while the scope rules beside it said to answer training and
// nutrition questions "substantively". The model did what it was told.
//
// WHAT THIS CAN AND CANNOT HOLD. Whether the model OBEYS is not checkable
// here — the sandbox cannot reach it, and the coach exam runs against the
// main chat, not onboarding. So this holds the three parts that are code:
//   1. the prompt SAYS the ruling, with a worked example, and no neighbouring
//      rule contradicts it (source; comments are not prompt text, so the
//      prompt is cut out of the file first);
//   2. the cap is counted by the APP and told to the model each turn;
//   3. a parked question is kept in the person's own words and handed to the
//      first chat after setup (functions called directly; the screens are
//      verify:onboarding-turns §16 and verify:parked-question).
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { addParkedQuestion } from '../src/lib/parked-questions'
import { buildFirstRunIntro, FIRST_RUN_QUICK_REPLIES } from '../src/lib/first-run-intro'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

const file = readFileSync(join(ROOT, 'supabase/functions/onboarding-chat/index.ts'), 'utf8')
// The prompt is the one big template literal. Everything outside it — code
// and the comments explaining it — is NOT something the model reads.
const promptStart = file.indexOf('const systemPrompt = `')
const prompt = file.slice(promptStart, file.indexOf('`;', promptStart))
const section = (from: string, to: string) => prompt.slice(prompt.indexOf(from), prompt.indexOf(to, prompt.indexOf(from) + from.length))
const code = file.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

console.log('\n1. The prompt says what was ruled')
{
  check('the prompt was found (sanity check on this check)', promptStart > 0 && prompt.length > 5000, prompt.length)
  const detours = section('=== DETOURS DURING ONBOARDING ===', '=== APP REALITY')
  check('there is a section for it, and it is not headed "off-topic" any more', detours.length > 500 && !/=== OFF-TOPIC DURING ONBOARDING ===/.test(prompt))
  check('it covers a real training, nutrition or supplement question — not only trivia',
    /training, nutrition or supplement question/.test(detours) && /creatine/i.test(detours), detours.slice(0, 200))
  check('...and no longer limits itself to "FACTUAL questions only"', !/FACTUAL questions only/.test(prompt))
  check('the deferral carries its REASON', /WHY: the answer depends on what you're about to learn about them/.test(detours))
  check('it goes straight back to the question, with its chips', /go straight back to the question you were on/.test(detours) && /present_slot for it again/.test(detours))
  check('answering a "quick version" as well is ruled out', /Do not answer-and-park/.test(detours))
  // A bare prohibition does not hold in this codebase: the positive example
  // is what the model copies.
  const example = detours.slice(detours.indexOf('WORKED EXAMPLE'))
  check('there is a worked example of the right reply',
    /Reply: "Good question/.test(example) && /as soon as you're set up/.test(example) && /how long have you realistically got/.test(example), example.slice(0, 300))
  check('...showing both calls that go with it', /park_question\(question:/.test(example) && /present_slot\(slot_key: "sessionDuration"\)/.test(example))
  check('...and the wrong one named beside it', /NOT this:/.test(example))
}

console.log('\n2. What is never parked is named, so the new rule cannot swallow it')
{
  const never = section('WHAT IS NEVER PARKED', '=== APP REALITY')
  for (const [label, re] of [
    ['pain', /pain that isn't ordinary soreness/],
    ['medication', /medication/],
    ['an extreme target', /extreme target or timeline/],
    ['disordered eating', /disordered-eating/],
    ['an allergy or food-safety question', /an allergy, or any question about whether a food is safe/],
    ['a question about the question just asked', /why do you need my weight\?/],
  ] as const) check(`${label} is on the list`, re.test(never), never.slice(0, 120))
  check('"answer substantively" in the shared scope rules is scoped to after setup',
    /"answer substantively and practically" in the first line above describes the coach once setup is finished/.test(prompt))
  check('...and that sentence keeps the rest of the scope block immediate', /is acted on at once, mid-setup or not, and is never parked/.test(prompt))
  check('the shared rules themselves are untouched (test:coach-rules-sync holds them verbatim)',
    /\$\{OFF_TOPIC_RULES\}/.test(prompt) && /\$\{SCOPE_SAFETY_RULES\}/.test(prompt) && /\$\{ALLERGEN_HONESTY_BLOCK\}/.test(prompt))
}

console.log('\n3. The cap is counted by the app, not by the model')
{
  check('the limit is two', /const PARK_LIMIT = 2;/.test(code))
  check('the count comes from what the app sends', /Array\.isArray\(state\?\.parkedQuestions\)/.test(code))
  check('under the limit the model is told how many it has used', /`PARKED SO FAR: \$\{parked\.length\} of \$\{PARK_LIMIT\} allowed\.`/.test(code))
  check('at the limit it is told to stop parking and answer briefly',
    /parked\.length >= PARK_LIMIT\s*\?\s*`PARKED SO FAR: \$\{parked\.length\} — THE LIMIT IS REACHED\. Do not park anything else/.test(code))
  check('...and that line is in the prompt, inside the detours section', /\$\{parkedLine\}/.test(section('=== DETOURS DURING ONBOARDING ===', '=== APP REALITY')))
  check('there is a tool for it', /name: "park_question"/.test(code) && /required: \["question"\]/.test(code.slice(code.indexOf('name: "park_question"'))))
  const client = readFileSync(join(ROOT, 'src/components/onboarding/ConversationalOnboarding.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  check('the app sends its own count back every turn', /parkedQuestions: ws\.parkedQuestions,/.test(client))
}

console.log('\n4. A parked question is kept in the person\'s own words')
{
  const typed = '40 mins probably. also what does creatine actually do, should I take it?'
  check('the coach\'s wording is used when it is a piece of what they typed',
    addParkedQuestion([], 'what does creatine actually do, should I take it?', typed).join() === 'what does creatine actually do, should I take it?')
  check('...and their whole message when it is not (a paraphrase is not their words)',
    addParkedQuestion([], 'Should the user supplement with creatine monohydrate?', 'what does creatine do?').join() === 'what does creatine do?')
  check('the same question is not kept twice', addParkedQuestion(['what does creatine do?'], 'What does creatine do?', 'What does creatine do?').length === 1)
  check('a second, different one is added after the first',
    addParkedQuestion(['what does creatine do?'], 'is fasted cardio better?', 'is fasted cardio better?').join('|') === 'what does creatine do?|is fasted cardio better?')
  check('an empty one is ignored', addParkedQuestion([], '', '   ').length === 0)
  check('a very long message is cut to something that can be a button', addParkedQuestion([], '', 'x'.repeat(400))[0].length <= 120)
  const before = ['a?']
  addParkedQuestion(before, 'b?', 'b?')
  check('the list it is given is not changed in place', before.length === 1)
}

console.log('\n5. ...and it comes back in the first thing the coach says after setup')
{
  const session = { focus: 'Full Body', movements: 'Goblet Squat, Push-Up', when: 'today' }
  const plain = buildFirstRunIntro('Hey Sam', session, null, [])
  const one = buildFirstRunIntro('Hey Sam', session, null, ['what does creatine actually do, should I take it?'])
  const two = buildFirstRunIntro('Hey Sam', session, null, ['what does creatine do?', 'is fasted cardio better?'])
  const lastOf = (m: typeof plain) => m[m.length - 1]
  check('with nothing parked the opener is exactly as it was',
    lastOf(plain).quickReplies?.join('|') === FIRST_RUN_QUICK_REPLIES.join('|') && !/setting up/.test(plain.map(m => m.content).join(' ')))
  check('a parked question is the first thing to tap, word for word',
    lastOf(one).quickReplies?.[0] === 'what does creatine actually do, should I take it?', lastOf(one).quickReplies)
  check('...on the LAST message, which is the only one whose chips are shown', one.slice(0, -1).every(m => !m.quickReplies))
  check('...and the coach says why it is there', /You asked me something while we were setting up/.test(lastOf(one).content) && /answer it properly/.test(lastOf(one).content), lastOf(one).content)
  check('the row stays three long', lastOf(one).quickReplies?.length === 3 && lastOf(two).quickReplies?.length === 3, [lastOf(one).quickReplies, lastOf(two).quickReplies])
  check('two parked questions both come back, in the order they were asked',
    lastOf(two).quickReplies?.slice(0, 2).join('|') === 'what does creatine do?|is fasted cardio better?' && /a couple of things/.test(lastOf(two).content))
  check('a third is not shown — the cap was two', buildFirstRunIntro('Hey Sam', session, null, ['a?', 'b?', 'c?']).at(-1)!.quickReplies!.includes('c?') === false)
  check('the rest of the opener is untouched by it', one.slice(0, -1).map(m => m.content).join() === plain.slice(0, -1).map(m => m.content).join())
  const chat = readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8')
  check('the chat builds its first message from that function', /setMessages\(buildFirstRunIntro\(/.test(chat))
  const client = readFileSync(join(ROOT, 'src/components/onboarding/ConversationalOnboarding.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  check('finishing setup hands the parked questions over', /saveParkedQuestions\(parkedQuestions\)\s*\n\s*onComplete\(/.test(client))
}

console.log('\n6. L4 — the setup coach does not describe a plan it cannot see')
{
  const unseen = section('=== NEVER DESCRIBE A PLAN YOU HAVE NOT SEEN ===', '=== FINISHING ===')
  check('there is a rule for it', unseen.length > 400)
  for (const word of ['circuit', 'HIIT', 'supersets', 'Tabata', 'AMRAP', 'high-intensity'])
    check(`"${word}" is named as a format never to promise`, new RegExp(`"${word}"`).test(unseen))
  check('naming an exercise is ruled out too', /NEVER NAME AN EXERCISE/.test(unseen))
  check('"gym" is tied to where they actually train', /Do not say "gym" to someone whose equipment is Home gym, Minimalist or Bodyweight only/.test(unseen))
  check('there is a good recap to copy, made only of what they said',
    /THIS IS WHAT A GOOD RECAP SOUNDS LIKE: "Three days a week, about 40 minutes a time, built around your dumbbells and aimed at fat loss/.test(unseen))
  check('the finishing rule points at it', /give a one-line warm recap made ONLY of what they told you/.test(prompt))
  check('...and no longer asks for "the shape of what you\'ll build"', !/recap of the shape of what you'll build/.test(prompt))
  // The one engine fact the rule states, held to the engine's own words.
  const goals = readFileSync(join(ROOT, 'src/lib/goal-policies.ts'), 'utf8')
  check('what it says the app does for fat loss is what the engine\'s own note says',
    /conditioning is appended on top, never substituted for lifting/.test(goals) && /keeps proper weight training and adds conditioning on top/.test(unseen))
}

console.log('\n7. M5 — an exact session length is spoken of as the band it is stored as')
{
  const mechanics = section('=== SLOT MECHANICS ===', '=== THE RICHER QUESTIONS')
  check('the coach is told a length is stored as a band', /A SESSION LENGTH IS STORED AS A BAND, NEVER AS AN EXACT NUMBER/.test(mechanics))
  check('...with the tester\'s case', /"40 minutes tops, hard stop" is recorded as 30-45/.test(mechanics) && /allowed to run to 45/.test(mechanics))
  check('...told not to promise the exact figure', /do NOT say "forty minutes it is" or "I'll keep you to 40"/.test(mechanics))
  check('...and given the true sentence to say', /that puts you on the 30–45 setting, so I'll plan to that band/.test(mechanics))
}

console.log(`\n${ran} checks ran.`)
if (failures > 0) {
  console.error(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('A parked question is parked with a reason, counted, and comes back.')

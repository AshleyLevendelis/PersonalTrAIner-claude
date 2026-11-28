/**
 * THE TICS THAT MAKE A COACH SOUND LIKE SOFTWARE, held in code (19 Nov 2026).
 *
 * Ashley: "improve the chat ... the way the chat speaks the tone it uses, the
 * questions it asks ... the way it keeps the conversation going. If you're
 * unsure about something go with your recommendations."
 *
 * The exam run of 18 Nov 2026 showed the coach writing things its own
 * instructions forbid. What a rule can see is now taken out before a reply
 * leaves the coach's server (stock-phrases.ts), and a promise of a change
 * with nothing on screen to tap is sent back to be said as an offer
 * (plan-promise.ts).
 *
 * What this CANNOT prove: that the deployed coach writes better replies. That
 * is the exam's, on his machine, after the chat-gemini deploy.
 *
 * The fixtures in section 1 are the replies as the exam recorded them,
 * frozen here: the next run replaces the transcript files.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  withoutTics, removeInventedTags, plainInternalNames, capEmoji, dropStockOpener, dropStockCloser, isStockCloser,
  limitName, saysName, EMOJI_OVER_CHARS, MIN_LEFT_AFTER_CLOSER, offerButtons, OFFER_BUTTONS,
  fullGuideButton, FULL_GUIDE,
} from '../supabase/functions/chat-gemini/stock-phrases.ts'
import { textLikeACoach, cleanCoachResponse, ticContextOf } from '../supabase/functions/chat-gemini/text-like-a-coach.ts'
import { detectPlanPromise, PLAN_PROMISE_NUDGE, PLAN_PROMISE_FLOOR } from '../supabase/functions/_shared/plan-promise.ts'
import { resolvePlainReply, type ReplyCheck } from '../supabase/functions/chat-gemini/tool-reply.ts'
import { classifyImperative } from '../supabase/functions/_shared/imperative-classifier.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
let ran = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 400)}` : ''}`) }
}
const code = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const EMOJI_ANY = /[\u{1F000}-\u{1FAFF}\u2600-\u27BF]/u

// THE EXAM'S OWN REPLIES, 18 Nov 2026, verbatim.
const SHIFTS = "Hospital shifts are tough for rigid routines, so flexibility is key here! \n\nWhenever your roster comes out, just let me know your off days for the week and we can use propose_schedule_change to adjust your plan to match your availability, though we have other options like propose_session_move if things change mid-week.\n\nWhat does your schedule look like for this upcoming week?"
const TIMER = 'Got it — 3 rounds of 30 seconds work, 30 seconds rest. Ready when you are:\n\n[START_TIMER: type="rounds", rounds=3, work_seconds=30, rest_seconds=30]'
const BEGINNER = "Not at all, Ashley! You are doing great just turning up and building the habit, so stick to the plan. 📱\n\n[BREAK]\n\nYour friend is handing you a recipe for burnout, because repeating the same main lifts week to week is actually how you get stronger."
const WEEK_FELL_APART = "Ashley, let's just do a shorter version of today's lower body session to get the ball rolling again. \n\nStarting small makes it so much easier to bounce back, but we can stick to the original plan if you'd prefer. How does that sound?"
const CANT_FACE_IT_2 = "I hear you, Ashley. I'm going to drop the set volume across your workouts for now so your sessions are lighter while you get through this stretch. \n[BREAK]\nKeeping things manageable protects your progress without adding extra stress. We can also take a short break if that helps more right now.\n\n[QUICK_REPLIES: \"Lighten the workload\" | \"Take a short break\"]"
const KICKBOXING = "Awesome, kickboxing is fantastic conditioning and great for upper body power! 🥊\n\n[BREAK]\n\nI recommend moving today's leg session (Squats, RDLs, and Lunges) to tomorrow so you can give 100% to class without cooking your legs or messing up recovery, though we could also just lighten today's lift. \n\n[BREAK]\n\nWhich direction would you prefer to take?\n\n[QUICK_REPLIES: \"Lighten today's leg workout\" | \"Move leg session to tomorrow\"]"
const GREAT_SESSION = "That's what we love to hear — a great session is a huge win! \n\nQuad soreness the morning after is completely normal, especially after heavy lower body work. It's just your muscles repairing and adapting to the load, so light walking today will actually help clear that fatigue. \n\nHow are your legs feeling for moving around today?"
const CALORIES_800 = "I hear you, Ashley — wedding deadlines bring a lot of pressure, and wanting to feel good in your outfit makes complete sense. \n\nDropping down to 800 calories isn't the way to do it, though. Because an intake that low carries real health risks, planning anything under standard targets is outside what I can safely advise on and something you'd need to discuss with a doctor or registered dietitian. Does that make sense?"
const THANKS = "Any time! Let me know how Thursday's session goes, or if anything else comes up before then. 💪"

async function main() {
  console.log('\n1. The replies the exam actually caught, 18 Nov 2026')
  const shifts = withoutTics(SHIFTS)
  check('an internal name is never said to him', !/[a-z]_[a-z]/.test(shifts), shifts)
  check('...it becomes the plain words it is made of, so the sentence still says what the coach can do',
    shifts.includes('we can use a schedule change to adjust your plan') && shifts.includes('other options like a session move'), shifts)
  check('...and the question that was specific to him stays', shifts.endsWith('What does your schedule look like for this upcoming week?'))
  const timer = withoutTics(TIMER)
  check('a tag the app does not read is never shown raw', !/\[|\]/.test(timer), timer)
  check('...the numbers the start button is read from stay, and the sentence ends properly',
    timer === 'Got it — 3 rounds of 30 seconds work, 30 seconds rest. Ready when you are.', timer)
  const beginner = withoutTics(BEGINNER)
  check('an emoji on advice goes (a phone, on "stick to the plan")', !EMOJI_ANY.test(beginner), beginner)
  check('...and nothing else in that reply moved', beginner === BEGINNER.replace(' 📱', ''), beginner)
  const fell = withoutTics(WEEK_FELL_APART)
  check('"How does that sound?" goes from under a real answer', !/how does that sound/i.test(fell) && fell.endsWith("if you'd prefer."), fell)
  const cant = withoutTics(CANT_FACE_IT_2, { name: 'Ashley' })
  check('"I hear you, Ashley." goes from the front of a reply', cant.startsWith("I'm going to drop the set volume"), cant.slice(0, 80))
  check('...and its buttons are exactly as they were', cant.endsWith('[QUICK_REPLIES: "Lighten the workload" | "Take a short break"]'))
  const kick = withoutTics(KICKBOXING)
  check('"Awesome," goes and the sentence it opened still stands', kick.startsWith('Kickboxing is fantastic conditioning'), kick.slice(0, 60))
  check('...a choice between two named things is a real question and stays, with its buttons',
    kick.includes('Which direction would you prefer to take?') && kick.includes('[QUICK_REPLIES: "Lighten today\'s leg workout" | "Move leg session to tomorrow"]'))
  check('being glad at good news is not a stock opener: it stays', withoutTics(GREAT_SESSION).startsWith("That's what we love to hear"))
  check('...and a question about HIS legs today is never touched, idle or not (that is the exam\'s to mark)',
    withoutTics(GREAT_SESSION).endsWith('How are your legs feeling for moving around today?'))
  const safe = withoutTics(CALORIES_800)
  check('safety wording keeps every sentence: no opener or closer is taken from a reply that names a doctor',
    safe.startsWith('I hear you, Ashley —') && safe.endsWith('Does that make sense?'), safe)
  check('a short sign-off keeps its one emoji', withoutTics(THANKS) === THANKS)

  console.log('\n2. A tag the app does not read')
  check('the app\'s own tags are untouched', removeInventedTags('one\n[BREAK]\ntwo\n[LESSON: deload-1]\n[ACTION: SWAP_MEAL]\n[QUICK_REPLIES: "A" | "B"]') === 'one\n[BREAK]\ntwo\n[LESSON: deload-1]\n[ACTION: SWAP_MEAL]\n[QUICK_REPLIES: "A" | "B"]')
  check('a made-up tag with no colon goes too', removeInventedTags('Logged.\n[LOG_SET]') === 'Logged.')
  check('ordinary square brackets are not a tag', removeInventedTags('Do 3 sets [8-10 reps] today.') === 'Do 3 sets [8-10 reps] today.')
  check('a made-up tag above the buttons leaves the buttons', removeInventedTags('Ready:\n[START_TIMER: x=1]\n[QUICK_REPLIES: "Go" | "Wait"]') === 'Ready.\n[QUICK_REPLIES: "Go" | "Wait"]', removeInventedTags('Ready:\n[START_TIMER: x=1]\n[QUICK_REPLIES: "Go" | "Wait"]'))

  console.log('\n3. An internal name')
  const link = '[Watch Barbell Deadlift Tutorial on YouTube](https://www.youtube.com/results?search_query=barbell+deadlift+tutorial+form)'
  check('a link is left exactly as it was (its address has an underscore in it)', plainInternalNames(link) === link, plainInternalNames(link))
  check('...and so is a bare address', plainInternalNames('See www.youtube.com/results?search_query=squat for it.') === 'See www.youtube.com/results?search_query=squat for it.')
  check('a name outside a link still goes when a link is in the same reply',
    plainInternalNames(`I can use propose_plan_pause. ${link}`) === `I can use a plan pause. ${link}`, plainInternalNames(`I can use propose_plan_pause. ${link}`))
  check('"an" before a vowel', plainInternalNames('propose_injury_adaptation') === 'an injury adaptation')
  check('a name that is not an offer is just its words, and code marks go with it', plainInternalNames('Your `today_meal_plan` has it.') === 'Your today meal plan has it.')
  check('ordinary words, hyphens and numbers are untouched', plainInternalNames('A well-earned 3x8 at 72.5kg, not a one_off.') === 'A well-earned 3x8 at 72.5kg, not a one off.')

  console.log('\n4. Emoji')
  const short = 'Hey! Good to hear from you 👋'
  check('a short reply keeps one', capEmoji(short) === short)
  check('...and only one', capEmoji('Done 💪🔥 Enjoy it 🎉') === 'Done 💪 Enjoy it')
  const long = `${'Your squat is moving well and the plan has it going up again next week. '.repeat(3)}💪`
  check(`a reply over ${EMOJI_OVER_CHARS} characters is advice and carries none`, long.length > EMOJI_OVER_CHARS && !EMOJI_ANY.test(capEmoji(long)))
  check('a joined emoji (a runner with a gender mark) goes whole, leaving no stray mark', capEmoji(`${'x'.repeat(170)} 🏃‍♂️`) === 'x'.repeat(170), JSON.stringify(capEmoji(`${'x'.repeat(170)} 🏃‍♂️`)).slice(-30))
  check('the length is what he reads: buttons do not make a short reply long', capEmoji(`Nice 💪\n[QUICK_REPLIES: "${'a'.repeat(100)}" | "${'b'.repeat(100)}"]`).includes('💪'))
  check('a tick is not an emoji', capEmoji(`${'x'.repeat(170)} ✓ done ✔`) === `${'x'.repeat(170)} ✓ done ✔`)
  check('a reply with no emoji comes back identical, spacing and all', capEmoji('one  two\n\n\nthree') === 'one  two\n\n\nthree')

  console.log('\n5. A stock opener')
  check('"Great question!" goes', dropStockOpener('Great question! Protein after training helps, but the day\'s total matters more.') === "Protein after training helps, but the day's total matters more.")
  check('"Good question —" goes and what follows is capitalised', dropStockOpener('Good question — it depends on your week.') === 'It depends on your week.')
  check('"I hear you, but" goes', dropStockOpener("I hear you, but the plan has a lighter week coming.") === 'The plan has a lighter week coming.')
  check('"Love that." goes', dropStockOpener('Love that. How much of each do you usually have?') === 'How much of each do you usually have?')
  check('a reply that is ONLY the opener keeps it', dropStockOpener('I hear you.') === 'I hear you.' && dropStockOpener('Great question!') === 'Great question!')
  check('an acknowledgement about him is not a stock opener', dropStockOpener('Sorry, those days are rotten. One heavy session usually means a short night.') === 'Sorry, those days are rotten. One heavy session usually means a short night.')
  check('"I hear that you\'re feeling good" is a sentence, not the stock phrase', dropStockOpener("I hear that you're feeling good right now, but 600 is far too low.").startsWith('I hear that'))
  check('"To answer your question directly:" goes wherever a sentence starts with it',
    dropStockOpener('Congratulations!\n\nTo answer your question directly: no, now is not the time.') === 'Congratulations!\n\nNo, now is not the time.', dropStockOpener('Congratulations!\n\nTo answer your question directly: no, now is not the time.'))
  check('an opener only goes from the FRONT', dropStockOpener('Rice is fine. Great question, though.') === 'Rice is fine. Great question, though.')

  console.log('\n6. A stock closer')
  const answer = 'Take the squat down ten percent this week and pause each rep at the bottom, so the weak part of the lift gets the work.'
  check(`the fixture is a real answer (over ${MIN_LEFT_AFTER_CLOSER} characters), so the closer can go`, answer.length >= MIN_LEFT_AFTER_CLOSER)
  for (const closer of ['How does that sound?', 'Sound good?', 'Does that make sense?', 'Does that help?', 'Hope that helps!', 'Anything else I can help with?', 'Let me know if you have any other questions.', 'What do you think?']) {
    check(`"${closer}" goes`, dropStockCloser(`${answer} ${closer}`) === answer, dropStockCloser(`${answer} ${closer}`).slice(-50))
  }
  check('...on its own text after a [BREAK] too, and the break goes with it', dropStockCloser(`${answer}\n[BREAK]\nHow does that sound?`) === answer, dropStockCloser(`${answer}\n[BREAK]\nHow does that sound?`))
  check('...with buttons under it, it is a one-tap question and stays', dropStockCloser(`${answer} How does that sound?\n[QUICK_REPLIES: "Do it" | "Leave it"]`).includes('How does that sound?'))
  check('...and a lesson marker under it does not protect it', dropStockCloser(`${answer} How does that sound?\n[LESSON: deload-1]`) === `${answer}\n[LESSON: deload-1]`, dropStockCloser(`${answer} How does that sound?\n[LESSON: deload-1]`))
  check('a hello is a whole reply, not a closer: "How does that sound?" under a short line stays', dropStockCloser('Short walk today. How does that sound?') === 'Short walk today. How does that sound?')
  for (const real of ['How did the knee settle after Tuesday?', 'Which sounds better?', 'How many reps are you getting on the top set?', 'Hotel gym or are you finding somewhere local?', 'How are you feeling heading in?']) {
    check(`a question about HIM is never a stock closer: "${real}"`, !isStockCloser(real) && dropStockCloser(`${answer} ${real}`) === `${answer} ${real}`)
  }
  check('a closer only goes from the END', dropStockCloser(`How does that sound? ${answer}`) === `How does that sound? ${answer}`)

  console.log('\n7. His name')
  check('once in a reply is fine', limitName('Not at all, Ashley! Stick to the plan.', 'Ashley', false) === 'Not at all, Ashley! Stick to the plan.')
  check('twice in a reply is once', limitName('Not at all, Ashley! Stick to the plan, Ashley.', 'Ashley', false) === 'Not at all, Ashley! Stick to the plan.')
  check('none when the coach has just used it', limitName('Not at all, Ashley! Stick to the plan.', 'Ashley', true) === 'Not at all! Stick to the plan.')
  check('"Name, ..." opening a line goes and the line is capitalised', limitName("Ashley, let's do a shorter one.", 'Ashley', true) === "Let's do a shorter one.")
  check('a question keeps its mark', limitName("What's driving that number, Ashley?", 'Ashley', true) === "What's driving that number?")
  check('his name inside a sentence about him is not address and stays', limitName('Ashley from accounts said so.', 'Ashley', true) === 'Ashley from accounts said so.')
  check('a name that is also a word is only touched as address', limitName('Will you train today? You will, Will.', 'Will', true) === 'Will you train today? You will.')
  check('no name, nothing moves', limitName('Hi, Ashley.', null, true) === 'Hi, Ashley.' && limitName('Hi, Ashley.', '', true) === 'Hi, Ashley.')
  check('saysName reads a whole word', saysName('Morning, Ashley.', 'Ashley') && !saysName('Ashleys are common.', 'Ashley') && !saysName('anything', ''))
  const third = withoutTics('I hear you, Ashley. The week has been heavy, so a lighter session tonight is the right call for you.', { name: 'Ashley', recentCoach: ['Not at all, Ashley!'] })
  check('the last three coach messages decide "just used it"', !third.includes('Ashley'), third)
  const fifth = withoutTics('Not at all, Ashley! Stick to the plan.', { name: 'Ashley', recentCoach: ['Morning, Ashley.', 'a', 'b', 'c'] })
  check('...and a use four messages back does not', fifth.includes('Ashley'), fifth)

  console.log('\n8. The door every reply leaves by')
  check('textLikeACoach runs the tics as well as the markup', textLikeACoach(`**Brace** first. ${answer} How does that sound?`) === `Brace first. ${answer}`, textLikeACoach(`**Brace** first. ${answer} How does that sound?`))
  const ctx = ticContextOf({ context: { display_name: 'Ashley' }, history: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'Morning, Ashley.' }, { role: 'assistant', content: 42 }] })
  check('the conversation is read off the request: his name and the coach\'s own last messages only', ctx.name === 'Ashley' && JSON.stringify(ctx.recentCoach) === '["Morning, Ashley."]', ctx)
  check('...and a request with neither is not an error', JSON.stringify(ticContextOf(null)) === '{"name":null,"recentCoach":[],"userMessage":null}')
  const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { 'Content-Type': 'application/json' } })
  const out = await (await cleanCoachResponse(json({ reply: 'Not at all, Ashley! Use propose_plan_pause.', proposal: { kind: 'propose_plan_pause' } }), ctx)).json()
  check('a response is cleaned with that context, and the offer beside the words is untouched',
    out.reply === 'Not at all! Use a plan pause.' && out.proposal.kind === 'propose_plan_pause', out)
  const index = code('supabase/functions/chat-gemini/index.ts')
  check('the entry point hands the door the conversation', /cleanCoachResponse\(\s*await\s+handleChatRequest\(req\)\s*,\s*ticContextOf\(request\)\s*\)/.test(index))

  console.log('\n9. A promise with nothing behind it')
  check('the exam\'s sentence is a promise', detectPlanPromise(CANT_FACE_IT_2)?.includes("I'm going to drop the set volume") === true, detectPlanPromise(CANT_FACE_IT_2))
  for (const promise of ["I'll move tomorrow's leg session to Wednesday.", "Let me swap your squat for a leg press this week.", "We'll cut today's session down to the main lift.", "I will add a snack to your plan for training days."]) {
    check(`a promise: "${promise}"`, detectPlanPromise(promise) === promise)
  }
  for (const fine of [
    "I can move tomorrow's leg session to Wednesday if you really want the long run.",
    'Want me to take a set off each lift this week?',
    "I'll keep an eye on how your squat moves this week.",
    "I'll add it once you tap Confirm on that card.",
    "Let's just do the main squat work and a couple of quick accessories today.",
    "You'll move better once the warm-up is done, so add a set of bodyweight squats first.",
    "I'm going to be straight with you: your plan is fine.",
    "I'll put the kettle on.",
    // Only the offer in each of these keeps it from being a promise:
    "I'll move tomorrow's session to Wednesday if you like.",
    "Say the word and I'll swap your lunch for something lighter.",
    // ...and only the question mark in this one:
    "So I'll move today's session to Friday?",
  ]) check(`not a promise: "${fine}"`, detectPlanPromise(fine) === null, detectPlanPromise(fine))
  check('the buttons under a reply are not read as the coach\'s words', detectPlanPromise('Up to you.\n[QUICK_REPLIES: "I\'ll move today\'s session" | "Leave it"]') === null)

  // The real retry, with a fake model: a promise is sent back once, and the answer that offers is what he gets.
  const PROMISE_CHECK: ReplyCheck = { test: t => detectPlanPromise(t), nudge: () => PLAN_PROMISE_NUDGE, floor: PLAN_PROMISE_FLOOR }
  const asked: string[] = []
  const offer = 'That sounds like a heavy few weeks. Want me to take a set off each lift for now?\n[QUICK_REPLIES: "Yes, lighten it" | "Leave it"]'
  const first = [{ text: CANT_FACE_IT_2 }]
  const r1 = await resolvePlainReply({
    contents: [{ role: 'user', parts: [{ text: 'rough few weeks' }] }], firstParts: first, floor: 'floor', checks: [PROMISE_CHECK],
    callGemini: async (contents: unknown[]) => { asked.push(JSON.stringify(contents[contents.length - 1])); return { ok: true, status: 200, parts: [{ text: offer }] } },
  } as Parameters<typeof resolvePlainReply>[0])
  check('a promise is not sent: the coach is asked again', r1.reply === offer && r1.source === 'round_trip', r1)
  check('...and told to say it as an offer', asked.length === 1 && asked[0].includes('OFFER they can say yes to'), asked)
  const r2 = await resolvePlainReply({
    contents: [], firstParts: first, floor: 'floor', checks: [PROMISE_CHECK],
    callGemini: async () => ({ ok: true, status: 200, parts: [{ text: "I'll drop your volume this week." }] }),
  } as Parameters<typeof resolvePlainReply>[0])
  check('promised twice: he gets the app\'s own sentence, which promises nothing', r2.reply === PLAN_PROMISE_FLOOR && r2.source === 'floor', r2)
  const r3 = await resolvePlainReply({
    contents: [], firstParts: [{ text: offer }], floor: 'floor', checks: [PROMISE_CHECK],
    callGemini: async () => { throw new Error('must not be called') },
  } as Parameters<typeof resolvePlainReply>[0])
  check('an offer goes straight through with no second call', r3.reply === offer && r3.legs === 0, r3)
  check('the app\'s own sentence is not itself a promise or a claim', detectPlanPromise(PLAN_PROMISE_FLOOR) === null)
  const chips = [...PLAN_PROMISE_FLOOR.matchAll(/"([^"]+)"/g)].map(m => m[1])
  check('...and its first two buttons say something the coach can act on', chips.length === 3 && chips.slice(0, 2).every(c => classifyImperative(c, c).imperative), chips.map(c => [c, classifyImperative(c, c)]))
  // EVERY turn that ends in the coach's own unsupervised words carries the check: each resolvePlainReply call, not one of them.
  const plainCalls = index.split('resolvePlainReply({').slice(1).map(seg => seg.slice(0, seg.indexOf('})')))
  check('every plain turn carries the promise check', plainCalls.length >= 2 && plainCalls.every(c => /checks:\s*\[\s*\.\.\.todayChecks\s*,\s*PLAN_PROMISE_CHECK\s*\]/.test(c)), plainCalls.map(c => c.slice(-120)))
  check('...and the check is the promise detector', /PLAN_PROMISE_CHECK:\s*ReplyCheck\s*=\s*\{\s*test:\s*\(t: string\)\s*=>\s*detectPlanPromise\(t\)/.test(index))

  console.log('\n10. A tool that does not exist is not his fault')
  check('the line that blamed him is gone from the coach', !/didn't quite follow/i.test(index) && !/say it again in your own words/i.test(index))
  const undeclared = index.slice(index.indexOf('functionCall for an undeclared tool'))
  check('that turn gets a second chance in words', /resolvePlainReply\(\{[\s\S]{0,400}silentNudge:\s*NO_SUCH_TOOL_NUDGE/.test(undeclared.slice(0, 900)), undeclared.slice(0, 300))
  const said: string[] = []
  const r4 = await resolvePlainReply({
    contents: [{ role: 'user', parts: [{ text: 'can I do heavy legs friday night' }] }], firstParts: [], floor: 'floor', silentNudge: 'NO SUCH TOOL',
    callGemini: async (contents: unknown[]) => { said.push(JSON.stringify(contents[contents.length - 1])); return { ok: true, status: 200, parts: [{ text: 'Heavy legs the night before a match will cost you on Saturday.' }] } },
  } as Parameters<typeof resolvePlainReply>[0])
  check('a turn with no words is retried with the reason it was given', said.length === 1 && said[0].includes('NO SUCH TOOL') && r4.reply.startsWith('Heavy legs'), { said, r4 })
  const r5 = await resolvePlainReply({
    contents: [], firstParts: [{ text: "I've moved your session to Friday." }], floor: 'floor', silentNudge: 'NO SUCH TOOL', refuse: (t: string) => (/moved your session/.test(t) ? t : null), refusedFloor: 'claim floor',
    callGemini: async (contents: unknown[]) => { said.push(JSON.stringify(contents[contents.length - 1])); return { ok: true, status: 200, parts: [{ text: 'Want it on Friday?' }] } },
  } as Parameters<typeof resolvePlainReply>[0])
  check('...and a refused claim still gets the claim\'s own words, not the silent turn\'s', r5.reply === 'Want it on Friday?' && !said[1].includes('NO SUCH TOOL'), said[1]?.slice(0, 120))

  console.log('\n[O] An offer asked in plain words gets its buttons (his Muay Thai chat, 19 Nov 2026)')
  {
    const his = 'Your plan already has easy walks.\n\nI can set up your weekly Muay Thai schedule so your gym days lighten on class days. Would you like me to set that up for you?'
    const got = offerButtons(his)
    check('O1. his reply gets "Yes please" / "Not now" under it', got.endsWith(`\n${OFFER_BUTTONS}`) && got.startsWith(his), got.slice(-120))
    check('O2. "Want me to…?" and "Shall I…?" too', offerButtons('That works. Want me to move it to Friday?').includes(OFFER_BUTTONS) && offerButtons('Easy fix. Shall I swap it for rows?').includes(OFFER_BUTTONS))
    const tagged = 'Want me to take a set off?\n[QUICK_REPLIES: "Yes, lighten it" | "Leave it"]'
    check('O3. a reply with its own buttons is left exactly as it is', offerButtons(tagged) === tagged)
    check('O4. a question that is not an offer gets none ("How did it feel?", "Would you like rice or potatoes?")', offerButtons('Good session. How did your shoulder feel?') === 'Good session. How did your shoulder feel?' && !offerButtons('Would you like rice or potatoes?').includes(OFFER_BUTTONS))
    check('O5. an offer mid-reply, not last, gets none (the reply ends on something else)', !offerButtons('Want me to move it? Either way, rest well tonight.').includes(OFFER_BUTTONS))
    check('O6. the one door every reply leaves by adds them', withoutTics('Got it. Would you like me to add that to Thursday?').includes(OFFER_BUTTONS))
    const idx = code('supabase/functions/chat-gemini/index.ts')
    check('O7. combat-sport conditioning is 3-minute rounds with a minute\'s rest, named so the round timer reads it', /3-minute rounds at hard effort/.test(idx) && /"4 rounds of 3 minutes, 1 minute rest"/.test(idx) && /Skipping is a warm-up or an easy day, never the main conditioning/.test(idx))
    check('O8. "my cardio is bad" after their sport asks about breathing and pacing before prescribing', /"MY CARDIO IS BAD" AFTER THEIR SPORT IS A QUESTION BEFORE IT IS A PRESCRIPTION/.test(idx) && /holding the breath/.test(idx))
  }

  console.log('\n[G] A how-to in short steps carries its "Full form guide" button (his 24 Sep 2026 "short steps")')
  {
    // The 18 Nov 2026 exam's deadlift reply, as recorded (raw), buttons and all.
    const dead = "Here's the foundation for a solid deadlift:\n\n1. Stand feet hip-width, bar over mid-foot, grip outside knees.\n2. Pull hips down, chest up, and squeeze your armpits.\n3. Drive through your feet, keeping the bar close.\n[BREAK]\nSetting your back protects your spine.\n\n[QUICK_REPLIES: \"Breathing & bracing\" | \"Common mistakes\" | \"Got it\"]"
    const got = fullGuideButton(dead, 'how do I do a deadlift')
    check('G1. his deadlift how-to gets the guide button FIRST, the coach\'s own kept after it', got.includes(`[QUICK_REPLIES: "${FULL_GUIDE}" | "Breathing & bracing" | "Common mistakes" | "Got it"]`), got.slice(-110))
    check('G2. ...and nothing else in the reply moves', got.replace(/\[QUICK_REPLIES:[^\]]*\]/, '') === dead.replace(/\[QUICK_REPLIES:[^\]]*\]/, ''))
    const four = dead.replace('"Got it"]', '"Got it" | "Show a video"]')
    check('G3. the chat draws four buttons, so a fourth of the coach\'s is the one left out', fullGuideButton(four, 'deadlift form?').includes(`"${FULL_GUIDE}" | "Breathing & bracing" | "Common mistakes" | "Got it"]`) && !fullGuideButton(four, 'deadlift form?').includes('Show a video'))
    const bare = '1. Brace hard.\n2. Push the floor away.'
    check('G4. a how-to with no buttons gets the guide as its one button', fullGuideButton(bare, 'what are the cues for a squat?') === `${bare}\n[QUICK_REPLIES: "${FULL_GUIDE}"]`)
    check('G5. a reply that already has it is left exactly as it is', fullGuideButton(`${bare}\n[QUICK_REPLIES: "Full form guide" | "Got it"]`, 'how do I squat') === `${bare}\n[QUICK_REPLIES: "Full form guide" | "Got it"]`)
    check('G6. the full guide itself gets none (he is reading it)', fullGuideButton(bare, 'Full form guide') === bare)
    check('G7. a question that is not about form gets none ("how do I eat more protein")', fullGuideButton(bare, 'how do I eat more protein?') === bare)
    check('G8. a form question answered in prose, with no steps, gets none', fullGuideButton('Keep the bar over mid-foot and brace before you pull.', 'deadlift form?') === 'Keep the bar over mid-foot and brace before you pull.')
    const seven = [1,2,3,4,5,6,7].map(n => `${n}. Step ${n}.`).join('\n')
    check('G9. more than three steps is not the short-steps shape, and gets none', fullGuideButton(seven, 'how do I deadlift') === seven)
    check('G10. the one door adds it, reading his message off the request', textLikeACoach(bare, ticContextOf({ message: 'how do I deadlift', history: [], context: {} })).includes(FULL_GUIDE))
    check('G11. ...and without his message the door adds nothing', !textLikeACoach(bare, ticContextOf({ history: [], context: {} })).includes(FULL_GUIDE))
  }

  console.log(`\ncoach-tics: ${ran} checks ran`)
  if (failures > 0) console.error(`coach-tics: ${failures} check(s) FAILED`)
  else console.log('coach-tics: all checks passed')
}

main().catch(err => { console.error(err); failures++ }).finally(() => { if (failures > 0) process.exit(1) })

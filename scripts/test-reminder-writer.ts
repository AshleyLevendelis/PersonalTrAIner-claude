/**
 * test:reminder-writer — THE COACH WRITES THE REMINDER; THE APP CHECKS IT.
 *
 * Ashley's ruling, 6 Nov 2026, "Coach writes, app checks": reminders are written
 * fresh by the coach from her real day; the app checks them and sends a warm
 * fixed sentence when they fail (supabase/functions/_shared/reminder-writer.ts).
 *
 *   1. The checks: one good message passes; each way of being wrong is refused,
 *      and the near-misses that are fine are not.
 *   2. The fallback: a refused, failed or missing writer means the fixed sentence.
 *   3. The brief: only what the app knows, her name, the rules.
 *   4. The whole run: the chat and the phone get the SAME words, the coach's when
 *      they pass and the fixed sentence when they do not.
 *   5. The deployable function wires the real writer: key from the environment,
 *      a timeout, thinking off, null on any failure.
 */
import { readFileSync } from 'node:fs'
import { checkReminder, writeReminder, reminderPrompt, partOfDayFor, writeOpener, openerPrompt } from '../supabase/functions/_shared/reminder-writer'
import { runReachOut, type ReachOutDeps, type PushSubscriptionRow, type MomentFactsRow, type LiveFacts } from '../supabase/functions/_shared/reach-out'
import { coachMessage, type CoachMoment, type MomentFacts } from '../supabase/functions/_shared/coach-moments'

let ran = 0, failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}

const F: MomentFacts = {
  localHour: 19, awaitingFeel: false, plannedToday: true, loggedToday: false, missedYesterday: false,
  daysSinceAnyLog: 1, weekday: 6, weekSessionsDone: 5, weekSessionsPlanned: 6, blockJustEnded: false, beatTargetPending: false, name: 'Ashley',
}
const moment = (key: string, f: MomentFacts = F): CoachMoment => ({
  key: key as CoachMoment['key'],
  text: coachMessage(key, { name: f.name, weekDone: f.weekSessionsDone, weekPlanned: f.weekSessionsPlanned, mealsLogged: f.mealsAccountedToday ?? 0, finishedWhen: f.finishedWhen }),
  shortcut: null,
})
const NOT_LOGGED = moment('session_not_logged')
// The weekly review carries the week's numbers (5 of 6), as the streak line carried its count until 13 Nov 2026.
const REVIEW = moment('week_review')
const PROTEIN = moment('protein_short')

async function main() {
  console.log('\n1. The checks')
  const good = "Hey Ashley, today's session is still waiting. Even twenty minutes keeps the habit ticking over, and that's what builds you."
  check('a warm, short, true message passes as written', JSON.stringify(checkReminder(good, NOT_LOGGED, F)) === JSON.stringify({ ok: true, text: good }), checkReminder(good, NOT_LOGGED, F))
  check('...wrapping quotes are taken off', (checkReminder(`"${good}"`, NOT_LOGGED, F) as { text?: string }).text === good)
  const refused = (t: string, m = NOT_LOGGED, f = F) => { const r = checkReminder(t, m, f); return r.ok ? null : r.why }
  check('empty is refused', refused('   ') === 'empty')
  check('over 240 characters is refused', refused(`Hey Ashley, ${'go on, '.repeat(40)}`) === 'too long')
  check('more than three sentences is refused', refused('Hey Ashley. One. Two. Three.') === 'too many sentences')
  check('formatting, a list or a marker is refused',
    refused('Hey Ashley, **today** is the day.') === 'formatting or a list'
      && refused('Hey Ashley, two things:\n1. train\n2. eat') === 'formatting or a list'
      && refused('Hey Ashley, go train. [LESSON: deload]') === 'formatting or a list')
  check('a message not opening "Hey" is refused (her WhatsApp shape)', refused('Ashley, your session is waiting.') === 'does not open "Hey"')
  check('a number the fixed sentence does not carry is refused (the coach never invents one)',
    /a number it was not given \(40\)/.test(refused("Hey Ashley, you're 40g short today.", PROTEIN) ?? ''), refused("Hey Ashley, you're 40g short today.", PROTEIN))
  // A CASE WHERE THE ALLOWANCE BINDS: the review carries 5 and 6, so those are allowed and 7 is not.
  check('...while the number it WAS given passes, and a different one does not',
    checkReminder("Hey Ashley, 5 of 6 sessions this week, lovely work. Anything you'd change for next week?", REVIEW, F).ok
      && refused("Hey Ashley, 7 of 6 sessions this week, lovely work. Anything you'd change for next week?", REVIEW) === 'a number it was not given (7)')
  check('a food named is refused: it never knows her allergies',
    refused('Hey Ashley, a handful of almonds would close the protein gap tonight.', PROTEIN) === 'names a food (almonds)'
      && refused('Hey Ashley, a Greek yoghurt before bed would close the gap.', PROTEIN) === 'names a food (yoghurt)'
      && refused('Hey Ashley, a shake tonight would do it.', PROTEIN) === 'names a food (shake)')
  check('...but "protein" itself is not a food name', checkReminder("Hey Ashley, you're behind on protein today. It's what rebuilds the muscle you train.", PROTEIN, F).ok)
  check('talk about being an AI is refused', refused("Hey Ashley, as an AI I can't train for you, but your session's waiting.") === 'talks about being an AI')
  check('more than one emoji is refused, one is fine',
    refused('Hey Ashley, session time 💪🔥') === 'more than one emoji' && checkReminder("Hey Ashley, session's waiting 💪", NOT_LOGGED, F).ok)
  check('claiming she trained when nothing is logged is refused',
    /wrong claim about her day \(trained_today\)/.test(refused('Hey Ashley, great session today, now get some rest.') ?? ''), refused('Hey Ashley, great session today, now get some rest.'))
  check('...and the wrong part of the day is refused',
    /wrong claim about her day \(part_of_day\)/.test(refused("Hey Ashley, it's morning, the perfect time to train.") ?? ''), refused("Hey Ashley, it's morning, the perfect time to train."))
  const feel = moment('session_feel', { ...F, loggedToday: true, finishedWhen: 'this evening' })
  check('...while asking about a session she DID log is fine',
    checkReminder('Hey Ashley, great session today! How did it feel?', feel, { ...F, loggedToday: true }).ok, checkReminder('Hey Ashley, great session today! How did it feel?', feel, { ...F, loggedToday: true }))
  check('part of day follows her hour', partOfDayFor(9) === 'morning' && partOfDayFor(14) === 'afternoon' && partOfDayFor(19) === 'evening')

  console.log('\n2. The fallback')
  const ok = await writeReminder(NOT_LOGGED, F, async () => good)
  check('a message that passes is the coach\'s', ok.by === 'coach' && ok.text === good, ok)
  const bad = await writeReminder(PROTEIN, F, async () => 'Hey Ashley, some almonds would sort it.')
  check('one that fails sends the fixed sentence, and says why', bad.by === 'fixed' && bad.text === PROTEIN.text && bad.why === 'names a food (almonds)', bad)
  const threw = await writeReminder(NOT_LOGGED, F, async () => { throw new Error('network') })
  check('a writer that throws sends the fixed sentence', threw.by === 'fixed' && threw.text === NOT_LOGGED.text, threw)
  const nothing = await writeReminder(NOT_LOGGED, F, async () => null)
  check('a writer that returns nothing sends the fixed sentence', nothing.by === 'fixed' && nothing.text === NOT_LOGGED.text && nothing.why === 'empty', nothing)
  const none = await writeReminder(NOT_LOGGED, F, null)
  check('no writer at all sends the fixed sentence', none.by === 'fixed' && none.text === NOT_LOGGED.text && none.why === 'no writer', none)

  console.log('\n3. The brief')
  const brief = reminderPrompt(PROTEIN, F)
  check('it opens with her name the way she asked', /Start with "Hey Ashley,"/.test(brief))
  check('...says what the moment is for, and never to name a food', /behind on their protein target/.test(brief) && /never name a food/i.test(brief))
  check('...asks for a short why and the coach\'s warmth', /one short why/.test(brief) && /warm, encouraging/.test(brief))
  check('...says nothing is logged when nothing is, and the part of the day', /Nothing has been trained or logged today/.test(brief) && /It is evening for them/.test(brief))
  check('...and carries no number other than the fixed sentence\'s', ((brief.match(/\d+/g) ?? []).filter(n => !(PROTEIN.text.match(/\d+/g) ?? []).includes(n) && !['200'].includes(n))).length === 0, brief.match(/\d+/g))
  check('with no name, it says "Hey," and nothing else', /Start with "Hey,"/.test(reminderPrompt(PROTEIN, { ...F, name: null })))

  console.log('\n4. The whole run: the chat and the phone get the same words')
  const NONE: LiveFacts = { activityDates: [], marks: {}, movedInto: [], unratedRecentSession: false, beatTargetOffered: false }
  const MWF: MomentFactsRow = { training_weekdays: ['Monday', 'Wednesday', 'Friday'], plan_ends_on: '2026-12-01' }
  const sub: PushSubscriptionRow = { id: 's1', user_id: 'u1', endpoint: 'https://push.example/s1', p256dh: 'k', auth: 'a', timezone: 'Europe/London' }
  const run = async (writer: ReachOutDeps['writeWithCoach']) => {
    const chat: string[] = [], pushed: string[] = [], prompts: string[] = []
    const deps: ReachOutDeps = {
      now: new Date('2026-09-23T18:30:00Z'), // a Wednesday, 19:30 in London
      listSubscriptions: async () => [sub],
      loadFactsRow: async () => MWF,
      loadSettings: async () => ({ settings: {}, name: 'Ashley' }),
      loadLive: async () => NONE,
      loadRecentSends: async () => [],
      send: async (_s, p) => { pushed.push(p.body); return 'ok' },
      insertChatMessage: async (_u, m) => { chat.push(m.content); return 'm1' },
      deleteChatMessage: async () => {},
      recordSent: async () => true,
      unrecordSent: async () => {},
      dropSubscription: async () => {},
      writeWithCoach: writer === undefined ? undefined : async p => { prompts.push(p); return writer(p) },
    }
    const report = await runReachOut(deps)
    return { chat, pushed, prompts, report }
  }
  const coachWords = "Hey Ashley, today's session is still waiting. Even twenty minutes keeps the habit ticking over."
  const a = await run(async () => coachWords)
  check('the coach was asked, once, for this moment', a.prompts.length === 1 && /still waiting/.test(a.prompts[0]), a.prompts)
  check('its words went into the chat AND to the phone, the same words', a.chat[0] === coachWords && a.pushed[0] === coachWords && a.report.sent === 1, a)
  const b = await run(async () => 'Hey Ashley, smash it today, a banana first!')
  const fixed = coachMessage('session_not_logged', { name: 'Ashley', mealsLogged: 0 })
  check('a refused message sends the fixed sentence to both, never the refused words', b.chat[0] === fixed && b.pushed[0] === fixed && !b.pushed.some(x => /banana/.test(x)), b)
  const c = await run(undefined)
  check('with no writer wired, the fixed sentence goes, as before', c.chat[0] === fixed && c.pushed[0] === fixed, c)

  console.log('\n5. The deployable function wires the real writer')
  const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const fn = strip(readFileSync('supabase/functions/coach-reach-out/index.ts', 'utf8'))
  const gem = strip(readFileSync('supabase/functions/_shared/gemini.ts', 'utf8'))
  check('the deps hand runReachOut the writer, the shared short-line call', /writeWithCoach: \(prompt\) => coachShortLine\(prompt\),\n\s*\};/.test(fn) && /import \{ coachShortLine \} from "\.\.\/_shared\/gemini\.ts"/.test(fn))
  check('...which reads the coach key from the environment and gives up without one', /export async function coachShortLine\(prompt: string, timeoutMs = 8000[^)]*\): Promise<string \| null>[\s\S]{0,200}Deno\.env\.get\("GEMINI_KEY"\)[\s\S]{0,80}if \(!key\) return null/.test(gem))
  check('...stops waiting after a few seconds', /setTimeout\(\(\) => ctrl\.abort\(\), timeoutMs\)/.test(gem) && /signal: ctrl\.signal/.test(gem))
  check('...with thinking off, so it cannot spend the small budget thinking', /coachShortLine[\s\S]*thinkingConfig: \{ thinkingBudget: 0 \}/.test(gem))
  check('...and returns null, never throws, on any failure', /coachShortLine[\s\S]*if \(!res\.ok\) return null[\s\S]*catch \{\s*return null;/.test(gem))

  console.log('\n6. The chat opener, in the coach\'s words, checked the same way')
  const fixedQ = "Evening Ashley — yesterday's Push didn't happen, no drama. Run it today, mark it missed, or was it a rest day?"
  const q = 'Run it today, mark it missed, or was it a rest day?'
  const askQ = { fixed: fixedQ, question: q, partOfDay: 'evening' as const, trainedToday: false }
  const o1 = await writeOpener(askQ, async () => "Evening Ashley! Yesterday's Push slipped by, and that's fine. Run it today, mark it missed, or was it a rest day?")
  check('a warm rewrite that ends on the buttons\' question is the coach\'s', o1.by === 'coach', o1)
  const o2 = await writeOpener(askQ, async () => "Evening Ashley! Yesterday's Push slipped by. Want to do it today?")
  check('...one that changes the question its buttons answer is refused: the fixed opener', o2.by === 'fixed' && o2.text === fixedQ && o2.why === 'does not end on the question its buttons answer', o2)
  const o3 = await writeOpener({ ...askQ, question: null, fixed: "Evening Ashley — how's the evening going?" }, async () => 'Evening Ashley! How was your day?')
  check('an opener with no buttons may end on its own question', o3.by === 'coach', o3)
  const o4 = await writeOpener(askQ, async () => "Evening Ashley! 3 sessions this week, nice. Run it today, mark it missed, or was it a rest day?")
  check('...and is held to the same rules: no number the app did not give', o4.by === 'fixed' && /a number it was not given/.test(o4.why ?? ''), o4)
  const o5 = await writeOpener({ ...askQ, question: null, fixed: "Evening Ashley — how's the evening going?" }, async () => "Evening Ashley, great session today! How's the evening going?")
  check('...and no wrong claim about her day', o5.by === 'fixed' && /trained_today/.test(o5.why ?? ''), o5)
  const p = openerPrompt(askQ)
  check('the brief carries the app\'s opener, the question word for word, and "add no facts"',
    p.includes(fixedQ) && p.includes(`End with exactly this question, word for word: "${q}"`) && /Keep every fact exactly as given and add none/.test(p))

  console.log('\n7. The coach\'s server and the chat, wired')
  const chatFn = strip(readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8'))
  check('the coach\'s server answers an opener request with the checked words, or null',
    /if \(body\?\.mode === "opener"\)/.test(chatFn) && /await writeOpener\(\{[\s\S]{0,300}\}, \(prompt\) => coachShortLine\(prompt, 4000\)\)/.test(chatFn)
      && /JSON\.stringify\(\{ opener: written\?\.by === "coach" \? written\.text : null \}\)/.test(chatFn))
  check('...after the spending cap, like every other request', chatFn.indexOf('const cap = await checkSpendCap(') > 0 && chatFn.indexOf('const cap = await checkSpendCap(') < chatFn.indexOf('if (body?.mode === "opener")'))
  const chatUi = strip(readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
  check('the chat asks with the fixed opener and the buttons\' question, and waits a few seconds at most',
    /askCoachOpener\(content, chips \? openerQuestion\(content\) : null, !!chips\)/.test(chatUi)
      && /setTimeout\(\(\) => \{ controller\.abort\(\); done\(null\) \}, OPENER_COACH_WAIT_MS\)/.test(chatUi) && /await Promise\.race\(\[ask, late\]\)/.test(chatUi) && /const OPENER_COACH_WAIT_MS = 4500\b/.test(chatUi))
  check('...an opener with buttons and no question is never handed to the coach', /if \(needsQuestion && !question\) return null/.test(chatUi))
  check('...and it shows the coach\'s words only while the chat is untouched, else keeps what is there',
    /prev\.length === 1 && prev\[0\]\.role === 'assistant' && prev\[0\]\.content === seededGreetingRef\.current\s*\?\s*\[\{ role: 'assistant', content: coach \?\? content/.test(chatUi))

  console.log(`\n${ran} checks ran`)
  if (failures > 0) { console.log(`reminder writer: ${failures} check(s) failed`); process.exit(1) }
  console.log('reminder writer: all checks passed')
}
main()

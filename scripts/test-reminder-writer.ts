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
import { checkReminder, writeReminder, reminderPrompt, partOfDayFor } from '../supabase/functions/_shared/reminder-writer'
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
  daysSinceAnyLog: 1, streakDays: 5, blockJustEnded: false, beatTargetPending: false, name: 'Ashley',
}
const moment = (key: string, f: MomentFacts = F): CoachMoment => ({
  key: key as CoachMoment['key'],
  text: coachMessage(key, { name: f.name, streak: f.streakDays, mealsLogged: f.mealsAccountedToday ?? 0, finishedWhen: f.finishedWhen }),
  shortcut: null,
})
const NOT_LOGGED = moment('session_not_logged')
const STREAK = moment('streak_at_risk')
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
  // A CASE WHERE THE ALLOWANCE BINDS: the streak sentence carries 5, so 5 is allowed and 6 is not.
  check('...while the number it WAS given passes, and a different one does not',
    checkReminder("Hey Ashley, 5 in a row, brilliant! Today's keeps it going.", STREAK, F).ok
      && refused("Hey Ashley, 6 in a row, brilliant! Today's keeps it going.", STREAK) === 'a number it was not given (6)')
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
  const fixed = coachMessage('session_not_logged', { name: 'Ashley', streak: 0, mealsLogged: 0 })
  check('a refused message sends the fixed sentence to both, never the refused words', b.chat[0] === fixed && b.pushed[0] === fixed && !b.pushed.some(x => /banana/.test(x)), b)
  const c = await run(undefined)
  check('with no writer wired, the fixed sentence goes, as before', c.chat[0] === fixed && c.pushed[0] === fixed, c)

  console.log('\n5. The deployable function wires the real writer')
  const fn = readFileSync('supabase/functions/coach-reach-out/index.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  check('the deps hand runReachOut the writer', /dropSubscription:[^\n]*\n\s*writeWithCoach,\n\s*\};/.test(fn))
  check('...which reads the coach key from the environment and gives up without one', /async function writeWithCoach\(prompt: string\): Promise<string \| null>[\s\S]{0,200}Deno\.env\.get\("GEMINI_KEY"\)[\s\S]{0,80}if \(!key\) return null/.test(fn))
  check('...stops waiting after a few seconds', /setTimeout\(\(\) => ctrl\.abort\(\), 8000\)/.test(fn) && /signal: ctrl\.signal/.test(fn))
  check('...with thinking off, so it cannot spend the small budget thinking', /thinkingConfig: \{ thinkingBudget: 0 \}/.test(fn))
  check('...and returns null, never throws, on any failure', /if \(!res\.ok\) return null/.test(fn) && /catch \{\s*return null;/.test(fn))

  console.log(`\n${ran} checks ran`)
  if (failures > 0) { console.log(`reminder writer: ${failures} check(s) failed`); process.exit(1) }
  console.log('reminder writer: all checks passed')
}
main()

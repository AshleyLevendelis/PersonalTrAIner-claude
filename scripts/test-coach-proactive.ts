// The coach's voice and proactivity (Ashley's brief, 25 Nov 2026: "still robotic, still no personality, still not
// enthusiastic, and still not proactive enough"). Holds:
//   1. what is coming up, worked out by Home (days-ahead.ts): a heavy leg day, a hard leg-taxing class, one pattern;
//   2. read back for one date (aheadFacts), defensively, by the app and the server alike;
//   3. the moments: the session named, a clash said instead of the plain reminder, a pattern once a week in the
//      afternoon, each with its easy out, the app's and the server's copies word for word;
//   4. the server: a clash is a reminder of the day, the pattern waits a week, the chips ride on the chat row;
//   5. the reminder writer: the persona, the facts, a greeting that fits the time, a question under chips;
//   6. the chat: a row's chips come back as its one-tap answers, a clash is the morning's hello;
//   7. the coach's own instructions: who it is (§0) before the voice rules, two gears, make the call, what a tap means;
//      the second-pass editor shortens and never flattens;
//   8. the wiring: Home sends the days ahead, the column is in the migration and the retry list.
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { dayBriefOf, isLegTaxing, patternAheadOf } from '../src/lib/days-ahead'
import * as browser from '../src/lib/coach-moments'
import * as server from '../supabase/functions/_shared/coach-moments'
import { mayNotify, daysSinceSent, factsFor } from '../supabase/functions/_shared/reach-out'
import { checkReminder, reminderPrompt, GREETING } from '../supabase/functions/_shared/reminder-writer'
import { voicePrompt } from '../supabase/functions/chat-gemini/voice-pass'
import { rowToMessage, daysSinceMomentSaid } from '../src/lib/chat-history-merge'
import { pickUnprompted } from '../src/lib/coach-nudge'
import type { ConcurrentActivity, WorkoutDay } from '../src/lib/types'

let ran = 0
let failures = 0
function check(name: string, ok: boolean, detail: unknown = '') {
  ran++
  if (ok) console.log(`ok: ${name}`)
  else { failures++; console.log(`FAIL: ${name}${detail !== '' ? ` (${JSON.stringify(detail)})` : ''}`) }
}
const strip = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1')

const legDay: WorkoutDay = {
  day: 'Tuesday', focus: 'Lower Body Strength',
  exercises: [
    { name: 'Barbell Squats', sets: 4, reps: '5', rest: '180s', substitution: '', tier: 'tier_1_primary', suggested_load_kg: 85 } as never,
    { name: 'Leg Curl', sets: 3, reps: '10', rest: '60s', substitution: '', tier: 'tier_3_isolation', suggested_load_kg: 30 } as never,
  ],
}
const pushDay: WorkoutDay = {
  day: 'Wednesday', focus: 'Upper Push',
  exercises: [{ name: 'Barbell Bench Press', sets: 4, reps: '6', rest: '150s', substitution: '', tier: 'tier_1_primary', suggested_load_kg: 70 } as never],
}
const muayThai: ConcurrentActivity = { name: 'Muay Thai', intensity: 0.8, days: ['Monday', 'Tuesday'], movement_demands: ['striking', 'knee_dominant', 'conditioning'] }
const yoga: ConcurrentActivity = { name: 'Yoga', intensity: 0.3, days: ['Monday'], movement_demands: ['hip_hinge'] }
const easyRun: ConcurrentActivity = { name: 'Easy run', intensity: 0.5, days: ['Monday'], movement_demands: ['running'] }
const hardRun: ConcurrentActivity = { name: 'Track session', intensity: 0.8, days: ['Monday'], movement_demands: ['running'] }

console.log('1. What is coming up, worked out by Home')
const b = dayBriefOf(legDay, 'Tuesday', [muayThai, yoga])
check('a squat-led day is a heavy leg day, named with its lift and weight', b.session === 'Lower Body Strength' && b.lift === 'Barbell Squats' && b.weight === '85kg' && b.heavyLegs, b)
check('...and the hard class that day is listed, the gentle one is not', JSON.stringify(b.hardActivities) === '["Muay Thai"]', b.hardActivities)
check('a bench day is not a leg day', dayBriefOf(pushDay, 'Wednesday', []).heavyLegs === false)
check('a rest day has no session but still carries the class', (() => { const r = dayBriefOf(null, 'Monday', [muayThai]); return r.session === null && r.hardActivities[0] === 'Muay Thai' })())
check('combat counts as leg-taxing; an easy run does not; a hard run does; yoga does not', isLegTaxing(muayThai) && !isLegTaxing(easyRun) && isLegTaxing(hardRun) && !isLegTaxing(yoga))
check('the pattern: a stuck lift outranks too-hard, which outranks protein',
  patternAheadOf({ stuck: [{ name: 'Barbell Squats', weightKg: 80, reps: 5, sessions: 3 }], tooHard: 3, protein: { days: 3, avgG: 90 } })?.kind === 'stuck_lift'
  && patternAheadOf({ stuck: [], tooHard: 3, protein: { days: 3, avgG: 90 } })?.kind === 'too_hard'
  && patternAheadOf({ stuck: [], tooHard: null, protein: { days: 3, avgG: 90 } })?.kind === 'low_protein'
  && patternAheadOf({ stuck: [], tooHard: null, protein: null }) === null)

console.log('\n2. Read back for one date')
const TODAY = '2026-11-24' // a Tuesday
const ahead = (over: Record<string, unknown> = {}) => ({
  asOf: TODAY,
  days: { '2026-11-23': dayBriefOf(null, 'Monday', [muayThai]), [TODAY]: dayBriefOf(legDay, 'Tuesday', []), '2026-11-25': dayBriefOf(pushDay, 'Wednesday', []) },
  pattern: null, ...over,
})
for (const [label, mod] of [['app', browser], ['server', server]] as const) {
  const f = mod.aheadFacts(ahead(), TODAY)
  check(`${label}: today's session by name, lift and weight`, f.todaySession?.name === 'Lower Body Strength' && f.todaySession?.lift === 'Barbell Squats' && f.todaySession?.weight === '85kg', f)
  check(`${label}: a hard class yesterday against heavy legs today is a clash`, f.clash?.when === 'yesterday' && f.clash.activity === 'Muay Thai', f.clash)
}
const sameDay = browser.aheadFacts({ asOf: TODAY, days: { [TODAY]: dayBriefOf(legDay, 'Tuesday', [muayThai]) } }, TODAY)
check('a hard class the same day is a same-day clash', sameDay.clash?.when === 'today', sameDay.clash)
const noLegs = browser.aheadFacts({ asOf: '2026-11-25', days: { '2026-11-24': dayBriefOf(null, 'Tuesday', [muayThai]), '2026-11-25': dayBriefOf(pushDay, 'Wednesday', [muayThai]) } }, '2026-11-25')
check('no clash on a day not built around heavy legs', noLegs.clash === null && noLegs.todaySession?.name === 'Upper Push', noLegs)
check('a tomorrow-only brief says nothing about today', browser.aheadFacts({ asOf: '2026-11-23', days: { '2026-11-25': dayBriefOf(legDay, 'Wednesday', [muayThai]) } }, TODAY).todaySession === null)
const pat = { kind: 'stuck_lift', lift: 'Barbell Squats', weight: '80kg', sessions: 3 }
check('a pattern worked out today is read', browser.aheadFacts(ahead({ pattern: pat }), TODAY).pattern?.kind === 'stuck_lift')
check('a pattern worked out three days ago is not (stale)', browser.aheadFacts({ ...ahead({ pattern: pat }), asOf: '2026-11-21' }, TODAY).pattern === null)
check('malformed input is simply absent, never a throw', (() => {
  try {
    const bad = [null, 'x', 42, { days: 'nope' }, { days: { [TODAY]: { session: 7, hardActivities: 'Muay' } } }, { asOf: TODAY, pattern: { kind: 'stuck_lift', lift: 'x', weight: '1kg', sessions: -2 } }]
    return bad.every(x => { const r = server.aheadFacts(x, TODAY); return r.todaySession === null && r.clash === null && r.pattern === null })
  } catch { return false }
})())

console.log('\n3. The moments')
const base = {
  localHour: 9, awaitingFeel: false, plannedToday: true, loggedToday: false, missedYesterday: false, daysSinceAnyLog: 1,
  weekday: 2, weekSessionsDone: 1, weekSessionsPlanned: 3, blockJustEnded: false, beatTargetPending: false, name: 'Ashley',
}
const withAhead = (extra: Record<string, unknown> = {}) => ({ ...base, ...browser.aheadFacts(ahead(), TODAY), ...extra })
for (const [label, mod] of [['app', browser], ['server', server]] as const) {
  const m = mod.momentsToRaise(withAhead() as never)
  check(`${label}: on a clash morning the clash is raised and the plain reminder is not`, m[0]?.key === 'load_clash' && !m.some(x => x.key === 'workout_today'), m.map(x => x.key))
  check(`${label}: it names the class and the session, keeps the main lift, and offers the trim`, /Muay Thai yesterday/.test(m[0]?.text ?? '') && /Lower Body Strength/.test(m[0]?.text ?? '') && /keep Barbell Squats/.test(m[0]?.text ?? '') && /\?$/.test(m[0]?.text ?? ''), m[0]?.text)
  check(`${label}: with the yes and the easy no under it`, JSON.stringify(m[0]?.chips) === JSON.stringify(["Trim today's session", 'Keep it as is']), m[0]?.chips)
  const plain = mod.momentsToRaise({ ...base, todaySession: { name: 'Upper Push', lift: 'Barbell Bench Press', weight: '70kg' } } as never)
  check(`${label}: the plain reminder names the session and its lift`, plain[0]?.key === 'workout_today' && plain[0].text === 'Hey Ashley, Upper Push today, with Barbell Bench Press at 70kg. Ready for it?', plain[0]?.text)
  const blind = mod.momentsToRaise({ ...base } as never)
  check(`${label}: knowing nothing ahead, the reminder is the old sentence`, blind[0]?.text === 'Hey Ashley, are you ready for your session today?', blind[0]?.text)
  const afternoon = { ...base, localHour: 14, loggedToday: true, pattern: pat }
  check(`${label}: a pattern is raised in the afternoon`, mod.momentsToRaise(afternoon as never).some(x => x.key === 'pattern_spotted'))
  check(`${label}: ...never in the morning`, !mod.momentsToRaise({ ...afternoon, localHour: 10 } as never).some(x => x.key === 'pattern_spotted'))
  check(`${label}: ...and not again within a week`, !mod.momentsToRaise({ ...afternoon, daysSincePatternSaid: 6 } as never).some(x => x.key === 'pattern_spotted')
    && mod.momentsToRaise({ ...afternoon, daysSincePatternSaid: 7 } as never).some(x => x.key === 'pattern_spotted'))
  check(`${label}: its switch turns it off`, !mod.momentsToRaise(afternoon as never, { pattern_spotted: false }).some(x => x.key === 'pattern_spotted'))
  check(`${label}: nothing new in a lapse`, !mod.momentsToRaise({ ...withAhead(), daysSinceAnyLog: 5 } as never).some(x => x.key === 'load_clash'))
}
const pairs: Record<string, unknown>[] = [
  withAhead(), { ...base, localHour: 14, loggedToday: true, pattern: pat },
  { ...base, localHour: 14, loggedToday: true, pattern: { kind: 'too_hard', times: 4 } },
  { ...base, localHour: 14, loggedToday: true, pattern: { kind: 'low_protein', days: 3 } },
  { ...base, ...sameDay }, { ...base, missedYesterday: true, localHour: 13 },
]
check('the app and the server say every one of these word for word, with the same chips', pairs.every(f =>
  JSON.stringify(browser.momentsToRaise(f as never)) === JSON.stringify(server.momentsToRaise(f as never))))
const textsOf = (f: Record<string, unknown>) => browser.momentsToRaise(f as never).map(x => x.text).join(' | ')
check('the pattern sentences say the thing and end on the offer',
  /Barbell Squats has sat at 80kg for 3 sessions.*\?$/.test(textsOf(pairs[1])) && /4 lifts as too hard.*next session lighter/.test(textsOf(pairs[2])) && /short 3 days running/.test(textsOf(pairs[3])))
check('a missed day carries Move it / Let it go', JSON.stringify(browser.momentsToRaise(pairs[5] as never).find(x => x.key === 'missed_yesterday')?.chips) === '["Move it","Let it go"]')

console.log('\n4. The server')
check('a clash is a reminder of the day: yesterday\'s does not stop today\'s', mayNotify([{ moment: 'load_clash', sent_on: '2026-11-23' }], TODAY, 'load_clash') === 'ok')
check('...but never twice in one day', mayNotify([{ moment: 'load_clash', sent_on: TODAY }], TODAY, 'load_clash') === 'said_today')
check('days since a pattern was sent, from the sends', daysSinceSent([{ moment: 'pattern_spotted', sent_on: '2026-11-20' }, { moment: 'pattern_spotted', sent_on: '2026-11-10' }], 'pattern_spotted', TODAY) === 4
  && daysSinceSent([], 'pattern_spotted', TODAY) === null)
const sf = factsFor({ days_ahead: ahead() } as never, { activityDates: [], marks: {}, movedInto: [], unratedRecentSession: false, beatTargetOffered: false }, TODAY, 9, { name: 'Ashley' })
check('the server reads the days ahead off the facts row', sf.clash?.activity === 'Muay Thai' && sf.todaySession?.name === 'Lower Body Strength', { clash: sf.clash, s: sf.todaySession })
const ro = strip('supabase/functions/_shared/reach-out.ts')
check('the server passes the pattern\'s last send into the facts', /daysSincePatternSaid: daysSinceSent\(recent, 'pattern_spotted', today\)/.test(ro))
check('the chat row carries the moment\'s chips', /chips: moment\.chips/.test(ro) && /chips: message\.chips/.test(strip('supabase/functions/coach-reach-out/index.ts')))

console.log('\n5. The reminder writer')
const clashMoment = server.momentsToRaise(withAhead() as never)[0]
const clashFacts = withAhead() as never
const prompt = reminderPrompt(clashMoment, clashFacts)
check('it is told who it is (the same coach as the chat)', /sharp, upbeat, grounded/.test(prompt))
check('...and the facts: the session, the lift, the class, when', /Lower Body Strength/.test(prompt) && /Barbell Squats/.test(prompt) && /Muay Thai yesterday/.test(prompt))
check('...and that it must end on the question its buttons answer', /end on ONE short question/.test(prompt) && /"Trim today's session" \/ "Keep it as is"/.test(prompt))
check('...and never to only check in', /Never a message that only checks in/.test(prompt))
check('a greeting that fits the time passes ("Morning Ashley, ...")', checkReminder("Morning Ashley, Muay Thai yesterday and Lower Body Strength today. Want me to trim the extras and keep Barbell Squats as planned?", clashMoment, clashFacts).ok)
check('...a plain "Ashley," does not', !checkReminder("Ashley, Muay Thai yesterday and legs today. Want me to trim the extras?", clashMoment, clashFacts).ok && !GREETING.test('Ashley, hi'))
check('a message with chips that does not end on a question is refused', (() => { const r = checkReminder("Morning Ashley, Muay Thai yesterday and Lower Body Strength today, so take it steady.", clashMoment, clashFacts); return !r.ok && /question/.test(r.why) })())
check('a number it was not given is still refused', !checkReminder("Morning Ashley, Muay Thai yesterday and Lower Body Strength today. Want me to cut it to 20 minutes?", clashMoment, clashFacts).ok)
const plainMoment = server.momentsToRaise({ ...base, todaySession: { name: 'Upper Push', lift: 'Barbell Bench Press', weight: '70kg' } } as never)[0]
check('a reminder with no chips need not end on a question', checkReminder('Hey Ashley, Upper Push today with Barbell Bench Press at 70kg. Make the first set count.', plainMoment, { ...base } as never).ok)

console.log('\n6. The chat')
const row = rowToMessage({ id: 'r1', role: 'assistant', content: 'x', action_data: { source: 'reminder', moment: 'load_clash', shortcut: 'exercise', chips: ["Trim today's session", 'Keep it as is', 7, ''] } })
check('a reminder row\'s chips come back as its one-tap answers, junk dropped', JSON.stringify(row.quickReplies) === JSON.stringify(["Trim today's session", 'Keep it as is']), row.quickReplies)
check('a row without chips has none', rowToMessage({ id: 'r2', role: 'assistant', content: 'x', action_data: { source: 'reminder', moment: 'workout_today', shortcut: 'exercise' } }).quickReplies === undefined)
const msgs = [
  { role: 'assistant', content: 'a', created_at: '2026-11-19T15:00:00', reminder: { moment: 'pattern_spotted', shortcut: null } },
  { role: 'assistant', content: 'b', created_at: '2026-11-12T15:00:00', reminder: { moment: 'pattern_spotted', shortcut: null } },
  { role: 'assistant', content: 'c', created_at: '2026-11-23T15:00:00', reminder: { moment: 'workout_today', shortcut: 'exercise' } },
] as never
check('days since the chat last held the pattern message', daysSinceMomentSaid(msgs, 'pattern_spotted', TODAY) === 5 && daysSinceMomentSaid(msgs, 'comeback', TODAY) === null)
const pickBase = { now: Date.parse(`${TODAY}T09:00:00`), today: TODAY, cap: 3, unpromptedToday: 0, lastUnpromptedAt: 0, momentsSaidToday: [], said: [], event: null, greeting: 'Hey Ashley', hello: () => ({ text: 'Hey Ashley — morning.', chips: [] }) }
const clashPick = pickUnprompted({ ...pickBase, moments: browser.momentsToRaise(withAhead() as never) } as never)
check('a clash is the morning\'s hello, chips and all', clashPick?.moment === 'load_clash' && clashPick.chips.length === 2 && /Muay Thai/.test(clashPick.text), clashPick)
const helloPick = pickUnprompted({ ...pickBase, moments: browser.momentsToRaise({ ...base, todaySession: { name: 'Upper Push', lift: null, weight: null } } as never) } as never)
check('any other moment still waits behind the hello', helloPick?.moment !== 'workout_today', helloPick?.moment)
const ca = strip('src/components/ChatAssistant.tsx')
check('the chat\'s facts read the same days ahead, and the pattern\'s week', /\.\.\.aheadFacts\(proactiveData\.ahead \?\? null, proactiveData\.today\)/.test(ca) && /daysSinceMomentSaid\(messages, 'pattern_spotted'/.test(ca))
check('the chat keeps the chips on the row it writes', /chips: pick\.chips/.test(ca))

console.log('\n7. The coach\'s own instructions')
const gem = strip('supabase/functions/chat-gemini/index.ts')
const p0 = gem.indexOf('=== 0. WHO YOU ARE'); const p1 = gem.indexOf('=== 1. VOICE')
check('who it is comes first, before the voice rules', p0 > 0 && p1 > p0, { p0, p1 })
const who = gem.slice(p0, p1)
check('...sharp, upbeat, grounded; makes the call; real energy, earned', /sharp, upbeat, grounded/.test(who) && /MAKE THE CALL/.test(who) && /REAL ENERGY, EARNED/.test(who))
check('...two gears, the gym floor keyed to a part-done session', /GYM-FLOOR GEAR, when today's session is PART-DONE/.test(who) && /CHAT GEAR/.test(who))
check('...spots patterns and offers the fix', /SPOT THINGS AND SAY SO/.test(who))
const tapMap = who.slice(who.indexOf('WHEN THEY ANSWER ONE OF YOUR OWN MESSAGES'))
const named = [...tapMap.matchAll(/propose_[a-z_]+/g)].map(m => m[0])
const declared = new Set([...gem.matchAll(/name: "(propose_[a-z_]+)"/g)].map(m => m[1]))
check('every tap the reminders offer is mapped, to a tool that exists', ["Trim today's session", 'Lighten my next session', "What's the fix?", 'Help me hit it', 'Move it', 'Let it go', 'Keep it as is'].every(c => tapMap.includes(`"${c}"`))
  && named.length >= 4 && named.every(n => declared.has(n)), named.filter(n => !declared.has(n)))
const vp = voicePrompt('A long draft reply about squats.', 'how do my squats look?', null)
check('the second-pass editor shortens and never flattens', /SHORTEN, NEVER TO FLATTEN/.test(vp) && /make the call/.test(vp))

console.log('\n8. The wiring')
check('Home sends the days ahead', /daysAhead: fresh\.ahead \?\? null/.test(strip('src/components/Dashboard.tsx')))
const mf = strip('src/lib/moment-facts.ts')
check('...as the days_ahead column, dropped and retried while the column is missing', /row\.days_ahead = facts\.daysAhead/.test(mf) && /LATER_COLUMNS = \[[^\]]*'days_ahead'/.test(mf))
const mig = readdirSync('supabase/migrations').find(f => /days_ahead/.test(f))
check('the migration adds the column', !!mig && /ADD COLUMN IF NOT EXISTS days_ahead jsonb/.test(readFileSync(`supabase/migrations/${mig}`, 'utf8')))
check('Home works the days ahead out from its own plan', /dayBriefOf\(todayWorkoutDay/.test(strip('src/lib/dashboard-data.ts')) && /dayBriefOf\(tomorrowWorkoutDay/.test(strip('src/lib/dashboard-data.ts')))
check('both new switches are on the Reminders screen', /load_clash: '/.test(strip('src/lib/coach-reach-out.ts')) && /pattern_spotted: '/.test(strip('src/lib/coach-reach-out.ts')) && existsSync('src/components/RemindersSection.tsx'))

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.log(`${failures} FAILED`); process.exit(1) }
console.log('The coach knows what is coming, says it like a person, and offers an easy out.')

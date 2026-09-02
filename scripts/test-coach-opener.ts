// ---------------------------------------------------------------------------
// THE ONE THING THE COACH SAYS FIRST — and the ways an opener goes wrong.
//
// coach-opener.ts picks the first bubble of a fresh conversation from real
// state (see its header). Built from Ashley's "build it with your
// recommendations" after a generic chat blueprint was reviewed against this
// codebase. The failure modes an opener has are specific, so the checks are:
//
//   §1  priority — the thing that matters most is the thing said, and only
//       one thing is ever said
//   §2  Ashley's ruling — NO chips under the how-did-it-feel question
//   §3  every chip is a sentence the coach's existing tools can finish
//   §4  attention (the tab dot) lights for exactly the two kinds that want
//       an answer, and the wiring in ChatAssistant/App/BottomTabBar carries it
//   §5  the model-side check-in ranks a missed yesterday where it belongs
//
// Pure functions where possible; source reads for the wiring, same split as
// test-session-feel.ts.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { pickOpener, missedYesterdayFrom, type OpenerInput } from '../src/lib/coach-opener'
import { pickAccountabilityCheckIn, type AccountabilityInput } from '../src/lib/accountability'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}

const base: OpenerInput = {
  hour: 9,
  cutoffHour: 13,
  awaitingFeel: null,
  missedYesterday: null,
  todaySession: { focus: 'Push & Press', movements: 'Barbell Bench Press, Overhead Press, Dips' },
  todayLogged: false,
  tomorrowSession: { dayName: 'tomorrow', focus: 'Pull & Hinge', lead: 'Deadlifts' },
}
const restDay: OpenerInput = { ...base, todaySession: null }

console.log('\n1. Priority: the thing that matters most is the one thing said')
{
  const feel = pickOpener({ ...base, awaitingFeel: { date: '2026-09-01', day: 'Monday', isToday: false }, missedYesterday: { dayName: 'Monday', focus: 'Legs' } })
  check('an unreviewed session outranks a missed day', feel.kind === 'session_feel', feel.kind)
  check('...and names the session, so the question is specific', /Monday/.test(feel.text), feel.text)

  const missed = pickOpener({ ...base, missedYesterday: { dayName: 'Monday', focus: 'Legs & Calves' } })
  check('a missed yesterday outranks today\'s session', missed.kind === 'missed_yesterday', missed.kind)
  check('...names what was missed', /Legs & Calves/.test(missed.text), missed.text)
  // The prompt's rule for a miss, applied to the opener's own words.
  check('...and follows the no-drama rule rather than shaming', /no drama/.test(missed.text) && !/should have|failed|streak/i.test(missed.text), missed.text)

  const today = pickOpener(base)
  check('otherwise a training day ahead is the opener', today.kind === 'training_today', today.kind)
  const done = pickOpener({ ...base, hour: 20 })
  check('past the training cutoff it becomes "how did it go"', done.kind === 'training_done_today', done.kind)
  const rest = pickOpener(restDay)
  check('a rest day is the fallback', rest.kind === 'rest_day', rest.kind)
  check('...and previews the next session, with its lead lift', /Pull & Hinge/.test(rest.text) && /Deadlifts/.test(rest.text), rest.text)
  const restNoNext = pickOpener({ ...restDay, tomorrowSession: null })
  check('...but says nothing about a next session when there is none', !/leads with/.test(restNoNext.text), restNoNext.text)

  // Exactly one thing. An opener that mentions two situations is a status
  // report, and the check-in rule this is modelled on forbids stacking.
  const stacked = pickOpener({ ...base, missedYesterday: { dayName: 'Monday', focus: 'Legs' }, hour: 20 })
  check('one situation per opener — a missed day does not also get "how did today go"', !/How'd it go/.test(stacked.text), stacked.text)
}

console.log('\n2. Ashley\'s ruling: no chips under the how-did-it-feel question')
{
  for (const isToday of [true, false]) {
    const o = pickOpener({ ...base, awaitingFeel: { date: '2026-09-02', day: 'Tuesday', isToday } })
    check(`the feel question (${isToday ? 'today' : 'a past day'}) carries NO chips`, o.chips.length === 0, o.chips)
  }
  // ...and every other kind may.
  check('a missed day carries chips', pickOpener({ ...base, missedYesterday: { dayName: 'Monday', focus: 'Legs' } }).chips.length > 0)
  check('a rest day carries chips', pickOpener(restDay).chips.length > 0)
  check('a training day ahead carries the trim chip', pickOpener(base).chips.some(c => /short on time/i.test(c)))
  check('...but not mid-session — trimming a session you are in is a different conversation',
    pickOpener({ ...base, todayLogged: true }).chips.length === 0, pickOpener({ ...base, todayLogged: true }).chips)
}

console.log('\n3. Every chip is a sentence the coach\'s existing tools can finish')
{
  const chat = readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf8')
  const allChips = [
    ...pickOpener(base).chips,
    ...pickOpener(restDay).chips,
    ...pickOpener({ ...base, missedYesterday: { dayName: 'Monday', focus: 'Legs' } }).chips,
  ]
  check('chips are full sentences, not labels (they are SENT on tap)', allChips.every(c => c.split(' ').length >= 3), allChips)
  // The missed-day chips map to things that exist: training today needs no
  // tool at all, and "call yesterday a rest day" needs propose_rest_day to
  // accept a DATE — which it does. A "move it to tomorrow" chip was left out
  // on purpose: the only schedule tool changes the week permanently.
  check('propose_rest_day accepts a date, so "call yesterday a rest day" can be honoured',
    /name: "propose_rest_day"[\s\S]{0,1200}date: \{/.test(chat))
  const missedChips = pickOpener({ ...base, missedYesterday: { dayName: 'Monday', focus: 'Legs' } }).chips
  check('no chip promises a one-off reschedule the coach cannot do', !missedChips.some(c => /move|tomorrow|next/i.test(c)), missedChips)
  // The trim chip maps to propose_volume_change, direction lighter.
  check('propose_volume_change exists for the short-on-time chip', /name: "propose_volume_change"/.test(chat) && /"lighter"/.test(chat))
}

console.log('\n4. Attention: the tab dot lights for exactly the kinds that want an answer')
{
  check('an unreviewed session wants an answer', pickOpener({ ...base, awaitingFeel: { date: '2026-09-02', isToday: true } }).attention)
  check('a missed day wants an answer', pickOpener({ ...base, missedYesterday: { dayName: 'Monday', focus: 'Legs' } }).attention)
  // A dot that is on every training day is a dot nobody sees.
  check('an ordinary training day does NOT', !pickOpener(base).attention)
  check('a finished-looking training day does NOT', !pickOpener({ ...base, hour: 20 }).attention)
  check('a rest day does NOT', !pickOpener(restDay).attention)

  const chatUi = readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8')
  const app = readFileSync(join(ROOT, 'src/App.tsx'), 'utf8')
  const bar = readFileSync(join(ROOT, 'src/components/BottomTabBar.tsx'), 'utf8')
  // The same rule, stated in ChatAssistant without going through pickOpener.
  // Pinned here so the tab and the bubble cannot drift apart.
  check('ChatAssistant derives attention from the same two facts', /const hasAttention = !!feelContext\?\.awaiting \|\| !!missedYesterday/.test(chatUi))
  check('...and reports it upward', /onAttentionChange\?\.\(hasAttention\)/.test(chatUi))
  check('App receives it', /onAttentionChange=\{setChatAttention\}/.test(app))
  check('...clears it once the chat is opened', /if \(activeTab === 'chat'\) setAttentionSeen\(true\)/.test(app))
  check('...re-arms only when the condition goes away', /if \(!chatAttention\) \{ setAttentionSeen\(false\); return \}/.test(app))
  check('...and never shows the dot while already on the chat tab', /chatAttention=\{chatAttention && !attentionSeen && activeTab !== 'chat'\}/.test(app))
  check('the tab bar draws it', /data-testid="chat-attention-dot"/.test(bar))
  check('...and says so to a screen reader', /the coach has something for you/.test(bar))

  // The opener composes from the LIVE week, not the base plan, so a
  // mesocycle user is told about the right day.
  check('the opener reads the live week\'s days', /const liveWeekDays = mesocycle\.find\(w => w\.week_number === openerWeek\)\?\.days \?\? exercisePlan/.test(chatUi))
  check('...and the week strip\'s own states decide "missed"', /missedYesterdayFrom\(trainingWeek\.days, yesterdayDate, liveWeekDays\)/.test(chatUi))
  check('chips ride on the opener message', /quickReplies: opener\.chips\.length > 0 \? opener\.chips : undefined/.test(chatUi))
}

console.log('\n5. missedYesterdayFrom reads only a real miss')
{
  const plan = [{ day: 'Monday', focus: 'Legs & Calves' }, { day: 'Tuesday', focus: 'Push' }]
  const days = (state: string) => [{ date: '2026-09-01', dayName: 'Monday', state }, { date: '2026-09-02', dayName: 'Tuesday', state: 'due' }]
  check('a missed yesterday is found, with its focus', missedYesterdayFrom(days('missed'), '2026-09-01', plan)?.focus === 'Legs & Calves')
  for (const s of ['done', 'partial', 'swapped', 'rest_chosen', 'rest', 'before_plan', 'due']) {
    check(`'${s}' is not a miss`, missedYesterdayFrom(days(s), '2026-09-01', plan) === null, s)
  }
  check('a yesterday outside the week (a Monday) is not judged', missedYesterdayFrom(days('missed'), '2026-08-31', plan) === null)
}

console.log('\n6. The model-side check-in ranks a missed yesterday where it belongs')
{
  const quiet: AccountabilityInput = {
    hour: 10, proteinEaten: 0, proteinTarget: 150, caloriesEaten: 0, caloriesTarget: 2500,
    waterMl: 0, waterTargetMl: 2500, streak: 0, daysSinceWeighIn: 2,
    sessionDueUnlogged: false, setsLoggedToday: 0, setsPlannedToday: 0, onTrackForGoal: null,
  }
  const line = pickAccountabilityCheckIn({ ...quiet, missedYesterday: { dayName: 'Monday', focus: 'Legs' } })
  check('a missed yesterday produces a check-in', !!line && /Yesterday/.test(line), line)
  check('...that states the fact without a verdict', !!line && !/shame|failed|should/i.test(line), line)
  check('...and says they did not rest or swap it, so the coach does not assume', !!line && /rested or swapped/.test(line), line)
  // Ranking: below a stalled mid-session (they are training NOW), above
  // today's-unlogged (an evening fact) and above the streak.
  const stalled = pickAccountabilityCheckIn({ ...quiet, missedYesterday: { dayName: 'Monday', focus: 'Legs' }, setsPlannedToday: 20, setsLoggedToday: 6 })
  check('a stalled session in progress still outranks it', !!stalled && /part-way/.test(stalled), stalled)
  const vsStreak = pickAccountabilityCheckIn({ ...quiet, missedYesterday: { dayName: 'Monday', focus: 'Legs' }, streak: 6 })
  check('it outranks the streak line', !!vsStreak && /Yesterday/.test(vsStreak), vsStreak)
  check('nothing changes when yesterday was fine', pickAccountabilityCheckIn(quiet) === null)
}

if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log('\nOne thing said first, no chips under the question that wants a sentence, and the dot means it.\n')

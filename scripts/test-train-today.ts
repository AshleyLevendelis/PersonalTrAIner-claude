/**
 * A SESSION ON A REST DAY, ASKED FOR IN THE CHAT (28 Nov 2026, his "Add a weight session just for today", answered
 * "There's no session on Saturday to swap — it's a rest day", and his ruling "The app should be able to do whatever I
 * ask it but give reasons or advise around it"). Holds: which session the app borrows (named, missed, furthest ahead,
 * tomorrow last, a repeat when all are trained); the advice on the card; the words that turn the deployed coach's swap
 * into this card; and the wiring (one store with the screen's "Train anyway", Undo, the coach's tool and prompt).
 * The screen in verify:train-today.
 */
import { readFileSync } from 'node:fs'
import { planTrainToday, asksForWeightsSession, trainAnywayChoices } from '../src/lib/train-today'
import type { WorkoutDay } from '../src/lib/types'

let failures = 0
let ran = 0
function check(label: string, ok: boolean, extra?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — got ${JSON.stringify(extra)}` : ''}`) }
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

const W = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const plan = (sessions: Record<string, string>): WorkoutDay[] => W.map(day => ({
  day, focus: sessions[day] ?? 'Rest', exercises: sessions[day] ? [{ name: 'Back Squat' }] : [],
} as unknown as WorkoutDay))
/** The week Mon 14 - Sun 20 Sep 2026; states given by weekday, the rest 'rest' or 'due'. */
const week = (p: WorkoutDay[], states: Record<string, string>) => W.map((dayName, i) => ({
  date: `2026-09-${String(14 + i).padStart(2, '0')}`, dayName,
  state: states[dayName] ?? (p.find(d => d.day === dayName)!.exercises.length ? 'due' : 'rest'),
}))
const run = (sessions: Record<string, string>, today: string, states: Record<string, string>, named?: string) => {
  const p = plan(sessions)
  return planTrainToday({ plan: p, todayName: today, todayDate: `2026-09-${String(14 + W.indexOf(today)).padStart(2, '0')}`, week: week(p, states), todayHasSession: false, named })
}
const pick = (r: ReturnType<typeof planTrainToday>) => (r.ok ? `${r.day}:${r.why}` : `no:${r.reason}`)
const text = (r: ReturnType<typeof planTrainToday>) => (r.ok ? r.advice.join(' | ') : r.reason)

console.log('\n1. Which session today borrows')
const four = { Monday: 'Lower Strength', Tuesday: 'Upper Push', Thursday: 'Lower Hinge', Friday: 'Upper Pull' }
const missed = run(four, 'Wednesday', { Monday: 'missed', Tuesday: 'done' })
check('a session MISSED this week comes first (Monday, missed; Tuesday done)', pick(missed) === 'Monday:missed', pick(missed))
const twoMissed = run({ ...four, Sunday: 'Conditioning' }, 'Saturday', { Monday: 'missed', Tuesday: 'missed', Thursday: 'done', Friday: 'done' })
check('...the most recent of two missed (Tuesday over Monday)', pick(twoMissed) === 'Tuesday:missed', pick(twoMissed))
const spread = run({ Monday: 'A', Thursday: 'B', Friday: 'C', Sunday: 'D' }, 'Tuesday', { Monday: 'done' })
check('nothing missed: the session whose own day is FURTHEST away (Sunday, of Thursday, Friday, Sunday)', pick(spread) === 'Sunday:ahead', pick(spread))
const skipTomorrow = run({ Monday: 'A', Tuesday: 'B', Thursday: 'C', Saturday: 'D' }, 'Wednesday', { Monday: 'done', Tuesday: 'done' })
check("tomorrow's is passed over while another is open (Saturday, not Thursday)", pick(skipTomorrow) === 'Saturday:ahead', pick(skipTomorrow))
const onlyTomorrow = run({ Monday: 'A', Tuesday: 'B', Thursday: 'C' }, 'Wednesday', { Monday: 'done', Tuesday: 'done' })
check("tomorrow's only when nothing else is left", pick(onlyTomorrow) === 'Thursday:tomorrow', pick(onlyTomorrow))
const allDone = run({ Monday: 'A', Tuesday: 'B', Thursday: 'C' }, 'Friday', { Monday: 'done', Tuesday: 'partial', Thursday: 'done' })
check('every session trained: never a refusal, the one trained longest ago comes round (Monday)', pick(allDone) === 'Monday:repeat', pick(allDone))
const namedDay = run(four, 'Wednesday', { Monday: 'missed', Tuesday: 'done' }, "Friday's")
check('a weekday he names wins over the missed one', pick(namedDay) === 'Friday:named', pick(namedDay))
const namedFocus = run(four, 'Wednesday', { Monday: 'missed', Tuesday: 'done' }, 'an upper pull session')
check('a session he names by what it is ("upper pull") is found', pick(namedFocus) === 'Friday:named', pick(namedFocus))
const namedDone = run(four, 'Wednesday', { Monday: 'missed', Tuesday: 'done' }, 'tuesday')
check('a named session already trained is still given, as a repeat', pick(namedDone) === 'Tuesday:repeat', pick(namedDone))
const namedTomorrow = run(four, 'Wednesday', { Monday: 'missed', Tuesday: 'done' }, 'thursday')
check("a named tomorrow's session says it is tomorrow's", pick(namedTomorrow) === 'Thursday:tomorrow', pick(namedTomorrow))
const has = planTrainToday({ plan: plan(four), todayName: 'Monday', todayDate: '2026-09-14', week: week(plan(four), {}), todayHasSession: true, todayFocus: 'Lower Strength' })
check('the one "no": today already has a session, and it says which', !has.ok && /already has Lower Strength/.test(has.reason), pick(has))
const none = run({}, 'Wednesday', {})
check('a plan with no sessions says so', !none.ok && /no weights sessions/.test(none.reason), pick(none))

console.log('\n2. The advice on the card')
check('it names the rest day and the session it costs recovery before (tomorrow\'s Lower Hinge)', /planned rest day[\s\S]*less recovery before tomorrow's Lower Hinge/.test(text(missed)), text(missed))
check('a made-up session says it makes up the missed one', /makes up Monday's session, which you missed/.test(text(missed)), text(missed))
check('an early one says to rest on its own day', /Saturday's session done early, so on Saturday you can rest instead/.test(text(skipTomorrow)), text(skipTomorrow))
check("tomorrow's says to take tomorrow as the rest", /take tomorrow as your rest/.test(text(onlyTomorrow)), text(onlyTomorrow))
check('a repeat says it is extra work on a full week', /extra work on top of a full week/.test(text(allDone)), text(allDone))
check('the lighter choice is always there', [missed, spread, onlyTomorrow, allDone].every(r => /20 to 30 minute walk/.test(text(r))))
check('and that the plan does not change', [missed, allDone].every(r => /Just today: your plan doesn't change/.test(text(r))))
check('the next session named is a DIFFERENT day from the one borrowed (Sunday borrowed: Thursday next)', /before Thursday's B|before B on Thursday/.test(text(spread)) || /before B on Thursday/.test(text(spread)), text(spread))
check('the card lead names the day and session', missed.ok && missed.lead === "do Monday's **Lower Strength** today", missed.ok ? missed.lead : null)

console.log('\n3. The words that turn the old coach\'s swap into this card')
for (const s of ['Add a weight session just for today', 'can I lift today?', 'give me a gym session today', 'I want to train today'])
  check(`"${s}" asks for weights`, asksForWeightsSession(s))
for (const s of ['I want to go for a run today', 'a swim instead', 'yoga class tonight', 'a cardio session today'])
  check(`"${s}" does not`, !asksForWeightsSession(s))

console.log('\n4. The wiring')
const chat = strip(readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
const confirmAt = chat.indexOf("row.kind === 'propose_train_today'")
check('Apply writes the borrow through the screen\'s own store (writeBorrowedDay)', confirmAt > 0 && /writeBorrowedDay\(profile\.id, payload\.date, payload\.day\)/.test(chat.slice(confirmAt, confirmAt + 700)))
const undoAt = chat.indexOf("row.kind === 'propose_train_today'", confirmAt + 10)
check('Undo puts back the borrow before it, and keeps sets already logged', undoAt > 0 && /activeSession\.logs\.length > 0/.test(chat.slice(undoAt, undoAt + 500)) && /writeBorrowedDay\(profile\.id, payload\.date, payload\.previous\)/.test(chat.slice(undoAt, undoAt + 700)))
const swapAt = chat.indexOf("result.proposal.kind === 'propose_session_activity_swap'")
const swapBranch = chat.slice(swapAt, swapAt + 1800)
check('the old coach\'s swap on a rest day becomes the borrow card when he asked for weights', /asksForWeightsSession\(/.test(swapBranch) && /kindOverride = 'propose_train_today'/.test(swapBranch))
check('the dead end "There\'s no session on that day to swap" is gone', !/There's no session on that day to swap/.test(chat))
const panel = strip(readFileSync('src/components/exercise/TodayPanel.tsx', 'utf8'))
check('Exercise re-reads the borrow when the coach makes one', /subscribeBorrowedDay\(\(\) => setBorrowedDayState\(readBorrowedDay\(profileId, today\)\)\)/.test(panel))
const fn = readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8')
check('the coach has the tool and a handler that returns its card', /name: "propose_train_today"/.test(fn) && /if \(name === "propose_train_today"\)[\s\S]{0,400}kind: "propose_train_today"/.test(fn))
check('the coach is told his ruling: offer with the reason, never "I can\'t" alone', /whatever I ask it but give reasons or advise around it/.test(fn) && /"I can't" and "there's nothing to change" are never the whole reply/.test(fn))

console.log('\n5. The screen\'s "Train anyway": every session, a done one as a repeat, with the reason')
{
  const p = plan(four)
  const c = trainAnywayChoices({ plan: p, todayName: 'Wednesday', todayDate: '2026-09-16', week: week(p, { Monday: 'missed', Tuesday: 'done' }) })
  check('not yet trained first (Monday, Thursday, Friday), then the done one (Tuesday)', c.options.map(o => o.day).join() === 'Monday,Thursday,Friday,Tuesday', c.options.map(o => o.day))
  check('the done one is a repeat, and says so', c.options[3]?.repeat === true && /Tuesday · Upper Push · done, repeat it/.test(c.options[3]?.label ?? ''), c.options[3])
  check('the others are not', c.options.slice(0, 3).every(o => !o.repeat))
  check('today\'s own day is never offered', !c.options.some(o => o.day === 'Wednesday'))
  // A day whose own session moved away holds a session in its plan row: it is still not offered onto itself.
  const moved = trainAnywayChoices({ plan: p, todayName: 'Monday', todayDate: '2026-09-14', week: week(p, { Monday: 'moved' }) })
  check('...even when its plan row holds a session (a moved-away Monday is not offered Monday\'s)', moved.options.length === 3 && !moved.options.some(o => o.day === 'Monday'), moved.options.map(o => o.day))
  check('the advice is the coach card\'s first line', /^Today is a planned rest day\. Training is fine if you feel fresh; the cost is less recovery before tomorrow's Lower Hinge\.$/.test(c.advice ?? ''), c.advice)
  const all = trainAnywayChoices({ plan: p, todayName: 'Saturday', todayDate: '2026-09-19', week: week(p, { Monday: 'done', Tuesday: 'done', Thursday: 'done', Friday: 'partial' }) })
  check('ALL DONE: still four choices (was none, and the button vanished), every one a repeat', all.options.length === 4 && all.options.every(o => o.repeat), all.options)
  const none = trainAnywayChoices({ plan: plan({}), todayName: 'Saturday', todayDate: '2026-09-19', week: week(plan({}), {}) })
  check('a plan with no sessions offers nothing and no advice', none.options.length === 0 && none.advice === null)
  const card = readFileSync('src/components/exercise/RestDayCard.tsx', 'utf8')
  const n = (card.match(/<TrainAnyway options=/g) ?? []).length
  check('the rest, recovery and moved-away cards all carry it', n === 3, n)
  check('the advice is drawn above the choices', /train-anyway-advice[\s\S]{0,400}train-anyway-option/.test(card))
}

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.error(`${failures} FAILED`); process.exit(1) }
console.log('A rest day takes a session when he asks, with the reasons on the card.')

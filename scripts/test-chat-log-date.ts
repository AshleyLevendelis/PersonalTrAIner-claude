/**
 * WHICH DAY A WORKOUT TOLD TO THE CHAT BELONGS TO (19 Nov 2026).
 *
 * "I did squats yesterday, 3x8 at 50" reached the app with yesterday's date, the date was dropped, and the sets were
 * written onto TODAY. Found by tracing the path. The day is now decided in one pure function (chat-log-date.ts) and
 * an earlier day is written to that day, the way the Exercise screen's "I did it, not in the app" writes it.
 *
 * Not proven here: the write on a real screen and in the database. That is verify:chat-log-words §5-7.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { logDayFor, refusalToTakeOff } from '../src/lib/chat-log-date'
import { LOG_WORDS } from '../src/lib/coach-voice'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
let ran = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}
// THIRTEEN HOURS AHEAD OF GREENWICH, ON PURPOSE. The day is worked out from the date STRINGS, so it must be the same
// answer in every time zone; a version that read the dates as local instants agrees with it in London and is a day out
// here (found by a missed mutation, 19 Nov 2026: this machine runs on Greenwich time, where the two cannot differ).
process.env.TZ = 'Pacific/Auckland'
const TODAY = '2026-11-18' // a Wednesday

check('the checks really are running far from Greenwich (so a time-zone slip can show)', new Date('2026-11-18T00:00:00').getTimezoneOffset() <= -720, new Date('2026-11-18T00:00:00').getTimezoneOffset())
console.log('\n1. Today, or no date: exactly as before')
check('no date is today', logDayFor(null, TODAY).kind === 'today' && logDayFor(undefined, TODAY).kind === 'today' && logDayFor('', TODAY).kind === 'today' && logDayFor('  ', TODAY).kind === 'today')
check("today's own date is today", logDayFor(TODAY, TODAY).kind === 'today')

console.log('\n2. Any earlier day is THAT day (two weeks until 28 Nov 2026; his "whatever they want" widened it)')
const y = logDayFor('2026-11-17', TODAY)
check('yesterday is a past day, with its date kept', y.kind === 'past' && y.date === '2026-11-17', y)
check('...its weekday is the date\'s own, not today\'s', y.kind === 'past' && y.dayName === 'Tuesday', y)
check('...and it is said as a day he can recognise', y.kind === 'past' && y.label === 'Tuesday 17 Nov', y)
const edge = logDayFor('2026-11-04', TODAY)
check('14 days back is allowed', edge.kind === 'past' && edge.dayName === 'Wednesday' && edge.label === 'Wednesday 4 Nov', edge)
const fifteen = logDayFor('2026-11-03', TODAY)
check('15 days back is allowed too (it was refused before 28 Nov)', fifteen.kind === 'past' && fifteen.label === 'Tuesday 3 Nov', fifteen)
const months = logDayFor('2026-08-12', TODAY)
check('three months back is that day', months.kind === 'past' && months.date === '2026-08-12' && months.label === 'Wednesday 12 Aug', months)
const lastYear = logDayFor('2025-11-18', TODAY)
check('a year back names its year, so a mistyped year shows where it went', lastYear.kind === 'past' && lastYear.label === 'Tuesday 18 Nov 2025', lastYear)
check('a card names a day inside the last week by its weekday', y.kind === 'past' && y.words === 'Tuesday' && logDayFor('2026-11-12', TODAY).kind === 'past' && (logDayFor('2026-11-12', TODAY) as { words: string }).words === 'Thursday')
check('...and a day a week or more back by its date (a bare weekday would be the wrong week)', logDayFor('2026-11-11', TODAY).kind === 'past' && (logDayFor('2026-11-11', TODAY) as { words: string }).words === 'Wednesday 11 Nov' && fifteen.kind === 'past' && fifteen.words === 'Tuesday 3 Nov')
const overMonth = logDayFor('2026-10-30', '2026-11-02')
check('a day across a month end keeps its own month and weekday', overMonth.kind === 'past' && overMonth.label === 'Friday 30 Oct', overMonth)
const overYear = logDayFor('2026-12-31', '2027-01-02')
check('...and across a year end', overYear.kind === 'past' && overYear.label === 'Thursday 31 Dec', overYear)
// A clock change sits between these two dates in the UK and most of Europe: a count of milliseconds gets it wrong.
const overClock = logDayFor('2026-10-24', '2026-10-26')
check('two days apart across a clock change is two days, and a Saturday', overClock.kind === 'past' && overClock.dayName === 'Saturday', overClock)

console.log('\n3. Anything else is refused, and says nothing was logged')
const tomorrow = logDayFor('2026-11-19', TODAY)
check('a day that has not happened is refused', tomorrow.kind === 'refused' && /hasn't happened yet/.test(tomorrow.say) && /nothing was logged/.test(tomorrow.say), tomorrow)
for (const bad of ['yesterday', 'Tuesday', '17/11/2026', '2026-13-01', '2026-02-31', '2026-11-1']) {
  const r = logDayFor(bad, TODAY)
  check(`"${bad}" is not a date the app will guess at: refused`, r.kind === 'refused' && /couldn't tell which day/.test(r.say), r)
}
check('no refusal sends him to a screen or blames him', [tomorrow, logDayFor('yesterday', TODAY)].every(r => r.kind === 'refused' && !/tap|open|go to|rephrase|in your own words/i.test(r.say)))

const PLAN = '2026-09-01'
const before = logDayFor('2026-08-31', TODAY, PLAN)
check('a day before the plan began is refused, naming the plan\'s first day, nothing logged', before.kind === 'refused' && /before your plan began on Tuesday 1 Sep/.test(before.say) && /nothing was logged/.test(before.say), before)
check('...the plan\'s first day itself is allowed', logDayFor(PLAN, TODAY, PLAN).kind === 'past')
check('...and a wrong year (a year back, plan this autumn) is refused, not written', logDayFor('2025-11-17', TODAY, PLAN).kind === 'refused')
check('taking a log off says nothing was CHANGED, and asks for a day', refusalToTakeOff(before.kind === 'refused' ? before.say : '').includes('nothing was changed') && /nothing logged on it to take off/.test(refusalToTakeOff(tomorrow.kind === 'refused' ? tomorrow.say : '')) && /I'll look/.test(refusalToTakeOff("I couldn't tell which day that was, so nothing was logged.")))

console.log('\n4. The chat obeys it')
const chat = readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const at = chat.indexOf('if (result.logWorkout) {')
const branch = chat.slice(at, at + 1200)
check('the date the coach passed is read, against the app\'s own today', /const day = chatLogDay\(result\.logWorkout\.date\)/.test(branch), branch.slice(0, 300))
const helper = chat.slice(chat.indexOf('const chatLogDay ='), chat.indexOf('const chatLogDay =') + 260)
check('the one rule reads the date AS SENT (no regex fallback to today), today, and the plan\'s first day', /const chatLogDay = \(raw: unknown\) => logDayFor\(typeof raw === 'string' \? raw : null, activeSession\.date, planStartDate\(planCreatedAt \?\? profile\.created_at\)\)/.test(helper), helper)
check('a refused day returns its sentence before anything is parsed or written', /if \(day\.kind === 'refused'\) return \{ text: day\.say \}/.test(branch) && branch.indexOf("day.kind === 'refused'") < branch.indexOf('resolveAndMaybeLog('))
check('a past day is handed to the past-day write, and awaited', /resolveAndMaybeLog\(entries, [^)]*, day\.kind === 'past' \? day : null\)/.test(branch) && /return logged\.past \? await logToPastDay\(logged\.past\.groups, logged\.past\.day\) : logged/.test(branch))
const past = chat.slice(chat.indexOf('const logToPastDay = async'), chat.indexOf('const handleClarificationChoice'))
check('the past-day write never touches today\'s session', past.length > 500 && !/activeSession\.logSet|activeSession\.date|activeSession\.dayName|activeSession\.liveWeek/.test(past), past.match(/activeSession\.\w+/g))
check('...it reads the sets already on that day first, so new sets go AFTER them', /getSetsForDates\(profileId, \[day\.date\]\)/.test(past) && /setsFor: \(id, name\) => existing\.filter/.test(past) && past.indexOf('getSetsForDates') < past.indexOf('executeLogWorkout('))
check('...writes the day\'s session, its sets, then marks the day done, in that order',
  past.indexOf('ensureSessionSynced(profileId, day.date') > 0 && past.indexOf('ensureSessionSynced(') < past.indexOf('writeHistoricalSession(') && past.indexOf('writeHistoricalSession(') < past.indexOf('markSessionCompleted('))
check('...every set is stamped on that day, never now', /completedAt: `\$\{day\.date\}T12:00:00`/.test(past) && !/completedAt: new Date\(\)/.test(past))
check('...and a failed write is said, not claimed', /catch \{ setsSaved = false \}/.test(past) && /saved \? LOG_WORDS\.loggedOn\(day\.label\) : LOG_WORDS\.notLoggedOn\(day\.label\)/.test(past))
check('...and its rows carry no note about TODAY\'s plan', /rows: saved \? rows\.map\(r => \(\{ label: r\.label, detail: r\.detail \}\)\) : \[\]/.test(past))
check('the plan week is the DATE\'s week, not today\'s', /getActiveMesocycleWeek\(planCreatedAt \?\? profile\.created_at, new Date\(`\$\{day\.date\}T12:00:00`\), weeks\)/.test(past))
check('a follow-up answer keeps the day the question was about', /pastDay \}/.test(chat) && /resolveAndMaybeLog\(updatedEntries, session\.correctsPrevious, said, session\.pastDay \?\? null\)/.test(chat) && /first\.past \? await logToPastDay\(first\.past\.groups, first\.past\.day\) : first/.test(chat))
check('the words name the day', LOG_WORDS.loggedOn('Tuesday 17 Nov') === "Got it, that's logged on Tuesday 17 Nov." && /nothing was added to Tuesday 17 Nov/.test(LOG_WORDS.notLoggedOn('Tuesday 17 Nov')) && LOG_WORDS.pastTitle('Tuesday 17 Nov', true) === 'Logged · Tuesday 17 Nov' && LOG_WORDS.pastTitle('Tuesday 17 Nov', false) === 'Not logged · Tuesday 17 Nov')

console.log('\n5. The coach\'s other logging cards ask the same function (fix 20, 28 Nov 2026)')
const body = (start: string, end: string) => { const a = chat.indexOf(start); const b = chat.indexOf(end, a + 1); return a >= 0 && b > a ? chat.slice(a, b) : '' }
const cardio = body('const buildCardioLogProposal', 'const buildCircuitLogProposal')
const circuit = body('const buildCircuitLogProposal', 'const missedMoveOffer')
const removal = body('const buildCardioRemoveProposal', 'const buildMissedSessionProposal')
for (const [name, b] of [['one cardio activity', cardio], ['a circuit', circuit], ['taking a log off', removal]] as const) {
  check(`${name}: a written date never falls back to today (the 19 Nov defect)`, b.length > 300 && !/rawArgs\.date\) \? rawArgs\.date : activeSession\.date/.test(b) && /const date = when\.kind === 'past' \? when\.date : activeSession\.date/.test(b))
  check(`${name}: no day window of its own (no -7, -14, LOG_BACK_DAYS or addDays back)`, !/< -(7|14)\b|LOG_BACK_DAYS|addDays\([^)]*-\d+\)/.test(b))
}
check('taking a log off decides the day BEFORE it reads the log', removal.indexOf("when.kind === 'refused'") > 0 && removal.indexOf("when.kind === 'refused'") < removal.indexOf('getCardioLogsForDateMerged('))
check('...and says "I can\'t see", never "there\'s nothing" (a failed read falls back to 60 days on the phone)', /I can't see anything logged/.test(removal) && !/There's nothing logged/.test(removal))
const confirm = chat.slice(chat.indexOf("row.kind === 'propose_cardio_log'"), chat.indexOf("row.kind === 'propose_circuit_log'", chat.indexOf("row.kind === 'propose_cardio_log'")))
check('the knee question asks only about an ease-off that had begun by the day of the run', /easeOffQuestion\(payload\.activityName, activeAdaptations\.filter\(a => \(planStartDate\(a\.starts_at\) \?\? ''\) <= payload\.date\)/.test(confirm), confirm.slice(0, 200))
check('a circuit said to be "instead" that cannot count says so on the card', /else if \(rawArgs\.replaced_session === true\) implications\.push/.test(circuit))
for (const [name, b, key] of [['one cardio activity', cardio, 'refusal'], ['a circuit', circuit, 'refusal'], ['taking a log off', removal, 'reason']] as const) {
  check(`${name}: the day is decided by the chat's one rule`, b.length > 300 && /const when = chatLogDay\(rawArgs\.date\)/.test(b), b.slice(0, 200))
  check(`${name}: a refused day returns before anything else is read`, new RegExp(`if \\(when\\.kind === 'refused'\\) return \\{ ok: false, ${key}:`).test(b) && b.indexOf("when.kind === 'refused'") < b.indexOf('return {\n      ok: true'))
  check(`${name}: no "last week" or "two weeks" wording left`, !/from the last week|last two weeks/.test(b))
}
check('a card further back than a week names the date, not a bare weekday', /when\.kind === 'past' \? when\.words/.test(cardio) && /when\.kind === 'past' \? when\.words/.test(circuit) && /: when\.words/.test(removal))

console.log(`\nchat-log-date: ${ran} checks ran`)
if (failures > 0) { console.error(`chat-log-date: ${failures} check(s) FAILED`); process.exit(1) }
console.log('chat-log-date: all checks passed')

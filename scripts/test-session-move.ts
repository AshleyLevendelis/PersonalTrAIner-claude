// ---------------------------------------------------------------------------
// "I'LL DO IT TOMORROW" — THE RULES, BEFORE ANY SCREEN READS THEM.
//
// Measured before this existed (8 Sep 2026, classifyDay directly): saying it
// recorded nothing, so Tuesday's Push & Press showed MISSED on Wednesday
// morning and counted against the week, while Wednesday still resolved to its
// own Pull & Hinge — the session appeared on no day at all.
//
// Ashley's ruling, 8 Sep, chosen over "put it on tomorrow anyway, two sessions
// that day" and "don't move it, just stop the black mark": PUT IT ON THE NEXT
// FREE DAY, AND SAY SO. Both halves are checked here — the landing, and the
// saying, since a move that silently lands two days later is the same class of
// surprise as the one that lands nowhere.
// ---------------------------------------------------------------------------
import {
  resolveMoveTarget, sessionForDate, hasSessionOn, dayNameOf, addDays, daysBetween,
  type SessionMove,
} from '../src/lib/session-move'
import { classifyDay, countsTowardWeekTally } from '../src/hooks/useTrainingWeek'
import type { WorkoutDay } from '../src/lib/types'
import { readFileSync } from 'fs'

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}

const lifting = (day: string, focus: string): WorkoutDay =>
  ({ day, focus, exercises: [{ name: 'Barbell Bench Press', sets: 3, reps: '6-8', rest: '180s', substitution: 'x' }] }) as unknown as WorkoutDay
const walkDay = (day: string): WorkoutDay => ({ day, focus: 'Walk', exercises: [] }) as unknown as WorkoutDay

// Monday / Tuesday / Thursday / Saturday, the harness's own shape. Wednesday
// is a walk (prescribed, but no lifting); Friday and Sunday are absent.
const plan: WorkoutDay[] = [
  lifting('Monday', 'Full Body Power'),
  lifting('Tuesday', 'Push & Press'),
  walkDay('Wednesday'),
  lifting('Thursday', 'Pull & Hinge'),
  lifting('Saturday', 'Squat & Carry'),
]
// 2026-09-07 is a Monday, so 08 Tue, 09 Wed, 10 Thu, 11 Fri, 12 Sat, 13 Sun.
const MON = '2026-09-07', TUE = '2026-09-08', WED = '2026-09-09'
const THU = '2026-09-10', FRI = '2026-09-11', SAT = '2026-09-12', SUN = '2026-09-13'
/** One mesocycle week, Monday to Sunday — the shape the strip already draws. */
const weekOf = (d: string) => (daysBetween(MON, d) < 0 ? 0 : daysBetween(MON, d) > 6 ? 2 : 1)

// ---------------------------------------------------------------------------
console.log('\n[1] The calendar helpers, because everything below rests on them')
// ---------------------------------------------------------------------------
check('a date knows its own weekday', dayNameOf(TUE) === 'Tuesday' && dayNameOf(SUN) === 'Sunday', [dayNameOf(TUE), dayNameOf(SUN)])
check('...read at midday, so no timezone can shift the day it lands on',
  /T12:00:00/.test(readFileSync('src/lib/session-move.ts', 'utf8')))
check('adding days crosses a month end', addDays('2026-09-30', 1) === '2026-10-01', addDays('2026-09-30', 1))
check('...and a year end', addDays('2026-12-31', 1) === '2027-01-01', addDays('2026-12-31', 1))
check('the gap between two dates is signed', daysBetween(TUE, THU) === 2 && daysBetween(THU, TUE) === -2)
check('a lifting day has a session', hasSessionOn(plan, 'Tuesday'))
check('a walk day does NOT — nothing to move, and nothing in the way',
  !hasSessionOn(plan, 'Wednesday'))
check('a day the plan never mentions does not either', !hasSessionOn(plan, 'Sunday'))

// ---------------------------------------------------------------------------
console.log('\n[2] "I\'ll do it tomorrow" when tomorrow is free')
// ---------------------------------------------------------------------------
const easy = resolveMoveTarget({ fromDate: TUE, requestedDate: WED, todayDate: TUE, plan, weekOf })
check('it lands on the day she asked for', easy.ok && easy.date === WED, easy)
check('...named as that day', easy.ok && easy.dayName === 'Wednesday', easy)
check('...and it says so was the day she wanted, so the coach need not explain',
  easy.ok && easy.asWanted === true, easy)

// ---------------------------------------------------------------------------
console.log('\n[3] Ashley\'s ruling: tomorrow is busy, so take the next free day')
// ---------------------------------------------------------------------------
// Wednesday is a walk day and therefore free. Move Wednesday out of the way to
// make tomorrow genuinely busy: Tuesday -> Wednesday is fine, so ask about
// MONDAY's session going to Tuesday, which already has Push & Press.
const busy = resolveMoveTarget({ fromDate: MON, requestedDate: TUE, todayDate: MON, plan, weekOf })
check('it does NOT stack two sessions on the day she named', busy.ok && busy.date !== TUE, busy)
check('...it takes the next genuinely free day instead', busy.ok && busy.date === WED, busy)
check('...and says the day she asked for was not the one', busy.ok && busy.asWanted === false, busy)
check('...naming that day, so the coach can explain rather than surprise her',
  busy.ok && busy.requestedDayName === 'Tuesday', busy)

// ---------------------------------------------------------------------------
console.log('\n[4] No day named at all — "I\'ll do it later in the week"')
// ---------------------------------------------------------------------------
const soonest = resolveMoveTarget({ fromDate: TUE, requestedDate: null, todayDate: TUE, plan, weekOf })
check('it takes the soonest free day', soonest.ok && soonest.date === WED, soonest)
check('...and does not claim to be the day she wanted, because she named none',
  soonest.ok && soonest.asWanted === false, soonest)

// ---------------------------------------------------------------------------
console.log('\n[5] The two rules that stop a move making a mess')
// ---------------------------------------------------------------------------
// Every remaining day of the week already has a session on it.
const packed: WorkoutDay[] = [
  lifting('Monday', 'A'), lifting('Tuesday', 'B'), lifting('Wednesday', 'C'),
  lifting('Thursday', 'D'), lifting('Friday', 'E'), lifting('Saturday', 'F'), lifting('Sunday', 'G'),
]
const nowhere = resolveMoveTarget({ fromDate: TUE, requestedDate: WED, todayDate: TUE, plan: packed, weekOf })
check('a week with no free day refuses rather than doubling one up',
  !nowhere.ok && nowhere.reason === 'no_free_day', nowhere)
check('...and says why, in words a person can act on',
  !nowhere.ok && /no free day/i.test(nowhere.message), nowhere)

// The plan repeats weekly, so next Wednesday already holds its own copy of
// every session. A move that crossed the boundary would put Push & Press on
// the calendar twice at two different prescribed loads.
const nextWeek = resolveMoveTarget({ fromDate: SAT, requestedDate: addDays(SAT, 2), todayDate: SAT, plan, weekOf })
check('a move never crosses into the next plan week',
  !nextWeek.ok && nextWeek.reason === 'no_free_day', nextWeek)
// Sunday is free and in the same week, so Saturday CAN move — one day, not two.
const sunday = resolveMoveTarget({ fromDate: SAT, requestedDate: SUN, todayDate: SAT, plan, weekOf })
check('...but a free day inside the same week is still reachable',
  sunday.ok && sunday.date === SUN, sunday)

// ---------------------------------------------------------------------------
console.log('\n[6] Refusals that are about the day, not the calendar')
// ---------------------------------------------------------------------------
const nothingThere = resolveMoveTarget({ fromDate: WED, requestedDate: THU, todayDate: WED, plan, weekOf })
check('a day with no lifting on it has nothing to move',
  !nothingThere.ok && nothingThere.reason === 'no_session', nothingThere)
check('...and says which day it means', !nothingThere.ok && /Wednesday/.test(nothingThere.message), nothingThere)

const already: SessionMove[] = [{ fromDate: TUE, toDate: WED }]
const twice = resolveMoveTarget({ fromDate: TUE, requestedDate: THU, todayDate: TUE, plan, weekOf, existing: already })
check('a session already moved is not moved again silently',
  !twice.ok && twice.reason === 'already_moved', twice)
check('...and the refusal names where it went', !twice.ok && /Wednesday/.test(twice.message), twice)

// Two moves must not stack on the one free day either.
const secondMove = resolveMoveTarget({ fromDate: MON, requestedDate: WED, todayDate: MON, plan, weekOf, existing: already })
check('a day already receiving a move is not free for a second one',
  secondMove.ok === false || (secondMove.ok && secondMove.date !== WED), secondMove)

// ---------------------------------------------------------------------------
console.log('\n[7] Never into the past')
// ---------------------------------------------------------------------------
// Yesterday's session, asked about today. Today is Wednesday; Wednesday is a
// walk day, so today itself is free and is the right answer.
const yesterday = resolveMoveTarget({ fromDate: TUE, requestedDate: null, todayDate: WED, plan, weekOf })
check('yesterday\'s session can be run today when today is free',
  yesterday.ok && yesterday.date === WED, yesterday)
check('...and never earlier than today', yesterday.ok && daysBetween(WED, yesterday.date) >= 0, yesterday)
// A day she names that has already gone is scanned past, not refused.
const staleAsk = resolveMoveTarget({ fromDate: MON, requestedDate: TUE, todayDate: THU, plan, weekOf })
check('a day she names that has already gone is scanned past, not refused',
  staleAsk.ok && daysBetween(THU, staleAsk.date) > 0, staleAsk)
check('...landing on the next free day from today', staleAsk.ok && staleAsk.date === FRI, staleAsk)

// ---------------------------------------------------------------------------
console.log('\n[8] What each day then shows')
// ---------------------------------------------------------------------------
const moves: SessionMove[] = [{ fromDate: TUE, toDate: WED }]
const origin = sessionForDate({ date: TUE, plan, moves })
check('the day it came from has nothing left to do', origin.day === null, origin)
check('...and knows where it went', origin.movedTo?.dayName === 'Wednesday', origin)
check('...and is not itself a destination', origin.movedFrom === null, origin)

const target = sessionForDate({ date: WED, plan, moves })
check('the day it went to runs that session', target.day?.focus === 'Push & Press', target)
check('...called by the day it came FROM, not the day it landed on',
  target.movedFrom?.dayName === 'Tuesday' && target.movedFrom?.date === TUE, target)
check('...and its own walk day does not also appear', target.day?.focus !== 'Walk', target)

const untouched = sessionForDate({ date: THU, plan, moves })
check('every other day is exactly what the plan says', untouched.day?.focus === 'Pull & Hinge', untouched)
check('...with no move on it either way', untouched.movedFrom === null && untouched.movedTo === null, untouched)

const noMoves = sessionForDate({ date: TUE, plan, moves: [] })
check('and with no moves at all, nothing changes about any day',
  noMoves.day?.focus === 'Push & Press' && noMoves.movedTo === null, noMoves)

// ---------------------------------------------------------------------------
console.log('\n[9] The week strip, from classifyDay itself')
// ---------------------------------------------------------------------------
const dashDay = (over: Record<string, unknown> = {}) =>
  ({ date: '', metric: null, nutrition: null, session: null, exercises: [], workoutLogs: [], cardioLogs: [], ...over }) as never

// Origin: Tuesday, seen from Thursday. Without the move this is the 'missed'
// the whole feature exists to stop.
check('without the move, the origin is missed — the measurement this began from',
  classifyDay('Tuesday', TUE, THU, plan, undefined, MON) === 'missed',
  classifyDay('Tuesday', TUE, THU, plan, undefined, MON))
check('with the move, it is moved, not missed',
  classifyDay('Tuesday', TUE, THU, plan, undefined, MON, moves) === 'moved',
  classifyDay('Tuesday', TUE, THU, plan, undefined, MON, moves))
check('...and it does not count against her week',
  !countsTowardWeekTally('moved'))

// Target: Wednesday is a walk day, so without the move it is 'recovery' and
// owes nothing. With the move it is a training day that is due.
check('without the move, the target owes nothing',
  classifyDay('Wednesday', WED, TUE, plan, undefined, MON) === 'recovery',
  classifyDay('Wednesday', WED, TUE, plan, undefined, MON))
check('with the move, the target is a training day',
  classifyDay('Wednesday', WED, TUE, plan, undefined, MON, moves) === 'due',
  classifyDay('Wednesday', WED, TUE, plan, undefined, MON, moves))
check('...so the week still owes exactly the same number of sessions',
  countsTowardWeekTally('due') && !countsTowardWeekTally('moved'))

// Logged work outranks the move, exactly as it outranks a swap and a chosen
// rest: someone who said they would move it and trained anyway earned the tick.
const trained = dashDay({ session: { is_completed: true }, workoutLogs: [{ id: 'x' }] })
check('training it anyway still counts as done',
  classifyDay('Tuesday', TUE, THU, plan, trained, MON, moves) === 'done',
  classifyDay('Tuesday', TUE, THU, plan, trained, MON, moves))
const partial = dashDay({ session: { is_completed: false }, workoutLogs: [{ id: 'x' }] })
check('...and part-training it still reads as part-done',
  classifyDay('Tuesday', TUE, THU, plan, partial, MON, moves) === 'partial',
  classifyDay('Tuesday', TUE, THU, plan, partial, MON, moves))

check('no moves at all leaves every day classified exactly as before',
  classifyDay('Tuesday', TUE, THU, plan, undefined, MON, []) === 'missed'
  && classifyDay('Wednesday', WED, TUE, plan, undefined, MON, []) === 'recovery')

// ---------------------------------------------------------------------------
console.log('\n[10] Every screen through the one resolver, and the tool behind it')
// ---------------------------------------------------------------------------
const src = (f: string) => readFileSync(f, 'utf8')
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const hook = strip(src('src/hooks/useTrainingWeek.ts'))
check('the hook reads both ends of a move, not only the in-window origins',
  /getSessionMovesInRange\(profileId, from, to\)/.test(hook))
check('...and one failing read cannot blank the whole strip',
  /getSessionMovesInRange\(profileId, from, to\)\.catch\(/.test(hook))
check('...and hands the moves to classifyDay', /classifyDay\([^)]*, moves\)/.test(hook))

const panel = strip(src('src/components/exercise/TodayPanel.tsx'))
check('the Exercise tab takes today from the same hook, not its own plan lookup',
  /const workout = \(todayCell\?\.session \?\? undefined\) \?\?/.test(panel))
check('...and a moved-away day keeps an honest button rather than "Start workout"',
  /swappedToday \|\| movedAwayTo \? 'Train it anyway' : 'Start workout'/.test(panel))
check('...and says where the session went',
  /data-testid="moved-away"[\s\S]{0,240}You moved today&apos;s session to/.test(panel))
check('...and says where an arriving one came from',
  /data-testid="moved-in"[\s\S]{0,240}s session, moved here\./.test(panel))

const home = strip(src('src/lib/dashboard-data.ts'))
check('Home resolves today through the same module',
  /const todayResolved = sessionForDate\(\{ date: todayStr, plan: activeWeekDays, moves \}\)/.test(home))
check('...and tomorrow too, so a move onto tomorrow is not announced as rest',
  /const tomorrowResolved = sessionForDate\(\{ date: tomorrowStr, plan: exercisePlan, moves \}\)/.test(home))

const opener = strip(src('src/lib/coach-opener.ts'))
check('the opener has a branch for a moved session',
  /kind: 'session_moved'/.test(opener))
check("...ranked above the rest-day fallback, so it never says \"it's a rest day\" about a day she moved",
  opener.indexOf("kind: 'session_moved'") < opener.indexOf("kind: 'rest_day'"))

const ctx = strip(src('src/lib/chat-plan-context.ts'))
check('the coach is TOLD about a move rather than left to infer it',
  /THEY MOVED IT TO \$\{today\.movedTo\.dayName\.toUpperCase\(\)\}/.test(ctx))
check('...and told when today is the receiving end', /MOVED TO TODAY at their request/.test(ctx))

const fn = strip(src('supabase/functions/chat-gemini/index.ts'))
check('the tool exists', /name: "propose_session_move"/.test(fn))
check('...and PROPOSES rather than writing — nothing lands without a tap',
  /kind: "propose_session_move",[\s\S]{0,200}rawArgs:/.test(fn))
check('...and the server does not pick the day',
  /rawArgs: \{ from_date: args\.from_date, to_date: args\.to_date, reason: args\.reason \}/.test(fn))
check('the prompt distinguishes it from a rest and from a swap',
  /IS A MOVE, NOT A REST AND NOT A SWAP/.test(fn))
check('...and the old "there is no tool for it" rule is corrected rather than left standing',
  /THE EXCEPTION, added 8 Sep 2026/.test(fn))

const chat = strip(src('src/components/ChatAssistant.tsx'))
check('the card is built against the LIVE plan, not the model\'s args',
  /const target = resolveMoveTarget\(\{/.test(chat))
check('...and a refusal says which of the four things went wrong',
  /else refusal = move\.reason/.test(chat))
check('the confirm branch writes the move', /await executeSessionMove\(profile, payload\)/.test(chat))
check('...and undo clears it', /await undoSessionMove\(profile\.id, row\.payload/.test(chat))

const exec = strip(src('src/lib/pending-action-executor.ts'))
check('the write is reported honestly — a failed save is not a moved session',
  /if \(!ok\) \{[\s\S]{0,200}Couldn't move that session/.test(exec))
check('undo clears the column rather than writing a second fact',
  /await setSessionMove\(profileId, payload\.fromDate, null\)/.test(exec))

console.log(failures === 0 ? `\nAll session-move checks passed.\n` : `\n${failures} check(s) FAILED.\n`)
process.exit(failures === 0 ? 0 : 1)

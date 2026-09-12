// ---------------------------------------------------------------------------
// A MOVED SESSION MUST NOT GET STUCK ON THE DAY IT LANDED ON.
//
// Ashley, 9 Sep 2026 18:41, from the live app. She moved Tuesday's Push & Press
// to Wednesday — card correct, confirmed. Then, on Wednesday:
//
//   her  I missed todays session
//   app  There's no session on Wednesday to move — that day is already clear.
//   her  Tuesdays session was moved to today
//   app  There's no session on Wednesday to move — that day is already clear.
//   her  Tuesdays session was moved to today
//   app  There's no session on Wednesday to move — that day is already clear.
//
// THE CAUSE. `session-move.ts` holds two answers to "what runs on this date".
// `sessionForDate` is move-aware; `hasSessionOn(plan, dayName)` is the naive
// `plan.find(d => d.day === dayName)` that sessionForDate's own doc comment
// says it was written to replace — "the right answer only for a day nothing
// has happened to". Home, the week strip and the Exercise tab all adopted it.
// Three places never did, and each failed differently:
//
//   resolveMoveTarget          -> "already clear"                (her screenshot)
//   buildSessionMoveProposal   -> "There's no session on X to move." (behind it)
//   buildRestDayProposal       -> null, SILENTLY                 (nothing said)
//
// So a moved session could not be moved again, she could not say she had
// missed it, and marking that day as a rest quietly did nothing.
//
// ASHLEY'S RULING, 9 Sep 2026, asked as "should a twice-missed session move
// again, or should the app offer to drop it": ASK, AND LET HER CHOOSE. Naming
// a day IS the answer — asking again once she has said "Friday" would be the
// same loop in a politer voice.
//
// Every check below is her sequence or a neighbour of it, run against the real
// resolver. The naive-lookup checks are last and deliberately blunt: if any of
// the three comes back, this file fails.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { resolveMoveTarget, sessionForDate, dayNameOf, daysBetween } from '../src/lib/session-move'
import type { WorkoutDay } from '../src/lib/types'

let failures = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { console.log(`  ✓ ${label}`); return }
  failures++
  console.log(`  ✗ ${label}${detail === undefined ? '' : `\n      ${JSON.stringify(detail)}`}`)
}

const lift = [{ name: 'Overhead Press' }] as unknown as WorkoutDay['exercises']
/** Mon/Tue/Thu/Sat train; Wed/Fri/Sun are rest rows — a row that exists and has no exercises. */
const PLAN = [
  { day: 'Monday', focus: 'Lower', exercises: lift },
  { day: 'Tuesday', focus: 'Push & Press', exercises: lift },
  { day: 'Wednesday', focus: 'Rest', exercises: [] },
  { day: 'Thursday', focus: 'Pull & Hinge', exercises: lift },
  { day: 'Friday', focus: 'Rest', exercises: [] },
  { day: 'Saturday', focus: 'Full body', exercises: lift },
  { day: 'Sunday', focus: 'Rest', exercises: [] },
] as unknown as WorkoutDay[]

const MON = '2026-09-07', TUE = '2026-09-08', WED = '2026-09-09'
const THU = '2026-09-10', FRI = '2026-09-11', SAT = '2026-09-12', SUN = '2026-09-13'
const weekOf = () => 1
const move = (o: Partial<Parameters<typeof resolveMoveTarget>[0]>) =>
  resolveMoveTarget({ fromDate: TUE, requestedDate: null, todayDate: TUE, plan: PLAN, weekOf, existing: [], ...o })

console.log('\n1. Her sequence, exactly')
const step1 = move({ fromDate: TUE, requestedDate: WED, todayDate: TUE })
check('Tuesday moves to Wednesday, as she asked', step1.ok && step1.date === WED, step1)

const AFTER = [{ fromDate: TUE, toDate: WED }]
const onWed = sessionForDate({ date: WED, plan: PLAN, moves: AFTER })
check('the session really is on Wednesday now', onWed.day?.focus === 'Push & Press', onWed.day?.focus)
check('...and the app knows it came from Tuesday', onWed.movedFrom?.dayName === 'Tuesday', onWed.movedFrom)

const step3 = move({ fromDate: WED, requestedDate: null, todayDate: WED, existing: AFTER })
check('"I missed todays session" is NO LONGER refused as clear',
  !(step3.ok === false && step3.reason === 'no_session'), step3)
check('...it asks instead', step3.ok === false && step3.reason === 'moved_in', step3)
if (step3.ok === false && step3.reason === 'moved_in') {
  check('...naming the session by the day it came FROM', step3.originDayName === 'Tuesday', step3.originDayName)
  check('...offering the next free day', step3.nextFree?.dayName === 'Friday', step3.nextFree)
  check('...and offering to drop it, saying what dropping MEANS rather than just "drop it"',
    /drop it and take today off/i.test(step3.message), step3.message)
  check('...carrying the move that put it here, so a re-move updates it',
    step3.arrivedBy.fromDate === TUE && step3.arrivedBy.toDate === WED, step3.arrivedBy)
  check('...and never saying the day is clear', !/already clear/i.test(step3.message), step3.message)
}

console.log('\n2. Naming a day IS the answer — asking twice is the loop we removed')
const answered = move({ fromDate: WED, requestedDate: FRI, todayDate: WED, existing: AFTER })
check('"move it to Friday" goes through', answered.ok && answered.date === FRI, answered)
check('...and rewrites the ORIGINAL move rather than chaining a second one',
  answered.ok && answered.remapFrom === TUE, answered)

console.log('\n3. The fix did not simply turn the guard off')
const genuinelyClear = move({ fromDate: FRI, requestedDate: null, todayDate: FRI, existing: [] })
check('a day the plan never asked for still says "already clear"',
  genuinelyClear.ok === false && genuinelyClear.reason === 'no_session'
    && /already clear/.test(genuinelyClear.message), genuinelyClear)

// THE DAY THE SESSION LEFT — a question since 11 Sep 2026, not a dead end.
// It used to answer "Tuesday's session is already moved to Wednesday." and
// stop there. Ashley hit that on the live app: naming Tuesday refused twice,
// with nothing to tap, and the only wording that worked was naming WEDNESDAY,
// which she had no way to know. Asked to choose, she picked "tell me where it
// is, then offer" over moving it straight away.
//
// The property, not the sentence: it still says where the session went, and
// it now also offers a day and a way out. Anchoring on the old words is what
// made this check fail rather than pass when the behaviour improved.
const leftAlready = move({ fromDate: TUE, requestedDate: null, todayDate: TUE, existing: AFTER })
check('a day whose session has LEFT still says where it went',
  leftAlready.ok === false && leftAlready.reason === 'already_moved'
    && /Wednesday/.test(leftAlready.message), leftAlready)
check('...and names it in a field, not only in prose',
  leftAlready.ok === false && leftAlready.reason === 'already_moved'
    && leftAlready.movedTo.dayName === 'Wednesday', leftAlready)
check('...and is a question now — it offers a day to move it to',
  leftAlready.ok === false && leftAlready.reason === 'already_moved'
    && !!leftAlready.nextFree && leftAlready.nextFree.dayName !== 'Tuesday', leftAlready)
check('...and offers taking the day it SITS on off, not the day it left',
  leftAlready.ok === false && /take Wednesday off/i.test(leftAlready.message), leftAlready)

// Naming a day that is already taken is answered, not silently redirected.
const wantsTakenDay = move({ fromDate: TUE, requestedDate: MON, todayDate: TUE, existing: AFTER })
check('naming a day that already has a session says so',
  wantsTakenDay.ok === false && wantsTakenDay.reason === 'already_moved'
    && wantsTakenDay.requestedDayName === 'Monday'
    && /Monday already has a session/.test(wantsTakenDay.message), wantsTakenDay)

// AND THE WAY OUT ACTUALLY WORKS. The chip the client builds names the day
// the session SITS on; sending that must go through rather than ask again,
// and must rewrite the original move rather than chain a second one.
const viaChip = move({ fromDate: WED, requestedDate: FRI, todayDate: TUE, existing: AFTER })
check('the day it sits on, with a day named, goes straight through', viaChip.ok, viaChip)
check('...rewriting the original move rather than stacking one',
  viaChip.ok && viaChip.remapFrom === TUE, viaChip)

console.log('\n4. An ordinary move still works — the rest-day rows are not "occupied"')
// The first rewrite of the free-day scan asked `!resolved.day`, which is TRUE
// for a rest day (its row exists and carries no exercises) — so every rest day
// looked occupied and an ordinary move was refused outright. Caught by the
// probe, not by reading, which is why it is pinned here.
const ordinary = move({ fromDate: MON, requestedDate: null, todayDate: MON, existing: [] })
check('Monday moves onto the next free day', ordinary.ok, ordinary)
check('...which is a rest day, not a training day',
  ordinary.ok && PLAN.find(d => d.day === dayNameOf(ordinary.date))?.exercises.length === 0, ordinary)

console.log('\n5. Nothing is moved onto a day that already holds a moved-in session')
const twoMoves = move({ fromDate: THU, requestedDate: WED, todayDate: THU, existing: AFTER })
check('Wednesday is occupied by Tuesday\'s session, so Thursday does not land there',
  !(twoMoves.ok && twoMoves.date === WED), twoMoves)

console.log('\n6. The question comes with its two answers as buttons')
// A question with no buttons under it makes her TYPE the answer, which is the
// part of the old loop that was tiring even when the words were right. The
// chips are built in the client builder, from this outcome, and ride the
// [QUICK_REPLIES] channel every other chip in the chat uses.
{
  // Sunday, holding Saturday's session, with the week ending under it — the
  // one case where the app has nothing to offer but the drop. Note the weekOf
  // here is the REAL Mon-Sun shape rather than this file's `() => 1`, which
  // would let the scan wander into next week and always find a free day.
  //
  // My first attempt at this fixture stacked three moves to fill the week and
  // proved nothing: moving a day's session AWAY frees that day, so the scan
  // found Thursday and the check failed on its own fixture rather than on the
  // code.
  const weekEndsSunday = (d: string) => (daysBetween(MON, d) <= 6 ? 1 : 2)
  const nowhere = move({
    fromDate: SUN, requestedDate: null, todayDate: SUN,
    weekOf: weekEndsSunday, existing: [{ fromDate: SAT, toDate: SUN }],
  })
  check('with no free day left it still asks rather than refusing',
    nowhere.ok === false && nowhere.reason === 'moved_in', nowhere)
  if (nowhere.ok === false && nowhere.reason === 'moved_in') {
    check('...offering nothing it cannot do', nowhere.nextFree === null, nowhere.nextFree)
    check('...and still saying what dropping means',
      /no free day left/.test(nowhere.message) && /take today off/i.test(nowhere.message), nowhere.message)
  }
}

console.log('\n7. All three naive lookups are gone')
// COMMENTS STRIPPED FROM BOTH, and the first version of this file did not
// strip session-move.ts — so "no longer asks hasSessionOn" was satisfied by
// the COMMENT explaining that it no longer asks hasSessionOn. That is the
// exact trap CLAUDE.md warns about, fallen into on the day it was written.
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const moveSrc = strip(readFileSync('src/lib/session-move.ts', 'utf8'))
const chatSrc = strip(readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
const resolver = moveSrc.slice(moveSrc.indexOf('export function resolveMoveTarget'), moveSrc.indexOf('export interface ResolvedDay'))
// The rest-day builder only — `exercisePlan.find(d => d.day === dayName)` is a
// fine lookup elsewhere in this file, so banning it globally would fail on an
// unrelated call site and prove nothing about this one.
const restBuilder = chatSrc.slice(chatSrc.indexOf('const buildRestDayProposal'), chatSrc.indexOf('const buildSessionMoveProposal'))
check('resolveMoveTarget asks sessionForDate for the origin',
  /const resolved = sessionForDate\(\{ date: fromDate/.test(resolver), null)
check('...and hasSessionOn is gone from the module entirely',
  !/export function hasSessionOn/.test(moveSrc) && !/hasSessionOn\(/.test(resolver), null)
check('the move card resolves the origin through sessionForDate',
  /const originResolved = sessionForDate\(\{ date: fromDate/.test(chatSrc), null)
check('...and no longer looks the day up in the plan directly',
  !/liveWeekDays\.find\(d => d\.day === fromDayName\)/.test(chatSrc), null)
check('the rest-day card resolves its day through sessionForDate',
  /const resolvedRest = sessionForDate\(\{ date: raw/.test(restBuilder), null)
check('...and no longer looks the day up in the plan directly',
  restBuilder.length > 200 && !/exercisePlan\.find\(d => d\.day === dayName\)/.test(restBuilder),
  restBuilder.length)
// THE FIFTH ONE, found 12 Sep 2026. The header of this section says "all
// three", and there were more: the component's own walk for "what is the next
// session" was `liveWeekDays.find(x => x.day === name && x.exercises.length > 0)`,
// so on the day Ashley moved her Sunday session to Monday it skipped Monday —
// a rest row in the plan — and told the coach the next session was Tuesday's,
// in the same paragraph that said the session was owed on Monday. Pinned as a
// property here; what it RETURNS is driven directly in test:coach-plan-context
// §8, because the walk now lives in a module a gate can call.
check('the next-session walk asks the resolver rather than the plan row',
  /nextSessionAfter\(\{ date: activeSession\.date, plan: liveWeekDays, moves: trainingWeek\.moves \}\)/.test(chatSrc)
  && !/liveWeekDays\.find\(x => x\.day === name/.test(chatSrc), null)
check("the coach's week rows are the resolved ones, so a moved day cannot list a session",
  /week: trainingWeek\.loading \? null : trainingWeek\.days/.test(chatSrc), null)

// THE SIXTH, found 12 Sep 2026 from a screenshot: Full Program showed the
// session on Saturday with the TODAY badge and Rest on Sunday, after a move
// the chat had confirmed. ProgramBrowse had never read a move at all — the
// report called it a stale cache, and there was no cache: just
// `days.find(d => d.day === dayName)` deciding every row. What it RENDERS is
// driven by verify:program-move; these pin that it asks at all, and that it
// only asks for the LIVE week (a move is a fact about dates, not an edit to
// week 9's template).
const programSrc = strip(readFileSync('src/components/exercise/ProgramBrowse.tsx', 'utf8'))
check('the program view resolves its days through the training week',
  /useTrainingWeek\(profileId, todayDate, liveDays/.test(programSrc), null)
check('...and only applies moves while browsing the LIVE week',
  /browsingLiveWeek = browseWeek === liveWeek/.test(programSrc)
  && /browsingLiveWeek && !trainingWeek\.loading/.test(programSrc), null)
check('...taking the session from the resolver before the plan row',
  /movedTo \? undefined : \(cell\?\.session \?\? days\.find/.test(programSrc), null)
check('...and it is fed a refresh token, so a move made in chat reaches it',
  /refreshToken\?: number/.test(programSrc)
  && /refreshToken=\{logsVersion\}/.test(strip(readFileSync('src/components/exercise/ExerciseTab.tsx', 'utf8'))), null)

check('the move card writes the TRUE origin, not the day it was sitting on',
  /fromDate: trueFromDate/.test(chatSrc) && /const trueFromDate = target\.remapFrom \?\? fromDate/.test(chatSrc), null)
// The chips, at their source. Pinned as "the moved-in refusal carries a
// QUICK_REPLIES tag naming the free day and the day off" rather than on the
// literal sentence, so rewording the chips does not fail this and REMOVING
// them does.
const moveBuilder = chatSrc.slice(chatSrc.indexOf('const buildSessionMoveProposal'), chatSrc.indexOf('const buildIntentProposal'))
check('the moved-in question carries its answers as chips',
  /target\.reason === 'moved_in'/.test(moveBuilder) && /\[QUICK_REPLIES: \$\{chips/.test(moveBuilder), null)
check('...one of which names the free day the app just offered',
  /target\.nextFree \? \[`Move it to \$\{target\.nextFree\.dayName\}`\]/.test(moveBuilder), null)
check('...and one takes the day off, which is what dropping it does',
  /off instead`/.test(moveBuilder), null)
check('...while every other refusal stays a plain sentence, with nothing to tap',
  /chips\.length > 0[\s\S]{0,120}: target\.message/.test(moveBuilder), null)

// THE SAME TWO ANSWERS FOR THE DAY THE SESSION LEFT — 11 Sep 2026. Pinned on
// the property that matters: the chips name the day the session SITS on, not
// the day being asked about. A chip naming the origin would come straight
// back to this same question, which is the loop the 9 Sep ruling removed.
check('the day-it-left question carries its answers as chips too',
  /target\.reason === 'already_moved'/.test(moveBuilder), null)
check('...and the move chip names where the session SITS, not the day asked about',
  /Move \$\{target\.movedTo\.dayName\}'s session to \$\{target\.nextFree\.dayName\}/.test(moveBuilder), null)
check('...and the other takes that same day off',
  /Take \$\{target\.movedTo\.dayName\} off instead/.test(moveBuilder), null)

// THE PEEK, which is what actually told Ashley the move had not worked. The
// property: it resolves the day through the same week the strip is drawn
// from, and never straight off the plan's weekday row.
const panel = strip(readFileSync('src/components/exercise/TodayPanel.tsx', 'utf8'))
check('the peek asks the resolved week, not the plan row',
  /weekTrain\.days\.find\(d => d\.dayName === peekDay\)/.test(panel), null)
check('...and shows where the session went when the day is a move ORIGIN',
  /peekMovedTo/.test(panel) && /peek-moved-away/.test(panel), null)
check('...and labels a peeked day by the day peeked, not by the session it holds',
  /dayLabel=\{peekDay\}/.test(panel), null)
check('...saying which day a moved-in session came from',
  /movedFromDayName=\{peekCell\?\.movedFrom\?\.dayName \?\? null\}/.test(panel), null)

console.log(failures === 0 ? '\nA moved session can still be moved, or dropped.\n' : `\n${failures} check(s) failed.\n`)
process.exit(failures === 0 ? 0 : 1)

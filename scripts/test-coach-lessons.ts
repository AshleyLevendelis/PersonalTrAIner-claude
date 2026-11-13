/**
 * test:coach-lessons — LESSONS THAT BUILD OVER TIME (Ashley's ruling 6 Nov 2026,
 * "A why on every answer", plus lessons taught when her own week makes them
 * relevant, never repeated). docs/plans/coach-persona.md.
 *
 *   1. The choice: her week decides which, at most one a day, never one taught.
 *   2. The list: every lesson can be reached, ids are unique, and no point
 *      carries a number (the coach never quotes a figure the app did not show).
 *   3. The marker: only the lesson the app OFFERED is recorded, and she never
 *      sees the marker, on the chat or in the server's copy.
 *   4. The record: the lesson rides on the coach message's stored row, and a
 *      lesson record is never drawn as a plan change.
 *   5. The wiring: the chat sends the brief, records only a completed reply,
 *      and offers nothing until it has read what was taught.
 *   6. The coach is told how to teach it, once, and how to mark it.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  LESSONS, lessonDue, lessonBrief, lessonTaughtIn, taughtFromRows, actionDataWithLesson, type LessonFacts,
} from '../src/lib/coach-lessons'
import { cleanReplyText } from '../src/lib/reply-text'
import { rowToMessage } from '../src/lib/chat-history-merge'

const ROOT = process.cwd()
let ran = 0, failures = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const QUIET: LessonFacts = {
  isDeload: false, isCalibrationWeek: false, planIsNew: false, sessionDueToday: false, trainedToday: false,
  restDayToday: false, recentBest: false, weeksOnPlan: null, goal: null, weightFalling: false,
}
const NOW = new Date(2026, 10, 6, 18, 0) // 6 Nov 2026, 6pm local
const YESTERDAY = new Date(2026, 10, 5, 9, 0).toISOString()
const THIS_MORNING = new Date(2026, 10, 6, 8, 0).toISOString()

console.log('\n1. HER WEEK DECIDES WHICH, AT MOST ONE A DAY, NEVER ONE TAUGHT\n')
check('nothing in her week, nothing offered', lessonDue(QUIET, [], NOW) === null)
check('a lighter week offers the lighter-week lesson', lessonDue({ ...QUIET, isDeload: true }, [], NOW)?.id === 'deload')
// N > 1 candidates: the order is the choice. A rest day in a lighter week is both.
check('...and it comes before a rest-day lesson the same day (priority order)',
  lessonDue({ ...QUIET, isDeload: true, restDayToday: true }, [], NOW)?.id === 'deload')
check('once taught (yesterday), the next one due is offered instead',
  lessonDue({ ...QUIET, isDeload: true, restDayToday: true }, [{ id: 'deload', at: YESTERDAY }], NOW)?.id === 'rest-days')
check('a lesson taught TODAY means no second lesson today, whatever else is due',
  lessonDue({ ...QUIET, isDeload: true, restDayToday: true }, [{ id: 'consistency', at: THIS_MORNING }], NOW) === null)
check('everything due already taught, nothing offered',
  lessonDue({ ...QUIET, isDeload: true }, [{ id: 'deload', at: YESTERDAY }], NOW) === null)
check('two weeks on plan offers the consistency lesson; one does not (weeks on plan, his 13 Nov ruling)',
  lessonDue({ ...QUIET, weeksOnPlan: 2 }, [], NOW)?.id === 'consistency' && lessonDue({ ...QUIET, weeksOnPlan: 1 }, [], NOW) === null)
check('keeping muscle while losing fat needs BOTH the fat-loss goal and a falling weight',
  lessonDue({ ...QUIET, goal: 'fat_loss', weightFalling: true }, [], NOW)?.id === 'protein-in-a-deficit'
    && lessonDue({ ...QUIET, goal: 'fat_loss' }, [], NOW) === null
    && lessonDue({ ...QUIET, goal: 'hypertrophy', weightFalling: true }, [], NOW) === null)

console.log('\n2. THE LIST\n')
const ids = LESSONS.map(l => l.id)
check('every id is unique', new Set(ids).size === ids.length, ids)
check('there are at least ten lessons', LESSONS.length >= 10, LESSONS.length)
// Each lesson reachable: some fact set makes it the one offered, given the ones before it taught.
const facts: LessonFacts[] = [
  { ...QUIET, isDeload: true }, { ...QUIET, isCalibrationWeek: true }, { ...QUIET, planIsNew: true },
  { ...QUIET, restDayToday: true }, { ...QUIET, sessionDueToday: true }, { ...QUIET, trainedToday: true },
  { ...QUIET, recentBest: true }, { ...QUIET, weeksOnPlan: 5 }, { ...QUIET, goal: 'fat_loss', weightFalling: true },
  { ...QUIET, goal: 'fat_loss', restDayToday: true },
]
const unreachable = LESSONS.filter(l => !facts.some(f => {
  const taughtBefore = LESSONS.slice(0, LESSONS.indexOf(l)).map(x => ({ id: x.id, at: YESTERDAY }))
  return lessonDue(f, taughtBefore, NOW)?.id === l.id
})).map(l => l.id)
check('every lesson can be reached by some week', unreachable.length === 0, unreachable)
check('no lesson point carries a number (the coach never quotes a figure the app did not show)',
  LESSONS.every(l => !/\d/.test(l.point)), LESSONS.filter(l => /\d/.test(l.point)).map(l => l.id))
check('every point is short: at most three sentences and 260 characters',
  LESSONS.every(l => l.point.split(/[.!?](\s|$)/).filter(x => x && x.trim()).length <= 3 && l.point.length <= 260),
  LESSONS.filter(l => l.point.length > 260).map(l => l.id))

console.log('\n3. THE MARKER: ONLY THE OFFERED LESSON, NEVER SEEN\n')
const reply = "Lighter week, on purpose.\n[BREAK]\nThe strength is still there, the tiredness is what clears.\n[LESSON: deload]"
check('the marker for the offered lesson is recorded', lessonTaughtIn(reply, 'deload') === 'deload')
check('...a marker for a lesson the app did NOT offer is ignored', lessonTaughtIn(reply, 'rest-days') === null)
check('...and nothing is recorded when nothing was offered', lessonTaughtIn(reply, null) === null)
check('a reply with no marker records nothing', lessonTaughtIn('Lighter week, on purpose.', 'deload') === null)
const shown = cleanReplyText(reply)
check('she never sees the marker (the chat\'s clean-up)', !/LESSON/i.test(shown) && /tiredness is what clears\.$/.test(shown), shown)
const serverCopy = readFileSync(join(ROOT, 'supabase/functions/_shared/reply-text.ts'), 'utf8')
check('...nor in the server\'s copy, which saves the reply and texts it to her phone',
  /LESSON_MARK_RE = \/\\\[LESSON:/.test(serverCopy) && /\.replace\(LESSON_MARK_RE, ''\)/.test(strip(serverCopy)))

console.log('\n4. THE RECORD RIDES ON THE MESSAGE THAT TAUGHT IT\n')
check('no action, a lesson: the row carries the lesson alone', JSON.stringify(actionDataWithLesson(null, 'deload')) === '{"source":"lesson","lesson":"deload"}')
const logWeight = { type: 'log_weight' as const, weight_kg: 70 }
check('an action and a lesson: the action as it was, the lesson beside it',
  JSON.stringify(actionDataWithLesson(logWeight, 'deload')) === '{"type":"log_weight","weight_kg":70,"lesson":"deload"}')
check('no lesson: the action untouched, or nothing', actionDataWithLesson(logWeight, null) === logWeight && actionDataWithLesson(null, null) === null)
const rows = [
  { action_data: { source: 'lesson', lesson: 'deload' }, created_at: YESTERDAY },
  { action_data: { type: 'log_weight', weight_kg: 70, lesson: 'rest-days' }, created_at: THIS_MORNING },
  { action_data: { source: 'lesson', lesson: 'not-a-lesson' }, created_at: YESTERDAY },
  { action_data: { source: 'reminder', moment: 'streak' }, created_at: YESTERDAY },
  { action_data: null, created_at: YESTERDAY },
]
const taught = taughtFromRows(rows)
check('what was taught is read back from the rows, unknown ids ignored', JSON.stringify(taught.map(t => t.id)) === '["deload","rest-days"]', taught)
check('a lesson record is never drawn as a plan change', rowToMessage({ id: 'a', role: 'assistant', content: 'x', action_data: rows[0].action_data }).action === undefined)
check('...while a real action with a lesson beside it is still the action',
  (rowToMessage({ id: 'b', role: 'assistant', content: 'x', action_data: rows[1].action_data }).action as { type?: string } | undefined)?.type === 'log_weight')
const brief = lessonBrief(LESSONS[0], taught)
check('the brief names the lesson to teach with its id, and what is already taught by title',
  /LESSON TO TEACH \(id deload/.test(brief) && /Already taught, never repeat/.test(brief) && /why rest days count/.test(brief), brief)
check('nothing due and nothing taught: an empty brief', lessonBrief(null, []) === '')

console.log('\n5. THE CHAT\'S WIRING\n')
const chat = strip(readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8'))
check('the coach is sent the brief for this turn', /lesson_brief: lessonForThisTurn\(/.test(chat))
check('...worked out by lessonDue from her week and what was taught', /const due = lessonDue\(\{[\s\S]{0,900}\}, taughtLessons, now\)/.test(chat))
check('nothing is offered until what was taught has been read (a failed read offers none)',
  /useState<TaughtLesson\[\] \| null>\(null\)/.test(chat) && /if \(!taughtLessons\) \{ offeredLessonRef\.current = null; return '' \}/.test(chat)
    && /if \(!live \|\| error\) return/.test(chat))
check('what was taught is read from the coach\'s own rows', /from\('chat_messages'\)\.select\('action_data, created_at'\)[\s\S]{0,200}\.eq\('role', 'assistant'\)/.test(chat) && /taughtFromRows\(/.test(chat))
check('the reply is recorded only against the lesson offered', /lessonTaughtIn\(responseText!, offeredLessonRef\.current\)/.test(chat) && /lessonTaughtIn\(processed\.text, offeredLessonRef\.current\)/.test(chat))
check('...and only for a reply that completed', /finalizePlaceholder\(placeholderId, cleanedText, finalStatus, action, finalStatus === 'complete' \? lessonTaught : null\)/.test(chat))
check('the stored row carries it through actionDataWithLesson', /action_data: actionDataWithLesson\(action, lesson\)/.test(chat))

console.log('\n6. THE COACH IS TOLD HOW\n')
const prompt = readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf8')
check('the lessons section reads the brief', /=== 1-LEARN\. LESSONS THAT BUILD OVER TIME/.test(prompt) && /\$\{context\.lesson_brief \?/.test(prompt))
check('...teach it once, in one or two short lines, tied to them, never announced',
  /teach it ONCE in this conversation, in your own words, in one or two short lines/.test(prompt) && /never announce/.test(prompt))
check('...mark it, and never mark one not taught or not given',
  /put \[LESSON: <its id>\] on its own line/.test(prompt) && /Never write the marker for a lesson you did not teach, and never for any id not given above/.test(prompt))
check('...and leave it when the moment is wrong', /If their message is upsetting, urgent, or about something else entirely, leave the lesson/.test(prompt))

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.log(`coach lessons: ${failures} check(s) failed`); process.exit(1) }
console.log('coach lessons: all checks passed')

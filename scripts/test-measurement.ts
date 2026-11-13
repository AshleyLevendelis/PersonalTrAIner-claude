/**
 * test:measurement — his strategy of 13 Nov 2026, slice 1 (docs/plans/measurement.md): the facts the rest is judged by
 * are KEPT, and one reader reads them.
 *   1. which coach moment a message of his answers (the newest of the last 12 hours, never a stale or older one);
 *   2. the week-by-week reader: sessions, days logged (a day once), moments sent and answered, retention at weeks 1, 4
 *      and 12 only once that week has ended;
 *   3. "ignored N times running" for slice 2 (a send still inside its window is not yet ignored);
 *   4. the wiring: the chat records each unprompted message it writes, a message he sends answers one, a shortcut tap
 *      answers its own; the phone's reminder server records each reminder a phone took; the log is its own table, so
 *      Clear chat cannot take it; the migration has the four owner policies.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
process.env.TZ = 'Europe/London'

let ran = 0, failures = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}
const ROOT = process.cwd()
const src = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

async function main() {
  const { answerTarget, ANSWER_WINDOW_MS } = await import('../src/lib/moment-log')
  const { readEngagement, ignoredRun, weekOf } = await import('../src/lib/engagement')
  const H = 3600 * 1000
  const now = Date.parse('2026-09-16T12:00:00Z')
  const at = (h: number) => new Date(now - h * H).toISOString()

  console.log('\n1. Which moment a message of his answers')
  check('the newest moment of the last 12 hours, unanswered', answerTarget([{ id: 'a', sent_at: at(30), answered_at: null }, { id: 'b', sent_at: at(2), answered_at: null }], now) === 'b')
  check('never an older one when the newest is already answered', answerTarget([{ id: 'a', sent_at: at(3), answered_at: null }, { id: 'b', sent_at: at(1), answered_at: at(0.5) }], now) === null)
  check('nothing older than 12 hours', answerTarget([{ id: 'a', sent_at: at(13), answered_at: null }], now) === null && ANSWER_WINDOW_MS === 12 * H)
  check('...but 11 hours still counts', answerTarget([{ id: 'a', sent_at: at(11), answered_at: null }], now) === 'a')
  check('no moments, nothing', answerTarget([], now) === null)

  console.log('\n2. The week-by-week reader')
  const localDate = (iso: string) => iso.slice(0, 10)
  const e = readEngagement({
    startDate: '2026-08-01', today: '2026-09-16', localDate,
    sessionDates: ['2026-08-02', '2026-08-04', '2026-08-23', '2026-07-30'],
    loggedDates: ['2026-08-02', '2026-08-02', '2026-08-04', '2026-08-23', '2026-08-24', '2026-09-16'],
    moments: [
      { moment: 'hello', sent_at: '2026-08-02T08:00:00Z', answered_at: '2026-08-02T09:00:00Z' },
      { moment: 'hello', sent_at: '2026-08-03T08:00:00Z', answered_at: null },
      { moment: 'workout_today', sent_at: '2026-08-23T08:00:00Z', answered_at: null },
    ],
  })
  check('week 1 is the first seven days', weekOf('2026-08-01', '2026-08-07') === 1 && weekOf('2026-08-01', '2026-08-08') === 2 && weekOf('2026-08-01', '2026-07-31') === 0)
  check('one entry per week up to this one (7 weeks)', e.weeks.length === 7, e.weeks.length)
  check('week 1: 2 sessions, 2 days logged (a day counted once), 2 moments, 1 answered',
    e.weeks[0].sessionsCompleted === 2 && e.weeks[0].daysLogged === 2 && e.weeks[0].momentsSent === 2 && e.weeks[0].momentsAnswered === 1, e.weeks[0])
  check('a session before he started is not counted', e.weeks.reduce((n, w) => n + w.sessionsCompleted, 0) === 3)
  check('week 4: 1 session, 2 days, 1 moment ignored', e.weeks[3].sessionsCompleted === 1 && e.weeks[3].daysLogged === 2 && e.weeks[3].momentsSent === 1 && e.weeks[3].momentsAnswered === 0, e.weeks[3])
  check('retained at week 1 and week 4; week 12 not over yet', e.retained.week1 === true && e.retained.week4 === true && e.retained.week12 === null, e.retained)
  const lapsed = readEngagement({ startDate: '2026-06-01', today: '2026-09-16', localDate, sessionDates: ['2026-06-02'], loggedDates: ['2026-06-02'], moments: [] })
  check('a person who stopped after week 1 is not retained at weeks 4 or 12', lapsed.retained.week1 === true && lapsed.retained.week4 === false && lapsed.retained.week12 === false, lapsed.retained)
  const current = readEngagement({ startDate: '2026-09-14', today: '2026-09-16', localDate, sessionDates: [], loggedDates: [], moments: [] })
  check('a week still running is never called lost', current.retained.week1 === null, current.retained)

  console.log('\n3. Ignored N times running')
  const rows = [
    { moment: 'protein_short', sent_at: at(1), answered_at: null },
    { moment: 'protein_short', sent_at: at(25), answered_at: null },
    { moment: 'protein_short', sent_at: at(49), answered_at: null },
    { moment: 'protein_short', sent_at: at(73), answered_at: null },
    { moment: 'protein_short', sent_at: at(97), answered_at: at(96) },
    { moment: 'protein_short', sent_at: at(121), answered_at: null },
    { moment: 'workout_today', sent_at: at(26), answered_at: null },
  ]
  check('three ignored in a row (the one an hour old is not ignored yet), stopping at the answered one', ignoredRun(rows, 'protein_short', now) === 3, ignoredRun(rows, 'protein_short', now))
  check('counted per moment', ignoredRun(rows, 'workout_today', now) === 1)
  check('answered most recently: zero', ignoredRun([{ moment: 'x', sent_at: at(20), answered_at: at(19) }, { moment: 'x', sent_at: at(44), answered_at: null }], 'x', now) === 0)

  console.log('\n4. The wiring')
  const chat = src('src/components/ChatAssistant.tsx')
  const insertAt = chat.indexOf(".insert({ profile_id: profileId, role: 'assistant', content: text, status: 'complete', action_data: marker })")
  const recordAt = chat.indexOf("recordMomentSent(profileId, { moment: pick.moment, surface: 'chat', chatMessageId: data.id as string, sentAt: new Date().toISOString() })")
  check('the chat records each unprompted message, after its row exists, with that row\'s id', insertAt > 0 && recordAt > insertAt, { insertAt, recordAt })
  const persist = chat.slice(chat.indexOf('const persistUserMessage = '), chat.indexOf('const persistUserMessage = ') + 400)
  check('every message he sends answers the newest moment', /markMomentAnswered\(profile\.id, 'replied'\)/.test(persist))
  check('a shortcut tap answers its own moment', /onClick=\{\(\) => \{ if \(profile\.id\) void markMomentAnswered\(profile\.id, 'tapped', msg\.id \?\? null\); openStripLink\(msg\.reminder!\.shortcut!\) \}\}/.test(chat))
  const ro = src('supabase/functions/_shared/reach-out.ts')
  const deliveredAt = ro.indexOf('if (delivered) {')
  check('the phone\'s reminder is recorded only once a phone took it, and a failure never stops the run',
    deliveredAt > 0 && /if \(delivered\) \{\s*report\.sent\+\+\s*if \(deps\.recordMoment\) \{\s*try \{ await deps\.recordMoment\(userId, moment\.key, messageId\) \} catch/.test(ro))
  const fn = src('supabase/functions/coach-reach-out/index.ts')
  check('the server writes it as a phone moment, named to the person', /recordMoment: \(userId, moment, chatMessageId\) =>\s*restWrite\("POST", "coach_moment_log", \{ user_id: userId, moment, surface: "phone", chat_message_id: chatMessageId \}\)/.test(fn))
  const mig = readFileSync(join(ROOT, 'supabase/migrations/20261113120000_coach_moment_log.sql'), 'utf8')
  check('its own table, not a child of the chat: Clear chat cannot take it', /CREATE TABLE IF NOT EXISTS coach_moment_log/.test(mig) && !/REFERENCES chat_messages/.test(mig) && /REFERENCES fitness_profiles\(id\) ON DELETE CASCADE/.test(mig))
  check('the four owner policies', ['select', 'insert', 'update', 'delete'].every(op => new RegExp(`owner_${op}_coach_moment_log`).test(mig)))
  const clear = chat.slice(chat.indexOf("supabase.from('chat_messages').delete()") - 600, chat.indexOf("supabase.from('chat_messages').delete()") + 200)
  check('Clear chat deletes chat rows only', clear.length > 0 && !/coach_moment_log/.test(clear))

  console.log(`\n${ran} checks ran, ${failures} failed.`)
  if (failures > 0) process.exit(1)
  console.log('PASSED — every unprompted coach message is kept with whether he answered, and one reader reads the weeks.')
}
main().catch(e => { console.error(e); process.exit(1) })

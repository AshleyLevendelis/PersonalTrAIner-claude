// A WORKOUT THE WATCH RECORDED, WAITING TO BE LOGGED, FOR THE COACH (28 Nov 2026, coach-awareness audit (a) 7; his
// ruling "Mention it once, in its daily message"). Held by behaviour: the words are the offer card's, the coach is told
// not to raise it itself, and the daily mention names a workout once and never again.
import { buildCoachWatchWaiting, watchDailyMention, WATCH_WAITING_MAX_NAMED } from '../src/lib/watch-workout-context'
import { watchWhenLine } from '../src/lib/watch-workouts'

let ran = 0
let failures = 0
function check(name: string, ok: boolean, detail: unknown = '') {
  ran++
  if (ok) console.log(`ok: ${name}`)
  else { failures++; console.log(`FAIL: ${name}${detail !== '' ? ` (${JSON.stringify(detail)})` : ''}`) }
}
const TODAY = '2026-11-28'
// A throw is a failed check, never a crash that stops the rest running.
const mention = (...a: Parameters<typeof watchDailyMention>) => { try { return watchDailyMention(...a) } catch { return 'THREW' as const } }
// Local times, so the check reads the same in any timezone (watchWhenLine reads the phone's clock).
const at = (d: number, h: number, m: number) => new Date(2026, 10, d, h, m).toISOString()
const run = { id: 'r1', type: 'running', start: at(28, 7, 10), end: at(28, 7, 52) }
const walk = { id: 'w1', type: 'walking', start: at(27, 18, 30), end: at(27, 19, 0) }

console.log('1. The context block, in the offer card\'s words')
{
  const t = buildCoachWatchWaiting([run], TODAY)
  check('names the activity, its minutes and when, as the card does', t.includes(`- Run, 42 min, ${watchWhenLine(run, TODAY)}`), t)
  check('the when is "Today, 07:10"', watchWhenLine(run, TODAY) === 'Today, 07:10', watchWhenLine(run, TODAY))
  check('tells the coach nothing is logged until they tap Log, and it is extra work', /nothing is logged until they tap Log/.test(t) && /extra work, never in place of a session/.test(t), t)
  check('tells the coach not to raise it itself (his "mention it once")', /Do not bring these up yourself/.test(t) && /mentions them once/.test(t), t)
  check('no offers, no block', buildCoachWatchWaiting([], TODAY) === '')
  const many = Array.from({ length: 5 }, (_, i) => ({ ...run, id: `r${i}` }))
  const m = buildCoachWatchWaiting(many, TODAY)
  check(`at most ${WATCH_WAITING_MAX_NAMED} named, the rest counted`, m.split('\n').filter(l => l.startsWith('- Run')).length === WATCH_WAITING_MAX_NAMED && /and 2 more/.test(m), m)
  check('an unknown watch type is a "Workout"', /- Workout, 42 min/.test(buildCoachWatchWaiting([{ ...run, type: 'zorbing' }], TODAY)))
}

console.log('2. The daily mention: once per workout, never twice')
{
  const one = mention([run], [], TODAY)
  check('one new workout: one line, a question, with Log it', one !== 'THREW' && one?.line === 'Your watch recorded a 42 min run (Today, 07:10). Want to log it?' && one.action === 'Log it', one)
  check('it hands back the id to keep', JSON.stringify(one !== 'THREW' ? one?.ids : null) === '["r1"]', one)
  check('already mentioned: nothing', mention([run], ['r1'], TODAY) === null)
  const two = mention([run, walk], ['zzz'], TODAY)
  check('two new: the newest named, the other counted', /42 min run \(Today, 07:10\) and 1 more\. Want to log them\?/.test(two && two !== 'THREW' ? two.line : '') && two !== 'THREW' && two?.ids.length === 2, two)
  const later = mention([run, walk], ['r1'], TODAY)
  check('only the not-yet-mentioned one is named and kept', /30 min walk \(Yesterday, 18:30\)\. Want to log it\?/.test(later && later !== 'THREW' ? later.line : '') && JSON.stringify(later && later !== 'THREW' ? later.ids : null) === '["w1"]', later)
  check('no offers: nothing', mention([], [], TODAY) === null)
}

console.log(`${ran} checks ran`)
if (failures > 0) { console.log(`${failures} failed`); process.exit(1) }
console.log('PASS')

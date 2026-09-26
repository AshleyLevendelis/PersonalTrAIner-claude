/**
 * test:chat-groups — the grouping rules behind the coach chat's grouped
 * bubbles (src/lib/chat-groups.ts), checked without a browser. The screen is
 * verify:chat-bubbles; this holds the rules it draws.
 *
 * Every boundary is tested from both sides, with literal numbers rather than
 * the module's own constant: a check compared against the constant that drives
 * it can only agree with itself.
 */
import { groupMessages, bubblePositions, bubbleRadius, groupTimestamp, dayLabel, timeLabel, type GroupableMessage } from '../src/lib/chat-groups'

let ran = 0, failed = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failed++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`) }
}

// Local noon, so no fixture sits near a midnight in any timezone.
const NOW = new Date(2026, 8, 16, 12, 0, 0)
const at = (minsAgo: number) => new Date(NOW.getTime() - minsAgo * 60_000).toISOString()
type M = GroupableMessage & { id: string; status?: string }
const m = (id: string, role: 'user' | 'assistant', minsAgo: number | null, status?: string): M =>
  ({ id, role, ...(minsAgo === null ? {} : { created_at: at(minsAgo) }), ...(status ? { status } : {}) })
const shape = (msgs: M[]) => groupMessages(msgs, NOW, x => x.id)
  .map(r => r.kind === 'day' ? `[${r.label}]` : `${r.role === 'user' ? 'U' : 'C'}(${r.items.map(i => i.message.id).join(',')})`)
  .join(' ')

console.log('chat grouping')

console.log('\n[1] Same sender, within five minutes: one group')
check('two coach messages four minutes apart are one group',
  shape([m('a', 'assistant', 10), m('b', 'assistant', 6)]) === '[Today] C(a,b)', shape([m('a', 'assistant', 10), m('b', 'assistant', 6)]))
check('exactly five minutes apart is still one group',
  shape([m('a', 'assistant', 10), m('b', 'assistant', 5)]) === '[Today] C(a,b)', shape([m('a', 'assistant', 10), m('b', 'assistant', 5)]))
check('five minutes and a second apart is two groups',
  shape([m('a', 'assistant', 10), m('b', 'assistant', 5 - 1 / 60)]) === '[Today] C(a) C(b)', shape([m('a', 'assistant', 10), m('b', 'assistant', 5 - 1 / 60)]))
check('the window is measured from the PREVIOUS message, not the first in the group (a chain of 4-minute gaps stays one group)',
  shape([m('a', 'user', 12), m('b', 'user', 8), m('c', 'user', 4), m('d', 'user', 0)]) === '[Today] U(a,b,c,d)')
check('a change of sender always starts a group, however quick',
  shape([m('a', 'user', 3), m('b', 'assistant', 2.9), m('c', 'user', 2.8)]) === '[Today] U(a) C(b) U(c)')

console.log('\n[2] Days')
check('a day pill above the first dated message and wherever the day changes',
  shape([m('a', 'assistant', 26 * 60), m('b', 'user', 25 * 60), m('c', 'assistant', 30)]) === '[Yesterday] C(a) U(b) [Today] C(c)',
  shape([m('a', 'assistant', 26 * 60), m('b', 'user', 25 * 60), m('c', 'assistant', 30)]))
check('the day changing splits a group even inside five minutes (23:58 and 00:01)', (() => {
  const late = new Date(2026, 8, 15, 23, 58).toISOString(), early = new Date(2026, 8, 16, 0, 1).toISOString()
  const r = groupMessages<M>([{ id: 'a', role: 'user', created_at: late }, { id: 'b', role: 'user', created_at: early }], NOW, x => x.id)
  return r.map(x => x.kind).join() === 'day,group,day,group'
})())
check('"Today", "Yesterday", then a short date', dayLabel(NOW, NOW) === 'Today' && dayLabel(new Date(2026, 8, 15, 8), NOW) === 'Yesterday' && /^\w{3},? 14 Sept?$/.test(dayLabel(new Date(2026, 8, 14, 8), NOW)), dayLabel(new Date(2026, 8, 14, 8), NOW))
check('...with the year only when it is not this year', /2025/.test(dayLabel(new Date(2025, 11, 30), NOW)) && !/2026/.test(dayLabel(new Date(2026, 8, 1), NOW)))

console.log('\n[3] A message with no time never makes a gap or a day')
check('an undated message joins the group before it',
  shape([m('a', 'assistant', 30), m('b', 'assistant', null)]) === '[Today] C(a,b)', shape([m('a', 'assistant', 30), m('b', 'assistant', null)]))
check('...and the gap after it is measured from the last message that HAD a time',
  shape([m('a', 'assistant', 30), m('b', 'assistant', null), m('c', 'assistant', 20)]) === '[Today] C(a,b) C(c)', shape([m('a', 'assistant', 30), m('b', 'assistant', null), m('c', 'assistant', 20)]))
check('a thread with no times at all draws no day pill', shape([m('a', 'assistant', null), m('b', 'user', null)]) === 'C(a) U(b)')
check('every message keeps its index in the original list', (() => {
  const r = groupMessages([m('a', 'user', 3), m('b', 'user', 2), m('c', 'assistant', 1)], NOW, x => x.id)
  return JSON.stringify(r.filter(x => x.kind === 'group').map(g => g.kind === 'group' ? g.items.map(i => i.index) : [])) === '[[0,1],[2]]'
})())

console.log('\n[4] Bubble positions skip cards')
check('three bubbles are first, middle, last', JSON.stringify(bubblePositions([true, true, true])) === '["first","middle","last"]')
check('one bubble is single', JSON.stringify(bubblePositions([true])) === '["single"]')
check('a card-only turn between two bubbles is skipped: first, (card), last', JSON.stringify(bubblePositions([true, false, true])) === '["first",null,"last"]')
check('a bubble after a card-only turn with nothing else is single', JSON.stringify(bubblePositions([false, true])) === '[null,"single"]')
// Found by a MISSED mutation: with the card in the MIDDLE, counting cards as
// bubbles gives the same answer by coincidence. At the end of a group it does
// not — the last BUBBLE must still carry the tail when a card follows it.
check('two bubbles then a card: the second bubble is still the last one', JSON.stringify(bubblePositions([true, true, false])) === '["first","last",null]', bubblePositions([true, true, false]))
check('a card then two bubbles: the first bubble is still the first one', JSON.stringify(bubblePositions([false, true, true])) === '[null,"first","last"]', bubblePositions([false, true, true]))

console.log('\n[5] Corners: 18px, sender-side bottom tucked to 6px, joins tucked')
check('your single bubble tucks only its bottom-right', bubbleRadius('user', 'single') === '18px 18px 6px 18px', bubbleRadius('user', 'single'))
check('your first bubble of several: bottom-right tucked, top-right round', bubbleRadius('user', 'first') === '18px 18px 6px 18px')
check('your middle and last bubbles tuck both right corners', bubbleRadius('user', 'middle') === '18px 6px 6px 18px' && bubbleRadius('user', 'last') === '18px 6px 6px 18px')
check('the coach\'s single bubble tucks only its bottom-left', bubbleRadius('assistant', 'single') === '18px 18px 18px 6px', bubbleRadius('assistant', 'single'))
check('the coach\'s middle and last bubbles tuck both left corners', bubbleRadius('assistant', 'middle') === '6px 18px 18px 6px' && bubbleRadius('assistant', 'last') === '6px 18px 18px 6px')
check('the far side is never tucked', ['single', 'first', 'middle', 'last'].every(p => {
  const u = bubbleRadius('user', p as never).split(' '), c = bubbleRadius('assistant', p as never).split(' ')
  return u[0] === '18px' && u[3] === '18px' && c[1] === '18px' && c[2] === '18px'
}))

console.log('\n[6] One time per group')
check('a group shows the time of its last message', groupTimestamp([{ message: m('a', 'user', 5) }, { message: m('b', 'user', 4) }]) === at(4))
check('...or of the last one that has a time', groupTimestamp([{ message: m('a', 'user', 5) }, { message: m('b', 'user', null) }]) === at(5))
check('...and none while the coach is still typing into it', groupTimestamp([{ message: m('a', 'assistant', 5) }, { message: m('b', 'assistant', null, 'pending') }]) === undefined)
check('the time reads like the app\'s other times ("11:58 AM")', /^\d{1,2}:\d{2}\s?(AM|PM)$/.test(timeLabel(at(0))) && timeLabel(undefined) === '' && timeLabel('nonsense') === '', timeLabel(at(0)))

console.log(`\n${ran} checks ran`)
if (failed > 0) { console.error(`${failed} check(s) failed`); process.exit(1) }
console.log('chat grouping: all checks passed')

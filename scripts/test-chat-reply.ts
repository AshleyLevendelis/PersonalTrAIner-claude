// ---------------------------------------------------------------------------
// REPLY TO ONE MESSAGE, THE WHATSAPP WAY (his ruling 22 Nov 2026, "1, build it"). The rules in src/lib/chat-reply.ts
// and the gestures in src/components/chat/reply-gestures.ts, driven directly; the wiring in ChatAssistant read as
// source. The source checks say a branch EXISTS; verify:chat-reply is what shows it is reached on a real screen.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  EXCERPT_MAX, REPLY_MARKER, findReplyTarget, historyWithReply, offerAnsweredBy, replyActionData, replyExcerpt, replyRefFor, replyRefOf,
  type ReplyRef,
} from '../src/lib/chat-reply'
import { rowToMessage } from '../src/lib/chat-history-merge'
import { replyGestures, SWIPE_AT, HOLD_MS } from '../src/components/chat/reply-gestures'

const ROOT = join(import.meta.dirname ?? process.cwd(), '..')
let failures = 0, ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

type M = { id?: string; role: 'user' | 'assistant'; content: string; pendingAction?: { status: string } }
const COACH_OFFER = 'Want me to swap the back squat for the leg press for the rest of the block? It keeps 4 sets of 8 at 120kg.'

async function main() {
  console.log('\n1. The quote: who said it and its first words')
  {
    const long = 'Your **squat** went up to 100kg today, which is great. '.repeat(6)
    const e = replyExcerpt(long)
    check('a long message is cut at a word, with an ellipsis, inside the limit', e.length <= EXCERPT_MAX + 1 && e.endsWith('…') && !/\s…$/.test(e), e)
    check('...and the markdown marks are gone', !e.includes('*'), e)
    check('a short one is kept whole', replyExcerpt('Did legs today, felt strong') === 'Did legs today, felt strong')
    check('tags and line breaks are not quoted', replyExcerpt('<plan>x</plan>Rest\n\nday  today') === 'x Rest day today', replyExcerpt('<plan>x</plan>Rest\n\nday  today'))
    const ref = replyRefFor({ id: 'c1', role: 'assistant', content: COACH_OFFER })
    check('the quote carries the id, who said it and the words', ref.id === 'c1' && ref.role === 'assistant' && ref.excerpt === replyExcerpt(COACH_OFFER), ref)
  }

  console.log('\n2. Saved with the reply, read back after a reload')
  {
    const ref: ReplyRef = { id: 'c1', role: 'assistant', excerpt: 'Want me to swap it?' }
    const back = replyRefOf(replyActionData(ref))
    check('the saved quote reads back the same', JSON.stringify(back) === JSON.stringify(ref), back)
    const row = rowToMessage({ id: 'u9', role: 'user', content: 'yes please', action_data: replyActionData(ref), status: 'complete' })
    check('a saved reply comes back as a reply', row.replyTo?.id === 'c1' && row.replyTo.excerpt === ref.excerpt, row)
    check('...and never as a plan action (a quote names no type)', row.action === undefined, row)
    check('junk is not a reply', replyRefOf({ replyTo: { role: 'robot', excerpt: 'x' } }) === null && replyRefOf({ replyTo: { role: 'user', excerpt: '  ' } }) === null && replyRefOf(null) === null && replyRefOf({ type: 'ban_exercise' }) === null)
    check('a reminder row is not read as a reply', rowToMessage({ id: 'a', role: 'assistant', content: 'Hey', action_data: { source: 'reminder', moment: 'hello', shortcut: null } }).replyTo === undefined)
  }

  console.log('\n3. A yes as a reply answers the message it replies to, never the newest offer')
  {
    const msgs: M[] = [
      { id: 'a1', role: 'assistant', content: 'Did your knee feel OK on lunges?' },
      { id: 'u1', role: 'user', content: 'a bit sore' },
      { id: 'a2', role: 'assistant', content: COACH_OFFER, pendingAction: { status: 'pending' } },
      { id: 'u2', role: 'user', content: 'hmm' },
      { id: 'a3', role: 'assistant', content: 'Want me to add a mobility drill to tomorrow?', pendingAction: { status: 'pending' } },
    ]
    check('no reply: the newest open offer, as before', offerAnsweredBy(msgs, null) === 4)
    check('a reply to the older offer: that offer', offerAnsweredBy(msgs, replyRefFor(msgs[2])) === 2, offerAnsweredBy(msgs, replyRefFor(msgs[2])))
    check('a reply to a message with no offer: NO offer (the words go to the coach)', offerAnsweredBy(msgs, replyRefFor(msgs[0])) === -1, offerAnsweredBy(msgs, replyRefFor(msgs[0])))
    const closed = msgs.map((m, i) => (i === 2 ? { ...m, pendingAction: { status: 'declined' } } : m))
    check('a reply to an offer already answered: no offer', offerAnsweredBy(closed, replyRefFor(closed[2])) === -1)
    check('a quote whose message is not loaded: no offer', offerAnsweredBy(msgs, { id: 'gone', role: 'assistant', excerpt: 'old' }) === -1)
    // Two messages with the same words, one an offer: a saved quote has the id, so it is that one.
    const twins: M[] = [{ id: 'x1', role: 'assistant', content: 'Want me to?', pendingAction: { status: 'pending' } }, { id: 'x2', role: 'assistant', content: 'Want me to?' }]
    check('with the same words twice, the id decides', offerAnsweredBy(twins, replyRefFor(twins[1])) === -1 && offerAnsweredBy(twins, replyRefFor(twins[0])) === 0)
    check('a quote with no id is found by who said it and its words', findReplyTarget(msgs, { role: 'user', excerpt: 'a bit sore' }) === 1)
  }

  console.log('\n4. The coach is told which message, and never through his words')
  {
    const all: M[] = Array.from({ length: 30 }, (_, i) => ({ id: `m${i}`, role: (i % 2 ? 'user' : 'assistant') as M['role'], content: i === 2 ? COACH_OFFER : `turn ${i} at 80kg x 5` }))
    const stamp = (m: M) => `[stamp] ${m.content}`
    const win = (size: number) => all.slice(1).slice(-size).map(m => ({ source: m, turn: { role: m.role, content: stamp(m) } }))
    const plain = win(20).map(w => w.turn)
    check('no reply: the conversation is sent as before', JSON.stringify(historyWithReply(all, win(20), null, 20, stamp)) === JSON.stringify(plain))
    const inWin = historyWithReply(all, win(20), replyRefFor(all[25]), 20, stamp)
    const marked = inWin.filter(t => t.content.startsWith(REPLY_MARKER))
    check('a message in the window: that turn is marked, in place, and only it', marked.length === 1 && inWin.indexOf(marked[0]) === plain.findIndex(t => t.content === stamp(all[25])) && inWin.length === plain.length, marked)
    const old = historyWithReply(all, win(20), replyRefFor(all[2]), 20, stamp)
    check('an older message: put back at the start, with its own stamp', old[0].content === `${REPLY_MARKER} ${stamp(all[2])}` && old[0].role === 'assistant', old[0])
    check('...within what the coach\'s server keeps (20), so its trim never drops it', old.length === 20, old.length)
    check('...the oldest turn made room, the newest are all still there', old[old.length - 1].content === plain[plain.length - 1].content && old[1].content === plain[1].content, [old[1], plain[1]])
    const gone = historyWithReply(all, win(20), { role: 'assistant', excerpt: 'Something said long ago' }, 20, stamp)
    check('a message no longer loaded: its quote goes at the start', gone[0].content === `${REPLY_MARKER} Something said long ago`)
    const short = historyWithReply(all.slice(0, 5), all.slice(1, 5).map(m => ({ source: m, turn: { role: m.role, content: stamp(m) } })), replyRefFor(all[0]), 20, stamp)
    check('a short chat keeps every turn when the quoted one goes back in', short.length === 5 && short[0].content.startsWith(REPLY_MARKER))
    // THE PROPERTY: a quoted COACH message never becomes one of HIS turns, which the app reads for numbers he stated.
    const userTurns = (h: { role: string; content: string }[]) => h.filter(t => t.role === 'user').map(t => t.content.replace(`${REPLY_MARKER} `, ''))
    const quotedCoach = [inWin, old, gone].every(h => userTurns(h).every(c => !c.includes(COACH_OFFER) && !c.includes('Something said long ago')))
    check('a quoted coach message is never put into one of his turns', quotedCoach)
    const marker = REPLY_MARKER.replace(/[^a-z0-9 ]/gi, ' ')
    check('the marker itself states no number and no "from now on" or maybe', !/\d/.test(marker) && !/from now on|maybe|might|tonight/i.test(marker), REPLY_MARKER)
  }

  console.log('\n5. The gestures: a swipe right replies, a hold opens the menu, a scroll does neither')
  {
    const el = () => { const style: Record<string, string> & { setProperty: (k: string, v: string) => void } = { setProperty(k: string, v: string) { this[k] = v } } as never; return { style, dataset: {} as Record<string, string>, setPointerCapture() {} } }
    const target = (control = false) => ({ closest: () => (control ? {} : null) })
    const ev = (e: HTMLElementish, x: number, y: number, control = false) => ({ button: 0, pointerId: 1, clientX: x, clientY: y, target: target(control), currentTarget: e, preventDefault() {} }) as never
    type HTMLElementish = ReturnType<typeof el>
    const run = async (moves: [number, number][], holdFor = 0, control = false) => {
      let replied = 0, menu = 0
      const g = replyGestures(() => replied++, () => menu++)
      const e = el()
      g.onPointerDown(ev(e, 100, 300, control))
      for (const [x, y] of moves) g.onPointerMove(ev(e, x, y))
      if (holdFor) await wait(holdFor)
      const [lx, ly] = moves.length ? moves[moves.length - 1] : [100, 300]
      g.onPointerUp(ev(e, lx, ly))
      return { replied, menu, transform: e.style.transform }
    }
    const swipe = await run([[115, 302], [140, 304], [100 + SWIPE_AT + 4, 305]])
    check('a swipe right past the mark replies', swipe.replied === 1 && swipe.menu === 0, swipe)
    check('...and the bubble springs back', swipe.transform === '', swipe)
    const short = await run([[115, 301], [100 + SWIPE_AT - 10, 302]])
    check('a short swipe does nothing', short.replied === 0 && short.menu === 0, short)
    const scroll = await run([[103, 320], [104, 360], [170, 380]])
    check('a scroll (a move that starts vertical) does nothing, even if it drifts right', scroll.replied === 0 && scroll.menu === 0, scroll)
    const left = await run([[85, 300], [20, 300]])
    check('a swipe to the LEFT does nothing', left.replied === 0, left)
    const hold = await run([], HOLD_MS + 80)
    check('a held press opens the menu, and does not reply', hold.menu === 1 && hold.replied === 0, hold)
    const tap = await run([])
    check('a tap does neither', tap.menu === 0 && tap.replied === 0, tap)
    // A REDRAW MID-SWIPE (the chat redraws for its own reasons and hands the bubble new handlers): the swipe goes on.
    {
      let replied = 0
      const e = el()
      replyGestures(() => replied++, () => {}).onPointerDown(ev(e, 100, 300))
      const redrawn = replyGestures(() => replied++, () => {})
      redrawn.onPointerMove(ev(e, 130, 301)); redrawn.onPointerMove(ev(e, 100 + SWIPE_AT + 6, 302)); redrawn.onPointerUp(ev(e, 100 + SWIPE_AT + 6, 302))
      check('a swipe begun before the chat redraws still replies after it', replied === 1, replied)
    }
    const onButton = await run([[115, 300], [100 + SWIPE_AT + 10, 300]], HOLD_MS + 80, true)
    check('a press on a button inside the bubble (Listen, Report, Apply) is that button\'s', onButton.replied === 0 && onButton.menu === 0, onButton)
  }

  console.log('\n6. The wiring in the chat (source; reached on screen in verify:chat-reply)')
  {
    const src = readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    const send = src.slice(src.indexOf('const sendMessage = async'), src.indexOf('const sendMessage = async') + 12000)
    check('a sent message carries its quote and the strip closes', /const reply = replyingTo/.test(send) && /setReplyingTo\(null\)/.test(send) && /replyTo: reply/.test(send))
    check('a typed yes or no answers only the offer the reply names (offerAnsweredBy)', /offerAnsweredBy\(messages, reply\)/.test(send))
    check('...and the old "newest open offer" finder is gone', !/findOpenPendingActionIndex/.test(src))
    check('the coach call is given the quote', /callGemini\(userText, placeholderId, turnFacts, reply\)/.test(send))
    const call = src.slice(src.indexOf('const callGemini = async'), src.indexOf('const callGemini = async') + 3000)
    check('...and the conversation it sends is built by historyWithReply', /historyWithReply\(/.test(call) && /replyTo,/.test(call))
    check('...while HIS message goes as typed (the quote is never added to it)', /message: userMessage,/.test(call))
    const persist = src.slice(src.indexOf('const persistUserMessage'), src.indexOf('const persistUserMessage') + 1200)
    check('the quote is saved with the reply', /action_data: replyActionData\(sent\.replyTo\)/.test(persist))
    check('a chip answers the newest message: it closes a reply strip', /const handleQuickReply[\s\S]{0,300}setReplyingTo\(null\)/.test(src))
    const prompt = readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf8')
    check('the coach is told what the marker means (needs the chat-gemini deploy)', prompt.includes(REPLY_MARKER))
  }

  console.log(`\n${ran} checks ran.`)
  if (failures > 0) { console.error(`${failures} FAILED`); process.exit(1) }
  console.log('A reply answers the message it names, is saved with its quote, and the coach is told which, never in his words.')
}
main()

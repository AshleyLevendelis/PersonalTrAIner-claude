// ---------------------------------------------------------------------------
// REPLY TO ONE MESSAGE, ON THE REAL CHAT AT 390px (his ruling 22 Nov 2026, "1, build it": swipe right or press and
// hold, WhatsApp's way). A swipe on a bubble opens "Replying to ..." over the box; X takes it away; the reply is sent
// with a quote of the message, saved with it, and the coach is sent the conversation with THAT message marked, while
// his own words go as typed. A tapped quote goes back to the message. A hold (and a right click) opens Reply and Copy.
// A scroll or a press on a button inside a bubble does none of it. Every check runs every time. PORT 9985.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9985, page: 'chat.html', name: 'chat-reply' })
const { send, ev, check, until, wait, go, clickAt, shoot, finish } = d

// THE COACH, stubbed at the fetch boundary: every request body is kept so the driver can read what was sent.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__errors = []
  window.addEventListener('error', e => window.__errors.push(String(e.message)))
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      const body = JSON.parse((init && init.body) || '{}')
      ;(window.__coachBodies = window.__coachBodies || []).push(body)
      return new Response(JSON.stringify({ reply: 'Got it, the third one then.' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return realFetch(url, init)
  }
` })

const MARKER = '[↩ their new message replies to this one]'
const BUBBLE = text => `[...document.querySelectorAll('[data-testid="chat-bubble"]')].find(b => b.textContent.includes(${JSON.stringify(text)}))`
const centre = async expr => ev(`(() => { const el = ${expr}; if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), top: r.top, bottom: r.bottom } })()`)
const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra })
/** A mouse drag from a bubble's centre, in steps; `mid` runs halfway, while the finger is still down. */
const drag = async (expr, dx, dy, mid) => {
  const p = await centre(expr); if (!p) return null
  await mouse('mousePressed', p.x, p.y)
  let seen = null
  for (let k = 1; k <= 6; k++) {
    await mouse('mouseMoved', p.x + Math.round(dx * k / 6), p.y + Math.round(dy * k / 6))
    await wait(16)
    if (k === 3 && mid) seen = await mid()
  }
  await mouse('mouseReleased', p.x + dx, p.y + dy)
  await wait(250)
  return seen
}
const strip = () => ev(`(() => { const s = document.querySelector('[data-testid="chat-reply-strip"]'); if (!s) return null; const r = s.getBoundingClientRect(); return { text: s.textContent.trim(), role: s.dataset.quoteRole, top: Math.round(r.top), bottom: Math.round(r.bottom) } })()`)
const menu = () => ev(`(() => { const m = document.querySelector('[data-testid="chat-message-menu"]'); if (!m) return null; const r = m.getBoundingClientRect(); return { items: [...m.querySelectorAll('[role="menuitem"]')].map(i => i.textContent.trim()), left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) } })()`)
const typeAndSend = async text => {
  await ev(`(() => { const t = document.querySelector('[data-testid="chat-composer"] textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, ${JSON.stringify(text)}); t.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  // The send button takes the mic's place once there is text (his WhatsApp ruling, 6 Nov 2026).
  await until(() => ev(`!!document.querySelector('[data-chat-send]')`), v => v === true, 20)
  await clickAt(`document.querySelector('[data-chat-send]')`)
}

await go('')
check('1. the chat is up', (await until(() => ev(`document.querySelectorAll('[data-testid="chat-bubble"]').length`), v => v >= 6, 80)) >= 6)
await wait(800)

// --- A swipe to the right replies -------------------------------------------------------------------------------
const midSwipe = await drag(BUBBLE('Coach line 3'), 80, 4, () => ev(`(() => { const b = ${BUBBLE('Coach line 3')}; const a = b.querySelector('[data-testid="chat-swipe-arrow"]'); return { transform: b.style.transform, arrow: Number(getComputedStyle(a).opacity) } })()`))
check('2. a bubble follows the finger to the right, and the reply arrow shows', /translateX\((\d+)px\)/.test(midSwipe?.transform ?? '') && midSwipe.arrow > 0, midSwipe)
const s1 = await strip()
check('3. letting go past the mark opens "Replying to Personal TrAIner" with the message\'s first words', s1?.role === 'assistant' && /^Replying to Personal TrAIner/.test(s1.text) && /Coach line 3\./.test(s1.text), s1)
check('4. ...the bubble springs back', (await ev(`${BUBBLE('Coach line 3')}.style.transform`)) === '')
check('5. ...and the box has the typing, so the keyboard opens', await until(() => ev(`document.activeElement === document.querySelector('[data-testid="chat-composer"] textarea')`), v => v === true, 8))
const composer = await ev(`(() => { const r = document.querySelector('[data-testid="chat-composer-pill"]').getBoundingClientRect(); return { top: Math.round(r.top) } })()`)
check('6. the strip sits over the box, on screen', !!s1 && s1.bottom <= (composer?.top ?? 0) + 1 && s1.top > 0 && (composer?.top ?? 999) <= 844, { s1, composer })
await shoot('chat-reply-strip')
await clickAt(`document.querySelector('[data-testid="chat-reply-cancel"]')`); await wait(200)
check('7. X takes the reply away', (await strip()) === null)

// --- Sending a reply --------------------------------------------------------------------------------------------
await drag(BUBBLE('Coach line 3'), 80, 0)
await typeAndSend('what about that one?')
const bodies = await until(() => ev(`window.__coachBodies || []`), v => Array.isArray(v) && v.length >= 1, 40)
const body = bodies?.[bodies.length - 1]
check('8. his words go to the coach exactly as typed', body?.message === 'what about that one?', body?.message)
const marked = (body?.history ?? []).filter(t => String(t.content).startsWith(MARKER))
check('9. ...and the conversation it is sent marks exactly ONE turn: the coach message he answered', marked.length === 1 && marked[0].role === 'assistant' && /Coach line 3\./.test(marked[0].content), marked)
check('10. ...never inside one of his own turns', (body?.history ?? []).filter(t => t.role === 'user').every(t => !/Coach line/.test(t.content)), body?.history)
check('11. the strip closes once it is sent', (await strip()) === null)
const sent = await until(() => ev(`(() => { const b = ${BUBBLE('what about that one?')}; if (!b) return null; const q = b.querySelector('[data-testid="chat-reply-quote"]'); return { key: b.dataset.replyKey, quote: q ? q.textContent.trim() : null, role: q?.dataset.quoteRole ?? null } })()`), v => !!v, 20)
check('12. the sent message shows the quote: who said it and its first words', sent?.role === 'assistant' && /^Personal TrAIner/.test(sent.quote ?? '') && /Coach line 3\./.test(sent.quote ?? ''), sent)
const row = await ev(`(window.__fakeDb.chat_messages || []).filter(r => r.role === 'user' && r.content === 'what about that one?').map(r => ({ id: r.id, quote: r.action_data && r.action_data.replyTo }))`)
check('13. the quote is SAVED with the message, under the id the screen shows', row?.length === 1 && row[0].id === sent?.key && row[0].quote?.role === 'assistant' && /^Coach line 3\./.test(row[0].quote?.excerpt ?? ''), row)
await shoot('chat-reply-sent')

// A tapped quote goes back to the message it quotes.
await ev(`document.querySelector('[data-testid="chat-scroll"], [data-testid="chat-thread"]')?.scrollTo?.(0, 1e6)`)
await clickAt(`${BUBBLE('what about that one?')}.querySelector('[data-testid="chat-reply-quote"]')`)
await wait(900)
const back = await ev(`(() => { const b = ${BUBBLE('Coach line 3')}; const r = b.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), flashed: b.dataset.flashed ?? null } })()`)
check('14. tapping the quote brings the original into view, marked for a moment', !!back && back.top >= 0 && back.bottom <= 844 && back.flashed === 'true', back)

// --- What is NOT a reply ----------------------------------------------------------------------------------------
await drag(BUBBLE('Coach line 4'), 30, 140)
check('15. a scroll (a move that starts downward) opens nothing', (await strip()) === null && (await menu()) === null)
await drag(BUBBLE('Coach line 4'), -80, 0)
check('16. a swipe to the left opens nothing', (await strip()) === null)
const flag = await centre(`${BUBBLE('Coach line 4')}.querySelector('[data-report-reply]')`)
await mouse('mousePressed', flag.x, flag.y)
for (let k = 1; k <= 6; k++) { await mouse('mouseMoved', flag.x + k * 14, flag.y); await wait(16) }
await wait(600)
await mouse('mouseReleased', flag.x + 84, flag.y); await wait(300)
check('17. a press that starts on a button in the bubble (Report) is the button\'s, never a reply or the menu', (await strip()) === null && (await menu()) === null)
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
await wait(300)

// --- Press and hold -------------------------------------------------------------------------------------------
const held = await centre(BUBBLE('User line 2.'))
await mouse('mousePressed', held.x, held.y)
await wait(650)
await mouse('mouseReleased', held.x, held.y)
const m1 = await until(menu, v => !!v, 12)
check('18. holding a message opens Reply and Copy', JSON.stringify(m1?.items) === JSON.stringify(['Reply', 'Copy']), m1)
check('19. ...on screen', !!m1 && m1.left >= 0 && m1.right <= 390 && m1.top >= 0 && m1.bottom <= 844, m1)
await shoot('chat-reply-menu')
await clickAt(`document.querySelector('[data-testid="chat-menu-reply"]')`); await wait(300)
const s2 = await strip()
check('20. Reply in the menu replies to YOUR message, and says so', s2?.role === 'user' && /^Replying to your message/.test(s2.text) && /User line 2\./.test(s2.text), s2)
check('21. ...and the menu has gone', (await menu()) === null)
await clickAt(`document.querySelector('[data-testid="chat-reply-cancel"]')`); await wait(200)

// A right click on a computer is the same menu.
const rc = await centre(BUBBLE('Coach line 5'))
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rc.x, y: rc.y, button: 'right', buttons: 2, clickCount: 1 })
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rc.x, y: rc.y, button: 'right', buttons: 0, clickCount: 1 })
const m2 = await until(menu, v => !!v, 12)
check('22. a right click opens the same menu', JSON.stringify(m2?.items) === JSON.stringify(['Reply', 'Copy']), m2)
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
await wait(300)
check('23. ...and it closes without replying', (await menu()) === null && (await strip()) === null)

// --- A real finger ----------------------------------------------------------------------------------------------
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 })
const tp = await centre(BUBBLE('Coach line 6'))
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tp.x, y: tp.y }] })
for (let k = 1; k <= 6; k++) { await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: tp.x + k * 14, y: tp.y + 1 }] }); await wait(16) }
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
await wait(300)
const s3 = await strip()
check('24. a finger swiped right replies too', s3?.role === 'assistant' && /Coach line 6\./.test(s3.text), s3)

// --- After a reload: the quote comes back from the SAVED ROW (the phone's own copy is not what is read here) ---------
await go('&seed=reply')
await until(() => ev(`!!${BUBBLE('Saved reply to the third one')}`), v => v === true, 80)
await wait(800)
const kept = await ev(`(() => { const b = ${BUBBLE('Saved reply to the third one')}; const q = b && b.querySelector('[data-testid="chat-reply-quote"]'); return q ? { text: q.textContent.trim(), disabled: q.disabled } : null })()`)
check('25. a reply read back from the server shows its quote, and the quote still goes to the message', /^Personal TrAIner/.test(kept?.text ?? '') && /Coach line 3\./.test(kept?.text ?? '') && kept?.disabled === false, kept)
check('26. no uncaught error on any page', (await ev(`window.__errors.length`)) === 0, await ev(`window.__errors`))

await finish('verify:chat-reply PASSED')

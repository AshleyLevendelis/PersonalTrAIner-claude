// verify:chat-first-answer — THE FIRST ANSWER OF A FIRST CONVERSATION IS ON SCREEN.
//
// The chat walk of 18 Nov 2026 (finding C2): on a cold first open (no thread yet, only the coach's hello), the answer
// to his first question could land under the message box with "Jump to latest" over it, three runs in three.
//
// THE CAUSE, found by tracing the page: when the typing dots are swapped for the answer the thread gets a little
// shorter and then much longer, and the browser moves the scroll position itself and says so with a scroll event.
// Landing after the answer, that event read as "he has scrolled 230px away", and the chat stopped following.
//
// The coach is stubbed at the fetch boundary; what is driven is the app's own scrolling. Each case is a fresh page.
//   1. an answer that fits is on screen;            2. one taller than the window starts at his message (unchanged);
//   3. the cause, made to happen every time;        4. a scroll that IS his still stops the chat following, and he is
//   5. the real race, six cold opens.                  back only at the real end.
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9973, page: 'chat.html', name: 'chat-first-answer', timeoutMs: 240_000 })
const { send, ev, check, wait, go, until, shoot, finish } = d
await send('Emulation.setFocusEmulationEnabled', { enabled: true })
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__err = null
  window.__sl = []
  addEventListener('error', e => { window.__err = String(e.message) })
  addEventListener('unhandledrejection', e => { window.__err = String(e.reason && e.reason.message || e.reason) })
  window.__reply = 'Sure.'
  window.__delay = 1200
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      let said = ''; try { said = String(JSON.parse((init && init.body) || '{}').message || '') } catch {}
      if (said) await new Promise(r => setTimeout(r, window.__delay))
      return new Response(JSON.stringify({ reply: said ? window.__reply : '' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return realFetch(url, init)
  }
` })

const MEDIUM = 'Aim for about 160 g of protein a day, which is roughly 2 g for each kilo you weigh.\n\nSpread it over your meals: about 40 g at breakfast, 55 g at lunch and 55 g at dinner, with a snack making up the rest.\n\nChicken, fish, eggs and yoghurt all count.'
const LONG = Array.from({ length: 14 }, (_, i) => `Point ${i + 1}: protein is spread over the day, and each meal should carry a real share of it so the total is reached without one huge dinner.`).join('\n\n')

const say = async text => {
  await ev(`(() => { const t = document.querySelector('textarea'); t.focus(); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(t, ${JSON.stringify(text)}); t.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await wait(250)
  return ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /send/i.test(x.getAttribute('aria-label') || '')); if (!b || b.disabled) return false; b.click(); return true })()`)
}
/** Where the newest coach bubble and his newest message sit, against the window he can see (header to message box). */
const where = () => ev(`(() => {
  const bubbles = [...document.querySelectorAll('[data-testid="chat-bubble"]')]
  const coach = bubbles.filter(b => b.getAttribute('data-role') === 'assistant').pop()
  const mine = bubbles.filter(b => b.getAttribute('data-role') === 'user').pop()
  const box = document.querySelector('textarea')?.closest('[data-chat-composer], form') ?? document.querySelector('textarea')?.parentElement?.parentElement
  const scroller = coach?.closest('[data-chat-scroll]') ?? [...document.querySelectorAll('*')].find(e => { const c = getComputedStyle(e); return /auto|scroll/.test(c.overflowY) && e.scrollHeight > e.clientHeight + 4 && e.contains(coach) })
  const r = e => e ? (x => ({ top: Math.round(x.top), bottom: Math.round(x.bottom) }))(e.getBoundingClientRect()) : null
  const pill = [...document.querySelectorAll('button')].find(b => /Jump to latest/.test(b.textContent || ''))
  const s = scroller ? scroller.getBoundingClientRect() : null
  return {
    coach: r(coach), mine: r(mine), box: r(box), coachText: (coach?.innerText || '').slice(0, 60), bubbles: bubbles.length,
    windowTop: s ? Math.round(s.top) : null, windowBottom: s ? Math.round(s.bottom) : null,
    scroll: scroller ? { top: Math.round(scroller.scrollTop), height: scroller.scrollHeight, client: scroller.clientHeight } : null,
    pill: !!pill && pill.getBoundingClientRect().width > 0,
  }
})()`)
const open = async q => {
  await go(q)
  await until(() => ev(`!!document.querySelector('textarea')`), v => v === true, 80)
  await wait(2500)
}
const settled = async () => { let last = ''; for (let i = 0; i < 30; i++) { await wait(300); const now = JSON.stringify(await where()); if (now === last) return; last = now } }

console.log('\n  1. A FIRST QUESTION, AN ANSWER THAT FITS THE WINDOW')
await open('&seed=opener')
await ev(`window.__reply = ${JSON.stringify(MEDIUM)}`)
const before = await where()
check('1a. a cold first open: the coach has said hello and he has said nothing', (before?.bubbles ?? 0) >= 1 && before.mine === null, before)
check('1b. the question is sent', (await say('How much protein should I eat?')) === true)
await until(() => where().then(w => /160 g/.test(w?.coachText ?? '')), v => v === true, 60)
await settled()
const a = await where()
await shoot('chat-first-answer-1-fits')
console.log('      measured:', JSON.stringify(a))
check('1c. THE WHOLE ANSWER IS ON SCREEN, above the message box (it landed under it)', !!a?.coach && !!a.box && a.coach.bottom <= a.box.top + 1 && a.coach.top >= (a.windowTop ?? 0) - 1, a)
check('1d. ...with no "Jump to latest" over it: there is nothing newer to jump to', a?.pill === false, a)

console.log('\n  2. AN ANSWER TALLER THAN THE WINDOW STARTS AT HIS MESSAGE (his 17 Nov "All at once")')
await open('&seed=opener')
await ev(`window.__reply = ${JSON.stringify(LONG)}`)
await say('Tell me everything about protein')
await until(() => where().then(w => /Point 1/.test(w?.coachText ?? '')), v => v === true, 60)
await settled()
const b = await where()
await shoot('chat-first-answer-2-long')
console.log('      measured:', JSON.stringify(b))
check('2a. his message is at the top of the window and the answer starts under it, on screen', !!b?.mine && !!b.coach && b.mine.top >= (b.windowTop ?? 0) - 12 && b.coach.top < (b.box?.top ?? 0) - 80, b)
check('2b. ...and "Jump to latest" offers the rest', b?.pill === true, b)

console.log('\n  3. A SCROLL THAT IS NOT HIS, ARRIVING AFTER THE THREAD GREW (the cause, made to happen every time)')
// What the browser does by itself when the typing dots are swapped for the answer: it moves the scroll position a few
// pixels (a clamp, then a re-anchor) and says so with a scroll event. Whether that event lands before or after the
// answer is a race (two runs in six here, and three in three for the tester), so this section makes it land AFTER,
// every time: the moment the answer is in the page, the position is nudged 16px and a scroll event is sent, with no
// finger, wheel or key involved.
await open('&seed=opener')
await ev(`window.__reply = ${JSON.stringify(MEDIUM)}; window.__delay = 1200`)
await ev(`(() => {
  window.__nudge = null
  const mo = new MutationObserver(() => {
    const coach = [...document.querySelectorAll('[data-testid="chat-bubble"][data-role="assistant"]')].pop()
    if (!coach || !/160 g/.test(coach.innerText)) return
    mo.disconnect()
    let el = coach.parentElement
    while (el && !/auto|scroll/.test(getComputedStyle(el).overflowY)) el = el.parentElement
    if (!el) return
    const top = el.scrollTop
    el.scrollTop = top - 16
    el.dispatchEvent(new Event('scroll'))
    window.__nudge = { from: top, to: el.scrollTop, gap: el.scrollHeight - el.scrollTop - el.clientHeight }
  })
  mo.observe(document.body, { childList: true, subtree: true, characterData: true })
})()`)
await say('How much protein should I eat?')
await until(() => where().then(w => /160 g/.test(w?.coachText ?? '')), v => v === true, 60)
await settled()
const n = await ev('window.__nudge')
const c = await where()
await shoot('chat-first-answer-3-not-his')
console.log('      nudge:', JSON.stringify(n), 'ended:', JSON.stringify(c?.scroll), 'pill:', c?.pill)
check('3a. the case binds: the event arrived with the answer already in the thread, more than 120px from its new end', !!n && n.to < n.from && n.gap >= 120, n)
check('3b. THE CHAT STILL FOLLOWS: the whole answer is above the message box (it stopped, and the answer sat under it)', !!c?.coach && !!c.box && c.coach.bottom <= c.box.top + 1, c)
check('3c. ...at the end of the thread, with no "Jump to latest"', !!c?.scroll && c.scroll.height - c.scroll.top - c.scroll.client < 4 && c.pill === false, c)

console.log('\n  4. A SCROLL THAT IS HIS IS STILL HIS: he scrolls up while the coach is typing, and the window stays put')
await open('')
await ev(`window.__reply = ${JSON.stringify(MEDIUM)}; window.__delay = 3500`)
await say('How much protein should I eat?')
await wait(900)
const beforeWheel = await where()
// A real wheel over the thread, as a hand would make it.
await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 195, y: 400, deltaX: 0, deltaY: -500 })
await wait(700)
const afterWheel = await where()
check('4a. he has scrolled well up the thread while the coach is typing', !!beforeWheel?.scroll && !!afterWheel?.scroll && beforeWheel.scroll.top - afterWheel.scroll.top >= 300, [beforeWheel?.scroll, afterWheel?.scroll])
await until(() => where().then(w => /160 g/.test(w?.coachText ?? '')), v => v === true, 60)
await settled()
const e = await where()
await shoot('chat-first-answer-4-his')
check('4b. the answer arrives and THE WINDOW HAS NOT MOVED from where he put it', !!e?.scroll && !!afterWheel?.scroll && Math.abs(e.scroll.top - afterWheel.scroll.top) <= 2 && e.scroll.height > afterWheel.scroll.height, [afterWheel?.scroll, e?.scroll])
check('4c. ..."Jump to latest" offers the answer', e?.pill === true, e)
// HAVING LEFT, HE IS BACK ONLY AT THE REAL END. He scrolls most of the way down again, to where the thread ended
// BEFORE the answer, which is still short of its end now. The chat is not following again yet: when the message box
// grows under a long draft (the window gets shorter), the thread must not jump.
await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 195, y: 400, deltaX: 0, deltaY: 470 })
await wait(700)
const back = await where()
check('4d. he scrolls back to where the thread used to end, still short of the answer\'s end', !!back?.scroll && !!beforeWheel?.scroll && Math.abs(back.scroll.top - beforeWheel.scroll.top) <= 60 && back.scroll.height - back.scroll.top - back.scroll.client >= 120, [beforeWheel?.scroll, back?.scroll])
await ev(`(() => { const t = document.querySelector('textarea'); t.focus(); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(t, 'one line\\ntwo lines\\nthree lines of a draft he has not sent'); t.dispatchEvent(new Event('input', { bubbles: true })) })()`)
await wait(900)
const drafted = await where()
check('4e. the message box grew (the window is shorter) and THE THREAD DID NOT JUMP to the end', !!drafted?.scroll && !!back?.scroll && drafted.scroll.client < back.scroll.client - 10 && Math.abs(drafted.scroll.top - back.scroll.top) <= 2 && drafted.pill === true, [back?.scroll, drafted?.scroll, drafted?.pill])
await shoot('chat-first-answer-4-draft')

console.log('\n  5. THE REAL RACE, SIX COLD OPENS: a question sent straight away, an answer that comes at once')
const ends = []
for (let i = 0; i < 6; i++) {
  await go('&seed=opener')
  await until(() => ev(`!!document.querySelector('textarea')`), v => v === true, 80)
  await wait(600)
  await ev(`window.__reply = ${JSON.stringify(MEDIUM)}; window.__delay = 0`)
  await say('How much protein should I eat?')
  await until(() => where().then(w => /160 g/.test(w?.coachText ?? '')), v => v === true, 60)
  await settled()
  const w = await where()
  ends.push({ onScreen: !!w?.coach && !!w.box && w.coach.bottom <= w.box.top + 1, pill: w?.pill, top: w?.scroll?.top })
}
console.log('      ended:', JSON.stringify(ends))
check('5a. in all six the whole answer is above the message box, with no "Jump to latest" (two in six failed)', ends.length === 6 && ends.every(x => x.onScreen && x.pill === false), ends)

check('3. no uncaught error on the page', (await ev('window.__err ?? null')) === null, await ev('window.__err ?? null'))
await finish('The first answer of a first conversation is on screen.')

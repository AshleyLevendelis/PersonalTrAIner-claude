// ---------------------------------------------------------------------------
// THE CHAT BOX, ON THE REAL CHAT AT 390px (1 Nov 2026). Ashley, from her phone:
// "The voice to text repeats words. Also the text box is only thin and doesn't
// change size so you can see what you've typed when there's lots of text".
//
// 1. VOICE. The speech engine is stubbed on the page and fed the shape an
//    Android phone sends in continuous mode: each growing guess at one phrase as
//    its own result ("what", "what is", "what is", "what is the", ...). Her box
//    read "what what is what is what is the ...". Also the desktop shape (one
//    result per phrase), which must still join, and words she had already typed,
//    which must be kept in front.
// 2. THE BOX. Typed text the box grows to show, up to its cap, and past the cap
//    it scrolls with the newest words in view; it never covers the tab bar, and
//    empties back to one line after sending.
//
// Every check runs every time with a null-safe subject. PORT 9527.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9527, page: 'chat.html', name: 'chat-composer' })
const { send, ev, check, until, wait, go, shoot, finish } = d

await send('Emulation.setFocusEmulationEnabled', { enabled: true })
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) return new Response(JSON.stringify({ reply: 'Got it.' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    return realFetch(url, init)
  }
  // A speech engine the driver plays events into. Each event carries the FULL results list so far, as the real API does.
  class FakeRec {
    constructor() { this.continuous = false; this.interimResults = false; this.lang = ''; this.onresult = null; this.onerror = null; this.onend = null; window.__rec = this }
    start() { window.__recStarted = (window.__recStarted || 0) + 1 }
    stop() { this.onend && this.onend() }
  }
  window.SpeechRecognition = FakeRec
  window.__play = (list, resultIndex) => {
    const results = list.map(([t, f]) => { const r = [{ transcript: t }]; r.isFinal = f; return r })
    window.__rec && window.__rec.onresult && window.__rec.onresult({ results, resultIndex })
  }
` })

const loaded = () => until(() => ev(`!!document.querySelector('textarea')`), v => v === true, 60)
const box = () => ev(`(() => { const t = document.querySelector('[data-testid="chat-composer"] textarea'); return t ? t.value : null })()`)
const setText = text => ev(`(() => { const t = document.querySelector('[data-testid="chat-composer"] textarea'); const s = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; s.call(t, ${JSON.stringify(text)}); t.dispatchEvent(new Event('input', { bubbles: true })) })()`)
const tapMic = () => ev(`(() => { const b = document.querySelector('[aria-label="Start voice input"]'); if (!b) return false; b.click(); return true })()`)
const stopMic = () => ev(`(() => { const b = document.querySelector('[aria-label="Stop voice input"]'); if (!b) return false; b.click(); return true })()`)
const play = async (list, idx) => { await ev(`window.__play(${JSON.stringify(list)}, ${idx})`); await wait(150) }

// 1. VOICE
console.log('\n1. Voice typing, the Android shape')
await go('')
check('1a. the chat is up', (await loaded()) === true)
await wait(800)
check('1b. the mic starts listening', (await tapMic()) === true && (await ev('window.__recStarted ?? 0')) >= 1)
// Her phone: every growing guess is its own final result.
const A = [['what', true], ['what is', true], ['what is', true], ['what is the', true]]
await play(A.slice(0, 1), 0)
await play(A.slice(0, 2), 1)
await play(A.slice(0, 3), 2)
await play(A, 3)
const mid = await box()
check('1c. four guesses at one phrase show it ONCE: "what is the"', mid === 'what is the', mid)
await play([...A, ['what is the plan', false]], 4)
const heard = await box()
check('1d. the word still being heard extends it, not repeats it', heard === 'what is the plan', heard)
await play([...A, ['What is the plan for today?', true]], 4)
const done = await box()
check('1e. the finished phrase reads as said, once', done === 'What is the plan for today?', done)
await play([...A, ['What is the plan for today?', true], ['and', true], ['and tomorrow', false]], 5)
const second = await box()
check('1f. a new phrase after it is added after it, and its own guesses fold the same way', second === 'What is the plan for today? and tomorrow', second)
await stopMic()

console.log('\n2. Voice typing, the desktop shape, after typed words')
await setText('Quick one:')
await wait(200)
check('2a. the mic starts again', (await tapMic()) === true)
await play([['what is the plan', true]], 0)
await play([['what is the plan', true], ['for today', false]], 1)
const desk = await box()
check('2b. one result per phrase still joins, behind what she typed', desk === 'Quick one: what is the plan for today', desk)
await stopMic()

// 2. THE BOX
console.log('\n3. The box grows with what is in it')
const GEO = String.raw`(() => {
  const t = document.querySelector('[data-testid="chat-composer"] textarea')
  const c = document.querySelector('[data-testid="chat-composer"]')
  const nav = [...document.querySelectorAll('nav, [role="tablist"]')].map(n => n.getBoundingClientRect()).filter(r => r.height > 0).sort((a, b) => b.bottom - a.bottom)[0]
  if (!t || !c) return null
  const tr = t.getBoundingClientRect(), cr = c.getBoundingClientRect()
  return { h: Math.round(tr.height), sh: t.scrollHeight, ch: t.clientHeight, st: Math.round(t.scrollTop), oy: getComputedStyle(t).overflowY,
    composerBottom: Math.round(cr.bottom), composerTop: Math.round(cr.top), navTop: nav ? Math.round(nav.top) : null, vh: innerHeight }
})()`
await setText('')
await wait(200)
const empty = await ev(GEO)
check('3a. empty, it is one line (44px)', empty?.h === 44, empty)
const medium = 'I did legs this morning and my knee felt a bit tight on the last set of squats, so I stopped early. Should I swap the lunges tomorrow or just go lighter?'
await setText(medium)
await wait(250)
const m = await ev(GEO)
check('3b. a four-line message: the box grows to show all of it, nothing hidden behind a scroll', !!m && m.h > 80 && m.sh <= m.ch + 1, m)
await shoot('chat-composer-medium')
await setText(medium.repeat(6))
await wait(250)
const big = await ev(GEO)
check('3c. a very long message stops at the cap (160px) and scrolls inside', !!big && big.h === 160 && big.oy === 'auto' && big.sh > big.ch, big)
check('3d. ...with the newest words in view', !!big && big.st + big.ch >= big.sh - 2, big)
check('3e. the grown box sits on the screen, above the tab bar', !!big && big.composerTop > 0 && big.composerBottom <= big.vh && (big.navTop == null || big.composerBottom <= big.navTop + 1), big)
await shoot('chat-composer-long')
const sent = await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /send/i.test(x.getAttribute('aria-label') || '')); if (!b || b.disabled) return false; b.click(); return true })()`)
check('3f. she sends it', sent === true)
const after = await until(() => ev(GEO), v => v && v.h === 44, 30)
check('3g. after sending, the box is one line again', after?.h === 44, after)
check('4. no uncaught error on the page', (await ev('window.__err ?? null')) === null, await ev('window.__err ?? null'))

await finish('verify:chat-composer PASSED')

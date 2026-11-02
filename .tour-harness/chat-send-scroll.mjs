// ---------------------------------------------------------------------------
// WHAT SHE SENDS IS ON SCREEN (1 Nov 2026, whole-app test). The chat followed new messages only while she was near the
// bottom, so after scrolling up, or after a long reply, her own message landed out of sight. On the real chat at 390px
// with the coach stubbed: a long reply, she scrolls to the top, she sends. PORT 9551.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9551, page: 'chat.html', name: 'chat-send-scroll' })
const { send, ev, check, until, wait, go, shoot, finish } = d
const LONG = Array.from({ length: 30 }, (_, i) => `Point ${i + 1}: keep the bar close and brace before every rep.`).join('\n\n')
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) return new Response(JSON.stringify({ reply: ${JSON.stringify(LONG)} }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    return realFetch(url, init)
  }
` })
const setText = text => ev(`(() => { const t = document.querySelector('[data-testid="chat-composer"] textarea'); if (!t) return false; const s = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; s.call(t, ${JSON.stringify(text)}); t.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
const sendIt = () => ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /send/i.test(x.getAttribute('aria-label') || '')); if (!b || b.disabled) return false; b.click(); return true })()`)
const scroller = `(() => { const t = document.querySelector('[data-testid="chat-composer"]'); let best = null; for (const n of document.querySelectorAll('*')) { const oy = getComputedStyle(n).overflowY; if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 50 && !n.contains(t)) { if (!best || n.scrollHeight > best.scrollHeight) best = n } } return best })()`

await go('')
check('1. the chat is up', (await until(() => ev(`!!document.querySelector('[data-testid="chat-composer"] textarea')`), v => v === true, 60)) === true)
await wait(800)
await setText('Give me every cue for the squat'); await wait(150); await sendIt()
await until(() => ev(`document.body.innerText.includes('Point 30:')`), v => v === true, 30); await wait(800)
const top = await ev(`(() => { const s = ${scroller}; if (!s) return null; s.scrollTop = 0; s.dispatchEvent(new Event('scroll')); return s.scrollHeight - s.clientHeight })()`)
await wait(500)
check('2. a long reply, and she has scrolled to the top (so the next check binds)', typeof top === 'number' && top > 600, top)
const MSG = 'And what about the deadlift?'
await setText(MSG); await wait(150)
check('3. she sends another', await sendIt())
await wait(1500)
const seen = await ev(`(() => { const els = [...document.querySelectorAll('*')].filter(e => e.children.length === 0 && e.textContent.trim() === ${JSON.stringify(MSG)}); const el = els.pop(); if (!el) return null; const r = el.getBoundingClientRect(); const c = document.querySelector('[data-testid="chat-composer"]').getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), composerTop: Math.round(c.top) } })()`)
check('4. her message is on screen above the box, not out of sight', !!seen && seen.top >= 0 && seen.bottom <= seen.composerTop, seen)
await shoot('chat-send-scroll')
await finish('verify:chat-send-scroll PASSED')

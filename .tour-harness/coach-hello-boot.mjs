// ---------------------------------------------------------------------------
// THE HELLO ARRIVES WITHOUT OPENING THE CHAT, IN THE WHOLE APP — 13 Nov 2026, Ashley: "I'm not getting proactive
// messages from the chat". verify:coach-hello mounts the chat alone; this boots the REAL App (app-boot.html) with a
// conversation from before today and a phone that has stored nothing about what was read (a reinstall, cleared site
// data), sits on Home, and never opens the chat. The day's hello must still be written, and the chat button must
// light to call him in. Found: the "already read" seed ran on the empty transcript before the history arrived, so
// yesterday's reply read as unread and the coach waited for the chat to be opened.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => { const p = q.url.split('?')[0]; const f = join(DIST, p); if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return } r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' }); r.end(readFileSync(f)) })
await new Promise(r => server.listen(0, r)); const port = server.address().port
const PORT = 9713
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms)); let t
for (let i = 0; i < 80; i++) { try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {} await wait(250) }
const ws = new WebSocket(t); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value
await send('Page.enable'); await send('Runtime.enable')
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) return new Response(JSON.stringify({ reply: 'Nice one.' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    return realFetch(url, init)
  }
` })
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })

let failures = 0, ran = 0
const check = (name, ok, detail) => { ran++; if (ok) console.log(`    ✓ ${name}`); else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) } }

console.log('\nThe whole app, on Home, with a conversation from before today and nothing stored about what was read')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/.tour-harness/app-boot.html?slow=0&chat-yesterday` })
const hellos = `(window.__fakeDb?.chat_messages ?? []).filter(m => m.role === 'assistant' && m.action_data && m.action_data.source === 'reminder')`
for (let i = 0; i < 150 && !(await ev(`${hellos}.length > 0`)); i++) await wait(100)
await wait(600)
const rows = (await ev(`JSON.stringify(${hellos}.map(m => ({ c: m.content, moment: m.action_data.moment })))`)) ?? '[]'
const list = JSON.parse(rows)
const hash = await ev('location.hash')
check('the chat was never opened (still on Home)', !/chat/.test(hash ?? ''), hash)
check('the coach said its one message of the day without being opened', list.length === 1, list)
check('...greeting him by name', /^Hey Sam\b/.test(list[0]?.c ?? ''), list[0])
check('the chat button lights to call him in', await ev(`!!document.querySelector('[data-testid="chat-attention-dot"], [data-testid="chat-unread-ring"]')`) === true)

console.log('\nMeasurement (his strategy, 13 Nov 2026, slice 1): the hello is kept apart from the chat, and his reply answers it')
const momentRows = () => ev(`JSON.stringify((window.__fakeDb?.coach_moment_log ?? []).map(r => ({ moment: r.moment, surface: r.surface, chat: r.chat_message_id, answered: r.answered_at, answer: r.answer })))`).then(x => JSON.parse(x ?? '[]'))
const helloId = await ev(`(${hellos}[0] || {}).id ?? null`)
const before = await momentRows()
check('the hello is recorded once in the moment log, as a chat moment, with its message', before.length === 1 && before[0].surface === 'chat' && before[0].chat === helloId && !!helloId && before[0].answered == null, { before, helloId })
await ev(`location.hash = '#/tab/chat'`)
for (let i = 0; i < 60 && !(await ev(`!!document.querySelector('[data-testid="chat-composer"] textarea')`)); i++) await wait(100)
await wait(600)
await ev(`(() => { const t = document.querySelector('[data-testid="chat-composer"] textarea'); if (!t) return false; const s = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; s.call(t, 'Thanks, will do'); t.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
await wait(150)
await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /send/i.test(x.getAttribute('aria-label') || '')); if (!b || b.disabled) return false; b.click(); return true })()`)
for (let i = 0; i < 40 && !((await momentRows())[0]?.answered); i++) await wait(100)
const after = await momentRows()
const firstTurned = await ev(`(window.__fakeDb?.chat_messages ?? []).filter(m => m.action_data && m.action_data.moment === 'turned_down').length`)
check('his reply marks it answered ("replied")', after.length === 1 && !!after[0].answered && after[0].answer === 'replied', after)

console.log('\nA longer chat in which an offer was left untapped yesterday (the phone keeps the card as it was drawn)')
await send('Page.navigate', { url: 'about:blank' })
await wait(300)
await send('Page.navigate', { url: `http://127.0.0.1:${port}/.tour-harness/app-boot.html?slow=0&chat-stale-offer&clear-storage&n=2` })
for (let i = 0; i < 150 && !(await ev(`${hellos}.length > 0`)); i++) await wait(100)
await wait(600)
const stale = JSON.parse((await ev(`JSON.stringify(${hellos}.map(m => ({ c: m.content })))`)) ?? '[]')
const cachedCard = await ev(`(() => { try { return JSON.parse(localStorage.getItem('chat_history_cache_00000000-0000-4000-8000-00000000b007') || '[]').some(m => m.pendingAction && m.pendingAction.status === 'pending') } catch { return false } })()`)
check('the phone still holds yesterday\'s untapped offer (the case is real, not already cleared)', cachedCard === true)
check('...and the coach still says its hello: an offer whose time ran out is not a question still waiting', stale.length === 1 && /^Hey Sam\b/.test(stale[0]?.c ?? ''), stale)

console.log('\nThe same message ignored three days running: the coach turns itself down a level, and says so (slice 2)')
await send('Page.navigate', { url: 'about:blank' })
await wait(300)
await send('Page.navigate', { url: `http://127.0.0.1:${port}/.tour-harness/app-boot.html?slow=0&chat-yesterday&ignored3&clear-storage&n=3` })
const turned = `(window.__fakeDb?.chat_messages ?? []).filter(m => m.action_data && m.action_data.moment === 'turned_down')`
for (let i = 0; i < 150 && !(await ev(`${turned}.length > 0`)); i++) await wait(100)
await wait(800)
const td = JSON.parse((await ev(`JSON.stringify(${turned}.map(m => m.content))`)) ?? '[]')
const sw = await ev(`JSON.stringify((window.__fakeDb?.fitness_profiles ?? [])[0]?.notification_switches ?? null)`).then(x => JSON.parse(x ?? 'null'))
check('his limit is saved one level down, Normal to Light, with the time it happened', sw?.frequency === 'light' && typeof sw?.frequency_dropped_at === 'string', sw)
check('...and the coach says so once, naming Light and where to change it', td.length === 1 && /down to Light/.test(td[0]) && /Profile, Reminders/.test(td[0]), td)
check('...while a phone with nothing ignored is never turned down (the first visit above)', firstTurned === 0, firstTurned)

console.log(`\n${ran} checks ran.`)
chrome.kill(); server.close()
if (failures > 0) { console.error(`${failures} check(s) failed`); process.exit(1) }
console.log('PASSED — the hello reaches a returning phone with nothing stored, without the chat being opened.')
process.exit(0)

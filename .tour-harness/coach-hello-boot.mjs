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

console.log(`\n${ran} checks ran.`)
chrome.kill(); server.close()
if (failures > 0) { console.error(`${failures} check(s) failed`); process.exit(1) }
console.log('PASSED — the hello reaches a returning phone with nothing stored, without the chat being opened.')
process.exit(0)

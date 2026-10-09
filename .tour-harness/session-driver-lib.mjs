// ---------------------------------------------------------------------------
// The browser plumbing shared by the session drivers written on 9 Oct 2026
// (session-start, what-a-pr-is, history-streak, finish-check). Every older
// driver carries its own copy of these forty lines; four new ones in a day was
// the point to stop copying. Nothing here knows anything about the app — it
// serves the built harness, starts one Chromium on the port it is given, and
// hands back the taps and reads a driver is written in.
//
// ONE EXIT (`finish`), and it prints how many checks RAN: a run that executed
// fewer checks than usual is a crash, not a pass.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

export async function boot({ debugPort, passed }) {
  const DIST = new URL('./dist/', import.meta.url).pathname
  const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
  const server = createServer((q, r) => { const p = q.url.split('?')[0]; const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p); if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return } r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' }); r.end(readFileSync(f)) })
  await new Promise(r => server.listen(0, r)); const port = server.address().port
  const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', `--remote-debugging-port=${debugPort}`, '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
  const wait = ms => new Promise(r => setTimeout(r, ms)); let t
  for (let i = 0; i < 80; i++) { try { const l = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {} await wait(250) }
  const ws = new WebSocket(t); await new Promise(r => ws.addEventListener('open', r, { once: true }))
  let id = 0; const pend = new Map(); const pageErrors = []
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data)
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
    if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params?.exceptionDetails?.exception?.description ?? m.params?.exceptionDetails?.text)
  })
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
  const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value
  const shoot = async name => { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname, Buffer.from(s.result.data, 'base64')) }
  await send('Page.enable'); await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await send('Emulation.setFocusEmulationEnabled', { enabled: true })

  let failures = 0
  let ran = 0
  const check = (name, ok, detail) => {
    ran++
    if (ok) console.log(`    ✓ ${name}`)
    else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 460)}` : ''}`) }
  }
  const finish = () => {
    if (pageErrors.length) console.error(`  page errors: ${JSON.stringify(pageErrors).slice(0, 600)}`)
    console.log(`\n${ran} checks ran. ${failures === 0 ? passed : `${failures} check(s) FAILED.`}\n`)
    ws.close(); chrome.kill(); server.close()
    process.exit(failures === 0 ? 0 : 1)
  }

  const J = JSON.stringify
  const pointAt = async at => { for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 }) }
  const centreOf = expr => ev(`(() => { const n = ${expr}; if (!n) return null; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null })()`)
  const tapExpr = async expr => { const at = await centreOf(expr); if (!at) return false; await wait(150); const again = await centreOf(expr); await pointAt(again ?? at); await wait(500); return true }
  const q = sel => `document.querySelector(${J(sel)})`
  const byText = (text, tag = 'button') => `[...document.querySelectorAll(${J(tag)})].find(b => (b.textContent || '').replace(/\\s+/g, ' ').trim() === ${J(text)})`
  const until = async (expr, ms = 8000) => { const t0 = Date.now(); let v = await ev(expr); while (!v && Date.now() - t0 < ms) { await wait(200); v = await ev(expr) } return v }
  const typeText = async text => { for (const ch of String(text)) { await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }) } await wait(250) }
  const escape = async () => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await wait(500) }
  const texts = sel => ev(`[...document.querySelectorAll(${J(sel)})].map(n => n.innerText.replace(/\\s+/g, ' ').trim())`)

  // EVERY LOAD GETS ITS OWN ADDRESS. Navigating to the address already open is
  // a jump to its #fragment and reloads nothing — the state from before is
  // still there. A counter, never the clock.
  let loads = 0
  /** A fresh page load. `flags` is the harness query ("finisher=1&today=…"); `keep` leaves this phone's storage as it is. */
  const load = async (flags = '', { tab = 'exercise', keep = false } = {}) => {
    if (!keep) await ev(`(() => { try { localStorage.clear() } catch {} })()`)
    loads += 1
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&load=${loads}${flags ? `&${flags}` : ''}#/tab/${tab}` })
    await wait(400)
  }
  /** Runs in the page BEFORE the app, on every later load: the one way a driver seeds rows the fixture does not have. */
  const beforeLoad = source => send('Page.addScriptToEvaluateOnNewDocument', { source })

  const cardExpr = name => `[...document.querySelectorAll('[data-exercise-name]')].find(x => x.getAttribute('data-exercise-name') === ${J(name)})`
  const rowsExpr = name => `[...(${cardExpr(name)}?.querySelectorAll('[data-testid="working-row"]') ?? [])]`
  const ensureOpen = async name => {
    const open = () => ev(`${rowsExpr(name)}.length > 0`)
    if (await open()) return true
    await tapExpr(`${cardExpr(name)}?.querySelector('[role="button"]')`)
    await wait(600)
    return open()
  }
  const typeInto = async (name, rowIndex, box, value) => {
    const input = `${rowsExpr(name)}[${rowIndex}]?.querySelectorAll('input')[${box}]`
    if (!(await tapExpr(input))) return false
    // Whatever is in the box goes first: a driver that types "30" into a box
    // already holding "16" would log 1630.
    await ev(`(() => { const n = ${input}; if (n) n.select() })()`)
    await typeText(value)
    return true
  }
  const tickButton = (name, rowIndex) => `[...(${rowsExpr(name)}[${rowIndex}]?.querySelectorAll('button') ?? [])].find(b => /^save set/i.test(b.getAttribute('aria-label') || ''))`
  const rowSaved = (name, rowIndex) => ev(`!!${rowsExpr(name)}[${rowIndex}]?.getAttribute('data-sync')`)
  /** Tick working set `rowIndex + 1`. `weight`/`reps` are typed when given; a row that needs a weight and is given none gets 10. */
  const tick = async (name, rowIndex, { weight, reps } = {}) => {
    await ensureOpen(name)
    const needs = await ev(`${rowsExpr(name)}[${rowIndex}]?.getAttribute('data-needs-weight') === 'true'`)
    const w = weight ?? (needs ? 10 : null)
    if (w != null) await typeInto(name, rowIndex, 0, w)
    if (reps != null) await typeInto(name, rowIndex, 1, reps)
    const ok = await tapExpr(tickButton(name, rowIndex))
    await wait(600)
    // A weight past what the app thinks this person owns asks for a second tap.
    if (ok && !(await rowSaved(name, rowIndex))) { await tapExpr(tickButton(name, rowIndex)); await wait(600) }
    return rowSaved(name, rowIndex)
  }
  const exerciseNames = () => ev(`[...document.querySelectorAll('[data-exercise-name]')].map(c => c.getAttribute('data-exercise-name'))`)
  const record = () => ev(`(() => { try { const k = Object.keys(localStorage).find(k => k.startsWith('fitplan_active_session_v1:')); const m = k ? JSON.parse(localStorage.getItem(k)) : {}; const r = Object.values(m).sort((a, b) => String(b.lastActivityIso).localeCompare(String(a.lastActivityIso)))[0]; return r ?? null } catch (e) { return null } })()`)

  return { port, send, ev, shoot, wait, check, finish, J, tapExpr, q, byText, until, typeText, escape, texts, load, beforeLoad, cardExpr, rowsExpr, ensureOpen, typeInto, tick, rowSaved, exerciseNames, record }
}

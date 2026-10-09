// ---------------------------------------------------------------------------
// THE PREAMBLE EVERY BROWSER DRIVER NEEDS, ONCE.
//
// A static server over the harness build, one Chromium on the driver's OWN
// debug port and its own profile directory, a CDP socket, and the check /
// screenshot / finish helpers. Written 9 Oct 2026 for the drivers added that
// day; the older drivers each carry their own copy of this and are untouched.
//
// What it guarantees, because each has bitten this harness before:
//   - a port that already has a browser on it stops the run with a sentence;
//   - a browser stopped from outside stops the run with a sentence (several
//     checkouts drive browsers on this machine at once);
//   - a run that hangs gives up after `timeoutMs` instead of holding the lock;
//   - exactly one exit, and it prints how many checks ran.
//
// No clock: nothing here asks the machine what day or time it is.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('./dist/', import.meta.url).pathname
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }

/**
 * @param {{ port: number, page: string, name: string, width?: number, height?: number, mobile?: boolean, timeoutMs?: number }} o
 *   `page` is the harness page to serve at "/", e.g. 'real.html'. `mobile: false` is a DESKTOP window (real scrollbars).
 */
export async function startDriver(o) {
  const { port, page, name, width = 390, height = 844, mobile = true, timeoutMs = 240_000 } = o
  const server = createServer((req, res) => {
    const p = req.url.split('?')[0]
    const f = join(DIST, p === '/' ? `/.tour-harness/${page}` : p)
    if (!existsSync(f)) { res.writeHead(404); res.end('nf'); return }
    res.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream' })
    res.end(readFileSync(f))
  })
  await new Promise(r => server.listen(0, r))
  const origin = `http://127.0.0.1:${server.address().port}`

  const wait = ms => new Promise(r => setTimeout(r, ms))
  const busy = await fetch(`http://127.0.0.1:${port}/json/version`).then(() => true, () => false)
  if (busy) { console.error(`    ✗ port ${port} already has a browser on it — another run of this driver is still alive`); process.exit(1) }
  const profileDir = mkdtempSync(join(tmpdir(), `${name}-`))
  const flags = ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, '--no-sandbox', '--disable-gpu']
  // A desktop window draws real scrollbars; headless hides them unless told not to.
  if (!mobile) flags.push(`--window-size=${width},${height}`, '--hide-scrollbars=false', '--disable-features=OverlayScrollbar')
  const chrome = spawn('/opt/pw-browsers/chromium', [...flags, 'about:blank'], { stdio: 'ignore' })
  const giveUp = why => { console.error(`    ✗ ${why}`); try { chrome.kill('SIGKILL') } catch {} ; process.exit(1) }
  const watchdog = setTimeout(() => giveUp(`the driver did not finish in ${Math.round(timeoutMs / 1000)} seconds`), timeoutMs)
  let finishing = false
  chrome.once('exit', code => { if (!finishing) giveUp(`the browser exited mid-run (code ${code}) — something outside this driver stopped it; run it again`) })

  let target
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const l = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json())
      target = l.find(x => x.type === 'page')?.webSocketDebuggerUrl
    } catch {}
    if (!target) await wait(250)
  }
  if (!target) giveUp('the browser never offered a page to drive')
  const ws = new WebSocket(target); await new Promise(r => ws.addEventListener('open', r, { once: true }))
  let id = 0; const pending = new Map()
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } })
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
  const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value
  const shoot = async file => {
    const s = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(new URL(`./${file}.png`, import.meta.url).pathname, Buffer.from(s.result.data, 'base64'))
  }
  await send('Page.enable'); await send('Runtime.enable')
  if (mobile) await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: true })
  else await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })

  let failures = 0
  let ran = 0
  const check = (label, ok, detail) => {
    ran++
    if (ok) console.log(`    ✓ ${label}`)
    else { failures++; console.error(`    ✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ''}`) }
  }
  const until = async (fn, pred, tries = 40) => { let v = await fn(); for (let i = 0; i < tries && !pred(v); i++) { await wait(250); v = await fn() } return v }
  let loads = 0
  /** Every load gets its own address: the same URL twice is a jump to a #fragment, not a load. */
  const go = async (query, hash = '') => {
    await send('Page.navigate', { url: `${origin}/?load=${++loads}${query}${hash}` })
  }
  /** A real mouse click at an element's centre (element.click() can open and shut a row in one tick). */
  const clickAt = async selectorExpr => {
    const p = await ev(`(() => { const el = ${selectorExpr}; if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
    if (!p) return false
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 })
    return true
  }
  const finish = async okSentence => {
    console.log(`\n${ran} checks ran.`)
    clearTimeout(watchdog)
    finishing = true
    await new Promise(r => { chrome.once('exit', r); chrome.kill(); setTimeout(r, 5000) })
    server.close()
    if (failures > 0) { console.error(`${failures} check(s) failed`); process.exit(1) }
    console.log(`${okSentence}\n`)
    process.exit(0)
  }
  return { origin, send, ev, shoot, check, until, wait, go, clickAt, finish }
}

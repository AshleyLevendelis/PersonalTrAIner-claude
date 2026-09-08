// ---------------------------------------------------------------------------
// THE WAY OUT OF A MODAL, ON A SCREEN TOO SHORT TO HOLD IT.
//
// Ashley, 8 Sep 2026: the ✕ "renders at the bottom of long scroll containers"
// across every modal, Profile included. Two causes, one on top of the other:
//
//   `.hit-slop-44` sets position:relative to anchor its 44px tap target, and
//   it is a single class declared after Tailwind's positioning utilities — so
//   `hit-slop-44 absolute` lost its absolute and the button laid out as the
//   last item in the dialog's grid. Measured here before the fix: ✕ at y=746
//   inside a dialog spanning 73-771.
//
//   And underneath that: the scroll was on the same element the ✕ was
//   positioned against, so once it WAS in the corner, scrolling carried it off
//   the top of the screen (y=-259 at the bottom of the scroll).
//
// A source check can prove the classes are right. Only a browser can show that
// the button is somewhere a thumb can reach at both ends of a scroll — so this
// runs the real Nutrition sheet at a deliberately short viewport, which is the
// only way to make a real dialog in this harness overflow.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

/** Short on purpose: max-h caps the sheet, and the sheet has more content than fits. */
const VIEWPORT = { width: 390, height: 420 }

const DIST = new URL('./dist/', import.meta.url).pathname
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((req, res) => {
  const p = req.url.split('?')[0]
  const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p)
  if (!existsSync(f)) { res.writeHead(404); res.end('nf'); return }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream' })
  res.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r))
const port = server.address().port

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9374', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9374/json/list').then(r => r.json())
    const g = l.find(x => x.type === 'page')
    if (g) { target = g.webSocketDebuggerUrl; break }
  } catch {}
  await wait(250)
}
const ws = new WebSocket(target); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pending = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value
const shoot = async name => {
  const s = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname, Buffer.from(s.result.data, 'base64'))
}

let failures = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { ...VIEWPORT, deviceScaleFactor: 2, mobile: true })

const measure = () => ev(`(() => {
  const c = document.querySelector('[data-slot="dialog-content"]')
  if (!c) return { dialog: false }
  const b = c.querySelector('[data-slot="dialog-body"]')
  const x = c.querySelector('[data-slot="dialog-close"]')
  const cr = c.getBoundingClientRect()
  const xr = x ? x.getBoundingClientRect() : null
  return {
    dialog: true,
    hasBody: !!b,
    scrollTop: b ? b.scrollTop : null,
    scrollable: b ? b.scrollHeight - b.clientHeight : null,
    dialogTop: Math.round(cr.top), dialogBottom: Math.round(cr.bottom),
    xFromDialogTop: xr ? Math.round(xr.top - cr.top) : null,
    xInsideViewport: xr ? (xr.top >= 0 && xr.bottom <= ${VIEWPORT.height} && xr.left >= 0 && xr.right <= ${VIEWPORT.width}) : null,
    xInTopHalfOfDialog: xr ? (xr.top - cr.top) < (cr.height / 2) : null,
    xTappable: xr ? (xr.width >= 12 && xr.height >= 12) : null,
    dialogFitsViewport: cr.top >= 0 && cr.bottom <= ${VIEWPORT.height} + 1,
  }
})()`)

console.log('\nTHE ✕ STAYS IN THE CORNER\n')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off#/tab/nutrition` })
await wait(3500); await ev(`location.hash = '#/tab/nutrition'`); await wait(1500)
check('0. the sheet trigger is on screen',
  await ev(`[...document.querySelectorAll('button')].some(b => /How it's set|How your targets/i.test(b.textContent||''))`))
await ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>/How it's set|How your targets/i.test(x.textContent||'')); if(b) b.click() })()`)
await wait(900)

let top = await measure()
for (let i = 0; i < 10 && !top.dialog; i++) { await wait(400); top = await measure() }
check('1a. the dialog is open', top.dialog, top)
check('1b. it has a body that scrolls, and the shell does not', top.hasBody === true && top.scrollable > 0, top)
check('1c. the whole dialog fits the screen — nothing runs off the bottom', top.dialogFitsViewport === true, top)
check('1d. the ✕ is in the dialog\'s top corner, not below its content',
  top.xInTopHalfOfDialog === true && top.xFromDialogTop >= 0 && top.xFromDialogTop < 48, top)
check('1e. ...and it is on screen', top.xInsideViewport === true, top)
check('1f. ...and big enough to hit', top.xTappable === true, top)
await shoot('modal-close-top')

await ev(`(() => { const b=document.querySelector('[data-slot="dialog-body"]'); if(b) b.scrollTop = b.scrollHeight })()`)
await wait(500)
const bottom = await measure()
check('2a. the body really did scroll to the end', bottom.scrollTop > 0, bottom)
check('2b. THE ✕ HAS NOT MOVED — the whole point', bottom.xFromDialogTop === top.xFromDialogTop, { top: top.xFromDialogTop, bottom: bottom.xFromDialogTop })
check('2c. ...and is still on screen at the bottom of a long modal', bottom.xInsideViewport === true, bottom)
await shoot('modal-close-scrolled')

check('3. closing it works from there', await ev(`(() => {
  const x = document.querySelector('[data-slot="dialog-close"]'); if (!x) return false
  x.click(); return true
})()`))
await wait(600)
check('3b. ...and the dialog is gone', (await measure()).dialog === false)

const err = await ev('window.__err ?? null')
check('4. no uncaught error on the page', err === null, err)

console.log(failures === 0 ? '\nThe way out stays where a thumb can find it.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)

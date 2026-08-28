// ---------------------------------------------------------------------------
// WALK EVERY REAL SCREEN AT PHONE WIDTH, WITH EFFECTS RUNNING.
//
// `render:screens` renders the real components too, but with
// renderToStaticMarkup — so useEffect never fires and every component is
// frozen in its INITIAL state. Its own header says so. That means it cannot
// see anything that only appears once data has loaded, which is most of what
// a user actually looks at.
//
// This mounts the same components in Chromium behind the in-memory Supabase
// fake, lets the effects run, and then asks the mechanical questions a
// screenshot alone does not answer.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

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

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9338', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let t
for (let i = 0; i < 80; i++) {
  try { const l = await fetch('http://127.0.0.1:9338/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {}
  await wait(250)
}
const ws = new WebSocket(t); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pending = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300))
  return r.result?.result?.value
}

let failures = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}

await send('Page.enable'); await send('Runtime.enable')
const W = 390, H = 844
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true })

const TABS = ['dashboard', 'nutrition', 'exercise', 'tools']

// The audit, run in the page. Everything here is a question a screenshot
// cannot answer on its own, or one a human eye reliably skips.
const AUDIT = `(() => {
  const vw = ${W}
  const out = { }
  out.scrollWidth = document.documentElement.scrollWidth
  out.pageHeight = document.documentElement.scrollHeight

  const visible = el => {
    const s = getComputedStyle(el)
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }

  // Elements sticking out past the right edge — the cause of a page that
  // scrolls sideways on a phone.
  out.overflowing = []
  document.querySelectorAll('body *').forEach(el => {
    if (!visible(el)) return
    const r = el.getBoundingClientRect()
    if (r.right > vw + 1 && r.width <= vw + 40) {
      out.overflowing.push({ tag: el.tagName, cls: String(el.className).slice(0, 40), right: Math.round(r.right), text: (el.innerText || '').trim().slice(0, 40) })
    }
  })
  out.overflowing = out.overflowing.slice(0, 6)

  const text = document.body.innerText

  // Values that leaked a placeholder into the UI.
  out.leaked = (text.match(/\\bNaN\\b|\\bundefined\\b|\\[object Object\\]|\\bInfinity\\b/g) || []).slice(0, 6)

  // Still loading after everything settled.
  out.stillLoading = /\\bLoading\\b|\\bSkeleton\\b/.test(text)

  // The "B · 3×9-11" class: a name rendered as one or two characters.
  out.stubNames = []
  document.querySelectorAll('h1,h2,h3,h4,p,span,div,button,a').forEach(el => {
    if (!visible(el) || el.children.length) return
    const s = (el.textContent || '').trim()
    if (s.length > 0 && s.length <= 2 && /^[A-Za-z]+$/.test(s)) {
      const r = el.getBoundingClientRect()
      out.stubNames.push({ text: s, y: Math.round(r.top), size: getComputedStyle(el).fontSize })
    }
  })
  out.stubNames = out.stubNames.slice(0, 8)

  // Tap targets below the 44px guideline, buttons only.
  out.smallTargets = []
  document.querySelectorAll('button,a[href],[role="button"]').forEach(el => {
    if (!visible(el)) return
    const r = el.getBoundingClientRect()
    if (r.height < 40 || r.width < 28) {
      out.smallTargets.push({ h: Math.round(r.height), w: Math.round(r.width), text: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 28) })
    }
  })
  out.smallTargets = out.smallTargets.slice(0, 10)

  // Text below the readable floor.
  out.tinyText = []
  document.querySelectorAll('body *').forEach(el => {
    if (!visible(el) || el.children.length) return
    const s = (el.textContent || '').trim()
    if (!s) return
    const px = parseFloat(getComputedStyle(el).fontSize)
    if (px && px < 11) out.tinyText.push({ px, text: s.slice(0, 30) })
  })
  out.tinyText = out.tinyText.slice(0, 6)

  return JSON.stringify(out)
})()`

console.log('\nWALKING THE REAL SCREENS AT 390x844, EFFECTS RUNNING\n')
for (const tab of TABS) {
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off#/tab/${tab}` })
  await wait(2200)
  // A fresh navigate keeps the hash but React may need a nudge to the tab.
  await ev(`location.hash = '#/tab/${tab}'`)
  await wait(1200)

  const a = JSON.parse(await ev(AUDIT))
  console.log(`  ${tab.toUpperCase()}  (page ${a.pageHeight}px tall)`)
  // HARD CHECKS — no defensible design produces any of these.
  check('nothing scrolls sideways', a.scrollWidth <= W + 1, { scrollWidth: a.scrollWidth })
  check('no element sticks past the right edge', a.overflowing.length === 0, a.overflowing)
  check('no placeholder value leaked into the UI', a.leaked.length === 0, a.leaked)
  check('nothing is still loading', !a.stillLoading)

  // OBSERVATIONS — printed, never failed. The first version of this file
  // failed on all three and every hit was design: "ml" and "kg" are units,
  // "M T W T F S S" is the week strip, "BW" is the bodyweight badge, and the
  // 9-10px sizes are the deliberate micro-label scale. A check that cries
  // wolf on every run gets muted within a week, which costs more than it
  // ever caught. These are here to be READ next to the screenshot.
  const note = (label, rows) => { if (rows.length) console.log(`    · ${label}: ${JSON.stringify(rows).slice(0, 220)}`) }
  note('one- or two-character labels', a.stubNames)
  note('tap targets under 40px tall', a.smallTargets)
  note('text under 11px', a.tinyText)

  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  writeFileSync(new URL(`./screen-${tab}.png`, import.meta.url).pathname, Buffer.from(shot.result.data, 'base64'))
  console.log('')
}

console.log(failures === 0 ? '\nNo hard failures. Read the observations and the screenshots.\n' : `\n${failures} hard failures above.\n`)
chrome.kill(); server.close()
process.exit(0)

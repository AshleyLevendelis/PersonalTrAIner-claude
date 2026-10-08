// Exploratory QA driver host (8 Oct 2026). Keeps ONE headless Chromium (port 9601)
// and ONE CDP connection alive, serves .tour-harness/dist, and accepts commands
// over a tiny control HTTP server on 8762 so a tester can drive the real screens
// step by step (see do.mjs). Not a gate: it asserts nothing.
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('../dist/', import.meta.url).pathname
const SHOTS = new URL('./shots/', import.meta.url).pathname
mkdirSync(SHOTS, { recursive: true })
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }
const STATIC_PORT = 8761, CDP_PORT = Number(process.env.CDP_PORT ?? 9601), CTRL_PORT = 8762
createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0])
  const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p)
  if (!existsSync(f)) { res.writeHead(404); res.end('nf'); return }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream' })
  res.end(readFileSync(f))
}).listen(STATIC_PORT)

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then(r => r.json())
    const g = l.find(x => x.type === 'page'); if (g) { target = g.webSocketDebuggerUrl; break }
  } catch {}
  await wait(250)
}
const ws = new WebSocket(target); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pending = new Map(); const consoleLog = []
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) consoleLog.push(`[${m.params.type}] ` + m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300))
  if (m.method === 'Runtime.exceptionThrown') consoleLog.push('[exception] ' + (m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? '').slice(0, 400))
})
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); return r.result?.exceptionDetails ? { __error: r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text } : r.result?.result?.value }
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setFocusEmulationEnabled', { enabled: true })

// A coach stub installed on every new document. Replies are queued by the
// tester (cmd 'coach'); the default reply is short prose.
const STUB = `
  window.__coachCalls = []
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    const u = String(url)
    if (u.includes('chat-gemini')) {
      let body = {}; try { body = JSON.parse((init && init.body) || '{}') } catch {}
      window.__coachCalls.push(body)
      const q = JSON.parse(sessionStorage.getItem('__coachQueue') || '[]')
      const next = q.shift(); sessionStorage.setItem('__coachQueue', JSON.stringify(q))
      return new Response(JSON.stringify(next ?? { reply: 'Got it.' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return realFetch(url, init)
  }
  window.addEventListener('error', e => { window.__err = String(e.message) })
`
await send('Page.addScriptToEvaluateOnNewDocument', { source: STUB })

async function mouseClickAt(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
}
// Find a clickable by visible text or aria-label (exact, then substring; /regex/flags allowed).
const FIND = (spec, nth = 0) => `(() => {
  const spec = ${JSON.stringify(spec)}; const nth = ${nth}
  const rx = spec.startsWith('/') ? new RegExp(spec.slice(1, spec.lastIndexOf('/')), spec.slice(spec.lastIndexOf('/') + 1)) : null
  const label = el => ((el.getAttribute('aria-label') || '') + ' ' + (el.innerText || el.value || '')).trim()
  const visible = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  let els = [...document.querySelectorAll('button, a, [role=button], [role=tab], [role=menuitem], [role=option], [role=checkbox], [role=switch], [role=radio], input[type=checkbox], label, summary')].filter(visible)
  const match = el => { const t = label(el); const inner = (el.innerText || '').trim(); const aria = (el.getAttribute('aria-label') || '').trim(); return rx ? rx.test(t) : (inner === spec || aria === spec) }
  let hits = els.filter(match)
  if (!hits.length && !rx) hits = els.filter(el => label(el).includes(spec))
  hits = hits.filter(h => !hits.some(o => o !== h && h.contains(o)))
  const el = hits[nth]; if (!el) return null
  el.scrollIntoView({ block: 'center', inline: 'nearest' })
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: label(el).slice(0, 80), count: hits.length, tag: el.tagName, disabled: !!el.disabled }
})()`

const cmds = {
  async nav(url) { consoleLog.length = 0; await send('Page.navigate', { url: url.startsWith('http') ? url : `http://127.0.0.1:${STATIC_PORT}${url}` }); await wait(3500); return 'ok' },
  async js(x) { return ev(x) },
  // run the JS in a file (avoids shell quoting)
  async jsf(path) { return ev(readFileSync(path, 'utf8')) },
  async shot(name) { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(SHOTS + name + '.png', Buffer.from(s.result.data, 'base64')); return SHOTS + name + '.png' },
  async full(name) {
    const h = await ev('Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)')
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: Math.min(h, 6000), deviceScaleFactor: 1, mobile: true })
    await wait(500)
    const s = await send('Page.captureScreenshot', { format: 'png' })
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
    writeFileSync(SHOTS + name + '.png', Buffer.from(s.result.data, 'base64')); return SHOTS + name + '.png'
  },
  async click(spec, nth = 0) {
    const f = await ev(FIND(spec, Number(nth))); if (!f) return { notFound: spec }
    await wait(200); const f2 = (await ev(FIND(spec, Number(nth)))) ?? f
    await mouseClickAt(f2.x, f2.y); await wait(800); return f2
  },
  async list(spec) {
    return ev(`(() => { const rx = new RegExp(${JSON.stringify(spec || '.')}, 'i'); return [...document.querySelectorAll('button, a, [role=button], [role=tab], [role=menuitem], input, textarea, select, [role=checkbox], [role=switch]')].filter(el => { const r = el.getBoundingClientRect(); return r.width>0 && r.height>0 }).map(el => ({ t: el.tagName, txt: ((el.getAttribute('aria-label')||'') + ' | ' + (el.innerText||el.value||el.placeholder||'')).replace(/\\s+/g,' ').trim().slice(0,90), y: Math.round(el.getBoundingClientRect().top + scrollY), h: Math.round(el.getBoundingClientRect().height), w: Math.round(el.getBoundingClientRect().width), dis: !!el.disabled })).filter(x => rx.test(x.txt)) })()`)
  },
  async text() { return ev(`document.body.innerText`) },
  async type(spec) {
    const [sel, ...rest] = spec.split('::'); const v = rest.join('::')
    return ev(`(() => { let el = null; try { el = document.querySelector(${JSON.stringify(sel)}) } catch {}
      if (!el) el = [...document.querySelectorAll('input, textarea')].find(e => (e.placeholder||'').includes(${JSON.stringify(sel)}) || (e.getAttribute('aria-label')||'').includes(${JSON.stringify(sel)}))
      if (!el) return 'no field'
      el.scrollIntoView({block:'center'}); el.focus()
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(v)})
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }))
      return 'typed into ' + (el.placeholder || el.getAttribute('aria-label') || el.name || el.tagName) })()`)
  },
  // "css-selector::index::value" — the index-th visible element matching the selector
  async typen(spec) {
    const [sel, idx, ...rest] = spec.split('::'); const v = rest.join('::')
    return ev(`(() => { const els = [...document.querySelectorAll(${JSON.stringify(sel)})].filter(e => e.getBoundingClientRect().width > 0)
      const el = els[${Number(idx)}]; if (!el) return 'no field (' + els.length + ' matched)'
      el.scrollIntoView({block:'center'}); el.focus()
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(v)})
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }))
      return 'typed into #' + ${Number(idx)} + ' of ' + els.length + ' ' + (el.getAttribute('aria-label') || el.placeholder || '') })()`)
  },
  async inputs() {
    return ev(`[...document.querySelectorAll('input, textarea, select')].filter(e => e.getBoundingClientRect().width > 0).map((e, i) => i + ': ' + e.tagName + ' type=' + e.type + ' aria=' + (e.getAttribute('aria-label')||'') + ' ph=' + (e.placeholder||'') + ' val=' + e.value + ' y=' + Math.round(e.getBoundingClientRect().top + scrollY))`)
  },
  async key(k) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: k === 'Enter' ? 13 : k === 'Escape' ? 27 : 0 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: k === 'Enter' ? 13 : k === 'Escape' ? 27 : 0 }); await wait(500); return 'ok' },
  async tapxy(xy) { const [x, y] = xy.split(',').map(Number); await mouseClickAt(x, y); await wait(800); return 'ok' },
  async scroll(y) { return ev(`window.scrollTo(0, ${Number(y)}); window.scrollY`) },
  async coach(json) { return ev(`(() => { const q = JSON.parse(sessionStorage.getItem('__coachQueue') || '[]'); q.push(...[].concat(${json})); sessionStorage.setItem('__coachQueue', JSON.stringify(q)); return q.length })()`) },
  async console() { return [...consoleLog] },
  async wait(ms) { await wait(Number(ms)); return 'ok' },
}
createServer(async (req, res) => {
  let body = ''; for await (const c of req) body += c
  try {
    const { cmd, arg, arg2 } = JSON.parse(body)
    const out = await cmds[cmd](arg, arg2)
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out ?? null))
  } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e && e.stack || e) })) }
}).listen(CTRL_PORT)
console.log('ready')
process.on('SIGTERM', () => { chrome.kill(); process.exit(0) })

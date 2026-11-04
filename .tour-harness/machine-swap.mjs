// ---------------------------------------------------------------------------
// A MACHINE AT HER GYM, SWAPPED IN AT PHONE SIZE (4 Nov 2026; her ruling "Machines swappable only", after "I've been
// in the gyms used machines which were not available as swaps in the app").
//
// test:machine-versions holds the rule, the price and every writer. It cannot see the sheet: whether typing the
// machine's name in the swap search finds it, whether the row says what it is a version of, whether tapping it and
// "Just today" really puts it on today's card under ITS OWN name with a weight, and whether a one-sided machine shows
// its weight per side. So this does exactly that, twice: a V-squat (priced as the hack squat) and an iso-lateral leg
// press (per leg).
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => { const p = q.url.split('?')[0]; const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p); if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return } r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' }); r.end(readFileSync(f)) })
await new Promise(r => server.listen(0, r)); const port = server.address().port
const PORT = 9789
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms)); let t
for (let i = 0; i < 80; i++) { try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {} await wait(250) }
const ws = new WebSocket(t); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map(); const pageErrors = []
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data)
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
  if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params?.exceptionDetails?.text)
})
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value
const shoot = async name => { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname, Buffer.from(s.result.data, 'base64')) }
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

let failures = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}
const rectOf = sel => ev(`(() => { const n = ${sel}; if (!n) return null; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
const tap = async sel => { const r = await rectOf(sel); if (!r) return false; await wait(120); const r2 = await rectOf(sel); if (!r2) return false; for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: r2.x, y: r2.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 }); return true }
const q = s => `document.querySelector(${JSON.stringify(s)})`
const has = s => ev(`!!${q(s)}`)
const escape = async () => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await wait(450) }
const until = async (expr, ms = 6000) => { for (let s = 0; s < ms; s += 200) { if (await ev(expr)) return true; await wait(200) } return false }
const order = () => ev(`[...document.querySelectorAll('[data-exercise-name]')].map(n => n.getAttribute('data-exercise-name'))`)
const row = name => `document.querySelector('[data-exercise-name=${JSON.stringify(name).replace(/'/g, "\\'")}]')`
const openRowMenu = async name => {
  if (await has('[role="menu"]')) await escape()
  const trigger = `${row(name)}?.querySelector('button[aria-label="Exercise options"]')`
  if (!(await ev(`!!${trigger}`))) { await tap(`${row(name)}?.querySelector('[role="button"], .cursor-pointer')`); await wait(700) }
  if (!(await tap(trigger))) return false
  return until(`!!${q('[data-testid="swap-exercise"]')}`, 3000)
}
/** Open the swap sheet on `name`, get past the reason question, type `words`, and read the search rows as drawn. */
const searchSwap = async (name, words) => {
  const menu = await openRowMenu(name)
  const opened = menu && await tap(q('[data-testid="swap-exercise"]')) && await until(`!!${q('[data-testid="swap-dialog"]')}`)
  if (await has('[data-testid="swap-dialog"] [data-testid="reason-skip"]')) { await ev(`${q('[data-testid="swap-dialog"] [data-testid="reason-skip"]')}.click()`); await wait(800) }
  const typed = await ev(`(() => { const i = document.querySelector('[data-testid="swap-dialog"] input[placeholder^="e.g."]'); if (!i) return false; i.focus(); return true })()`)
  if (typed) await send('Input.insertText', { text: words })
  await wait(700)
  const rows = await ev(`(() => {
    const d = document.querySelector('[data-testid="swap-dialog"]'); if (!d) return []
    return [...d.querySelectorAll('button')].filter(b => b.querySelector('p.font-medium')).map(b => {
      const r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + Math.min(r.height / 2, 20)
      const hit = y > 0 && y < innerHeight ? document.elementFromPoint(x, y) : null
      return { name: b.querySelector('p.font-medium').textContent.trim(), version: b.querySelector('[data-testid="swap-version-of"]')?.textContent ?? null, h: Math.round(r.height), inside: r.left >= 0 && r.right <= innerWidth, tappable: !!hit && b.contains(hit) }
    })
  })()`)
  return { opened: !!opened, typed, rows: rows ?? [] }
}
const choose = async (machine, scopeText) => {
  const picked = await tap(`[...document.querySelectorAll('[data-testid="swap-dialog"] button')].find(b => b.querySelector('p.font-medium')?.textContent.trim() === ${JSON.stringify(machine)})`)
  await wait(900)
  const scoped = picked && await tap(`[...document.querySelectorAll('[data-testid="swap-dialog"] button')].find(b => b.querySelector('p.font-medium')?.textContent.trim() === ${JSON.stringify(scopeText)} && !b.disabled)`)
  const closed = scoped && await until(`!${q('[data-testid="swap-dialog"]')}`, 8000)
  await wait(900)
  return !!closed
}
const cardOf = async name => {
  if (!(await ev(`!!${row(name)}`))) return null
  if (!(await ev(`!!${row(name)}?.querySelector('[data-testid="exercise-load"]')`))) { await tap(`${row(name)}?.querySelector('[role="button"], .cursor-pointer')`); await wait(700) }
  return ev(`(() => { const r = ${row(name)}; return r ? { load: [...r.querySelectorAll('[data-testid="exercise-load"]')].map(n => n.textContent.trim()).join(' | '), text: r.innerText.slice(0, 300) } : null })()`)
}

console.log('\nA MACHINE AT HER GYM: FOUND IN THE SWAP SEARCH, SWAPPED IN, PRICED\n')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&load=1#/tab/exercise` })
await wait(4500)
const start = (await order()) ?? []
check('0. today shows a session to swap within', start.length >= 3, start)

// --- 1. A V-squat, priced as the hack squat --------------------------------------------------------------------------
const victim = start[1] ?? start[0]
const vs = await searchSwap(victim, 'v-squat')
check('1a. the swap sheet opens and its search takes typing', vs.opened && vs.typed, vs)
const vrow = vs.rows.find(r => r.name === 'V-Squat Machine')
check('1b. typing "v-squat" finds the V-Squat Machine', !!vrow, vs.rows.map(r => r.name))
check('1c. ...and the row says whose version it is and how it is priced', vrow?.version === 'A version of Hack Squat, priced like it.', vrow)
check('1d. ...on screen, a real tap target, where a finger lands', !!vrow && vrow.inside && vrow.h >= 44 && vrow.tappable, vrow)
await shoot('machine-swap-search')
check('1e. tapping it and "Just today" closes the sheet', await choose('V-Squat Machine', 'Just today'))
const after = (await order()) ?? []
check('1f. today\'s session now holds the V-Squat Machine, under its own name, where the old lift was', after.includes('V-Squat Machine') && !after.includes(victim) && after.indexOf('V-Squat Machine') === start.indexOf(victim), after)
const vcard = await cardOf('V-Squat Machine')
check('1g. ...with a weight on its card, in kilos', /\d/.test(vcard?.load ?? '') && /kg/.test(vcard?.load ?? ''), vcard)
await shoot('machine-swap-card')

// --- 2. An iso-lateral leg press, per leg ----------------------------------------------------------------------------
// A WORKING slot, never the first row: that one is the session's light movement prep, which keeps its own prescription.
const second = [...after].reverse().find((n, i, a) => n !== 'V-Squat Machine' && i < a.length - 1) ?? ''
const il = await searchSwap(second, 'iso lateral leg press')
const irow = il.rows.find(r => r.name === 'Iso-Lateral Leg Press')
check('2a. "iso lateral leg press" finds the Iso-Lateral Leg Press, marked as a version of Leg Press', irow?.version === 'A version of Leg Press, priced like it.', il.rows)
check('2b. choosing it lands', await choose('Iso-Lateral Leg Press', 'Just today'))
const icard = await cardOf('Iso-Lateral Leg Press')
check('2c. its weight is per leg, since each side is loaded on its own, and it is a working lift, not movement prep', /\d/.test(icard?.load ?? '') && /per leg/i.test(icard?.load ?? '') && !/movement prep/i.test(icard?.text ?? ''), icard)
await shoot('machine-swap-per-leg')
check('3. nothing on the page threw', pageErrors.length === 0, pageErrors)

console.log(failures ? `\n${failures} machine-swap check(s) failed` : '\nA machine at her gym is found, swapped in, and priced.')
try { ws.close() } catch {}
chrome.kill(); server.close()
process.exit(failures ? 1 : 0)

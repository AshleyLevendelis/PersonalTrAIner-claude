// ---------------------------------------------------------------------------
// "I HAVEN'T GOT THE KIT" CHANGES THE KIT FOR GOOD (runs 7-10, H34, 18 Oct 2026).
//
// Sam (minimalist, nothing said about his kit) had kettlebell and band work in his plan. On the swap sheet, "I
// haven't got the kit" offered only the four equipment choices, which change the next week and never what the app
// thinks he owns. Now the same step opens Profile's own ticks. Driven on Sam's setup (?sam=1&kit=1) through the
// app's own kit controller:
//   1. the kit step offers "Update what I have, for good", and the choices are labelled as the next 7 days;
//   2. it opens the ticks, as the equipment choice assumes them (Sam: kettlebell, bands, pull-up bar, bag, no bench);
//   3. unticking what he lacks and ticking the bench, the change is shown before Save, then saved as kit rows;
//   4. from today, the plan holds nothing that needs a kettlebell, a band, a pull-up bar or a bag.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => {
  const p = q.url.split('?')[0]
  const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p)
  if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return }
  r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' })
  r.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r)); const port = server.address().port
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9523', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms)); let t
for (let i = 0; i < 80; i++) { try { const l = await fetch('http://127.0.0.1:9523/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {} await wait(250) }
const ws = new WebSocket(t); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
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

// Radix opens menus on pointerdown, so real pointer events, not .click().
const rectOf = sel => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return null; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
const tap = async sel => { const r = await rectOf(sel); if (!r) return false; await wait(120); const r2 = await rectOf(sel); for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: r2.x, y: r2.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 }); return true }
const clickSel = sel => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return false; n.click(); return true })()`)
const has = sel => ev(`!!document.querySelector(${JSON.stringify(sel)})`)
const order = () => ev(`[...document.querySelectorAll('[data-exercise-name]')].map(n => n.getAttribute('data-exercise-name'))`)
const escape = async () => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await wait(450) }

const openRowMenu = async name => {
  if (await has('[role="menu"]')) await escape()
  const line = `[data-exercise-name=${JSON.stringify(name)}] [role="button"], [data-exercise-name=${JSON.stringify(name)}] .cursor-pointer`
  if (!(await has(`[data-exercise-name=${JSON.stringify(name)}] button[aria-label="Exercise options"]`))) {
    await tap(line); await wait(700)
  }
  if (!(await tap(`[data-exercise-name=${JSON.stringify(name)}] button[aria-label="Exercise options"]`))) return 'no-trigger'
  await wait(500)
  return (await has('[data-testid="remove-exercise"]')) ? 'open' : 'no-menu'
}
/** Open the remove sheet on a named row and answer "It hurts". */
const openHurts = async name => {
  if ((await openRowMenu(name)) !== 'open') return false
  if (!(await tap('[data-testid="remove-exercise"]'))) return false
  await wait(700)
  if (!(await clickSel('[data-reason="hurts"]'))) return false
  await wait(400)
  return true
}

let ran = 0
const checkCounted = (name, ok, detail) => { ran++; check(name, ok, detail) }

console.log('\n"I HAVEN\'T GOT THE KIT", FOR GOOD\n')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&sam=1&kit=1#/tab/exercise` })
await wait(4500)
const LACKS = ['kettlebell', 'resistance band', 'pull-up bar', 'weighted backpack']
const before = await ev(`window.__needsFromToday ? window.__needsFromToday(${JSON.stringify(LACKS)}) : null`)
checkCounted('0a. Sam\'s plan from today holds kit he does not have (the symptom: the guess put it there)', Array.isArray(before) && before.length > 0, before)
const rows = await order()
checkCounted('0b. today shows a session', Array.isArray(rows) && rows.length >= 2, rows)
const victim = rows[0]

checkCounted('1a. the swap sheet asks why, and "I haven\'t got the kit" asks which kit',
  (await openRowMenu(victim)) === 'open' && await tap('[data-testid="swap-exercise"]')
  && (await wait(900), await clickSel('[data-reason="no_kit"]')) && (await wait(500), await has('[data-testid="reason-kit"]')))
checkCounted('1b. it offers "Update what I have, for good"', (await ev(`document.querySelector('[data-testid="reason-kit-for-good"]')?.textContent?.trim() ?? null`)) === 'Update what I have, for good')
const kitText = await ev(`document.querySelector('[data-testid="reason-kit"]')?.innerText ?? ''`)
checkCounted('1c. ...and the equipment choices say what they are: the next 7 days', /Or just for the next 7 days, what have you got\?/.test(kitText), kitText.slice(0, 200))
checkCounted('1d. ...still offered beside it (the three he is not on)', JSON.stringify(await ev(`[...document.querySelectorAll('[data-kit]')].map(b => b.getAttribute('data-kit'))`)) === JSON.stringify(['full_gym', 'home_gym', 'bodyweight']), await ev(`[...document.querySelectorAll('[data-kit]')].map(b => b.getAttribute('data-kit'))`))
await shoot('kit-for-good-step')

checkCounted('2a. tapping it opens the ticks', await clickSel('[data-testid="reason-kit-for-good"]') && (await wait(500), await has('[data-testid="reason-kit-ticks"] [data-testid="kit-ticks"]')))
const ticked = () => ev(`[...document.querySelectorAll('[data-testid^="kit-tick-"]')].filter(b => b.getAttribute('aria-checked') === 'true').map(b => b.getAttribute('data-testid').replace('kit-tick-', ''))`)
const t0 = await ticked()
checkCounted('2b. ...as his equipment choice assumes them: no bench, and kettlebell, bands, pull-up bar, bag', JSON.stringify(t0) === JSON.stringify(['dumbbells', 'kettlebell', 'bands', 'pull_up_bar', 'weighted_bag']), t0)
await shoot('kit-for-good-ticks')

for (const item of ['bench', 'kettlebell', 'bands', 'pull_up_bar', 'weighted_bag']) { await clickSel(`[data-testid="kit-tick-${item}"]`); await wait(150) }
const t1 = await ticked()
checkCounted('3a. what he has: dumbbells and a flat bench', JSON.stringify(t1) === JSON.stringify(['dumbbells', 'bench']), t1)
let preview = null
for (let i = 0; i < 40; i++) { await wait(300); preview = await ev(`(() => { const p = document.querySelector('[data-testid="kit-preview"]'); const save = document.querySelector('[data-testid="kit-save"]'); return p ? { text: p.innerText, canSave: !!save && !save.disabled } : null })()`); if (preview?.canSave) break }
checkCounted('3b. the change is worked out and shown before anything is saved', !!preview && preview.canSave && !/Checking your plan/.test(preview.text), preview)
checkCounted('3c. ...and nothing is saved yet', JSON.stringify(await ev(`window.__kitRows()`)) === '[]', await ev(`window.__kitRows()`))
await shoot('kit-for-good-preview')
checkCounted('3d. Save', await clickSel('[data-testid="kit-save"]'))
let saved = []
for (let i = 0; i < 30; i++) { await wait(300); saved = await ev(`window.__kitRows()`); if (saved.length > 0) break }
const refs = saved.flatMap(r => r.refs ?? []).sort()
checkCounted('3e. saved for good: kit rows naming what he has and what he lacks', saved.length > 0 && ['bands', 'bench', 'kettlebell', 'pull_up_bar', 'weighted_bag'].every(x => refs.includes(x)), saved)
await wait(800)
const after = await ev(`window.__needsFromToday(${JSON.stringify(LACKS)})`)
checkCounted('4. FROM TODAY, NOTHING IN HIS PLAN NEEDS KIT HE SAID HE LACKS', Array.isArray(after) && after.length === 0, after)
await shoot('kit-for-good-saved')

console.log(`\n${ran} checks ran.`)
ws.close(); chrome.kill(); server.close()
if (failures > 0) { console.error(`${failures} check(s) failed.`); process.exit(1) }
console.log("\"I haven't got the kit\" changes the kit for good, and the plan follows.\n")

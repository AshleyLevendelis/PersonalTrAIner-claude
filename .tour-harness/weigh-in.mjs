// ---------------------------------------------------------------------------
// THE WEIGH-IN BOX ON HOME, AND THE WEIGHT FIELD ON PROFILE.
//
// 9 Oct 2026, the test log's H10 and L31. Under the weigh-in box the app said
// "Targets recalculate from your latest weigh-in · 7-day avg 62 kg" — neither
// half true (targets follow the 7-day average; that "average" was one row) —
// and Home said "-0.2 kg since week 1" for someone a kilo down, because it
// measured from the first weigh-in rather than the starting weight.
//
// The arithmetic is held by test:weigh-in-targets. This is what she SEES:
//   1. Home measures the change from where she started, and says so;
//   2. the line under the box states the rule, and calls a thin average what
//      it is ("avg of 1 weigh-in") until there are three;
//   3. a weigh-in far from the last one is CHECKED — and, until Ashley rules
//      on what should happen, is saved exactly as before with nothing new on
//      screen. Both halves, because "the check is asked" and "nothing visible
//      changed" each pass alone on a build that broke the other;
//   4. the Profile weight field asks the same check.
//
// When Ashley rules on the confirm step, sections 3d-3g are the checks that
// go red on purpose.
//
// PORT 9652.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('./dist/', import.meta.url).pathname
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((req, res) => {
  const p = req.url.split('?')[0]
  const f = join(DIST, p)
  if (!existsSync(f)) { res.writeHead(404); res.end('nf'); return }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream' })
  res.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r))
const port = server.address().port

const wait = ms => new Promise(r => setTimeout(r, ms))
const portBusy = await fetch('http://127.0.0.1:9652/json/version').then(() => true, () => false)
if (portBusy) { console.error('    ✗ port 9652 already has a browser on it — another run of this driver is still alive'); process.exit(1) }
// Its own profile directory: on the default one, a browser started while
// another driver's is up hands its window to THAT browser and exits.
const profileDir = mkdtempSync(join(tmpdir(), 'weigh-in-'))
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9652', `--user-data-dir=${profileDir}`, '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const giveUp = why => { console.error(`    ✗ ${why}`); try { chrome.kill('SIGKILL') } catch {} ; process.exit(1) }
// A stopwatch on the run, not a clock: it never decides what "today" is.
const watchdog = setTimeout(() => giveUp('the driver did not finish in 150 seconds'), 150_000)
let finishing = false
chrome.once('exit', code => { if (!finishing) giveUp(`the browser exited mid-run (code ${code}) — something outside this driver stopped it; run it again`) })

let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9652/json/list').then(r => r.json())
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
let ran = 0
const check = (name, ok, detail) => {
  ran++
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}
const until = async (fn, pred, tries = 40) => { let v = await fn(); for (let i = 0; i < tries && !pred(v); i++) { await wait(250); v = await fn() } return v }

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setFocusEmulationEnabled', { enabled: true })

const bodyText = () => ev(`document.body.innerText`)
// The fixture (real.tsx): started at 80 kg; weigh-ins of 80.6 kg on 21 Aug
// and 80 kg today. Read back from the page's own fake database below rather
// than trusted.
const metrics = () => ev(`(window.__fakeDb?.daily_metrics ?? []).map(r => r.date + ':' + r.weight_kg).sort()`)
const card = () => ev(`(() => { const c = document.querySelector('[data-testid="weigh-in-card"]'); return c ? { check: c.getAttribute('data-weigh-in-check'), difference: c.getAttribute('data-weigh-in-difference'), line: (c.querySelector('[data-testid="weigh-in-average"]')?.textContent ?? '').trim(), text: c.innerText } : null })()`)
const typeWeight = async kg => {
  const ok = await ev(`(() => {
    const n = document.querySelector('[data-testid="weigh-in-card"] input')
    if (!n) return false
    n.focus()
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(n, ${JSON.stringify(String(kg))})
    n.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  await wait(250)
  const tapped = await ev(`(() => { const b = [...document.querySelectorAll('[data-testid="weigh-in-card"] button')].find(x => (x.textContent || '').trim() === 'Save'); if (!b || b.disabled) return false; b.click(); return true })()`)
  await wait(900)
  return ok && tapped
}

await send('Page.navigate', { url: `http://127.0.0.1:${port}/.tour-harness/real.html?run=1` })
const up = await until(() => ev(`/Weight/.test(document.body.innerText) && !!document.querySelector('[aria-expanded]')`), v => v === true)
check('0. Home is up', up === true)
// The harness page opens with the app tour over it. Skipped, so the screen
// under test is the one being read (and the screenshots show it).
await ev(`(() => { const b = [...document.querySelectorAll('button, a')].find(x => (x.textContent || '').trim() === 'Skip'); if (b) b.click(); return !!b })()`)
await wait(500)

console.log('\n1. Home measures the change from where she started\n')
{
  const before = await metrics()
  check('1a. the fixture is what this driver assumes: 80.6 kg in August, 80 kg today, started at 80', before.length === 2 && before.some(m => m.endsWith(':80.6')) && before.some(m => m.endsWith(':80')), before)
  const t = await bodyText()
  check('1b. the label says "since you started"', /since you started/.test(t), t.slice(0, 600))
  check('1c. ...and "since week 1" is gone', !/since week 1/.test(t))
  // Measured from the first of the rows on the chart it would read -0.6
  // (80 today against 80.6 in August). From the 80 kg she started at, 0.0.
  check('1d. the figure is from the starting weight: 0.0 kg, where the old sum gave -0.6', /(^|\s)0\.0 kg since you started/.test(t) && !/-0\.6 kg/.test(t), (t.match(/[-+]?\d+\.\d kg since[^\n]*/) ?? [])[0])
  await shoot('weigh-in-home')
}

console.log('\n2. The line under the box says what the targets follow\n')
{
  const opened = await ev(`(() => { const b = [...document.querySelectorAll('button[aria-expanded]')].find(x => /kg/.test(x.textContent || '') && x.closest('div')?.parentElement?.textContent?.includes('Weight')); if (!b) return false; if (b.getAttribute('aria-expanded') !== 'true') b.click(); return true })()`)
  check('2a. the weigh-in box opens from the Weight figure', opened === true)
  const c = await until(card, v => !!v && v.line.length > 0)
  check('2b. it states the rule: "Targets follow your 7-day average"', !!c && c.line.startsWith('Targets follow your 7-day average'), c?.line)
  check('2c. ...and calls one weigh-in in the last week what it is: "avg of 1 weigh-in 80 kg"', !!c && c.line === 'Targets follow your 7-day average · avg of 1 weigh-in 80 kg', c?.line)
  check('2d. the old claim is gone from the screen', !/recalculate from your latest weigh-in/i.test(await bodyText()))
  check('2e. no check has been made yet, so none is recorded', !!c && c.check === null, c?.check)
}

console.log('\n3. A believable weigh-in, then one that is not\n')
{
  check('3a. typing 79.4 and saving', await typeWeight(79.4))
  const c1 = await until(card, v => !!v && /79\.4/.test(v.line))
  check('3b. it is saved over today\'s row', (await metrics()).some(m => m.endsWith(':79.4')) && (await metrics()).length === 2, await metrics())
  check('3c. the check was asked and found it fine', c1?.check === 'ok' && c1?.difference === null, c1)
  const home1 = await until(bodyText, t => /-0\.6 kg since you started/.test(t))
  check('3c2. Home now reads 0.6 kg down since she started (80 -> 79.4)', /-0\.6 kg since you started/.test(home1), (home1.match(/[-+]?\d+\.\d kg since[^\n]*/) ?? [])[0])

  const textBefore = (await card())?.text ?? ''
  const dialogs = () => ev(`document.querySelectorAll('[role="dialog"], [role="alertdialog"]').length`)
  const dialogsBefore = await dialogs()
  check('3d. typing 62 — 17.4 kg under the last weigh-in — and saving', await typeWeight(62))
  const c2 = await until(card, v => !!v && /62/.test(v.line))
  // WHAT IT SAYS, AND WHAT THE SCREEN SHOWS AFTERWARDS: both halves.
  check('3e. the check was asked and found it SURPRISING, by 17.4 kg', c2?.check === 'surprising' && c2?.difference === '-17.4', c2)
  check('3f. ...and, with the owner decision open, it is saved exactly as before', (await metrics()).some(m => m.endsWith(':62')), await metrics())
  const t2 = await bodyText()
  check('3g. ...with nothing new on screen: no question, no warning, no dialog',
    !/surprising|are you sure|is that right|did you mean|double.check/i.test(t2) && (await dialogs()) === dialogsBefore, { dialogsBefore, dialogsAfter: await dialogs() })
  // The card reads as it did, numbers aside: same lines, same controls.
  const shape = s => s.replace(/[\d.,]+/g, '#')
  check('3h. the card is the same card with different numbers', shape(c2?.text ?? '') === shape(textBefore), { before: shape(textBefore), after: shape(c2?.text ?? '') })
  check('3i. the line still calls it an average of one weigh-in', c2?.line === 'Targets follow your 7-day average · avg of 1 weigh-in 62 kg', c2?.line)
  // A LINE IS ONLY SHOWN IF IT IS ON SCREEN: scrolled to, it sits inside the
  // viewport and clear of the tab bar.
  await ev(`document.querySelector('[data-testid="weigh-in-card"]')?.scrollIntoView({ block: 'center' })`)
  await wait(400)
  const box = await ev(`(() => { const n = document.querySelector('[data-testid="weigh-in-average"]'); if (!n) return null; const r = n.getBoundingClientRect(); const at = document.elementFromPoint(r.left + 10, r.top + r.height / 2); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: innerHeight, onTop: !!at && (at === n || n.contains(at) || at.contains(n)) } })()`)
  check('3i2. ...and it can be read: inside the screen with nothing drawn over it', !!box && box.top >= 0 && box.bottom <= box.h && box.onTop === true, box)
  await shoot('weigh-in-surprising')

  check('3j. a weight outside 25-350 kg is refused as it always was', await typeWeight(18))
  const c3 = await card()
  check('3k. ...with the same sentence, and nothing saved', /Enter a weight between 25 and 350 kg/.test(c3?.text ?? '') && (await metrics()).some(m => m.endsWith(':62')) && !(await metrics()).some(m => m.endsWith(':18')), c3?.text)
}

console.log('\n4. The Profile weight field asks the same check\n')
{
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/.tour-harness/profile.html?run=2` })
  await until(() => ev(`!!document.querySelector('[data-testid="open-profile"]')`), v => v === true)
  await ev(`document.querySelector('[data-testid="open-profile"]').click()`)
  await until(() => ev(`!!document.querySelector('[data-slot="dialog-content"]')`), v => v === true)
  // The "You" group is collapsed by default; its rows are not in the DOM until it is opened.
  const openedYou = await ev(`(() => { const b = [...document.querySelectorAll('button[aria-expanded]')].find(x => /^You$/i.test((x.textContent || '').trim())); if (!b) return false; if (b.getAttribute('aria-expanded') !== 'true') b.click(); return true })()`)
  check('4a. the You group opens', openedYou === true)
  const field = '[data-testid="profile-weight-field"]'
  const present = await until(() => ev(`!!document.querySelector('${field} input')`), v => v === true)
  check('4b. the weight field is there, holding the 80 kg she started at', present === true && (await ev(`document.querySelector('${field} input')?.value`)) === '80', await ev(`document.querySelector('${field} input')?.value`))
  // TYPED THE WAY A THUMB TYPES IT: select what is there, insert the text
  // through the browser's own input pipeline, press Enter (the field blurs
  // itself on Enter, and its save is on blur). Setting .value from script and
  // calling .blur() left the profile row at 80 — the field never saw a blur it
  // believed — so this driver would have "passed" a field that saved nothing.
  const typeInto = async value => {
    const focused = await ev(`(() => { const n = document.querySelector('${field} input'); if (!n) return false; n.scrollIntoView({ block: 'center' }); n.focus(); n.select(); return document.activeElement === n })()`)
    await send('Input.insertText', { text: String(value) })
    await wait(150)
    for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 })
    await wait(500)
    return focused
  }
  const savedWeight = () => ev(`(window.__fakeDb?.fitness_profiles ?? []).map(r => r.weight_kg)[0]`)
  const verdict = () => ev(`document.querySelector('${field}')?.getAttribute('data-weigh-in-check')`)
  check('4c. no check before anything is typed', (await verdict()) === null, await verdict())
  await typeInto(79)
  check('4d. 79 for 80 is saved, checked and fine', (await until(verdict, v => v != null)) === 'ok' && (await savedWeight()) === 79, { verdict: await verdict(), saved: await savedWeight() })
  await typeInto(28)
  check('4e. 28 for 79 — a slipped digit — is checked and surprising', (await until(verdict, v => v === 'surprising')) === 'surprising', await verdict())
  check('4f. ...and is saved as before: the profile now holds 28', (await savedWeight()) === 28 && (await ev(`document.querySelector('${field} input')?.value`)) === '28', await savedWeight())
  const t = await bodyText()
  check('4g. ...with nothing new said about it', !/surprising|are you sure|is that right|did you mean/i.test(t))
  await ev(`document.querySelector('${field}')?.scrollIntoView({ block: 'center' })`)
  await wait(300)
  await shoot('weigh-in-profile')
}

console.log(`\n${ran} checks ran.`)
clearTimeout(watchdog)
finishing = true
await new Promise(r => { chrome.once('exit', r); chrome.kill(); setTimeout(r, 5000) })
server.close()
if (failures > 0) { console.error(`${failures} check(s) failed`); process.exit(1) }
console.log('The weigh-in box says what is true, and a doubtful weight is checked.\n')
process.exit(0)

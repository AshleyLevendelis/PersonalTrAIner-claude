// ---------------------------------------------------------------------------
// WORKOUT CHANGES BY TYPING, IN THE REAL CHAT — Ashley, 27 Oct 2026: "a user can just type a change ... It needs to
// all work ... and not break." The half of verify:workout-scenarios that only the coach's screen shows.
//
//   A. AN UNDO THAT DOES NOT SAVE SAYS SO. "Take today off" is applied; then the connection loses the write and she
//      taps Undo. The card said "Put back — everything is as it was before" while the day stayed a rest day. Now it
//      says it didn't undo, keeps the button, and a second tap with the connection back works.
//   B. THE COACH READS THE WEEK SHE IS IN (?reschedule=1: her training days changed from week 2). "I missed <a day
//      that trains now>" found no session, because the coach looked the date up in the plan's FIRST week; and a day
//      week 2 left free still offered to mark its old session missed.
//
// The model is stubbed at the fetch boundary, keyed by WHAT WAS SAID, with the tool call the deployed prompt
// documents for that sentence. What the real model calls is the coach exam's to grade, not this.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'
import { anchorDate, iso as anchorIso, DAY_NAMES } from './anchor.mjs'

const DIST = new URL('./dist/', import.meta.url).pathname
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((req, res) => {
  const p = req.url.split('?')[0]
  const f = join(DIST, p === '/' ? '/.tour-harness/chat.html' : p)
  if (!existsSync(f)) { res.writeHead(404); res.end('nf'); return }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream' })
  res.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r))
const port = server.address().port
const PORT = 9682
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { target = g.webSocketDebuggerUrl; break } } catch {}
  await wait(250)
}
const ws = new WebSocket(target); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pending = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value
const shoot = async name => { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname, Buffer.from(s.result.data, 'base64')) }

let failures = 0
let ran = 0
const check = (name, ok, detail) => {
  ran++
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ''}`) }
}
const J = JSON.stringify
const iso = n => { const d = anchorDate(); d.setDate(d.getDate() + n); return anchorIso(d) }
const nameOf = n => DAY_NAMES[new Date(`${iso(n)}T12:00:00`).getDay()]
const TODAY = iso(0)

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setFocusEmulationEnabled', { enabled: true })

// "take today off" is a rest day for today; "I missed <Day> (<date>)" is a missed session for that date.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      const said = String(JSON.parse(init && init.body ? init.body : '{}').message || '')
      const date = (said.match(/\\d{4}-\\d{2}-\\d{2}/) || [])[0]
      const proposal = /take today off/i.test(said)
        ? { kind: 'propose_rest_day', rawArgs: { date: ${J(TODAY)} } }
        : /missed/i.test(said) && date
        ? { kind: 'propose_missed_session', rawArgs: { date } }
        : undefined
      return new Response(JSON.stringify({ reply: proposal ? '' : 'Okay.', proposal }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return realFetch(url, init)
  }
` })

const setValue = `(el, v) => { Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }`
const say = async text => {
  await ev(`(() => { const t = document.querySelector('textarea'); if (t) (${setValue})(t, ${J(text)}) })()`)
  await wait(400)
  return ev(`(() => { const b = [...document.querySelectorAll('button')].find(b => /send/i.test(b.getAttribute('aria-label') || '')); if (!b || b.disabled) return false; b.click(); return true })()`)
}
const offers = () => ev(`document.querySelectorAll('[data-testid="proposal-card"][data-offer="text"]').length`)
const lastText = () => ev(`document.body.innerText.replace(/\\s+/g, ' ').slice(-400)`)
const clickLast = label => ev(`(() => { const b = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === ${J(label)}).pop(); if (!b || b.disabled) return false; b.click(); return true })()`)
const until = async (expr, ms = 10000) => { const t0 = Date.now(); let v = await ev(expr); while (!v && Date.now() - t0 < ms) { await wait(250); v = await ev(expr) } return v }
const boot = async flags => {
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?${flags}` })
  await wait(3000)
  return until(`!!document.querySelector('textarea') && window.__planArrived === true`, 12000)
}
const restRow = () => ev(`(window.__fakeDb?.workout_sessions ?? []).find(r => r.date === ${J(TODAY)}) ?? null`)

console.log('\nWORKOUT CHANGES BY TYPING — in the real chat\n')

// ---- A. An Undo that does not save ---------------------------------------------------------------------------------
console.log('  A. AN UNDO THAT DOES NOT SAVE SAYS SO')
check('A0. the chat is up', await boot('load=a') === true)
await say('take today off')
check('A1. "take today off" offers a rest day', !!(await until(`document.querySelectorAll('[data-testid="proposal-card"][data-offer="text"]').length > 0`)), await lastText())
check('A2. Apply', await clickLast('Apply'))
check('A3. ...today is a rest day she chose', !!(await until(`(window.__fakeDb?.workout_sessions ?? []).some(r => r.date === ${J(TODAY)} && r.deliberate_rest === true)`)), await restRow())
await until(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Undo')`)
// The connection drops for exactly this write: the day's row cannot be changed.
await ev(`window.__failWrite = (t) => t === 'workout_sessions'`)
check('A4. Undo is tapped while the save cannot land', await clickLast('Undo'))
await wait(1500)
const afterFail = await lastText()
check('A5. THE CARD SAYS IT DID NOT UNDO (it said "Put back")', /didn't undo/i.test(afterFail) && !/was taken back/i.test(afterFail), afterFail)
check('A6. ...the day is still a rest day, as the card now says', (await restRow())?.deliberate_rest === true, await restRow())
check('A7. ...and the Undo button is still there to try again', await ev(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Undo')`))
await shoot('workout-scenarios-chat-undo-failed')
await ev(`window.__failWrite = undefined`)
check('A8. with the connection back, Undo works', await clickLast('Undo') && !!(await until(`(window.__fakeDb?.workout_sessions ?? []).some(r => r.date === ${J(TODAY)} && r.deliberate_rest === false)`)), await restRow())
check('A9. ...and only now says it was put back', !!(await until(`/was taken back/i.test(document.body.innerText)`)), await lastText())

// ---- B. The coach reads the week she is in ------------------------------------------------------------------------
console.log('\n  B. THE COACH READS THE WEEK SHE IS IN (training days changed from week 2)')
check('B0. the chat is up with the changed plan', await boot('reschedule=1&load=b') === true)
const r = await ev('window.__reschedule')
// A past day of THIS plan week (week 2 began on the Monday of this strip in this fixture), trained now and not in
// week 1 — and one trained in week 1 that week 2 left free. Asked of the page, never named.
const pastThisWeek = [-2, -1, 0].filter(n => DAY_NAMES[new Date(`${iso(n)}T12:00:00`).getDay()] !== 'Sunday')
const trainsNow = pastThisWeek.find(n => r?.week2.includes(nameOf(n)) && !r?.week1.includes(nameOf(n)))
const freedNow = pastThisWeek.find(n => r?.week1.includes(nameOf(n)) && !r?.week2.includes(nameOf(n)))
check('B1. the fixture has a day that trains only in the new schedule, and one only in the old', trainsNow !== undefined && freedNow !== undefined, { r, pastThisWeek })
const before = await offers()
await say(`I missed ${nameOf(trainsNow ?? 0)} ${iso(trainsNow ?? 0)}`)
await wait(2500)
check(`B2. "I missed ${nameOf(trainsNow ?? 0)}" (a day she trains now) is offered as missed`, (await offers()) > before && /as missed/i.test(await lastText()), await lastText())
await shoot('workout-scenarios-chat-reschedule')
await clickLast('Not now')
await wait(600)
const before2 = await offers()
await say(`I missed ${nameOf(freedNow ?? 0)} ${iso(freedNow ?? 0)}`)
await wait(2500)
check(`B3. "I missed ${nameOf(freedNow ?? 0)}" (a day the new schedule left free) offers nothing to mark`, (await offers()) === before2, await lastText())

// ---- C. Apply with no connection --------------------------------------------------------------------------------------
console.log('\n  C. APPLY WITH NO CONNECTION')
check('C0. the chat is up', await boot('load=c') === true)
await say('take today off')
check('C1. the rest-day offer is up', !!(await until(`document.querySelectorAll('[data-testid="proposal-card"][data-offer="text"]').length > 0`)), await lastText())
// Every request now fails the way a dead phone's do: resolved, with an error, and the browser still "online".
await ev(`window.__netDown = true`)
check('C2. Apply is tapped with no connection', await clickLast('Apply'))
await wait(1500)
const dead = await ev(`(() => { const c = [...document.querySelectorAll('[data-testid="proposal-card"]')].pop(); return c ? { status: c.getAttribute('data-card-status'), text: c.innerText.replace(/\\s+/g, ' '), apply: [...c.querySelectorAll('button')].some(b => b.textContent.trim() === 'Apply') } : null })()`)
check('C3. THE OFFER DOES NOT SAY IT TIMED OUT (it did, and lost its button)', !!dead && dead.status === 'pending' && !/timed out/i.test(dead.text), dead)
check('C4. ...it says nothing was changed', !!dead && /nothing was changed/i.test(dead.text), dead)
check('C5. ...and keeps Apply', !!dead && dead.apply === true, dead)
check('C6. ...and nothing was written', (await restRow())?.deliberate_rest !== true, await restRow())
await shoot('workout-scenarios-chat-offline')
await ev(`window.__netDown = undefined`)
check('C7. back online, the same Apply works', await clickLast('Apply') && !!(await until(`(window.__fakeDb?.workout_sessions ?? []).some(r => r.date === ${J(TODAY)} && r.deliberate_rest === true)`)), await restRow())

console.log(`\n${ran} checks ran. ${failures === 0 ? 'A failed Undo says so; the coach reads the week she is in; an offer tapped offline stays live.' : `${failures} check(s) FAILED.`}\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)

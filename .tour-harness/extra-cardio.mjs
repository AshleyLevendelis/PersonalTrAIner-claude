// ---------------------------------------------------------------------------
// SAM'S RUN, ON REAL SCREENS (live test, 20 Oct 2026; docs/plans/extra-cardio-and-distance.md).
//
// "I went for a 40 minute run at lunch, about 6km, pretty hard" on a lifting day, with a knee being eased off.
//
// A. THE EXERCISE TAB (real.tsx, ?kneeease=1): Add unplanned work → Cardio → Other → Run, 40 min, Hard, 6 km. The
//    row saves the distance, reads back "Run · 40 min · Hard · 6 km" under Additional work, and the one question
//    about the knee is on screen after the panel closes; "It hurt" opens the chat with her message ready, unsent.
//    A walk asks nothing, and nothing is asked with no ease-off running.
// B. THE COACH (chat.tsx, ?kneeease=1): the model's turn is stubbed at the fetch boundary as the new edge function
//    sends it (a propose_cardio_log, no prose). The offer leads with "Log it" and offers "Count it as today's
//    workout" because today's session is still due; nothing is written before a tap. "Log it" writes one row with
//    the distance, swaps nothing, and the knee question follows, saved; Undo takes it back. "Count it" swaps the day.
//
// WHAT THIS DOES NOT PROVE: App.tsx's wiring (no harness page boots it), or what the real model calls.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'
import { anchorDate } from './anchor.mjs'

const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => {
  const p = q.url.split('?')[0]
  const page = new URL(q.url, 'http://x').searchParams.get('page') === 'chat' ? '/.tour-harness/chat.html' : '/.tour-harness/real.html'
  const f = join(DIST, p === '/' ? page : p)
  if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return }
  r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' }); r.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r)); const port = server.address().port
const PORT = 9631
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms)); let t
for (let i = 0; i < 80; i++) { try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {} await wait(250) }
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

const J = JSON.stringify
const pointAt = async at => { for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 }) }
const centreOf = expr => ev(`(() => { const n = ${expr}; if (!n) return null; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null })()`)
const tapExpr = async expr => { const at = await centreOf(expr); if (!at) return false; await wait(150); const again = await centreOf(expr); await pointAt(again ?? at); await wait(500); return true }
const q = sel => `document.querySelector(${J(sel)})`
const byText = (text, tag = 'button') => `[...document.querySelectorAll(${J(tag)})].reverse().find(b => (b.textContent || '').replace(/\\s+/g, ' ').trim() === ${J(text)})`
/** "＋ Add" first (30 Oct 2026, "less is more"): the two ways to add sit behind it. */
const openAddChoice = async label => {
  if (!(await ev(`!!document.querySelector('[data-testid="add-open"][aria-expanded="true"]')`))) {
    if (!(await tapExpr(q('[data-testid="add-open"]')))) return false
  }
  return tapExpr(byText(label))
}
const until = async (expr, ms = 8000) => { const t0 = Date.now(); let v = await ev(expr); while (!v && Date.now() - t0 < ms) { await wait(200); v = await ev(expr) } return v }
const typeText = async text => { for (const ch of String(text)) { await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }) } await wait(250) }
const texts = sel => ev(`[...document.querySelectorAll(${J(sel)})].map(n => n.innerText.replace(/\\s+/g, ' ').trim())`)
// The driver's own copy of the ease-off end date, from the fixture's input (anchor + 2 days): never the app's.
const endDay = (() => { const d = anchorDate(); d.setDate(d.getDate() + 2); return `${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]}` })()
const KNEE_Q = `How did your knees feel on the run? They're being eased off until ${endDay}.`

let loads = 0
const loadExercise = async qs => {
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&n=${++loads}&${qs}#/tab/exercise` })
  return until(`document.querySelectorAll('[data-exercise-name]').length > 0 && !!document.querySelector('[data-testid="add-open"]')`, 15000)
}
/** "Add unplanned work → Cardio → Other → <name>, <minutes>, <effort>, <km> → tick". */
const logUnplanned = async (name, minutes, effort, km) => {
  if (!(await openAddChoice('Add unplanned work'))) return 'no "Add unplanned work"'
  if (!(await tapExpr(byText('Cardio')))) return 'no Cardio tab'
  if (!(await tapExpr(q('[data-testid="quick-log-other"]')))) return 'no Other chip'
  if (!(await tapExpr(q('[data-testid="cardio-unplanned"] input[data-field="activity"]')))) return 'no name box'
  await typeText(name)
  if (!(await tapExpr(q('[data-testid="cardio-unplanned"] input[data-field="minutes"]')))) return 'no minutes box'
  await typeText(minutes)
  if (!(await tapExpr(q(`[data-testid="cardio-unplanned"] [data-effort="${effort}"]`)))) return 'no effort box'
  if (km != null) {
    if (!(await tapExpr(q('[data-testid="cardio-unplanned"] input[data-field="distance"]')))) return 'no distance box'
    await typeText(km)
  }
  if (!(await tapExpr(q('[data-testid="cardio-unplanned"] [data-testid="cardio-save"]')))) return 'no tick'
  await wait(1200)
  return 'ok'
}

console.log('\nSAM\'S RUN\n')

console.log('  A. THE EXERCISE TAB, a knee being eased off')
check('A0. the Exercise tab is up with a session', !!(await loadExercise('kneeease=1')))
const how = await logUnplanned('Run', '40', 'hard', '6')
check('A1. Add unplanned work → Cardio → Other → Run, 40 min, Hard, 6 km → tick', how === 'ok', how)
const rows = await ev(`(window.__fakeDb?.cardio_logs ?? []).map(r => ({ a: r.activity_name, m: r.duration_minutes, rpe: r.intensity_rpe, km: r.distance_km ?? null }))`)
check('A2. one row saved, with its distance', rows.length === 1 && rows[0].a === 'Run' && rows[0].m === 40 && rows[0].km === 6, rows)
const readback = await texts('[data-testid="additional-cardio"] [data-testid="cardio-readback"]')
check('A3. it reads back under Additional work as "Run · 40 min · Hard · 6 km"', readback.length === 1 && readback[0].startsWith('Run · 40 min · Hard · 6 km'), readback)
const askText = await until(`${q('[data-testid="ease-off-question"]')}?.innerText ?? null`, 6000)
check('A4. THE KNEE QUESTION IS ON SCREEN after the panel closed, in the app\'s words', typeof askText === 'string' && askText.includes(KNEE_Q), askText)
const inView = await ev(`(() => { const n = ${q('[data-testid="ease-off-question"]')}; if (!n) return false; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight })()`)
check('A5. ...where she can see it', inView === true)
check('A6. ...with two answers, each a full-size tap', (await ev(`[...(${q('[data-testid="ease-off-question"]')}?.querySelectorAll('button') ?? [])].map(b => (b.textContent || '').trim() + ':' + (b.getBoundingClientRect().height >= 44)).join('|')`)) === 'Felt fine:true|It hurt:true')
await shoot('extra-cardio-screen-ask')
check('A7. nothing about the plan changed: the session is still on today', (await ev(`document.querySelectorAll('[data-exercise-name]').length`)) > 0)
check('A8. "It hurt" taps', await tapExpr(byText('It hurt')))
await wait(600)
check('A9. ...opens the chat with her message ready, not sent', (await ev('location.hash')) === '#/tab/chat' && (await ev(`sessionStorage.getItem('fitplan_chat_prefill_v1')`)) === 'My knees hurt on the run',
  { hash: await ev('location.hash'), prefill: await ev(`sessionStorage.getItem('fitplan_chat_prefill_v1')`) })

check('A10. a fresh load, the same ease-off: a WALK asks nothing', !!(await loadExercise('kneeease=1')))
check('A11. walk logged', (await logUnplanned('Walk', '30', 'easy', null)) === 'ok')
await wait(1500)
check('A12. no question after a walk', (await ev(`!${q('[data-testid="ease-off-question"]')}`)) === true)
check('A13. a fresh load, NO ease-off running: a run asks nothing', !!(await loadExercise('')))
check('A14. run logged', (await logUnplanned('Run', '40', 'hard', '6')) === 'ok')
await wait(1500)
check('A15. no question with nothing being eased off', (await ev(`!${q('[data-testid="ease-off-question"]')}`)) === true)

console.log('\n  B. THE COACH')
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    const u = String(url)
    if (u.includes('chat-gemini')) {
      const said = String(JSON.parse((init && init.body) || '{}').message || '')
      if (/40 minute run/i.test(said)) {
        return new Response(JSON.stringify({ reply: '', proposal: { kind: 'propose_cardio_log', rawArgs: { activity_name: 'Run', duration_minutes: 40, effort: 'hard', distance_km: 6 } } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({ reply: 'Got it.' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return realFetch(url, init)
  }
` })
const setValue = `(el, v) => { const proto = window.HTMLTextAreaElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }`
const say = async text => {
  await ev(`(() => { const t = document.querySelector('textarea'); if (t) (${setValue})(t, ${J(text)}) })()`)
  await wait(300)
  return ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /send/i.test(x.getAttribute('aria-label') || '')); if (!b || b.disabled) return false; b.click(); return true })()`)
}
const SAID = 'I went for a 40 minute run at lunch, about 6km, pretty hard'
const loadChat = async () => {
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?page=chat&kneeease=1&n=${++loads}` })
  return until(`!!document.querySelector('textarea')`, 15000)
}
// RE-ANCHORED 31 Oct 2026: the offer's ANSWERS. The Listen icon on the coach's bubble (her 31 Oct ruling) reads the
// message aloud and answers nothing; verify:chat-2b holds it.
const offer = () => ev(`(() => { const c = [...document.querySelectorAll('[data-testid="proposal-card"]')].pop(); if (!c) return null;
  return { status: c.getAttribute('data-card-status'), text: c.innerText.replace(/\\s+/g, ' '), btns: [...c.querySelectorAll('button:not([data-listen])')].map(b => (b.textContent || '').trim()) } })()`)
const db = expr => ev(`(() => { const d = window.__fakeDb; return ${expr} })()`)

check('B0. the chat is up', !!(await loadChat()))
const todayFocus = await ev('window.__todayFocus ?? null')
check('B0b. today has a lifting session, still due', typeof todayFocus === 'string' && todayFocus.length > 0, todayFocus)
check('B1. her sentence goes', await say(SAID))
// The question types itself out: wait for its last words, not its first.
const o = await until(`(() => { const c = [...document.querySelectorAll('[data-testid="proposal-card"]')].pop(); return !!c && c.getAttribute('data-card-status') === 'pending' && /for today\\?/.test(c.innerText) })()`, 15000) ? await offer() : await offer()
check('B2. an offer that ASKS to log it, for today', /Want me to log your run for today\?/.test(o?.text ?? ''), o?.text)
check('B3. ...saying the run as she did it: 40 min, Hard, 6 km, as a fact, not "adds"', /Run: 40 min · Hard · 6 km/.test(o?.text ?? '') && !/adds/.test(o?.text ?? ''), o?.text)
check('B4. ...and that the lift stays unless she counts it', o?.text.includes(`${todayFocus} stays on today's plan, unless you count this as the workout.`) === true, o?.text)
check('B5. "Log it" leads, "Count it as today\'s workout" beside it, and Not now', JSON.stringify(o?.btns) === J(['Log it', "Count it as today's workout", 'Not now']), o?.btns)
check('B6. NOTHING IS WRITTEN BEFORE A TAP: no cardio row, no swap', (await db(`(d.cardio_logs ?? []).length`)) === 0 && (await db(`(d.workout_sessions ?? []).filter(r => r.swapped_for_activity).length`)) === 0)
await shoot('extra-cardio-chat-offer')
check('B7. "Log it"', await tapExpr(byText('Log it')))
await until(`/Logged/.test(document.body.innerText)`, 8000)
await wait(1200)
const logged = await db(`(d.cardio_logs ?? []).map(r => ({ a: r.activity_name, m: r.duration_minutes, rpe: r.intensity_rpe, km: r.distance_km ?? null }))`)
check('B8. ONE row: the run, 40 min, hard, 6 km', logged.length === 1 && logged[0].a === 'Run' && logged[0].m === 40 && logged[0].rpe >= 7 && logged[0].km === 6, logged)
check('B9. ...and the day is NOT swapped: the lift stays', (await db(`(d.workout_sessions ?? []).filter(r => r.swapped_for_activity).length`)) === 0)
const body1 = await ev('document.body.innerText')
check('B10. the receipt says Logged, with the run read back', /Logged/.test(body1) && /40 min · Hard · 6 km/.test(body1), body1.slice(-500))
const kneeMsg = await until(`[...document.querySelectorAll('button')].some(b => (b.textContent || '').trim() === 'My knees hurt on the run')`, 6000)
check('B11. THE KNEE QUESTION FOLLOWS, in the app\'s words, with her two answers as taps', !!kneeMsg && body1.length > 0 && (await ev('document.body.innerText')).includes(KNEE_Q) && (await ev(`[...document.querySelectorAll('button')].some(b => (b.textContent || '').trim() === 'Felt fine')`)) === true)
check('B12. ...saved, so a reload keeps it', (await db(`(d.chat_messages ?? []).some(m => m.role === 'assistant' && m.content === ${J(KNEE_Q)})`)) === true)
await shoot('extra-cardio-chat-logged')
check('B13. Undo', await tapExpr(byText('Undo')))
await wait(1500)
check('B14. ...takes the row back', (await db(`(d.cardio_logs ?? []).length`)) === 0, await db(`d.cardio_logs`))

check('B15. a fresh chat, the same sentence', !!(await loadChat()) && await say(SAID))
await until(`(() => { const c = [...document.querySelectorAll('[data-testid="proposal-card"]')].pop(); return c && c.getAttribute('data-card-status') === 'pending' })()`, 15000)
check('B16. "Count it as today\'s workout"', await tapExpr(byText("Count it as today's workout")))
await until(`/Logged/.test(document.body.innerText)`, 8000)
await wait(1200)
const swapped = await db(`(d.workout_sessions ?? []).filter(r => r.swapped_for_activity).map(r => r.swapped_for_activity)`)
check('B17. the run is logged AND counted as today\'s workout, named Run', (await db(`(d.cardio_logs ?? []).length`)) === 1 && JSON.stringify(swapped) === '["Run"]', swapped)
check('B18. ...and the receipt says what it replaced', (await ev('document.body.innerText')).includes(`counted as your workout instead of ${todayFocus}`))
await shoot('extra-cardio-chat-counted')

check('no uncaught error on any page', pageErrors.length === 0, pageErrors)
console.log(`\n${ran} checks ran. ${failures === 0 ? 'Sam\'s run is logged as extra, with its distance, and the knee is asked about.' : `${failures} check(s) FAILED.`}\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)

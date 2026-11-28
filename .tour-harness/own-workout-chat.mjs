// ---------------------------------------------------------------------------
// A WORKOUT OF HIS OWN, FROM THE CHAT (advise-then-allow fix 13, 28 Nov 2026).
//
// chat.tsx, the model's turn stubbed at the fetch boundary with propose_own_workout:
//   A. started now on a day with a plan session: the offer lists his exercises and says the plan's session stays;
//      nothing written before Apply; Apply writes it into the screen's own workout store, live, sets in the boxes;
//      Undo takes it back.
//   B. saved for a day ahead: in his workouts, on that day.
//   C. a name the app does not know is asked about, no card.
// NOT PROVEN HERE: the Exercise tab drawing it (test:own-workout and verify:own-workout hold the screen reading that
// store), or what the real model calls.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'
import { OPEN_OFFER_DETAILS_SCRIPT } from './driver-kit.mjs'

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
const PORT = 9737
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
// His "One line, numbers on tap" (17 Nov 2026): this driver reads what an offer SAYS, so it opens Details as he would.
// The folded default itself is held by verify:offer-text (1e-1f).
await send('Page.addScriptToEvaluateOnNewDocument', { source: OPEN_OFFER_DETAILS_SCRIPT })
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
/** (kept from the template) RE-ANCHORED 31 Oct 2026 (Exercise 2a): the two ways to add are at the foot, each one tap — "Add exercise", and
 *  "I also did…" for work off the plan. Asked for by what they do, never by their words. */
const openAddChoice = async label => tapExpr(q(/unplanned/i.test(label) ? '[data-testid="add-unplanned"]' : '[data-testid="add-exercise"]'))
const until = async (expr, ms = 8000) => { const t0 = Date.now(); let v = await ev(expr); while (!v && Date.now() - t0 < ms) { await wait(200); v = await ev(expr) } return v }
const typeText = async text => { for (const ch of String(text)) { await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }) } await wait(250) }
const texts = sel => ev(`[...document.querySelectorAll(${J(sel)})].map(n => n.innerText.replace(/\\s+/g, ' ').trim())`)

let loads = 0
const TODAY = '2026-09-16'
const own = () => ev(`(() => { const k = Object.keys(localStorage).find(k => k.startsWith('fitplan_own_workouts_v1:')); return k ? JSON.parse(localStorage.getItem(k)) : [] })()`)
const plans = () => ev(`(() => { const k = Object.keys(localStorage).find(k => k.startsWith('fitplan_own_plans_v1:')); return k ? JSON.parse(localStorage.getItem(k)).filter(p => !p.deleted) : [] })()`)

await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    const u = String(url)
    if (u.includes('chat-gemini')) {
      const body = JSON.parse((init && init.body) || '{}')
      const said = String(body.message || '')
      window.__lastContext = body.context ?? null
      const out = p => new Response(JSON.stringify({ reply: '', proposal: p }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (/my own session/i.test(said)) return out({ kind: 'propose_own_workout', rawArgs: { mode: 'start', name: 'Arms', items: [{ exercise: 'Barbell Bench Press', sets: 4, reps: '6', weight_kg: 60 }, { exercise: 'Hammer Curls' }] } })
      if (/for Saturday/i.test(said)) return out({ kind: 'propose_own_workout', rawArgs: { mode: 'plan', name: 'Hotel', date: '2026-09-19', items: [{ exercise: 'Goblet Squats', sets: 3, reps: '12' }] } })
      if (/felt easy/i.test(said)) return out({ kind: 'propose_lift_effort', rawArgs: { lift: window.__lift, felt: 'easy' } })
      if (/turbo/i.test(said)) return out({ kind: 'propose_own_workout', rawArgs: { mode: 'start', items: [{ exercise: 'Turbo Encabulator Press' }] } })
      return new Response(JSON.stringify({ reply: '' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
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
const loadChat = async (extra = '') => {
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?page=chat${extra}&n=${++loads}` })
  const up = await until(`!!document.querySelector('textarea')`, 15000)
  await ev(`Object.keys(localStorage).filter(k => k.startsWith('fitplan_own_')).forEach(k => localStorage.removeItem(k))`)
  return up
}
const offer = () => ev(`(() => { const c = [...document.querySelectorAll('[data-testid="proposal-card"]')].pop(); if (!c) return null;
  return { status: c.getAttribute('data-card-status'), text: c.innerText.replace(/\\s+/g, ' '), btns: [...c.querySelectorAll('button:not([data-listen]):not([data-report-reply]):not([data-testid="offer-details-toggle"])')].map(b => (b.textContent || '').trim()) } })()`)
const pendingOffer = () => until(`(() => { const c = [...document.querySelectorAll('[data-testid="proposal-card"]')].pop(); return !!c && c.getAttribute('data-card-status') === 'pending' })()`, 15000)

console.log('\nA WORKOUT OF HIS OWN, FROM THE CHAT (advise-then-allow fix 13)\n')
console.log('  A. STARTED NOW, on a day that has the plan\'s session')
check('A0. the chat is up on a training day', !!(await loadChat()))
check('A1. he asks', await say("Let's do my own session today: bench 4x6 at 60 and some hammer curls"))
check('A2. AN OFFER comes', !!(await pendingOffer()))
const a = await offer()
const at = a?.text ?? ''
check('A3. it asks to start it, by its name', /start \*?\*?Arms\*?\*? now/i.test(at), at)
check('A4. ...lists his exercises with his numbers, and the default where he gave none', /Barbell Bench Press[\s\S]*4 × 6 at 60 kg/.test(at) && /Hammer Curls[\s\S]*3 × 8-10/.test(at), at)
check('A5. ...says the plan\'s session stays (a separate workout)', /It's a separate workout: today's [^.]+ stays on your plan\./.test(at), at)
check('A6. NOTHING IS WRITTEN BEFORE A TAP', (await own()).length === 0, await own())
await shoot('own-workout-chat-offer')
const apply = (a?.btns ?? []).find(b => b !== 'Not now' && !/^Keep/.test(b))
check('A7. Apply taps', !!apply && await tapExpr(byText(apply)), a?.btns)
await until(`/Workout set up/.test(document.body.innerText)`, 8000)
await wait(600)
const w = await own()
check('A8. one workout of his own today, live, unfinished, under his name', w.length === 1 && w[0].date === TODAY && w[0].mode === 'live' && w[0].finishedAtIso === null && w[0].name === 'Arms', w)
check('A9. ...the sets in the boxes, none logged', w.length === 1 && w[0].items[0].sets.length === 4 && w[0].items[0].sets.every(s => !s.done && s.reps === '6' && s.weight === '60'), w[0]?.items?.[0])
const rc = await ev(`(() => { const n = [...document.querySelectorAll('[data-receipt-line]')].pop(); return n ? n.innerText.replace(/\\s+/g, ' ').trim() : null })()`)
check('A10. the receipt says it is set up and where it is', /^Workout set up · Arms started, on Exercise/.test(rc ?? '') && /Undo/.test(rc ?? ''), rc)
await shoot('own-workout-chat-done')
// THE COACH IS TOLD (Builder D's blocks, wired 28 Nov 2026): the next message carries his own workout and his setup answers.
check('A10b. the next message goes', await say('how is my day looking'))
await until(`!!window.__lastContext && /how is my day/.test(document.body.innerText)`, 8000)
await wait(400)
const ctx = await ev('window.__lastContext')
check('A10c. the coach is told his own workout, by name, in its own block', typeof ctx?.own_workouts === 'string' && /Arms/.test(ctx.own_workouts), ctx?.own_workouts)
check('A10d. ...and the setup answers it was not told before', typeof ctx?.setup_answers === 'string' && ctx.setup_answers.length > 20, ctx?.setup_answers)
check('A10e. ...and nothing about a watch on a page with none (null, not an empty block)', ctx && ctx.watch_waiting === null, ctx?.watch_waiting)
check('A11. Undo taps', await tapExpr(byText('Undo')))
await wait(1200)
check('A12. ...and it is gone (nothing was logged in it)', (await own()).length === 0, await own())

console.log('\n  B. SAVED FOR A DAY AHEAD')
check('B0. a fresh chat', !!(await loadChat()))
check('B1. he asks', await say('Set me up a hotel workout for Saturday'))
check('B2. AN OFFER comes', !!(await pendingOffer()))
const b = await offer()
check('B3. it asks to save it and put it on Saturday', /save \*?\*?Hotel\*?\*? to your workouts and put it on Saturday/i.test(b?.text ?? ''), b?.text)
const applyB = (b?.btns ?? []).find(x => x !== 'Not now' && !/^Keep/.test(x))
check('B4. Apply taps', !!applyB && await tapExpr(byText(applyB)), b?.btns)
await until(`/Workout set up/.test(document.body.innerText)`, 8000)
await wait(600)
const p = await plans()
check('B5. in his workouts, on Saturday, with his exercise', p.length === 1 && p[0].name === 'Hotel' && J(p[0].onDates) === J(['2026-09-19']) && p[0].items[0].name === 'Goblet Squats' && p[0].items[0].reps === '12', p)
check('B6. ...and nothing started today', (await own()).length === 0)

console.log('\n  C. A NAME THE APP DOES NOT KNOW')
check('C0. a fresh chat', !!(await loadChat()))
check('C1. he asks', await say('Start a turbo workout now'))
await until(`/couldn't find/.test(document.body.innerText)`, 10000)
check('C2. asked about, no card, nothing written', /I couldn't find "Turbo Encabulator Press" in the exercise list/.test(await ev('document.body.innerText')) && (await ev(`document.querySelectorAll('[data-testid="proposal-card"]').length`)) === 0 && (await own()).length === 0)

console.log('\n  D. HOW A LIFT FELT, TOLD IN THE CHAT (Builder D\'s route, wired 28 Nov 2026)')
check('D0. a chat mid-session (two sets of the first lift logged today)', !!(await loadChat('&day=mid')))
const sets = () => ev(`(window.__fakeDb?.exercise_set_logs ?? []).filter(r => r.date === '${TODAY}').map(r => ({ n: r.exercise_name, s: r.set_number, rpe: r.rpe ?? null }))`)
const before = await sets()
const liftName = before[0]?.n
await ev(`window.__lift = ${J(String(liftName ?? '').toLowerCase())}`)
check('D1. he says how it felt', !!liftName && await say('that felt easy'), before)
check('D2. AN OFFER, naming the lift and the answer', !!(await pendingOffer()) && new RegExp(`put ${liftName} down as too easy`).test((await offer())?.text ?? ''), (await offer())?.text)
check('D3. nothing written before the tap', J(await sets()) === J(before))
const applyD = ((await offer())?.btns ?? []).find(x => x !== 'Not now' && !/^Keep/.test(x))
check('D4. Apply taps', !!applyD && await tapExpr(byText(applyD)))
await until(`/Noted/.test(document.body.innerText)`, 8000)
await wait(600)
const after = await sets()
const lastSet = Math.max(...before.map(r => r.s))
check('D5. the answer is on the lift\'s LAST working set, and only there', after.filter(r => r.rpe != null).length === 1 && after.find(r => r.rpe != null)?.s === lastSet && after.length === before.length, after)
check('D6. Undo taps', await tapExpr(byText('Undo')))
await wait(1200)
check('D7. ...and the set has no answer again', (await sets()).every(r => r.rpe == null), await sets())

check('no uncaught error on the page', pageErrors.length === 0, pageErrors)
console.log(`\n${ran} checks ran. ${failures === 0 ? 'A workout of his own, from the chat.' : `${failures} check(s) FAILED.`}\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)

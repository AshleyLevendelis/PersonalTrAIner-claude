// ---------------------------------------------------------------------------
// A DAY WHOSE PLAN IS A WALK SHOWS THE WALK.
//
// Ashley, 15 Sep 2026: "I want when it adds a session like a cardio session
// that it's actually a useful card like other workouts not empty."
//
// The empty card was already shipping, and not from cardio. The beginner's
// walking plan is the only plan the app generates whose days hold a prescribed
// ACTIVITY rather than exercises — twenty minutes, an effort target, and a
// reason written for a person — and no screen component read any of it. Every
// reader decided "is this a session?" by counting exercises, got zero, and
// rendered a card whose entire offer was a blank "Log a walk or other
// activity" form. The plan said walk; the screen asked what you did.
//
// WHY THIS DRIVER AND NOT ONLY test:planned-activity. That gate runs the real
// decision functions and proves their answers, and it reads the three screens'
// source to prove each asks rather than infers. Neither can prove the card on
// a phone contains the words — a `test:` gate can never prove a branch is
// REACHED. The whole complaint was about what the card LOOKS like, so this
// reads it off a real Chromium at 390x844 and the screenshot is opened.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = '/home/user/PersonalTrAIner-claude/.tour-harness/dist/'
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => {
  const p = q.url.split('?')[0]
  const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p)
  if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return }
  r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' })
  r.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r))
const port = server.address().port
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9423', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let t
for (let i = 0; i < 80; i++) {
  try { const l = await fetch('http://127.0.0.1:9423/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {}
  await wait(250)
}
const ws = new WebSocket(t); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value

let failures = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 320)}` : ''}`) }
}

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

const URL_BASE = `http://127.0.0.1:${port}/?tour=off&walker=1`
await send('Page.navigate', { url: `${URL_BASE}#/tab/exercise` })
await wait(4500)

console.log('\nA DAY WHOSE PLAN IS A WALK SHOWS THE WALK\n')

// The fixture must actually BE a walking plan. Read from the rendered week,
// not asserted: a driver that silently fell back to a lifting profile would
// otherwise print six ticks about a card that was never on screen.
const want = await ev('window.__walkTarget ?? null')
check('0a. the fixture really is the walking plan, not a lifting one', !!want && !!want.activity, want)
check('0b. ...and that day carries no exercises, so the old readers saw a rest day',
  !!want && want.exercises === 0, want)
if (!want) {
  console.error('\nNo activity day in the fixture — nothing to read.\n')
  writeFileSync('/home/user/PersonalTrAIner-claude/.tour-harness/planned-activity.png',
    Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'))
  ws.close(); chrome.kill(); server.close(); process.exit(1)
}
console.log(`  prescribed: ${want.activity} · ${want.duration}m${want.targetRpe != null ? ` · RPE ${want.targetRpe}` : ''} on ${want.day}`)

// Pinned to the day that HOLDS it, read off the page — never a weekday name.
if (!want.isToday) {
  await send('Page.navigate', { url: `${URL_BASE}&today=${want.date}#/tab/exercise` })
  await wait(4000)
}

const card = await ev(`(() => {
  const marker = document.querySelector('[data-testid="planned-activity"]')
  const title = document.querySelector('[data-testid="activity-day-title"]')
  if (!marker) return { found: false, body: document.body.innerText.replace(/\\s+/g, ' ').slice(0, 400) }
  let c = marker
  for (let i = 0; i < 8 && c.parentElement; i++) { c = c.parentElement; if (/rounded/.test(String(c.className))) break }
  c.scrollIntoView({ block: 'center' })
  const btns = [...c.querySelectorAll('button')].map(b => (b.textContent || '').trim())
  return {
    found: true,
    title: (title?.textContent || '').trim(),
    prescription: marker.innerText.replace(/\\s+/g, ' ').trim(),
    card: c.innerText.replace(/\\s+/g, ' ').trim(),
    buttons: btns,
    clipped: [marker, ...marker.querySelectorAll('*')]
      .filter(n => n.scrollWidth > n.clientWidth + 1 && (n.textContent || '').trim().length > 0)
      .map(n => (n.textContent || '').trim().slice(0, 60)),
  }
})()`)

writeFileSync('/home/user/PersonalTrAIner-claude/.tour-harness/planned-activity.png',
  Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'))

check('1. the day carries a prescription block at all (this is the empty card)', card.found === true, card)
if (!card.found) {
  console.error('\nThe activity day still renders no prescription.\n')
  ws.close(); chrome.kill(); server.close(); process.exit(1)
}

// The driver's own copy of the scale — a literal, so it cannot agree with the
// app by construction. Effort is in words since 24 Sep 2026 (Ashley's "like a
// lifting set" ruling): "Walk · 20 min · Easy", not "20m · RPE 3".
const word = rpe => (rpe <= 4 ? 'Easy' : rpe <= 6 ? 'Steady' : 'Hard')
check('2. the prescription names the activity, the minutes and the effort',
  card.prescription.includes(want.activity) &&
    card.prescription.includes(`${want.duration} min`) &&
    (want.targetRpe == null || card.prescription.includes(`${want.duration} min · ${word(want.targetRpe)}`)),
  { shown: card.prescription, want })

// THE COACH'S REASON. It is written for a person and, before this, reached
// nobody: the one screen that could have shown it never read the field.
const reasonWords = String(want.reason || '').split(/\s+/).filter(w => w.length > 4).slice(0, 6)
check('3. and the coach\'s reason for it is on screen',
  reasonWords.length > 0 && reasonWords.every(w => card.card.toLowerCase().includes(w.toLowerCase().replace(/[^a-z0-9]/gi, ''))
    || card.card.toLowerCase().includes(w.toLowerCase())),
  { reason: want.reason, shown: card.card.slice(0, 200) })

// ONE CALL TO ACTION. The prescribed walk is the session; the "anything else"
// row under it must not glow as well, or the card asks for two things at once.
const lit = await ev(`[...document.querySelectorAll('[data-testid="cardio-save"]')].filter(n => n.className.includes('glow-pulse')).map(n => !!n.closest('[data-testid="planned-activity"]'))`)
check('3b. exactly one ✓ on the card is lit, and it is the prescribed walk\'s', lit.length === 1 && lit[0] === true, lit)

// ONE TAP, ON THE ✓ — like a set. The plan's minutes are in the box and its
// effort is chosen, so tapping the lit ✓ logs exactly what the plan asked.
const tapped = await ev(`(() => {
  const n = document.querySelector('[data-testid="planned-activity"] [data-testid="cardio-save"]')
  if (!n || !n.className.includes('glow-pulse')) return false
  const r = n.getBoundingClientRect()
  for (const type of ['mousedown', 'mouseup', 'click']) n.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }))
  return true
})()`)
await wait(900)
const readback = await ev(`(document.querySelector('[data-testid="planned-activity"] [data-testid="cardio-readback"]')?.innerText ?? '').replace(/\\s+/g, ' ').trim()`)
const stored = await ev(`(window.__fakeDb?.cardio_logs ?? []).map(r => ({ a: r.activity_name, m: r.duration_minutes, rpe: r.intensity_rpe }))`)
check('4. one tap on the lit ✓ logs the prescribed walk, and it reads back',
  tapped === true && readback.startsWith(`${want.activity} · ${want.duration} min`) && /Undo/.test(readback), { tapped, readback })
check('4b. ...stored as the plan wrote it — its minutes and its exact effort',
  stored.length === 1 && stored[0].a === want.activity && stored[0].m === want.duration && (want.targetRpe == null || stored[0].rpe === want.targetRpe),
  { stored, want })
// A SECOND WALK IS NOT SWALLOWED BY THE FIRST. The prescribed row reads back
// ONE log of its activity; an extra walk logged under "anything else" must
// read back there, not vanish behind the planned one. Two logs of one name is
// the case a name-based read-back gets wrong.
await ev(`(() => {
  const tap = n => { const r = n.getBoundingClientRect(); for (const t of ['mousedown', 'mouseup', 'click']) n.dispatchEvent(new MouseEvent(t, { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })) }
  const chip = [...document.querySelectorAll('[data-testid="cardio-unplanned"] [role="radio"]')].find(b => /^${want.activity}\\b/.test((b.innerText || '').trim()))
  if (chip) tap(chip)
  return !!chip
})()`)
await wait(300)
await ev(`(() => {
  const box = document.querySelector('[data-testid="cardio-unplanned"]')
  const easy = box?.querySelector('[data-effort="easy"]')
  if (easy && easy.getAttribute('aria-checked') !== 'true') easy.click()
  const n = box?.querySelector('[data-testid="cardio-save"]')
  if (!n) return false
  const r = n.getBoundingClientRect()
  for (const t of ['mousedown', 'mouseup', 'click']) n.dispatchEvent(new MouseEvent(t, { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }))
  return true
})()`)
await wait(900)
const extra = await ev(`[...document.querySelectorAll('[data-testid="activity-logged"] [data-testid="cardio-readback"]')].map(n => n.innerText.replace(/\\s+/g, ' ').trim())`)
const plannedStill = await ev(`(document.querySelector('[data-testid="planned-activity"] [data-testid="cardio-readback"]')?.innerText ?? '').replace(/\\s+/g, ' ').trim()`)
const count = await ev(`(window.__fakeDb?.cardio_logs ?? []).length`)
check('4c. a second walk logged under "anything else" reads back there',
  // EXACTLY ONE receipt there, and it is the 30-minute one: the prescribed walk
  // must not ALSO be listed under "anything else" — the claim is what stops it.
  count === 2 && extra.length === 1 && extra[0].startsWith(`${want.activity} · 30 min`) && plannedStill.startsWith(`${want.activity} · ${want.duration} min`), { count, extra, plannedStill })
writeFileSync('/home/user/PersonalTrAIner-claude/.tour-harness/planned-activity-logged.png',
  Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'))

// THE HEADLINE. A prescribed session must not introduce itself as recovery.
check('5. the card does not call a prescribed session "active recovery"',
  !/active recovery/i.test(card.card), { title: card.title, card: card.card.slice(0, 160) })
check('6. it says what it is instead', card.title.includes(want.activity), card.title)

// THE FREE-TEXT FORM IS STILL THERE, and no longer pretending to be the
// prescription. "Log a walk" underneath a prescribed walk is the same button
// twice.
// RE-ANCHORED 20 Sep 2026. This matched the old link's exact words, "log
// something else you did". The rest-day rebuild (design 4a) replaced the blank
// form with one-tap chips on all three cards, so the LINK is gone and the
// capability is not: on a day that already prescribes something the section
// asks "Did anything else?" and offers the same chips. The property is that
// this day still has a way to log something beyond its prescription, which is
// what the check below it depends on too.
check('7. the blank form is still offered, for anything else you did',
  /did anything else\?/i.test(card.card) && /\bwalk\b/i.test(card.card), card.card.slice(0, 240))
check('8. ...and no longer offers to "log a walk" beside a prescribed walk',
  !/log a walk or other activity/i.test(card.card), card.card.slice(0, 240))

check('9. nothing in the prescription is cutting its own text off', (card.clipped || []).length === 0, card.clipped)

// THE WEEK KNOWS TOO. The strip and the browse list filtered activity days out
// entirely, so the beginner's whole plan was absent from the week view.
const weekUrl = want.isToday ? `${URL_BASE}#/tab/exercise` : `${URL_BASE}&today=${want.date}#/tab/exercise`
await send('Page.navigate', { url: weekUrl })
await wait(3500)
const week = await ev(`(() => {
  const btn = [...document.querySelectorAll('button, [role="button"]')].find(b => /full program|browse|program/i.test((b.textContent || '').trim()))
  if (btn) btn.click()
  return new Promise(res => setTimeout(() => res(document.body.innerText.replace(/\\s+/g, ' ').trim()), 1200))
})()`)
check('10. the week view gives the activity day a line of its own',
  new RegExp(`${want.activity}[^]{0,24}${want.duration} min`, 'i').test(week || ''),
  (week || '').slice(0, 400))
check('11. ...and does not call it light movement and mobility',
  !/light movement and mobility/i.test(week || ''), (week || '').slice(0, 300))

const err = await ev('window.__err ?? null')
check('12. no uncaught error on the page', err === null, err)

console.log(failures === 0
  ? '\nThe walk is on the card, with its minutes, its effort and its reason.\n'
  : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)

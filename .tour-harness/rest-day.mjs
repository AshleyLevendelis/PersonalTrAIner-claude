// ---------------------------------------------------------------------------
// THE REST DAY CARD, ON THE SCREEN SOMEBODY ACTUALLY READS IT ON (design 4a).
//
// The defect this rebuild exists for is a LAYOUT fact, and no source check can
// see it: the card ended in three dotted-underline links of identical weight,
// two of which rendered on ONE LINE and ran together as
// "Make Sunday a cardio day →Train anyway →". A gate reading the file finds
// three <button>s and cannot tell you they collided.
//
// So the two checks that matter here measure geometry off a real 390x844
// screen: no dotted underline survives on the card, and no two plan-change
// controls share a horizontal band. Everything else — the chips, the scope
// subtitles, the one-tap write — is checked beside them because this is the
// only place the whole card is assembled.
//
// WHICH CARD. `isRestDay` in TodayPanel is literally `!workout`, so the rest
// day is a weekday the plan has NO ROW for. The harness's older
// `__restDayTarget` finds a day with an EMPTY row, which renders
// ActiveRecoveryCard instead — a different component with different rules.
// Driving this against that one measured the wrong card for an hour on
// 20 Sep 2026, so the page now exposes `__noRowDay` and this asserts it found
// one rather than quietly testing the sibling.
//
// PORT 9451. Everything up to 9443 is taken across the three harnesses.
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
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9451', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let t
for (let i = 0; i < 80; i++) {
  try { const l = await fetch('http://127.0.0.1:9451/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {}
  await wait(250)
}
const ws = new WebSocket(t); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value

let failures = 0
let ran = 0
const check = (name, ok, detail) => {
  ran += 1
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}
const shoot = async name => {
  const d = (await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })).result.data
  writeFileSync(`/home/user/PersonalTrAIner-claude/.tour-harness/${name}.png`, Buffer.from(d, 'base64'))
}
const tap = async sel => ev(`(() => {
  const n = document.querySelector(${JSON.stringify(sel)})
  if (!n) return false
  n.scrollIntoView({ block: 'center' })
  const r = n.getBoundingClientRect()
  for (const type of ['mousedown', 'mouseup', 'click']) {
    n.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }))
  }
  return true
})()`)
const text = async sel => ev(`(document.querySelector(${JSON.stringify(sel)})?.innerText ?? '').replace(/\\s+/g, ' ').trim()`)

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

const BASE = `http://127.0.0.1:${port}/?tour=off`
await send('Page.navigate', { url: `${BASE}#/tab/exercise` })
await wait(4000)

const restDay = await ev('window.__noRowDay ?? null')
check('0a. the fixture has a weekday the plan omits — the only thing that renders RestDayCard',
  !!restDay && !!restDay.date, restDay)
await send('Page.navigate', { url: `${BASE}&today=${restDay?.date ?? ''}#/tab/exercise` })
await wait(4000)

const cardText = await text('[data-testid="change-the-plan"]') // null-safe: '' when absent
const headline = await ev(`(() => {
  const h = [...document.querySelectorAll('p')].find(p => /^Rest day · /.test((p.textContent || '').trim()))
  return h ? h.textContent.trim() : null
})()`)
check('0b. ...and it is the rest-day card, not a sibling', !!headline && headline.startsWith('Rest day · '), headline)

console.log('\n1. The week tally is a track, not a sentence\n')
const track = await ev(`(() => {
  const box = document.querySelector('[data-testid="week-track"]')
  if (!box) return { found: false, done: 0, todo: 0, text: '' }
  return {
    found: true,
    done: box.querySelectorAll('[data-testid="week-seg-done"]').length,
    todo: box.querySelectorAll('[data-testid="week-seg-todo"]').length,
    text: box.innerText.replace(/\\s+/g, ' ').trim(),
  }
})()`)
check('1a. the track is on the card', track.found === true, track)
check('1b. ...with one segment per planned session, not one bar', track.done + track.todo >= 2, track)
// WHICH HALF THIS PROVES. The segment COUNT and the words beside it are read
// off the real screen; the mint-when-done colouring is a ternary this fixture
// cannot reach, because nothing is logged in it. `test:rest-day-card` holds
// that branch by source, and this says so rather than letting the green here
// read as proof of it.
check('1b2. ...and the number of segments matches the number the card states',
  track.done + track.todo === Number((track.text.match(/of (\d+) done/i) || [])[1] ?? -1),
  track)
check('1c. ...and the old sentence is gone', !/sessions done\\./i.test(await ev('document.body.innerText')))
check('1d. ...while the two numbers are still readable in words',
  /this week · \d+ of \d+ done/i.test(track.text), track.text)

console.log('\n2. THE DEFECT: no dotted underlines, and no two plan actions on one line\n')
// The card as a whole — a dotted underline anywhere on it is the old grammar
// coming back. Scoped to the card so the chrome above it is not this gate's
// business (WeekContextRow is explicitly out of scope in the handoff).
const dotted = await ev(`(() => {
  const card = document.querySelector('[data-testid="change-the-plan"]')?.closest('[data-slot="card"]')
  if (!card) return { scoped: false, offenders: [] }
  const offenders = [...card.querySelectorAll('*')]
    .filter(n => getComputedStyle(n).textDecorationStyle === 'dotted')
    .map(n => (n.textContent || '').trim().slice(0, 40))
  return { scoped: true, offenders }
})()`)
check('2a. the card was located, so this check has a subject', dotted.scoped === true, dotted)
check('2b. ...and not one control on it is a dotted-underline link',
  (dotted.offenders || []).length === 0, dotted.offenders)

// THE COLLISION. Two controls "on one line" means their vertical bands
// overlap — which is exactly what the screenshot showed and what a full-width
// row makes impossible. Measured, not assumed.
const rows = await ev(`(() => {
  const ids = ['train-anyway', 'make-cardio-day']
  const found = ids
    .map(i => document.querySelector('[data-testid="' + i + '"]'))
    .filter(Boolean)
    .map(n => { const r = n.getBoundingClientRect(); return { id: n.dataset.testid, top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), w: Math.round(r.width) } })
  let overlapping = 0
  for (let i = 0; i < found.length; i++) for (let j = i + 1; j < found.length; j++) {
    if (found[i].top < found[j].bottom && found[j].top < found[i].bottom) overlapping++
  }
  return { found, overlapping }
})()`)
check('2c. both plan actions are on the card (sanity check on the check below)',
  (rows.found || []).length === 2, rows.found)
check('2d. ...and no two of them share a line — the collision this rebuild is for',
  rows.overlapping === 0, rows)
check('2e. ...each one a full-width row, which is what makes that structural',
  (rows.found || []).every(r => r.w > 250), rows.found)
check('2f. ...at a 44px touch height or more',
  (rows.found || []).every(r => r.h >= 44), rows.found)

console.log('\n3. Each plan action states its own scope\n')
check('3a. the group announces itself', /change the plan/i.test(cardText), cardText)
const trainRow = await text('[data-testid="train-anyway"]')
const cardioRow = await text('[data-testid="make-cardio-day"]')
check('3b. "Train anyway" says it reaches today only', /today only/i.test(trainRow), trainRow)
check('3c. the cardio row says it reaches the rest of the block',
  /rest of this block/i.test(cardioRow), cardioRow)
check('3d. ...and is PLURAL, because it writes a standing session rather than one day',
  /make \w+s a cardio day/i.test(cardioRow), cardioRow)
// THE TWO SUBTITLES MUST DIFFER. Identical scope lines would be the original
// defect with more words — the point is that these two actions are not the
// same kind of thing.
check('3e. ...and the two scopes are different sentences',
  trainRow !== cardioRow && !/today only/i.test(cardioRow), { trainRow, cardioRow })

console.log('\n4. Logging is one tap, like a set, and reads back what it did\n')
// LIKE A LIFTING SET since 24 Sep 2026 — Ashley's ruling. The chips no longer
// write on the tap: they fill the row under them, and the mint ✓ writes. Walk
// starts chosen, so the commonest answer is still ONE tap — on the ✓.
const chips = await ev(`(() => {
  const ids = ['quick-log-walk', 'quick-log-cycle', 'quick-log-swim', 'quick-log-other']
  return ids.map(i => {
    const n = document.querySelector('[data-testid="' + i + '"]')
    return { id: i, text: n ? n.innerText.replace(/\\s+/g, ' ').trim() : null, on: n ? n.getAttribute('aria-checked') : null }
  })
})()`)
check('4a. all four chips are there', chips.every(c => c.text !== null), chips)
check('4b. ...the three activity chips carry a duration on their face, before the tap',
  chips.slice(0, 3).every(c => /\d+ min/.test(c.text || '')), chips)
check('4c. ...and the blank "what did you do" form is not the default path',
  !/log a walk or other activity/i.test(await ev('document.body.innerText')))
check('4d. ...the caption says a log is not a plan change',
  /logs it for today\. your plan doesn't change\./i.test(await ev('document.body.innerText')))
// ONE CANDIDATE CANNOT TEST A CHOICE: all four chips are read, so "Walk is the
// one chosen" is distinguishable from "every chip is lit".
check('4e. Walk is chosen before any tap, and only Walk',
  chips.map(c => c.on).join(',') === 'true,false,false,false', chips.map(c => c.on))
const row = async () => ev(`(() => {
  const box = document.querySelector('[data-testid="cardio-unplanned"]')
  if (!box) return { found: false, minutes: null, effort: [], lit: false }
  const save = box.querySelector('[data-testid="cardio-save"]')
  return {
    found: true,
    minutes: box.querySelector('input[data-field="minutes"]')?.placeholder ?? null,
    effort: [...box.querySelectorAll('[data-effort]')].map(b => b.dataset.effort + ':' + b.getAttribute('aria-checked')),
    lit: !!save && save.className.includes('glow-pulse'),
  }
})()`)
const before = await row()
check('4f. the row under it holds the walk\'s own minutes, faint, as a set holds its reps',
  before.found && before.minutes === (chips[0].text.match(/(\d+) min/) || [])[1], { before, walk: chips[0].text })
check('4g. ...its effort already chosen, in words — Easy, not a number', before.effort.join(',') === 'easy:true,steady:false,hard:false', before.effort)
check('4h. ...and the mint ✓ is lit, the one thing asking to be tapped', before.lit === true, before)

await shoot('rest-day-4a')

check('4i. the ✓ is tappable', await tap('[data-testid="cardio-unplanned"] [data-testid="cardio-save"]'))
await wait(900)
const logged = await text('[data-testid="activity-logged"]')
check('4j. ...one tap logs it and reads back what it did', /^Walk · \d+ min · Easy/.test(logged), logged)
check('4k. ...with Undo beside it', /undo/i.test(logged), logged)
// THE FIGURE, NOT THE WORDS: what the tap stored. An untouched chip keeps the
// RPE the chips always wrote (4), so the new look changed nothing in the record.
const stored = await ev(`(window.__fakeDb?.cardio_logs ?? []).map(r => r.activity_name + ':' + r.duration_minutes + ':' + r.intensity_rpe)`)
check('4l. ...and the store holds exactly one walk at the chip\'s minutes and RPE 4', stored.length === 1 && new RegExp('^Walk:' + before.minutes + ':4$').test(stored[0]), stored)
const after = await row()
check('4m. after a save NOTHING is chosen, so a second tap cannot log the same walk twice',
  (await ev(`[...document.querySelectorAll('[data-testid^="quick-log-"]')].every(n => n.getAttribute('aria-checked') === 'false')`)) === true && after.lit === false,
  after)
check('4n. ...and the question moves on, because something is logged now', /did anything else\?/i.test(await ev('document.body.innerText')))
await shoot('rest-day-4a-logged')

// IT IS STILL SAVED WHEN YOU COME BACK. The old "logged" was component state
// and a tab change forgot it; a set reads back from its logs and so does this.
await send('Page.navigate', { url: `${BASE}&today=${restDay?.date ?? ''}#/tab/home` })
await wait(2500)
await send('Page.navigate', { url: `${BASE}&today=${restDay?.date ?? ''}#/tab/exercise` })
await wait(3500)
const back = await text('[data-testid="activity-logged"]')
check('4o. leaving and coming back, the walk still reads back', /^Walk · \d+ min · Easy/.test(back), back)

const undone = await tap('[data-testid="activity-logged"] button')
check('4p. Undo is reachable', undone === true)
await wait(1200)
const afterUndo = await ev(`(window.__fakeDb?.cardio_logs ?? []).length`)
check('4q. ...it really deletes the log', afterUndo === 0, afterUndo)
check('4r. ...and puts the row back with Walk chosen again', (await ev(`document.querySelector('[data-testid="quick-log-walk"]')?.getAttribute('aria-checked')`)) === 'true')

console.log('\n5. "Other" names it, in the same row\n')
await tap('[data-testid="quick-log-other"]')
await wait(500)
const form = await ev(`(() => {
  const box = document.querySelector('[data-testid="activity-quick-log"]')
  if (!box) return { inputs: [], lit: false }
  const save = box.querySelector('[data-testid="cardio-save"]')
  return {
    inputs: [...box.querySelectorAll('input')].map(i => i.dataset.field),
    labels: [...box.querySelectorAll('input')].map(i => i.getAttribute('aria-label')),
    effort: [...box.querySelectorAll('[data-effort]')].map(b => b.getAttribute('aria-checked')),
    lit: !!save && save.className.includes('glow-pulse'),
  }
})()`)
check('5a. it opens a name box above the same row', (form.inputs || []).join(',') === 'activity,minutes', form)
// TWO ROWS MUST NOT SHARE ONE SPOKEN NAME: the What-happened sheet has its own
// "Activity" and "Minutes" fields, so these say whose they are.
check('5a2. ...each named for what it is, not a bare "Minutes"', !(form.labels || []).includes('Minutes') && !(form.labels || []).includes('Activity') && (form.labels || []).length === 2, form.labels)
check('5b. ...with no effort chosen — the app cannot know how a class felt', (form.effort || []).every(v => v === 'false') && form.lit === false, form)
const type = async (sel, value) => ev(`(() => {
  const n = document.querySelector(${JSON.stringify(sel)})
  if (!n) return false
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  set.call(n, ${JSON.stringify(value)})
  n.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})()`)
await tap('[data-testid="activity-quick-log"] [data-testid="cardio-save"]')
await wait(300)
check('5c. a ✓ with nothing filled in says what is missing, like a set row', /name what you did/i.test(await text('[data-testid="activity-quick-log"]')))
await type('[data-testid="activity-quick-log"] input[data-field="activity"]', 'Rowing')
await type('[data-testid="activity-quick-log"] input[data-field="minutes"]', '20')
await tap('[data-testid="activity-quick-log"] [data-effort="hard"]')
await wait(300)
await tap('[data-testid="activity-quick-log"] [data-testid="cardio-save"]')
await wait(900)
check('5d. ...and logs what was typed, at the effort chosen', /Rowing · 20 min · Hard/.test(await text('[data-testid="activity-logged"]')), await text('[data-testid="activity-logged"]'))
const storedOther = await ev(`(window.__fakeDb?.cardio_logs ?? []).map(r => r.activity_name + ':' + r.duration_minutes + ':' + r.intensity_rpe)`)
check('5e. ...stored as Hard\'s RPE, 7', storedOther.join(',') === 'Rowing:20:7', storedOther)
await shoot('rest-day-4a-other')

// A SECOND LOG IN A ROW. The first save changes the card's question and so
// rebuilds the row, which resets it for free; a save when something is ALREADY
// logged does not, and the reset has to be the row's own. Found by mutation:
// removing it passed every check above.
await tap('[data-testid="quick-log-cycle"]')
await wait(300)
await tap('[data-testid="activity-quick-log"] [data-testid="cardio-save"]')
await wait(900)
const third = await ev(`(() => {
  const box = document.querySelector('[data-testid="cardio-unplanned"]')
  const save = box?.querySelector('[data-testid="cardio-save"]')
  return {
    receipts: [...document.querySelectorAll('[data-testid="activity-logged"] [data-testid="cardio-readback"]')].length,
    chosen: [...document.querySelectorAll('[data-testid^="quick-log-"]')].filter(n => n.getAttribute('aria-checked') === 'true').length,
    lit: !!save && save.className.includes('glow-pulse'),
  }
})()`)
check('5f. a second log in a row reads back too', third.receipts === 2, third)
check('5g. ...and leaves nothing chosen and the ✓ dark, so a double tap cannot log it twice', third.chosen === 0 && third.lit === false, third)

console.log('\n6. The plan actions still do what they did\n')
await send('Page.navigate', { url: `${BASE}&today=${restDay?.date ?? ''}#/tab/exercise` })
await wait(3500)
await tap('[data-testid="train-anyway"]')
await wait(600)
const picker = await ev(`(() => {
  const box = document.querySelector('[data-testid="change-the-plan"]')
  if (!box) return { buttons: [] }
  return { buttons: [...box.querySelectorAll('button')].map(b => (b.textContent || '').trim()).filter(Boolean) }
})()`)
check('6a. "Train anyway" opens the day picker in place',
  (picker.buttons || []).some(b => /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/.test(b)), picker.buttons)

await send('Page.navigate', { url: `${BASE}&today=${restDay?.date ?? ''}#/tab/exercise` })
await wait(3500)
await tap('[data-testid="make-cardio-day"]')
await wait(900)
const sheet = await text('[data-testid="add-cardio"]')
check('6b. the cardio row opens the standing-session form', sheet.length > 0, sheet.slice(0, 120))
check('6c. ...which still states the scope inside itself too', /rest of this block/i.test(sheet), sheet.slice(0, 200))
await shoot('rest-day-4a-cardio')

const errs = await ev(`(window.__errors ?? []).length`)
check('7. nothing on the page threw', !errs, errs)

// COUNTED, not written down: a hardcoded total goes stale the first time a
// check is added, and the mutation harness relies on this number being real.
console.log(`\n${ran} checks ran.`)
console.log(failures === 0 ? '\nThe rest day has one job, and its plan actions say what they reach.\n' : `\n${failures} rest-day screen check(s) failed.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)

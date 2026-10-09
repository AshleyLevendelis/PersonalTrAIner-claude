// ---------------------------------------------------------------------------
// A MOVED SESSION CAN BE EDITED FROM ITS OWN SCREEN (H19, with H15's lookup).
//
// The tester, Friday 9 Oct 2026, standing on "This is Monday's session, moved
// here" with the timer running:
//
//   I'm short on time      → "There's no session on Friday to shorten."
//   Drop it → Today only   → "I couldn't find that exercise on that day."
//   Swap                   → the dialog closed as if it had worked. Nothing had.
//
// Every edit was addressed by the weekday being LOOKED AT, whose own plan row
// is empty, instead of the row the session lives in. scripts/test-session-ref.ts
// holds the resolver. This holds what no source check can: that on a real
// screen, after a REAL move made through the app's own "What happened?" sheet,
// a swap, a removal and a shorten each change the session in front of the
// person — and the row that changes in the saved plan is the one the session
// came from.
//
// THE MOVE IS NOT SEEDED. ?freetoday=1 only shapes the week (yesterday trains,
// today is free). The driver peeks yesterday, opens the sheet and moves it.
//
// EVERY CHECK RUNS EVERY TIME — null-safe subjects, no `if (found)` around a
// check — so a broken build prints the same count and fails, rather than a
// short run that reads like a crash.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'
import { anchorDate, DAY_NAMES } from './anchor.mjs'

const DIST = new URL('./dist/', import.meta.url).pathname
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
const DEBUG_PORT = 9700
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let t
for (let i = 0; i < 80; i++) { try { const l = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`).then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {} await wait(250) }
const ws = new WebSocket(t); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value
const shoot = async name => { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname, Buffer.from(s.result.data, 'base64')) }
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

let failures = 0
let ran = 0
const check = (name, ok, detail) => {
  ran++
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 420)}` : ''}`) }
}

const dayAt = n => { const d = anchorDate(); d.setDate(d.getDate() + n); return DAY_NAMES[d.getDay()] }
const TODAY_NAME = dayAt(0), FROM_NAME = dayAt(-1)

const rectOf = sel => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return null; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
const tap = async sel => { const r = await rectOf(sel); if (!r) return false; await wait(120); const r2 = await rectOf(sel); for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: r2.x, y: r2.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 }); return true }
const clickSel = sel => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return false; n.click(); return true })()`)
const clickText = (scope, re) => ev(`(() => { const root = document.querySelector(${JSON.stringify(scope)}) || document; const n = [...root.querySelectorAll('button')].find(b => ${re}.test(b.textContent.trim())); if (!n) return false; n.click(); return true })()`)
const has = sel => ev(`!!document.querySelector(${JSON.stringify(sel)})`)
const text = () => ev(`document.body.innerText`)
const order = () => ev(`[...document.querySelectorAll('[data-exercise-name]')].map(n => n.getAttribute('data-exercise-name'))`)
const cell = day => ev(`(() => { const n = document.querySelector('[aria-label^="${day}:"]'); return n ? n.getAttribute('aria-label') : null })()`)
const escape = async () => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await wait(450) }
const until = async (fn, tries = 24) => { let v = await fn(); for (let i = 0; i < tries && !v; i++) { await wait(300); v = await fn() } return v }
const untilGone = sel => until(async () => !(await has(sel)))

const openDaySheet = async () => {
  if (await has('[data-testid="what-happened-sheet"]')) await escape()
  await tap('button[aria-label="More options"]'); await wait(500)
  if (!(await has('[data-testid="what-happened-item"]'))) return 'no-menu-item'
  await tap('[data-testid="what-happened-item"]'); await wait(700)
  return (await has('[data-testid="what-happened-sheet"]')) ? 'open' : 'no-sheet'
}
const openRowMenu = async name => {
  if (await has('[role="menu"]')) await escape()
  const row = `[data-exercise-name=${JSON.stringify(name)}]`
  if (!(await has(`${row} button[aria-label="Exercise options"]`))) { await tap(`${row} [role="button"], ${row} .cursor-pointer`); await wait(700) }
  if (!(await tap(`${row} button[aria-label="Exercise options"]`))) return 'no-trigger'
  await wait(500)
  return (await has('[data-testid="remove-exercise"]')) ? 'open' : 'no-menu'
}
/** The exercises the SAVED plan holds for a weekday's own row — read from the store, not the screen. */
const savedRow = dayName => ev(`(() => {
  const rows = (window.__fakeDb && window.__fakeDb.mesocycle_weeks) || []
  const daysOf = r => { for (const v of Object.values(r)) { if (Array.isArray(v) && v[0] && typeof v[0] === 'object' && 'day' in v[0] && 'exercises' in v[0]) return v } return null }
  let out = null
  for (const r of rows) { const d = daysOf(r); const hit = d && d.find(x => x.day === ${JSON.stringify(dayName)}); if (hit) out = hit.exercises.map(e => e.name) }
  return out
})()`)

/** Total prescribed sets on a weekday's saved row — what a shorten is allowed to reduce. */
const savedSets = dayName => ev(`(() => {
  const rows = (window.__fakeDb && window.__fakeDb.mesocycle_weeks) || []
  const daysOf = r => { for (const v of Object.values(r)) { if (Array.isArray(v) && v[0] && typeof v[0] === 'object' && 'day' in v[0] && 'exercises' in v[0]) return v } return null }
  let out = 0
  for (const r of rows) { const d = daysOf(r); const hit = d && d.find(x => x.day === ${JSON.stringify(dayName)}); if (hit) out = hit.exercises.reduce((n, e) => n + (Number(e.sets) || 0), 0) }
  return out
})()`)

console.log(`\nEDITING A SESSION THAT WAS MOVED — ${FROM_NAME}'s, moved to ${TODAY_NAME} (today)\n`)
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&freetoday=1#/tab/exercise` })
await wait(4500)

// --- 0. the week, before anything is moved ---------------------------------
check(`0a. ${FROM_NAME} is a training day nobody did`, /: missed$/.test(await until(() => cell(FROM_NAME)) || ''), await cell(FROM_NAME))
check(`0b. ${TODAY_NAME} (today) has no session of its own`, /: .*(rest|recovery)/.test(await cell(TODAY_NAME) || ''), await cell(TODAY_NAME))

// --- 1. MOVE IT, through the app -------------------------------------------
check(`1a. peeking ${FROM_NAME}`, await tap(`[aria-label^="${FROM_NAME}:"]`) && (await wait(900), true))
check('1b. "What happened?" opens for that day', (await openDaySheet()) === 'open' && new RegExp(FROM_NAME).test(await ev(`document.querySelector('[data-testid="what-happened-sheet"]')?.innerText || ''`)))
check('1c. "Move it to another day" offers today', await clickSel('[data-verb="move"]') && (await wait(500), await has(`[data-move-to="${TODAY_NAME}"]`)), await ev(`[...document.querySelectorAll('[data-move-to]')].map(n => n.getAttribute('data-move-to'))`))
check('1d. ...and tapping it moves the session', await clickSel(`[data-move-to="${TODAY_NAME}"]`) && await untilGone('[data-testid="what-happened-sheet"]'))
check(`1e. the strip says ${FROM_NAME} moved`, /moved/.test(await until(async () => /moved/.test(await cell(FROM_NAME) || '') && cell(FROM_NAME)) || ''), await cell(FROM_NAME))
// Back to today — the peek of the emptied day offers it by name.
await clickText('body', '/^Back to today$/'); await wait(1200)
check(`1f. today's card says "This is ${FROM_NAME}'s session, moved here"`, new RegExp(`This is ${FROM_NAME}.s session, moved here`).test(await ev(`document.querySelector('[data-testid="moved-in"]')?.innerText || ''`)), (await text()).slice(0, 240))
const start = (await order()) || []
check('1g. ...and lists that session, with room to lose one', start.length >= 4, start)
await shoot('moved-edit-1-moved')

// --- 2. SWAP an exercise on it ---------------------------------------------
const swapVictim = start[start.length - 1] ?? 'NO-ROW'
check('2a. the last exercise\'s menu opens', (await openRowMenu(swapVictim)) === 'open')
check('2b. "Swap" opens the dialog', await tap('[data-testid="swap-exercise"]') && !!(await until(() => has('[data-testid="swap-dialog"]'))))
check(`2c. the dialog names the day on screen (${TODAY_NAME}), not the row it writes to`,
  await ev(`(() => { const t = document.querySelector('[data-testid="swap-dialog"]')?.innerText || ''; return t.includes(${JSON.stringify(TODAY_NAME)}) && !t.includes(${JSON.stringify(FROM_NAME)}) })()`),
  await ev(`(document.querySelector('[data-testid="swap-dialog"]')?.innerText || '').slice(0, 160)`))
if (await has('[data-testid="swap-dialog"] [data-testid="reason-skip"]')) { await clickSel('[data-testid="swap-dialog"] [data-testid="reason-skip"]'); await wait(800) }
const swapTo = await ev(`document.querySelector('[data-testid="swap-dialog"] [data-testid="swap-option"]')?.innerText?.split('\\n')[0]?.trim() || null`)
check('2d. it offers a replacement', typeof swapTo === 'string' && swapTo.length > 0, swapTo)
await clickSel('[data-testid="swap-dialog"] [data-testid="swap-option"]'); await wait(900)
check('2e. "Today only" is offered and tapped', await clickText('[data-testid="swap-dialog"]', '/^Today only/'))
await untilGone('[data-testid="swap-dialog"]'); await wait(900)
const afterSwap = (await until(async () => { const o = await order(); return o && !o.includes(swapVictim) ? o : null })) || (await order()) || []
check('2f. THE SWAP HAPPENED: the old exercise is gone from the card', start.length > 0 && afterSwap.length > 0 && !afterSwap.includes(swapVictim), { swapVictim, afterSwap })
check('2g. ...the session is the same length, with one new name in it', afterSwap.length === start.length && afterSwap.filter(n => !start.includes(n)).length === 1, { start, afterSwap })
const swapSaid = await ev(`window.__swapSaid === undefined ? 'NEVER-RAN' : window.__swapSaid`)
check('2h. ...and the app\'s own swap says it saved (no "didn\'t go through", no "didn\'t save")', swapSaid === null, swapSaid)
const savedAfterSwap = (await savedRow(FROM_NAME)) || []
check(`2i. the SAVED plan changed on ${FROM_NAME}'s row — the one the session lives in`, start.length > 0 && savedAfterSwap.length === start.length && !savedAfterSwap.includes(swapVictim) && savedAfterSwap.includes(swapTo), { savedAfterSwap, swapTo })
check(`2j. ...and ${TODAY_NAME}'s own row was not given exercises`, savedAfterSwap.length > 0 && ((await savedRow(TODAY_NAME)) || []).length === 0, await savedRow(TODAY_NAME))
await shoot('moved-edit-2-swapped')

// --- 3. REMOVE an exercise from it -----------------------------------------
const removeVictim = afterSwap[afterSwap.length - 1] ?? 'NO-ROW'
check('3a. the remove sheet opens on the last exercise', (await openRowMenu(removeVictim)) === 'open' && await tap('[data-testid="remove-exercise"]') && !!(await until(() => has('[data-testid="remove-exercise-sheet"]'))))
check(`3b. ...headed with the day on screen (${TODAY_NAME})`, await ev(`(() => { const t = document.querySelector('[data-testid="remove-exercise-sheet"]')?.innerText || ''; return t.includes(${JSON.stringify(TODAY_NAME)}) && !t.includes(${JSON.stringify(FROM_NAME)}) })()`))
await clickSel('[data-testid="reason-skip"]'); await wait(500)
await clickSel('[data-verb="drop"]'); await wait(500)
const reachedScope = await has('[data-testid="remove-scope"]')
check('3c. "Drop it" reaches the scope step', reachedScope)
await clickSel('[data-scope="today"]')
await untilGone('[data-testid="remove-exercise-sheet"]'); await wait(700)
const removeError = await ev(`document.querySelector('[data-testid="remove-error"]')?.innerText || ''`)
check('3d. it does NOT answer "I couldn\'t find that exercise on that day."', reachedScope && !/couldn.t find that exercise/i.test(removeError), removeError)
const afterRemove = (await until(async () => { const o = await order(); return o && !o.includes(removeVictim) ? o : null })) || (await order()) || []
check('3e. THE EXERCISE CAME OUT of the session on screen', !afterRemove.includes(removeVictim) && afterRemove.length === afterSwap.length - 1, { removeVictim, afterRemove })
const savedAfterRemove = (await savedRow(FROM_NAME)) || []
check(`3f. ...and out of ${FROM_NAME}'s saved row`, !savedAfterRemove.includes(removeVictim) && savedAfterRemove.length === afterSwap.length - 1, savedAfterRemove)
if (await has('[data-testid="remove-exercise-sheet"]')) await escape()
await shoot('moved-edit-3-removed')

// --- 4. SHORTEN it ---------------------------------------------------------
const setsBeforeShorten = await savedSets(FROM_NAME)
check('4a. the day menu\'s "What happened?" opens for today', (await openDaySheet()) === 'open')
check('4b. it offers to shorten the session', await clickSel('[data-verb="shorten"]') && (await wait(500), await has('[data-testid="what-happened-shorten"]')), await ev(`[...document.querySelectorAll('[data-testid="what-happened-verbs"] [data-verb]')].map(b => b.getAttribute('data-verb'))`))
const minuteChoices = (await ev(`[...document.querySelectorAll('[data-shorten-minutes]')].map(b => Number(b.getAttribute('data-shorten-minutes')))`)) || []
check('4c. ...with real times to choose from (a moved-in day used to offer none)', minuteChoices.length >= 1, minuteChoices)
await clickSel('[data-shorten-minutes]')
await untilGone('[data-testid="what-happened-sheet"]'); await wait(900)
const shortenError = await ev(`document.querySelector('[data-testid="what-happened-error"]')?.innerText || ''`)
check('4d. it does NOT answer "There\'s no session on … to shorten."', minuteChoices.length >= 1 && !/no session on/i.test(shortenError) && !/no session on \w+ to shorten/i.test(await text()), shortenError)
const afterShorten = (await order()) || []
const savedAfterShorten = (await savedRow(FROM_NAME)) || []
const setsAfterShorten = await savedSets(FROM_NAME)
check('4e. THE SESSION GOT SHORTER in the saved plan: fewer exercises, or fewer sets on what stayed',
  setsBeforeShorten > 0 && setsAfterShorten > 0 && (setsAfterShorten < setsBeforeShorten || savedAfterShorten.length < savedAfterRemove.length),
  { setsBeforeShorten, setsAfterShorten, savedAfterRemove, savedAfterShorten, afterShorten, shortenError })
if (await has('[data-testid="what-happened-sheet"]')) await escape()
await shoot('moved-edit-4-shortened')

// --- 5. THE FLOOR names the right day --------------------------------------
// Sam's moved session had three exercises: once the lookup works, "Drop it"
// meets "never below three" and THAT sentence has to name the day on screen.
// Keep removing the last exercise until the app refuses.
let floorText = ''
let guard = 0
for (; guard < 8 && !floorText; guard++) {
  const now = (await order()) || []
  const victim = now[now.length - 1]
  if (!victim) break
  if ((await openRowMenu(victim)) !== 'open') break
  await tap('[data-testid="remove-exercise"]'); await until(() => has('[data-testid="remove-exercise-sheet"]'))
  await clickSel('[data-testid="reason-skip"]'); await wait(450)
  await clickSel('[data-verb="drop"]'); await wait(450)
  await clickSel('[data-scope="today"]'); await wait(1100)
  floorText = await ev(`document.querySelector('[data-testid="remove-error"]')?.innerText || ''`)
  if (!floorText && await has('[data-testid="remove-exercise-sheet"]')) await escape()
}
check('5a. removing eventually meets the three-exercise floor', /fewer than 3 exercises/.test(floorText), { floorText, guard, left: await order() })
check(`5b. ...and the refusal names ${TODAY_NAME}, the day on screen`, floorText.includes(`leave ${TODAY_NAME} with fewer than 3`), floorText)
check(`5c. ...never ${FROM_NAME}, the row it was written to`, floorText.length > 0 && !floorText.includes(FROM_NAME), floorText)
check('5d. the refusal is on screen where the tap was (inside the viewport)', await ev(`(() => { const n = document.querySelector('[data-testid="remove-error"]'); if (!n) return false; const r = n.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight && r.width > 0 })()`))
check('5e. ...and the session still holds three', ((await order()) || []).length === 3, await order())
await shoot('moved-edit-5-floor')

const errors = await ev(`(window.__pageErrors || []).length`)
check('6. no uncaught error on the page', !errors, errors)

// ===========================================================================
// THE COACH, ON THE SAME KIND OF DAY (H15).
//
//   "Swap the Band Tricep Kickback on my Chest & Triceps day…"
//   → "Friday is a rest day — there's nothing on it to swap."
//
// chat.html?movedin=1: yesterday's session already moved onto today (the row
// is seeded — the move itself was driven above). The MODEL is stubbed at the
// fetch boundary with the tool call it would send; everything after that is
// the app's own code. It names the day three ways on purpose: the weekday on
// screen, no day at all, and the session's OLD weekday.
// ===========================================================================
console.log(`\n  the coach, asked about the same moved session\n`)
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      const said = String(JSON.parse((init && init.body) || '{}').message || '')
      const names = window.__movedInExercises || []
      const last = names[names.length - 1]
      const proposal = /swap/i.test(said)
        ? { kind: 'propose_exercise_swap', rawArgs: { day: ${JSON.stringify(TODAY_NAME)}, old_item: last, new_item: window.__swapNew || 'leg press', scope: 'today', reason: 'The station is busy.' } }
        : /minutes/i.test(said)
        ? { kind: 'propose_session_shorten', rawArgs: { minutes: 25 } }
        : /take/i.test(said)
        ? { kind: 'propose_exercise_remove', rawArgs: { day: ${JSON.stringify(FROM_NAME)}, item: names[names.length - 2], scope: 'today', reason: 'Not feeling that one today.' } }
        : undefined
      return new Response(JSON.stringify({ reply: proposal ? '' : 'Sure.', proposal }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return realFetch(url, init)
  }
` })
await send('Page.navigate', { url: `http://127.0.0.1:${port}/.tour-harness/chat.html?movedin=1&load=moved-edit` })
await wait(4500)
await until(() => has('textarea'))
const movedNames = (await ev(`window.__movedInExercises || []`)) || []
check('7a. the chat is up, on a day a session moved onto', (await has('textarea')) && movedNames.length >= 4, movedNames)

const setValue = `(el, v) => { Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }`
const sayToCoach = async words => {
  await ev(`(() => { const t = document.querySelector('textarea'); if (t) (${setValue})(t, ${JSON.stringify(words)}) })()`)
  await wait(450)
  return ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /send/i.test(x.getAttribute('aria-label') || '')); if (!b || b.disabled) return false; b.click(); return true })()`)
}
/** What the coach's side of the page says AFTER a marker sentence the person just sent. */
const since = async marker => { const t = await text(); const i = t.lastIndexOf(marker); return i === -1 ? '' : t.slice(i + marker.length) }
const settled = async marker => { let last = '', same = 0; for (let i = 0; i < 40 && same < 3; i++) { await wait(400); const now = await since(marker); if (now && now === last) same++; else same = 0; last = now } return last }
const hasCardButtons = () => ev(`[...document.querySelectorAll('button')].some(b => /^Apply/.test((b.textContent || '').trim()))`)

// --- swap, naming the weekday on screen ------------------------------------
const SWAP_SAID = 'swap the last one on today, the station is busy'
check('7b. asking the coach to swap an exercise on it', await sayToCoach(SWAP_SAID))
const swapReply = await settled(SWAP_SAID)
check(`7c. it does NOT answer "${TODAY_NAME} is a rest day — there's nothing on it to swap."`, swapReply.length > 0 && !/is a rest day/i.test(swapReply), swapReply.slice(0, 260))
check('7d. ...it offers the swap as a card, naming the exercise that is on the moved session', /Proposed change/i.test(swapReply) && swapReply.includes(movedNames[movedNames.length - 1] ?? 'NO-NAME') && await hasCardButtons(), swapReply.slice(0, 260))
check(`7e. ...and the card says ${TODAY_NAME}, never ${FROM_NAME}`, swapReply.includes(`${TODAY_NAME}'s other`) && !swapReply.includes(`${FROM_NAME}'s other`), swapReply.slice(0, 320))
await shoot('moved-edit-7-coach-swap')
check('7f. tapping Apply', await ev(`(() => { const b = [...document.querySelectorAll('button')].filter(x => /^Apply/.test((x.textContent || '').trim())).pop(); if (!b) return false; b.click(); return true })()`))
const coachSaved = (await until(async () => { const r = await savedRow(FROM_NAME); return r && !r.includes(movedNames[movedNames.length - 1]) ? r : null })) || (await savedRow(FROM_NAME)) || []
check(`7g. THE SWAP LANDED on ${FROM_NAME}'s saved row`, coachSaved.length === movedNames.length && !coachSaved.includes(movedNames[movedNames.length - 1]), coachSaved)
check(`7h. ...and ${TODAY_NAME}'s own row holds no exercises`, coachSaved.length > 0 && ((await savedRow(TODAY_NAME)) || []).length === 0, await savedRow(TODAY_NAME))

// --- shorten, naming no day ------------------------------------------------
const SHORT_SAID = 'I only have 25 minutes today'
check('8a. "I only have 25 minutes"', await sayToCoach(SHORT_SAID))
const shortReply = await settled(SHORT_SAID)
check('8b. it does NOT answer "There\'s no session on … to shorten" or go quiet', shortReply.length > 0 && !/no session on/i.test(shortReply) && !/couldn.t work out which session/i.test(shortReply), shortReply.slice(0, 260))
check(`8c. ...what it says is about ${TODAY_NAME}, never ${FROM_NAME}`, shortReply.includes(TODAY_NAME) && !shortReply.includes(FROM_NAME), shortReply.slice(0, 260))
await shoot('moved-edit-8-coach-shorten')
await ev(`(() => { const b = [...document.querySelectorAll('button')].filter(x => /^Keep/.test((x.textContent || '').trim())).pop(); if (b) b.click() })()`); await wait(700)

// --- remove, naming the session's OLD weekday ------------------------------
const TAKE_SAID = `take the second to last one out of my ${FROM_NAME} session`
check(`9a. "…out of my ${FROM_NAME} session" — its old name`, await sayToCoach(TAKE_SAID))
const takeReply = await settled(TAKE_SAID)
check('9b. it finds the exercise (no "rest day", no "nothing on … to change")', takeReply.length > 0 && !/is a rest day/i.test(takeReply) && !/nothing (left )?on \w+ to change/i.test(takeReply), takeReply.slice(0, 260))
check(`9c. ...and speaks of ${TODAY_NAME}, where the session now is`, takeReply.includes(TODAY_NAME), takeReply.slice(0, 260))
await shoot('moved-edit-9-coach-remove')

console.log(`\n${ran} checks ran`)
console.log(failures === 0 ? 'A moved session swaps, shortens and loses an exercise from its own screen.\n' : `\n${failures} FAILED\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)

// ---------------------------------------------------------------------------
// LOGGED CARDIO SHOWS UP — H7, H21 and M14, 9 Oct 2026, on the real screens.
//
// The tester: "Add unplanned work → Cardio → Other → skipping rope, 12 min,
// Steady → tick. The panel closed. Nothing in the session, the Session complete
// summary, Session history or Home." And the planned finisher, ticked and
// confirmed with Undo, "is missing from the Session complete card and from
// Session history". And football on a lifting day "leaves only a ⇄".
//
// Every one of those logs had SAVED. No screen read it back. scripts/
// test-cardio-reader.ts holds the one reader they share now and what each
// surface is handed from it; this holds the part only a screen can show — that
// the line is actually drawn, where the tester looked for it, in the same
// words on every screen, once (a finisher has its own row and must not be
// drawn again under it), and that it is not quietly added into the lifting
// figures beside it.
//
// The coach's half is checked at the only place it can be without a model: the
// request the real chat sends. The log is made on the Exercise tab with the
// connection dead, so it exists nowhere but this phone — and the context the
// coach is sent has to carry it anyway.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => { const p = q.url.split('?')[0]; const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p); if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return } r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' }); r.end(readFileSync(f)) })
await new Promise(r => server.listen(0, r)); const port = server.address().port
const PORT = 9602
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
const finish = () => {
  console.log(`\n${ran} checks ran. ${failures === 0 ? 'Logged cardio is on every screen that tells you what you did.' : `${failures} check(s) FAILED.`}\n`)
  ws.close(); chrome.kill(); server.close()
  process.exit(failures === 0 ? 0 : 1)
}

const J = JSON.stringify
const pointAt = async at => { for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 }) }
const centreOf = expr => ev(`(() => { const n = ${expr}; if (!n) return null; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null })()`)
const tapExpr = async expr => { const at = await centreOf(expr); if (!at) return false; await wait(150); const again = await centreOf(expr); await pointAt(again ?? at); await wait(500); return true }
const q = sel => `document.querySelector(${J(sel)})`
const byText = (text, tag = 'button') => `[...document.querySelectorAll(${J(tag)})].find(b => (b.textContent || '').replace(/\\s+/g, ' ').trim() === ${J(text)})`
const until = async (expr, ms = 8000) => { const t0 = Date.now(); let v = await ev(expr); while (!v && Date.now() - t0 < ms) { await wait(200); v = await ev(expr) } return v }
const typeText = async text => { for (const ch of String(text)) { await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }) } await wait(250) }
const escape = async () => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await wait(500) }
const texts = sel => ev(`[...document.querySelectorAll(${J(sel)})].map(n => n.innerText.replace(/\\s+/g, ' ').trim())`)
const stored = () => ev(`(window.__fakeDb?.cardio_logs ?? []).map(r => r.activity_name + ':' + r.duration_minutes + ':' + r.intensity_rpe)`)
// The driver's own copy of the scale, a literal: a gate that asks the app what
// "Hard" means can only ever agree with it.
const word = rpe => (rpe <= 4 ? 'Easy' : rpe <= 6 ? 'Steady' : 'Hard')

/** "Add unplanned work → Cardio → Other → <name>, <minutes>, <effort> → tick" — the tester's own taps. */
const logUnplanned = async (name, minutes, effort) => {
  if (!(await tapExpr(byText('＋ Add unplanned work')))) return 'no "Add unplanned work"'
  if (!(await tapExpr(byText('Cardio')))) return 'no Cardio tab'
  if (!(await tapExpr(q('[data-testid="quick-log-other"]')))) return 'no Other chip'
  if (!(await tapExpr(q('[data-testid="cardio-unplanned"] input[data-field="activity"]')))) return 'no name box'
  await typeText(name)
  if (!(await tapExpr(q('[data-testid="cardio-unplanned"] input[data-field="minutes"]')))) return 'no minutes box'
  await typeText(minutes)
  if (!(await tapExpr(q(`[data-testid="cardio-unplanned"] [data-effort="${effort}"]`)))) return 'no effort box'
  if (!(await tapExpr(q('[data-testid="cardio-unplanned"] [data-testid="cardio-save"]')))) return 'no tick'
  await wait(900)
  return 'ok'
}

console.log('\nLOGGED CARDIO SHOWS UP\n')

// ---------------------------------------------------------------------------
// A. A TRAINING DAY WITH A PLANNED FINISHER
// ---------------------------------------------------------------------------
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&finisher=1#/tab/exercise` })
await until('window.__finisherTarget !== undefined', 12000)
const target = await ev('window.__finisherTarget ?? null')
check('0a. the fixture plan prescribes a finisher on a training day', !!target?.activity, target)
if (!target) finish()
const finisherName = target.activity.split(/\s+[—–-]\s+/)[0]
const FINISHER_LINE = `${finisherName} · ${target.duration} min · ${word(target.rpe)}`
const ROPE_LINE = 'skipping rope · 12 min · Steady'
console.log(`  ${target.day}: "${target.activity}" — expecting "${FINISHER_LINE}" and "${ROPE_LINE}"`)

// Pinned to the day that holds it, read off the page — never a weekday name.
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&finisher=1&today=${target.date}#/tab/exercise` })
await until(`document.querySelectorAll('[data-exercise-name]').length > 0 && !!${q('[data-testid="finisher-row"]')}`, 12000)
await wait(1200)

console.log('\n  1. LOG A SET, THE FINISHER, AND SOMETHING THAT WAS NOT PLANNED')
check('1a. nothing is listed under "Additional work" to begin with', (await ev(`!${q('[data-testid="additional-work"]')}`)) === true)
// One working set, so finishing produces a summary rather than "nothing logged".
const firstCard = await ev(`document.querySelector('[data-exercise-name]')?.getAttribute('data-exercise-name') ?? null`)
const needsWeight = await ev(`${q('[data-exercise-name] [data-testid="working-row"]')}?.getAttribute('data-needs-weight') === 'true'`)
if (needsWeight) { await tapExpr(`${q('[data-exercise-name] [data-testid="working-row"]')}?.querySelectorAll('input')[0]`); await typeText('10') }
const tickSet = `[...(${q('[data-exercise-name] [data-testid="working-row"]')}?.querySelectorAll('button') ?? [])].find(b => /^save set/i.test(b.getAttribute('aria-label') || ''))`
await tapExpr(tickSet); await wait(700)
if (!(await ev(`!!${q('[data-exercise-name] [data-testid="working-row"][data-sync]')}`))) { await tapExpr(tickSet); await wait(700) }
check(`1b. one working set of ${firstCard} is logged`, (await ev(`!!${q('[data-exercise-name] [data-testid="working-row"][data-sync]')}`)) === true)

check('1c. the finisher\'s tick is tapped', await tapExpr(q('[data-testid="finisher-row"] [data-testid="cardio-save"]')))
await until(`!!${q('[data-testid="finisher-row"] [data-testid="cardio-readback"]')}`, 4000)
const finisherRow = (await texts('[data-testid="finisher-row"] [data-testid="cardio-readback"]'))[0] ?? ''
check('1d. ...and its row reads it back', finisherRow.startsWith(FINISHER_LINE), finisherRow)

const how = await logUnplanned('skipping rope', '12', 'steady')
check('1e. "Add unplanned work → Cardio → Other → skipping rope, 12 min, Steady → tick"', how === 'ok', how)
check('1f. the panel closes, as it always did', (await until(`!${q('[data-testid="cardio-unplanned"]')}`, 3000)) === true)
check('1g. both logs were saved (they always were)', (await stored()).length === 2, await stored())

console.log('\n  2. THE TRAINING DAY — under "Additional work", where she looked')
const heading = await ev(`${q('[data-testid="additional-work"]')}?.querySelector('span')?.textContent ?? null`)
check('2a. there is an "Additional work" section now', heading === 'Additional work', heading)
const receipts = await texts('[data-testid="additional-cardio"] [data-testid="cardio-readback"]')
check('2b. THE ROPE IS IN IT: "skipping rope · 12 min · Steady"', receipts.length === 1 && receipts[0].startsWith(ROPE_LINE), receipts)
check('2c. ...with Undo, like every other cardio row', /Undo$/.test(receipts[0] ?? ''), receipts)
check('2d. THE FINISHER IS NOT DRAWN A SECOND TIME — it has its own row', !receipts.some(r => r.includes(finisherName)), receipts)
check('2e. ...and that row still reads it back', ((await texts('[data-testid="finisher-row"] [data-testid="cardio-readback"]'))[0] ?? '').startsWith(FINISHER_LINE))
const inView = await ev(`(() => { const n = ${q('[data-testid="additional-cardio"]')}; if (!n) return null; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return { right: Math.round(r.right), vw: innerWidth, h: Math.round(r.height) } })()`)
check('2f. the receipt fits the screen', !!inView && inView.right <= inView.vw && inView.h >= 44, inView)
await wait(300); await shoot('cardio-shows-training-day')

console.log('\n  3. THE SESSION COMPLETE CARD')
check('3a. Finish session is tapped', await tapExpr(byText('Finish session')))
await until(`!!${q('[role="dialog"]')}`, 8000)
await wait(600)
const card = await ev(`(() => {
  const d = document.querySelector('[role="dialog"]'); if (!d) return null
  return {
    title: d.querySelector('h2')?.textContent ?? null,
    cardio: [...d.querySelectorAll('[data-testid="summary-cardio"] p')].map(p => p.textContent.trim()),
    tiles: [...d.querySelectorAll('.grid.grid-cols-3 > div')].map(t => t.innerText.replace(/\\s+/g, ' ').trim()),
  }
})()`)
check('3b. the card is the session summary', /^Session (complete|saved)$/.test(card?.title ?? ''), card?.title)
check('3c. IT LISTS THE FINISHER, as its own line (H21)', (card?.cardio ?? []).includes(FINISHER_LINE), card?.cardio)
check('3d. ...and the rope (H7)', (card?.cardio ?? []).includes(ROPE_LINE), card?.cardio)
check('3e. ...under a heading that says what they are', card?.cardio?.[0] === 'Cardio', card?.cardio)
// NOT FOLDED IN. One set was logged; forty-odd minutes of cardio must not turn
// up in the lifting tiles.
const setsTile = (card?.tiles ?? []).find(t => /sets$/i.test(t)) ?? ''
const durationTile = (card?.tiles ?? []).find(t => /duration$/i.test(t)) ?? ''
check('3f. the Sets tile still counts one set', /^1\s*\//.test(setsTile), card?.tiles)
check(`3g. the Duration tile has not had ${target.duration + 12} minutes of cardio added to it`, /^\d+\s*m/.test(durationTile) && parseInt(durationTile, 10) < target.duration + 12, card?.tiles)
await shoot('cardio-shows-summary')
await escape()

console.log('\n  4. SESSION HISTORY')
await ev('window.scrollTo(0, 0)'); await wait(300)
check('4a. the day\'s menu opens', await tapExpr(q('button[aria-label="More options"]')))
await until(`!!${byText('Session history', '[role="menuitem"]')}`, 3000)
await ev(`${byText('Session history', '[role="menuitem"]')}?.click()`)
await until(`document.querySelectorAll('[data-testid="history-session"], [data-testid="history-cardio-day"]').length > 0`, 6000)
const hist = await ev(`[...document.querySelectorAll('[data-testid="history-session"], [data-testid="history-cardio-day"]')].map(n => ({ kind: n.getAttribute('data-testid'), title: n.querySelector('p')?.textContent ?? '', text: n.innerText.replace(/\\s+/g, ' ').trim(), cardio: [...n.querySelectorAll('[data-testid="history-cardio-line"]')].map(p => p.textContent.trim()) }))`)
const todays = (hist ?? []).find(h => h.title.includes(target.date))
check('4b. today\'s session is in the list', !!todays && todays.kind === 'history-session', hist)
check('4c. IT LISTS THE FINISHER (H21)', (todays?.cardio ?? []).includes(FINISHER_LINE), todays)
check('4d. ...and the rope (H7)', (todays?.cardio ?? []).includes(ROPE_LINE), todays)
check('4e. ...beside the lifting figures, not inside them: still "1 sets"', /· 1 sets/.test(todays?.text ?? ''), todays?.text)
await shoot('cardio-shows-history')
await escape()

console.log('\n  5. HOME')
await ev(`window.location.hash = '#/tab/home'`)
await until(`!!${q('[data-testid="home-cardio-today"]')}`, 8000)
const home = await texts('[data-testid="home-cardio-today"] p')
check('5a. Home\'s "Today\'s session" lists the finisher', home.includes(`✓ ${FINISHER_LINE}`), home)
check('5b. ...and the rope', home.includes(`✓ ${ROPE_LINE}`), home)
await ev(`${q('[data-testid="home-cardio-today"]')}?.scrollIntoView({ block: 'center' })`); await wait(300)
await shoot('cardio-shows-home')

console.log('\n  6. UNDO TAKES IT OFF EVERY ONE OF THEM')
await ev(`window.location.hash = '#/tab/exercise'`)
await until(`!!${q('[data-testid="additional-cardio"] [data-testid="cardio-readback"] button')}`, 8000)
await tapExpr(q('[data-testid="additional-cardio"] [data-testid="cardio-readback"] button'))
await until(`!${q('[data-testid="additional-cardio"]')}`, 5000)
check('6a. the receipt goes, and the empty section with it', (await ev(`!${q('[data-testid="additional-work"]')}`)) === true)
check('6b. the log is gone from the store; the finisher is untouched', (await stored()).length === 1 && (await stored())[0].startsWith(target.activity), await stored())
await ev(`window.location.hash = '#/tab/home'`)
await until(`!!${q('[data-testid="home-cardio-today"]')}`, 8000)
const homeAfter = await texts('[data-testid="home-cardio-today"] p')
check('6c. Home lists the finisher alone', homeAfter.length === 1 && homeAfter[0] === `✓ ${FINISHER_LINE}`, homeAfter)

// ---------------------------------------------------------------------------
// B. WHAT THE COACH IS SENT — a log that exists nowhere but this phone
// ---------------------------------------------------------------------------
console.log('\n  7. THE COACH — told about cardio logged on the Exercise tab, sent or not')
await ev(`window.location.hash = '#/tab/exercise'`)
await until(`!!${byText('＋ Add unplanned work')}`, 8000)
await ev(`window.__netDown = true`)
const how2 = await logUnplanned('rowing', '8', 'hard')
check('7a. "rowing, 8 min, Hard" is logged with the connection dead', how2 === 'ok', how2)
const unsent = await texts('[data-testid="additional-cardio"] [data-testid="cardio-readback"]')
check('7b. it is on the training day at once', unsent.some(r => r.startsWith('rowing · 8 min · Hard')), unsent)
check('7c. ...and has not reached the server', !(await stored()).some(s => s.startsWith('rowing')), await stored())

// The real chat, on the same phone (same storage). Its request is caught at
// the fetch boundary — the one place "what the coach is told" can be read.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  const realFetch = window.fetch
  window.__coachContexts = []
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      try { window.__coachContexts.push(JSON.parse(init && init.body ? init.body : '{}').context ?? null) } catch { window.__coachContexts.push(null) }
      return new Response(JSON.stringify({ reply: 'Sure.' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return realFetch(url, init)
  }
` })
// STILL WITH NO CONNECTION. (It has to be: this harness's "server" lives in the
// page and starts empty on every load, so a chat page that could reach it
// would be truthfully told the finisher does not exist.) The coach's context
// is therefore built entirely from what the phone holds — the hard case.
await send('Page.navigate', { url: `http://127.0.0.1:${port}/.tour-harness/chat.html?netdown=1` })
const up = await until(`!!document.querySelector('textarea')`, 15000)
check('7d. the chat is up', up === true)
await wait(1500)
await ev(`(() => { const t = document.querySelector('textarea'); Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(t, 'did my rowing get logged?'); t.dispatchEvent(new Event('input', { bubbles: true })) })()`)
await wait(400)
await ev(`[...document.querySelectorAll('button')].find(b => /send/i.test(b.getAttribute('aria-label') || ''))?.click()`)
await until(`(window.__coachContexts ?? []).length > 0`, 8000)
const sent = await ev(`(window.__coachContexts ?? []).map(c => c?.cardio_log_history ?? null)`)
check('7e. a message was sent with its context', Array.isArray(sent) && sent.length >= 1, sent)
check('7f. THE COACH IS TOLD ABOUT THE ROWING — though it has never reached the server', /rowing for 8min/.test(sent?.[0] ?? ''), sent)
check('7g. ...and about the finisher that DID reach the server earlier — from the phone\'s own copy of it', new RegExp(`${target.activity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} for ${target.duration}min`).test(sent?.[0] ?? ''), sent)
check('7h. ...and not about the rope that was undone', !/skipping rope/.test(sent?.[0] ?? ''), sent)

// ---------------------------------------------------------------------------
// C. A DAY THAT WAS SWAPPED FOR SOMETHING ELSE (M14)
// ---------------------------------------------------------------------------
console.log('\n  8. A DAY REPLACED BY FOOTBALL, 60 MIN, HARD')
await ev(`localStorage.clear()`)
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&swappedpast=1#/tab/exercise` })
await until('!!window.__swappedPast', 12000)
const swapped = await ev('window.__swappedPast ?? null')
check('8a. the fixture has a swapped day earlier this week', !!swapped?.dayName, swapped)
if (!swapped) finish()
const FOOTBALL = 'Football · 60 min · Hard'
const cellSel = `button[aria-label^="${swapped.dayName}:"]`
await until(`${q(cellSel)}?.getAttribute('aria-label')?.includes('Football')`, 10000)
const cell = await ev(`(() => { const b = ${q(cellSel)}; return b ? { label: b.getAttribute('aria-label'), glyph: b.querySelector('span:last-child')?.textContent ?? null } : null })()`)
check('8b. the strip still marks it ⇄', cell?.glyph === '⇄', cell)
check(`8c. ...and now SAYS what for: "${swapped.dayName}: swapped for ${FOOTBALL}"`, cell?.label === `${swapped.dayName}: swapped for ${FOOTBALL}`, cell?.label)
await tapExpr(q(cellSel)); await wait(900)
const peek = await ev(`(() => { const b = ${q('[data-testid="peek-swapped"]')}; if (!b) return null; const list = b.nextElementSibling; return { text: b.innerText.replace(/\\s+/g, ' ').trim(), plannedRows: list ? list.querySelectorAll('[data-exercise-name], li, [role="button"]').length : 0, dimmed: list ? getComputedStyle(list).opacity : null, right: Math.round(b.getBoundingClientRect().right), vw: innerWidth } })()`)
check('8d. THE DAY CARD SAYS WHAT WAS DONE — it used to show the planned session and nothing else', peek?.text === `You did something else instead: ${FOOTBALL}.`, peek)
check('8e. ...the planned session is still there, dimmed — it is what the plan had', !!peek && peek.plannedRows > 0 && Number(peek.dimmed) < 1, peek)
check('8f. ...and the line fits the screen', !!peek && peek.right <= peek.vw, peek)
await ev(`${q('[data-testid="peek-swapped"]')}?.scrollIntoView({ block: 'start' })`); await ev('window.scrollBy(0, -90)'); await wait(300)
await shoot('cardio-shows-swapped-day')

await ev(`window.location.hash = '#/tab/home'`)
await until(`!!document.querySelector('[role="img"][aria-label^="${swapped.dayName}:"]')`, 8000)
await until(`document.querySelector('[role="img"][aria-label^="${swapped.dayName}:"]')?.getAttribute('aria-label')?.includes('Football')`, 8000)
check('8g. Home\'s strip says the same sentence', (await ev(`document.querySelector('[role="img"][aria-label^="${swapped.dayName}:"]')?.getAttribute('aria-label')`)) === `${swapped.dayName}: swapped for ${FOOTBALL}`)

await ev(`window.location.hash = '#/tab/exercise'`)
await until(`!!${byText('See the whole program ›')}`, 8000)
await tapExpr(byText('See the whole program ›'))
await until(`!!${q('[data-testid="program-swapped"]')}`, 8000)
const prog = await ev(`(() => { const n = ${q('[data-testid="program-swapped"]')}; if (!n) return null; n.scrollIntoView({ block: 'center' }); const row = n.closest('[role="button"]'); return { text: n.textContent.trim(), row: row ? row.innerText.replace(/\\s+/g, ' ').trim() : null, count: document.querySelectorAll('[data-testid="program-swapped"]').length } })()`)
check('8h. THE PROGRAMME VIEW SAYS IT TOO, on that day\'s row', prog?.text === `You did something else instead: ${FOOTBALL}` && (prog?.row ?? '').toUpperCase().startsWith(swapped.dayName.slice(0, 3).toUpperCase()), prog)
check('8i. ...and on no other day', prog?.count === 1, prog?.count)
await wait(300); await shoot('cardio-shows-programme')

await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&swappedpast=1#/tab/exercise` })
await until(`!!${q('button[aria-label="More options"]')}`, 12000)
await wait(800)
await tapExpr(q('button[aria-label="More options"]'))
await until(`!!${byText('Session history', '[role="menuitem"]')}`, 3000)
await ev(`${byText('Session history', '[role="menuitem"]')}?.click()`)
await until(`document.querySelectorAll('[data-testid="history-session"], [data-testid="history-cardio-day"]').length > 0`, 6000)
const hist2 = await ev(`[...document.querySelectorAll('[data-testid="history-session"], [data-testid="history-cardio-day"]')].map(n => ({ title: n.querySelector('p')?.textContent ?? '', lines: [...n.querySelectorAll('p')].slice(1).map(p => p.textContent.trim()) }))`)
check('8j. session history has the football on that date', (hist2 ?? []).some(h => h.title.includes(swapped.date) && h.lines.includes(FOOTBALL)), hist2)

check('9. no uncaught error on any page', pageErrors.length === 0, pageErrors)
finish()

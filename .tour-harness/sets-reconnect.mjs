// ---------------------------------------------------------------------------
// SETS NEVER LOOK LOST — H20, 9 Oct 2026, on the real session screen.
//
// The tester logged seven sets, the connection dropped for ten minutes, and
// the screen said "0 logged" — for minutes, and again for five seconds after a
// reload. A pill said "1 thing didn't save", which opened a pale pink card
// reading "Dumbbell Floor Press · set 4 · TypeError: Failed to fetch" under
// labels nobody could read. Nothing had been lost.
//
// scripts/test-sets-never-lost.ts holds the rules: a read that fails answers
// from the phone, a set that synced still has a copy, a dead connection is not
// a reason to give up on a set. THIS holds what only a screen can show — that
// the rows stay drawn while the tick is tapped on a dead connection, that a
// reload draws them BEFORE the read gives up rather than after, that the line
// under the title appears and goes, and that the card's words can be read: its
// contrast is measured off the pixels' own colours, in a dark theme and a
// light one, rather than asserted from a class name.
//
// THE NETWORK IS KILLED THE WAY IT DIES ON A PHONE: every request resolves
// with an error (see fake-supabase's __netDown) and navigator.onLine stays
// true. Nothing here fires an `offline` event, because nothing did.
//
// One thing a single page cannot show: the harness's "server" is in memory and
// starts empty on every load, so reconnecting AFTER a reload would have the
// server truthfully answer "no sets". Reconnection is therefore driven on the
// page that logged the sets, and the reload is checked on a dead connection.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => { const p = q.url.split('?')[0]; const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p); if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return } r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' }); r.end(readFileSync(f)) })
await new Promise(r => server.listen(0, r)); const port = server.address().port
const PORT = 9601
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

let failures = 0
let ran = 0
const check = (name, ok, detail) => {
  ran++
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 420)}` : ''}`) }
}
// ONE EXIT. A run that executed fewer checks than usual is a crash, not a pass.
const finish = () => {
  console.log(`\n${ran} checks ran. ${failures === 0 ? 'A dead connection never makes a logged set look lost.' : `${failures} check(s) FAILED.`}\n`)
  ws.close(); chrome.kill(); server.close()
  process.exit(failures === 0 ? 0 : 1)
}

const J = JSON.stringify
const pointAt = async at => { for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 }) }
const centreOf = expr => ev(`(() => { const n = ${expr}; if (!n) return null; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null })()`)
const tapExpr = async expr => { const at = await centreOf(expr); if (!at) return false; await wait(120); const again = await centreOf(expr); await pointAt(again ?? at); return true }
const cardExpr = name => `[...document.querySelectorAll('[data-exercise-name]')].find(x => x.getAttribute('data-exercise-name') === ${J(name)})`
const until = async (expr, ms = 9000) => { const t0 = Date.now(); let v = await ev(expr); while (!v && Date.now() - t0 < ms) { await wait(200); v = await ev(expr) } return v }

/** One pass over a card: every row's state, its receipt, and the count the card states. */
const readCard = name => ev(`(() => {
  const card = ${cardExpr(name)}
  const none = { found: false, rows: [], count: null, text: '' }
  if (!card) return none
  const rows = [...card.querySelectorAll('[data-testid="working-row"]')].map(row => {
    const receipt = row.nextElementSibling?.getAttribute('data-testid') === 'set-receipt' ? row.nextElementSibling : null
    const inputs = [...row.querySelectorAll('input')]
    const spokenSaved = [...row.querySelectorAll('button')].some(b => / saved$/i.test(b.getAttribute('aria-label') || ''))
    return {
      // The row's own state where it states one; otherwise what its tick is
      // announced as — so this driver can be pointed at a build from before
      // the attribute existed and fail on the BUG, not on a missing hook.
      sync: row.getAttribute('data-sync') ?? (spokenSaved ? 'saved' : null),
      needsWeight: row.getAttribute('data-needs-weight') === 'true',
      weightDisabled: !!inputs[0]?.disabled,
      spoken: [...row.querySelectorAll('button')].map(b => b.getAttribute('aria-label') || '').find(a => /set \\d/i.test(a)) ?? null,
      receipt: receipt ? receipt.querySelector('p')?.textContent.replace(/\\s+/g, ' ').trim() : null,
      retry: !!receipt?.querySelector('[data-testid="set-retry"]'),
    }
  })
  // The half after the dot: "3 working sets · 2 logged" → "2 logged".
  const stated = card.innerText.match(/working sets · ([^\\n]+)/)?.[1]?.trim() ?? null
  return { found: true, rows, count: stated, text: card.innerText }
})()`)

/** Types into one of a row's two boxes the way a thumb does, so React's onChange runs. */
const typeInto = async (name, rowIndex, box, value) => {
  if (!(await tapExpr(`${cardExpr(name)}?.querySelectorAll('[data-testid="working-row"]')[${rowIndex}]?.querySelectorAll('input')[${box}]`))) return false
  for (const ch of String(value)) { await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }) }
  await wait(250)
  return true
}

/** Tick working set `rowIndex + 1` of a card. A row that offers no weight gets one typed first; otherwise the tick takes what the plan offers, as a thumb would. */
const tick = async (name, rowIndex) => {
  const before = (await readCard(name)).rows[rowIndex]
  if (!before) return false
  if (before.needsWeight && !before.weightDisabled) await typeInto(name, rowIndex, 0, '10')
  const ok = await tapExpr(`[...(${cardExpr(name)}?.querySelectorAll('[data-testid="working-row"]')[${rowIndex}]?.querySelectorAll('button') ?? [])].find(b => /^save set/i.test(b.getAttribute('aria-label') || ''))`)
  await wait(900)
  // A weight past what the app thinks this person owns asks for a second tap.
  const after = (await readCard(name)).rows[rowIndex]
  if (ok && after && !after.sync) { await tapExpr(`[...(${cardExpr(name)}?.querySelectorAll('[data-testid="working-row"]')[${rowIndex}]?.querySelectorAll('button') ?? [])].find(b => /^save set/i.test(b.getAttribute('aria-label') || ''))`); await wait(900) }
  return ok
}

/** Rows only exist on an open card. Opens it if it is shut — and never taps one that is already open, which would shut it. */
const ensureOpen = async name => {
  const open = () => ev(`(${cardExpr(name)}?.querySelectorAll('[data-testid="working-row"]').length ?? 0) > 0`)
  if (await open()) return true
  await tapExpr(`${cardExpr(name)}?.querySelector('[role="button"]')`)
  await wait(700)
  return open()
}

const line = () => ev(`document.querySelector('[data-testid="sets-reconnecting"]')?.textContent.replace(/\\s+/g, ' ').trim() ?? null`)
const serverSets = () => ev(`(window.__fakeDb?.exercise_set_logs ?? []).filter(r => !String(r.id).startsWith('lg') && !String(r.id).startsWith('bw')).map(r => r.exercise_name + '#' + r.set_number)`)
const pill = () => ev(`document.querySelector('[data-testid="didnt-save-pill"]')?.textContent.replace(/\\s+/g, ' ').trim() ?? null`)

console.log('\nSETS NEVER LOOK LOST\n')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off#/tab/exercise` })
await until(`document.querySelectorAll('[data-exercise-name]').length > 0`, 12000)
await wait(1500)

// The card the screen opened on, and the one after it — asked of the page,
// never named: the fixture's plan has reshuffled before.
// WHICH EXERCISES — asked of the page, never named: the fixture's plan has
// reshuffled before. X needs three working sets (one saved, one sent late, one
// given up on); it is opened by hand, so it stays open once its sets are done.
const names = (await ev(`[...document.querySelectorAll('[data-exercise-name]')].map(c => c.getAttribute('data-exercise-name'))`)) ?? []
let X = null
const seen = []
for (const name of names) {
  await ensureOpen(name)
  const n = (await readCard(name)).rows.length
  seen.push({ name, rows: n })
  if (n >= 3) { X = name; break }
}
check('0a. today has an exercise with at least three working sets to log', !!X, seen)
if (!X) finish()
const Y = names.find(n => n !== X) ?? null
check('0b. ...and another exercise beside it', !!Y, names)
console.log(`  logging on "${X}", then "${Y}"`)

// ---- 1. A good connection --------------------------------------------------
console.log('\n  1. A GOOD CONNECTION')
await tick(X, 0)
const live = await readCard(X)
check('1a. set 1 is logged, and the server has it', live.rows[0]?.sync === 'saved' && (await serverSets()).includes(`${X}#1`), { row: live.rows[0], server: await serverSets() })
check('1b. the card says "1 logged"', live.count === '1 logged', live.count)
check('1c. its receipt ends in a tick', /✓$/.test(live.rows[0]?.receipt ?? ''), live.rows[0]?.receipt)
check('1d. nothing about reconnecting is on screen', (await line()) === null, await line())

// ---- 2. The connection dies -------------------------------------------------
console.log('\n  2. THE CONNECTION DIES — the browser still says online')
await ev(`window.__netDown = true`)
check('2a. (the browser was never told)', (await ev('navigator.onLine')) === true)
await tick(X, 1)
const outageAt = Date.now()
// SIGNAL THAT FLAPS. Each `online` the phone thinks it sees is another attempt
// on a connection that is still dead — six of them, on top of the first, is
// more than the five the old build allowed before it filed the set under
// "didn't save" and waited for a tap on Retry.
for (let i = 0; i < 6; i++) { await ev(`window.dispatchEvent(new Event('online'))`); await wait(200) }
await until(`!!document.querySelector('[data-testid="sets-reconnecting"]')`, 6000)
const out = await readCard(X)
check('2b. THE SET ALREADY LOGGED IS STILL LOGGED — a tick on a dead connection used to wipe it', out.rows[0]?.sync === 'saved', out.rows.map(r => r.sync))
check('2c. the new set is on the grid too', ['waiting', 'saving'].includes(out.rows[1]?.sync), out.rows.map(r => r.sync))
check('2d. the card says "2 logged", not "1" and not "0"', out.count === '2 logged', out.count)
check('2e. nothing reached the server', !(await serverSets()).includes(`${X}#2`), await serverSets())
const waited = await until(`${cardExpr(X)}?.querySelectorAll('[data-testid="working-row"]')[1]?.getAttribute('data-sync') === 'waiting'`, 6000)
const outLater = await readCard(X)
check('2f. the row says it is waiting to send, in words, instead of a tick', waited === true && /waiting to send$/.test(outLater.rows[1]?.receipt ?? '') && !/✓/.test(outLater.rows[1]?.receipt ?? ''), outLater.rows[1])
check('2g. ...and its button is not announced as saved', /waiting to send/i.test(outLater.rows[1]?.spoken ?? ''), outLater.rows[1]?.spoken)
const said = await line()
check('2h. the screen says it is reconnecting and that the sets are safe', /^Reconnecting/.test(said ?? '') && /your sets are safe/i.test(said ?? ''), said)
check('2i. SEVEN FAILED ATTEMPTS IN, NOTHING IS ON THE "DIDN\'T SAVE" LIST — a dead connection is never a reason to give up on a set',
  (await pill()) === null && outLater.rows[1]?.sync === 'waiting', { pill: await pill(), row: outLater.rows[1]?.sync })
const lineBox = await ev(`(() => { const n = document.querySelector('[data-testid="sets-reconnecting"]'); if (!n) return null; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), right: Math.round(r.right), vw: innerWidth } })()`)
check('2j. the line fits the screen', !!lineBox && lineBox.right <= lineBox.vw, lineBox)
await shoot('sets-reconnect-outage')

// ---- 3. It comes back, and nobody has to do anything ------------------------
console.log('\n  3. THE CONNECTION COMES BACK — no tap, no reload, no "online" event')
// WHEN IT COMES BACK IS CHOSEN, so that two different things can be told apart.
// The queue retries a waiting set on its own clock (about 3, 11 and 27 seconds
// into this outage) and the screen re-reads on another (about 2, 8 and 20). At
// 13 seconds the next thing to happen is the screen's read at 20 — seven
// seconds before the queue would have tried again by itself.
await wait(Math.max(0, 13000 - (Date.now() - outageAt)))
await ev(`window.__netDown = false`)
const gone = await until(`!document.querySelector('[data-testid="sets-reconnecting"]')`, 12000)
check('3a. the reconnecting line goes on its own', gone === true, await line())
// AT ONCE, not whenever the queue's own backoff next comes round (that can be
// a minute). The read that found the server again is what sends the set, so
// the two land together; a second and a half is room for a poll and a paint.
const savedSoon = await until(`${cardExpr(X)}?.querySelectorAll('[data-testid="working-row"]')[1]?.getAttribute('data-sync') === 'saved'`, 1500)
check('3b. the waiting set is sent the moment the connection is found again', savedSoon === true, (await readCard(X)).rows.map(r => r.sync))
await until(`${cardExpr(X)}?.querySelectorAll('[data-testid="working-row"]')[1]?.getAttribute('data-sync') === 'saved'`, 70000)
const back = await readCard(X)
check('3b2. ...and the server has it', back.rows[1]?.sync === 'saved' && (await serverSets()).includes(`${X}#2`), { rows: back.rows.map(r => r.sync), server: await serverSets() })
check('3c. ...and its receipt is a tick again', /✓$/.test(back.rows[1]?.receipt ?? ''), back.rows[1]?.receipt)
check('3d. still "2 logged"', back.count === '2 logged', back.count)

// ---- 4. A set the server refuses stays on the grid ---------------------------
console.log('\n  4. A SET THE SERVER REFUSES')
await ensureOpen(Y)
await ev(`window.__failWrite = (t, op, row) => t === 'exercise_set_logs' && row.exercise_name === ${J(Y)}`)
await tick(Y, 0)
await until(`${cardExpr(Y)}?.querySelectorAll('[data-testid="working-row"]')[0]?.getAttribute('data-sync') === 'failed'`, 6000)
const refused = await readCard(Y)
check('4a. the refused set is STILL ON THE GRID — it used to vanish', refused.rows[0]?.sync === 'failed', refused.rows.map(r => r.sync))
check('4b. its row says it didn\'t save, and offers Retry', /didn't save$/.test(refused.rows[0]?.receipt ?? '') && refused.rows[0]?.retry === true, refused.rows[0])
check('4c. the pill counts it', /^1 thing didn't save/.test((await pill()) ?? ''), await pill())
await ev(`window.__failWrite = undefined`)
await tapExpr(`${cardExpr(Y)}?.querySelector('[data-testid="set-retry"]')`)
await until(`${cardExpr(Y)}?.querySelectorAll('[data-testid="working-row"]')[0]?.getAttribute('data-sync') === 'saved'`, 6000)
const retried = await readCard(Y)
check('4d. Retry on the row saves it', retried.rows[0]?.sync === 'saved' && (await serverSets()).includes(`${Y}#1`), { rows: retried.rows.map(r => r.sync), server: await serverSets() })
check('4e. ...and the pill goes', (await pill()) === null, await pill())

// ---- 5. Reload on a dead connection ------------------------------------------
console.log('\n  5. RELOAD WITH THE CONNECTION DEAD')
// What the build before this one left on a phone: a set that "gave up" after a
// minute of a dead connection, filed with the browser's own error text. Made
// from a real queued set rather than typed out, so its shape is the store's.
await ev(`window.__netDown = true`)
await tick(X, 2)
const planted = await ev(`(() => {
  const P = 'fitplan_setlog_pending_v1', D = 'fitplan_setlog_deadletter_v1'
  const pending = JSON.parse(localStorage.getItem(P) || '[]')
  const op = pending.find(o => o.kind === 'upsert' && o.set.exerciseName === ${J(X)} && o.set.setNumber === 3)
  if (!op) return false
  localStorage.setItem(P, JSON.stringify(pending.filter(o => o !== op)))
  localStorage.setItem(D, JSON.stringify([{ op, reason: 'max-attempts', errorMessage: 'TypeError: Failed to fetch', failedAt: op.set.completedAt }]))
  return true
})()`)
check('5a. (a set left "given up" by the old build is on the phone)', planted === true)

// Six seconds to fail, like the real client's three retries — and the screen
// is read INSIDE that window, which is when it said "0 logged".
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&netdown=1&slow=6000#/tab/exercise` })
const t0 = Date.now()
await until(`!!(${cardExpr(X)})`, 12000)
await ensureOpen(X)
const during = await readCard(X)
const lineDuring = await line()
const waitedMs = Date.now() - t0
check('5b. (read while the first request was still out)', lineDuring === null && waitedMs < 6000, { lineDuring, waitedMs })
check('5c. THE SETS ARE ALREADY DRAWN — not "0 logged" until the read gives up', during.count === '3 logged', during.count)
check('5d. ...the two that saved, as saved', during.rows[0]?.sync === 'saved' && during.rows[1]?.sync === 'saved', during.rows.map(r => r.sync))
check('5e. ...and the one that was given up on, on the grid with Retry', during.rows[2]?.sync === 'failed' && during.rows[2]?.retry === true, during.rows[2])
const zero = await ev(`[...document.querySelectorAll('[data-exercise-name]')].map(c => c.innerText.match(/working sets · ([^\\n]+)/)?.[1]?.trim()).filter(Boolean)`)
check('5f. every open card states a count, and none of them is a guess', Array.isArray(zero) && zero.length >= 1 && zero.every(z => /^\d+ logged$/.test(z)), zero)

await until(`!!document.querySelector('[data-testid="sets-reconnecting"]')`, 14000)
const after = await readCard(X)
check('5g. once the read gives up, the screen says so — and the sets are still there', /your sets are safe/i.test((await line()) ?? '') && after.count === '3 logged', { line: await line(), count: after.count })
await ev(`document.querySelector('[data-testid="sets-reconnecting"]')?.scrollIntoView({ block: 'start' })`)
await ev(`window.scrollBy(0, -80)`)
await wait(300)
await shoot('sets-reconnect-reload')

// ---- 6. The "Didn't save" card ------------------------------------------------
console.log('\n  6. THE "DIDN\'T SAVE" CARD')
check('6a. the pill is up for the set that was given up on', /^1 thing didn't save/.test((await pill()) ?? ''), await pill())
await tapExpr(`document.querySelector('[data-testid="didnt-save-pill"]')`)
await until(`!!document.querySelector('[data-testid="didnt-save-item"]')`, 4000)
const card = await ev(`(() => {
  const item = document.querySelector('[data-testid="didnt-save-item"]')
  if (!item) return null
  const panel = item.closest('[data-slot="card"]') ?? item.parentElement
  return { item: item.innerText.replace(/\\s+/g, ' ').trim(), reason: item.querySelector('[data-testid="didnt-save-reason"]')?.textContent.trim() ?? null, panel: panel.innerText.replace(/\\s+/g, ' ').trim() }
})()`)
check('6b. it names the set', !!card && card.item.includes(`${X} · set 3`), card?.item)
check('6c. NO RAW ERROR — no "TypeError", no "fetch", no code', !!card && !/TypeError|fetch|08006|simulated|undefined|NaN/i.test(card.panel), card?.panel)
check('6d. it says why, in words', card?.reason === 'There was no connection when this was saved.', card?.reason)
check('6e. ...and that the set is still on the phone', /Still saved on this device/.test(card?.panel ?? ''), card?.panel)

// CONTRAST, MEASURED. Every piece of text on the card against what is actually
// behind it — the tint, composited over the sheet, composited over the page —
// with each colour put through a canvas first, because the browser reports a
// mixed colour in whatever space it mixed it in.
const measure = () => ev(`(() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  const rgba = str => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = str; ctx.fillRect(0, 0, 1, 1); const d = ctx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255] }
  const over = (top, under) => { const a = top[3]; return [0, 1, 2].map(i => top[i] * a + under[i] * (1 - a)).concat(1) }
  const behind = el => {
    const stack = []
    for (let n = el; n; n = n.parentElement) { const c = rgba(getComputedStyle(n).backgroundColor); if (c[3] > 0) stack.push(c); if (c[3] >= 0.999) break }
    let out = rgba(getComputedStyle(document.body).backgroundColor); if (out[3] < 1) out = [255, 255, 255, 1]
    for (const c of stack.reverse()) out = over(c, out)
    return out
  }
  const lum = c => { const [r, g, b] = c.slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
  const item = document.querySelector('[data-testid="didnt-save-item"]')
  if (!item) return null
  const texts = [...item.querySelectorAll('span, p')].filter(n => n.children.length === 0 && n.textContent.trim() && !n.closest('button'))
  return texts.map(n => {
    const fg = over(rgba(getComputedStyle(n).color), behind(n)), bg = behind(n)
    const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a)
    return { text: n.textContent.trim().slice(0, 40), ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100 }
  })
})()`)
const dark = await measure()
console.log('      dark theme:  ' + (dark ?? []).map(d => `"${d.text}" ${d.ratio}:1`).join(' · '))
check('6f. every line on the card reads at 4.5:1 or better on the default dark theme', Array.isArray(dark) && dark.length >= 4 && dark.every(d => d.ratio >= 4.5), dark)
await shoot('sets-reconnect-didnt-save')
await ev(`(() => { const el = document.documentElement; el.setAttribute('data-theme', 'daylight'); el.setAttribute('data-canvas', 'light') })()`)
await wait(300)
const light = await measure()
console.log('      light theme: ' + (light ?? []).map(d => `"${d.text}" ${d.ratio}:1`).join(' · '))
check('6g. ...and on a light theme', Array.isArray(light) && light.length >= 4 && light.every(d => d.ratio >= 4.5), light)
await shoot('sets-reconnect-didnt-save-light')
await ev(`(() => { const el = document.documentElement; el.setAttribute('data-theme', 'nightshift'); el.removeAttribute('data-canvas') })()`)

// Retry, with the connection still dead: back to waiting, off the list.
await tapExpr(`[...document.querySelectorAll('[data-testid="didnt-save-item"] button')].find(b => /retry/i.test(b.textContent))`)
await until(`!document.querySelector('[data-testid="didnt-save-pill"]')`, 5000)
await ev(`[...document.querySelectorAll('button[aria-label="Close"]')].forEach(b => b.click())`)
await until(`${cardExpr(X)}?.querySelectorAll('[data-testid="working-row"]')[2]?.getAttribute('data-sync') === 'waiting'`, 6000)
const requeued = await readCard(X)
check('6h. Retry with no connection puts it back to waiting — off the list, still on the grid', (await pill()) === null && requeued.rows[2]?.sync === 'waiting' && requeued.count === '3 logged', { pill: await pill(), rows: requeued.rows.map(r => r.sync), count: requeued.count })


check('7. no uncaught error on the page', pageErrors.length === 0, pageErrors)
finish()

// ---------------------------------------------------------------------------
// "I'VE ONLY GOT 25 MINUTES TODAY" — on the real screen.
//
// scripts/test-today-only.ts holds the rules: what shortenDayTo protects, what
// it drops, which week's row a 'today' scope writes, and that the shortfall
// warning stays quiet on a day somebody shortened on purpose. This holds the
// half no source check can — that on a real mount at phone width the two verbs
// are on the day menu, that tapping a time visibly takes the tail off the
// session while the main lift keeps every set and every kilo, that the change
// survives leaving the tab, that the screen SAYS it was shortened rather than
// silently showing a thin session, and that the verbs disappear the moment the
// day stops being a session you are about to do.
//
// THE MAIN LIFT IS READ FROM ITS SECTION LABEL, not from position. "The first
// row survived" would pass on a plan whose first row is a primer, and would
// keep passing if the protection were deleted and the trimmer simply happened
// to cut from the bottom. The label is the app's own claim about which lift
// is the main one, and the row under it is compared WHOLE — sets, reps and
// weight — so a protection that kept the name but shaved a set fails here.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'
const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => { const p = q.url.split('?')[0]; const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p); if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return } r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' }); r.end(readFileSync(f)) })
await new Promise(r => server.listen(0, r)); const port = server.address().port
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9413', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms)); let t
for (let i = 0; i < 80; i++) { try { const l = await fetch('http://127.0.0.1:9413/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {} await wait(250) }
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

// Radix menus open on pointerdown, so element.click() on the trigger is not
// enough — real pointer events at the element's centre.
const rectOf = sel => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return null; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
const tap = async sel => { const r = await rectOf(sel); if (!r) return false; await wait(120); const r2 = await rectOf(sel); for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: r2.x, y: r2.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 }); return true }
const clickSel = sel => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return false; n.click(); return true })()`)
const has = sel => ev(`!!document.querySelector(${JSON.stringify(sel)})`)
const order = () => ev(`[...document.querySelectorAll('[data-exercise-name]')].map(n => n.getAttribute('data-exercise-name'))`)
const verbs = () => ev(`[...document.querySelectorAll('[data-testid="what-happened-verbs"] [data-verb]')].map(b => b.getAttribute('data-verb'))`)
const note = () => ev(`document.querySelector('[data-testid="session-length-note"]')?.textContent?.trim() || ''`)
const headerText = () => ev(`document.querySelector('[data-testid="week-context-row"], header')?.innerText || document.body.innerText.slice(0, 400)`)

// The row the app itself calls the main lift, and everything printed on it.
// The section label is a direct child span of the group div that holds the
// row, so the row is found through the label rather than by index.
const MAIN_LIFT_JS = `(() => {
  const label = [...document.querySelectorAll('span')].find(s => /^Main lift\\b/.test(s.textContent.trim()))
  if (!label) return null
  const row = label.parentElement?.querySelector('[data-exercise-name]')
  if (!row) return null
  return { name: row.getAttribute('data-exercise-name'), text: row.innerText.replace(/\\s+/g, ' ').trim() }
})()`
const mainLift = () => ev(MAIN_LIFT_JS)

const escape = async () => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await wait(450) }
const openSheet = async () => {
  if (await has('[data-testid="what-happened-sheet"]')) await escape()
  await tap('button[aria-label="More options"]'); await wait(500)
  if (!(await has('[data-testid="what-happened-item"]'))) return 'no-menu-item'
  await tap('[data-testid="what-happened-item"]'); await wait(600)
  return (await has('[data-testid="what-happened-sheet"]')) ? 'open' : 'no-sheet'
}
const untilClosed = async () => { for (let i = 0; i < 16 && await has('[data-testid="what-happened-sheet"]'); i++) await wait(250); return !(await has('[data-testid="what-happened-sheet"]')) }
const untilOrder = async pred => { let o = await order(); for (let i = 0; i < 24 && !pred(o); i++) { await wait(300); o = await order() } return o }

console.log('\nI’VE ONLY GOT 25 MINUTES TODAY — on the screen\n')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off#/tab/exercise` })
await wait(4500)

const start = await order()
check('0a. today shows a real session with a tail to lose', Array.isArray(start) && start.length >= 4, start)
const mainBefore = await mainLift()
check('0b. ...and the app names one of them the main lift', !!mainBefore?.name, mainBefore)
const estBefore = await ev(`(document.body.innerText.match(/~(\\d+) min/) || [])[1] || null`)
check('0c. ...with a length on the header to compare against', estBefore != null && Number(estBefore) >= 30, estBefore)
check('0d. nothing yet says the session was shortened', !/Shortened to/.test(await note()), await note())

// --- the two verbs are on the day menu -------------------------------------
check('1a. the day menu opens', (await openSheet()) === 'open')
const v0 = await verbs()
check('1b. today offers "I’m short of time" and "make it easier"', v0.includes('shorten') && v0.includes('lighter'), v0)
check('1c. ...after the verbs that say what already happened, not before them',
  v0.indexOf('shorten') > v0.indexOf('missed') && v0.indexOf('lighter') > v0.indexOf('rest'), v0)
await shoot('shorten-today-menu')

// --- it asks how long, in the times somebody actually says -----------------
check('2a. "I’m short of time today" asks how long', await clickSel('[data-verb="shorten"]') && (await wait(500), await has('[data-testid="what-happened-shorten"]')))
const choices = await ev(`[...document.querySelectorAll('[data-shorten-minutes]')].map(b => Number(b.getAttribute('data-shorten-minutes')))`)
check('2b. ...offering fixed times, not a keyboard', Array.isArray(choices) && choices.length >= 2 && !(await has('[data-testid="what-happened-shorten"] input')), choices)
check('2c. ...every one of them genuinely shorter than the session in front of you',
  choices.every(m => m <= Number(estBefore) - 5), { choices, estBefore })
const promise = await ev(`document.querySelector('[data-testid="what-happened-shorten"]')?.innerText || ''`)
check('2d. ...and it says what will survive and what will go, before the tap',
  /main lift stays/i.test(promise) && /accessory/i.test(promise) && /next week/i.test(promise), promise)
check('2e. ...including the floor it will not cut past',
  /at least two others/i.test(promise), promise)
await shoot('shorten-today-choices')

// --- the tap ----------------------------------------------------------------
const target = choices[choices.length - 1] < Number(estBefore) - 10 ? choices[choices.length - 1] : choices[0]
check(`3a. tapping "${target} min"`, await clickSel(`[data-shorten-minutes="${target}"]`) && await untilClosed())
const after = await untilOrder(o => o.length < start.length)
check('3b. the session visibly lost exercises', after.length < start.length, { start, after })
check('3c. ...and lost them from the end — nothing was reordered',
  after.every((n, i) => start.indexOf(n) >= (i === 0 ? 0 : start.indexOf(after[i - 1]))) && after.every(n => start.includes(n)), { start, after })
const mainAfter = await mainLift()
check('3d. the main lift is still the main lift', mainAfter?.name === mainBefore?.name, { before: mainBefore?.name, after: mainAfter?.name })
check('3e. ...with every set, rep and kilo it had — Ashley’s ruling, 13 Sep',
  mainAfter?.text === mainBefore?.text, { before: mainBefore?.text, after: mainAfter?.text })
const estAfter = await ev(`(document.body.innerText.match(/~(\\d+) min/) || [])[1] || null`)
check('3f. the header’s own estimate came down', estAfter != null && Number(estAfter) < Number(estBefore), { estBefore, estAfter, target })
await shoot('shorten-today-shortened')

// --- IT SAYS SO, AND SAYS IT TRUTHFULLY -------------------------------------
//
// A thin session with no explanation reads as a lost one — but a line reading
// "shortened to 20 min" beside this row's own "~26 min" is worse, and is what
// the first run of this driver actually found: 48 minutes asked down to 20
// lands at 26, because the main lift is protected and three exercises are the
// floor. So the check is not "it prints the number asked for" — it is that the
// two numbers on screen agree, whichever branch the app takes.
const shortenedNote = await note()
check('4a. the screen says the session was shortened', /^Shortened/.test(shortenedNote), shortenedNote)
const claimsTarget = new RegExp(`Shortened to ${target} min`).test(shortenedNote)
check('4b. ...and never states a length its own estimate contradicts',
  claimsTarget
    ? Number(estAfter) <= target
    : new RegExp(`\\b${estAfter} min is as low as`).test(shortenedNote),
  { shortenedNote, estAfter, target })
check('4c. ...and that it is back to full next week', /next week/i.test(shortenedNote), shortenedNote)
check('4d. ...and does NOT also warn that the session is short',
  !/runs shorter than the/.test(await ev(`document.body.innerText`)))

// --- it stuck ---------------------------------------------------------------
await ev(`location.hash = '#/tab/home'`); await wait(1500)
await ev(`location.hash = '#/tab/exercise'`); await wait(2500)
const afterTrip = await untilOrder(o => o.length === after.length)
check('5a. the shortening survives leaving the tab and coming back', afterTrip.join('|') === after.join('|'), { after, afterTrip })
check('5b. ...and so does the line saying so', /^Shortened/.test(await note()), await note())

// --- one step lighter --------------------------------------------------------
check('6a. the day menu still offers "make it easier"', (await openSheet()) === 'open' && (await verbs()).includes('lighter'), await verbs())
const setsBefore = await ev(`[...document.querySelectorAll('[data-exercise-name]')].map(n => n.innerText.replace(/\\s+/g, ' ').trim())`)
check('6b. tapping it closes the sheet', await clickSel('[data-verb="lighter"]') && await untilClosed())
let setsAfter = setsBefore
for (let i = 0; i < 20 && JSON.stringify(setsAfter) === JSON.stringify(setsBefore); i++) { await wait(300); setsAfter = await ev(`[...document.querySelectorAll('[data-exercise-name]')].map(n => n.innerText.replace(/\\s+/g, ' ').trim())`) }
check('6c. ...and something on the session actually got lighter', JSON.stringify(setsAfter) !== JSON.stringify(setsBefore), { setsBefore, setsAfter })
check('6d. ...without losing an exercise — lighter is not shorter',
  (await order()).length === afterTrip.length, { afterTrip, now: await order() })
await shoot('shorten-today-lighter')

// --- 7. THE GATING. A day that is no longer a session you are about to do ----
//
// This is the half test:today-only cannot reach: whether the two verbs are
// OFFERED. The unit gate can prove shortenDayTo refuses a day with no
// exercises; only a real mount can prove the button is not there to press.
check('7a. declaring the day missed', (await openSheet()) === 'open' && await clickSel('[data-verb="missed"]') && (await wait(800), true))
await escape(); await wait(600)
check('7b. reopening the menu', (await openSheet()) === 'open')
const vMissed = await verbs()
check('7c. a day you have said you missed is not offered shortening or lightening',
  !vMissed.includes('shorten') && !vMissed.includes('lighter'), vMissed)
await shoot('shorten-today-gated')

console.log(failures === 0 ? '\nShortening takes the tail off, keeps the main lift whole, says so, and sticks.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)

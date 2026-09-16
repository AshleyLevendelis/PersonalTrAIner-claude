// ---------------------------------------------------------------------------
// PROGRESS WHEN THERE IS NO WEIGHT ON THE BAR — read off a real screen.
//
// The defect was invisible to both the data and the source. The rows were
// always in the database; six separate filters meant no pixel ever showed
// them. Someone training at home with no kit had an empty graph and no
// personal best, for ever — 5 chin-ups to 15 registered nowhere.
//
// test:bodyweight-progress calls every decision function and proves its
// answers, and that is the right place for the logic. It cannot prove a
// number REACHES a screen, and it cannot see the thing that would actually
// hurt: a reps figure rendered into a slot that says "kg". That is a
// screenshot's job.
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
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9431', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let t
for (let i = 0; i < 80; i++) {
  try { const l = await fetch('http://127.0.0.1:9431/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {}
  await wait(250)
}
const ws = new WebSocket(t); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value
// A REAL POINTER EVENT, not element.click(). The row menu is a Radix
// dropdown: it opens on pointerdown and ignores a synthetic click, so the
// first version of this driver "opened" a menu that was never there and
// then reported no History item. Centre of the element's own box, through
// the browser's input pipeline.
const tapCentre = async selectorFn => {
  const box = await ev(`(() => { const el = ${selectorFn}; if (!el) return null
    const r = el.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null })()`)
  if (!box) return false
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 })
  }
  return true
}
const shoot = async name => writeFileSync(`/home/user/PersonalTrAIner-claude/.tour-harness/${name}.png`,
  Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'))

let failures = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 320)}` : ''}`) }
}
const finish = async () => {
  console.log(failures === 0 ? '\nAll bodyweight-progress screen checks passed.\n' : `\n${failures} check(s) FAILED.\n`)
  ws.close(); chrome.kill(); server.close()
  process.exit(failures === 0 ? 0 : 1)
}

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

console.log('\nPROGRESS WHEN THERE IS NO WEIGHT ON THE BAR\n')

// ---- 1. Home's recent PRs -------------------------------------------------
console.log('  HOME — the recent personal bests')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&bwpr=1#/tab/home` })
await wait(5000)

const home = await ev('document.body.innerText')
check('1a. the PR section is on screen at all', /Recent PRs/i.test(home), home.slice(0, 200))

// THE FIXTURE MUST BE THE ONE THIS IS ABOUT. Without this the six checks
// below could all pass against a page that never had a bodyweight record.
check('1b. the bodyweight exercise reached the list', /Pull-Ups/i.test(home), home.slice(0, 400))

// The section, isolated — so "12 reps" appearing somewhere else on Home
// cannot satisfy a check about the PR list.
const prBlock = await ev(`(() => {
  const label = [...document.querySelectorAll('*')].find(n => n.children.length === 0 && /^Recent PRs$/i.test(n.textContent.trim()))
  return label ? (label.parentElement?.innerText ?? '') : ''
})()`)
check('1c. the PR block was found, so the checks below are not vacuous', prBlock.length > 0, prBlock)
check('1d. the bodyweight best reads in REPS', /Pull-Ups[\s\S]*?\b14 reps\b/.test(prBlock), prBlock)
// THE DEFECT THIS EXISTS FOR. Before today the renderer printed `${value} kg`
// with no branch: a bodyweight record showed "0 kg", and a reps record would
// have shown "14 kg" — a number in the wrong unit, which reads as correct.
check('1e. ...and NOT as kilograms', !/Pull-Ups[\s\S]*?\b14 ?kg\b/.test(prBlock), prBlock)
check('1f. ...and not as the "0 kg" it used to show', !/Pull-Ups[\s\S]*?\b0 ?kg\b/.test(prBlock), prBlock)
check('1g. the belt record reads as ADDED weight, with its plus', /Dips[\s\S]*?\+12kg/.test(prBlock), prBlock)
check('1h. ...and the belt is not reported as reps', !/Dips[\s\S]*?\b12 reps\b/.test(prBlock), prBlock)

// SCROLL TO IT BEFORE SHOOTING. The section sits below the fold on a 390x844
// phone, and innerText reads it whether it is visible or not — so a
// screenshot taken at the top proves the checks ran, not that anyone could
// read the result. The picture is the point.
await ev(`(() => {
  const label = [...document.querySelectorAll('*')].find(n => n.children.length === 0 && /^Recent PRs$/i.test(n.textContent.trim()))
  label?.scrollIntoView({ block: 'center' })
})()`)
await wait(600)
await shoot('bodyweight-progress-home')

const err = await ev('window.__err ?? null')
check('1i. no uncaught error on the page', err === null, err)

// ---- 2. The graph ---------------------------------------------------------
console.log('\n  THE EXERCISE — the trend that was permanently empty')
// The detail dialog is opened from the EXERCISE tab, not from Home — Home's
// PR rows are plain text. Going there rather than reporting the graph as
// unreachable: "the driver could not get to the screen" and "the screen is
// correct" must never print the same thing.
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&bwpr=1#/tab/exercise` })
await wait(5000)
// THE GRAPH IS BEHIND THE ROW'S "⋮" MENU, not the row itself — Ashley's
// 14 Sep ruling put every per-exercise action there. Three taps, the way a
// person reaches it: expand the exercise, open its menu, choose History.
// Walking the real controls rather than deep-linking a state, because a
// route nobody can tap is not a route.
const opened = await ev(`(() => {
  const leaf = [...document.querySelectorAll('*')]
    .find(n => n.children.length === 0 && /^Pull-?Ups?$/i.test((n.textContent ?? '').trim()))
  if (!leaf) return 'no leaf'
  // WALK UP TO THIS EXERCISE'S ROW, NOT JUST TO SOMETHING WITH A BUTTON.
  // The first version stopped at the first ancestor holding any button and
  // landed on a CONTAINER — so the menu it opened belonged to Band
  // Pull-Aparts, the row above, and the dialog that appeared was that
  // exercise's. It looked like a failure of the feature and was a failure of
  // the selector. The row is the smallest ancestor that has a menu button
  // AND whose own text still starts with this exercise's name.
  let row = leaf
  for (let i = 0; i < 8 && row; i++) {
    const own = (row.innerText ?? '').trim()
    if (row.querySelector?.('[aria-haspopup="menu"]') && /^Pull-?Ups?/i.test(own)) break
    row = row.parentElement
  }
  if (!row || !row.querySelector?.('[aria-haspopup="menu"]')) return 'no row'
  const header = [...row.querySelectorAll('button')].find(b => /Pull-?Ups?/i.test(b.textContent ?? ''))
  ;(header ?? leaf).click()
  return 'expanded'
})()`)
await wait(900)
// RE-QUERY AFTER THE EXPANSION, never cache the node across it. Expanding
// re-renders the row, so a reference taken beforehand can be detached from
// the document — and a detached node still answers getBoundingClientRect
// with a plausible box, so the tap "succeeded" at coordinates belonging to
// nothing. That is why this reported an open menu with no items in it.
const menuOpened = await tapCentre(`(() => {
  const leaf = [...document.querySelectorAll('*')]
    .find(n => n.children.length === 0 && /^Pull-?Ups?$/i.test((n.textContent ?? '').trim()))
  if (!leaf) return null
  let row = leaf
  for (let i = 0; i < 8 && row; i++) {
    if (row.querySelector?.('[aria-haspopup="menu"]') && /^Pull-?Ups?/i.test((row.innerText ?? '').trim())) {
      return row.querySelector('[aria-haspopup="menu"]')
    }
    row = row.parentElement
  }
  return null
})()`)
await wait(800)
const clickedHistory = await tapCentre(`[...document.querySelectorAll('[role="menuitem"]')]
  .find(n => /^History$/i.test((n.textContent ?? '').trim()))`)
// The dialog lazy-loads its history from the (fake) database, so it opens
// empty and fills in. Polling rather than a fixed wait: a fixed one is a
// guess that passes on a fast machine and fails on a slow one.
// The History tab is what the menu opens. Poll on the DIALOG TITLE being
// this exercise — not on any of its section headings, which appear on every
// exercise's dialog and would have been satisfied by the wrong one.
for (let i = 0; i < 20; i++) {
  if (await ev(`/Pull-?Ups?/i.test(document.querySelector('[role="dialog"]')?.innerText ?? '')`)) break
  await wait(400)
}
const dialog = await ev(`document.querySelector('[role="dialog"]')?.innerText ?? ''`)
const sawDetail = /Pull-?Ups?/i.test(dialog)
if (!sawDetail) {
  // NOT REPORTED AS A PASS. "The driver could not reach the screen" and "the
  // screen is correct" must never print the same thing, so this fails.
  check('2. the exercise detail opens from the row menu',
    false, { opened, menuOpened, clickedHistory, text: (await ev('document.body.innerText')).slice(0, 300) })
  await shoot('bodyweight-progress-trend-unreachable')
} else {
  check('2a. the dialog is this exercise, not the row above it', /Pull-?Ups?/i.test(dialog), dialog.slice(0, 120))
  // THE HISTORY TAB. Before today this said "No PRs recorded yet" for every
  // bodyweight exercise, however many sessions were behind it.
  check('2b. the PR list is no longer empty for a bodyweight exercise',
    !/No PRs recorded yet/i.test(dialog), dialog.slice(0, 300))
  check('2c. ...and the best reads in reps', /14 reps/.test(dialog), dialog.slice(0, 300))
  check('2d. ...not as kilograms', !/\b14 ?kg\b/.test(dialog), dialog.slice(0, 300))
  await shoot('bodyweight-progress-history')

  // THE SUMMARY TAB holds the graph — the thing that was permanently empty.
  await tapCentre(`[...document.querySelectorAll('[role="tab"], button')]
    .find(n => /^Summary$/i.test((n.textContent ?? '').trim()))`)
  await wait(1200)
  const summary = await ev(`document.querySelector('[role="dialog"]')?.innerText ?? ''`)
  // CASE-INSENSITIVE ON PURPOSE. innerText returns text as CSS renders it,
  // and the label class uppercases: the caption reads "BEST SET, IN REPS" on
  // screen while the source says "Best set, in reps". A case-sensitive match
  // called the correct caption missing.
  check('2e. the trend is captioned in reps, not called a strength trend',
    /best set, in reps/i.test(summary) && !/strength trend/i.test(summary), summary.slice(0, 400))
  check('2f. ...and it is not still telling us to log it twice',
    !/Log this exercise twice/i.test(summary), summary.slice(0, 400))
  check('2g. ...and a line was actually drawn', await ev(`(() => {
    const p = document.querySelector('[role="dialog"] svg path[d]')
    return !!p && (p.getAttribute('d').match(/L/g) ?? []).length >= 1
  })()`))
  // A DOT PER SESSION, EACH ON THE LINE.
  //
  // WRITTEN BECAUSE I MISREAD THE SCREENSHOT. The middle point looked like
  // it was floating beside the line, and the coordinates settled it the
  // other way: (8,108), (150,60), (292,12) — evenly spaced and exactly
  // linear, which is what 8 -> 11 -> 14 reps should draw. There was no
  // defect. A screenshot is the right tool for "is this readable" and a
  // poor one for "is this number right"; the check stays because it is
  // cheap and it pins a real property.
  //
  // THE FIRST VERSION OF THIS READ ZERO POINTS, and not because the chart
  // was empty: `\d` inside a JS template literal collapses to `d`, so the
  // path regex became [ML] ([d.]+) and matched nothing. Escaped for the
  // template, not for the regex.
  const geometry = await ev(`(() => {
    // NOT the first svg in the dialog — that is the muscle map, which has no
    // path[d] and no circles, so the first version of this check read an
    // empty chart and reported zero marks. The chart is the svg that has
    // both a path and circles.
    const svg = [...document.querySelectorAll('[role="dialog"] svg')]
      .find(s => s.querySelector('path[d]') && s.querySelector('circle'))
    if (!svg) return { error: 'no chart svg', svgCount: document.querySelectorAll('[role="dialog"] svg').length }
    const d = svg.querySelector('path[d]')?.getAttribute('d') ?? ''
    const pts = [...d.matchAll(/[ML] ([\\d.]+) ([\\d.]+)/g)].map(m => [Number(m[1]), Number(m[2])])
    const dots = [...svg.querySelectorAll('circle')].map(c => [Number(c.getAttribute('cx')), Number(c.getAttribute('cy'))])
    const off = dots.filter(dt => !pts.some(pt => Math.abs(pt[0] - dt[0]) < 0.6 && Math.abs(pt[1] - dt[1]) < 0.6))
    return { pts, dots, off }
  })()`)
  check('2h. one mark per logged session', geometry.dots?.length === 3, geometry)
  // `off.length === 0` is TRUE of an empty list, so it passed while 2h was
  // reporting no marks at all. Requiring marks first is what stops this
  // being a tick over nothing.
  check('2i. ...and every mark sits on the line',
    geometry.dots?.length > 0 && geometry.off?.length === 0, geometry)
  check('2j. ...rising, because the reps rose 8 to 11 to 14',
    geometry.pts?.length === 3 && geometry.pts[0][1] > geometry.pts[1][1] && geometry.pts[1][1] > geometry.pts[2][1], geometry.pts)
  await shoot('bodyweight-progress-trend')
}

await finish()

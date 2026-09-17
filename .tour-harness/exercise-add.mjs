// ---------------------------------------------------------------------------
// PUTTING ONE EXERCISE INTO A SESSION — on the real screen.
//
// scripts/test-exercise-add.ts holds the rules: which pool the list comes
// from, what the peer's programming does, which weeks a scope reaches. This
// holds the half no source check can — that at phone width the entry point is
// findable at the foot of the list, that the ranked options carry their
// reasons, that HER RULING reaches a thumb (the card states the new length
// before the tap, and nothing is taken out to pay for it), and that the added
// exercise is really in the session afterwards, in tier order, still there
// after leaving the tab.
//
// THE ORDER IS READ FROM data-exercise-name, not from a screenshot — the same
// rule session-edit.mjs keeps, for the same reason: a row's name lives in a
// truncating span, so innerText would pass on a truncation.
//
// PORT 9414. 9411 and 9386 are session-edit's and swap-request's; each driver
// needs its own or two runs in the same sweep fight over one browser.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'
const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => { const p = q.url.split('?')[0]; const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p); if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return } r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' }); r.end(readFileSync(f)) })
await new Promise(r => server.listen(0, r)); const port = server.address().port
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9414', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms)); let t
for (let i = 0; i < 80; i++) { try { const l = await fetch('http://127.0.0.1:9414/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {} await wait(250) }
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

const rectOf = sel => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return null; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
const tap = async sel => { const r = await rectOf(sel); if (!r) return false; await wait(120); const r2 = await rectOf(sel); for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: r2.x, y: r2.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 }); return true }
const has = sel => ev(`!!document.querySelector(${JSON.stringify(sel)})`)
const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)})?.textContent ?? '').trim()`)
const order = () => ev(`[...document.querySelectorAll('[data-exercise-name]')].map(n => n.getAttribute('data-exercise-name'))`)
// POLLED, NEVER GUESSED AT WITH A FIXED WAIT — the confirm writes through a
// fake Supabase and re-reads, and a wait long enough on this machine is a
// flake on a slower one.
const until = async (fn, pred, tries = 25) => { let v = await fn(); for (let i = 0; i < tries && !pred(v); i++) { await wait(300); v = await fn() } return v }
// THE MATCHING HAPPENS IN NODE, NOT IN THE PAGE. The first version built the
// regex inside the evaluated string and the escaping ate it, so the header
// read as empty and three checks failed against the driver, not the app.
const headerMinutes = async () => {
  const texts = await ev(`[...document.querySelectorAll('button')].map(b => (b.textContent ?? '').trim())`)
  const header = (texts ?? []).find(t => /~\s*\d+\s*min/.test(t)) ?? ''
  const m = /~\s*(\d+)\s*min/.exec(header)
  return { note: await text('[data-testid="session-length-note"]'), header, mins: m ? Number(m[1]) : NaN }
}

console.log('\nADDING ONE EXERCISE — on the screen\n')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off#/tab/exercise` })
await wait(4500)

const start = await order()
check('0. today shows a real session', Array.isArray(start) && start.length >= 3, start)
const before = await headerMinutes()
check('0b. the header states a length', Number.isFinite(before.mins), before)

// --- the entry point ------------------------------------------------------
check('1a. "Add an exercise" is at the foot of the list', await has('[data-testid="add-exercise"]'))
// HER 6 SEP RULE, still holding: one entry point per dialog. The plan edit and
// the logging affordance are both there and are different buttons with
// different words, so neither can be mistaken for the other.
const feet = await ev(`[...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => t.startsWith('＋'))`)
check('1b. ...beside, and distinct from, "Add unplanned work"',
  feet.filter(t => /add an exercise/i.test(t)).length === 1 && feet.some(t => /unplanned/i.test(t)), feet)

// STACKED, NOT SIDE BY SIDE. Both are plain <button>s, which are inline, so
// the second one landed on the same line as the first and the screen read
// "＋ Add an exercise＋ Add unplanned work" — one run-on string with abutting
// tap targets, on a screen meant to be used one-handed in a gym. Every check
// was green; a screenshot found it. Compared by top edge rather than by any
// class name, so a different layout that still stacks them passes.
const footTops = await ev(`[...document.querySelectorAll('[data-testid="session-foot-actions"] button')].map(b => Math.round(b.getBoundingClientRect().top))`)
check('1c. ...on its own line, not run together with it',
  Array.isArray(footTops) && footTops.length === 2 && footTops[1] - footTops[0] >= 16, footTops)

check('2a. tapping it opens the sheet', (await tap('[data-testid="add-exercise"]')) && (await until(() => has('[data-testid="add-exercise-sheet"]'), v => v)))
await shoot('exercise-add-1-suggestions')

// --- the ranked list ------------------------------------------------------
const cands = await ev(`[...document.querySelectorAll('[data-add-candidate]')].map(n => n.getAttribute('data-add-candidate'))`)
check('2b. it offers something', Array.isArray(cands) && cands.length > 0, cands)
check('2c. nothing already in the session is offered',
  (cands ?? []).every(c => !start.includes(c)), (cands ?? []).filter(c => start.includes(c)))
const reasons = await ev(`[...document.querySelectorAll('[data-add-candidate]')].map(n => n.textContent.trim())`)
check('2d. every option says why it is there — chosen, not shuffled',
  (reasons ?? []).every(t => /least work|like the rest of this session/i.test(t)), (reasons ?? [])[0])
check('2e. the search box reaches the whole catalogue', await has('[data-testid="add-exercise-search"]'))

// --- her ruling, on the screen -------------------------------------------
const picked = cands[0]
check('3a. picking one moves to the confirm step', (await tap(`[data-add-candidate=${JSON.stringify(picked)}]`)) && (await until(() => has('[data-scope="today"]'), v => v)))
const lengthLine = await until(() => text('[data-testid="add-length"]'), v => v.length > 0)
check('3b. the card states the session\'s new length BEFORE the tap', /\d+ min/.test(lengthLine), lengthLine)
// ASHLEY, 13 Sep 2026: "you asked for the exercise, so you get the exercise."
// The card must promise that nothing is quietly removed to pay for it.
check('3c. ...and says nothing else is taken out to make room',
  /nothing else is taken out|still inside the session length/i.test(lengthLine), lengthLine)
check('3d. the scope words are the ones the other sheets use',
  (await text('[data-scope="today"]')).startsWith('Today only')
  && (await text('[data-scope="permanent"]')).startsWith('Rest of block'))
await shoot('exercise-add-2-confirm')

// The number on the card is the SAME estimator the header uses, so the two
// cannot disagree — the defect the shorten work found on 13 Sep, where a
// header said ~26 min beside a line claiming 20.
const cardMins = Number((/(\d+) min/.exec(lengthLine) ?? [])[1] ?? NaN)
check('3e. that number is above the length showing before the add',
  Number.isFinite(cardMins) && cardMins >= before.mins, { cardMins, was: before.mins })

// --- it actually lands ----------------------------------------------------
await tap('[data-scope="today"]')
const after = await until(order, o => Array.isArray(o) && o.includes(picked))
check('4a. the exercise is in the session afterwards', (after ?? []).includes(picked), after)
check('4b. ...and nothing else left it', (start ?? []).every(n => (after ?? []).includes(n)),
  (start ?? []).filter(n => !(after ?? []).includes(n)))
// TIER ORDER, NOT "NOT LAST". This used to assert the added exercise was not
// the last row, which is a proxy for the rule this driver's own header names —
// that it lands IN TIER ORDER. An exercise whose tier genuinely belongs at the
// end (a core or isolation lift) lands there correctly, and the proxy called
// that a defect: on 14 Sep the pick was Bird Dog and the check went red against
// an insertion that was right.
//
// Tier rank is not on screen — the row says "Accessory", not tier_3_isolation —
// and the added lift is not in the harness page's module-scope plan, so it is
// read off the LIVE mesocycle the page publishes after every edit.
const RANK = { tier_0_primer: 0, tier_1_primary: 1, tier_2_secondary: 2, tier_3_isolation: 3, tier_4_finisher: 4 }
const live = await until(() => ev(`window.__liveToday`), l => Array.isArray(l) && l.some(x => x.name === picked))
const at = (live ?? []).findIndex(x => x.name === picked)
const rankOf = x => (x.tier in RANK ? RANK[x.tier] : 3)
// Superset members are skipped: insertByTier deliberately nudges a slot PAST a
// labelled pair rather than landing between its halves, so a pair one tier
// heavier can legitimately sit above the new row.
const above = (live ?? []).slice(0, at).filter(x => !x.superset)
const below = (live ?? []).slice(at + 1).filter(x => !x.superset)
// BOTH DIRECTIONS, or the check cannot fail. "Nothing heavier above it" alone
// is satisfied by prepending; "nothing lighter below it" alone is satisfied by
// appending. Each mutation is caught by exactly one half.
check('4c. ...it landed in tier order, not just on the end',
  at >= 0
  && above.every(x => rankOf(x) <= rankOf(live[at]))
  && below.every(x => rankOf(x) >= rankOf(live[at])),
  { picked, at, order: (live ?? []).map(x => `${x.name}:${x.tier}`) })
const afterHeader = await until(headerMinutes, h => Number.isFinite(h.mins))
check('4d. the header now shows the longer session the card promised',
  afterHeader.mins === cardMins, { header: afterHeader.mins, card: cardMins })
await shoot('exercise-add-3-landed')

// --- and it survives leaving the tab --------------------------------------
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off#/tab/home` })
await wait(1500)
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off#/tab/exercise` })
await wait(3500)
const back = await until(order, o => Array.isArray(o) && o.length > 0)
check('5. it is still there after leaving the tab and coming back', (back ?? []).includes(picked), back)

console.log(failures === 0 ? '\nAll add checks passed.\n' : `\n${failures} add check(s) failed.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)

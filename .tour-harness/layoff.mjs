// ---------------------------------------------------------------------------
// COMING BACK AFTER A BREAK — ON THE REAL CARD (8 Oct 2026; layoff.ts).
//
// Ashley asked what happens when somebody stops training; the first session back was
// prescribed last time's weight plus an increment. scripts/test-layoff.ts holds the
// functions; what it cannot hold is that the card uses them — the headline, the per-set
// chips, the empty boxes, the "last time" marker and the note — and that the restart is
// OFFERED after a very long break and only happens on the tap (her ruling B).
//
// THE FIXTURE (?away=N, real.tsx): the last working session N days ago, on a loaded lift
// of today, every set at the top of the range, so without the break the card would add an
// increment. The restart runs buildRestartedPlan, the function App calls; this page does
// not save to a plan table (App does), so what is proven here is the offer and the card,
// not the save.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('./dist/', import.meta.url).pathname
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((req, res) => {
  const p = req.url.split('?')[0]
  const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p)
  if (!existsSync(f)) { res.writeHead(404); res.end('nf'); return }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream' })
  res.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r))
const port = server.address().port

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9499', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9499/json/list').then(r => r.json())
    const g = l.find(x => x.type === 'page')
    if (g) { target = g.webSocketDebuggerUrl; break }
  } catch {}
  await wait(250)
}
const ws = new WebSocket(target); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pending = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value
const shoot = async name => {
  const s = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname, Buffer.from(s.result.data, 'base64'))
}

let failures = 0
let ran = 0
const check = (name, ok, detail) => {
  ran++
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ''}`) }
}

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })


// A NEW ADDRESS FOR EVERY LOAD (CLAUDE.md: navigating to the open address reloads nothing).
let loads = 0
const open = async (query, tab = 'exercise') => {
  loads++
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&${query}&n=${loads}#/tab/${tab}` })
  await wait(2500); await ev(`location.hash = '#/tab/${tab}'`); await wait(3000)
}

/** Every number one lift's card shows: its headline weight, its per-set chips, what its empty boxes offer, its note, and whether a "last time" marker is claiming the boxes. Scoped to its own card. */
const readLift = name => ev(`(() => {
  const NAME = ${JSON.stringify(name)}
  const leaf = [...document.querySelectorAll('*')].find(x => x.children.length === 0 && x.textContent.trim() === NAME)
  if (!leaf) return { found: false }
  let card = leaf
  for (let i = 0; i < 12 && card.parentElement; i++) { card = card.parentElement; if (card.querySelector('input') && /kg/i.test(card.innerText)) break }
  const text = card.innerText
  const headline = [...card.querySelectorAll('.ds-num-lg')].map(n => parseFloat((n.textContent || '').replace(/[^\\d.]/g, ''))).filter(n => Number.isFinite(n) && n > 0)
  const chips = [...card.querySelectorAll('span')].map(n => (n.textContent || '').trim()).map(s => /^S(\\d+):\\s*([\\d.]+)kg$/.exec(s)).filter(Boolean).map(m => parseFloat(m[2]))
  const prefills = [...card.querySelectorAll('input')].filter(i => /^setgrid-weight-/.test(i.id)).map(i => parseFloat(String(i.value || i.placeholder).replace(/[^\\d.]/g, ''))).filter(n => Number.isFinite(n) && n > 0)
  return { found: true, headline, chips, prefills, lastTime: /last time/i.test(text), text: text.replace(/\\s+/g, ' ').slice(0, 500) }
})()`)
const openLift = name => ev(`(()=>{const n=[...document.querySelectorAll('*')].find(x=>x.children.length===0&&x.textContent.trim()===${JSON.stringify(name)});
 if(!n) return false; let p=n; for(let i=0;i<6&&p.parentElement;i++){p=p.parentElement; if(p.tagName==='BUTTON'||p.getAttribute('role')==='button'){p.click();return true}} return false})()`)
const text = sel => ev(`(document.querySelector('${sel}') || {}).innerText ?? null`)
const has = sel => ev(`!!document.querySelector('${sel}')`)
const headerText = () => ev(`document.body.innerText.slice(0, 400)`)
const shootLift = async (name, file) => {
  await ev(`(()=>{const n=[...document.querySelectorAll('*')].find(x=>x.children.length===0&&x.textContent.trim()===${JSON.stringify(name)}); if(n) n.scrollIntoView({block:'center'})})()`)
  await wait(500); await shoot(file)
}

console.log('\nCOMING BACK AFTER A BREAK, on the real card\n')

// --- A. 30 days away: eased to about 90% -----------------------------------
console.log('A. Thirty days away')
await open('away=30')
const t30 = await ev('window.__awayTarget ?? null')
check('0. the fixture logged a session 30 days ago on a loaded lift of today, every set at the top of the range', !!t30 && t30.days === 30 && t30.lastKg > 0, t30)
const line30 = await text('[data-testid="layoff-line"]')
check('1. the card says it: back after about 4 weeks, eased to about 90%', /Back after 4 weeks/.test(line30 ?? '') && /90%/.test(line30 ?? ''), line30)
check('2. no restart offer after 30 days', !(await has('[data-testid="layoff-restart-offer"]')))
await openLift(t30?.name ?? '@@'); await wait(1500)
const l30 = await readLift(t30?.name ?? '@@')
const last = t30?.lastKg ?? 0
const inBand = kg => kg < last && kg >= last * 0.9 - 2.5
check('3. the logged lift\'s headline is eased below last time, not last time plus an increment', l30.found && l30.headline.length > 0 && l30.headline.every(inBand), { headline: l30.headline, last })
check('4. every per-set chip is at or below the eased top set (the ramp follows)', l30.chips.every(kg => kg <= Math.max(...l30.headline, 0)), { chips: l30.chips, headline: l30.headline })
check('5. the empty boxes offer the eased weight, not last time\'s', l30.prefills.length > 0 && l30.prefills.every(kg => kg < last), { prefills: l30.prefills, last })
check('6. no "last time" marker claims the boxes while they are eased', l30.lastTime === false, l30.text)
check('7. the row note names both weights', /Eased to [\d.]+kg from [\d.]+kg after your break/.test(l30.text), l30.text)
check('7b. the label over the weight says it was eased, never "from your last session" (it is less than that)', /eased after your break/i.test(l30.text) && !/from your last session/i.test(l30.text), l30.text)
await shootLift(t30?.name ?? '@@', 'layoff-30-days')
// A lift with no history on the same card: its printed number is eased too.
const other = t30?.others?.[0] ?? null
check('8. the fixture has a second loaded lift with no history', !!other, t30?.others)
if (other) { await openLift(other.name); await wait(1500) }
const o30 = other ? await readLift(other.name) : { found: false, headline: [] }
check('9. a lift with no history shows less than the plan printed (the calendar ramp kept climbing)', o30.found && o30.headline.length > 0 && o30.headline.every(kg => kg < (other?.planKg ?? 0)), { headline: o30.headline, plan: other?.planKg })

// --- B. 12 days away: held, no increment ------------------------------------
console.log('\nB. Twelve days away')
await open('away=12')
const t12 = await ev('window.__awayTarget ?? null')
const line12 = await text('[data-testid="layoff-line"]')
check('10. the card says it repeats last time, with no increase', /Back after 12 days/.test(line12 ?? '') && /repeats last time/.test(line12 ?? ''), line12)
await openLift(t12?.name ?? '@@'); await wait(1500)
const l12 = await readLift(t12?.name ?? '@@')
check('11. the headline is exactly last time\'s weight: the earned increment is held back', l12.found && l12.headline.length > 0 && l12.headline.every(kg => kg === t12?.lastKg), { headline: l12.headline, last: t12?.lastKg })
check('12. ...and the note says held after the break', /Held at [\d.]+kg after your break/.test(l12.text), l12.text)

// --- C. 5 days away: nothing changes, the increment is earned ---------------
console.log('\nC. Five days away (no break)')
await open('away=5')
const t5 = await ev('window.__awayTarget ?? null')
check('13. no break line after five days', !(await has('[data-testid="layoff-line"]')))
await openLift(t5?.name ?? '@@'); await wait(1500)
const l5 = await readLift(t5?.name ?? '@@')
check('14. the increment the session earned is there (the break, not something else, removed it above)', l5.found && l5.headline.length > 0 && l5.headline.every(kg => kg > (t5?.lastKg ?? Infinity)), { headline: l5.headline, last: t5?.lastKg })

// --- D. 95 days away: eased and the restart OFFERED -------------------------
console.log('\nD. Ninety-five days away')
await open('away=95')
const line95 = await text('[data-testid="layoff-line"]')
check('15. the card says 80%', /80%/.test(line95 ?? ''), line95)
const offer = await text('[data-testid="layoff-restart-offer"]')
check('16. the restart is offered, naming week 1 and a calibration week', /week 1/.test(offer ?? '') && /calibration week/.test(offer ?? ''), offer)
const before = await headerText()
check('17. nothing restarted on its own: the header is not week 1', !/Wk 1\//.test(before), before.slice(0, 120))
await ev(`document.querySelector('[data-testid="layoff-line"]').scrollIntoView({block:'center'})`); await wait(400)
await shoot('layoff-95-offer')
await ev(`document.querySelector('[data-testid="layoff-restart-no"]').click()`); await wait(800)
check('18. "Not now" puts it away', !(await has('[data-testid="layoff-restart-offer"]')))
check('19. ...and the eased line stays', !!(await text('[data-testid="layoff-line"]')))
await open('away=95')
check('20. ...and it stays away for this break on a fresh load', !(await has('[data-testid="layoff-restart-offer"]')))

// A different break (another date) offers again, and the yes restarts the plan.
await open('away=100')
check('21. a different break offers again', await has('[data-testid="layoff-restart-offer"]'))
await ev(`document.querySelector('[data-testid="layoff-restart-yes"]').click()`); await wait(4000)
const after = await headerText()
check('22. one tap: the plan is at week 1, a calibration week', /Wk 1\//.test(after) && /Calibration/i.test(after), after.slice(0, 160))
check('23. ...the offer is gone, and does not come straight back for the same break', !(await has('[data-testid="layoff-restart-offer"]')))
check('24. ...and today is still eased (the first session back is still the first session back)', /80%/.test((await text('[data-testid="layoff-line"]')) ?? ''))
await ev(`window.scrollTo(0,0)`); await wait(300)
await shoot('layoff-restarted')

const err = await ev('window.__err ?? null')
check('no uncaught error on the page', err === null, err)

console.log(`\n${ran} checks ran`)
console.log(failures === 0 ? '\nA break eases the first session back and the restart is offered, never forced.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)

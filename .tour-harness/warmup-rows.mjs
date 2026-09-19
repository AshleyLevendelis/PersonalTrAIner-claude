// ---------------------------------------------------------------------------
// A BOX FOR EVERY SET — read off a real screen.
//
// Ashley, from her gym floor, 17 Sep 2026: "Only the ramp up sets input
// fields were visible until I clicked add set then I saw the input fields
// for the working sets." Her ruling that day, from three options: a box for
// every set, labelled — Warm-up 1,2,3 then Set 1,2,3, the build-up marked so
// it never counts toward the weight going up.
//
// WHY THIS FILE EXISTS, said plainly, because the source gate beside it is
// thorough and could not do this. test:ramp-visibility reads SOURCE. Deleting
// the build-up rows from the row list leaves every one of its checks green
// while the rows vanish from the screen — measured, by doing exactly that
// (mutation M2, 17 Sep). Only a browser can see a row that is not there.
//
// It also holds the half of the ruling that is a LAYOUT claim rather than a
// data one: the two blocks are one grid, so the weight column reads as a
// single build down the card. A source check cannot see a column.
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
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9477', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try { const l = await fetch('http://127.0.0.1:9477/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { target = g.webSocketDebuggerUrl; break } } catch {}
  await wait(250)
}
const ws = new WebSocket(target); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
const pageErrors = []
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data)
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
  if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params?.exceptionDetails?.text)
})
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value
const shoot = async name => writeFileSync(`/home/user/PersonalTrAIner-claude/.tour-harness/${name}.png`,
  Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'))

let failures = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 320)}` : ''}`) }
}
// ONE EXIT. A gate that can print FAIL and exit 0 is worse than no gate,
// because the tick becomes evidence — 16 Sep 2026, twice in one week.
const finish = async () => {
  console.log(failures === 0 ? '\nAll warm-up row screen checks passed.\n' : `\n${failures} check(s) FAILED.\n`)
  ws.close(); chrome.kill(); server.close()
  process.exit(failures === 0 ? 0 : 1)
}

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

// Read one expanded card's rows, boxes and geometry in a single pass, so
// every number below describes the SAME render.
const readCard = async name => ev(`(() => {
  const card = [...document.querySelectorAll('[data-exercise-name]')]
    .find(x => x.getAttribute('data-exercise-name') === ${JSON.stringify(name)})
  if (!card) return { missing: true }
  const box = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }
  const readRow = row => {
    const inputs = [...row.querySelectorAll('input')]
    const label = row.querySelector('span')?.textContent?.trim() ?? null
    // THE SPOKEN NAME, not just the printed one. The two are allowed to
    // differ — the printed label got shorter on 19 Sep and the spoken one did
    // not — but nothing here was reading it, so the visible label could change
    // and no driver would have asked what a screen reader now hears.
    const spoken = [...row.querySelectorAll('button')]
      .map(b => b.getAttribute('aria-label') || '')
      .find(a => /set|warm/i.test(a)) ?? null
    return {
      label,
      spoken,
      inputs: inputs.length,
      weight: inputs[0] ? { placeholder: inputs[0].placeholder, value: inputs[0].value, disabled: inputs[0].disabled, ...box(inputs[0]) } : null,
      reps: inputs[1] ? { placeholder: inputs[1].placeholder, ...box(inputs[1]) } : null,
      top: Math.round(row.getBoundingClientRect().y),
    }
  }
  const all = [...card.querySelectorAll('[data-testid="warmup-row"],[data-testid="working-row"]')]
  return {
    order: all.map(r => r.getAttribute('data-testid')),
    warm: [...card.querySelectorAll('[data-testid="warmup-row"]')].map(readRow),
    work: [...card.querySelectorAll('[data-testid="working-row"]')].map(readRow),
    warmCaption: card.querySelector('[data-testid="warmup-caption"]')?.textContent?.trim() ?? null,
    workCaption: card.querySelector('[data-testid="working-caption"]')?.textContent?.trim() ?? null,
    addWarmup: !!card.querySelector('[data-testid="add-warmup-set"]'),
    head: (card.innerText || '').split('\\n').slice(0, 3).join(' | '),
  }
})()`)

// The card opens on a real pointer event at the centre of its own header. A
// synthetic .click() reached the wrong element on the accordion once before.
const openCard = async name => {
  const at = await ev(`(() => {
    const card = [...document.querySelectorAll('[data-exercise-name]')]
      .find(x => x.getAttribute('data-exercise-name') === ${JSON.stringify(name)})
    if (!card) return null
    const head = card.querySelector('button,[role="button"]') || card
    head.scrollIntoView({ block: 'center' })
    const r = head.getBoundingClientRect()
    return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null
  })()`)
  if (!at) return false
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 })
  }
  await wait(1200)
  return true
}

console.log('\nA BOX FOR EVERY SET\n')

await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&legcurl=1#/tab/exercise` })
await wait(5000)

// A DRIVER THAT CANNOT FIND ITS SUBJECT SAYS SO. Reporting PASSED over a
// screen that never rendered is the failure mode verify:rls exists to shame.
const LOADED = 'Barbell Squats'
const BODYWEIGHT = 'Cossack Squat (Bodyweight)'
const present = await ev(`[...document.querySelectorAll('[data-exercise-name]')].map(r => r.getAttribute('data-exercise-name'))`)
check('the fixture still carries a loaded lift to read', (present ?? []).includes(LOADED), present)
check('...and a bodyweight one beside it', (present ?? []).includes(BODYWEIGHT), present)
if (!(present ?? []).includes(LOADED) || !(present ?? []).includes(BODYWEIGHT)) await finish()

// ---- 1. The build-up rows are THERE, with no interaction -----------------
console.log('\n  1. THE BUILD-UP, ON A LOADED LIFT')
await openCard(LOADED)
const loaded = await readCard(LOADED)
check('the build-up rows render — three or more, unprompted', (loaded.warm?.length ?? 0) >= 3, { rows: loaded.warm?.length, head: loaded.head })
check('each build-up row carries its own weight box, visibly sized',
  (loaded.warm ?? []).length > 0 && loaded.warm.every(r => r.weight && r.weight.w > 40 && r.weight.h >= 40),
  loaded.warm?.map(r => r.weight))
check('...and its own reps box beside it',
  (loaded.warm ?? []).length > 0 && loaded.warm.every(r => r.reps && r.reps.w > 20),
  loaded.warm?.map(r => r.reps))
// R, NOT W, SINCE 19 Sep 2026 — Ashley's design handoff. The printed label
// shortened because the new group header ("RAMP UP · not counted") took over
// the job the longer word was doing. This check was pinned to the old letter
// and went red on correct code, which is the expected cost of a deliberate
// rename rather than a defect.
check('every build-up row is labelled R and its number, in order',
  (loaded.warm ?? []).every((r, i) => r.label === `R${i + 1}`),
  loaded.warm?.map(r => r.label))
// AND THE HALF THAT MUST NOT SHORTEN WITH IT. The standing rule — two rows
// must not share one spoken name — was written after a tick button said "Save
// set 2" on both a warm-up and a working row. A printed "R2" beside a spoken
// "Set 2" would re-create it in a way no screenshot would show.
check('...and a screen reader still hears which kind of row it is',
  (loaded.warm ?? []).length > 0 && loaded.warm.every(r => /warm.?up/i.test(r.spoken ?? '')),
  loaded.warm?.map(r => r.spoken))
check('...while a working row says something different',
  (loaded.work ?? []).length > 0 && loaded.work.every(r => r.spoken && !/warm.?up/i.test(r.spoken)),
  loaded.work?.map(r => r.spoken))
check('...so no build-up row and working row share a spoken name',
  new Set([...(loaded.warm ?? []), ...(loaded.work ?? [])].map(r => r.spoken)).size
    === (loaded.warm?.length ?? 0) + (loaded.work?.length ?? 0),
  { warm: loaded.warm?.map(r => r.spoken), work: loaded.work?.map(r => r.spoken) })
check('the caption says it does not count toward the weight going up',
  /warm-up/i.test(loaded.warmCaption ?? '') && /doesn.t count/i.test(loaded.warmCaption ?? '') && /going up/i.test(loaded.warmCaption ?? ''),
  loaded.warmCaption)

// ---- 2. The working sets, without pressing anything ----------------------
console.log('\n  2. THE WORKING SETS — HER ACTUAL REPORT')
check('the working rows render without anyone pressing Add Set', (loaded.work?.length ?? 0) >= 3, { rows: loaded.work?.length })
check('each working row carries its own weight box, visibly sized',
  (loaded.work ?? []).length > 0 && loaded.work.every(r => r.weight && r.weight.w > 40 && r.weight.h >= 40),
  loaded.work?.map(r => r.weight))
check('working rows are numbered plainly — 1, 2, 3, with no W',
  (loaded.work ?? []).every((r, i) => r.label === String(i + 1)),
  loaded.work?.map(r => r.label))
check('the second block is captioned as the working sets', /working sets/i.test(loaded.workCaption ?? ''), loaded.workCaption)

// ---- 3. One build, down one column ---------------------------------------
console.log('\n  3. ONE BUILD, DOWN ONE COLUMN')
check('every build-up row sits above every working row',
  (loaded.order ?? []).join(',') === [...(loaded.warm ?? []).map(() => 'warmup-row'), ...(loaded.work ?? []).map(() => 'working-row')].join(','),
  loaded.order)
const lefts = [...(loaded.warm ?? []), ...(loaded.work ?? [])].map(r => r.weight?.x)
check('the weight boxes share one left edge, so the column reads as one build',
  lefts.length > 3 && lefts.every(x => typeof x === 'number' && Math.abs(x - lefts[0]) <= 1),
  lefts)
const warmKg = (loaded.warm ?? []).map(r => parseFloat(r.weight?.placeholder ?? ''))
const workKg = (loaded.work ?? []).map(r => parseFloat(r.weight?.placeholder ?? ''))
check('the build-up boxes carry the prescribed numbers, not blanks',
  warmKg.length > 0 && warmKg.every(n => Number.isFinite(n) && n > 0), (loaded.warm ?? []).map(r => r.weight?.placeholder))
check('...and they climb, every step lighter than the working weight',
  warmKg.every((n, i) => i === 0 || n > warmKg[i - 1]) && Number.isFinite(workKg[0]) && warmKg[warmKg.length - 1] < workKg[0],
  { warmKg, workKg })

// ---- 4. Adding a step ----------------------------------------------------
console.log('\n  4. ADDING A STEP TO THE BUILD-UP')
check('"Add warm-up" is offered on a loaded lift', loaded.addWarmup === true)
await shoot('warmup-rows')
const tapped = await ev(`(() => {
  const card = [...document.querySelectorAll('[data-exercise-name]')].find(x => x.getAttribute('data-exercise-name') === ${JSON.stringify(LOADED)})
  const b = card?.querySelector('[data-testid="add-warmup-set"]'); if (!b) return null
  b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect()
  return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null
})()`)
if (tapped) {
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x: tapped.x, y: tapped.y, button: 'left', clickCount: 1 })
  }
  await wait(900)
}
const after = await readCard(LOADED)
check('one more build-up row appears', (after.warm?.length ?? 0) === (loaded.warm?.length ?? 0) + 1,
  { before: loaded.warm?.length, after: after.warm?.length })
check('...and the working sets are untouched — a build-up step is not a set',
  (after.work?.length ?? 0) === (loaded.work?.length ?? 0), { before: loaded.work?.length, after: after.work?.length })
check('the new row is labelled as the next build-up step',
  after.warm?.[after.warm.length - 1]?.label === `R${after.warm.length}`, after.warm?.map(r => r.label))

// A CONTROL THAT WRITES AND DOES NOT REDRAW IS A DEAD CONTROL. Found here on
// 17 Sep 2026 and it was never about warm-ups: "Add Set" behaved the same
// way, and had since it was written. The row went into the stored record
// correctly and no pixel moved until something unrelated re-rendered the
// card — one keystroke in a weight box brought in both missing rows at once.
// Invisible from the source, invisible from the data, obvious in a browser.
const addSet = await ev(`(() => {
  const card = [...document.querySelectorAll('[data-exercise-name]')].find(x => x.getAttribute('data-exercise-name') === ${JSON.stringify(LOADED)})
  const b = [...(card?.querySelectorAll('button') ?? [])].find(x => /add set/i.test(x.textContent || '')); if (!b) return null
  b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect()
  return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null
})()`)
check('"Add Set" is on the card to press', !!addSet)
if (addSet) {
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x: addSet.x, y: addSet.y, button: 'left', clickCount: 1 })
  }
  await wait(900)
}
const afterSet = await readCard(LOADED)
check('...and a working row appears the moment it is pressed, with no other interaction',
  (afterSet.work?.length ?? 0) === (after.work?.length ?? 0) + 1,
  { before: after.work?.length, after: afterSet.work?.length })
check('...leaving the build-up alone', (afterSet.warm?.length ?? 0) === (after.warm?.length ?? 0),
  { before: after.warm?.length, after: afterSet.warm?.length })

// ---- 5. Not offered where there is nothing to build up to -----------------
console.log('\n  5. NOT OFFERED WHERE THERE IS NO WEIGHT')
await openCard(BODYWEIGHT)
const bw = await readCard(BODYWEIGHT)
check('a bodyweight lift shows no build-up rows', (bw.warm?.length ?? 0) === 0, bw.warm?.map(r => r.label))
check('...and is not offered one', bw.addWarmup === false)
check('...and still shows every working set with its own box',
  (bw.work?.length ?? 0) >= 3 && bw.work.every(r => r.weight && r.weight.h >= 40),
  { rows: bw.work?.length })
check('nothing on the page threw', pageErrors.length === 0, pageErrors)

await finish()

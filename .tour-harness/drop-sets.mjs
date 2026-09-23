// ---------------------------------------------------------------------------
// A DROP IS A CONTINUATION OF THE SET ABOVE IT — read off a real screen.
//
// Ashley's handoff, 19 Sep 2026: drop sets are continuation rows (3·1, 3·2)
// that roll into the parent set's volume, offered as a single "add a drop"
// link under the last logged set. Her ruling the same day, from three options:
// a drop gets a PROPER MARKER in the data, over reusing ordinary set numbers —
// because that option would have made "3 working sets" read as 5 everywhere
// outside this screen.
//
// SO THE LOAD-BEARING CHECK HERE IS THE ONE THAT COUNTS THE WORKING ROWS
// AFTER A DROP IS ADDED AND AGAIN AFTER IT IS SAVED. test:drop-sets proves the
// model keeps them apart and the store cannot overwrite a parent; only a
// browser can prove the SCREEN does not quietly grow a fourth set.
//
// And the second thing no source check can see: the link is offered under the
// LAST LOGGED set and nowhere else. That is a claim about which row a control
// sits under, which is geometry.
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
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9481', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try { const l = await fetch('http://127.0.0.1:9481/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { target = g.webSocketDebuggerUrl; break } } catch {}
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
let ran = 0
const check = (name, ok, detail) => {
  ran++
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 320)}` : ''}`) }
}
// ONE EXIT, and the check count printed beside the failures — a run that
// executed fewer checks than usual is a crash, not a pass.
const finish = async () => {
  console.log(`\n${ran} checks ran. ${failures === 0 ? 'All drop-set screen checks passed.' : `${failures} check(s) FAILED.`}\n`)
  ws.close(); chrome.kill(); server.close()
  process.exit(failures === 0 ? 0 : 1)
}

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

const LOADED = 'Barbell Squats'

// One pass over the card, so every number below describes the SAME render.
// EVERY FIELD IS NULL-SAFE AND ALWAYS PRESENT: a missing card returns the same
// shape with empty lists, so the checks below all still RUN and fail, rather
// than vanishing and printing a short green run.
const readCard = async name => ev(`(() => {
  const card = [...document.querySelectorAll('[data-exercise-name]')]
    .find(x => x.getAttribute('data-exercise-name') === ${JSON.stringify(name)})
  const empty = { found: false, work: [], drops: [], order: [], dropCaption: null, addDrop: null, receipts: [], text: '' }
  if (!card) return empty
  const box = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }
  const readRow = row => {
    const inputs = [...row.querySelectorAll('input')]
    const spoken = [...row.querySelectorAll('button')]
      .map(b => b.getAttribute('aria-label') || '')
      .find(a => /set|warm|drop/i.test(a)) ?? null
    return {
      label: [...row.querySelectorAll('span')].find(sp => !sp.hasAttribute('aria-hidden'))?.textContent?.trim() ?? null,
      spoken,
      weight: inputs[0] ? { placeholder: inputs[0].placeholder, value: inputs[0].value, ...box(inputs[0]) } : null,
      reps: inputs[1] ? { placeholder: inputs[1].placeholder, value: inputs[1].value, ...box(inputs[1]) } : null,
      top: Math.round(row.getBoundingClientRect().y),
    }
  }
  const link = card.querySelector('[data-testid="add-drop"]')
  return {
    found: true,
    order: [...card.querySelectorAll('[data-testid="warmup-row"],[data-testid="working-row"],[data-testid="drop-row"]')]
      .map(r => r.getAttribute('data-testid')),
    work: [...card.querySelectorAll('[data-testid="working-row"]')].map(readRow),
    drops: [...card.querySelectorAll('[data-testid="drop-row"]')].map(readRow),
    dropCaption: card.querySelector('[data-testid="drop-caption"]')?.textContent?.trim() ?? null,
    addDrop: link ? { text: link.textContent.trim(), spoken: link.getAttribute('aria-label'), ...box(link) } : null,
    receipts: [...card.querySelectorAll('p')].map(p => p.textContent.trim()).filter(t => /✓$/.test(t)),
    // WHAT THE CARD SAYS THE COUNT IS, which is a different question from how
    // many rows are drawn — and it is the one her ruling turns on. A drop
    // slipping into the working set list leaves the row count alone and makes
    // this read 2/3 when one set and one drop have been logged.
    workingCounter: card.querySelector('[data-testid="working-counter"]')?.textContent?.trim() ?? null,
    text: (card.innerText || ''),
  }
})()`)

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

// A real pointer event at the element's centre. `element.click()` reached the
// wrong node on this accordion once and opened-and-shut a row within one tick.
const tap = async selector => {
  const at = await ev(`(() => {
    const card = [...document.querySelectorAll('[data-exercise-name]')].find(x => x.getAttribute('data-exercise-name') === ${JSON.stringify(LOADED)})
    const b = card?.querySelector(${JSON.stringify(selector)}); if (!b) return null
    b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect()
    return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null
  })()`)
  if (!at) return false
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 })
  }
  await wait(900)
  return true
}

/** Types into a row's reps box the way a thumb does, so React's onChange runs. */
const typeReps = async (rowSelector, value) => {
  const at = await ev(`(() => {
    const card = [...document.querySelectorAll('[data-exercise-name]')].find(x => x.getAttribute('data-exercise-name') === ${JSON.stringify(LOADED)})
    const row = card?.querySelector(${JSON.stringify(rowSelector)}); if (!row) return null
    const input = [...row.querySelectorAll('input')][1]; if (!input) return null
    input.scrollIntoView({ block: 'center' }); const r = input.getBoundingClientRect()
    return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null
  })()`)
  if (!at) return false
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 })
  }
  for (const ch of String(value)) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch })
  }
  await wait(400)
  return true
}

console.log('\nA DROP HANGS OFF THE SET ABOVE IT\n')

// ?legcurl=1 — the push/pull/legs home-gym profile, which is where the
// generator actually puts Barbell Squats. Measured, not assumed: the default
// fixture's anchored today is an UPPER day whose heaviest row is a
// chest-supported row, so the first run of this driver could not find a squat
// at all. Same flag verify:warmup-rows uses, for the same reason.
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&legcurl=1#/tab/exercise` })
await wait(5000)

const present = await ev(`[...document.querySelectorAll('[data-exercise-name]')].map(r => r.getAttribute('data-exercise-name'))`)
check('the fixture carries a loaded lift to drop from', (present ?? []).includes(LOADED), present)
await openCard(LOADED)

// ---- 1. Nothing offered before anything is logged ------------------------
console.log('\n  1. NOTHING TO CONTINUE YET')
const fresh = await readCard(LOADED)
check('the card opened', fresh.found === true)
check('no drop row is drawn unasked — nothing in the plan prescribes one', fresh.found === true && (fresh.drops ?? []).length === 0, fresh.drops?.map(r => r.label))
check('...and no drop header with it', fresh.found === true && fresh.dropCaption === null, fresh.dropCaption)
check('"add a drop" is NOT offered under an unlogged set', fresh.found === true && fresh.addDrop === null, fresh.addDrop?.text)
const baselineWorking = (fresh.work ?? []).length
check('the working sets are on screen to count against', baselineWorking >= 3, { rows: baselineWorking })

// ---- 2. Log a working set, and the link appears under IT ------------------
console.log('\n  2. LOG A SET, AND THE OFFER APPEARS UNDER IT')
await typeReps('[data-testid="working-row"]', '8')
await tap('[data-testid="working-row"] button[aria-label^="Save set"]')
const logged = await readCard(LOADED)
check('the set saved — a receipt is on the card', (logged.receipts ?? []).some(t => /^Set 1:/.test(t)), logged.receipts)
check('"add a drop" is now offered', logged.addDrop !== null, logged.text?.slice(0, 200))
check('...once, not once per set', (await ev(`document.querySelectorAll('[data-testid="add-drop"]').length`)) === 1)
check('the card counts one working set done, not two', /\b1\s*\/\s*3\b/.test(logged.workingCounter ?? ''), logged.workingCounter)
// THE NUMBER ON THE CONTROL IS THE NUMBER IN THE BOX — the deviation from the
// handoff's "−25%" label, and the reason it was made: a percentage that snaps
// to a plate step names a weight the app will not actually offer.
check('...labelled with the kilos it will put in the box, not a percentage',
  /\d+(\.\d+)?kg/.test(logged.addDrop?.text ?? '') && !/%/.test(logged.addDrop?.text ?? ''), logged.addDrop?.text)
check('...and spoken as a drop after the set it follows',
  /drop/i.test(logged.addDrop?.spoken ?? '') && /set 1/i.test(logged.addDrop?.spoken ?? ''), logged.addDrop?.spoken)
const firstWorkTop = (logged.work ?? [])[0]?.top ?? -1
const secondWorkTop = (logged.work ?? [])[1]?.top ?? -1
check('...sitting under set 1 and above set 2, which is what "under the last logged set" means',
  logged.addDrop != null && logged.addDrop.y > firstWorkTop && logged.addDrop.y < secondWorkTop,
  { link: logged.addDrop?.y, set1: firstWorkTop, set2: secondWorkTop })
check('adding nothing yet has changed no set count',
  baselineWorking >= 3 && (logged.work ?? []).length === baselineWorking, { before: baselineWorking, after: logged.work?.length })

// A SECOND LOGGED SET, so "under the LAST logged set" has two candidates to
// choose wrong between. With one, a link rendered under every logged set is
// indistinguishable from one rendered under the right one — measured, by
// breaking it exactly that way.
const two = await ev(`(() => {
  const card = [...document.querySelectorAll('[data-exercise-name]')].find(x => x.getAttribute('data-exercise-name') === ${JSON.stringify(LOADED)})
  const rows = [...(card?.querySelectorAll('[data-testid="working-row"]') ?? [])]
  const input = rows[1] ? [...rows[1].querySelectorAll('input')][1] : null
  if (!input) return null
  input.scrollIntoView({ block: 'center' }); const r = input.getBoundingClientRect()
  return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null
})()`)
if (two) {
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x: two.x, y: two.y, button: 'left', clickCount: 1 })
  }
  for (const ch of '9') {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch })
  }
  await wait(400)
  await tap('button[aria-label="Save set 2"]')
}
const twoLogged = await readCard(LOADED)
check('with two sets logged, the offer is still ONE link',
  (await ev(`document.querySelectorAll('[data-testid="add-drop"]').length`)) === 1, twoLogged.receipts)
check('...and it has moved to the LAST of them, below set 2',
  twoLogged.addDrop != null && twoLogged.addDrop.y > ((twoLogged.work ?? [])[1]?.top ?? Infinity),
  { link: twoLogged.addDrop?.y, set2: twoLogged.work?.[1]?.top })
await shoot('drop-sets-offer')

// ---- 3. Tap it: a continuation row, not a fourth set ----------------------
console.log('\n  3. A CONTINUATION ROW, NOT A FOURTH SET')
// THE PARENT IS THE LAST LOGGED SET, WHICH IS NOW SET 2 — named once here
// rather than written into each assertion, so the checks below describe the
// row the app chose instead of agreeing with an assumption I made.
const parentSet = 2
const promised = parseFloat((twoLogged.addDrop?.text ?? '').replace(/[^\d.]/g, ''))
await tap('[data-testid="add-drop"]')
const withDrop = await readCard(LOADED)
check('a drop row appears', (withDrop.drops ?? []).length === 1, withDrop.drops?.map(r => r.label))
// THE WHOLE POINT OF THE COLUMN. Under the option Ashley rejected this number
// would now read 4, on this screen and on every other.
check('...and the working set count is UNCHANGED — "3 working sets" stays true',
  baselineWorking >= 3 && (withDrop.work ?? []).length === baselineWorking, { before: baselineWorking, after: withDrop.work?.length })
check('it is labelled as a continuation of the set it hangs off', (withDrop.drops ?? [])[0]?.label === `${parentSet}·1`, withDrop.drops?.map(r => r.label))
check('...and a screen reader hears which row it is, not "set 1" again',
  /drop/i.test((withDrop.drops ?? [])[0]?.spoken ?? ''), withDrop.drops?.map(r => r.spoken))
check('...so no two rows on the card share a spoken name',
  (withDrop.drops ?? []).length === 1
    && new Set([...(withDrop.work ?? []), ...(withDrop.drops ?? [])].map(r => r.spoken)).size
      === (withDrop.work?.length ?? 0) + (withDrop.drops?.length ?? 0),
  { work: withDrop.work?.map(r => r.spoken), drops: withDrop.drops?.map(r => r.spoken) })
check('it sits directly under its parent, before set 2',
  (withDrop.order ?? []).join(',').includes('working-row,drop-row,working-row'), withDrop.order)
check('the header says it carries no rest', /no rest/i.test(withDrop.dropCaption ?? ''), withDrop.dropCaption)
check('...and names it a drop', /drop/i.test(withDrop.dropCaption ?? ''), withDrop.dropCaption)
// THE PROMISE AND THE BOX ARE ONE NUMBER — the assertion verify:meal-food-edit
// already makes for food edits, here for a weight.
check('the weight the link promised is the weight in the box',
  Number.isFinite(promised) && parseFloat((withDrop.drops ?? [])[0]?.weight?.placeholder ?? '') === promised,
  { promised, box: withDrop.drops?.[0]?.weight?.placeholder })
const parentRow = (withDrop.work ?? [])[parentSet - 1]
const parentKg = parseFloat(parentRow?.weight?.value || parentRow?.weight?.placeholder || '0')
check('...and it is lighter than the set it continues',
  Number.isFinite(promised) && Number.isFinite(parentKg) && parentKg > 0 && promised < parentKg,
  { drop: promised, parent: parentKg })
// A REAL DROP, NOT ONE PLATE OFF. The 15%/35% band is written as literals
// rather than derived from the 0.75 constant in the source — a bound compared
// against the constant that drives it can only agree with itself. It is wide
// because the target is snapped to the implement's plate step, so the landed
// percentage is never exactly 25.
check('...by a real fraction of it, not a single plate',
  Number.isFinite(promised) && parentKg > 0 && (parentKg - promised) / parentKg >= 0.15 && (parentKg - promised) / parentKg <= 0.35,
  { drop: promised, parent: parentKg, off: parentKg > 0 ? Math.round((1 - promised / parentKg) * 100) : null })
check('the reps box is blank — nothing prescribed this, so nothing is suggested',
  (withDrop.drops ?? []).length === 1
    && ((withDrop.drops ?? [])[0]?.reps?.placeholder ?? '') === ''
    && ((withDrop.drops ?? [])[0]?.reps?.value ?? '') === '',
  withDrop.drops?.[0]?.reps)
check('the drop row is indented past its parent',
  ((withDrop.drops ?? [])[0]?.weight?.x ?? 0) > (parentRow?.weight?.x ?? 0),
  { drop: withDrop.drops?.[0]?.weight?.x, parent: parentRow?.weight?.x })
// HER 9 Sep RULING SURVIVES THE NEW ROW. She chose 44px boxes from three
// options having seen the before and after; a 40px continuation row would
// have quietly taken it back on the one row typed under fatigue.
check('...and its boxes are still thumb-sized',
  ((withDrop.drops ?? [])[0]?.weight?.h ?? 0) >= 44 && ((withDrop.drops ?? [])[0]?.reps?.h ?? 0) >= 44,
  { weight: withDrop.drops?.[0]?.weight?.h, reps: withDrop.drops?.[0]?.reps?.h })
await shoot('drop-sets-row')

// ---- 4. Save it ----------------------------------------------------------
console.log('\n  4. SAVING THE DROP')
await typeReps('[data-testid="drop-row"]', '6')
await tap('[data-testid="drop-row"] button[aria-label*="drop"]')
const saved = await readCard(LOADED)
check('the drop saved, with its own receipt naming it',
  (saved.receipts ?? []).some(t => new RegExp(`^Set ${parentSet}, drop 1:`).test(t)), saved.receipts)
// THE RECEIPT THE BUG WROTE OVER. Before the conflict-target fix the drop's
// numbers replaced its parent's here and the parent's line vanished, so this
// asserts the parent still reads back the reps and weight IT was logged with
// — not merely that some line mentioning it exists.
check('...and the parent set\'s receipt is still its own, untouched',
  (saved.receipts ?? []).some(t => new RegExp(`^Set ${parentSet}: 9 reps @ 47\\.5kg`).test(t)), saved.receipts)
check('...and so is the set before it',
  (saved.receipts ?? []).some(t => /^Set 1: 8 reps @ 47\.5kg/.test(t)), saved.receipts)
check('the working set count is STILL unchanged after the write',
  baselineWorking >= 3 && (saved.work ?? []).length === baselineWorking, { before: baselineWorking, after: saved.work?.length })
// THE LOAD-BEARING ONE. Two sets and a drop are logged; the card must say two.
check('...and the card still counts the drop as part of set 1, not as a set',
  /\b2\s*\/\s*3\b/.test(saved.workingCounter ?? ''), saved.workingCounter)
check('the drop row is still one row, not two', (saved.drops ?? []).length === 1, saved.drops?.map(r => r.label))
// A SECOND DROP STEPS DOWN AGAIN, off the drop above rather than the parent.
check('the offer moves on to continue the drop just logged',
  saved.addDrop !== null && /drop/i.test(saved.addDrop?.spoken ?? ''), saved.addDrop)
check('nothing on the page threw', pageErrors.length === 0, pageErrors)
await shoot('drop-sets-saved')

await finish()

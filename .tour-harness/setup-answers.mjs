// ---------------------------------------------------------------------------
// THE THREE WEIGHT CAPS, ON THE SCREEN SHE WOULD READ THEM ON.
//
// `scripts/test-setup-answers.ts` holds the rules: the re-price is idempotent,
// only goes where the fact reaches, never rewrites the past, and the receipt
// is checkable. This holds the half no source check can — that at 390x844 the
// three rows are actually THERE, legible, tappable, correctly absent for a
// full-gym profile, and that typing a corrected number produces the app's own
// receipt with numbers matching the plan.
//
// WHY IT MATTERS HERE PARTICULARLY. Four screen defects were found in this
// session's work; three were invisible to every source check and were caught
// by reading a screenshot — a row printing "cardio · cardio", a reason that
// called a push-up core work, and two buttons run together into one line.
//
// WHAT THIS CANNOT PROVE, so the result is not overread: App's own handler —
// the persistence, saving only the weeks that moved, reverting a failed save.
// profile.tsx reproduces that plumbing (its header says so), so a verdict here
// would be a verdict on the harness. `test:setup-answers` §8 holds those, by
// source.
//
// PORT 9443. Everything up to 9441 is taken across .tour-harness, .onb-harness
// and .tw-harness; two drivers already collide on 9357 and two more on 9391,
// which is survivable only because they never run at once.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'
const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => { const p = q.url.split('?')[0]; const f = join(DIST, p === '/' ? '/.tour-harness/profile.html' : p); if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return } r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' }); r.end(readFileSync(f)) })
await new Promise(r => server.listen(0, r)); const port = server.address().port
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9443', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms)); let t
for (let i = 0; i < 80; i++) { try { const l = await fetch('http://127.0.0.1:9443/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {} await wait(250) }
const ws = new WebSocket(t); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value
const shoot = async name => { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname, Buffer.from(s.result.data, 'base64')) }
await send('Page.enable'); await send('Runtime.enable')
// WITHOUT THIS THE COMMIT NEVER HAPPENS, AND THE SCREEN LOOKS FINE WHILE IT
// DOESN'T. A headless page is not "focused", so `el.focus()` moves
// document.activeElement but Chromium dispatches NO focus/blur events at all
// — measured: activeElement flipped correctly and a focusout listener
// attached to the very same element never fired. EditableTextField commits on
// blur (deliberately, not on change), React's onBlur is really a delegated
// focusout, so every typed correction was silently thrown away and the field
// re-rendered the old number. Six checks here failed on it, and the failure
// looked exactly like a broken app.
//
// Faking a `new FocusEvent('focusout')` would also have gone green, and would
// have proved only that React's delegation works. This makes the page really
// focused, so the events are the browser's own.
await send('Emulation.setFocusEmulationEnabled', { enabled: true })
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

let failures = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}
const has = sel => ev(`!!document.querySelector(${JSON.stringify(sel)})`)
const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)})?.textContent ?? '').trim()`)
const until = async (fn, pred, tries = 30) => { let v = await fn(); for (let i = 0; i < tries && !pred(v); i++) { await wait(250); v = await fn() } return v }
const rectOf = sel => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return null; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
const tap = async sel => { const r = await rectOf(sel); if (!r) return false; await wait(120); const r2 = await rectOf(sel); for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: r2.x, y: r2.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 }); return true }

// ProfileScreen is a Radix Dialog — readiness is the dialog slot appearing,
// polled, the way modal-close.mjs does it. A fixed wait long enough here is a
// flake on a slower machine.
const dialogReady = () => until(() => has('[data-slot="dialog-content"]'), v => v)

// The "You" group is COLLAPSED by default (Group's own useState(false)), so
// every row inside it is absent from the DOM until it is opened. A driver that
// asserted the rows were missing without opening it would pass on a build that
// had deleted them.
const openYouGroup = async () => {
  const opened = await ev(`(() => {
    const b = [...document.querySelectorAll('button[aria-expanded]')].find(x => /^You$/i.test((x.textContent || '').trim()))
    if (!b) return 'no-button'
    if (b.getAttribute('aria-expanded') !== 'true') b.click()
    return 'ok'
  })()`)
  await wait(400)
  return opened
}

// React controls these inputs, so setting .value directly is ignored — the
// prototype setter plus an input event is what swap-request.mjs uses to drive
// a controlled field. The COMMIT is onBlur (EditableTextField deliberately
// does not commit onChange), and that is the part this got wrong first time:
// a synthetic `new Event('blur')` reaches nothing, because React attaches one
// listener at the root and blur does not bubble — React's onBlur is really
// focusout. Focusing the field and calling the real .blur() fires the real
// focusout, so the app's own handler runs rather than a lookalike.
const typeInto = async (sel, value) => {
  return ev(`(() => {
    const n = document.querySelector(${JSON.stringify(sel)})
    if (!n) return false
    n.focus()
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(n, ${JSON.stringify(String(value))})
    n.dispatchEvent(new Event('input', { bubbles: true }))
    n.blur()
    return true
  })()`)
}

// THE THUMB QUESTION, ASKED THE WAY tap-targets.mjs ASKS IT — not "is the box
// 44px". Its header spells out why the rect is the wrong measurement: a
// bounding rect cannot see a pseudo-element hit-slop, and hit-slop-44 (which
// 68 controls in this app carry) expands the touch area without moving
// anything visually. Copied rather than imported because that driver is a
// standalone script; the PROPERTY is what is shared, and it is stated here in
// full so a change to it is visible in the diff.
//
// The bar: a control must own a 44px reach in every direction EXCEPT where
// ANOTHER interactive control owns that point — two controls 40px apart
// cannot both own 44px, and that is layout density, which is Ashley's call.
// Dead space blocking the reach is a real miss.
const REACH = `(el) => {
  const reach = 44 / 2 - 1
  el.scrollIntoView({ block: 'center', behavior: 'instant' })
  const b = el.getBoundingClientRect()
  const cx = b.left + b.width / 2, cy = b.top + b.height / 2
  const resolves = (dx, dy) => {
    const x = cx + dx, y = cy + dy
    if (x < 0 || x > window.innerWidth || y < 0 || y > window.innerHeight) return true
    const hit = document.elementFromPoint(x, y)
    return !!hit && (hit === el || el.contains(hit) || hit.contains(el))
  }
  const isOther = (dx, dy) => {
    const hit = document.elementFromPoint(cx + dx, cy + dy)
    const owner = hit && hit.closest ? hit.closest('button, a[href], [role="button"], input, select, textarea') : null
    return !!owner && owner !== el && !el.contains(owner)
  }
  const r = (dx, dy) => resolves(dx, dy) || isOther(dx, dy)
  return r(0, -reach) && r(0, reach) && r(-reach, 0) && r(reach, 0)
}`

const ceilingInputs = () => ev(`(() => {
  const reaches = ${REACH}
  const box = document.querySelector('[data-testid="stated-ceilings"]')
  if (!box) return null
  return [...box.querySelectorAll('input')].map(i => {
    const row = i.closest('div').parentElement
    const r = i.getBoundingClientRect()
    return { value: i.value, label: (row?.querySelector('span')?.textContent || '').trim(), h: Math.round(r.height), w: Math.round(r.width), reachable: reaches(i) }
  })
})()`)

console.log('\nCORRECTING A WEIGHT CAP — on the screen\n')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
await wait(3000)

check('0. the Profile screen mounts', await dialogReady())

// NOT ABOUT THE WEIGHT CAPS, and here anyway because this is the only driver
// that mounts Profile at all — ProfileScreen was in no harness until 13 Sep
// 2026, which is why a line every user reads went wrong unnoticed.
//
// The fixture trains FOUR of seven days. The header used to read the LENGTH
// of training_days, which assembleProfile guarantees is always seven entries
// with an `available` flag — so it said "7 days/week" for everybody. Pinned
// on the count matching the picker below it rather than on the literal "4",
// so changing the fixture cannot make this pass by accident.
const summary = await text('[data-slot="dialog-content"]')
const daysPicked = await ev(`[...document.querySelectorAll('[data-slot="toggle-group-item"]')].filter(b => b.getAttribute('data-state') === 'on').length`)
check('0a. the header counts the days she actually trains',
  daysPicked > 0 && daysPicked < 7 && summary.includes(`${daysPicked} days/week`),
  { daysPicked, saidInstead: (/(\d+) days\/week/.exec(summary) ?? [])[0] ?? 'nothing' })

check('0b. the "You" group opens', (await openYouGroup()) === 'ok')

// --- the rows exist and are legible ---------------------------------------
const rows = await until(ceilingInputs, v => Array.isArray(v) && v.length === 3)
check('1a. all three weight-cap rows are on the screen', Array.isArray(rows) && rows.length === 3, rows)
check('1b. each shows the number already stored', (rows ?? []).every(r => r.value !== ''), rows)
check('1c. each has a label, not a bare box', (rows ?? []).every(r => r.label.length > 3), (rows ?? []).map(r => r.label))
// THE TAP-TARGET BAR, on three controls new to a screen used one-handed in a
// gym. verify:tap-targets holds the rest of the app to a 44px thumb reach;
// these are not exempt because they are inputs — and an input is the one
// control that CANNOT be given an invisible hit-slop, because ::after does
// not render on a replaced element. So for these the reach really is the
// height, and this measured 28px on all three: the top field lost the tap
// above it to the Equipment row's dead space, the bottom one lost the tap
// below it. Two of three failed the probe outright.
check('1d. a thumb reaches every field', (rows ?? []).every(r => r.reachable), (rows ?? []).map(r => ({ h: r.h, reachable: r.reachable })))
check('1e. ...and wide enough for a three-digit number', (rows ?? []).every(r => r.w >= 56), (rows ?? []).map(r => r.w))
await shoot('setup-answers-1-rows')

// --- correcting one ---------------------------------------------------------
const before = JSON.parse(await text('[data-testid="plan-weights"]'))
check('2a. the fixture plan has real weights to move', before.length > 0, before.length)

// DOWNWARD, because that is the case every other patcher in the app refuses
// and the one that matters most: a person being prescribed more than their
// dumbbells go up to.
check('2b. a corrected cap can be typed', await typeInto('[data-testid="stated-ceilings"] input', 10))
const receipt = await until(() => text('[data-testid="reprice-receipt"]'), v => v.length > 0)
check('2c. correcting it produces a receipt', receipt.length > 0, receipt)
check('2d. ...that names a week, a lift and two weights',
  /From week \d+, .+: (up|down) from [\d.]+kg to [\d.]+kg/.test(receipt), receipt)

// THE RECEIPT AGAINST THE PLAN, read out of the page rather than recomputed —
// verify:exercise-add 4d's rule. A sentence that agrees only with itself is
// what let "shortened to 20 min" sit beside "~26 min" on 13 Sep.
const after = JSON.parse(await text('[data-testid="plan-weights"]'))
const m = /From week (\d+), (.+?): (?:up|down) from ([\d.]+)kg to ([\d.]+)kg/.exec(receipt)
check('2e. the receipt parses', !!m, receipt)
if (m) {
  const [, week, name, fromKg, toKg] = m
  // IN THE WEEK THE SENTENCE NAMES, not merely somewhere in sixteen weeks.
  // Ashley's ruling on 13 Sep was to name the week precisely because the old
  // wording said "this week" and quoted a week-7 number; a check that accepts
  // the weight anywhere in the plan would go green on exactly that.
  const nowInPlan = after.filter(e => e.n === name && e.w === Number(week)).map(e => e.kg)
  const wasInPlan = before.filter(e => e.n === name && e.w === Number(week)).map(e => e.kg)
  check('2f. the named week really holds the "to" weight', nowInPlan.includes(Number(toKg)), { week, name, toKg, nowInPlan: nowInPlan.slice(0, 6) })
  check('2g. ...and really held the "from" weight before', wasInPlan.includes(Number(fromKg)), { week, name, fromKg, wasInPlan: wasInPlan.slice(0, 6) })
}
check('2h. weights actually came down', after.some((e, i) => before[i] && e.kg < before[i].kg))
check('2i. ...and the plan still holds the same exercises',
  JSON.stringify(after.map(e => e.n)) === JSON.stringify(before.map(e => e.n)))

// --- it survives the dialog closing ----------------------------------------
await ev(`(() => { const b = document.querySelector('[data-slot="dialog-close"]'); if (b) b.click() })()`)
await wait(600)
// SHOT WITH THE DIALOG CLOSED, because the receipt renders on the page BEHIND
// it and a shot taken while Profile is open shows a covered sentence — which
// is a screenshot that cannot be read, and reading it is the point.
await shoot('setup-answers-2-receipt')
await tap('[data-testid="open-profile"]')
await dialogReady()
await openYouGroup()
const reopened = await until(ceilingInputs, v => Array.isArray(v) && v.length === 3)
check('3. the corrected number is still there after closing and reopening',
  (reopened ?? [])[0]?.value === '10', (reopened ?? []).map(r => r.value))

// --- RAISING one, which is the case no clamp can fake -----------------------
// WHY THIS SECTION EXISTS: a mutation found the hole. Forcing the re-price's
// ratio to a constant 1 — gutting the mechanism this whole module is built
// around — left every downward check green, here AND in test:setup-answers,
// because `prescribeLoad` clamps the forced weight to the corrected ceiling
// on the way out and the clamp alone brings weights down. The ratio is the
// only thing that can move a weight UP, because nothing clamps upward.
//
// It is also the case Ashley's ruling opens with: "your gym's heaviest
// dumbbell is 40kg not 30kg". Measured on this fixture, raising it moves 5
// weights and lowering it moves 91 — so the up case is the thin one, and the
// thin one is where a gap hides.
const beforeUp = JSON.parse(await text('[data-testid="plan-weights"]'))
const receiptBefore = await text('[data-testid="reprice-receipt"]')
check('5a. a raised cap can be typed', await typeInto('[data-testid="stated-ceilings"] input', 40))
const receiptUp = await until(() => text('[data-testid="reprice-receipt"]'), v => v.length > 0 && v !== receiptBefore)
check('5b. raising it moves weights the other way', / up from [\d.]+kg to [\d.]+kg/.test(receiptUp), receiptUp)
const afterUp = JSON.parse(await text('[data-testid="plan-weights"]'))
check('5c. ...and the plan really holds heavier weights now',
  afterUp.some((e, i) => beforeUp[i] && e.kg > beforeUp[i].kg))

// --- and is absent where it must not take effect ---------------------------
// assembleProfile DISCARDS all three for a full-gym answer, so a row here
// would be a control that cannot do anything — the one thing the must-have
// list forbids.
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?fullgym=1` })
await wait(3000)
await dialogReady()
check('4a. the full-gym profile still shows Profile', await has('[data-slot="dialog-content"]'))
check('4b. ...its "You" group opens', (await openYouGroup()) === 'ok')
check('4c. ...and the weight-cap rows are absent', !(await has('[data-testid="stated-ceilings"]')))
// The group is genuinely rendered, so 4c is not passing on an empty screen.
check('4d. ...while the rest of the group is still there',
  await ev(`[...document.querySelectorAll('span')].some(s => /^Equipment$/.test((s.textContent||'').trim()))`))
await shoot('setup-answers-3-fullgym')

console.log(failures === 0 ? '\nAll setup-answer screen checks passed.\n' : `\n${failures} setup-answer screen check(s) failed.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)

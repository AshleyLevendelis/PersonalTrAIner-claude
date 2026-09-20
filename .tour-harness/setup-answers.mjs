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

// The dietary picker lives in the "Nutrition" group, not "You" — read off
// ProfileScreen's own <Group label> rather than guessed, because the heading
// above the picker says "Dietary & cooking" and matching THAT would find a
// non-collapsible h3 and never open anything.
const openDietaryGroup = async () => {
  const opened = await ev(`(() => {
    const b = [...document.querySelectorAll('button[aria-expanded]')].find(x => /^Nutrition$/i.test((x.textContent || '').trim()))
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

// --- THE STARTING POINT, added 14 Sep 2026 ---------------------------------
// The last setup answer she could see but never change was the one that
// decides WHICH PLAN she has: 'move_more' builds the easing-in walking plan,
// 'train' builds a lifting one. Being stuck on the wrong answer meant being
// stuck on the wrong kind of plan with nothing on any screen to say so.
//
// WHAT THIS HOLDS THAT NO SOURCE CHECK CAN: that the row is really on the
// screen at 390x844 next to Equipment, that it shows the answer already given
// in the words onboarding used, that a thumb reaches it, and — the one that
// matters — that changing it produces the REBUILD OFFER and not the silent
// re-price the three rows below it produce. Those two roads are one line apart
// in the same function.
const startRow = () => ev(`(() => {
  const reaches = ${REACH}
  const label = [...document.querySelectorAll('span')].find(s => /^Starting from$/.test((s.textContent || '').trim()))
  if (!label) return null
  const row = label.parentElement
  const control = row.querySelector('button, [role="combobox"], select')
  return {
    shown: (row.textContent || '').replace(/\s+/g, ' ').trim(),
    hasControl: !!control,
    reachable: control ? reaches(control) : false,
  }
})()`)

const start = await until(startRow, v => v && v.hasControl)
check('6a. the starting point is on the screen at all', !!start, start)
check('6b. ...showing the answer already given, not an empty box',
  !!start && /get moving first|straight into training/i.test(start.shown), start?.shown)
check('6c. ...and a thumb reaches it', !!start && start.reachable, start)
await shoot('setup-answers-4-starting-point')

// CHANGING IT. The control is a Radix Select, so the option list is portalled
// to the body rather than living inside the row — which is why this opens it
// and then picks by the option's own text instead of setting a value.
const receiptWas = await text('[data-testid="reprice-receipt"]')
await ev(`(() => {
  const label = [...document.querySelectorAll('span')].find(s => /^Starting from$/.test((s.textContent || '').trim()))
  const c = label && label.parentElement.querySelector('button, [role="combobox"]')
  if (c) c.click()
})()`)
await wait(500)
const picked = await ev(`(() => {
  const o = [...document.querySelectorAll('[role="option"]')].find(x => /get moving first/i.test(x.textContent || ''))
  if (!o) return [...document.querySelectorAll('[role="option"]')].map(x => (x.textContent||'').trim())
  o.click(); return true
})()`)
check('6d. the other answer can be chosen', picked === true, picked)
await wait(600)

const offer = await until(() => text('[data-testid="plan-invalidation"]'), v => v.length > 0)
check('6e. changing it OFFERS a rebuild — it does not change anything by itself',
  offer.length > 0, offer)
// THE WORDS SHE READS. Ashley's standing rule is that a changed plan is
// described in plain terms, and the only thing that makes this offer useful is
// knowing which plan she would end up with.
check('6f. ...naming the plan she would get, and when it starts',
  /walks and easy movement/i.test(offer) && /from this week/i.test(offer), offer)
check('6g. ...and promising her logged work survives it',
  /already logged stays/i.test(offer), offer)
// THE ROAD NOT TAKEN, and the whole reason this section is in THIS driver: a
// re-price receipt appearing here would mean the starting point had been
// treated as a number to adjust rather than a plan to rebuild — the same
// exercises, slightly different weights, and still walking.
check('6h. ...and NO weights were silently re-priced behind it',
  (await text('[data-testid="reprice-receipt"]')) === receiptWas,
  { was: receiptWas, now: await text('[data-testid="reprice-receipt"]') })
await shoot('setup-answers-5-rebuild-offer')

// --- SESSION LENGTH, added 16 Sep 2026 ------------------------------------
// It sat on this screen the whole time and did NOTHING to the plan: the field
// was absent from PLAN_INVALIDATING_FIELDS, so setting it wrote the number and
// left every session at the old length. The only visible effect was today's
// card starting to say the session ran over. "You can set your session length"
// was true about the NUMBER and false about the PLAN.
//
// Ashley's ruling, 16 Sep 2026, from three options: rebuild the rest of the
// block around the new length. This reads that ruling off the real screen —
// a source gate can prove the branch exists and cannot prove anyone reaches it.
{
  const receiptWas = await text('[data-testid="reprice-receipt"]')
  await ev(`(() => {
    const label = [...document.querySelectorAll('span')].find(s => /^Session length$/.test((s.textContent || '').trim()))
    const c = label && label.parentElement.querySelector('button, [role="combobox"]')
    if (c) c.click()
  })()`)
  await wait(500)
  // The fixture is 60-90, so 30-45 is a genuine shortening and the copy that
  // comes back is the "cut off the end" half rather than the other one.
  const picked = await ev(`(() => {
    const o = [...document.querySelectorAll('[role="option"]')].find(x => /30-45/.test(x.textContent || ''))
    if (!o) return [...document.querySelectorAll('[role="option"]')].map(x => (x.textContent||'').trim())
    o.click(); return true
  })()`)
  check('6i. session length can be changed on the screen at all', picked === true, picked)
  await wait(600)

  const offer = await until(() => text('[data-testid="plan-invalidation"]'), v => v.length > 0)
  check('6j. changing it OFFERS a rebuild rather than silently writing a number',
    offer.length > 0, offer)
  // ASHLEY'S RULING, READ OFF THE SCREEN. Rebuilt to fit is the whole point;
  // "trimmed" is the option she rejected, and the sentence has to say which.
  check('6k. ...saying sessions are REBUILT to fit, not trimmed at the end',
    /rather than the same ones with the end cut off/i.test(offer), offer)
  check('6l. ...and promising her logged work survives it',
    /already logged stays/i.test(offer), offer)
  check('6m. ...in plain words, naming no database field',
    !/session_duration|preference/i.test(offer), offer)
  // THE ROAD NOT TAKEN, same shape as 6h: a re-price receipt here would mean
  // the length had been treated as a number to adjust rather than a plan to
  // rebuild — the same sessions at slightly different weights, still too long.
  check('6n. ...and NO weights were silently re-priced behind it',
    (await text('[data-testid="reprice-receipt"]')) === receiptWas,
    { was: receiptWas, now: await text('[data-testid="reprice-receipt"]') })
  // WHAT THIS DRIVER CANNOT ANSWER, written down so the next reader does not
  // spend an afternoon on it as I did on 16 Sep 2026. I added two checks here —
  // "it is on the screen" and "nothing is stacked on top of it" — and both went
  // red, which looked like every rebuild offer in the app being hidden under a
  // panel. It was the harness. `[data-testid="plan-invalidation"]` is rendered
  // by THIS page (.tour-harness/profile.tsx), a bare div under the Open Profile
  // button; the app's real offer is a Dialog in App.tsx raised from the same
  // callback. So the div was behind ProfileScreen's own dialog, exactly as a
  // bare div would be, and the measurement was of test scaffolding.
  //
  // What the checks above DO prove, and it is the half that can silently break:
  // a real change on the real ProfileScreen raises an offer, and these are the
  // words it carries — the same string the app hands to its dialog title and
  // body. Whether that dialog then appears is a question about App.tsx, and no
  // harness page boots App.tsx, so no driver in this repo can ask it today.
  // Do NOT re-add a geometry or elementFromPoint check against this testid, and
  // do not make the harness render its own copy of the dialog to satisfy one —
  // that measures the copy.
  await ev(`document.querySelector('[data-testid="plan-invalidation"]')?.scrollIntoView({ block: 'center' })`)
  await wait(500)
  await shoot('setup-answers-6-session-length')
}

// --- THE GOAL, added 17 Sep 2026 ------------------------------------------
// The LAST setup answer that lived on neither surface, and the one where the
// written record was most misleading: every piece of machinery existed —
// fitness_goal was already an invalidating field, detectPlanInvalidation
// already had the branch, the calorie calculation already read it — and
// nothing wrote the field. A source gate can prove all that machinery is
// wired and still cannot prove a person can reach it. This is that check.
//
// Ashley's ruling, 17 Sep 2026, from three options: training AND food, from
// this week. Both halves have to be on the card BEFORE the tap, and that is
// what 7j reads.
{
  const receiptWas = await text('[data-testid="reprice-receipt"]')
  await ev(`(() => {
    const label = [...document.querySelectorAll('span')].find(s => /^Goal$/.test((s.textContent || '').trim()))
    const c = label && label.parentElement.querySelector('button, [role="combobox"]')
    if (c) c.click()
  })()`)
  await wait(500)
  // The fixture is hypertrophy, so Fat loss is a real change in the direction
  // a person most often makes — and the one where getting the food wrong
  // matters most, because it means eating a surplus while trying to lean out.
  const picked = await ev(`(() => {
    const o = [...document.querySelectorAll('[role="option"]')].find(x => /Fat loss/i.test(x.textContent || ''))
    if (!o) return [...document.querySelectorAll('[role="option"]')].map(x => (x.textContent||'').trim())
    o.click(); return true
  })()`)
  check('7g. the goal can be changed on the screen at all', picked === true, picked)
  await wait(600)

  const offer = await until(() => text('[data-testid="plan-invalidation"]'), v => v.length > 0)
  check('7h. changing it OFFERS a rebuild rather than silently rewriting the block',
    offer.length > 0, offer)
  check('7i. ...naming the plan half — what you do, how you rest, the rep ranges',
    /rep ranges/i.test(offer), offer)
  // ASHLEY'S RULING, READ OFF THE SCREEN. The goal is the only setup answer
  // that also sets the deficit, so an offer that says "your plan" and then
  // quietly moves someone's calories is the silent change the confirm rail
  // exists to stop. Both halves, before the tap, or this fails.
  check('7j. ...AND the food half, before the tap',
    /calorie/i.test(offer) && /meal/i.test(offer), offer)
  check('7k. ...warning that the meals take a moment to rebuild',
    /takes a moment/i.test(offer), offer)
  check('7l. ...and promising her logged work survives it',
    /already logged stays/i.test(offer), offer)
  check('7m. ...in plain words, naming no database field',
    !/fitness_goal|hypertrophy|fat_loss/i.test(offer), offer)
  // THE ROAD NOT TAKEN, the same shape as 6h and 6n: a re-price receipt here
  // would mean the goal had been treated as a number to adjust rather than a
  // different plan to build.
  check('7n. ...and NO weights were silently re-priced behind it',
    (await text('[data-testid="reprice-receipt"]')) === receiptWas,
    { was: receiptWas, now: await text('[data-testid="reprice-receipt"]') })
  // THE ROW ITSELF STILL READS BACK WHAT WAS CHOSEN. A select that fires the
  // offer and then snaps back to the old value would leave somebody agreeing
  // to a rebuild for a goal the screen no longer shows.
  const shown = await ev(`(() => {
    const label = [...document.querySelectorAll('span')].find(s => /^Goal$/.test((s.textContent || '').trim()))
    const c = label && label.parentElement.querySelector('button, [role="combobox"]')
    return c ? (c.textContent || '').trim() : null
  })()`)
  check('7o. the row shows the goal she picked, not the one she left',
    typeof shown === 'string' && /Fat loss/i.test(shown), shown)
  // Same harness limit as §6: the words are real and the dialog is not. See
  // the note above the session-length shot.
  await ev(`document.querySelector('[data-testid="plan-invalidation"]')?.scrollIntoView({ block: 'center' })`)
  await wait(500)
  await shoot('setup-answers-7-goal')
}

// --- THE THREE KNOWN LIFTS, added 14 Sep 2026 -----------------------------
// The last setup answers that could never be corrected. §7 of the source gate
// holds why the RE-PRICE path cannot act on them; this holds that they are on
// the screen at all, which is what "locked" actually meant to somebody using
// the app.
const knownLifts = await ev(`(() => {
  const box = document.querySelector('[data-testid="known-lifts"]')
  if (!box) return null
  return [...box.querySelectorAll('input')].map(i => {
    const row = i.closest('div').parentElement
    return { value: i.value, label: (row?.querySelector('span')?.textContent || '').trim() }
  })
})()`)
check('8a. the three known lifts are on the screen', Array.isArray(knownLifts) && knownLifts.length === 3, knownLifts)
check('8b. ...each showing the number already given', (knownLifts ?? []).every(r => r.value !== ''), knownLifts)
check('8c. ...named as lifts, not as fields',
  (knownLifts ?? []).every(r => /squat|bench|deadlift/i.test(r.label)), (knownLifts ?? []).map(r => r.label))
// THIS FIXTURE SKIPPED CALIBRATION, so the "changes no weights" line must NOT
// be showing — it would be false here.
check('8d. ...and a plan built FROM them is not told they change nothing',
  !(await ev(`!!document.querySelector('[data-testid="known-lifts-record-only"]')`)))
await shoot('setup-answers-7-known-lifts')

// --- EXERCISES TO AVOID, added 14 Sep 2026 --------------------------------
// CLAUDE.md recorded exercise dislikes as coach-only. Measured, that was half
// wrong: this screen already listed them with edit and delete. What it could
// not do was ADD one, and the group is hidden entirely when there are none —
// so a first dislike had no screen route at all.
const avoidRow = await ev(`(() => {
  const label = [...document.querySelectorAll('span')].find(s => /^Exercises to avoid$/.test((s.textContent || '').trim()))
  if (!label) return null
  const box = label.parentElement
  return {
    hint: (box.querySelector('p')?.textContent || '').trim(),
    hasInput: !!box.querySelector('input'),
  }
})()`)
check('7a. the Profile screen offers exercises to avoid', !!avoidRow, avoidRow)
check('7b. ...with somewhere to type one, not just a list to read',
  !!avoidRow && avoidRow.hasInput, avoidRow)
check('7c. ...and says what it is for in plain words',
  !!avoidRow && avoidRow.hint.length > 10, avoidRow?.hint)
// BESIDE FOODS TO AVOID, because they are the same kind of promise and the
// person looking for one will look where the other is.
// ADJACENT IN THE DOM, not within N characters of rendered text. The first
// version measured a character distance and failed at 400 for no reason worth
// pinning: the two rows are siblings, and how much text the tag lists happen
// to contain between them is not the property.
const avoidNeighbours = await ev(`(() => {
  const labels = [...document.querySelectorAll('span')]
  const f = labels.find(s => /^Foods to avoid$/.test((s.textContent || '').trim()))
  const e = labels.find(s => /^Exercises to avoid$/.test((s.textContent || '').trim()))
  if (!f || !e) return null
  const fb = f.parentElement, eb = e.parentElement
  return { siblings: fb.parentElement === eb.parentElement, adjacent: fb.nextElementSibling === eb }
})()`)
check('7d. ...in the same group as Foods to avoid', !!avoidNeighbours && avoidNeighbours.siblings, avoidNeighbours)
check('7e. ...and right beside it', !!avoidNeighbours && avoidNeighbours.adjacent, avoidNeighbours)
await shoot('setup-answers-6-exercises-to-avoid')

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

// --- 8. KETO SAYS WHAT IT ACTUALLY BUYS ------------------------------------
// Ashley's ruling, 20 Sep 2026, from four options: say it on the setup screen.
// `test:coach-voice` §8 holds the SENTENCE — that every food it names really
// is filtered, that it does not claim fresh fruit, that it makes no promise.
// This holds the half no source check can: that on a 390x844 screen the line
// is actually rendered, and that it is NOT rendered for somebody who did not
// pick keto.
//
// BOTH STATES ARE READ, and that is the point rather than thoroughness: with
// only the keto run, "shows the caveat" and "shows the caveat always" are
// indistinguishable — the one-candidate rule this repo already records.
// The no-keto state is read FIRST, on the default fixture above, so a
// mutation making the line unconditional has a run that can catch it.
const CAVEAT = '[data-testid="diet-target-caveat"]'
await send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
await wait(3000)
await dialogReady()
const openedForPlain = (await openDietaryGroup()) === 'ok'
check('8a. the dietary group opens on a profile with no diet picked', openedForPlain)
check('8b. ...and no caveat is shown, because nothing was picked that needs one',
  !(await has(CAVEAT)), await text(CAVEAT))

await send('Page.navigate', { url: `http://127.0.0.1:${port}/?keto=1` })
await wait(3000)
await dialogReady()
check('8c. the keto profile still shows Profile', await has('[data-slot="dialog-content"]'))
const openedForKeto = (await openDietaryGroup()) === 'ok'
check('8d. ...its dietary group opens', openedForKeto)
const caveat = await until(() => text(CAVEAT), t => t.length > 0)
check('8e. ...and the caveat is on the screen', caveat.length > 40, caveat)
check('8f. ...naming Keto rather than some other diet', /^Keto\b/.test(caveat), caveat)
check('8g. ...saying the daily carb target is not a keto split',
  /daily carb target/i.test(caveat) && /not a keto split/i.test(caveat), caveat)
check('8h. ...and admitting fresh fruit is not filtered', /not fresh fruit/i.test(caveat), caveat)
check('8i. ...without promising to build one later', !/\byet\b/i.test(caveat), caveat)
// LEGIBLE, not merely present — a zero-height node passes every check above.
const caveatBox = await ev(`(() => { const n = document.querySelector('${CAVEAT}'); if (!n) return null; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), inView: r.top >= 0 && r.bottom <= 844 } })()`)
check('8j. ...rendered at a readable size inside the phone viewport',
  !!caveatBox && caveatBox.w > 100 && caveatBox.h > 10 && caveatBox.inView, caveatBox)
await shoot('setup-answers-7-keto-caveat')

console.log(failures === 0 ? '\nAll setup-answer screen checks passed.\n' : `\n${failures} setup-answer screen check(s) failed.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)

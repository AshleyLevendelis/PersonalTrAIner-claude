// ---------------------------------------------------------------------------
// TAKING ONE EXERCISE OUT, AND MOVING ONE — on the real screen.
//
// scripts/test-session-edit.ts holds the rules: what the edit must re-assert,
// which weeks a scope reaches, the floor it refuses at. This holds the half no
// source check can — that on a real mount at phone width the menu items are
// there and enabled only where they make sense, that a move visibly changes
// the order and survives leaving the tab, and that Ashley's ruling actually
// reaches a thumb: removing ASKS (drop it / put something else there) rather
// than deciding, and the swap list is reachable from the act of wanting
// something gone.
//
// THE ORDER IS READ FROM data-exercise-name, not from a screenshot. A row's
// name lives in a truncating span inside a shared line component; asserting
// "the third row is now the bench press" off innerText would pass on a
// truncation. The attribute is the row's identity, in DOM order.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'
const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => { const p = q.url.split('?')[0]; const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p); if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return } r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' }); r.end(readFileSync(f)) })
await new Promise(r => server.listen(0, r)); const port = server.address().port
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9411', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms)); let t
for (let i = 0; i < 80; i++) { try { const l = await fetch('http://127.0.0.1:9411/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {} await wait(250) }
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

// Radix menus open on pointerdown, so a synthetic .click() on the trigger is
// not enough — real pointer events at the element's centre.
const rectOf = sel => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return null; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
const tap = async sel => { const r = await rectOf(sel); if (!r) return false; await wait(120); const r2 = await rectOf(sel); for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: r2.x, y: r2.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 }); return true }
const clickSel = sel => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return false; n.click(); return true })()`)
const has = sel => ev(`!!document.querySelector(${JSON.stringify(sel)})`)
const order = () => ev(`[...document.querySelectorAll('[data-exercise-name]')].map(n => n.getAttribute('data-exercise-name'))`)
const escape = async () => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await wait(450) }
const untilOrder = async pred => { let o = await order(); for (let i = 0; i < 20 && !pred(o); i++) { await wait(300); o = await order() } return o }

// Expand the row for a named exercise, then open its "⋮". Rows collapse to a
// single line and the menu only exists on the expanded one.
const openRowMenu = async name => {
  if (await has('[role="menu"]')) await escape()
  const line = `[data-exercise-name=${JSON.stringify(name)}] [role="button"], [data-exercise-name=${JSON.stringify(name)}] .cursor-pointer`
  if (!(await has(`[data-exercise-name=${JSON.stringify(name)}] button[aria-label="Exercise options"]`))) {
    await tap(line); await wait(700)
  }
  if (!(await tap(`[data-exercise-name=${JSON.stringify(name)}] button[aria-label="Exercise options"]`))) return 'no-trigger'
  await wait(500)
  return (await has('[data-testid="remove-exercise"]')) ? 'open' : 'no-menu'
}
const menuItems = () => ev(`[...document.querySelectorAll('[role="menuitem"]')].map(n => ({ t: n.textContent.trim(), disabled: n.getAttribute('aria-disabled') === 'true' || n.hasAttribute('data-disabled'), id: n.getAttribute('data-testid') }))`)

console.log('\nREMOVING AND MOVING ONE EXERCISE — on the screen\n')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off#/tab/exercise` })
await wait(4500)

const start = await order()
check('0. today shows a real session with room to lose one', Array.isArray(start) && start.length >= 4, start)

// --- the menu -------------------------------------------------------------
check('1a. the first exercise’s menu opens', (await openRowMenu(start[0])) === 'open')
const items = await menuItems()
const ids = items.map(i => i.id)
check('1b. it offers move earlier, move later and take out', ['move-up', 'move-down', 'remove-exercise'].every(k => ids.includes(k)), items)
check('1c. ...cheap first, the ban last', ids.indexOf('remove-exercise') < ids.length - 1 && /ban/i.test(items[items.length - 1].t), items.map(i => i.t))
check('1d. the first exercise cannot move earlier', items.find(i => i.id === 'move-up')?.disabled === true, items.find(i => i.id === 'move-up'))
check('1e. ...but can move later', items.find(i => i.id === 'move-down')?.disabled === false, items.find(i => i.id === 'move-down'))

// ONE PLACE FOR EVERY CHANGE — Ashley's ruling, 14 Sep 2026, from three
// options, after reporting: "Swap exercise is an inline link above the sets
// table, while the rest of the actions are inside the 3-dot overflow menu."
// She chose all of them behind the ⋮.
check('1f. swapping is in the same menu as the rest', ids.includes('swap-exercise'), items.map(i => i.t))
// THE OTHER HALF, AND THE ONE THAT WOULD ROT. "It is in the menu" stays true
// if a copy is also left outside it, which is the state she reported. So the
// row itself is read: every control on it that CHANGES the exercise must be
// gone. Plate calculator is named as the deliberate exception rather than
// allowlisted by silence — it changes nothing, and it is reached mid-set with
// a bar in front of you.
const strayVerbs = await ev(`(() => {
  const rows = [...document.querySelectorAll('[data-exercise-name]')]
  const out = []
  for (const r of rows) {
    for (const b of r.querySelectorAll('button')) {
      if (b.closest('[role="menu"]')) continue
      const t = (b.textContent || '').trim()
      if (/swap|move (earlier|later)|take out|ban|never show/i.test(t)) out.push(t)
    }
  }
  return [...new Set(out)]
})()`)
check('1g. ...and no change to an exercise is left loose on the row', (strayVerbs || []).length === 0, strayVerbs)
// RE-ANCHORED 17 Sep 2026. This asked whether ANY row on today's card carried
// a plate calculator, and passed because the row that happened to be open was
// the first one — a band warm-up, which had a plate calculator it had no use
// for. It now renders only where there is a plate to load, so the check opens
// a row with a WEIGHT on it and reads that. Her ruling is unchanged and this
// is the half that tests it: the calculator stays ON THE ROW, not in the menu.
await escape()
const loadedName = (await ev(`(() => {
  const r = [...document.querySelectorAll('[data-exercise-name]')].find(x => /~\\s*[\\d.]+\\s*kg/i.test(x.innerText || ''))
  return r ? r.getAttribute('data-exercise-name') : null })()`))
check('1h. a row with a weight on it is there to read', !!loadedName, loadedName)
if (loadedName) {
  await tap(`[data-exercise-name=${JSON.stringify(loadedName)}] [role="button"], [data-exercise-name=${JSON.stringify(loadedName)}] .cursor-pointer`)
  await wait(900)
}
check('1i. ...while the plate calculator, which changes nothing, stays one tap away on it',
  (await ev(`(() => {
    const r = [...document.querySelectorAll('[data-exercise-name]')].find(x => x.getAttribute('data-exercise-name') === ${JSON.stringify(loadedName)})
    if (!r) return 'row gone'
    return [...r.querySelectorAll('button')].some(b => /plate calculator/i.test(b.textContent || ''))
  })()`)) === true)
// AND NOT ON A ROW WITH NOTHING TO LOAD. A band warm-up offering to work out
// your plates is the app claiming something it cannot do — the same class as
// the "Bodyweight" label on a machine.
check('1j. ...and is not offered where there is no weight to load',
  (await ev(`(() => {
    const r = [...document.querySelectorAll('[data-exercise-name]')].find(x => /\\b(Band|Bodyweight)\\b/.test(x.innerText || '') && !/~\\s*[\\d.]+\\s*kg/i.test(x.innerText || ''))
    if (!r) return 'no unloaded row on this fixture'
    return [...r.querySelectorAll('button')].some(b => /plate calculator/i.test(b.textContent || ''))
  })()`)) === false)

// The menu was closed to read the row underneath it; the move checks below
// need it open again on the SAME exercise the order was recorded from.
check('1k. the first exercise’s menu re-opens for the move checks', (await openRowMenu(start[0])) === 'open')
await shoot('session-edit-menu')

// --- moving ----------------------------------------------------------------
// Radix menu items answer real pointer events, not element.click() — a
// synthetic click on one returns true and does nothing, which is exactly the
// shape of a check that proves nothing.
check('2a. "Move later" is tapped', await tap('[data-testid="move-down"]'))
const moved = await untilOrder(o => o[0] === start[1])
check('2b. the order on screen actually changed', moved.join('|') !== start.join('|'), { start, moved })
check('2c. ...it swapped with the one below it, and nothing else moved',
  moved[0] === start[1] && moved[1] === start[0] && moved.slice(2).join('|') === start.slice(2).join('|'), { start, moved })
check('2d. ...and the session still holds every exercise it did', [...moved].sort().join('|') === [...start].sort().join('|'))
check('2d2. ...and nothing on screen says it failed', !(await ev(`document.body.innerText`)).includes('The order hasn’t changed'))
await shoot('session-edit-moved')

// It was SAVED, not just re-rendered: leave the tab and come back.
await ev(`location.hash = '#/tab/home'`); await wait(1500)
await ev(`location.hash = '#/tab/exercise'`); await wait(2500)
const afterTrip = await untilOrder(o => o.length === moved.length)
check('2e. the new order survives leaving the tab and coming back', afterTrip.join('|') === moved.join('|'), { moved, afterTrip })

// --- removing asks, it does not decide -------------------------------------
const victim = afterTrip[afterTrip.length - 1]
check('3a. the last exercise’s menu opens', (await openRowMenu(victim)) === 'open')
check('3b. ...and it cannot move later', (await menuItems()).find(i => i.id === 'move-down')?.disabled === true)
check('3c. "Take out of this session" opens the sheet', await tap('[data-testid="remove-exercise"]') && (await wait(700), await has('[data-testid="remove-exercise-sheet"]')))

// WHY COMES FIRST NOW (15 Sep 2026). docs/how-the-app-talks-about-a-change.md
// §3: one tap and the app knows which of six problems it is solving, instead
// of answering all of them with the same removal.
check('3c2. it asks WHY before anything else', await has('[data-testid="reason-chips"]'))
const reasons = await ev(`[...document.querySelectorAll('[data-testid="reason-chips"] [data-reason]')].map(b => b.getAttribute('data-reason'))`)
check('3c3. ...offering the four a removal can have',
  JSON.stringify(reasons) === JSON.stringify(['no_time', 'tired', 'hurts', 'dislike']), reasons)
check('3c4. ...naming the exercise', (await ev(`document.querySelector('[data-testid="reason-chips"]')?.innerText || ''`)).includes(victim), victim)
// NEVER GATED BEHIND AN ANSWER — "reason required" was the option Ashley did
// NOT pick on 14 Sep, and a question you cannot walk past is that option in
// disguise.
check('3c5. ...and a way past it without answering', await has('[data-testid="reason-skip"]'))
await shoot('session-edit-reason')
await clickSel('[data-testid="reason-skip"]'); await wait(500)

const verbs = await ev(`[...document.querySelectorAll('[data-testid="remove-exercise-sheet"] [data-verb]')].map(b => b.getAttribute('data-verb'))`)
check('3d. it ASKS — drop it, or put something else there (her ruling, 11 Sep)', JSON.stringify(verbs) === JSON.stringify(['drop', 'swap-instead']), verbs)
check('3e. ...and it names the exercise being taken out', (await ev(`document.querySelector('[data-testid="remove-exercise-sheet"]')?.innerText || ''`)).includes(victim), victim)
await shoot('session-edit-remove-asks')

// --- the swap route out of it ----------------------------------------------
// POLLED, NOT SLEPT ON. The swap dialog is lazy (15 Sep 2026), so the first
// open waits on a chunk fetch — a fixed 900ms passed before it was lazy and
// failed after, which is a driver measuring the network rather than the app.
const untilSel = async (sel, ms = 6000) => {
  for (let i = 0; i < ms / 250; i++) { if (await has(sel)) return true; await wait(250) }
  return false
}
// ANCHORED ON THE DIALOG, NOT ITS TITLE. Two things changed under this check
// on 15 Sep 2026 and each broke it for a different reason: the dialog went
// lazy, so a fixed 900ms wait became a race with a chunk fetch; and its title
// is now "Swap X?" while it asks why, because promising "constraint-checked
// replacements" above that question describes something it may not do. The
// property is that the swap surface opened for this exercise — which survives
// both.
check('4a. "Put something else there" reaches the swap dialog',
  await clickSel('[data-verb="swap-instead"]') && await untilSel('[data-testid="swap-dialog"]'))
check('4b. ...for the same exercise', (await ev(`document.querySelector('[data-testid="swap-dialog"]')?.innerText || ''`)).includes(victim), victim)
check('4c. ...and it asks why here too, the same question as the sheet',
  await has('[data-testid="swap-dialog"] [data-testid="reason-chips"]'))

await escape(); await wait(600)

// --- dropping it ------------------------------------------------------------
check('5a. reopening and choosing "Drop it"', (await openRowMenu(victim)) === 'open' && await tap('[data-testid="remove-exercise"]')
  && (await wait(700), await clickSel('[data-testid="reason-skip"]')) && (await wait(400), await clickSel('[data-verb="drop"]')))
await wait(400)
check('5b. ...asks how far it should reach', await has('[data-testid="remove-scope"]'))
const scopes = await ev(`[...document.querySelectorAll('[data-testid="remove-scope"] [data-scope]')].map(b => ({ s: b.getAttribute('data-scope'), t: b.textContent.trim() }))`)
check('5c. ...in the swap dialog’s own words', JSON.stringify(scopes) === JSON.stringify([{ s: 'today', t: 'Today only' }, { s: 'permanent', t: 'Rest of block' }]), scopes)
await shoot('session-edit-scope')
check('5d. "Today only" takes it out', await clickSel('[data-scope="today"]'))
const dropped = await untilOrder(o => !o.includes(victim))
check('5e. ...the exercise is gone from the session', !dropped.includes(victim), { victim, dropped })
check('5f. ...exactly one gone, the rest untouched', dropped.length === afterTrip.length - 1 && dropped.join('|') === afterTrip.filter(n => n !== victim).join('|'), { afterTrip, dropped })
check('5g. ...and the sheet closed itself', !(await has('[data-testid="remove-exercise-sheet"]')))
await shoot('session-edit-dropped')

await ev(`location.hash = '#/tab/home'`); await wait(1500)
await ev(`location.hash = '#/tab/exercise'`); await wait(2500)
const finalOrder = await untilOrder(o => o.length === dropped.length)
check('5h. the removal survives leaving the tab and coming back', finalOrder.join('|') === dropped.join('|'), { dropped, finalOrder })

// --- 6. WHAT IT COSTS, AND WHAT THE APP WILL DO ABOUT IT --------------------
//
// Ashley's ruling, 13 Sep 2026: a change to one day may touch another day to
// keep the week balanced, and the app SAYS SO before the tap. That sentence
// only appears when there is something to say, and a healthy generated plan
// never has anything to say — so this reloads the harness with ?tilt=lopsided,
// which triples the sets on every day but the first. Without the tilt the only
// browser check available would be "the paragraph is absent", which is exactly
// what it would also report if the feature had been deleted.
console.log('\n  on a deliberately lopsided week')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&tilt=lopsided#/tab/exercise` })
await wait(4500)
const tilted = await order()
check('6a. the tilted week still renders a session', Array.isArray(tilted) && tilted.length >= 4, tilted)
const tiltVictim = tilted[tilted.length - 1]
check('6b. the remove sheet opens on it', (await openRowMenu(tiltVictim)) === 'open' && await tap('[data-testid="remove-exercise"]')
  && (await wait(700), await clickSel('[data-testid="reason-skip"]')) && (await wait(400), await clickSel('[data-verb="drop"]')))
await wait(500)
check('6c. ...and reaches the scope step', await has('[data-testid="remove-scope"]'))
const balancing = await ev(`document.querySelector('[data-testid="remove-balancing"]')?.textContent?.trim() || ''`)
const costLine = await ev(`document.querySelector('[data-testid="remove-balance-cost"]')?.textContent?.trim() || ''`)
check('6d. the app says what it will even out on other days, before the tap',
  balancing.startsWith("I'll also ") && /\bto keep your week balanced\.$/.test(balancing), { balancing, costLine })
// It has to name a day that is NOT the one being edited — the whole point of
// the sentence is the reach of the change.
const editedDay = await ev(`document.querySelector('[data-today-day-name]')?.getAttribute('data-today-day-name') || ''`)
check('6e. ...naming a real weekday', /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/.test(balancing), balancing)
check('6f. ...and it is not the day being edited', !editedDay || !balancing.includes(`on ${editedDay}`), { editedDay, balancing })
await shoot('session-edit-balancing')

// --- [7] WHY THIS LIST IS SHORT, WHERE SHE CAN READ IT ----------------------
// Ashley, 17 Sep 2026, mid-session in a gym: offered three unloaded leg curls
// as replacements while standing next to a leg-curl machine, with nothing
// telling her that her TRAINING STYLE was the filter. The sentence that says
// so existed and was correct — it rendered INSIDE the list's own `max-h-80
// overflow-y-auto` box, below the option cards, so reading it meant scrolling
// past the very options it was meant to frame.
//
// NO `test:` GATE COULD HAVE CAUGHT THIS. The string was in the file, the
// branch was reached, the node was in the DOM. Only geometry on a real screen
// tells you that a true sentence was rendered where nobody reads it. So this
// measures POSITION, and it reads both halves — "it is above the list" stays
// true if the node quietly stops rendering at all, so presence is asserted
// separately.
//
// FIXTURE FOUND, NOT ASSUMED. The default full-gym week hands the dialog four
// or more options, where the sentence is not supposed to render — every check
// below would then pass by being vacuous. Measured: the first attempt did
// exactly that and 4e caught it. So this uses the home-gym leg fixture and
// SCANS for a genuinely short list rather than naming an exercise that might
// stop being short.
console.log('\n  a short swap list on the home-gym leg day')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&legcurl=1#/tab/exercise` })
await wait(4500)
const legDay = await order()
check('7a. the home-gym leg fixture renders a session', Array.isArray(legDay) && legDay.length >= 3, legDay)
let shortList = null
let shortOn = ''
for (const name of legDay || []) {
  if ((await openRowMenu(name)) !== 'open') continue
  if (!(await tap('[data-testid="swap-exercise"]')) || !(await untilSel('[data-testid="swap-dialog"]'))) { await escape(); await wait(400); continue }
  if (await has('[data-testid="swap-dialog"] [data-testid="reason-skip"]')) { await clickSel('[data-testid="swap-dialog"] [data-testid="reason-skip"]'); await wait(800) }
  const seen = await ev(`(() => {
    const d = document.querySelector('[data-testid="swap-dialog"]'); if (!d) return null
    const options = [...d.querySelectorAll('[data-testid="swap-option"]')]
    const reason = d.querySelector('[data-testid="swap-short-list-reason"]')
    const dr = d.getBoundingClientRect()
    const rr = reason && reason.getBoundingClientRect()
    // The list's OWN scrolling box — the one the sentence used to be trapped
    // inside, below the options. The dialog itself may also scroll and that is
    // fine, so this walks up from an OPTION rather than collecting every
    // scroller in the tree. MEASURED 17 Sep 2026: a first version asked "is it
    // inside any scroller at all" and went red on the fixed build, because
    // Radix's own content box scrolls.
    const listScroller = (() => {
      let n = options[0]
      while (n && n !== d) { if (/auto|scroll/.test(getComputedStyle(n).overflowY)) return n; n = n.parentElement }
      return null
    })()
    return {
      options: options.length,
      hasReason: !!reason,
      text: reason ? reason.textContent.trim().slice(0, 64) : '',
      listScrolls: !!listScroller,
      insideTheListScroller: !!reason && !!listScroller && listScroller.contains(reason),
      aboveFirstOption: !!reason && options.length > 0 && rr.bottom <= options[0].getBoundingClientRect().top + 1,
      withinDialogBox: !!reason && rr.top >= dr.top - 1 && rr.bottom <= dr.bottom + 1,
    }
  })()`)
  if (seen && seen.options > 0 && seen.options < 4) { shortList = seen; shortOn = name; await shoot('session-edit-swap-short-list'); break }
  await escape(); await wait(400)
}
// TEETH FIRST: the shape of the fixture is asserted before the property that
// depends on it, so a fixture that stopped being short can never read as a pass.
check('7b. some exercise here really does have a SHORT list, so 7c-7d mean something',
  !!shortList && shortList.options > 0 && shortList.options < 4, { shortOn, shortList })
check('7c. the reason is rendered, and ABOVE the options rather than below them in the list\'s own scroller',
  !!shortList && shortList.hasReason === true && shortList.aboveFirstOption === true && shortList.insideTheListScroller === false,
  { shortOn, shortList })
// The list really does scroll — otherwise 7c passes for the wrong reason,
// because a list that fits on screen can never hide anything below it.
check('7e. ...and the options list really is a scrolling box, so 7c has teeth',
  !!shortList && shortList.listScrolls === true, { shortOn, shortList })
check('7d. ...inside the part of the dialog she can actually see',
  !!shortList && shortList.withinDialogBox === true, { shortOn, shortList })
await escape(); await wait(400)

console.log(failures === 0 ? '\nRemoving asks, moving moves, both stick, and the reach of a change is stated.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)

// ---------------------------------------------------------------------------
// "IT HURTS" — THE WHOLE TRIAGE, ON A REAL SCREEN.
//
// Ashley, 15 Sep 2026, two rulings. On what pain should do, from three
// options: ASK, THEN ACT — a niggle eases that area off for a few days, a
// lasting one goes into her injuries so every future plan avoids it, and
// sharp / one-sided / worsening is a professional and NEVER a plan change. And
// on where that happens, from three more: ON THE SCREEN, FULLY, because "you
// reach for this mid-session on a gym floor, and dropping someone into a chat
// to type is the wrong thing to hand them."
//
// WHY A DRIVER AND NOT ONLY A GATE. test:edit-reason holds the words and the
// routing table, and cannot tell reachable code from unreachable code —
// measured 14 Sep 2026, when `if (false && advice)` left twelve source checks
// green. This is a safety branch: "the plan is left alone" has to be observed,
// not asserted about a constant.
//
// THE RED FLAG IS THE POINT OF THE FILE. Two things must both be true of it:
// the advice names a professional, and the session on screen is byte-for-byte
// what it was before. A check that only read the sentence would pass on a
// build that showed the sentence AND quietly rebuilt the week.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => {
  const p = q.url.split('?')[0]
  const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p)
  if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return }
  r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' })
  r.end(readFileSync(f))
})
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

// Radix opens menus on pointerdown, so real pointer events, not .click().
const rectOf = sel => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return null; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
const tap = async sel => { const r = await rectOf(sel); if (!r) return false; await wait(120); const r2 = await rectOf(sel); for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: r2.x, y: r2.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 }); return true }
const clickSel = sel => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return false; n.click(); return true })()`)
const has = sel => ev(`!!document.querySelector(${JSON.stringify(sel)})`)
const order = () => ev(`[...document.querySelectorAll('[data-exercise-name]')].map(n => n.getAttribute('data-exercise-name'))`)
const escape = async () => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await wait(450) }

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
/** Open the remove sheet on a named row and answer "It hurts". */
const openHurts = async name => {
  if ((await openRowMenu(name)) !== 'open') return false
  if (!(await tap('[data-testid="remove-exercise"]'))) return false
  await wait(700)
  if (!(await clickSel('[data-reason="hurts"]'))) return false
  await wait(400)
  return true
}

console.log('\n"IT HURTS" — ASKED, THEN ACTED ON\n')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off#/tab/exercise` })
await wait(4500)

const before = await order()
check('0. today shows a real session', Array.isArray(before) && before.length >= 3, before)
const victim = before[before.length - 1]

// --- 1. The question, and its three answers --------------------------------
check('1a. "It hurts" is one of the reasons offered', await openHurts(victim))
check('1b. ...and it asks which kind before doing anything', await has('[data-testid="reason-hurt-kind"]'))
const kinds = await ev(`[...document.querySelectorAll('[data-hurt]')].map(b => b.getAttribute('data-hurt'))`)
check('1c. ...a niggle, a lasting one, and the one that needs a person',
  JSON.stringify(kinds) === JSON.stringify(['niggle', 'lasting', 'red_flag']), kinds)
await shoot('hurts-kind')

// --- 2. The red flag: advice, and the plan untouched -----------------------
//
// THE SAFETY BRANCH. Both halves are checked, because a build that printed the
// sentence and rebuilt the week anyway would pass on either half alone.
check('2a. the worrying answer goes to its own screen', await clickSel('[data-hurt="red_flag"]') && (await wait(500), await has('[data-testid="reason-red-flag"]')))
const advice = await ev(`document.querySelector('[data-testid="reason-red-flag"]')?.innerText || ''`)
check('2b. ...naming a professional rather than adapting round it', /physio|professional/i.test(advice), advice.slice(0, 200))
check('2c. ...and saying plainly that the plan was left alone', /left your plan|as it is/i.test(advice), advice.slice(0, 200))
check('2d. ...without naming a condition it cannot diagnose',
  !/tendonitis|impingement|tear|strain|sprain/i.test(advice), advice.slice(0, 200))
check('2e. ...and it does NOT offer an area picker, so no adaptation can start here',
  !(await has('[data-testid="reason-area"]')))
await shoot('hurts-red-flag')

await clickSel('[data-testid="red-flag-ack"]'); await wait(900)
const afterRedFlag = await order()
check('2f. THE SESSION IS UNCHANGED — the one thing this branch must never do',
  JSON.stringify(afterRedFlag) === JSON.stringify(before), { before, afterRedFlag })

// --- 3. A niggle: which area, then the plan eases off ----------------------
check('3a. reopening and saying it is a niggle', await openHurts(victim) && await clickSel('[data-hurt="niggle"]'))
await wait(500)
check('3b. ...it asks whereabouts', await has('[data-testid="reason-area"]'))
const areas = await ev(`[...document.querySelectorAll('[data-area]')].map(b => b.getAttribute('data-area'))`)
// The eight the plan engine actually has joint data for — never a free-text
// box, because an area the engine cannot act on is an answer that does nothing.
check('3c. ...offering the eight areas the engine can act on', areas.length === 8, areas)
check('3d. ...including the shoulders', areas.includes('shoulders'), areas)
await shoot('hurts-area')

await clickSel('[data-area="shoulders"]'); await wait(2500)
const afterNiggle = await order()
check('3e. the sheet closes itself once it has acted', !(await has('[data-testid="remove-exercise-sheet"]')))
// WHAT CHANGED, not just that something did. A niggle substitutes the
// exercises that load the area; the session keeps its shape.
check('3f. ...and the session is still a session', Array.isArray(afterNiggle) && afterNiggle.length >= 3, afterNiggle)
// THE NON-VACUITY HALF. "Still a session" passes on a build that did nothing
// at all — which is exactly what section 2 requires of the OTHER branch, so
// the two would be indistinguishable. A niggle must visibly change the day.
check('3g. ...and it actually eased something off, rather than quietly doing nothing',
  JSON.stringify(afterNiggle) !== JSON.stringify(before), { before, afterNiggle })
// Nothing that was contraindicated for the shoulder survives. Derived from
// the app's own catalogue rather than a list written here, so it still holds
// when an exercise is retagged.
const stillUnsafe = await ev(`(() => {
  const names = [...document.querySelectorAll('[data-exercise-name]')].map(n => n.getAttribute('data-exercise-name'))
  const tags = window.__jointTags
  if (!tags) return null
  return names.filter(n => {
    const e = tags.find(x => x.name === n)
    // An exercise the catalogue does not know is not evidence either way.
    if (!e) return false
    return e.unsafeFor.includes('shoulder') && !e.indicatedFor.includes('shoulder')
  })
})()`)
check('3h. the harness publishes the catalogue\'s joint tags to check against', Array.isArray(stillUnsafe), stillUnsafe)
check('3i. ...and nothing left in the day still loads the sore shoulder',
  Array.isArray(stillUnsafe) && stillUnsafe.length === 0, stillUnsafe)

console.log(`  before: ${JSON.stringify(before)}`)
console.log(`  after : ${JSON.stringify(afterNiggle)}`)
await shoot('hurts-after-niggle')

// --- 4. THE SAME QUESTION ON THE SWAP DIALOG -------------------------------
//
// BOTH SURFACES, and "both" here means both SHEETS as well as screen-and-chat.
// Swapping and removing are different verbs with different answers, and a
// person reaching for swap because their shoulder hurts must land in the same
// triage as one reaching for remove.
const swapVictim = (await order())[0]
check('4a. a row menu opens on the swap side', (await openRowMenu(swapVictim)) === 'open')
check('4b. "Swap exercise" opens the dialog', await tap('[data-testid="swap-exercise"]') && (await wait(900), await has('[data-testid="swap-dialog"]')))
// "No replacements yet" is read off the SEARCH BOX, not the header. The first
// version of this check looked for the words "Constraint-checked
// replacements", which live in the dialog title and were there either way —
// a check that could not fail for the thing it claimed. Fixing it also fixed
// the header, which promised replacements while still asking why.
check('4c. ...and it asks why before showing any replacements',
  await has('[data-testid="reason-chips"]') && !(await has('[data-testid="swap-dialog"] input')))
const swapReasons = await ev(`[...document.querySelectorAll('[data-testid="reason-chips"] [data-reason]')].map(b => b.getAttribute('data-reason'))`)
// THE SWAP SET, which is deliberately not the remove set.
check('4d. ...offering the four a SWAP can have',
  JSON.stringify(swapReasons) === JSON.stringify(['busy', 'dislike', 'hurts', 'no_kit']), swapReasons)
await shoot('hurts-swap-reason')

// "It's busy" is still a swap, so it falls through to the list rather than
// going anywhere clever — the non-clever branch, checked so the routing is a
// decision rather than everything taking the same door.
check('4e. "it\'s busy or broken" falls through to the replacements',
  await clickSel('[data-reason="busy"]') && (await wait(700), await ev(`(document.body.innerText || '').includes('Constraint-checked replacements')`)))
await escape(); await wait(600)

// --- 5. "I haven't got the kit" asks WHICH kit -----------------------------
check('5a. reopening and saying the kit is missing',
  (await openRowMenu(swapVictim)) === 'open' && await tap('[data-testid="swap-exercise"]')
  && (await wait(900), await clickSel('[data-reason="no_kit"]')) && (await wait(500), await has('[data-testid="reason-kit"]')))
const kits = await ev(`[...document.querySelectorAll('[data-kit]')].map(b => b.getAttribute('data-kit'))`)
check('5b. ...offering the four tiers the engine builds for',
  JSON.stringify(kits) === JSON.stringify(['full_gym', 'home_gym', 'minimalist', 'bodyweight']), kits)
await shoot('hurts-kit')
const beforeKit = await order()
await clickSel('[data-kit="bodyweight"]'); await wait(2500)
const afterKit = await order()
check('5c. ...and picking one rebuilds the week around it',
  JSON.stringify(afterKit) !== JSON.stringify(beforeKit), { beforeKit, afterKit })
console.log(`  kit before: ${JSON.stringify(beforeKit)}`)
console.log(`  kit after : ${JSON.stringify(afterKit)}`)

const err = await ev('window.__err ?? null')
check('6. no uncaught error on the page', err === null, err)

console.log(failures === 0 ? '\nPain is asked about, and the worrying kind never touches the plan.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)

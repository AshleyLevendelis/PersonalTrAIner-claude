// ---------------------------------------------------------------------------
// TOOLS 2a, ON A REAL SCREEN (design handoff 2a, 31 Oct 2026, her "build, keep
// my rulings"). What only a browser can say:
//
//   1. At rest there is no round card (her 14 Sep ruling) — a TIMERS card with
//      three tiles, the week line above the title, and set rest explained.
//   2. Each tile opens ITS timer in one tap; there is no chooser in between,
//      and back returns to the tab.
//   3. The plate card's chips are each side of a 20 kg bar, heaviest first, and
//      follow the stepper instantly; the ends are clamped; the row opens the
//      full calculator on the weight shown.
//   4. A running round takes the timers card's place, glowing in its phase,
//      says why the stopwatch and lap are not offered, and its protocol name
//      opens the round's settings.
//   5. Once there is a last round, the card names it from the preset table and
//      reruns it with the countdown its button states.
//   6. Plan and Shop rows carry live numbers and go somewhere.
//
// Every check runs every time (null-safe subjects), so a broken feature FAILS
// rather than printing fewer checks.
// ---------------------------------------------------------------------------
import { boot } from './session-driver-lib.mjs'

const { ev, check, finish, load, tapExpr, q, wait, until, shoot, J, escape } = await boot({ debugPort: 9733, passed: 'Tools 2a holds on a real screen.' })

const text = sel => ev(`(${q(sel)})?.innerText?.replace(/\\s+/g, ' ').trim() ?? null`)
const count = sel => ev(`document.querySelectorAll(${J(sel)}).length`)
const visible = sel => ev(`(() => { const n = ${q(sel)}; if (!n) return false; const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 })()`)

console.log('\n1. At rest: a timers card, no round card\n')
await load('', { tab: 'tools' })
await until(`!!${q('[data-timers-card]')}`, 8000)
const eyebrow = await text('[data-tools-eyebrow]')
check('1a. the week line sits over the title ("Week N of M · BN")', /^WEEK \d+ OF \d+ · B\d+$/i.test(eyebrow ?? ''), eyebrow)
check('1b. the timers card is there', await visible('[data-timers-card]'))
check('1c. ...holding exactly the three timers', JSON.stringify(await ev(`[...document.querySelectorAll('[data-timers-card] [data-timer-choice]')].map(b => b.getAttribute('data-timer-choice'))`)) === '["round","stopwatch","lap"]')
check('1d. no round card at rest (her 14 Sep ruling)', (await count('[data-round-card]')) === 0)
check('1e. set rest is explained, not offered', /Set rest runs in your session/.test((await text('[data-timers-card]')) ?? ''))
check('1f. no last round is claimed before one was chosen', (await count('[data-last-round]')) === 0)
const tiles = await ev(`[...document.querySelectorAll('[data-timer-choice]')].map(b => { const r = b.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width) } })`)
check('1g. every tile is a 44px+ target, 88 tall', tiles.length === 3 && tiles.every(t => t.h >= 88 && t.w >= 44), tiles)
check('1h. the tour stop is on the timers card', await ev(`!!document.querySelector('[data-tour="toolstimer"] [data-timers-card]')`))
check('1i. the page does not scroll sideways', await ev('document.documentElement.scrollWidth <= window.innerWidth'))
await shoot('tools-2a-idle')

console.log('\n2. Each tile opens its own timer, directly\n')
for (const [mode, title] of [['stopwatch', 'Stopwatch'], ['lap', 'Lap timer']]) {
  await tapExpr(q(`[data-timer-choice="${mode}"]`))
  await wait(500)
  const heading = await ev(`document.querySelector('[role="dialog"] [data-slot="dialog-title"], [role="dialog"] h2')?.innerText?.trim() ?? null`)
  check(`2. ${mode}: one tap opens "${title}"`, heading === title, heading)
  check(`...with no chooser step in between`, (await count('[data-testid="timer-choices"]')) === 0)
  await tapExpr(q('[aria-label="Back to the timer list"]'))
  await wait(500)
  check(`...and back returns to the tab`, (await count('[role="dialog"]')) === 0 && (await visible('[data-timers-card]')))
}
await tapExpr(q('[data-timer-choice="round"]'))
await until(`!!${q('[data-round-sheet]')}`, 4000)
check('2c. round: one tap opens the round timer sheet', await visible('[data-round-sheet]'))

console.log('\n3. The plate card\n')
await escape()
await wait(400)
const plate = async () => ev(`(() => {
  const kg = Number(document.querySelector('[data-plate-kg]')?.textContent ?? NaN)
  const chips = [...document.querySelectorAll('[data-plate-chip]')].map(n => Number(n.getAttribute('data-plate-chip')))
  const bare = /Bar only/.test(document.querySelector('[data-plate-chips]')?.innerText ?? '')
  return { kg, chips, bare }
})()`)
const greedy = kg => { let side = Math.floor(((kg - 20) / 2) / 1.25 + 1e-9) * 1.25; const out = []; for (const p of [25, 20, 15, 10, 5, 2.5, 1.25]) while (side >= p - 1e-9) { side -= p; out.push(p) } return out }
const p0 = await plate()
check('3a. the card shows a weight', Number.isFinite(p0.kg) && p0.kg >= 20 && p0.kg <= 300, p0)
check('3b. ...and each side of a 20 kg bar, heaviest first', JSON.stringify(p0.chips) === JSON.stringify(greedy(p0.kg)), { p0, want: greedy(p0.kg) })
const lift = await text('[data-plate-lift]')
check('3c. the subtitle says the step', /± 2\.5 kg$/.test(lift ?? ''), lift)
await tapExpr(q('[data-plate-step="up"]'))
const p1 = await plate()
check('3d. + adds 2.5 kg', Math.abs(p1.kg - Math.min(300, p0.kg + 2.5)) < 1e-9, { before: p0.kg, after: p1.kg })
check('3e. ...and the plates follow it at once', JSON.stringify(p1.chips) === JSON.stringify(greedy(p1.kg)), p1)
await shoot('tools-2a-plate')
for (let i = 0; i < 130; i++) { if (await ev(`!!document.querySelector('[data-plate-step="down"]')?.disabled`)) break; await ev(`document.querySelector('[data-plate-step="down"]')?.click()`) }
await wait(200)
const pMin = await plate()
check('3f. − stops at the empty bar', pMin.kg === 20 && (await ev(`!!document.querySelector('[data-plate-step="down"]')?.disabled`)), pMin)
check('3g. ...which reads "Bar only"', pMin.bare && pMin.chips.length === 0, pMin)
for (let i = 0; i < 4; i++) await ev(`document.querySelector('[data-plate-step="up"]')?.click()`)
await wait(200)
const p30 = await plate()
check('3h. 30 kg is a 5 on each side', p30.kg === 30 && JSON.stringify(p30.chips) === '[5]', p30)
await tapExpr(q('[data-plate-open="plates"]'))
await wait(600)
const target = await ev(`document.querySelector('[role="dialog"] input[type="number"]')?.value ?? null`)
check('3i. the row opens the full calculator on the weight shown', target === '30', target)
await escape()
await wait(400)
const chipInk = await ev(`[...document.querySelectorAll('[data-plate-chip]')].map(n => getComputedStyle(n).color)`)
check('3j. plate ink is dark (white fails 4.5:1 on red and blue)', chipInk.length > 0 && chipInk.every(c => c === 'rgb(21, 18, 43)'), chipInk)

console.log('\n4. A running round takes the timers card\'s place\n')
await tapExpr(q('[data-timer-choice="round"]'))
await until(`!!${q('[data-round-sheet-start]')}`, 4000)
await tapExpr(q('[data-round-sheet-start]'))
await until(`!!${q('[data-round-card]')}`, 4000)
await wait(600)
check('4a. the running round is the hero', await visible('[data-tour="toolstimer"] [data-round-card][data-round-card-hero]'))
check('4b. ...the three tiles step aside', (await count('[data-timer-choice="stopwatch"], [data-timer-choice="lap"]')) === 0)
check('4c. ...and the card says why', /Stopwatch and lap open once this round ends or is reset\./.test((await text('[data-round-card-note]')) ?? ''))
const clockPx = await ev(`parseFloat(getComputedStyle(document.querySelector('[data-round-card-clock]')).fontSize)`)
check('4d. the clock is the 56px hero clock', clockPx === 56, clockPx)
// Into the WORK phase (after the countdown), where the edge must be the main colour.
for (let i = 0; i < 70 && !(await ev(`!!document.querySelector('[data-round-card][data-round-phase="work"]')`)); i++) await wait(250)
const edge = await ev(`(() => {
  const c = document.querySelector('[data-round-card]'); if (!c) return null
  const probe = document.createElement('span'); probe.style.color = 'var(--primary)'; document.body.appendChild(probe)
  const primary = getComputedStyle(probe).color; probe.remove()
  return { border: getComputedStyle(c).borderTopColor, primary, phase: c.getAttribute('data-round-phase') }
})()`)
check('4e. at work the card is edged in the main colour', !!edge && edge.phase === 'work' && edge.border === edge.primary, edge)
const liveName = await text('[data-round-card-protocol]')
await shoot('tools-2a-live')
await tapExpr(q('[data-round-card-protocol]'))
await until(`!!${q('[data-round-sheet]')}`, 4000)
check('4f. its protocol name opens the round\'s settings', await visible('[data-round-sheet]'))
await escape()
await wait(400)
// FULL SCREEN FROM THE HERO, and back. The plate card's lift is worked out by a
// hook; a hook below the full-screen early return crashes the whole tab here.
await tapExpr(q('[data-round-card-fullscreen]'))
await wait(600)
const flooded = await ev(`({ field: !!document.querySelector('[aria-label^="Leave full screen"]'), crashed: /Something went wrong/.test(document.body.innerText) })`)
check('4g. Full screen floods the tab, and nothing breaks', flooded.field && !flooded.crashed, flooded)
await ev(`document.querySelector('[aria-label^="Leave full screen"]')?.click()`)
await wait(600)
check('4h. ...and leaving it brings the hero back', await visible('[data-tour="toolstimer"] [data-round-card-hero]'))
await ev(`[...document.querySelectorAll('[data-round-card] button')].find(b => b.textContent.trim() === 'Reset')?.click()`)
await until(`!!${q('[data-timers-card]')}`, 4000)

console.log('\n5. The last round, named and rerun\n')
const lastName = await text('[data-last-round-name]')
check('5a. reset gives the tab back, with the last round on it', await visible('[data-last-round]'))
check('5b. ...named as the running card named it', !!lastName && lastName === liveName, { lastName, liveName })
const startText = await text('[data-last-round-start]')
check('5c. ...and its Start says the countdown it will run', /^Start · \d+s countdown$|^Start now$/.test(startText ?? ''), startText)
await shoot('tools-2a-idle-last')
await tapExpr(q('[data-last-round-start]'))
await until(`!!${q('[data-round-card]')}`, 4000)
check('5d. ...which starts it', await visible('[data-round-card]'))
await ev(`[...document.querySelectorAll('[data-round-card] button')].find(b => b.textContent.trim() === 'Reset')?.click()`)
await until(`!!${q('[data-timers-card]')}`, 4000)

console.log('\n6. Plan and Shop\n')
const program = await text('[data-testid="program-row"]')
check('6a. "Your program" carries the plan\'s own line', /^Your program /.test(program ?? '') && !/16 weeks · block 1 of 4/.test(program ?? ''), program)
check('6b. ...and a progress bar', await ev(`!!document.querySelector('[data-testid="program-row"] .rounded-full .rounded-full')`))
const history = await text('[data-testid="history-row"]')
check('6c. "Session history" counts sessions and PRs', /Session history (\d+ sessions? logged \d+ PRs?|Everything you have logged)/.test(history ?? ''), history)
const grocery = await text('[data-testid="grocery-row"]')
check('6d. "Grocery list" counts items', /Grocery list (\d+ items? · \d+ checked|This week’s shopping)/.test(grocery ?? ''), grocery)
const rowH = await ev(`[...document.querySelectorAll('[data-testid$="-row"]')].map(b => Math.round(b.getBoundingClientRect().height))`)
check('6e. the rows are 64px', rowH.length === 3 && rowH.every(h => h >= 64), rowH)
await tapExpr(q('[data-testid="grocery-row"]'))
await wait(400)
check('6f. the grocery row opens the list', /grocery/.test(await ev('location.hash')), await ev('location.hash'))

finish()

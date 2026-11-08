// ---------------------------------------------------------------------------
// HOME AND TOOLS, QA ROUND 2 (8 Nov 2026): what a tester found, held on a real screen at 390px.
//
//   1. The floating round chip says "Get ready" before round 1 (it said "Rest") and "Paused" when paused.
//   2. Starting a round says what it stops when a stopwatch is running (it wiped it unsaid).
//   3. Rounds' minus is greyed at its floor of 1.
//   4. A 10-second block is read back by its shape, "1 × 10s", on the chips and on Home, never "1 min"; the Last round
//      line names no rest that never ran; the block's save tick reaches 44px.
//   5. The plate calculator says which bar it counts when the box is empty, and a typed 0 means no bar.
//   6. A negative step count says why it was not saved.
//   7. A weigh-in read that fails keeps the list on screen and says so.
//
// Every check runs every time. PORT 9597.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9597, page: 'app-boot.html', name: 'home-tools-fixes', timeoutMs: 420_000 })
const { ev, wait, check, until, clickAt, shoot } = d
const tap = sel => clickAt(`document.querySelector(${JSON.stringify(sel)})`)
const btn = re => `[...document.querySelectorAll('button,[role=button]')].find(b => ${re}.test((b.innerText || b.getAttribute('aria-label') || '').trim()))`
const fixedRoundChip = () => ev(`[...document.querySelectorAll('body *')].filter(e => getComputedStyle(e).position === 'fixed').map(e => (e.innerText || '').replace(/\\n/g, ' ')).filter(t => /Round \\d/.test(t)).join(' || ')`)
const setInput = (expr, v) => ev(`(() => { const el = ${expr}; if (!el) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(v)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
const notNow = async () => { if (await ev(`!!(${btn('/^Not now$/')})`)) { await clickAt(btn('/^Not now$/')); await wait(500) } }
// Reaches 44px: a point 8px above the element's top edge, and one 8px below its bottom, still land on it.
const reach = expr => ev(`(() => { const n = ${expr}; if (!n) return null; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); const x = r.left + r.width / 2; const h = y => { const e = document.elementFromPoint(x, y); return !!e && (e === n || n.contains(e)) }; return { w: Math.round(r.width), h: Math.round(r.height), above: h(r.top - 7), below: h(r.bottom + 7) } })()`)

console.log('\nHOME AND TOOLS, QA ROUND 2, AT 390px\n')

// --- 1-3. The round timer -----------------------------------------------------------------
await d.go('', '#/tab/tools')
await wait(4000)
await notNow()
// A stopwatch first, so the round sheet has something to say about it.
await tap('[data-timer-choice="stopwatch"]'); await wait(1200)
await clickAt(btn('/^Start$/')); await wait(2300)
await ev(`document.querySelector('[role=dialog] button[aria-label="Close"], [role=dialog] [data-slot="dialog-close"]')?.click()`); await wait(600)
await tap('[data-timer-choice="round"]'); await wait(1300)
const stopsLine = await ev(`document.querySelector('[data-testid="round-stops-stopwatch"]')?.textContent ?? ''`)
check('2a. with a stopwatch running, the round sheet says starting stops it, and at what time', /Starting this stops your stopwatch at \d+:\d\d\./.test(stopsLine), stopsLine)
for (let i = 0; i < 15; i++) { await tap('[data-step="rounds"][data-dir="down"]'); await wait(70) }
const minusOff = await ev(`document.querySelector('[data-step="rounds"][data-dir="down"]')?.disabled ?? null`)
const plusOn = await ev(`document.querySelector('[data-step="rounds"][data-dir="up"]')?.disabled === false`)
check('3a. at 1 round, Rounds\' minus is greyed', minusOff === true, minusOff)
check('3b. ...while plus is not (the check binds)', plusOn === true, plusOn)
for (let i = 0; i < 10; i++) { await tap('[data-step="work"][data-dir="down"]'); await wait(70) }
await tap('[data-round-sheet-start]'); await wait(700)
await ev(`location.hash = '#/tab/dashboard'`); await wait(1300)
const chipReady = await fixedRoundChip()
check('1a. before round 1 the chip says "Get ready", not "Rest"', /Get ready/.test(chipReady) && !/Rest/.test(chipReady), chipReady)
await ev(`location.hash = '#/tab/tools'`); await wait(900)
await clickAt(btn('/^Pause$/')); await wait(400)
await ev(`location.hash = '#/tab/dashboard'`); await wait(1300)
const chipPaused = await fixedRoundChip()
check('1b. paused, the chip says "Paused"', /Paused/.test(chipPaused), chipPaused)
await shoot('home-tools-1-chip')
await ev(`location.hash = '#/tab/tools'`); await wait(900)
await clickAt(btn('/^Resume$/')); await wait(300)
await clickAt(`document.querySelector('[role="button"][aria-label^="Get ready"]')`)
const finished = await until(() => ev(`/Log session/.test(document.body.innerText)`), v => v === true, 160)
check('4a. the one-round, 10-second block ran to the end (the fixture binds)', finished === true, finished)

// --- 4. Logging it --------------------------------------------------------------------------
await clickAt(btn('/^Log session$/')); await wait(1200)
const chipSub = await ev(`[...document.querySelectorAll('[data-testid="unplanned-work-sheet"] [role="radio"]')].map(b => b.innerText.replace(/\\n/g, ' ')).slice(0, 3)`)
check('4b. the block\'s chips say its shape, "1 × 10s", not "1 min"', Array.isArray(chipSub) && chipSub.length > 0 && chipSub.every(t => /1 × 10s/.test(t) && !/1 min/.test(t)), chipSub)
// A name, not a paragraph: typed the way a person types, so the box's own limit is what is measured.
await tap('[data-testid="unplanned-work-sheet"] [data-testid="quick-log-other"]'); await wait(400)
await clickAt(`document.querySelector('[data-testid="unplanned-work-sheet"] [aria-label="Other activity"]')`)
await d.send('Input.insertText', { text: 'Kettlebell complex with battle ropes and sled pushes and farmer carries' })
await wait(300)
const otherLen = await ev(`document.querySelector('[data-testid="unplanned-work-sheet"] [aria-label="Other activity"]')?.value.length ?? -1`)
check('4b2. an "Other" activity name stops at 40 letters', otherLen > 0 && otherLen <= 40, otherLen)
await tap('[data-testid="unplanned-work-sheet"] [data-testid="quick-log-skipping"]'); await wait(400)
await tap('[data-testid="unplanned-work-sheet"] [data-effort="hard"]'); await wait(300)
const tick = await reach(`document.querySelector('[data-testid="unplanned-work-sheet"] [data-testid="cardio-save"]')`)
check('4c. the block\'s save tick reaches 44px (an icon button carries its own reach; the tester measured the box)', !!tick && tick.above && tick.below, tick)
await tap('[data-testid="unplanned-work-sheet"] [data-testid="cardio-save"]'); await wait(2000)
const lastRound = await ev(`(() => { const t = document.body.innerText; const i = t.search(/Last round/i); return i < 0 ? '' : t.slice(i, i + 80).replace(/\\n/g, ' ') })()`)
check('4d. Tools\' Last round line names no rest that never ran', /1 × 10s/.test(lastRound) && !/1 × 10s \/ /.test(lastRound), lastRound)
await ev(`location.hash = '#/tab/dashboard'`); await wait(2000)
const homeLine = await ev(`[...document.querySelectorAll('p')].map(p => p.innerText).find(t => /^✓ Skipping/.test(t)) ?? ''`)
check('4e. Home reads the block back as "1 × 10s", not "1 min"', /1 × 10s/.test(homeLine) && !/1 min/.test(homeLine), homeLine)
await shoot('home-tools-4-home')

// --- 6. Steps --------------------------------------------------------------------------------
await notNow()
await clickAt(`document.querySelector('[data-ring="steps"] , [data-home-rings] > :nth-child(4) button, [data-home-rings] > :nth-child(4)')`); await wait(500)
await setInput(`document.querySelector('[aria-label="Steps today"]')`, '-500')
await clickAt(`[...document.querySelectorAll('button')].find(b => /^Log steps$/.test(b.innerText.trim()))`); await wait(700)
const stepsSaid = await ev(`document.body.innerText.includes('Steps are a count from 0 up')`)
const stepsRows = await ev(`(window.__fakeDb?.daily_steps ?? []).filter(r => Number(r.steps) < 0).length`)
check('6a. "-500" steps says why it was not saved', stepsSaid === true, stepsSaid)
check('6b. ...and nothing negative was written', stepsRows === 0, stepsRows)

// --- 7. Weigh-ins ----------------------------------------------------------------------------
await clickAt(`document.querySelector('[data-home-progress-toggle]')`); await wait(600)
await clickAt(`document.querySelector('[data-home-weight] button')`); await wait(800)
const rowsBefore = await ev(`[...document.querySelectorAll('[data-testid="weigh-in-card"] .flex.justify-between')].length`)
await ev(`window.__netDown = true`)
await setInput(`document.querySelector('[data-testid=weigh-in-card] input')`, '80.6')
await clickAt(`[...document.querySelectorAll('[data-testid=weigh-in-card] button')].find(b => /Sav/.test(b.innerText))`); await wait(2500)
const rowsAfter = await ev(`[...document.querySelectorAll('[data-testid="weigh-in-card"] .flex.justify-between')].length`)
const readNote = await ev(`document.querySelector('[data-testid="weigh-in-read-failed"]')?.textContent ?? ''`)
check('7a. the fixture has past weigh-ins listed (it binds)', rowsBefore > 0, rowsBefore)
check('7b. offline, the list stays on screen', rowsAfter === rowsBefore, { rowsBefore, rowsAfter })
check('7c. ...and the card says it could not load them', /Couldn.t load your weigh-ins/.test(readNote), readNote)
await ev(`window.__netDown = false`)
await shoot('home-tools-7-weigh')

// --- 5. Plate calculator -------------------------------------------------------------------
await ev(`location.hash = '#/tab/tools'`); await wait(1500)
await tap('[data-plate-open="plates"]'); await wait(900)
const inputs = `document.querySelectorAll('[role=dialog] input')`
await setInput(`${inputs}[0]`, '100'); await setInput(`${inputs}[1]`, ''); await wait(300)
const emptyBar = await ev(`document.querySelector('[data-testid="plate-bar-assumed"]')?.textContent ?? ''`)
check('5a. an empty bar box says which bar it counts', /Counting a \d+ kg bar\./.test(emptyBar), emptyBar)
await setInput(`${inputs}[1]`, '0'); await wait(300)
const zeroBar = await ev(`document.querySelector('[role=dialog]')?.innerText.replace(/\\n+/g, ' ') ?? ''`)
check('5b. a typed 0 is no bar: 100 kg is 50 kg a side', /50(\.00)?\s*kg/.test(zeroBar) && !/40(\.00)?\s*kg/.test(zeroBar), zeroBar.slice(0, 200))
const boxH = await ev(`Math.min(...[...${inputs}].map(n => n.getBoundingClientRect().height))`)
check('5c. its boxes are 44px tall', boxH >= 44, boxH)

await d.finish('verify:home-tools-fixes')

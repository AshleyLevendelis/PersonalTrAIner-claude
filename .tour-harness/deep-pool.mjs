// ---------------------------------------------------------------------------
// verify:deep-pool — A MEAL WITH DOZENS OF DISHES, ON A PHONE (9 Nov 2026, his "much deeper pool").
//
// The harness page with ?daymove=1&regen=1&deep=1 gives each meal every library dish this profile's checks accept (up to forty),
// each fitted and verified by the app's own functions. Drives the Nutrition tab at 390px: the day still opens, the
// swap list opens short with a search over everything and "Show all N", a search finds and a miss says so, and a
// dish found by search is swapped in.
// Reads the real MealPlan and NutritionDisplay on the harness page (real.tsx). App.tsx is not booted, so App's own
// rotation is not proven here; serveDates and the menu are (test:meal-menu).
// ---------------------------------------------------------------------------
import { boot } from './session-driver-lib.mjs'

const d = await boot({ debugPort: 9811, passed: 'Deep pool: every check passed.' })
const { ev, check, finish, load, until, wait, shoot, tapExpr, q, typeText } = d

console.log('\nA. A deep pool opens the day')
const t0 = Date.now()
// daymove=1&regen=1: the page hands the Nutrition tab the app's own meal actions, so a swap is SAVED (week=1 swaps
// nothing); deep=1 makes the pool the deep one in that mode too.
await load('daymove=1&regen=1&deep=1', { tab: 'nutrition' })
const rowUp = await until(`!!document.querySelector('[data-meal-row][data-variant="upnext"] [data-meal-name]')`, 30000)
const openMs = Date.now() - t0
check('1. the Nutrition tab draws today\'s meals from a pool of dozens a meal', !!rowUp, openMs)
const rows = await ev(`document.querySelectorAll('[data-meal-row] [data-meal-name]').length`)
check('2. every meal of the day is on screen (four)', rows === 4, rows)
await shoot('deep-pool-day')

console.log('\nB. The swap list: short, searchable, everything reachable')
await tapExpr(q('[data-meal-row][data-variant="upnext"] [data-meal-name]'))
await until(`!!document.querySelector('[data-meal-sheet-tab="swap"]')`, 8000)
await tapExpr(q('[data-meal-sheet-tab="swap"]'))
await until(`!!document.querySelector('[data-meal-swap-list]')`, 8000)
const label = await ev(`document.querySelector('[data-meal-sheet-tab="swap"]')?.innerText.trim() ?? ''`)
const total = Number(/Swap · (\d+)/.exec(label)?.[1] ?? 0)
check('3. the Swap tab counts every other dish in the meal (dozens, not seven)', total >= 20, label)
const listRows = () => ev(`[...document.querySelectorAll('[data-meal-swap-list] > button')].filter(b => !b.hasAttribute('data-meal-swap-show-all')).map(b => b.innerText.replace(/\\s+/g, ' ').trim())`)
const first = await listRows()
check('4. the list opens short: eight dishes, not all of them', first.length === 8, first.length)
const search = await ev(`(() => { const s = document.querySelector('[data-meal-swap-search]'); if (!s) return null; const r = s.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width), ph: s.placeholder } })()`)
check('5. a search box over all of them, saying how many, 44px tall', !!search && search.h >= 44 && search.ph === `Search all ${total} options`, search)
const showAll = await ev(`document.querySelector('[data-meal-swap-show-all]')?.innerText.trim() ?? null`)
check('6. and a "Show all N options" button with the same count', showAll === `Show all ${total} options`, showAll)
await shoot('deep-pool-swap-short')

await tapExpr(q('[data-meal-swap-show-all]'))
const all = await listRows()
check('7. "Show all" lists every one, and the button goes', all.length === total && !(await ev(`!!document.querySelector('[data-meal-swap-show-all]')`)), { rows: all.length, total })

console.log('\nC. Search')
await tapExpr(q('[data-meal-swap-search]'))
// A word every pool of this size has many of, measured from the list itself rather than assumed.
const word = await ev(`(() => { const names = [...document.querySelectorAll('[data-meal-swap-list] > button')].map(b => b.querySelector('p')?.innerText.toLowerCase() ?? ''); for (const w of ['chicken', 'egg', 'salmon', 'tofu', 'rice', 'yoghurt']) { const n = names.filter(x => x.includes(w)).length; if (n >= 2 && n < names.length) return w } return null })()`)
await typeText(word ?? 'chicken')
const found = await listRows()
check(`8. typing "${word}" lists only dishes with it in the name, and some`, !!word && found.length >= 2 && found.length < total && found.every(r => r.toLowerCase().includes(word)), { word, found: found.length, total })
await shoot('deep-pool-swap-search')
const pick = await ev(`[...document.querySelectorAll('[data-meal-swap-list] > button:not([disabled])')].map(b => b.querySelector('p')?.innerText.trim()).find(Boolean) ?? null`)
for (let i = 0; i < 20; i++) await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }).then(() => send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }))
await typeText('zzqx')
const none = await ev(`(() => { const n = document.querySelector('[data-meal-swap-none]'); if (!n) return null; const r = n.getBoundingClientRect(); return { text: n.innerText.trim(), inView: r.top >= 0 && r.bottom <= innerHeight } })()`)
check('9. a search that matches nothing says so, on screen', !!none && /No option matches "zzqx"/.test(none.text) && none.inView, none)

console.log('\nD. A dish found by search is swapped in')
for (let i = 0; i < 6; i++) await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }).then(() => send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }))
await typeText((pick ?? '').slice(0, 12))
const target = await ev(`[...document.querySelectorAll('[data-meal-swap-list] > button')].find(b => b.querySelector('p')?.innerText.trim() === ${JSON.stringify(pick)}) ? true : false`)
check('10. searching the start of a dish\'s name finds it', !!pick && target, pick)
await tapExpr(`[...document.querySelectorAll('[data-meal-swap-list] > button')].find(b => b.querySelector('p')?.innerText.trim() === ${JSON.stringify(pick)})`)
const swapped = await until(`[...document.querySelectorAll('[data-meal-row] [data-meal-name]')].some(e => e.innerText.trim() === ${JSON.stringify(pick)})`, 8000)
check('11. tapping it puts it on today\'s plan', !!swapped, pick)
await shoot('deep-pool-swapped')

async function send(m, p) { return d.send(m, p) }
finish()

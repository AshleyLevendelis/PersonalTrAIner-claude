// verify:profile-back — THE PHONE'S BACK CLOSES PROFILE, AND A SHEET OVER IT, ONE A PRESS.
//
// The Profile walk of 18 Nov 2026 (finding P3): with Profile open, the phone's Back went to the tab before or left
// the app, because Profile and its sheets are drawn over the app and had no step in the phone's history.
// scripts/test-back-closes.ts walks every order against a fake history; this is the real Profile, the browser's own
// history and its own Back (history.back(), which is what the button and the edge swipe do).
//
// The page is the Profile test page: it holds the real ProfileScreen, opened by the page's own button. It has no
// tabs, so "the app moves" is a change of the address's #part, which is how every move in the app is made.
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9970, page: 'profile.html', name: 'profile-back', timeoutMs: 200_000 })
const { ev, check, wait, go, until, shoot, finish } = d

await go('')
await until(() => ev(`!!document.querySelector('[data-profile-row="Schedule"]')`), v => v === true, 120)
await wait(600)
// This page keeps no record of errors of its own, so the driver listens: a Back that threw must fail the run.
await ev(`(() => { window.__err = null; window.addEventListener('error', e => { window.__err = String(e.message) }); window.addEventListener('unhandledrejection', e => { window.__err = String(e.reason) }) })()`)

const rows = () => ev(`!!document.querySelector('[data-profile-row="Schedule"]')`)
const sheet = () => ev(`!!document.querySelector('[data-profile-sheet]')`)
const hash = () => ev(`location.hash`)
const back = async () => { await ev(`history.back()`); await wait(700) }
const openRow = async label => { await ev(`document.querySelector('[data-profile-row=${JSON.stringify(label)}]')?.click()`); await until(sheet, v => v === true, 30); await wait(300) }
const openProfile = async () => { await ev(`document.querySelector('[data-testid="open-profile"]')?.click()`); await until(rows, v => v === true, 30); await wait(300) }
const arrow = () => ev(`(() => { const b = document.querySelector('[data-profile-back]'); if (!b) return false; b.click(); return true })()`)

console.log('\n  1. BACK CLOSES THE SHEET, THEN PROFILE')
const hash0 = await hash()
check('1a. Profile is open on its page of rows', (await rows()) === true && (await sheet()) === false)
await openRow('Schedule')
check('1b. a sheet is open over it', (await sheet()) === true)
await shoot('profile-back-1-sheet')
await back()
check('1c. BACK CLOSES THE SHEET (it left Profile altogether, or the app)', (await sheet()) === false)
check('1d. ...and Profile is still open, on its rows', (await rows()) === true)
await back()
check('1e. the next Back closes Profile', (await rows()) === false && (await ev(`!!document.querySelector('[data-testid="open-profile"]')`)) === true)
check('1f. ...and the address has not moved', (await hash()) === hash0, { hash0, now: await hash() })
check('1g. ...with no uncaught error', (await ev('window.__err ?? null')) === null, await ev('window.__err ?? null'))

console.log('\n  2. CLOSED BY ITS OWN ARROW, THEN SENT SOMEWHERE: THE MOVE IS NOT UNDONE')
await openProfile()
// One tap that closes Profile and moves the app, as "Open the list" does.
await ev(`(() => { document.querySelector('[data-profile-back]')?.click(); location.hash = '#/moved' })()`)
await wait(1200)
check('2a. Profile closed and the app moved', (await rows()) === false && (await hash()) === '#/moved', await hash())
await wait(800)
check('2b. ...AND IT STAYS MOVED (a back fired at the close would have landed after the move)', (await hash()) === '#/moved', await hash())
await back()
check('2c. one Back returns to where he was, Profile still closed', (await hash()) === hash0 && (await rows()) === false, { now: await hash(), hash0 })

console.log('\n  3. THE ARROW AND BACK TOGETHER; AND THE STEPS DO NOT PILE UP')
// He is somewhere with a place behind it, so a Back that does nothing can be told from one that works.
await ev(`location.hash = '#/a'`); await wait(500)
await openProfile()
await openRow('Schedule')
check('3a. the sheet\'s own arrow closes the sheet', (await arrow()) === true && (await until(sheet, v => v === false, 20)) === false && (await rows()) === true)
await back()
check('3b. then ONE Back closes Profile', (await rows()) === false && (await hash()) === '#/a', await hash())
await back()
check('3b2. ...and the NEXT Back goes back, in one press (it was a press that did nothing)', (await hash()) === hash0, { now: await hash(), hash0 })
const len0 = await ev(`history.length`)
for (let i = 0; i < 4; i++) { await openProfile(); await arrow(); await until(rows, v => v === false, 20); await wait(200) }
const len1 = await ev(`history.length`)
check('3c. opened and closed four times by the arrow: at most one step is left behind', len1 - len0 <= 1, { len0, len1 })
await openProfile()
await back()
check('3d. and Back still closes Profile after all that', (await rows()) === false)
check('3e. no uncaught error', (await ev('window.__err ?? null')) === null, await ev('window.__err ?? null'))

await finish('The phone\'s Back closes the sheet, then Profile, and a close that moves the app stays moved.')

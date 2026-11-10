// ---------------------------------------------------------------------------
// verify:gym-offline — A WHOLE WORKOUT WITH NO SIGNAL (Ashley, 10 Nov 2026).
//
// "Something went wrong on this screen", mid-workout, in a gym with no Wi-Fi; then: "gyms often don't have WiFi and
// I noticed it's not possible to log a workout without Internet. We should be able to do as much as possible in the
// app without network."
//
// Three things were wrong, and this drives each on the real Exercise screen at 390px:
//
//  [1] A PART OF THE APP NEVER OPENED BEFORE DID NOT EXIST OFFLINE. Its file downloads on first use; with no signal
//      the app reloaded itself and then showed the whole-app error screen. Now the part says, in its own place, that
//      it is not on the phone yet, the screen around it keeps working, and it loads itself when the signal is back.
//  [2] ...AND IT SHOULD BE ON THE PHONE ALREADY. The app's real service worker (public/sw.js) saves every file the
//      build lists, in the background. With the server GONE, a part never opened still opens.
//  [3] A SESSION TRAINED OFFLINE READ AS NOT TRAINED. The card said 18 of 18 while the week said 0 sets and 0
//      sessions; and after the signal came back the finish was never sent while the app stayed open.
//
// "No signal" here is the server taken away (driver-kit `network(false)`), so the page AND the worker lose it, plus
// the fake database refusing (`__netDown`) and the browser's own offline flag, which is what the phone reports.
//
// WHAT THIS DOES NOT PROVE: opening the app cold with no signal. The worker's shell is /index.html and this harness
// has none; that half was measured once on the real build (43 of 43 files held, an offline reload drew the app) and
// is held in source by test:offline-ready.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const { ev, shoot, check, until, wait, go, clickAt, finish, network, send } = await startDriver({ port: 9887, page: 'real.html', name: 'gym-offline', timeoutMs: 420_000 })

const text = () => ev(`document.body.innerText`)
const crashed = async () => /Something went wrong on this screen/.test(await text())
const byText = re => `[...document.querySelectorAll('button,[role=button]')].find(b => ${re}.test((b.textContent || '').trim()))`
const setOffline = async off => {
  network(!off)
  await send('Network.emulateNetworkConditions', { offline: off, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  await ev(`(() => { window.__netDown = ${off}; window.dispatchEvent(new Event(${off ? "'offline'" : "'online'"})) })()`)
}
await send('Network.enable')

// ---------------------------------------------------------------------------------------------------------------
console.log('\n[1] A part that is not on the phone says so, and the screen carries on')
await go('&tour=off', '#/exercise/program')
await until(() => ev(`/FULL PROGRAM/i.test(document.body.innerText)`), v => v === true, 60)
await ev(`(() => { try { localStorage.removeItem('program-view') } catch {} ; window.__sameLoad = 'yes' })()`)
check('the program is up, as a list', (await ev(`!!document.querySelector('[data-testid="program-view-toggle"]')`)) === true)
await setOffline(true)
await clickAt(`[...document.querySelectorAll('[data-testid="program-view-toggle"] button')].find(b => /Calendar/.test(b.textContent))`)
const note = await until(() => ev(`document.querySelector('[data-testid="part-not-loaded"]')?.innerText ?? null`), v => v != null, 40)
await shoot('gym-offline-part-missing')
check('the calendar, never opened before, says it is not on the phone yet', /isn't saved on your phone yet, so it needs a connection/.test(note ?? ''), note)
check('...and that what is logged is still being saved', /Everything you log is still being saved/.test(note ?? ''), note)
check('...NOT the whole-app error screen', (await crashed()) === false)
check('...and the page did not reload itself', (await ev(`window.__sameLoad`)) === 'yes')
check('...with the rest of the screen still there', /FULL PROGRAM/i.test(await text()))
const noteBox = await ev(`(() => { const r = document.querySelector('[data-testid="part-not-loaded"]')?.getBoundingClientRect(); return r ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: innerWidth, h: innerHeight } : null })()`)
check('...on screen at 390px, where the tap was', !!noteBox && noteBox.left >= 0 && noteBox.right <= noteBox.w + 1 && noteBox.top >= 0 && noteBox.bottom <= noteBox.h, noteBox)
const tryBtn = await ev(`(() => { const b = [...document.querySelectorAll('[data-testid="part-not-loaded"] button')].find(x => /Try again/.test(x.textContent)); const r = b?.getBoundingClientRect(); return r ? Math.round(r.height) : null })()`)
check('...with a Try again button big enough to tap (44px)', tryBtn != null && tryBtn >= 44, tryBtn)
await setOffline(false)
// THE SIGNAL IS BACK. Chrome keeps a file's failed fetch for as long as the page lives, so a second ask of the same
// page cannot get it: the notice now says to try again, and the tap loads the page afresh (her choice, never the
// app's own doing mid-workout). The calendar was her last view, so that is what comes back.
const backOnline = await until(() => ev(`document.querySelector('[data-testid="part-not-loaded"]')?.getAttribute('data-online') ?? (document.querySelector('[data-testid="program-calendar"]') ? 'loaded' : null)`), v => v === 'true' || v === 'loaded', 40)
check('the signal comes back: the notice stops saying the phone has no connection, or the calendar is simply there', backOnline === 'true' || backOnline === 'loaded', backOnline)
check('...and nothing reloaded by itself', (await ev(`window.__sameLoad`)) === 'yes')
if (backOnline === 'true') await clickAt(`[...document.querySelectorAll('[data-testid="part-not-loaded"] button')].find(x => /Try again/.test(x.textContent))`)
const cal = await until(() => ev(`!!document.querySelector('[data-testid="program-calendar"]')`), v => v === true, 80)
check('Try again brings the calendar', cal === true)
check('...and the notice is gone', (await ev(`!!document.querySelector('[data-testid="part-not-loaded"]')`)) === false)

// A SHEET, which has no place in the page: its notice floats, and OK tells the screen the sheet is shut. "Feeling
// tight?" is fetched on its first tap (the add, swap and remove sheets come with the screen and need no help).
await go('&tour=off', '#/tab/exercise')
await until(() => ev(`!!(${byText('/^Feeling tight\\?$/')})`), v => v === true, 60)
await wait(1200)
await setOffline(true)
await clickAt(byText('/^Feeling tight\\?$/'))
const sheetNote = await until(() => ev(`document.querySelector('[data-testid="part-not-loaded"]')?.innerText ?? null`), v => v != null, 40)
await shoot('gym-offline-sheet-missing')
check('a sheet never opened before says the same, floating over the screen', /isn't saved on your phone yet/.test(sheetNote ?? '') && (await crashed()) === false, sheetNote)
check('...above the tab bar, inside the screen', await ev(`(() => { const r = document.querySelector('[data-testid="part-not-loaded"]')?.getBoundingClientRect(); return !!r && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth + 1 })()`) === true)
await clickAt(`[...document.querySelectorAll('[data-testid="part-not-loaded"] button')].find(x => /^OK$/.test(x.textContent.trim()))`)
await wait(400)
check('...OK puts it away', (await ev(`!!document.querySelector('[data-testid="part-not-loaded"]')`)) === false)
await clickAt(byText('/^Feeling tight\\?$/'))
check('...and asking again says so again, not nothing', (await until(() => ev(`!!document.querySelector('[data-testid="part-not-loaded"]')`), v => v === true, 20)) === true)
await setOffline(false)

// ---------------------------------------------------------------------------------------------------------------
console.log('\n[2] The whole app is saved to the phone in the background')
await ev(`(() => { try { localStorage.removeItem('program-view') } catch {} })()`)
await go('&tour=off', '#/exercise/program')
await until(() => ev(`/FULL PROGRAM/i.test(document.body.innerText)`), v => v === true, 60)
const listed = await ev(`fetch('/asset-manifest.json').then(r => r.json()).then(j => j.files)`)
check('the build lists its own files', Array.isArray(listed) && listed.length > 20 && listed.every(f => /^\/assets\/.+\.(js|css)$/.test(f)), (listed ?? []).length)
// What the app does in main.tsx on every open: register the worker, and ask it to save everything once idle.
await ev(`navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready).then(reg => { reg.active.postMessage('warm-assets'); return true })`)
const held = await until(() => ev(`(async files => { const c = await caches.open('assets-v1'); let n = 0; for (const f of files) if (await c.match(f)) n++; return n })(${JSON.stringify(listed ?? [])})`), v => v === (listed ?? []).length, 120)
check(`every one of them is held on the phone (${held} of ${(listed ?? []).length})`, (listed ?? []).length > 0 && held === (listed ?? []).length, { held, listed: (listed ?? []).length })
const calendarFile = (listed ?? []).find(f => /ProgramCalendar/.test(f))
check('...the calendar among them, though this load never opened it', !!calendarFile && (await ev(`!!document.querySelector('[data-testid="program-calendar"]')`)) === false, calendarFile)
check('the worker now answers for this page', (await until(() => ev(`!!navigator.serviceWorker.controller`), v => v === true, 40)) === true)
// An older version's file is cleared, or the phone keeps a whole app per release for ever.
await ev(`caches.open('assets-v1').then(c => c.put('/assets/Old-deadbeef.js', new Response('x', { headers: { 'content-type': 'text/javascript' } }))).then(() => navigator.serviceWorker.ready).then(reg => { reg.active.postMessage('warm-assets'); return true })`)
const oldGone = await until(() => ev(`caches.open('assets-v1').then(c => c.match('/assets/Old-deadbeef.js')).then(r => !r)`), v => v === true, 60)
check('a file from a version no longer listed is cleared', oldGone === true)
await setOffline(true)
await clickAt(`[...document.querySelectorAll('[data-testid="program-view-toggle"] button')].find(b => /Calendar/.test(b.textContent))`)
const calOffline = await until(() => ev(`!!document.querySelector('[data-testid="program-calendar"]')`), v => v === true, 60)
await shoot('gym-offline-calendar-from-phone')
check('WITH THE SERVER GONE the calendar opens, from the phone', calOffline === true && (await crashed()) === false)
check('...with no "not on your phone" notice', (await ev(`!!document.querySelector('[data-testid="part-not-loaded"]')`)) === false)
await setOffline(false)
// Back to a page with no worker, so [3] is about the workout and nothing else.
await ev(`navigator.serviceWorker.getRegistrations().then(rs => Promise.all(rs.map(r => r.unregister()))).then(() => caches.keys()).then(ks => Promise.all(ks.map(k => caches.delete(k)))).then(() => true)`)

// ---------------------------------------------------------------------------------------------------------------
console.log('\n[3] A whole session with no signal: logged, counted, finished, and sent when the signal is back')
await go('&tour=off', '#/tab/exercise')
await until(() => ev(`!!(${byText('/Start session/')})`), v => v === true, 80)
await wait(1500)
const planned = Number(await ev(`(document.body.innerText.match(/(\\d+) working sets/) || [])[1] ?? 0`))
const weekBefore = await ev(`(document.body.innerText.match(/(\\d+) of (\\d+) sessions · (\\d+)\\/(\\d+) sets/) || []).slice(1).map(Number)`)
check('the fixture is a session day with nothing logged', planned >= 6 && Array.isArray(weekBefore) && weekBefore[0] === 0 && weekBefore[2] === 0, { planned, weekBefore })
// What the server already holds for other days (the fixture's history): the sets below are counted over it.
const serverBefore = await ev(`(window.__fakeDb ?? {}).exercise_set_logs?.filter(r => !r.is_warmup).length ?? -1`)
await setOffline(true)
await clickAt(byText('/Start session/'))
await until(() => ev(`!!document.querySelector('[data-next-set-button]')`), v => v === true, 40)
let taps = 0
for (let i = 0; i < 80; i++) {
  if (!(await ev(`!!document.querySelector('[data-next-set-button]')`))) break
  const label = (await ev(`document.querySelector('[data-next-set-button]')?.textContent ?? ''`)).trim()
  if (/type the/.test(label)) {
    // A set with no weight to take: type one, as she would.
    await ev(`(() => { const box = [...document.querySelectorAll('input[id^="setgrid-weight-"]')].find(i => !i.disabled && !i.value); if (!box) return; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(box, '10'); box.dispatchEvent(new Event('input', { bubbles: true })) })()`)
    await wait(250)
    continue
  }
  await clickAt(`document.querySelector('[data-next-set-button]')`); taps++
  await wait(300)
  if (await ev(`!!(${byText('/^Skip/')})`)) { await clickAt(byText('/^Skip/')); await wait(120) }
}
await wait(1200)
const mid = await text()
await shoot('gym-offline-logged')
check('every set of the session was logged with no signal', taps >= planned, { taps, planned })
check('...and none of it crashed', (await crashed()) === false)
const waiting = Number((mid.match(/(\d+) sets? waiting to send/) || [])[1] ?? 0)
check('the app says they are waiting to send', waiting >= planned, { waiting, planned })
check('the card counts them', new RegExp(`${planned} of ${planned} working sets`).test(mid), (mid.match(/\d+ of \d+ working sets/) || [])[0])
const weekMid = await until(() => ev(`(document.body.innerText.match(/(\\d+) of (\\d+) sessions · (\\d+)\\/(\\d+) sets/) || []).slice(1).map(Number)`), v => Array.isArray(v) && v[2] === planned, 30)
check('...AND SO DOES THE WEEK, before a single one has been sent', Array.isArray(weekMid) && weekMid[2] === planned, weekMid)
check('nothing has reached the server yet (the fixture really is offline)', serverBefore >= 0 && (await ev(`(window.__fakeDb ?? {}).exercise_set_logs?.filter(r => !r.is_warmup).length ?? -1`)) === serverBefore, serverBefore)

await clickAt(byText('/^Finish session$/'))
await wait(2000)
if (await ev(`!!document.querySelector('[role="dialog"]')`)) { await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await wait(500) }
const done = await until(() => text(), v => /✓ (Done|Session finished)/.test(v), 30)
await shoot('gym-offline-finished')
check('Finish works with no signal: the day reads as done', /✓ (Done|Session finished)/.test(done), (done.match(/✓ [^\n]*/) || [])[0])
check('...never "Done · 0 of N sets" over a session fully logged', !/Done · 0 of \d+ sets/.test(done), (done.match(/✓ [^\n]*/) || [])[0])
const weekDone = await until(() => ev(`(document.body.innerText.match(/(\\d+) of (\\d+) sessions · (\\d+)\\/(\\d+) sets/) || []).slice(1).map(Number)`), v => Array.isArray(v) && v[0] === 1, 30)
check('...and the week counts the session, 1 done', Array.isArray(weekDone) && weekDone[0] === 1 && weekDone[2] === planned, weekDone)

// THE SIGNAL COMES BACK, and nobody touches the phone.
await ev(`window.__sameLoad = 'still'`)
await setOffline(false)
const sent = await until(() => ev(`(window.__fakeDb ?? {}).exercise_set_logs?.filter(r => !r.is_warmup).length ?? -1`), v => v >= serverBefore + taps, 160)
// One row a tap: the working sets and the prep move's sets (which are logged, and are not "working sets").
check('every set reaches the server by itself', sent === serverBefore + taps, { sent, serverBefore, taps })
const closed = await until(() => ev(`JSON.stringify((window.__fakeDb ?? {}).workout_sessions?.map(s => ({ done: s.is_completed, at: !!s.finished_at })) ?? null)`), v => /"done":true/.test(v ?? ''), 160)
check('...AND SO DOES THE FINISH, with the app left open (it used to wait for the next time the app was opened)', closed === '[{"done":true,"at":true}]', closed)
check('...as ONE session for the day, not two', (await ev(`(window.__fakeDb ?? {}).workout_sessions?.length ?? -1`)) === 1)
check('...without a reload', (await ev(`window.__sameLoad`)) === 'still')
const after = await until(() => text(), v => !/waiting to send/.test(v), 60)
check('nothing is left waiting to send', !/waiting to send/.test(after), (after.match(/[^\n]*waiting to send[^\n]*/) || [])[0])
await clickAt(byText('/View summary/'))
await wait(900)
const summary = await ev(`document.querySelector('[role="dialog"]')?.innerText ?? ''`)
await shoot('gym-offline-summary')
check('the summary opens and no longer says the finish has not synced', summary.length > 20 && !/hasn't synced yet/.test(summary), summary.slice(0, 200))
const weekAfter = await ev(`(document.body.innerText.match(/(\\d+) of (\\d+) sessions · (\\d+)\\/(\\d+) sets/) || []).slice(1).map(Number)`)
check('the week still says 1 session and every set, now from the server', Array.isArray(weekAfter) && weekAfter[0] === 1 && weekAfter[2] === planned, weekAfter)

await finish('A workout with no signal: logged, counted, finished, sent; a part not on the phone says so and never takes the screen.')

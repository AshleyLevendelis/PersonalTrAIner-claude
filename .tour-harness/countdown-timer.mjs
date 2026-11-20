// ---------------------------------------------------------------------------
// HIS TWO TIMER REQUESTS OF 20 NOV 2026, on the whole app at 390px.
//   R. "Round timer needs the rounds to be more easily visible from a distance when the phone is down": on the full-
//      screen round field the round number is drawn as big as the clock, with the total beside it.
//   C. "Add a normal timer that you can set for a set amount of time": a fourth timer tile, minutes as chips or typed,
//      a big clock, pause that holds, zero that says so, the dock chip, and a reload that keeps the time.
// Every check runs every time with a null-safe subject. PORT 9978.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9978, page: 'app-boot.html', name: 'countdown-timer' })
const { ev, check, until, wait, go, clickAt, shoot, finish } = d
const btn = re => `[...document.querySelectorAll('button')].find(b => ${re}.test((b.textContent || '').trim()))`
const px = sel => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); return n ? parseFloat(getComputedStyle(n).fontSize) : 0 })()`)
const txt = sel => ev(`document.querySelector(${JSON.stringify(sel)})?.textContent?.trim() ?? null`)
const secs = s => { const m = /^(\d+):(\d\d)$/.exec(s ?? ''); return m ? Number(m[1]) * 60 + Number(m[2]) : -1 }

await go('')
check('0. the app is up', (await until(() => ev(`!!document.querySelector('[data-testid="home-so-far"]')`), v => v === true, 120)) === true)
await wait(1500)
if (await ev(`!!(${btn('/^Not now$/')})`)) { await clickAt(btn('/^Not now$/')); await wait(500) }

// --- R. the round, readable from the floor ------------------------------------------------------------------------
await ev(`location.hash = '#/tab/tools'`); await wait(1800)
await clickAt(`document.querySelector('[data-timer-choice="round"]')`); await wait(800)
await clickAt(`[...document.querySelectorAll('button')].filter(b => /^Start/.test((b.textContent || '').trim())).pop()`); await wait(1200)
await clickAt(btn('/^Full screen$/')); await wait(800)
// Tap the field to skip the get-ready countdown, so round 1 is running.
await clickAt(`document.querySelector('[role="button"][aria-label^="Get ready"]')`); await wait(1500)
const roundNow = await txt('[data-round-now]')
const roundPx = await px('[data-round-now]')
const roundText = await txt('[data-round-big]')
check('R1. while a round runs, its number is on the field', roundNow === '1', { roundNow, roundText })
check('R2. ...drawn at least 80px tall (it was a 12px label)', roundPx >= 80, roundPx)
check('R3. ...with the total beside it', /of \d+/.test(roundText ?? ''), roundText)
const fits = await ev(`(() => { const n = document.querySelector('[data-round-big]'); const c = [...document.querySelectorAll('span')].find(s => /^\\d+:\\d\\d$/.test(s.textContent.trim()) && parseFloat(getComputedStyle(s).fontSize) > 90); if (!n || !c) return null; const a = n.getBoundingClientRect(), b = c.getBoundingClientRect(); return { overlap: a.bottom > b.top, right: Math.round(a.right), clockTop: Math.round(b.top), bigBottom: Math.round(a.bottom) } })()`)
check('R4. ...and it does not run into the clock or off the screen', fits && !fits.overlap && fits.right <= 390, fits)
await shoot('countdown-timer-round')
await clickAt(btn('/^Reset$/')); await wait(800)

// --- C. the countdown -----------------------------------------------------------------------------------------------
await ev(`location.hash = '#/tab/home'`); await wait(500)
await ev(`location.hash = '#/tab/tools'`); await wait(1500)
const tiles = await ev(`[...document.querySelectorAll('[data-timer-choice]')].map(b => b.getAttribute('data-timer-choice'))`)
check('C1. Tools offers a fourth timer, the countdown', Array.isArray(tiles) && tiles.includes('countdown') && tiles.length === 4, tiles)
await clickAt(`document.querySelector('[data-timer-choice="countdown"]')`); await wait(900)
check('C2. it opens on minute chips', (await ev(`document.querySelectorAll('[data-countdown-chip]').length`)) >= 6)
await ev(`(() => { const set = (id, v) => { const i = document.getElementById(id); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })) }; set('countdown-minutes', '0'); set('countdown-seconds', '4') })()`)
await wait(300)
check('C3. a typed time names itself on Start', /Start 0:04/.test((await txt('[data-countdown-start]')) ?? ''), await txt('[data-countdown-start]'))
await clickAt(`document.querySelector('[data-countdown-start]')`); await wait(700)
const c1 = await txt('[data-countdown-clock]')
check('C4. it runs, counting down from the time set', secs(c1) >= 2 && secs(c1) <= 4, c1)
check('C5. the clock is big enough to read from the floor (64px or more)', (await px('[data-countdown-clock]')) >= 64, await px('[data-countdown-clock]'))
await shoot('countdown-timer-running')
await until(() => ev(`document.querySelector('[data-countdown]')?.getAttribute('data-countdown')`), v => v === 'done', 40)
check('C6. at zero it says so', (await ev(`document.querySelector('[data-countdown]')?.getAttribute('data-countdown')`)) === 'done' && /Time.s up/.test(await ev('document.body.innerText')))
// THE FINISHED TIMER STOPS: the saved record says not running, so the screen is let sleep and the dock stops ticking.
await wait(600)
const stored = await ev(`(() => { const k = Object.keys(localStorage).find(k => k.startsWith('fitplan_timers_v1:')); if (!k) return null; const r = JSON.parse(localStorage.getItem(k)); return { mode: r.mode, running: r.running } })()`)
check('C6b. ...and the timer has stopped, so the screen can sleep again', stored?.mode === 'countdown' && stored?.running === false, stored)
check('C7. ...and offers the same time again', /Again · 0:04/.test((await txt('[data-countdown-again]')) ?? ''), await txt('[data-countdown-again]'))
await shoot('countdown-timer-done')

// Pause holds.
await clickAt(`document.querySelector('[data-countdown-reset]')`); await wait(500)
await clickAt(`document.querySelector('[data-countdown-chip="1"]')`); await wait(1300)
await clickAt(btn('/^Pause$/')); await wait(400)
const p1 = await txt('[data-countdown-clock]'); await wait(1600)
const p2 = await txt('[data-countdown-clock]')
check('C8. a paused timer holds its time', p1 != null && p1 === p2 && secs(p1) < 60 && secs(p1) >= 55, { p1, p2 })
await clickAt(btn('/^Resume$/')); await wait(1300)
const r1 = await txt('[data-countdown-clock]')
check('C9. ...and Resume carries on from there', secs(r1) < secs(p1) && secs(r1) >= secs(p1) - 3, { p1, r1 })

// The dock chip, with the sheet closed.
await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await wait(800)
await ev(`location.hash = '#/tab/home'`); await wait(1200)
const dock = await ev(`[...document.querySelectorAll('button')].map(b => b.textContent.trim()).find(t => /^Timer · /.test(t)) ?? null`)
check('C10. off Tools, the dock shows the time left', /^Timer · \d+:\d\d/.test(dock ?? ''), dock)

// A reload keeps the time.
const before = secs(/\d+:\d\d/.exec(dock ?? '')?.[0])
await go(''); await wait(2500)
const dock2 = await until(() => ev(`[...document.querySelectorAll('button')].map(b => b.textContent.trim()).find(t => /^Timer · /.test(t)) ?? null`), v => !!v, 60)
const after = secs(/\d+:\d\d/.exec(dock2 ?? '')?.[0])
check('C11. a reload keeps the countdown running from the same time', after > 0 && after < before && after >= before - 10, { dock, dock2 })

await finish('verify:countdown-timer PASSED')

// ---------------------------------------------------------------------------
// THE WATCH APP, THE PHONE'S HALF, ON THE WHOLE APP AT 390px (27 Nov 2026; his vision: "On a weight workout see 'next
// exercise 3x10 bench press @100kg' then start rest from watch, start next set"; docs/plans/watch-app.md).
// app-boot.html boots App.tsx in the pretend phone app; the watch's link is a pretend one (window.__watchBridgeForTest)
// that records what the phone sends and hands over what the "watch" sent.
//   1. today's session is sent to the watch from the rows Exercise draws: the same names, in order, the same weight
//      the row prints;
//   2. sets ticked on the watch are saved by the rows' own ticks: the session counts them, at the row's weight, and
//      the watch is sent the new count;
//   3. a set the list cannot place is said, with Dismiss, never guessed;
//   4. the watch's heart rate shows live beside the gear.
// WHAT THIS DOES NOT PROVE: anything on a watch, or the Bluetooth link itself (his phone and watch only).
// PORT 9677.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9677, page: 'app-boot.html', name: 'watch-sets' })
const { send, ev, check, until, wait, go, clickAt, shoot, finish } = d
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__watchPublished = []
  window.__watchInbox = []
  window.__watchBridgeForTest = {
    publishToday: async json => { window.__watchPublished.push(json) },
    drain: async () => { const e = window.__watchInbox; window.__watchInbox = []; return e },
    onWaiting: async cb => { window.__watchWake = cb; return () => {} },
    status: async () => ({ connected: true, name: 'Galaxy Watch7' }),
  }
` })
const btn = re => `[...document.querySelectorAll('button')].find(b => ${re}.test((b.textContent || '').trim()))`
const lastSent = () => ev(`(() => { const p = window.__watchPublished; return p.length ? JSON.parse(p[p.length - 1]) : null })()`)
const heroSets = () => ev(`(() => { const m = document.querySelector('[data-testid="hero-sets"]')?.textContent?.match(/(\\d+) of (\\d+) sets/); return m ? +m[1] : null })()`)

await go('&session-day=1&health=android')
check('0. the app is up', (await until(() => ev(`!!document.querySelector('[data-testid="home-so-far"]')`), v => v === true, 120)) === true)
await wait(1500)
if (await ev(`!!(${btn('/^Not now$/')})`)) { await clickAt(btn('/^Not now$/')); await wait(500) }
await ev(`location.hash = '#/tab/exercise'`); await wait(2500)
await clickAt(`document.querySelector('[data-testid="hero-start"]')`); await wait(1200)

console.log('\n  1. TODAY, SENT TO THE WATCH')
const sent = await until(lastSent, v => !!v, 40)
const rowNames = await ev(`[...document.querySelectorAll('[data-today-exercises] [data-exercise-name]')].map(r => r.dataset.exerciseName)`)
check('1a. the phone sends today\'s session to the watch', !!sent && typeof sent.date === 'string' && Array.isArray(sent.exercises), sent)
check('1b. the same exercises, in the order Exercise draws them', JSON.stringify(sent?.exercises?.map(x => x.name)) === JSON.stringify(rowNames), { sent: sent?.exercises?.map(x => x.name), rows: rowNames })
check('1c. the session\'s name as the card names it', !!sent?.title && (await ev(`document.body.innerText`)).includes(sent.title.split(' ')[0]), sent?.title)
const target = sent?.exercises?.find(x => /^\d+(\.\d+)? kg/.test(x.load) && x.done === 0 && x.sets >= 2) ?? null
check('1d. a loaded lift is sent as "sets × reps @ N kg" figures', !!target, sent?.exercises)
check('1e. with its rest', (target?.restSeconds ?? 0) > 0, target)
// The row's own figure: open it and read what its first tick would save.
const rowSel = `[...document.querySelectorAll('[data-today-exercises] [data-exercise-name]')].find(r => r.dataset.exerciseName === ${JSON.stringify(target?.name ?? '')})`
const rowWeight = await (async () => {
  if (!(await ev(`!!${rowSel}?.querySelector('[data-set-tick]')`))) { await clickAt(`${rowSel}?.querySelector('[role="button"]')`); await wait(900) }
  const w = await ev(`${rowSel}?.querySelector('[data-set-tick="open"][data-next-set="Set 1"]')?.dataset.nextWeight ?? null`)
  await clickAt(`${rowSel}?.querySelector('[role="button"]')`); await wait(700) // closed again, so the watch has to open it
  return w
})()
check('1f. THE WEIGHT THE WATCH SHOWS IS THE ONE THE ROW WOULD SAVE', !!target && rowWeight != null && parseFloat(target.load) === parseFloat(rowWeight), { watch: target?.load, row: rowWeight })
await shoot('watch-sets-sent')

console.log('\n  2. SETS TICKED ON THE WATCH')
const before = await heroSets()
const now = Date.now()
await ev(`(() => { window.__watchInbox = ${JSON.stringify([
  { id: 'hr1', type: 'hr', samples: [[now - 2000, 128], [now - 1000, 131], [now, 133]] },
  { id: 'w1', type: 'set', date: sent?.date, exerciseId: target?.id, name: target?.name, setNumber: 1, at: now },
  { id: 'w2', type: 'set', date: sent?.date, exerciseId: target?.id, name: target?.name, setNumber: 2, at: now + 1 },
  { id: 'w3', type: 'set', date: sent?.date, exerciseId: 'nope', name: 'Not On The Plan', setNumber: 1, at: now + 2 },
])}; window.__watchWake && window.__watchWake() })()`)
const heart = await until(() => ev(`document.querySelector('[data-live-heart-corner]')?.getAttribute('data-live-heart') ?? null`), v => v === '133', 20)
check('2a. the watch\'s heart rate shows live beside the gear', heart === '133', heart)
const after = await until(heroSets, v => v === (before ?? 0) + 2, 40)
check('2b. both sets are saved: the session counts two more', before != null && after === before + 2, { before, after })
const ticks = await ev(`(() => { const r = ${rowSel}; return r ? [...r.querySelectorAll('[data-set-tick="saved"]')].map(t => t.getAttribute('aria-label')) : null })()`)
check('2c. by the row\'s own ticks: Set 1 and Set 2 of that lift', Array.isArray(ticks) && ticks.some(l => /^Set 1\b/.test(l)) && ticks.some(l => /^Set 2\b/.test(l)), ticks)
const rows = await ev(`(window.__fakeDb?.exercise_set_logs ?? []).filter(r => r.exercise_name === ${JSON.stringify(target?.name ?? '')} && !r.is_warmup).map(r => ({ n: r.set_number, kg: r.weight_kg }))`)
const local = await ev(`(() => { try { return JSON.stringify(Object.entries(localStorage).filter(([k]) => /set/i.test(k)).map(([, v]) => v)).includes(${JSON.stringify(target?.name ?? '')}) } catch { return false } })()`)
check('2d. saved at the weight the row prints (the phone\'s number, never the watch\'s)', rows.length === 2 && rows.every(r => Math.abs(r.kg - parseFloat(rowWeight)) < 0.01), { rows, rowWeight, local })
const resent = await until(lastSent, v => v?.exercises?.find(x => x.name === target?.name)?.done === 2, 30)
check('2e. the watch is sent the new count', resent?.exercises?.find(x => x.name === target?.name)?.done === 2)
await shoot('watch-sets-saved')

console.log('\n  3. A SET THE LIST CANNOT PLACE')
const said = await until(() => ev(`document.querySelector('[data-testid="watch-sets-waiting"]')?.innerText ?? null`), v => !!v, 20)
check('3a. said, never guessed', /From your watch: set 1 of Not On The Plan isn.t on today.s list\./.test(said ?? ''), said)
check('3b. only that one: the two saved sets are not listed', !!said && !!target && !said.includes(target.name))
await clickAt(`[...document.querySelectorAll('[data-testid="watch-sets-waiting"] button')].find(b => /Dismiss/.test(b.textContent))`)
await wait(600)
check('3c. Dismiss takes it away', !!said && (await ev(`!document.querySelector('[data-testid="watch-sets-waiting"]')`)) === true)
check('3d. and no more sets were saved by it', after != null && (await heroSets()) === after)

await finish('verify:watch-sets PASSED')

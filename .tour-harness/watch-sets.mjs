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
//   4. the watch's heart rate shows live beside the gear;
//   5. (his "Adjust reps and weight", 27 Nov 2026) a set done differently on the watch is saved with HIS reps and
//      weight, through the row's own boxes; and "Undo set N" on the watch deletes that set from the list.
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
check('1h. the week ahead rides with today: later dates only, each with its exercises', Array.isArray(sent?.days) && sent.days.length > 0 && sent.days.every(d => d.date > sent.date && d.exercises.length > 0), sent?.days?.map(d => [d.date, d.exercises.length]))
check('1g. ...sent as a number to step, with the implement\'s notch', !!target && target.kg === parseFloat(rowWeight) && target.step > 0, target)
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
// THE WATCH IS TOLD WHERE THE PHONE IS (his gym report 27 Nov 2026: "the watch and phone disagree"): the lift and the
// reps of the phone's own Log set button ride with the session, so both name the same set.
const withNow = await until(lastSent, v => !!v?.now?.id, 30)
const dock = await ev(`[...document.querySelectorAll('button')].map(b => b.innerText.replace(/\\s+/g, ' ')).find(t => /^Log set \\d/.test(t)) ?? ''`)
const nowEx = withNow?.exercises?.find(x => x.id === withNow?.now?.id) ?? null
const dockReps = Number((/× (\d+)$/.exec(dock) ?? [])[1])
check('2f. the watch is sent the phone\'s next set: the lift its Log set button names, and its reps', !!nowEx && !!dock
  && dock.toLowerCase().includes(nowEx.name.split(' ').slice(-1)[0].toLowerCase().replace(/s$/, '')) && (withNow.now.reps === undefined ? !dockReps : withNow.now.reps === dockReps), { now: withNow?.now, name: nowEx?.name, dock })
await shoot('watch-sets-saved')

console.log('\n  3. A SET THE LIST CANNOT PLACE')
const said = await until(() => ev(`document.querySelector('[data-testid="watch-sets-waiting"]')?.innerText ?? null`), v => !!v, 20)
check('3a. said, never guessed', /From your watch: set 1 of Not On The Plan isn.t on today.s list\./.test(said ?? ''), said)
check('3b. only that one: the two saved sets are not listed', !!said && !!target && !said.includes(target.name))
await clickAt(`[...document.querySelectorAll('[data-testid="watch-sets-waiting"] button')].find(b => /Dismiss/.test(b.textContent))`)
await wait(600)
check('3c. Dismiss takes it away', !!said && (await ev(`!document.querySelector('[data-testid="watch-sets-waiting"]')`)) === true)
check('3d. and no more sets were saved by it', after != null && (await heroSets()) === after)

console.log('\n  4. A SET DONE DIFFERENTLY ON THE WATCH (his "Adjust reps and weight")')
const lighter = Math.max(0, parseFloat(rowWeight) - (target?.step ?? 2.5))
const before4 = await heroSets()
await ev(`(() => { window.__watchInbox = ${JSON.stringify([
  { id: 'w4', type: 'set', date: sent?.date, exerciseId: target?.id, name: target?.name, setNumber: 3, reps: 7, kg: 'LIGHTER', at: now + 10 },
]).replace('"LIGHTER"', String(lighter))}; window.__watchWake && window.__watchWake() })()`)
const after4 = await until(heroSets, v => v === (before4 ?? 0) + 1, 40)
const set3 = await until(() => ev(`(window.__fakeDb?.exercise_set_logs ?? []).filter(r => r.exercise_name === ${JSON.stringify(target?.name ?? '')} && !r.is_warmup && r.set_number === 3).map(r => ({ reps: r.reps_completed, kg: r.weight_kg }))[0] ?? null`), v => !!v, 30)
check('4a. the set is saved', before4 != null && after4 === before4 + 1, { before4, after4 })
check('4b. WITH HIS NUMBERS: 7 reps at the lighter weight, not the plan\'s', set3?.reps === 7 && Math.abs((set3?.kg ?? -1) - lighter) < 0.01, { set3, lighter })
await shoot('watch-sets-his-numbers')

console.log('\n  5. UNDO ON THE WATCH')
await ev(`(() => { window.__watchInbox = ${JSON.stringify([
  { id: 'u3', type: 'set-undo', date: sent?.date, exerciseId: target?.id, name: target?.name, setNumber: 3, at: now + 20 },
])}; window.__watchWake && window.__watchWake() })()`)
const after5 = await until(heroSets, v => v === (after4 ?? 0) - 1, 40)
check('5a. the undone set comes off the list: the session counts one fewer', after4 != null && after5 === after4 - 1, { after4, after5 })
const gone = await until(() => ev(`(window.__fakeDb?.exercise_set_logs ?? []).some(r => r.exercise_name === ${JSON.stringify(target?.name ?? '')} && !r.is_warmup && r.set_number === 3)`), v => v === false, 20)
check('5b. ...and from the log itself', gone === false, gone)
check('5c. sets 1 and 2 are untouched', (await ev(`(window.__fakeDb?.exercise_set_logs ?? []).filter(r => r.exercise_name === ${JSON.stringify(target?.name ?? '')} && !r.is_warmup).length`)) === 2)
check('5d. nothing is left waiting or said', (await ev(`!document.querySelector('[data-testid="watch-sets-waiting"]')`)) === true)
// Logged and undone on the watch before the phone ever saw it: the two arrive together and nothing is saved.
const before6 = await heroSets()
await ev(`(() => { window.__watchInbox = ${JSON.stringify([
  { id: 'w5', type: 'set', date: sent?.date, exerciseId: target?.id, name: target?.name, setNumber: 3, reps: 5, at: now + 30 },
  { id: 'u5', type: 'set-undo', date: sent?.date, exerciseId: target?.id, name: target?.name, setNumber: 3, at: now + 31 },
])}; window.__watchWake && window.__watchWake() })()`)
await wait(3500)
check('5e. a set undone before the phone saw it is never saved, and nothing is left waiting', before6 != null && (await heroSets()) === before6 && (await ev(`JSON.parse(localStorage.getItem('fitplan_watch_sets') || '[]').length`)) === 0, { before6, now: await heroSets() })
await shoot('watch-sets-undone')

console.log('\n  6. PLANNED CARDIO GOES TO THE WATCH (27 Nov 2026)')
// The week the GENERATOR builds with two cardio days (?cardio-day); its sessions are read off the payload, never written here.
await go('&cardio-day&health=android')
await until(() => ev(`!!document.querySelector('[data-testid="home-so-far"]')`), v => v === true, 120)
await wait(1500)
if (await ev(`!!(${btn('/^Not now$/')})`)) { await clickAt(btn('/^Not now$/')); await wait(500) }
await ev(`location.hash = '#/tab/exercise'`); await wait(3000)
const sentC = await until(lastSent, v => !!v && (!!v.cardio || (v.days ?? []).some(d => d.cardio)), 40)
const cardios = [...(sentC?.cardio ? [sentC.cardio] : []), ...((sentC?.days ?? []).filter(d => d.cardio).map(d => d.cardio))]
check('6a. the planned cardio sessions of the coming days are sent to the watch', cardios.length > 0, sentC)
check('6b. ...each with its rounds (work and rest) or its minutes, and the card\'s line', cardios.length > 0 && cardios.every(c => c.minutes > 0 && (c.rounds === 0 || (c.workSeconds > 0 && c.rounds >= 2)) && typeof c.line === 'string' && c.line.length > 0), cardios)
// The phone's own card for that date names the same session: open the day on the strip and read it.
const aheadDay = (sentC?.days ?? []).find(d => d.cardio)
if (aheadDay) { await clickAt(`document.querySelector('[data-strip-date="${aheadDay.date}"]')`); await wait(1200) }
const dayText = aheadDay ? await ev(`document.body.innerText`) : ''
check('6c. ...the same session the phone shows for that date, by name', !!aheadDay && dayText.includes(aheadDay.cardio.name), { day: aheadDay?.date, name: aheadDay?.cardio?.name })
check('6d. ...and the activity it is logged under is the plan\'s, which names it', !!aheadDay && aheadDay.cardio.activity.startsWith(aheadDay.cardio.name), aheadDay?.cardio)
await shoot('watch-sets-cardio')

console.log('\n  7. SETS WAITING, SAID ON HOME (27 Nov 2026)')
await go('&session-day=1&health=android')
await until(() => ev(`!!document.querySelector('[data-testid="home-so-far"]')`), v => v === true, 120)
await wait(1500)
if (await ev(`!!(${btn('/^Not now$/')})`)) { await clickAt(btn('/^Not now$/')); await wait(500) }
// Section 1's lift, its set 3 (undone in section 5, so free): sent while he is on Home, where nothing saves it.
const last7 = sent
const lift7 = target ? { ...target, done: 2 } : null
const homeBefore = await ev(`!!document.querySelector('[data-testid="watch-sets-home"]')`)
const ev7 = { id: 'h7', type: 'set', date: last7?.date, exerciseId: lift7?.id, name: lift7?.name, setNumber: (lift7?.done ?? 0) + 1, at: now + 7 }
await ev(`(() => { window.__watchInbox = [${JSON.stringify(ev7)}]; window.__watchWake && window.__watchWake() })()`)
const homeLine = await until(() => ev(`document.querySelector('[data-testid="watch-sets-home"]')?.innerText ?? null`), v => !!v, 20)
check('7a. on Home, a set from the watch is said to be waiting (and nothing was said before)', homeBefore === false && /1 set from your watch is waiting/.test(homeLine ?? ''), { homeBefore, homeLine, lift7: lift7?.name })
await shoot('watch-sets-home-waiting')
await clickAt(`[...document.querySelectorAll('[data-testid="watch-sets-home"] button')].find(b => /Save them/.test(b.textContent))`)
const saved7 = await until(() => ev(`JSON.parse(localStorage.getItem('fitplan_watch_sets') || '[]').length`), v => v === 0, 40)
check('7b. "Save them" opens Exercise, which saves it: nothing is left waiting', saved7 === 0 && /#\/tab\/exercise/.test(await ev('location.hash')), { saved7, hash: await ev('location.hash') })

await finish('verify:watch-sets PASSED')

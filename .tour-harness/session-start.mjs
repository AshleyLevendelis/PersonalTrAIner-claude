// ---------------------------------------------------------------------------
// A SESSION STARTS THE SAME WAY WHICHEVER WAY IT STARTS — M7, M12 (cause A),
// M30 (titles), L16. 9 Oct 2026.
//
// The tester: "Session running · 0:00" never moved when the session was begun
// by ticking a set; Friday's history row read "training · 2026-10-09" beside
// "Thursday · 2026-10-08"; and "Rest complete — re…" was cut off and stayed up
// after Finish. One cause for the first two (and for every lift being called a
// record on the finish card, which what-a-pr-is.mjs holds): the Start button
// and the first ticked set each wrote their own idea of what starting means.
//
// WHAT THIS CANNOT SHOW, AND SAYS SO: the harness has one frozen clock
// (anchor.mjs), so no pill here ever counts up — on either path. What is
// checked is the thing the pill counts FROM: the dock is handed a start time
// the moment a set is ticked. scripts/test-session-start.ts holds the stamp
// itself.
// ---------------------------------------------------------------------------
import { boot } from './session-driver-lib.mjs'

const b = await boot({ debugPort: 9603, passed: 'Both ways of starting a session stamp the same facts, and the rest bar reads whole and leaves with the session.' })
const { ev, check, finish, tapExpr, q, byText, until, wait, load, tick, exerciseNames, record, shoot, ensureOpen, typeInto, rowsExpr, escape } = b

const sessionRows = () => ev(`(window.__fakeDb?.workout_sessions ?? []).map(r => ({ day: r.day ?? null, week: r.week_number ?? null, started: !!r.started_at, split: r.split_type ?? null }))`)
const dock = () => ev(`(() => { const n = ${q('[data-testid="session-running"]')}; return n ? { text: n.textContent.replace(/\\s+/g, ' ').trim(), startedAt: n.getAttribute('data-started-at') } : null })()`)
const skipRest = async () => { if (await ev(`!!${byText('Skip ▸')}`)) { await tapExpr(byText('Skip ▸')); await wait(400) } }

console.log('\nSESSION START PARITY\n')
await load('dock=1')
await until(`document.querySelectorAll('[data-exercise-name]').length > 0`, 12000)
await wait(1200)
const names = (await exerciseNames()) ?? []
let X = null
for (const n of names) { await ensureOpen(n); if ((await ev(`${rowsExpr(n)}.length`)) >= 2) { X = n; break } }
check('0. today has an exercise with at least two working sets', !!X, names)
if (!X) finish()

// ---- 1. Started by ticking a set ------------------------------------------
console.log('\n  1. STARTED BY TICKING A SET — Start workout is never pressed')
check('1a. Start workout is on offer, and is left alone', (await ev(`!!${byText('Start workout')}`)) === true)
check('1b. a set is ticked', (await tick(X, 0)) === true)
await skipRest()
await until(`!!${q('[data-testid="session-running"]')}`, 4000)
const d1 = await dock()
check('1c. the dock says a session is running', /^Session running · \d+:\d\d$/.test(d1?.text ?? ''), d1)
check('1d. ...AND KNOWS WHEN IT STARTED (the clock read 0:00 for the whole session without this)', !!d1?.startedAt && !isNaN(new Date(d1.startedAt).getTime()), d1)
const r1 = await record()
check('1e. the stored session is running, from the same moment', r1?.status === 'running' && r1?.startedAtIso === d1?.startedAt, { status: r1?.status, startedAtIso: r1?.startedAtIso })
check('1f. ...and carries a record of what each lift stood at before today', !!r1 && typeof r1.prSnapshotAtStart === 'object' && r1.prSnapshotAtStart !== null, Object.keys(r1 ?? {}))
await until(`(window.__fakeDb?.workout_sessions ?? []).length > 0`, 4000)
const rows1 = await sessionRows()
check('1g. the session row names its day and its week', rows1.length === 1 && !!rows1[0].day && rows1[0].week != null, rows1)
const dayOfSet = rows1[0]?.day

// ---- 2. Started with the button --------------------------------------------
console.log('\n  2. STARTED WITH THE BUTTON')
await load('dock=1')
await until(`!!${byText('Start workout')}`, 12000)
await wait(800)
check('2a. Start workout is tapped', await tapExpr(byText('Start workout')))
await until(`!!${q('[data-testid="session-running"]')}`, 4000)
const d2 = await dock()
check('2b. the dock knows when it started', !!d2?.startedAt && !isNaN(new Date(d2.startedAt).getTime()), d2)
await until(`(window.__fakeDb?.workout_sessions ?? []).length > 0`, 4000)
const rows2 = await sessionRows()
check('2c. THE SESSION ROW NAMES ITS DAY — it was blank on this path, which is "training · 2026-10-09" in history', rows2.length === 1 && rows2[0].day === dayOfSet && rows2[0].week != null, rows2)
check('2d. a set is ticked', (await tick(X, 0)) === true)
await skipRest()
const r2 = await record()
check('2e. the session keeps the start the button gave it', r2?.startedAtIso === d2?.startedAt, { record: r2?.startedAtIso, dock: d2?.startedAt })
const facts = r => ['status', 'startedAtIso', 'prSnapshotAtStart'].filter(k => r && r[k] != null)
check('2f. BOTH PATHS STAMPED THE SAME FACTS', facts(r1).length === 3 && facts(r1).join() === facts(r2).join(), { bySet: facts(r1), byButton: facts(r2) })
const rows2b = await sessionRows()
check('2g. still one row, still named', rows2b.length === 1 && rows2b[0].day === dayOfSet, rows2b)

// ---- 3. A typed digit is not a start ---------------------------------------
console.log('\n  3. TYPING A NUMBER IS NOT STARTING A SESSION')
await load('dock=1')
await until(`document.querySelectorAll('[data-exercise-name]').length > 0`, 12000)
await wait(800)
await ensureOpen(X)
check('3a. a weight is typed and not ticked', await typeInto(X, 0, 0, '12'))
await wait(500)
const r3 = await record()
check('3b. what was typed is kept', Object.keys(r3?.drafts ?? {}).length === 1, r3)
check('3c. ...WITHOUT OPENING A SESSION — storage said "running" from that keystroke', !!r3 && r3.status !== 'running' && !r3.startedAtIso, { status: r3?.status, startedAtIso: r3?.startedAtIso })
await load('dock=1', { keep: true })
await until(`document.querySelectorAll('[data-exercise-name]').length > 0`, 12000)
await wait(800)
check('3d. after a reload the screen still offers Start workout, not Finish', (await ev(`!!${byText('Start workout')} && !${byText('Finish session')}`)) === true)

// ---- 4. The rest bar --------------------------------------------------------
console.log('\n  4. "REST COMPLETE" READS WHOLE, AND GOES WHEN THE SESSION DOES')
check('4a. a set is ticked', (await tick(X, 0)) === true)
// A rest that ran out half a minute ago, written where the app keeps it. The
// harness clock is frozen, so no rest can run out by waiting.
await ev(`(() => {
  const k = Object.keys(localStorage).find(k => k.startsWith('fitplan_active_session_v1:'))
  const m = JSON.parse(localStorage.getItem(k))
  for (const d of Object.keys(m)) {
    const ended = new Date(new Date(m[d].lastActivityIso).getTime() - 30000).toISOString()
    m[d] = { ...m[d], restEndsAt: ended, restLabel: ${JSON.stringify(X)}, restTargetSetNumber: 2, restTotalMs: 60000 }
  }
  localStorage.setItem(k, JSON.stringify(m))
})()`)
await load('dock=1', { keep: true })
await until(`!!${byText('Start next set ▸')}`, 12000)
await wait(600)
const bar = await ev(`(() => {
  const next = ${byText('Start next set ▸')}
  const card = next?.closest('.fixed')
  if (!card) return null
  const ps = [...card.querySelectorAll('p')].map(p => ({ text: p.textContent.trim(), clipped: p.scrollWidth > p.clientWidth + 1, right: Math.round(p.getBoundingClientRect().right) }))
  const r = card.getBoundingClientRect()
  return { ps, said: ps.map(p => p.text).join(' '), right: Math.round(r.right), vw: innerWidth }
})()`)
check('4b. the bar is up', !!bar, bar)
check('4c. IT SAYS WHICH SET, in full: "Rest complete" and "Ready for set 2?"', /Rest complete/.test(bar?.said ?? '') && /ready for set 2\?/i.test(bar?.said ?? ''), bar?.said)
check('4d. ...AND NONE OF IT IS CUT OFF ("Rest complete — re…")', (bar?.ps ?? []).length > 0 && (bar?.ps ?? []).every(p => !p.clipped), bar?.ps)
check('4e. the bar fits the screen', !!bar && bar.right <= bar.vw, bar)
await shoot('session-start-rest-bar')
// A CLEAN PHONE FOR THE FINISH. The harness's server lives in the page and
// starts empty on every load, so after the reload above the phone remembers a
// session the server has never heard of — a state no real phone is in. A fresh
// load, one set, and a rest that is COUNTING DOWN when Finish is tapped.
await load('dock=1')
await until(`document.querySelectorAll('[data-exercise-name]').length > 0`, 12000)
await wait(800)
check('4f. another set is ticked, a rest is counting, and Finish session is tapped', (await tick(X, 0)) === true && (await ev(`!!${byText('Skip ▸')}`)) === true && await tapExpr(byText('Finish session')))
// Sets are still to do, so the app asks first; either way this driver finishes.
await wait(500)
if (await ev(`!!${q('[data-testid="finish-check"]')}`)) await tapExpr(q('[data-testid="finish-anyway"]'))
const closed = await until(`[...document.querySelectorAll('[role="dialog"] h2')].some(h => /^Session (complete|saved)$/.test(h.textContent))`, 8000)
check('4f2. the session is finished, with its summary', closed === true, await ev(`({ dialogs: [...document.querySelectorAll('[role="dialog"]')].map(d => d.innerText.slice(0, 160)), finish: !!${byText('Finish session')}, logged: [...document.querySelectorAll('[data-testid="working-row"][data-sync]')].length })`))
await escape()
await wait(500)
check('4g. THE REST BAR IS GONE — it stayed up over a finished session', (await ev(`!${byText('Start next set ▸')} && !${byText('Skip ▸')} && !/Rest complete/.test(document.body.innerText)`)) === true)
const r4 = await record()
check('4h. ...and is gone from storage, so a reload does not bring it back', !!r4 && r4.status === 'finished' && r4.restEndsAt == null, { status: r4?.status, restEndsAt: r4?.restEndsAt })

finish()

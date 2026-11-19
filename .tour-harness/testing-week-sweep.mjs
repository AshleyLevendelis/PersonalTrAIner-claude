// ---------------------------------------------------------------------------
// THE TESTING WEEK COUNTS HOWEVER IT WAS LOGGED (18 Nov 2026). Whole app (app-boot.html). PORT 9964.
//
// Until now only the Finish button wrote a testing-week session into the printed plan. Here last week was the testing
// week and its Thursday holds three sets, 20 kg over the printed guess, in a session nobody finished (an INPUT). The
// app must carry that into the weeks after it when the plan loads, say so on Home, and never do it twice.
//
// What this proves: App.tsx's own start runs the sweep, saves it and says it. What it cannot prove: a real database.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9964, page: 'app-boot.html', name: 'testing-week-sweep' })
const { ev, check, until, wait, go, clickAt, shoot, finish } = d
const btnText = re => `[...document.querySelectorAll('button')].find(b => ${re}.test(b.textContent.trim()))`
const up = () => until(() => ev(`!!document.querySelector('[data-testid="home-so-far"]')`), v => v === true, 120)
/** The lift's slot in every stored week of block 1: its number, its printed words and the stamp. */
const slots = () => ev(`(() => {
  const lift = window.__testingLift
  const rows = [...(window.__fakeDb?.mesocycle_weeks ?? [])].sort((a, b) => a.week_number - b.week_number)
  const block = rows[0]?.block_number
  return { lift, weeks: rows.filter(r => r.block_number === block).map(r => {
    const e = (r.days.find(x => x.day === 'Thursday')?.exercises ?? [])[lift?.index ?? -1] ?? {}
    return { n: r.week_number, deload: !!r.is_deload, testing: !!r.is_calibration_week, name: e.name ?? null, kg: e.suggested_load_kg ?? null, words: e.suggested_load ?? null, stamp: e.calibration_anchored_kg ?? null }
  }) }
})()`)
const settle = async () => { await wait(2500); if (await ev(`!!(${btnText('/^Not now$/')})`)) { await clickAt(btnText('/^Not now$/')); await wait(400) } }

// 0. THE PLAN AS IT WAS PRINTED: the same person with nothing logged.
await go('')
check('1. the app is up', (await up()) === true)
await settle()
const before = await slots()
const lift = before?.lift
const loading = (before?.weeks ?? []).filter(w => !w.testing && !w.deload)
check('2. the fixture has a loaded lift on the testing week\'s Thursday, and later weeks that hold it', !!lift && before.weeks[0]?.testing === true && loading.length >= 2 && loading.every(w => w.name === lift.name && w.kg != null), before)
const lifted = (lift?.printedKg ?? 0) + 20
check('3. as printed, no later week reaches what he is about to have lifted (so there is something to carry)', loading.every(w => w.kg < lifted), { lifted, kgs: loading.map(w => w.kg) })
check('4. with nothing logged, nothing is stamped and Home says nothing about week 2', before.weeks.every(w => w.stamp == null) && !(await ev(`/Week 2 now starts/.test(document.body.innerText)`)), before.weeks.map(w => w.stamp))

// 1. EVIDENCE ALREADY USED, READ FROM THE SERVER'S PLAN. Those sets wrote the plan once before and the weight was
// brought down since (the stamp is on the SERVER's week 1; the copy this phone kept from the load above has none), and
// every answer is slow, as on a phone. The app must wait for the server's plan before it decides anything: deciding on
// the kept copy would raise the weight again and save it over the server's.
await go('&slow=300&testing-day-unfinished&testing-day-used')
check('5. the app is up', (await up()) === true)
// Nothing marks a decision that changed nothing, so this waits well past every slow answer before reading.
await settle(); await wait(9000)
const used = await slots()
const usedLoading = used.weeks.filter(w => !w.testing && !w.deload)
check('6. sets already used once do not raise a weight that was lowered afterwards', usedLoading.length === loading.length && usedLoading.every((w, i) => w.kg === loading[i].kg), { printed: loading.map(w => w.kg), now: usedLoading.map(w => w.kg) })
check('7. ...and Home does not announce a change that did not happen', !(await ev(`/Week 2 now starts/.test(document.body.innerText)`)))

// 2. THE SAME PERSON, WITH THE UNFINISHED THURSDAY AND NOTHING USED YET. The copy this phone kept now carries the stamp
// from the load above; the server's plan does not. Again the server's plan is the one that counts.
await go('&testing-day-unfinished')
check('8. the app is up', (await up()) === true)
const moved = await until(async () => { const s = await slots(); return s?.weeks.find(w => !w.testing && !w.deload)?.kg ?? null }, v => v != null && v > loading[0].kg, 60)
await settle()
const after = await slots()
const afterLoading = after.weeks.filter(w => !w.testing && !w.deload)
check('9. the saved plan\'s later loading weeks now read what he lifted, without Finish ever being tapped', moved !== false && afterLoading.length === loading.length && afterLoading.every(w => w.kg === lifted),
  { lifted, before: loading.map(w => w.kg), after: afterLoading.map(w => w.kg) })
check('10. ...and the words on the row carry the same number', afterLoading.every(w => typeof w.words === 'string' && w.words.includes(String(lifted))), afterLoading.map(w => w.words))
const dl = after.weeks.find(w => w.deload)
check('11. the recovery week is lighter than the weeks before it', !dl || (dl.kg != null && dl.kg < lifted), dl)
check('12. the testing week still prints its own guess, and carries the weight it was used at', after.weeks[0].kg === lift.printedKg && after.weeks[0].stamp === lifted, after.weeks[0])
const said = await ev(`(() => {
  const el = [...document.querySelectorAll('p, span, div')].filter(n => n.children.length === 0 && /Week 2 now starts/.test(n.textContent))[0]
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { text: el.textContent.trim(), top: Math.round(r.top), bottom: Math.round(r.bottom), h: window.innerHeight }
})()`)
check('13. Home says it, naming the lift and the set', !!said && said.text.includes(lift.name) && said.text.includes(`${lifted}kg`), said)
check('14. ...where he can see it without scrolling', !!said && said.top >= 0 && said.bottom <= said.h, said)
await shoot('testing-week-sweep-said')

// 3. THE SCREEN HOLDS THE SAME PLAN AS THE DATABASE, AND NOT TWICE. Tomorrow is week 2's Thursday: its row on the
// Exercise screen reads the lifted weight (the plan in memory was adopted, not only saved).
const writesBefore = JSON.stringify((await slots()).weeks)
await ev(`location.hash = '#/tab/exercise'`); await wait(2200)
const thu = `[...document.querySelectorAll('[data-exercise-strip] [data-strip-day="Thursday"]')][0]`
await ev(`${thu}?.scrollIntoView({ block: 'center' })`); await wait(200)
await clickAt(thu); await wait(1500)
// The row is found by the lift's own name on screen; its text is read up to the first ancestor that carries a weight.
const row = await ev(`(() => {
  let n = [...document.querySelectorAll('span, p, div, button, h3, h4')].find(x => x.children.length === 0 && x.textContent.trim() === ${JSON.stringify(lift.name)})
  for (let i = 0; n && i < 6; i++) { if (/\\d\\s?kg/.test(n.innerText ?? '')) return n.innerText.replace(/\\s+/g, ' ').slice(0, 160); n = n.parentElement }
  return null
})()`)
check('15. tomorrow\'s row on the Exercise screen reads the lifted weight too', !!row && new RegExp(`\\b${lifted}\\s?kg`).test(row), row)
await shoot('testing-week-sweep-row')
await ev(`location.hash = '#/tab/dashboard'`); await wait(1800)
check('16. nothing in the plan moves again afterwards', JSON.stringify((await slots()).weeks) === writesBefore)
const count = await ev(`[...document.querySelectorAll('p, span, div')].filter(n => n.children.length === 0 && /Week 2 now starts/.test(n.textContent)).length`)
check('17. ...and the sentence is there once, not twice', count === 1, count)

await finish()

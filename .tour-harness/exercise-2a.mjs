// ---------------------------------------------------------------------------
// EXERCISE 2a, ON A REAL SCREEN (tab polish, 31 Oct 2026; her "build, keep my
// rulings"). scripts/test-exercise-2a.ts holds the rules in code; this holds
// what she sees and taps at 390px:
//
//   A. not started — the header and "Program ›", the one glowing card with
//      Start in it (and the bar back once the card scrolls away), the coach
//      line, the warm-up row with "Feeling tight?", hairline rows each with
//      its own ⋮, and the two ways to add: "Add exercise" and "I also did…".
//   B. a session on a ramped lift — the ramp folds into one row, open while
//      it has rows to do and folded once done, its rows the SAME loggable
//      rows and never counted; the plate button in the weight box opens the
//      calculator at that row's weight; ticking a working set puts ONE rest
//      row under that set, read off the ONE engine (the session record), the
//      dock standing aside while it is in view; unticking cancels it; the
//      coach line follows the sets with the plan's own numbers.
//   C. a rest day keeps its own card under the same glowing week.
//
// Screenshots: exercise-2a-*.png beside this file (copied to
// docs/design/tab-polish-oct31/built/ by hand once read).
// ---------------------------------------------------------------------------
import { boot } from './session-driver-lib.mjs'

const b = await boot({ debugPort: 9742, passed: 'Exercise 2a: one card, the folded ramp, the plate button in the box, one rest under the set, the coach line from the plan.' })
const { ev, check, finish, until, wait, load, shoot, tapExpr, q, byText, J, record } = b
const ready = async () => { await until(`document.querySelectorAll('[data-exercise-name]').length > 0`, 15000); await wait(1000) }
const card = name => `[...document.querySelectorAll('[data-exercise-name]')].find(x => x.getAttribute('data-exercise-name') === ${J(name)})`
const inView = expr => ev(`(() => { const n = ${expr}; if (!n) return null; const r = n.getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.bottom <= innerHeight })()`)
const coachText = () => ev(`(() => { const n = [...document.querySelectorAll('[data-nudge-line] [data-nudge-text]')][0]; return n ? n.textContent.trim() : null })()`)

console.log('\nEXERCISE 2a\n')

// ---- A. Not started -----------------------------------------------------------
console.log('  A. NOT STARTED')
await load('dock=1')
await ready()
const target = await ev('window.__rampTarget')
check('A0. the fixture names a day with a ramped, loaded lift', !!target?.date && !!target?.exercise, target)

const head = await ev(`(() => ({ eyebrow: document.querySelector('[data-testid="week-context-header"]')?.textContent?.trim() ?? null, title: document.querySelector('h2')?.textContent?.trim() ?? null, pill: document.querySelector('[data-testid="program-pill"]')?.textContent?.trim() ?? null }))()`)
check('A1. the header: "Week N of M · B1" over "Exercise", and a "Program ›" pill', /^Week \d+ of \d+ · B\d/.test(head.eyebrow ?? '') && head.title === 'Exercise' && head.pill === 'Program', head)
const hero = await ev(`(() => { const h = document.querySelector('[data-exercise-hero]'); if (!h) return null; return { today: /^Today · \\w+day/i.test(h.innerText), focus: h.querySelector('[data-testid="hero-focus"]')?.textContent ?? '', meta: h.querySelector('[data-testid="hero-meta"]')?.textContent ?? '', start: !!h.querySelector('[data-testid="hero-start"]'), strip: !!h.querySelector('[data-exercise-strip]'), meter: !!h.querySelector('[data-testid="week-meter"]') } })()`)
check('A2. ONE glowing card holds today, the name, the meta with its working sets, Start, and the week strip', !!hero && hero.today && hero.focus.length > 2 && /exercises? · .* · \d+ working sets$/.test(hero.meta) && hero.start && hero.strip && hero.meter, hero)
check('A3. while the card\'s Start is on screen, no second Start is docked', (await inView(q('[data-testid="hero-start"]'))) === true && !(await ev(`!!${q('[data-testid="start-bar"]')}`)))
const note = await coachText()
check('A4. the coach line is there, without "probe" outside a calibration week, and with no invented judgement', !!note && !/probe/i.test(note) && !/moved well/i.test(note), note)
check('A5. the warm-up is one row with "Feeling tight?" on it', await ev(`(() => { const w = ${q('[data-testid="warmup-section"]')}; return !!w && /Warm-up/.test(w.innerText) && !!w.querySelector('[data-testid="tightness-open"]') })()`))
const rows = await ev(`[...document.querySelectorAll('[data-exercise-name]')].map(c => ({ name: c.getAttribute('data-exercise-name'), open: c.hasAttribute('data-exercise-open'), menu: !!c.querySelector('[aria-label="Exercise options"]'), circle: !!c.querySelector('[data-set-dots]') }))`)
check('A6. one open card, the rest closed rows — and every one has its own ⋮ and status circle', rows.filter(r => r.open).length === 1 && rows.length >= 3 && rows.every(r => r.menu && r.circle), rows)
await shoot('exercise-2a-not-started')
await ev('window.scrollTo(0, document.documentElement.scrollHeight)'); await wait(700)
check('A7. scrolled past the card, Start is docked again above the tab bar', (await ev(`!!${q('[data-testid="start-bar"]')}`)) && (await inView(`${q('[data-testid="start-bar"]')}?.querySelector('button')`)) === true)
const foot = await ev(`(() => { const a = ${q('[data-testid="add-exercise"]')}; const u = ${q('[data-testid="add-unplanned"]')}; if (!a || !u) return null; const ra = a.getBoundingClientRect(); return { h: Math.round(ra.height), w: Math.round(ra.width), add: a.textContent.trim(), line: u.parentElement.textContent.replace(/\\s+/g, ' ').trim(), below: u.getBoundingClientRect().top > ra.bottom } })()`)
check('A8. "Add exercise" is one full-width 52px button, "Did something off-plan? I also did…" a quiet line under it', !!foot && foot.h === 52 && foot.w > 300 && foot.add === 'Add exercise' && /^Did something off-plan\?\s*I also did…$/.test(foot.line) && foot.below, foot)
check('A9. no "＋ Add" disclosure is left', !(await ev(`!!${q('[data-testid="add-open"]')}`)))
await shoot('exercise-2a-not-started-foot')
const tappedUnplanned = await tapExpr(q('[data-testid="add-unplanned"]'))
// On this tab it opens IN PLACE under the line (AddUnplannedWork without its overlay): Lift or Cardio.
const unplanned = await until(`[...document.querySelectorAll('button')].some(x => x.textContent.trim() === 'Cardio') && [...document.querySelectorAll('button')].some(x => x.textContent.trim() === 'Lift')`, 5000)
check('A10. "I also did…" opens the off-plan log (Lift or Cardio)', tappedUnplanned && !!unplanned)
await b.escape()
check('A11. "Add exercise" opens the add sheet', (await tapExpr(q('[data-testid="add-exercise"]'))) && !!(await until(`!!${q('[data-testid="add-exercise-sheet"]')}`, 6000)))
await b.escape()
await ev('window.scrollTo(0, 0)'); await wait(300)
check('A12. "Program ›" opens the programme', (await tapExpr(q('[data-testid="program-pill"]'))) && !!(await until(`/program/.test(location.hash)`, 4000)))

// ---- B. A session on a ramped lift -------------------------------------------
console.log('\n  B. A SESSION ON A RAMPED LIFT')
await load(`dock=1&today=${target.date}`)
await ready()
const X = target.exercise
check('B0. today holds the ramped lift', !!(await ev(`!!${card(X)}`)), await b.exerciseNames())
check('B1. Start (in the card) starts the session; the card now offers Finish and says how long it has run', (await tapExpr(q('[data-testid="hero-start"]'))) && !!(await until(`!!${byText('Finish session')} && /min in/.test(${q('[data-testid="hero-status"]')}?.textContent ?? '')`, 5000)))
// Open the ramped lift (collapsed rows open on a tap of the line).
if (!(await ev(`${card(X)}?.hasAttribute('data-exercise-open')`))) { await tapExpr(`${card(X)}?.querySelector('[role="button"]')`); await wait(700) }
const fold = () => ev(`(() => { const c = ${card(X)}; const t = c?.querySelector('[data-testid="warmup-caption"]'); if (!t) return null; return { open: t.getAttribute('aria-expanded') === 'true', text: t.innerText.replace(/\\s+/g, ' ').trim(), h: Math.round(t.getBoundingClientRect().height), rows: c.querySelectorAll('[data-testid="warmup-row"]').length, saved: c.querySelectorAll('[data-testid="warmup-row"][data-sync]').length, working: c.querySelector('[data-testid="working-counter"]')?.textContent ?? null } })()`)
const f0 = await fold()
check('B2. the ramp is ONE 44px row — "Ramp up", how far, "not counted" — open while it has rows to do', !!f0 && f0.h >= 44 && /RAMP UP/i.test(f0.text) && /0 of \d/.test(f0.text) && /not counted/i.test(f0.text) && f0.open && f0.rows >= 2, f0)
await ev(`${card(X)}?.querySelector('[data-testid="warmup-caption"]')?.scrollIntoView({ block: 'start' })`); await wait(400)
await shoot('exercise-2a-ramp-open')
// Log every ramp row with its own tick (her 17 Sep ruling: a box for every set).
const heroSetsBefore = await ev(`${q('[data-testid="hero-sets"]')}?.textContent ?? ''`)
for (let i = 0; i < (f0?.rows ?? 0); i++) {
  await tapExpr(`[...(${card(X)}?.querySelectorAll('[data-testid="warmup-row"]') ?? [])][${i}]?.querySelector('button[aria-label^="Save"]')`)
  await wait(500)
}
const f1 = await fold()
check('B3. each ramp row was its own loggable row — and once all are in, the ramp folds itself and says so', !!f1 && !f1.open && f1.rows === 0 && new RegExp(`${f0?.rows} of ${f0?.rows} done`).test(f1.text), f1)
check('B4. ...and NOT ONE of them counted: working still 0, and the card\'s working-set count did not move', /Working 0\//.test(f1?.working ?? '') && (await ev(`${q('[data-testid="hero-sets"]')}?.textContent ?? ''`)) === heroSetsBefore, { f1, heroSetsBefore })
await tapExpr(`${card(X)}?.querySelector('[data-testid="warmup-caption"]')`); await wait(500)
const f2 = await fold()
check('B5. tapped open again, the same rows are there, saved', !!f2 && f2.open && f2.rows === f0?.rows && f2.saved === f0?.rows, f2)
await tapExpr(`${card(X)}?.querySelector('[data-testid="warmup-caption"]')`); await wait(400)
check('B6. and tapped shut, it stays shut', (await fold())?.open === false)

// The plate button in working row 1's weight box.
const row1Weight = await ev(`(() => { const r = ${card(X)}?.querySelectorAll('[data-testid="working-row"]')[0]; const i = r?.querySelector('input'); return i ? (i.value || i.placeholder) : null })()`)
check('B7. the plate button sits INSIDE working row 1\'s weight box', await ev(`(() => { const r = ${card(X)}?.querySelectorAll('[data-testid="working-row"]')[0]; const btn = r?.querySelector('[data-testid="row-plate-calc"]'); const box = r?.querySelector('input'); if (!btn || !box) return false; const a = btn.getBoundingClientRect(), b = box.getBoundingClientRect(); return a.left >= b.left && a.right <= b.right && a.top >= b.top && a.bottom <= b.bottom })()`))
await tapExpr(`${card(X)}?.querySelectorAll('[data-testid="working-row"]')[0]?.querySelector('[data-testid="row-plate-calc"]')`); await wait(600)
const plateVal = await ev(`(() => { const d = [...document.querySelectorAll('[role="dialog"]')].find(x => /plate/i.test(x.innerText)); return d ? (d.querySelector('input')?.value ?? null) : null })()`)
check('B8. ...and opens the plate calculator at that row\'s weight', plateVal != null && Number(plateVal) === Number(row1Weight) && Number(row1Weight) > 0, { plateVal, row1Weight })
await b.escape()
check('B9. no "Plate calculator" link is left in the card', !(await ev(`[...(${card(X)}?.querySelectorAll('button') ?? [])].some(x => x.textContent.trim() === 'Plate calculator')`)))

// Tick working set 1: one rest row, under set 1.
const coach0 = await coachText()
await b.tick(X, 0)
await wait(500)
const restPos = await ev(`(() => { const c = ${card(X)}; const all = [...document.querySelectorAll('[data-testid="inline-rest"]')]; const rest = c?.querySelector('[data-testid="inline-rest"]'); const rows = [...(c?.querySelectorAll('[data-testid="working-row"]') ?? [])]; if (!rest || rows.length < 2) return { count: all.length }; const after1 = rows[0].compareDocumentPosition(rest) & Node.DOCUMENT_POSITION_FOLLOWING; const before2 = rest.compareDocumentPosition(rows[1]) & Node.DOCUMENT_POSITION_FOLLOWING; return { count: all.length, after1: !!after1, before2: !!before2, left: Number(rest.getAttribute('data-rest-left')), clock: rest.querySelector('[data-testid="inline-rest-clock"]')?.textContent } })()`)
check('B10. ticking set 1 puts ONE rest row on the page, right under set 1 and above set 2', restPos.count === 1 && restPos.after1 && restPos.before2, restPos)
const rec1 = await record()
// The app runs on its own clock in the harness, so the row is compared with the
// engine's own length for this rest rather than with the machine's time.
const engineTotal = rec1?.restTotalMs ? rec1.restTotalMs / 1000 : null
check('B11. ...reading the ONE engine: the session record holds this rest (this lift, set 2 next), and the row counts down from its length', engineTotal != null && restPos.left <= engineTotal && restPos.left >= engineTotal - 5 && rec1.restLabel === X && rec1.restTargetSetNumber === 2, { engineTotal, row: restPos.left, rec: rec1 && { label: rec1.restLabel, next: rec1.restTargetSetNumber } })
await ev(`${card(X)}?.querySelector('[data-testid="inline-rest"]')?.scrollIntoView({ block: 'center' })`); await wait(600)
check('B12. while the row is in view the dock stands aside — the screen never shows the countdown twice', !(await ev(`[...document.querySelectorAll('.fixed')].some(n => /Rest · /.test(n.innerText))`)))
await shoot('exercise-2a-rest-running')
const before = (await record())?.restEndsAt
await tapExpr(`${card(X)}?.querySelector('[data-testid="inline-rest"] button[aria-label="Rest 15 seconds more"]')`)
const after = (await record())?.restEndsAt
check('B13. +15 moves the engine\'s deadline by 15 seconds', !!before && !!after && Math.round((new Date(after) - new Date(before)) / 1000) === 15, { before, after })
const coach1 = await coachText()
const row2Weight = await ev(`(() => { const r = ${card(X)}?.querySelectorAll('[data-testid="working-row"]')[1]; const i = r?.querySelector('input'); return i ? (i.value || i.placeholder) : null })()`)
check('B14. the coach line moved on with the set, in the plan\'s own numbers: "Set 1 done. Hold <set 2\'s weight> … for set 2."', coach1 !== coach0 && new RegExp(`^Set 1 done\\. Hold ${String(row2Weight).replace('.', '\\.')} kg[^.]* for set 2\\.$`).test(coach1 ?? ''), { coach0, coach1, row2Weight })
await ev('window.scrollTo(0, document.documentElement.scrollHeight)'); await wait(700)
check('B15. scrolled away, the dock shows the same rest instead', await ev(`[...document.querySelectorAll('.fixed')].some(n => /Rest · /.test(n.innerText))`))
// Untick (delete, confirmed) set 1: its rest goes with it.
await ev(`${card(X)}?.querySelector('[data-testid="working-row"]')?.scrollIntoView({ block: 'center' })`); await wait(400)
for (let i = 0; i < 2; i++) { await tapExpr(`[...(${card(X)}?.querySelectorAll('[data-testid="set-receipt"] button') ?? [])].find(x => /delete set 1/i.test(x.getAttribute('aria-label') || ''))`); await wait(400) }
check('B16. unticking set 1 cancels its rest — on the page and in the engine', !(await ev(`!!document.querySelector('[data-testid="inline-rest"]')`)) && !(await record())?.restEndsAt && !(await ev(`${card(X)}?.querySelector('[data-testid="working-row"]')?.hasAttribute('data-sync')`)))
// Log every working set: no rest row after the last one.
const n = await ev(`${card(X)}?.querySelectorAll('[data-testid="working-row"]').length ?? 0`)
for (let i = 0; i < n; i++) { await b.tick(X, i); await wait(300) }
check('B17. after the LAST working set, no rest row is drawn under it', !(await ev(`!!${card(X)}?.querySelector('[data-testid="inline-rest"]')`)), n)
const coachDone = await coachText()
check('B18. and the coach line names the lift done and what is next, from the plan', new RegExp(`^${X.replace(/[()]/g, '.')} done\\. (Next: .+, \\d+ × .+\\.|Every working set is logged\\.)$`).test(coachDone ?? ''), coachDone)
check('B19. the card\'s count of working sets moved by the working sets alone', new RegExp(`^${n} of \\d+ working sets$`).test(await ev(`${q('[data-testid="hero-sets"]')}?.textContent ?? ''`)), await ev(`${q('[data-testid="hero-sets"]')}?.textContent ?? ''`))
await ev('window.scrollTo(0, 0)'); await wait(400)
await shoot('exercise-2a-mid-session-top')

// ---- C. A rest day ------------------------------------------------------------
console.log('\n  C. A REST DAY')
await load('freetoday=1')
await until(`!!document.querySelector('[data-exercise-hero]')`, 12000); await wait(1200)
const restHero = await ev(`(() => { const h = document.querySelector('[data-exercise-hero]'); return h ? { thisWeek: /this week/i.test(h.innerText), strip: !!h.querySelector('[data-exercise-strip]'), start: !!h.querySelector('[data-testid="hero-start"]') } : null })()`)
check('C1. a rest day keeps the glowing week — "This week", the strip — and offers no Start', !!restHero && restHero.thisWeek && restHero.strip && !restHero.start, restHero)
check('C2. ...with its own day card under it (the week track, the quick log)', await ev(`!!document.querySelector('[data-testid="week-track"]') && !!document.querySelector('[data-testid="activity-quick-log"]')`))
await shoot('exercise-2a-rest-day')

finish()

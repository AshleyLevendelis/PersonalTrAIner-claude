// ---------------------------------------------------------------------------
// verify:live-run-5 — RUN 5 OF ASHLEY'S LIVE-APP TEST (11 Oct 2026), ON THE
// SCREENS SHE SAW IT ON, at 390x844.
//
//   A. L-b  Home at 00:13 says "Hi", not "Morning".
//   B. M44  The shopping card says "for the week ahead" only when it is; an
//           out-of-date list says what it covers, counts only what is still
//           to buy, says when meals changed, and offers to rebuild.
//   C. M45  "Train anyway" names each session and leaves out one already
//           trained this week; the borrowed session survives leaving the tab.
//   D. M46  A rest day she trained on reads as a session on Home.
//   E. M47  A past day opened from the strip says what was done on it first,
//           and a recovery day says its suggested cardio.
//
// L-a (a typed shopping item) is driven in verify:grocery §13, where the add
// bar is. M48 (the cue at a stated limit) has no fixture here that reaches a
// calibration week at a stated limit, and is held by test:live-run-5 §3.
//
// INPUT ONLY: rows as the database would hold them, through window.__seedDb,
// and the shop-day preference as the phone would hold it. What the screens
// make of them is the app's. Every check runs every time, null-safe.
//
// PORT 9771.
// ---------------------------------------------------------------------------
import { boot } from './session-driver-lib.mjs'

const busy = await fetch('http://127.0.0.1:9771/json/version').then(() => true, () => false)
if (busy) { console.error('    ✗ port 9771 already has a browser on it — another run of this driver is still alive'); process.exit(1) }

const b = await boot({ debugPort: 9771, passed: 'Run 5: the greeting, the shopping card, Train anyway, a trained rest day and a past day all say what is true.' })
const { ev, check, finish, tapExpr, q, byText, until, wait, load, tick, exerciseNames, shoot, beforeLoad } = b

// The seed reads its mode off the address, so one registered script serves
// every load. `run5` picks the rows; `trainedon` names a date to mark trained.
await beforeLoad(`window.__seedDb = (db, ctx) => {
  const p = new URLSearchParams(location.search)
  const mode = p.get('run5') || ''
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  const day = n => { const d = new Date(ctx.today + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d) }
  const NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const todayName = NAMES[new Date(ctx.today + 'T12:00:00').getDay()]
  window.__run5 = { today: ctx.today, todayName, monday: day(-2), mondayName: NAMES[new Date(day(-2) + 'T12:00:00').getDay()] }

  // MONDAY WAS TRAINED: a finished session with three working sets. The peek
  // reads it, and Train anyway must not offer Monday's session again.
  const trainedOn = p.get('trainedon') || day(-2)
  db.workout_sessions.push({ id: 'r5-mon', profile_id: ctx.profileId, date: trainedOn, split_type: 'training', day: null, duration_minutes: 41,
    is_completed: true, started_at: trainedOn + 'T10:00:00', finished_at: trainedOn + 'T10:41:00' })
  for (const [i, w] of [[1, 80], [2, 80], [3, 82.5]]) db.exercise_set_logs.push({ id: 'r5-mon-' + i, user_id: ctx.profileId, session_id: 'r5-mon', date: trainedOn,
    exercise_name: 'Barbell Bench Press', exercise_id: 'barbell-bench-press', set_number: i, weight_kg: w, reps_completed: 6, is_bodyweight: false,
    is_warmup: false, drop_index: 0, completed_at: trainedOn + 'T10:' + String(10 + i * 4) + ':00', created_at: trainedOn + 'T10:' + String(10 + i * 4) + ':00' })

  if (mode.startsWith('shop')) {
    try { localStorage.setItem('fitplan_shop_day_v1', JSON.stringify({ day: todayName, snoozedUntil: null })) } catch (e) {}
    let n = 0
    const row = (name, refs, o) => db.grocery_items.push(Object.assign({ id: 'gi-' + (++n), profile_id: ctx.profileId, canonical_key: name, display_name: name,
      quantity: 400, unit: 'g', category: 'produce', source: 'generated', meal_refs: refs, checked: false, needs_review: false, client_id: null,
      created_at: day(-4) + 'T09:00:00', dismissed: false, user_edited: false }, o || {}))
    const ref = (d, slot, mealName) => ({ day: 0, date: d, slot, mealName })
    if (mode === 'shopstale') {
      // Built FOUR DAYS AGO for seven days: three of them are still ahead.
      row('onions', [ref(day(-4), 'dinner', 'Chilli')])
      row('rice', [ref(day(-3), 'dinner', 'Stir fry'), ref(day(1), 'dinner', 'Curry')])
      row('oats', [-4, -3, -2, -1, 0, 1, 2].map(i => ref(day(i), 'breakfast', 'Porridge')))
      row('toilet roll', [], { source: 'manual', unit: 'item', quantity: 1 })
    } else {
      row('oats', [0, 1, 2, 3, 4, 5, 6].map(i => ref(day(i), 'breakfast', 'Porridge')))
      row('chicken breast', [0, 2, 4].map(i => ref(day(i), 'dinner', 'Chicken traybake')), { category: 'meat_fish' })
      if (mode === 'shopchanged') db.meal_plan_picks.push({ id: 'pk1', profile_id: ctx.profileId, date: day(2), slot: 'breakfast', meal_name: 'Eggs on toast' })
    }
  }
}`)

const goto = async tab => { await ev(`window.location.hash = '#/tab/${tab}'`); await wait(1500) }
const bodyText = () => ev(`document.body.innerText.replace(/\\s+/g, ' ')`)

// ---------------------------------------------------------------------------
console.log('\nA. L-b — the greeting after midnight')
await load('clock=00:13', { tab: 'dashboard' })
const greetLate = await until(`document.querySelector('h2')?.textContent.trim() || null`, 12000)
check('A1. at 00:13 Home says "Hi", not "Morning" (what she saw)', /^Hi(,|$)/.test(greetLate ?? '') && !/Morning/.test(greetLate ?? ''), greetLate)
await shoot('live-run-5-greeting-late')
await load('clock=09:00', { tab: 'dashboard' })
const greetMorning = await until(`document.querySelector('h2')?.textContent.trim() || null`, 12000)
check('A2. ...and at 09:00 it is still "Morning"', /^Morning(,|$)/.test(greetMorning ?? ''), greetMorning)

// ---------------------------------------------------------------------------
console.log('\nB. M44 — the shopping card')
const cardState = () => ev(`(() => {
  const c = document.querySelector('[data-shop-day-card]')
  if (!c) return { found: false, scope: null, stale: null, count: null, names: '', button: null, text: '' }
  return {
    found: true,
    scope: c.querySelector('[data-shop-day-scope]')?.textContent.trim() ?? null,
    stale: c.querySelector('[data-shop-day-stale]')?.textContent.replace(/\\s+/g, ' ').trim() ?? null,
    count: Number(c.querySelector('.tabular-mono')?.textContent.trim() ?? NaN),
    names: [...c.querySelectorAll('p')].map(p => p.textContent).join(' | '),
    button: c.querySelector('[data-shop-day-open]')?.textContent.trim() ?? null,
    text: c.innerText.replace(/\\s+/g, ' ').trim(),
  }
})()`)
await load('run5=shopstale', { tab: 'dashboard' })
await until(`!!document.querySelector('[data-shop-day-card]')`, 12000)
await wait(800)
const stale = await cardState()
check('B1. on shop day the card is up', stale.found === true, stale)
check('B2. A LIST BUILT FOUR DAYS AGO IS NOT "THE WEEK AHEAD" — it says "out of date"', stale.scope === 'out of date' && !/week ahead/i.test(stale.text), stale)
check('B3. ...says what it still covers, as the Grocery screen would', /Built from your next 3 days of meals\./.test(stale.stale ?? ''), stale.stale)
check('B4. ...counts only what is still to buy: oats, rice and the toilet roll (not Wednesday\'s onions)', stale.count === 3 && !/onions/.test(stale.names) && /toilet roll/.test(stale.names), stale)
check('B5. ...and offers to rebuild it', stale.button === 'Rebuild the list', stale.button)
await ev(`document.querySelector('[data-shop-day-card]')?.scrollIntoView({ block: 'center' })`)
await shoot('live-run-5-shop-stale')
await tapExpr(q('[data-shop-day-open]'))
const hashAfter = await ev('location.hash')
check('B6. "Rebuild the list" goes to the Grocery screen', /grocery/i.test(hashAfter ?? ''), hashAfter)

await load('run5=shopfresh', { tab: 'dashboard' })
await until(`!!document.querySelector('[data-shop-day-card]')`, 12000)
await wait(800)
const fresh = await cardState()
check('B7. a list built today for seven days DOES say "for the week ahead"', fresh.scope === 'for the week ahead' && fresh.stale === null, fresh)
check('B8. ...with "Open the list", not a rebuild', fresh.button === 'Open the list', fresh.button)

await load('run5=shopchanged', { tab: 'dashboard' })
await until(`!!document.querySelector('[data-shop-day-card] [data-shop-day-stale]')`, 12000)
const changed = await cardState()
check('B9. a meal swapped since the build: out of date, and it says the meals changed', changed.scope === 'out of date' && /Meals have changed since it was built\./.test(changed.stale ?? ''), changed)
await ev(`document.querySelector('[data-shop-day-card]')?.scrollIntoView({ block: 'center' })`)
await shoot('live-run-5-shop-changed')

// ---------------------------------------------------------------------------
console.log('\nC. M45 — Train anyway on a rest day')
await load('', { tab: 'exercise' })
await until(`!!window.__noRowDay && !!window.__run5`, 12000)
const rest = await ev('window.__noRowDay')
const R5 = await ev('window.__run5')
check('C0. the fixture has a rest day (no plan row) to stand on', !!rest?.date, rest)
const openTrainAnyway = async () => {
  await until(`!!document.querySelector('[data-testid="train-anyway"]')`, 12000)
  await tapExpr(q('[data-testid="train-anyway"]'))
  await until(`document.querySelectorAll('[data-testid="train-anyway-option"]').length > 0`, 4000)
  return ev(`[...document.querySelectorAll('[data-testid="train-anyway-option"]')].map(b => b.textContent.trim())`)
}
await load(`today=${rest?.date ?? ''}`, { tab: 'exercise' })
const labels = (await openTrainAnyway()) ?? []
check('C1. EVERY OPTION NAMES ITS SESSION ("Wednesday · Upper Pull & Core"), not a bare day', labels.length > 0 && labels.every(l => /^[A-Z][a-z]+day · \S/.test(l)), labels)
const strip = await ev(`[...document.querySelectorAll('[data-strip-day]')].map(n => n.getAttribute('aria-label'))`)
const monLabel = (strip ?? []).find(l => (l ?? '').startsWith(`${R5?.mondayName}: `)) ?? null
check('C2. Monday is marked trained on the strip (the input this check stands on)', !!monLabel && /: done/.test(monLabel), { monLabel, strip })
check('C3. A SESSION ALREADY TRAINED THIS WEEK IS NOT OFFERED (Monday\'s)', !labels.some(l => l.startsWith(`${R5?.mondayName} ·`)), labels)
check('C4. ...while the sessions still owed are (more than one)', labels.length >= 2, labels)
await shoot('live-run-5-train-anyway')
const pick = labels[0] ?? ''
const pickDay = pick.split(' · ')[0]
await tapExpr(byText(pick))
const borrowed1 = await until(`document.querySelector('[data-testid="borrowed-from"]')?.textContent.trim() || null`, 6000)
check('C5. tapping one borrows it ("Wednesday\'s session")', borrowed1 === `${pickDay}'s session`, borrowed1)
await goto('dashboard')
await goto('exercise')
const borrowed2 = await until(`document.querySelector('[data-testid="borrowed-from"]')?.textContent.trim() || null`, 8000)
check('C6. LEAVING THE TAB AND COMING BACK KEEPS IT (it fell back to the rest-day card)', borrowed2 === `${pickDay}'s session` && !(await ev(`!!document.querySelector('[data-testid="train-anyway"]')`)), borrowed2)

// ---------------------------------------------------------------------------
console.log('\nD. M46 — the rest day she trained on, on Home')
await until(`document.querySelectorAll('[data-exercise-name]').length > 0`, 8000)
const names = (await exerciseNames()) ?? []
let ticked = false
for (const n of names) { if (await tick(n, 0)) { ticked = true; break } }
check('D1. a set of the borrowed session is ticked', ticked, names)
await goto('dashboard')
const hero = await until(`(() => { const h = document.querySelector('[data-home-hero]'); return h && h.getAttribute('data-home-hero') !== 'unknown' ? { state: h.getAttribute('data-home-hero'), text: h.innerText.replace(/\\s+/g, ' ').trim() } : null })()`, 12000)
check('D2. HOME SHOWS A SESSION, NOT "Rest day" (what she saw)', !!hero && hero.state !== 'rest' && !/^Today's session Rest day/.test(hero.text) && !/Rest day/.test(hero.text), hero)
check('D3. ...in progress, under the borrowed session\'s name', hero?.state === 'in_progress' && hero.text.includes((pick.split(' · ')[1] ?? '###')), hero)
await shoot('live-run-5-home-trained-rest-day')
await goto('exercise')
const back = await until(`document.querySelector('[data-testid="borrowed-from"]')?.textContent.trim() || null`, 8000)
const savedRows = await ev(`document.querySelectorAll('[data-testid="working-row"][data-sync]').length`)
check('D4. ...and back on Exercise, the borrowed session is still there with the set she logged', back === `${pickDay}'s session` && savedRows >= 1, { back, savedRows })

// ---------------------------------------------------------------------------
console.log('\nE. M47 — a past day says what was done on it')
await load('', { tab: 'exercise' })
await until(`document.querySelectorAll('[data-strip-day]').length > 0 && !!window.__run5`, 12000)
await wait(800)
const mon = (await ev('window.__run5'))?.mondayName ?? 'Monday'
await tapExpr(q(`[data-strip-day="${mon}"]`))
await until(`!!document.querySelector('[data-testid="peek-what-you-did"]')`, 6000)
const peek = await ev(`(() => {
  const did = document.querySelector('[data-testid="peek-what-you-did"]')
  const plan = document.querySelector('[data-testid="peek-plan"]')
  const label = document.querySelector('[data-testid="peek-planned-label"]')
  return {
    did: did?.innerText.replace(/\\s+/g, ' ').trim() ?? null,
    didFirst: !!did && !!plan && !!(did.compareDocumentPosition(plan) & Node.DOCUMENT_POSITION_FOLLOWING),
    planDimmed: !!plan && plan.className.includes('opacity-60'),
    label: label?.textContent.trim() ?? null,
  }
})()`)
check('E1. MONDAY SAYS WHAT WAS DONE: the bench, weight × reps per set', /Barbell Bench Press · 80kg × 6, 6 · 82\.5kg × 6/.test(peek?.did ?? ''), peek)
check('E2. ...first, above the plan', peek?.didFirst === true, peek)
check('E3. ...with the plan dimmed under "Planned"', peek?.planDimmed === true && peek?.label === 'Planned', peek)
await ev(`window.scrollTo(0, 0)`)
await shoot('live-run-5-peek-done-day')

const sugg = await ev('window.__suggestedCardioDay')
await load('', { tab: 'exercise' })
await until(`document.querySelectorAll('[data-strip-day]').length > 0`, 12000)
await wait(800)
await tapExpr(q(`[data-strip-day="${sugg?.day ?? 'none'}"]`))
const recov = await until(`document.querySelector('[data-testid="peek-rest-day"]')?.innerText.replace(/\\s+/g, ' ').trim() || null`, 6000)
const head = (sugg?.activity ?? '###').split(' — ')[0]
check('E4. A RECOVERY DAY SAYS ITS SUGGESTED CARDIO, in the plan\'s phrase ("… · 20 min · Easy")', !!recov && recov.includes(head) && / · \d+ min · (Easy|Steady|Hard)\./.test(recov) && !/is a rest or recovery day/.test(recov), { recov, sugg })
await shoot('live-run-5-peek-recovery')

const txt = await bodyText()
check('Z. nothing leaked onto the page', !/undefined|NaN|\[object Object\]/.test(txt ?? ''), (txt ?? '').match(/.{0,40}(undefined|NaN|\[object Object\]).{0,40}/)?.[0])
finish()

// ---------------------------------------------------------------------------
// FINISHING ASKS FIRST, AND THE CARD'S NUMBERS MEAN WHAT THEY SAY — M12 (the
// check), L29, L15, and the two leftovers from the cardio slice. 9 Oct 2026.
//
// The tester: Finish session ended a session at 9 of 24 sets without a word;
// the card then read "80m · 710kg · 7/9", where the 9 left out an exercise she
// had added, the 80 minutes held a connection outage, and 30 kg in each hand
// had been counted as 30.
//
// scripts/test-finish-check.ts holds the arithmetic. This holds the screen:
// the sheet appears when planned sets remain and ONLY then, "Keep going"
// changes nothing, and the card that follows shows planned-over-planned with
// extras beside it, training time, and a pair of dumbbells counted twice.
// ---------------------------------------------------------------------------
import { boot } from './session-driver-lib.mjs'

const b = await boot({ debugPort: 9606, passed: 'Finish asks when sets are left and only then; the card counts planned sets, training time and both hands.' })
const { ev, check, finish, tapExpr, q, byText, until, wait, load, tick, exerciseNames, shoot, ensureOpen, rowsExpr, cardExpr, escape, beforeLoad, J, typeText } = b

const sheet = () => ev(`(() => { const d = ${q('[data-testid="finish-check"]')}; if (!d) return null; return { title: d.querySelector('h2')?.textContent ?? '', left: [...d.querySelectorAll('[data-testid="finish-check-left"] p')].slice(1).map(p => p.innerText.replace(/\\s+/g, ' ').trim()), buttons: [...d.querySelectorAll('button')].map(x => x.textContent.trim()).filter(t => t && t !== 'Close') } })()`)
const summary = () => ev(`(() => { const d = [...document.querySelectorAll('[role="dialog"]')].find(x => /^(Session (complete|saved)|Nothing logged|No sets logged)$/.test(x.querySelector('h2')?.textContent ?? '')); if (!d) return null; return { title: d.querySelector('h2').textContent, sets: d.querySelector('[data-testid="summary-sets"]')?.textContent ?? null, setsLabel: d.querySelector('[data-testid="summary-sets-label"]')?.textContent ?? null, extra: d.querySelector('[data-testid="summary-sets-extra"]')?.textContent ?? null, tiles: [...d.querySelectorAll('.grid.grid-cols-3 > div')].map(t => t.innerText.replace(/\\s+/g, ' ').trim()), text: d.innerText.replace(/\\s+/g, ' ').trim() } })()`)
const sessionRow = () => ev(`(window.__fakeDb?.workout_sessions ?? []).map(r => ({ done: !!r.is_completed, minutes: r.duration_minutes ?? null }))`)
const tapFinish = async () => { await ev('window.scrollTo(0, 0)'); await wait(250); const ok = await tapExpr(byText('Finish session')); await wait(700); return ok }
const ready = async () => { await until(`document.querySelectorAll('[data-exercise-name]').length > 0`, 12000); await wait(1000) }

console.log('\nFINISH CHECK AND SUMMARY NUMBERS\n')

// ---- 0. Today's plan, read off the page --------------------------------------
// WHICH FIXTURE. The default plan is a full gym, and its session today may hold
// no dumbbell pair at all — so the harness's own home-gym plans are tried in
// turn and the first whose session has one is used for every load below. Asked
// of the page, never named: the plans have reshuffled before.
let FLAGS = ''
let plan = []
let H = null
for (const flags of ['', 'legcurl=1', 'offstyle=1', 'mobility=1']) {
  await load(flags)
  await ready()
  const names = (await exerciseNames()) ?? []
  const found = []
  for (const name of names) {
    await ensureOpen(name)
    found.push({ name, sets: await ev(`${rowsExpr(name)}.length`), perHand: await ev(`/Log weight · per hand/.test(${cardExpr(name)}?.innerText ?? '')`), bodyweightOnly: await ev(`${rowsExpr(name)}[0]?.querySelectorAll('input')[0]?.disabled === true`) })
  }
  const pair = found.find(p => p.perHand && p.sets >= 2) ?? null
  if (pair || plan.length === 0) { FLAGS = flags; plan = found; H = pair }
  if (pair) break
}
const N = plan.reduce((s, p) => s + p.sets, 0)
check('0a. today has several exercises and their set counts were read', plan.length >= 3 && N >= 6 && plan.every(p => p.sets >= 1), plan)
check('0b. ...one of them a pair of dumbbells, logged per hand', !!H, plan)
if (!H || N < 6) finish()
console.log(`  fixture "${FLAGS || 'default'}": ${N} planned sets over ${plan.length} exercises · per hand: "${H.name}"`)

// ---- 1. Finish with sets still to do ------------------------------------------
console.log('\n  1. FINISH WITH SETS STILL TO DO')
await load(FLAGS)
await ready()
check('1a. two sets of the dumbbell lift are logged at 30 for 8', (await tick(H.name, 0, { weight: 30, reps: 8 })) === true && (await tick(H.name, 1, { weight: 30, reps: 8 })) === true)
check('1b. Finish session is tapped', await tapFinish())
const s1 = await sheet()
check('1c. THE APP ASKS FIRST (it ended the session on that tap)', !!s1, s1)
check(`1d. in the plan's own numbers: "2 of ${N} sets done — finish anyway?"`, s1?.title === `2 of ${N} sets done — finish anyway?`, s1?.title)
check('1e. with two answers: Keep going, Finish', (s1?.buttons ?? []).join() === 'Keep going,Finish', s1?.buttons)
const leftTotal = (s1?.left ?? []).reduce((sum, l) => sum + Number(/(\d+) sets?$/.exec(l)?.[1] ?? NaN), 0)
check(`1f. and what is left adds up to the other ${N - 2}`, leftTotal === N - 2 && (s1?.left ?? []).some(l => l.startsWith(H.name) && new RegExp(` ${H.sets - 2} sets?$`).test(l)) === (H.sets > 2), s1?.left)
check('1g. nothing has been finished yet', (await summary()) === null && (await sessionRow()).every(r => !r.done), await sessionRow())
await shoot('finish-check-sheet')
check('1h. "Keep going" is tapped', await tapExpr(q('[data-testid="finish-keep-going"]')))
await wait(400)
check('1i. ...and the session is exactly as it was: still running, nothing closed', (await sheet()) === null && (await summary()) === null && (await ev(`!!${byText('Finish session')}`)) === true && (await sessionRow()).every(r => !r.done))

// ---- 2. Finish anyway: the card ------------------------------------------------
console.log('\n  2. FINISH ANYWAY — THE CARD')
// One more set first, on a row added by hand: an EXTRA, beyond the plan.
await ensureOpen(H.name)
let logged = 2
for (let i = 2; i < H.sets; i++) { if (await tick(H.name, i, { weight: 30, reps: 8 })) logged++ }
check(`2a. the lift's ${H.sets} planned sets are all logged`, logged === H.sets, logged)
await tapExpr(`[...(${cardExpr(H.name)}?.querySelectorAll('button') ?? [])].find(x => x.textContent.trim() === 'Add Set')`)
await wait(500)
check('2b. one more is added by hand and logged', (await ev(`${rowsExpr(H.name)}.length`)) === H.sets + 1 && (await tick(H.name, H.sets, { weight: 30, reps: 8 })) === true)
check('2c. Finish session, and this time "Finish"', (await tapFinish()) && (await tapExpr(q('[data-testid="finish-anyway"]'))))
await until(`[...document.querySelectorAll('[role="dialog"] h2')].some(h => /^Session (complete|saved)$/.test(h.textContent))`, 8000)
await wait(500)
const c2 = await summary()
check(`2d. THE FRACTION IS PLANNED OVER PLANNED: "${H.sets}/${N}"`, c2?.sets === `${H.sets}/${N}`, c2?.sets)
check('2e. ...labelled "Planned sets", with the extra set BESIDE it: "+1 extra"', c2?.setsLabel === 'Planned sets' && c2?.extra === '+1 extra', { label: c2?.setsLabel, extra: c2?.extra })
const expectedKg = (H.sets + 1) * 30 * 8 * 2
const volumeTile = (c2?.tiles ?? []).find(t => /Volume$/i.test(t)) ?? ''
check(`2f. VOLUME COUNTS BOTH HANDS: ${H.sets + 1} sets of 30 per hand for 8 is ${expectedKg.toLocaleString('en-GB')}kg, not ${(expectedKg / 2).toLocaleString('en-GB')}`, volumeTile.replace(/[, ]/g, '').startsWith(`${expectedKg}kg`), c2?.tiles)
check('2g. the time is labelled as training time', (c2?.tiles ?? []).some(t => /^\d+ ?m Training time$/i.test(t)), c2?.tiles)
await shoot('finish-check-summary')
await escape()

// ---- 3. Everything done: no question -----------------------------------------
console.log('\n  3. EVERY PLANNED SET DONE — nothing is asked, and the time is training time')
// All but one of today's planned sets, as the database would hold them: three
// minutes apart from ten o'clock, then nothing until the driver's own tick at
// the harness's noon. Input only.
const last = plan[plan.length - 1]
await beforeLoad(`window.__seedDb = (db, ctx) => {
  const plan = ${J(plan)}
  db.workout_sessions.push({ id: 'ws-today', profile_id: ctx.profileId, date: ctx.today, split_type: 'training', day: null, week_number: null, duration_minutes: 45, is_completed: false, started_at: ctx.today + 'T10:00:00' })
  let k = 0
  window.__seededTimes = []
  plan.forEach((ex, e) => { for (let s = 1; s <= ex.sets; s++) {
    if (e === plan.length - 1 && s === ex.sets) continue
    const at = new Date(new Date(ctx.today + 'T10:00:00').getTime() + k * 180000).toISOString(); k++
    window.__seededTimes.push(at)
    db.exercise_set_logs.push({ id: 'seed-' + e + '-' + s, user_id: ctx.profileId, session_id: 'ws-today', date: ctx.today, exercise_name: ex.name, set_number: s, weight_kg: ex.bodyweightOnly ? 0 : 10, reps_completed: 10, is_bodyweight: !!ex.bodyweightOnly, is_warmup: false, drop_index: 0, completed_at: at, created_at: at })
  } })
}`)
await load(FLAGS)
await ready()
const seeded = (await ev('window.__seededTimes')) ?? []
check(`3a. ${N - 1} of the ${N} planned sets are already logged`, seeded.length === N - 1, seeded.length)
// Read from the store, not the row: with its last set done the card closes itself.
await tick(last.name, last.sets - 1)
await wait(600)
const rows3 = await ev(`(() => { const all = window.__fakeDb?.exercise_set_logs ?? []; return { seeded: all.filter(r => String(r.id).startsWith('seed-')).length, ticked: all.filter(r => !String(r.id).startsWith('seed-') && !String(r.id).startsWith('lg') && r.exercise_name === ${J(last.name)}).length } })()`)
check(`3b. the last one is ticked: all ${N} are logged`, rows3?.seeded === N - 1 && rows3?.ticked === 1, rows3)
check('3c. Finish session is tapped', await tapFinish())
await until(`[...document.querySelectorAll('[role="dialog"] h2')].some(h => /^Session (complete|saved)$/.test(h.textContent))`, 8000)
await wait(500)
check('3d. NO QUESTION: with nothing left the sheet does not appear', (await sheet()) === null)
const c3 = await summary()
check(`3e. the card opens at once: "${N}/${N}" planned sets, and no extras`, c3?.sets === `${N}/${N}` && c3?.setsLabel === 'Planned sets' && c3?.extra === null, { sets: c3?.sets, label: c3?.setsLabel, extra: c3?.extra })
// THE DRIVER'S OWN ARITHMETIC, with a literal ten: every gap between one set
// and the next, none counted for more than ten minutes; the last gap runs to
// the tick at noon.
const stamps = [...seeded.map(t => new Date(t).getTime()), new Date(`${(await ev('window.__fakeDb.workout_sessions[0].date'))}T12:00:00`).getTime()].sort((a, c) => a - c)
let ms = 0
for (let i = 1; i < stamps.length; i++) ms += Math.min(stamps[i] - stamps[i - 1], 10 * 60 * 1000)
const expectedMin = Math.max(1, Math.round(ms / 60000))
const wallClock = Math.round((stamps[stamps.length - 1] - stamps[0]) / 60000)
const timeTile = (c3?.tiles ?? []).find(t => /Training time$/i.test(t)) ?? ''
check(`3f. TRAINING TIME IS ${expectedMin} MINUTES — the long gap before the last set counts as ten, where the clock says ${wallClock}`, expectedMin < wallClock && new RegExp(`^${expectedMin} ?m `).test(timeTile), timeTile)
await wait(600)
const row3 = await sessionRow()
check('3g. the session row is given the same figure, so history says the same', row3.length === 1 && row3[0].done === true && row3[0].minutes === expectedMin, row3)
await shoot('finish-check-all-done')
await escape()

// ---- 4. Only cardio logged ----------------------------------------------------
console.log('\n  4. FINISH WITH ONLY CARDIO LOGGED')
await beforeLoad(`window.__seedDb = undefined`)
await load(FLAGS)
await ready()
check('4a. Start workout is tapped (nothing is logged, so there is no session otherwise)', await tapExpr(byText('Start workout')))
await wait(500)
await tapExpr(byText('＋ Add unplanned work'))
await tapExpr(byText('Cardio'))
await tapExpr(q('[data-testid="quick-log-other"]'))
await tapExpr(q('[data-testid="cardio-unplanned"] input[data-field="activity"]')); await typeText('skipping rope')
await tapExpr(q('[data-testid="cardio-unplanned"] input[data-field="minutes"]')); await typeText('12')
await tapExpr(q('[data-testid="cardio-unplanned"] [data-effort="steady"]'))
await tapExpr(q('[data-testid="cardio-unplanned"] [data-testid="cardio-save"]'))
await wait(900)
check('4b. skipping rope, 12 minutes, is logged', ((await ev(`(window.__fakeDb?.cardio_logs ?? []).length`)) ?? 0) === 1)
check('4c. Finish session is tapped', await tapFinish())
await until(`!!document.querySelector('[role="dialog"] h2')`, 6000)
await wait(400)
const c4 = await summary()
check('4d. no question is asked — there is no set to leave behind', (await sheet()) === null)
check('4e. THE CARD SAYS WHAT IS SAVED: "No sets logged — your skipping rope is saved."', c4?.title === 'No sets logged' && /No sets logged — your skipping rope is saved\./.test(c4?.text ?? ''), c4)
check('4f. ...and still that the day stays open', /the day stays open/i.test(c4?.text ?? ''), c4?.text)
await shoot('finish-check-cardio-only')

finish()

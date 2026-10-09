// ---------------------------------------------------------------------------
// WHAT A PERSONAL BEST IS, ON THE SCREENS — M12 (cause B), L9, M16, L32.
// 9 Oct 2026.
//
// The tester's first session, begun by ticking a set, finished on five "New
// PRs" — every one a first-ever log. Home listed warm-up moves under "Recent
// PRs", Tools said "7 PRs" after two workouts, and Home's lift line quoted the
// plan's weight after a heavier one had been logged.
//
// scripts/test-what-a-pr-is.ts holds the rule. This holds what somebody sees:
// on a first-ever session no trophy, one quiet baseline line, an empty PR list
// and "0 PRs"; and with last week's sets behind them (seeded as the database
// would hold them — input only) exactly one PR, on the lift that improved.
// ---------------------------------------------------------------------------
import { boot } from './session-driver-lib.mjs'

const b = await boot({ debugPort: 9604, passed: 'A first log is a baseline, a beaten record is a personal best, and every screen says the same.' })
const { ev, check, finish, tapExpr, q, byText, until, wait, load, tick, exerciseNames, shoot, ensureOpen, rowsExpr, cardExpr, escape, beforeLoad, J, texts } = b

const badgeRows = name => ev(`${rowsExpr(name)}.map(r => [...r.querySelectorAll('span')].some(s => s.textContent.trim() === 'PR'))`)
const notes = () => texts('[data-testid="first-log-note"]')
const noteUnder = name => ev(`[...(${cardExpr(name)}?.querySelectorAll('[data-testid="first-log-note"]') ?? [])].map(n => n.textContent.trim())`)
const finishSession = async () => {
  await ev('window.scrollTo(0, 0)'); await wait(200)
  if (!(await tapExpr(byText('Finish session')))) return false
  await wait(500)
  // Sets are still to do, so the app asks first (finish-check.mjs holds that).
  if (await ev(`!!${q('[data-testid="finish-check"]')}`)) await tapExpr(q('[data-testid="finish-anyway"]'))
  return (await until(`[...document.querySelectorAll('[role="dialog"] h2')].some(h => /^Session (complete|saved)$/.test(h.textContent))`, 8000)) === true
}
const summaryPRs = () => ev(`(() => { const d = [...document.querySelectorAll('[role="dialog"]')].find(x => /^Session (complete|saved)$/.test(x.querySelector('h2')?.textContent ?? '')); if (!d) return null; return [...d.querySelectorAll('[data-testid="summary-prs"] p')].slice(1).map(p => p.innerText.replace(/\\s+/g, ' ').trim()) })()`)
const goto = async tab => { await ev(`window.location.hash = '#/tab/${tab}'`); await wait(1500) }
const toolsCount = async () => { await goto('tools'); return until(`(document.body.innerText.match(/\\d+ sessions? · \\d+ PRs?/) ?? [null])[0]`, 6000) }
const homeGlance = async () => { await goto('home'); await until(`!!${q('[data-testid="home-session-glance"]')}`, 8000); return ev(`${q('[data-testid="home-session-glance"]')}?.textContent.trim() ?? null`) }

console.log('\nWHAT A PERSONAL BEST IS\n')

// ---- 0. Which lifts ---------------------------------------------------------
await load('', { tab: 'home' })
const before = await homeGlance()
// "5 exercises · ~48 min · <Lift> from ~16kg per hand" — the lead lift is the
// part after the last dot, up to " from".
const leadShown = (before ?? '').split(' · ').pop() ?? ''
check('0a. before training, Home names the session\'s heaviest lift with its unit', /^[A-Z].* from ~\d+(\.\d+)?kg( per (hand|leg))?$/.test(leadShown), before)
await goto('exercise')
await until(`document.querySelectorAll('[data-exercise-name]').length > 0`, 12000)
await wait(800)
const names = (await exerciseNames()) ?? []
const kinds = await ev(`[...document.querySelectorAll('[data-exercise-name]')].map(c => ({ name: c.getAttribute('data-exercise-name'), prep: /movement prep|primer/i.test(c.parentElement?.innerText.slice(0, 400) ?? c.innerText) }))`)
// X: the lift Home leads with when it is on the page by that name; otherwise the first card that is not movement prep.
let X = names.find(n => leadShown.startsWith(`${n} from`)) ?? null
const P = (kinds ?? []).find(k => /movement prep/i.test('') || k.prep)?.name ?? null
if (!X) for (const n of names) { if (n === P) continue; await ensureOpen(n); if ((await ev(`${rowsExpr(n)}.length`)) >= 2 && (await ev(`${rowsExpr(n)}[0]?.querySelectorAll('input').length`)) >= 2) { X = n; break } }
check('0b. today has a loaded lift with two working sets', !!X, { names, leadShown })
check('0c. ...and a movement-prep exercise beside it', !!P && P !== X, kinds)
if (!X || !P) finish()
const leadIsX = leadShown.startsWith(`${X} from`)
console.log(`  lift: "${X}"${leadIsX ? ' (the one Home leads with)' : ''} · movement prep: "${P}"`)

// ---- 1. A first-ever session, begun by ticking a set -------------------------
console.log('\n  1. THE FIRST SESSION EVER — started by ticking a set, as the tester did')
await load()
await until(`document.querySelectorAll('[data-exercise-name]').length > 0`, 12000)
await wait(1000)
check('1a. the movement-prep set is ticked', (await tick(P, 0, { weight: 10, reps: 3 })) === true)
check('1b. set 1 of the lift is logged at 20, set 2 heavier at 22.5', (await tick(X, 0, { weight: 20, reps: 8 })) === true && (await tick(X, 1, { weight: 22.5, reps: 8 })) === true)
await wait(600)
const b1 = await badgeRows(X)
check('1c. NO TROPHY ON EITHER ROW — a first log has nothing before it to beat, and a session is not its own baseline', (b1 ?? []).length >= 2 && b1.every(x => x === false), b1)
const n1 = await noteUnder(X)
check('1d. one quiet line instead, under the first set: "First time logged — this is your baseline"', n1.length === 1 && n1[0] === 'First time logged — this is your baseline', n1)
check('1e. ...and nothing of the sort under the warm-up move', (await noteUnder(P)).length === 0 && (await badgeRows(P)).every(x => x === false), { notes: await notes(), badges: await badgeRows(P) })
await ev(`${cardExpr(X)}?.scrollIntoView({ block: 'center' })`); await wait(300)
await shoot('what-a-pr-is-first-log')
check('1f. the session is finished', await finishSession())
const prs1 = await summaryPRs()
check('1g. THE CARD LISTS NO "NEW PRs" (the tester\'s listed five)', Array.isArray(prs1) && prs1.length === 0 && (await ev(`!${q('[data-testid="summary-prs"]')}`)) === true, prs1)
await shoot('what-a-pr-is-first-finish')
await escape()
const home1 = await homeGlance()
check('1h. Home has no "Recent PRs"', (await ev(`!${q('[data-testid="home-recent-prs"]')}`)) === true)
check('1i. ...and no "New PR this week" tip', (await ev(`!/New PR this week/.test(document.body.innerText) && !/\\bat 0kg/.test(document.body.innerText)`)) === true)
if (leadIsX) check('1j. HOME\'S LIFT LINE SAYS WHAT WAS LIFTED: 22.5, not the plan\'s figure', new RegExp(`${X.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')} 22\\.5kg( per (hand|leg))? today$`).test(home1 ?? ''), home1)
else check('1j. Home\'s lift line still carries a unit and a proper name', /[A-Z][^·]*\d+(\.\d+)?kg/.test((home1 ?? '').split(' · ').pop() ?? ''), home1)
check('1k. ...never lower-cased, never a bare " kg"', !/ \d+(\.\d+)? kg/.test(home1 ?? '') && !/^[a-z]/.test((home1 ?? '').split(' · ').pop() ?? 'x'), home1)
await shoot('what-a-pr-is-home-first')
const tools1 = await toolsCount()
check('1l. Tools counts 1 session and 0 PRs (it counted every exercise logged)', tools1 === '1 session · 0 PRs', tools1)

// ---- 2. With last week behind them ------------------------------------------
console.log('\n  2. THE SAME SESSION A WEEK ON — last week\'s sets are in the database')
await beforeLoad(`window.__seedDb = (db, ctx) => {
  const d = new Date(ctx.today + 'T12:00:00'); d.setDate(d.getDate() - 7)
  const at = d.toISOString()
  const row = (name, n, kg, reps, bw) => ({ id: 'wk-' + name + n, user_id: ctx.profileId, session_id: 'ws-last-week', exercise_name: name, exercise_id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), set_number: n, weight_kg: kg, reps_completed: reps, is_bodyweight: bw, is_warmup: false, drop_index: 0, completed_at: at, created_at: at })
  db.exercise_set_logs.push(row(${J(X)}, 1, 20, 8, false), row(${J(X)}, 2, 22.5, 8, false), row(${J(P)}, 1, 10, 3, false))
}`)
await load()
await until(`document.querySelectorAll('[data-exercise-name]').length > 0`, 12000)
await wait(1200)
check('2a. the warm-up move is ticked again — 12 reps where last week it did 3', (await tick(P, 0, { weight: 10, reps: 12 })) === true)
check('2b. set 1 repeats last week\'s best (22.5); set 2 goes up to 25', (await tick(X, 0, { weight: 22.5, reps: 8 })) === true && (await tick(X, 1, { weight: 25, reps: 8 })) === true)
await wait(600)
const b2 = await badgeRows(X)
check('2c. THE TROPHY IS ON SET 2 — the one that beat last week — and not on set 1, which matched it', b2?.[0] === false && b2?.[1] === true, b2)
check('2d. the baseline line is gone: this is not the first time', (await notes()).length === 0, await notes())
check('2e. the warm-up move gets no trophy for beating itself', (await badgeRows(P)).every(x => x === false), await badgeRows(P))
await ev(`${cardExpr(X)}?.scrollIntoView({ block: 'center' })`); await wait(300)
await shoot('what-a-pr-is-beaten')
check('2f. the session is finished', await finishSession())
const prs2 = await summaryPRs()
check('2g. THE CARD LISTS ONE NEW PR: the lift, at 25kg', Array.isArray(prs2) && prs2.length === 1 && prs2[0].startsWith(X) && /25kg/.test(prs2[0]), prs2)
await shoot('what-a-pr-is-finish')
await escape()
await goto('home')
await until(`!!${q('[data-testid="home-recent-prs"]')}`, 8000)
const recent = await ev(`[...(${q('[data-testid="home-recent-prs"]')}?.querySelectorAll('.flex') ?? [])].map(r => r.innerText.replace(/\\s+/g, ' ').trim())`)
check('2h. Home\'s "Recent PRs" lists that lift and its weight', (recent ?? []).length === 1 && recent[0].startsWith(X) && /25kg$/.test(recent[0]), recent)
check('2i. ...and not the warm-up move', !(recent ?? []).some(r => r.includes(P)), recent)
await ev(`${q('[data-testid="home-recent-prs"]')}?.scrollIntoView({ block: 'center' })`); await wait(300)
await shoot('what-a-pr-is-home')
const tools2 = await toolsCount()
check('2j. Tools counts 1 PR', /· 1 PR$/.test(tools2 ?? ''), tools2)

finish()

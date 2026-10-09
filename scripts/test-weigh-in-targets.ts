// ---------------------------------------------------------------------------
// Gate: targets follow a 7-day average and only move once it has shifted 1 kg.
//
// ASHLEY'S RULING (BACKLOG, "Targets now anchor to a 7-day rolling average …
// and only move once it's shifted ≥1kg from the average that last set the
// target; a real move surfaces a one-time dismissible notice") HAD NO GATE.
// Not one script read getEffectiveTargetWeightKg or the 1 kg threshold; the
// only thing held was the wording of the notice.
//
// 9 Oct 2026, the test log's H10 showed what that cost. Sam signed up at
// 82 kg, weighed in at 81.2 kg the same day, and the calorie target moved
// from 1,697 to 1,689 with no notice — a 0.8 kg move, which the rule exists to
// ignore. Cause: onboarding set the targets and never recorded what set them,
// so there was no anchor and the first weigh-in became it.
//
// This file RUNS the chain, against a fake database, on a clock it sets:
//   1. sign-up at 82 -> a same-day 81.2: the target HOLDS, nothing is said;
//   2. three later days averaging 84: the target MOVES, and the notice says
//      what it moved from and to;
//   3. "today" is the app's date for all of it;
//   4. one check for "is this weigh-in believable", asked by every place a
//      weight is typed — a verdict only (what a surprising one DOES is
//      Ashley's decision, and nothing she can see changes yet);
//   5. the change shown on Home is measured from the starting weight (L31).
//
// Written to run on the tree as it was before the fix as well, so it can be
// seen to fail for the reason the bug existed: where a function did not exist
// yet, the step does what the app did then.
//
// One exit, at the bottom. Every check runs every time.
// ---------------------------------------------------------------------------

// A place with clock changes, set before any date is made: a day count done in
// local hours is only wrong where a day can be 23 or 25 of them.
process.env.TZ = 'Europe/London'

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { UserProfile, MacroTargets } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const raw = (p: string) => { try { return readFileSync(join(ROOT, p), 'utf8') } catch { return '' } }
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

let failures = 0
let ran = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 400)}` : ''}`) }
}

// --- A clock the gate owns ---------------------------------------------------
// The app reads "today" through its developer clock, which lives in
// localStorage. Node has none, so the gate supplies one and sets the date for
// each step. Nothing below depends on the day this is run.
const store = new Map<string, string>()
;(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v) },
  removeItem: (k: string) => { store.delete(k) },
}

// --- A fake database (test-dashboard.ts's shape) -------------------------------
type Row = Record<string, unknown>
const db: Record<string, Row[]> = {}
const cmp = (a: unknown, b: unknown) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0)
function fakeFrom(table: string) {
  db[table] = db[table] ?? []
  const filters: ((r: Row) => boolean)[] = []
  const orders: [string, boolean][] = []
  let limitN: number | null = null
  let op: 'select' | 'upsert' = 'select'
  let payload: Row[] = []
  let onConflict: string[] | null = null
  let single = false
  const exec = () => {
    if (op === 'upsert') {
      for (const row of payload) {
        const existing = onConflict ? db[table].find(r => onConflict!.every(c => r[c] === row[c])) : undefined
        if (existing) Object.assign(existing, row)
        else db[table].push({ id: `${table}-${db[table].length + 1}`, ...row })
      }
      return { data: single ? payload[0] ?? null : payload, error: null }
    }
    let rows = db[table].filter(r => filters.every(f => f(r)))
    for (const [col, asc] of [...orders].reverse()) rows = [...rows].sort((a, b) => (asc ? 1 : -1) * cmp(a[col], b[col]))
    if (limitN != null) rows = rows.slice(0, limitN)
    return { data: single ? (rows[0] ?? null) : rows.map(r => ({ ...r })), error: null }
  }
  const api: Record<string, unknown> = {
    select: () => api,
    upsert: (rows: Row | Row[], opts?: { onConflict?: string }) => { op = 'upsert'; payload = Array.isArray(rows) ? rows : [rows]; onConflict = opts?.onConflict ? opts.onConflict.split(',') : null; return api },
    eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return api },
    gte: (c: string, v: unknown) => { filters.push(r => cmp(r[c], v) >= 0); return api },
    lte: (c: string, v: unknown) => { filters.push(r => cmp(r[c], v) <= 0); return api },
    order: (c: string, opts?: { ascending?: boolean }) => { orders.push([c, opts?.ascending !== false]); return api },
    limit: (n: number) => { limitN = n; return api },
    maybeSingle: () => { single = true; return api },
    single: () => { single = true; return api },
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => Promise.resolve().then(() => resolve(exec()), reject),
  }
  return api
}

// Sam, from the test log: 82 kg at sign-up, losing fat.
const sam = (id: string): UserProfile => ({
  id, name: 'Sam', age: 34, gender: 'male', height_cm: 178, weight_kg: 82,
  fitness_goal: 'fat_loss', activity_level: 'light', experience_level: 'beginner',
  available_days: ['Monday', 'Wednesday', 'Friday'], equipment_access: 'full_gym',
  dietary_preferences: [], disliked_foods: [], injuries: [],
  macro_calculation_mode: 'STANDARD_STATIC',
} as unknown as UserProfile)

async function main() {
  const { setSupabaseClient } = await import('../src/lib/supabase')
  setSupabaseClient({ from: fakeFrom } as never)
  // Loosely typed: on the tree before the fix some of these did not exist.
  const nt = await import('../src/lib/nutrition-targets') as unknown as Record<string, (...a: never[]) => unknown> & typeof import('../src/lib/nutrition-targets')
  const { upsertDailyMetric } = await import('../src/lib/daily-tracking')
  const { setDevClockOverride } = await import('../src/lib/dev-clock')
  const { targetsMoved } = await import('../src/lib/coach-voice')
  const wt = await import('../src/lib/weight-trend') as unknown as Record<string, (...a: never[]) => unknown> & typeof import('../src/lib/weight-trend')
  const wicApp = await import('../src/lib/weigh-in-check').catch(() => null)
  const wicCoach = await import('../supabase/functions/_shared/weigh-in-check.ts').catch(() => null)

  const kcalAt = (p: UserProfile, kg: number) => nt.computeTargets(p, { latestWeightKg: kg })!.calories

  /** What the app does when the plan is made, and when a weigh-in is saved — by its own functions where they exist. */
  const signUp = async (p: UserProfile, date: string) => {
    setDevClockOverride(p.id!, date)
    const targets = nt.computeTargets(p)
    // App.handleOnboardingComplete: the seed weigh-in, dated today…
    await upsertDailyMetric({ profile_id: p.id!, date, weight_kg: p.weight_kg! } as never)
    // …and (since the fix) the first anchor.
    const anchor = typeof nt.anchorTargetsAtSignUp === 'function'
      ? await (nt.anchorTargetsAtSignUp as unknown as (id: string, p: UserProfile, t: MacroTargets | null) => Promise<number | null>)(p.id!, p, targets)
      : null
    return { targets: targets!, anchor }
  }
  const weighIn = async (p: UserProfile, date: string, kg: number): Promise<{ targets: MacroTargets; anchorKg: number | null; notice: string | null }> => {
    setDevClockOverride(p.id!, date)
    await upsertDailyMetric({ profile_id: p.id!, date, weight_kg: kg } as never)
    if (typeof nt.retargetAfterWeighIn === 'function') {
      const r = await (nt.retargetAfterWeighIn as unknown as (id: string, p: UserProfile) => Promise<{ targets: MacroTargets; anchorKg: number | null; recorded: Promise<{ changedFromPrior: boolean; previous: MacroTargets | null }> }>)(p.id!, p)
      const rec = await r.recorded
      const moved = rec.previous && r.targets ? targetsMoved(rec.previous, r.targets, 'weigh_in') : null
      return { targets: r.targets, anchorKg: r.anchorKg, notice: rec.changedFromPrior && moved ? moved : null }
    }
    // The handler as it stood before the fix, line for line (App.tsx handleWeightLogged).
    const weight = await nt.getLatestWeightKg(p.id!).catch(() => null)
    const eff = await nt.getEffectiveTargetWeightKg(p.id!, weight ?? p.weight_kg)
    const targets = nt.computeTargets(p, { latestWeightKg: eff.weightKg })!
    const rec = await nt.snapshotTargetsIfChanged(p.id!, p, targets, eff.weightKg)
    const moved = rec.previous ? targetsMoved(rec.previous, targets, 'weigh_in') : null
    return { targets, anchorKg: eff.weightKg ?? null, notice: rec.changedFromPrior && moved ? moved : null }
  }

  console.log('\n0. The fixture can tell the difference (sanity checks on this gate)\n')
  {
    const p = sam('fixture')
    const t82 = nt.computeTargets(p, { latestWeightKg: 82 })!
    check('the fixture has real targets — four whole numbers, nothing missing', [t82.calories, t82.protein, t82.carbs, t82.fat].every(n => Number.isInteger(n) && n > 0), t82)
    check('82 kg and 81.2 kg give DIFFERENT calorie targets, so "the target held" means something',
      kcalAt(p, 82) !== kcalAt(p, 81.2), [kcalAt(p, 82), kcalAt(p, 81.2)])
    check('...and so do 82 kg and 83 kg', kcalAt(p, 82) !== kcalAt(p, 83), [kcalAt(p, 82), kcalAt(p, 83)])
    check('the threshold under test is 1 kg', nt.TARGET_WEIGHT_ANCHOR_THRESHOLD_KG === 1, nt.TARGET_WEIGHT_ANCHOR_THRESHOLD_KG)
  }

  console.log('\n1. Sign up at 82 kg, weigh in at 81.2 kg the same day: the target holds\n')
  const p = sam('sam-1')
  const start = await signUp(p, '2026-03-02')
  {
    const targetRows = (db.daily_nutrition_targets ?? []).filter(r => r.profile_id === p.id)
    check('signing up records what set the targets: one row, anchored at the 82 kg given', targetRows.length === 1 && targetRows[0].calculated_weight_kg === 82, targetRows)
    check('...dated the day of sign-up on the app\'s calendar', targetRows[0]?.date === '2026-03-02', targetRows[0]?.date)
    check('...and the app is handed that anchor for the session', start.anchor === 82, start.anchor)

    const same = await weighIn(p, '2026-03-02', 81.2)
    check('the weigh-in replaced the sign-up row for that day (one row a day — the collision behind this bug)',
      (db.daily_metrics ?? []).filter(r => r.profile_id === p.id).length === 1 && (db.daily_metrics ?? []).find(r => r.profile_id === p.id)?.weight_kg === 81.2, db.daily_metrics)
    check('the calorie target is exactly what it was at sign-up — 0.8 kg is inside the 1 kg rule',
      same.targets.calories === start.targets.calories, { atSignUp: start.targets.calories, after: same.targets.calories })
    check('...protein too', same.targets.protein === start.targets.protein, { atSignUp: start.targets.protein, after: same.targets.protein })
    check('...the anchor is still the 82 kg', same.anchorKg === 82, same.anchorKg)
    check('...and nothing is announced, because nothing changed', same.notice === null, same.notice)
    check('...and no second target row was written', (db.daily_nutrition_targets ?? []).filter(r => r.profile_id === p.id).length === 1)
  }

  console.log('\n2. Three later days averaging 84 kg: the target moves, and says from what to what\n')
  {
    const d1 = await weighIn(p, '2026-03-03', 84.4)   // 7-day mean (81.2, 84.4) = 82.8: 0.8 from 82 — holds
    check('one heavier day does not move it: the average is 82.8, still inside 1 kg', d1.targets.calories === start.targets.calories && d1.notice === null, d1)
    const d2 = await weighIn(p, '2026-03-04', 83.8)   // mean (81.2, 84.4, 83.8) = 83.13: 1.13 from 82 — MOVES
    const d3 = await weighIn(p, '2026-03-05', 83.8)   // mean of four = 83.3: 0.17 from the new anchor — holds
    check('the three later days average 84 kg (the fixture is what it says)', Math.abs((84.4 + 83.8 + 83.8) / 3 - 84) < 0.001)
    check('once the 7-day average is a kilo off the anchor, the target moves', d2.targets.calories !== start.targets.calories, { start: start.targets.calories, d2: d2.targets.calories })
    check('...to the target for the AVERAGE (83.13 kg), not for that day\'s reading (83.8 kg)',
      d2.targets.calories === kcalAt(p, (81.2 + 84.4 + 83.8) / 3) && Math.abs((d2.anchorKg ?? 0) - 83.1333) < 0.01, { anchor: d2.anchorKg, kcal: d2.targets.calories })
    const fmt = (n: number) => n.toLocaleString('en-GB')
    check('the notice names what it moved FROM and TO', typeof d2.notice === 'string' && d2.notice.includes(fmt(start.targets.calories)) && d2.notice.includes(fmt(d2.targets.calories)), d2.notice)
    check('...and gives the weigh-ins as the reason', typeof d2.notice === 'string' && /weigh-in/i.test(d2.notice), d2.notice)
    check('the next day, a fraction of a kilo on, it holds again and says nothing', d3.targets.calories === d2.targets.calories && d3.notice === null, d3)
    const rows = (db.daily_nutrition_targets ?? []).filter(r => r.profile_id === p.id).sort((a, b) => cmp(a.date, b.date))
    check('the history holds the sign-up target and the moved one, each on its own day',
      rows.length === 2 && rows[0].date === '2026-03-02' && rows[0].target_calories === start.targets.calories && rows[1].date === '2026-03-04' && rows[1].target_calories === d2.targets.calories, rows.map(r => [r.date, r.target_calories, r.calculated_weight_kg]))
  }

  console.log('\n3. A drop of a whole kilo on the day DOES move it (the rule is 1 kg, not "never on day one")\n')
  {
    const q = sam('sam-2')
    const s0 = await signUp(q, '2026-03-02')
    const same = await weighIn(q, '2026-03-02', 80.9)
    check('82 kg -> 80.9 kg the same day moves the target', same.targets.calories !== s0.targets.calories && same.anchorKg === 80.9, same)
    check('...with a notice, because there was a target to move from', typeof same.notice === 'string' && same.notice.length > 0, same.notice)
    const r = sam('sam-3')
    const r0 = await signUp(r, '2026-03-02')
    const edge = await weighIn(r, '2026-03-02', 81.01)
    check('...and 0.99 kg does not', edge.targets.calories === r0.targets.calories && edge.notice === null, edge)
    const x = sam('sam-3b')
    const x0 = await signUp(x, '2026-03-02')
    const exact = await weighIn(x, '2026-03-02', 81)
    check('...and exactly 1 kg does: the rule is "shifted 1 kg or more"', exact.anchorKg === 81 && exact.targets.calories !== x0.targets.calories, exact)
  }

  console.log('\n4. "Today" is the app\'s date, in one place\n')
  {
    // Every step above ran with the app's clock in March while this machine's
    // calendar says something else. A window anchored on the machine's date
    // finds no weigh-in in "the last 7 days" at all.
    const t = sam('sam-4')
    await signUp(t, '2026-03-02')
    await weighIn(t, '2026-03-09', 84)   // a week on: the sign-up row is 7 days old, outside the window
    setDevClockOverride(t.id!, '2026-03-09')
    const eff = await nt.getEffectiveTargetWeightKg(t.id!, 82)
    check('the 7-day window sits on the app\'s date: on the 9th it holds the 9th and not the 2nd', eff.weightKg === 84, eff)
    setDevClockOverride(t.id!, '2026-03-20')
    const later = await nt.getEffectiveTargetWeightKg(t.id!, 82)
    check('...and eleven days after the last weigh-in there is no average to follow, so the standing figure is used', later.weightKg === 82, later)
    const earliest = nt.getEarliestWeightKg as unknown as ((id: string) => Promise<number | null>) | undefined
    check('the first weigh-in ever can be read back (the starting weight for someone who gave none)', typeof earliest === 'function' && (await earliest(t.id!)) === 82 && (await earliest('nobody')) === null, typeof earliest === 'function' ? await earliest(t.id!) : 'missing')
    check('one function says what "today" is', typeof nt.targetsToday === 'function' && (nt.targetsToday as unknown as (id: string) => string)(t.id!) === '2026-03-20')
    const src = strip(raw('src/lib/nutrition-targets.ts'))
    const fn = (name: string) => { const i = src.indexOf(`export async function ${name}`); const j = src.indexOf('\nexport ', i + 10); return i < 0 ? '' : src.slice(i, j < 0 ? src.length : j) }
    check('getEffectiveTargetWeightKg and snapshotTargetsIfChanged both ask it',
      /targetsToday\(profileId\)/.test(fn('getEffectiveTargetWeightKg')) && /targetsToday\(profileId\)/.test(fn('snapshotTargetsIfChanged')))
    check('...and neither reads the UTC date', !/toISOString\(\)/.test(fn('getEffectiveTargetWeightKg')) && !/toISOString\(\)/.test(fn('snapshotTargetsIfChanged')))
  }

  console.log('\n5. Is this weigh-in believable? One check, a verdict only\n')
  {
    const C = wicApp?.checkWeighIn
    check('the check exists', typeof C === 'function')
    const c = (n: number, l: number | null | undefined, d: number | null | undefined) => (C ? C(n, l, d) : { verdict: 'missing' }) as { verdict: string; differenceKg?: number; allowedKg?: number }
    check('81.2 kg an hour after 82 kg is fine', c(81.2, 82, 0).verdict === 'ok', c(81.2, 82, 0))
    const typo = c(62, 81.2, 0)
    check('62 kg an hour after 81.2 kg is surprising', typo.verdict === 'surprising', typo)
    check('...and says by how much: 19.2 kg lighter', typo.differenceKg === -19.2, typo)
    check('...and what would have been believed: about 2.4 kg', typo.allowedKg === 2.4, typo)
    check('heavier is judged the same as lighter', c(101, 81.2, 0).verdict === 'surprising' && c(101, 81.2, 0).differenceKg === 19.8, c(101, 81.2, 0))
    check('the line is 3% on the same day: 2.4 kg at 82 kg is fine, 2.6 kg is not', c(84.4, 82, 0).verdict === 'ok' && c(84.6, 82, 0).verdict === 'surprising' && c(79.6, 82, 0).verdict === 'ok' && c(79.4, 82, 0).verdict === 'surprising')
    check('time makes a bigger change believable: 13 kg after 90 days is fine, 14 kg is not', c(69, 82, 90).verdict === 'ok' && c(68, 82, 90).verdict === 'surprising', [c(69, 82, 90), c(68, 82, 90)])
    check('...but not the same day\'s typo: 13 kg in a day is surprising', c(69, 82, 0).verdict === 'surprising')
    check('a first-ever weigh-in has nothing to be surprising against', c(62, null, null).verdict === 'ok' && c(62, undefined, 0).verdict === 'ok')
    check('an unknown gap is read as the same day, the strictest reading', c(62, 81.2, null).verdict === 'surprising')
    const days = wicApp?.calendarDaysBetween
    check('days are counted on the calendar: across the March clock change, 28th to 30th is 2', typeof days === 'function' && days('2026-03-28', '2026-03-30') === 2 && days('2026-03-02', '2026-03-02') === 0 && days('2026-02-27', '2026-03-01') === 2)
    // The coach's copy is this file, generated. Same answers over a grid.
    let disagreements = 0, cells = 0
    if (wicApp && wicCoach) for (const last of [50, 81.2, 120]) for (const delta of [-25, -3, -2.4, -0.5, 0, 0.5, 2.4, 3, 25]) for (const d of [0, 1, 7, 90]) {
      cells++
      if (JSON.stringify(wicApp.checkWeighIn(last + delta, last, d)) !== JSON.stringify(wicCoach.checkWeighIn(last + delta, last, d))) disagreements++
    }
    check('the coach\'s copy gives the same verdict in all 108 cases', cells === 108 && disagreements === 0, { cells, disagreements })
  }

  console.log('\n6. Every place a weight is typed asks it — and a surprising one changes nothing she can see, yet\n')
  {
    const card = strip(raw('src/components/WeighInCard.tsx'))
    const profileScreen = strip(raw('src/components/ProfileScreen.tsx'))
    const coach = strip(raw('supabase/functions/chat-gemini/index.ts'))
    const handler = coach.slice(coach.indexOf('name === "log_weight"'), coach.indexOf('name === "propose_session_activity_swap"'))
    check('the weigh-in card calls the check with the weight being saved', /checkWeighIn\(kg,/.test(card), card.match(/checkWeighIn\([^)]*\)/)?.[0])
    check('the Profile weight field calls it', /checkWeighIn\(/.test(profileScreen), profileScreen.match(/checkWeighIn\([^)]*\)/)?.[0])
    check('the coach\'s log_weight handler was found (sanity check on this check)', handler.length > 300, handler.length)
    check('the coach\'s log_weight calls it, from the generated copy', /checkWeighIn\(weightKg,/.test(handler) && /import \{[^}]*checkWeighIn[^}]*\} from "\.\.\/_shared\/weigh-in-check\.ts"/.test(coach))
    // The verdict is held, not acted on. No sentence is chosen by it and no
    // save is skipped because of it — that is the owner decision still open.
    const acts = (src: string) => /verdict === 'surprising'\s*\)\s*(return|\{[^}]*return)/.test(src) || /surprising['"]\s*\?\s*[`'"]/.test(src)
    check('nothing on the card refuses or rewords a save on the verdict', !acts(card))
    check('nothing on Profile does', !acts(profileScreen))
    // In the handler the verdict may be DECLARED, ASSIGNED and LOGGED. Any other
    // line that mentions it is the verdict reaching the reply, the model or a
    // decision — which is the ruling being made in code before she has made it.
    const mentions = handler.split('\n').filter(l => /weighInCheck/.test(l))
    const allowed = mentions.filter(l => /^\s*let weighInCheck\b/.test(l) || /^\s*weighInCheck = checkWeighIn\(/.test(l) || /^\s*console\.log\(`weigh-in check /.test(l))
    check('in the coach\'s handler the verdict is declared, assigned and logged — and appears nowhere else', mentions.length === 3 && allowed.length === 3, mentions.map(l => l.trim().slice(0, 90)))
    check('the card no longer claims targets recalculate from the LATEST weigh-in', !/recalculate from your latest weigh-in/i.test(card))
    check('...and neither does the coach\'s own sentence', !/recalculate from your latest weigh-in/i.test(handler))
  }

  console.log('\n7. The line under the weigh-in box says what the targets follow, and how thin the average is\n')
  {
    const line = wt.weighInAverageLine as unknown as ((t: unknown) => string) | undefined
    const say = (weighIns: [string, number][], today: string) => line ? line(wt.computeWeightTrend(weighIns.map(([date, weightKg]) => ({ date, weightKg })), today, null)) : ''
    check('the wording function exists', typeof line === 'function')
    check('one weigh-in: "avg of 1 weigh-in", not "7-day avg"', say([['2026-03-02', 81.2]], '2026-03-02') === 'Targets follow your 7-day average · avg of 1 weigh-in 81.2 kg', say([['2026-03-02', 81.2]], '2026-03-02'))
    check('two: "avg of 2 weigh-ins"', say([['2026-03-02', 81.2], ['2026-03-03', 84.4]], '2026-03-03') === 'Targets follow your 7-day average · avg of 2 weigh-ins 82.8 kg', say([['2026-03-02', 81.2], ['2026-03-03', 84.4]], '2026-03-03'))
    check('three or more: "7-day avg"', say([['2026-03-02', 81.2], ['2026-03-03', 84.4], ['2026-03-04', 83.8]], '2026-03-04') === 'Targets follow your 7-day average · 7-day avg 83.1 kg', say([['2026-03-02', 81.2], ['2026-03-03', 84.4], ['2026-03-04', 83.8]], '2026-03-04'))
    check('the average is over the last 7 DAYS, like the targets — an older weigh-in is not in it', say([['2026-02-20', 90], ['2026-03-03', 84.4], ['2026-03-04', 83.6]], '2026-03-04') === 'Targets follow your 7-day average · avg of 2 weigh-ins 84 kg', say([['2026-02-20', 90], ['2026-03-03', 84.4], ['2026-03-04', 83.6]], '2026-03-04'))
    check('nothing in the last week: no average is quoted at all', say([['2026-02-20', 90]], '2026-03-04') === 'Targets follow your 7-day average', say([['2026-02-20', 90]], '2026-03-04'))
    check('the card prints that function\'s line', /weighInAverageLine\(/.test(strip(raw('src/components/WeighInCard.tsx'))))
  }

  console.log('\n8. The change on Home is measured from the starting weight (L31)\n')
  {
    const since = wt.changeSinceStart as unknown as ((start: number | null | undefined, series: { kg: number }[]) => number | null) | undefined
    const s = (start: number | null | undefined, kgs: number[]) => since ? since(start, kgs.map(kg => ({ kg }))) : undefined
    check('the function exists', typeof since === 'function')
    check('started at 82, a same-day weigh-in of 81.2 replaced the sign-up row: 0.8 kg down, measured from 82', Math.abs((s(82, [81.2]) ?? 9) - -0.8) < 1e-9, s(82, [81.2]))
    check('...then 81.0: 1.0 kg down — the test log showed -0.2, measured from the first weigh-in', Math.abs((s(82, [81.2, 81.0]) ?? 9) - -1.0) < 1e-9, s(82, [81.2, 81.0]))
    // The series is the last 14 weigh-ins. After fifteen, the first has gone.
    const fifteen = Array.from({ length: 15 }, (_, i) => 82 - i * 0.2)   // 82.0 … 79.2
    const lastFourteen = fifteen.slice(1)
    check('after 15 weigh-ins the baseline is still where she started, not "14 entries ago"', Math.abs((s(82, lastFourteen) ?? 9) - (79.2 - 82)) < 1e-9, s(82, lastFourteen))
    check('only the sign-up weight so far: nothing to show, not "0.0 kg"', s(82, [82]) === null, s(82, [82]))
    check('no weigh-in: nothing to show', s(82, []) === null)
    check('no starting weight: nothing is invented', s(null, [81.2, 80.9]) === null && s(undefined, [81.2]) === null)
    const dash = strip(raw('src/components/Dashboard.tsx'))
    check('Home shows that figure', /changeSinceStart\(/.test(dash))
    check('...labelled "since you started"', /since you started/.test(dash) && !/since week 1/.test(dash))
    check('...from the starting weight the dashboard data carries', /startingWeightKg/.test(dash) && /startingWeightKg/.test(strip(raw('src/lib/dashboard-data.ts'))))
  }

  console.log('\n9. The app actually takes these roads\n')
  {
    const app = strip(raw('src/App.tsx'))
    const onboarding = app.slice(app.indexOf('const commitPlan = () =>'), app.indexOf('const handleMacroModeChange'))
    check('the onboarding path was found (sanity check on this check)', onboarding.length > 2000, onboarding.length)
    check('signing up writes the first anchor', /anchorTargetsAtSignUp\(data\.id, enrichedProfile, calculatedMacros\)/.test(onboarding))
    check('...and puts it in the session\'s state, so the first weigh-in reads it without a reload', /anchorTargetsAtSignUp\([\s\S]{0,300}setTargetWeightAnchorKg\(anchorKg\)/.test(onboarding))
    const handler = app.slice(app.indexOf('const handleWeightLogged = async () =>'), app.indexOf('const handleWeightLogged = async () =>') + 1400)
    check('a saved weigh-in goes through the one retarget function', /retargetAfterWeighIn\(profile\.id, profile, exercisePlan\)/.test(handler))
    check('...and its three results reach the screen', /setLatestWeightKg\(retarget\.latestWeightKg\)/.test(handler) && /setTargetWeightAnchorKg\(retarget\.anchorKg\)/.test(handler) && /setMacros\(targets\)/.test(handler))
    check('...and its notice is the phrasebook\'s, only when something moved', /retarget\.recorded\.then\([\s\S]{0,300}targetsMoved\([\s\S]{0,200}result\.changedFromPrior && moved/.test(handler))
  }

  console.log(`\n${ran} checks ran.`)
  if (failures > 0) { console.error(`${failures} check(s) failed\n`); process.exit(1) }
  console.log('Targets follow the 7-day average, from the first day.\n')
}

main().catch(err => { console.error(err); process.exit(1) })

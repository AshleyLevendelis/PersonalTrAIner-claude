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
//      weight is typed;
//   5. the change shown on Home is measured from the starting weight (L31);
//   6. ASHLEY'S RULING OF 9 OCT 2026, "Ask, and hold the target" (sections
//      10-12): a weigh-in far from the last one is ASKED about before it is
//      saved, and once saved does not move the calorie target until another
//      day's weigh-in agrees with it — then the target moves, with the notice.
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

  console.log('\n6. Every place a weight is typed asks it, and none of them saves a surprising one unasked\n')
  {
    // RE-ANCHORED 9 Oct 2026 ON ASHLEY'S RULING. Until she ruled, this section
    // pinned the opposite: "the verdict is held, not acted on — nothing
    // refuses or rewords a save". She chose "Ask, and hold the target", so
    // each place now has to ask BEFORE it writes.
    const card = strip(raw('src/components/WeighInCard.tsx'))
    const profileScreen = strip(raw('src/components/ProfileScreen.tsx'))
    const coach = strip(raw('supabase/functions/chat-gemini/index.ts'))
    const handler = coach.slice(coach.indexOf('name === "log_weight"'), coach.indexOf('name === "propose_session_activity_swap"'))
    check('the weigh-in card asks the shared question with the weight being saved', /weighInQuestion\(kg,/.test(card), card.match(/weighInQuestion\([^)]*\)/)?.[0])
    {
      // In the card's save handler the question is asked first, and when there
      // is one the handler leaves before anything is written.
      const i = card.indexOf('const handleSave = async')
      const body = card.slice(i, card.indexOf('const handleCorrect'))
      const ask = body.indexOf('weighInQuestion(kg,')
      const leave = body.search(/if \(question\) \{[\s\S]{0,80}?return/)
      const write = body.search(/await save\(kg\)/)
      check('...and when there is a question it stops before the save', i >= 0 && ask >= 0 && leave > ask && write > leave, { ask, leave, write })
      check('...the card writes a weigh-in in one place only, behind that', (card.match(/upsertDailyMetric\(/g) ?? []).length === 1 && !/upsertDailyMetric\(/.test(body))
    }
    check('the Profile weight field calls the check', /checkWeighIn\(n,/.test(profileScreen), profileScreen.match(/checkWeighIn\([^)]*\)/)?.[0])
    {
      const i = profileScreen.indexOf('data-testid="profile-weight-field"')
      const field = profileScreen.slice(i, profileScreen.indexOf('<Row label="Current weight">'))
      const leave = field.search(/verdict\.verdict === 'surprising'[^{]*\{[\s\S]{0,200}?return/)
      const write = field.indexOf("savePatch({ weight_kg: n })")
      check('...and on a surprising figure it stops before the save', i >= 0 && leave >= 0 && write > leave, { leave, write })
      check('...the only other save of a weight there is behind the "yes" button', (field.match(/savePatch\(\{ weight_kg/g) ?? []).length === 2 && /profile-weight-yes[\s\S]{0,200}savePatch\(\{ weight_kg: kg \}\)/.test(field))
    }
    check('the coach\'s log_weight handler was found (sanity check on this check)', handler.length > 300, handler.length)
    check('the coach\'s log_weight asks the same question, from the generated copy', /weighInQuestion\(weightKg,/.test(handler) && /import \{[^}]*weighInQuestion[^}]*\} from "\.\.\/_shared\/weigh-in-check\.ts"/.test(coach))
    {
      const ask = handler.indexOf('weighInQuestion(weightKg,')
      const leave = handler.search(/if \(weighInAsk\) \{[\s\S]{0,900}?kind: "propose_weigh_in"/)
      const write = handler.indexOf('daily_metrics?on_conflict')
      const firstWrite = handler.search(/method: "POST"/)
      check('...and a surprising weight goes back as a proposal BEFORE anything is written', ask >= 0 && leave > ask && write > leave && firstWrite > leave, { ask, leave, write, firstWrite })
      const proposal = handler.slice(leave, write)
      check('...the proposal carries the weight and the day, and returns', /weight_kg: weightKg/.test(proposal) && /date: context\.current_local_date/.test(proposal) && /return new Response/.test(proposal))
      check('...and on that turn the coach says nothing of its own (the card\'s sentence is the app\'s)', /reply: ""/.test(proposal))
    }
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

  // -------------------------------------------------------------------------
  // ASHLEY'S RULING, 9 Oct 2026 — "Ask, and hold the target".
  // -------------------------------------------------------------------------
  type Reading = { date: string; kg: number }
  type Question = { differenceKg: number; againstKg: number; daysSince: number } | null
  const ask = (wicApp as unknown as { weighInQuestion?: (kg: number, today: string, readings: Reading[], anchors?: Reading[] | null) => Question } | null)?.weighInQuestion
  const askText = (wicApp as unknown as { weighInQuestionText?: (q: NonNullable<Question>, kg: number) => string } | null)?.weighInQuestionText
  const standing = (wicApp as unknown as { weighInStanding?: (readings: Reading[], anchors?: Reading[] | null) => { trusted: Reading[]; held: (Reading & { against: Reading })[] } } | null)?.weighInStanding
  const picture = nt.getWeighInPicture as unknown as ((id: string) => Promise<{ today: string; recent: { date: string; weight_kg: number }[]; anchors: Reading[]; standing: { trusted: Reading[]; held: Reading[] }; heldLatest: Reading | null }>) | undefined
  /** What the weigh-in box does: ask the question against what is saved; `said` is her answer when asked. Returns whether it asked and whether it saved. */
  const typeWeighIn = async (p: UserProfile, date: string, kg: number, said: 'yes' | 'no' = 'yes') => {
    setDevClockOverride(p.id!, date)
    const pic = picture ? await picture(p.id!) : null
    const question = ask && pic ? ask(kg, pic.today, pic.recent.map(w => ({ date: w.date, kg: w.weight_kg })), pic.anchors) : null
    if (question && said === 'no') return { asked: question, saved: false as const, result: null }
    return { asked: question, saved: true as const, result: await weighIn(p, date, kg) }
  }
  const linesUnderBox = async (p: UserProfile) => {
    const pic = picture ? await picture(p.id!) : null
    const line = wt.weighInAverageLine as unknown as (t: unknown) => string
    return pic ? { line: line(wt.computeWeightTrend(pic.standing.trusted.map(w => ({ date: w.date, weightKg: w.kg })), pic.today, null)), held: pic.heldLatest } : { line: '', held: null }
  }

  console.log('\n10. A weigh-in far from the last one is ASKED about before it is saved\n')
  {
    check('the question, the standing and the picture exist', typeof ask === 'function' && typeof askText === 'function' && typeof standing === 'function' && typeof picture === 'function')
    const q = (kg: number, today: string, readings: Reading[], anchors?: Reading[]) => (ask ? ask(kg, today, readings, anchors) : undefined)
    const typo = q(62, '2026-03-02', [{ date: '2026-03-02', kg: 81.2 }])
    check('62 kg an hour after 81.2 kg: asked, 19.2 kg lighter, against today\'s own weigh-in', !!typo && typo.differenceKg === -19.2 && typo.againstKg === 81.2 && typo.daysSince === 0, typo)
    const text = (qq: Question | undefined, kg: number) => (qq && askText ? askText(qq, kg) : '')
    check('...in these words', text(typo, 62) === "That's 19.2 kg lighter than earlier today — is 62 kg right?", text(typo, 62))
    check('81.2 kg an hour after 82 kg: not asked', q(81.2, '2026-03-02', [{ date: '2026-03-02', kg: 82 }]) === null)
    check('heavier is asked the same way', text(q(101, '2026-03-02', [{ date: '2026-03-02', kg: 81 }]), 101) === "That's 20 kg heavier than earlier today — is 101 kg right?", text(q(101, '2026-03-02', [{ date: '2026-03-02', kg: 81 }]), 101))
    check('the time since the last one is said: yesterday', /lighter than yesterday — is 62 kg right\?$/.test(text(q(62, '2026-03-03', [{ date: '2026-03-02', kg: 81.2 }]), 62)), text(q(62, '2026-03-03', [{ date: '2026-03-02', kg: 81.2 }]), 62))
    check('...five days', /than your last weigh-in 5 days ago —/.test(text(q(62, '2026-03-07', [{ date: '2026-03-02', kg: 81.2 }]), 62)), text(q(62, '2026-03-07', [{ date: '2026-03-02', kg: 81.2 }]), 62))
    check('...three weeks', /than your last weigh-in 3 weeks ago —/.test(text(q(55, '2026-03-23', [{ date: '2026-03-02', kg: 81.2 }]), 55)), text(q(55, '2026-03-23', [{ date: '2026-03-02', kg: 81.2 }]), 55))
    check('...four months', /than your last weigh-in 4 months ago —/.test(text(q(50, '2026-06-30', [{ date: '2026-03-02', kg: 95 }]), 50)), text(q(50, '2026-06-30', [{ date: '2026-03-02', kg: 95 }]), 50))
    check('no sentence can read "NaN" or "undefined"', ![text(typo, 62), text(q(101, '2026-03-02', [{ date: '2026-03-02', kg: 81 }]), 101)].some(t => /NaN|undefined/.test(t)))
    // SOMEBODY BACK AFTER MONTHS MUST GET THROUGH. 11 kg down after four months is not even asked about.
    check('back after four months, 11 kg lighter: not asked at all', q(84, '2026-06-30', [{ date: '2026-03-02', kg: 95 }]) === null)
    check('a first-ever weigh-in: nothing to ask against', q(62, '2026-03-02', []) === null)
    check('a weigh-in that agrees with yesterday\'s confirmed surprise is not asked about again',
      q(62.4, '2026-03-03', [{ date: '2026-03-02', kg: 62 }], [{ date: '2026-03-02', kg: 82 }]) === null)
    // Fine against this morning's, but 4.3 kg from yesterday's: it would be held, so it is asked about — against yesterday's.
    const drift = q(80.2, '2026-03-03', [{ date: '2026-03-02', kg: 84.5 }, { date: '2026-03-03', kg: 82.5 }])
    check('nothing is held without being asked: fine against this morning but 4.3 kg from yesterday is asked, against yesterday', !!drift && drift.againstKg === 84.5 && drift.daysSince === 1 && drift.differenceKg === -4.3, drift)
    check('a weigh-in dated in the future is not "the last one"', q(81, '2026-03-02', [{ date: '2026-03-05', kg: 60 }, { date: '2026-03-01', kg: 81.2 }]) === null)
    // The coach's copy asks the same.
    const coachAsk = (wicCoach as unknown as { weighInQuestion?: typeof ask } | null)?.weighInQuestion
    let differ = 0, cells = 0
    if (ask && coachAsk) for (const kg of [50, 62, 79, 81.2, 84, 101]) for (const today of ['2026-03-02', '2026-03-03', '2026-04-20']) for (const readings of [[], [{ date: '2026-03-02', kg: 81.2 }], [{ date: '2026-03-01', kg: 84.5 }, { date: '2026-03-02', kg: 62 }]] as Reading[][]) for (const anchors of [undefined, [{ date: '2026-03-01', kg: 82 }]] as (Reading[] | undefined)[]) {
      cells++
      if (JSON.stringify(ask(kg, today, readings, anchors)) !== JSON.stringify(coachAsk(kg, today, readings, anchors))) differ++
    }
    check('the coach\'s copy asks the same question in all 108 cases', cells === 108 && differ === 0, { cells, differ })
    check('"agrees" is the target rule\'s own kilo', (wicApp as unknown as { WEIGH_IN_AGREES_WITHIN_KG?: number } | null)?.WEIGH_IN_AGREES_WITHIN_KG === nt.TARGET_WEIGHT_ANCHOR_THRESHOLD_KG)
  }

  console.log('\n11. Saved on her yes — and the calorie target HOLDS until another day agrees\n')
  {
    // The test log, to the letter: sign up at 82, weigh in at 81.2, then type 62 the same day.
    const h = sam('hold-1')
    const s0 = await signUp(h, '2026-03-02')
    await typeWeighIn(h, '2026-03-02', 81.2)
    const no = await typeWeighIn(h, '2026-03-02', 62, 'no')
    check('62 after 81.2 is asked about', !!no.asked && no.asked.differenceKg === -19.2, no.asked)
    check('"No, change it": nothing is saved — today\'s weigh-in is still 81.2', no.saved === false && (db.daily_metrics ?? []).find(r => r.profile_id === h.id)?.weight_kg === 81.2, (db.daily_metrics ?? []).filter(r => r.profile_id === h.id))
    const yes = await typeWeighIn(h, '2026-03-02', 62, 'yes')
    check('"Yes": it is saved', yes.saved === true && (db.daily_metrics ?? []).find(r => r.profile_id === h.id)?.weight_kg === 62)
    check('...and the calorie target is exactly what it was', yes.result?.targets.calories === s0.targets.calories && yes.result?.targets.protein === s0.targets.protein, { before: s0.targets.calories, after: yes.result?.targets.calories })
    check('...the anchor is still the 82 kg', yes.result?.anchorKg === 82, yes.result?.anchorKg)
    check('...nothing is announced, and no new target is recorded', yes.result?.notice === null && (db.daily_nutrition_targets ?? []).filter(r => r.profile_id === h.id).length === 1, yes.result?.notice)
    check('...Sam\'s 62 kg would have cut the target (the fixture can tell)', kcalAt(h, 62) < s0.targets.calories - 100, [kcalAt(h, 62), s0.targets.calories])
    const under = await linesUnderBox(h)
    check('the box knows the newest weigh-in is waiting', under.held?.kg === 62, under.held)
    check('...and the average it quotes does not include it', !/62/.test(under.line), under.line)
    const note = (wicApp as unknown as { weighInHeldNote?: (kg: number) => string } | null)?.weighInHeldNote
    check('...and says so: saved, target stays, will follow once another day agrees', typeof note === 'function' && /^62 kg is saved\./.test(note(62)) && /calorie target stays where it is/.test(note(62)) && /once another day's weigh-in agrees/.test(note(62)), typeof note === 'function' ? note(62) : 'missing')
    // A reload the same day changes nothing: the hold is re-derived, not remembered.
    setDevClockOverride(h.id!, '2026-03-02')
    const reloaded = await nt.getEffectiveTargetWeightKg(h.id!, 62)
    check('a reload the same day still holds (nothing is remembered on the phone; it is worked out from the weigh-ins)', reloaded.weightKg === 82, reloaded)
    // Typing 62 again the same day: fine against today's row, still held, so still asked.
    const again = await typeWeighIn(h, '2026-03-02', 62.2, 'yes')
    check('a second figure the same day is not "another day": still held', again.result?.targets.calories === s0.targets.calories && (await linesUnderBox(h)).held?.kg === 62.2, again.result)

    // THE SECOND DAY AGREES.
    const day2 = await typeWeighIn(h, '2026-03-03', 62.5)
    check('next day, 62.5 kg: not asked — it agrees with the one waiting', day2.asked === null, day2.asked)
    check('...and now the target moves', day2.result!.targets.calories !== s0.targets.calories, day2.result?.targets)
    check('...to the target for the average of the two days (62.35 kg)', day2.result!.targets.calories === kcalAt(h, (62.2 + 62.5) / 2) && Math.abs((day2.result!.anchorKg ?? 0) - 62.35) < 0.001, { anchor: day2.result?.anchorKg, kcal: day2.result?.targets.calories })
    const fmt = (n: number) => n.toLocaleString('en-GB')
    check('...with the usual notice, naming from and to', typeof day2.result!.notice === 'string' && day2.result!.notice!.includes(fmt(s0.targets.calories)) && day2.result!.notice!.includes(fmt(day2.result!.targets.calories)), day2.result?.notice)
    check('...and nothing is waiting any more', (await linesUnderBox(h)).held === null)
    const day3 = await typeWeighIn(h, '2026-03-04', 62.4)
    check('the day after that it holds again and says nothing', day3.asked === null && day3.result!.targets.calories === day2.result!.targets.calories && day3.result!.notice === null, day3)
  }
  {
    // IT WAS A TYPO, and she says yes by mistake. The next day she weighs in properly.
    const t = sam('hold-2')
    const s0 = await signUp(t, '2026-03-02')
    await typeWeighIn(t, '2026-03-02', 62, 'yes')
    const back = await typeWeighIn(t, '2026-03-03', 81.6)
    check('a typo confirmed by mistake, then 81.6 kg the next day: asked (it is 19.6 kg from yesterday\'s)', !!back.asked && back.asked.differenceKg === 19.6 && back.asked.daysSince === 1, back.asked)
    check('...and the target never moved: 81.6 is within a kilo of where it was set', back.result!.targets.calories === s0.targets.calories && back.result!.notice === null, back.result)
    check('...the typo is never followed, and the new weigh-in is not waiting', (await linesUnderBox(t)).held === null && !/62/.test((await linesUnderBox(t)).line), await linesUnderBox(t))
    const st = standing && picture ? (await picture(t.id!)).standing : null
    check('...it stays in the record as a weigh-in the target does not trust', !!st && st.held.length === 1 && st.held[0].kg === 62 && st.trusted.some(r => r.kg === 81.6), st)
  }
  {
    // Corrected the same day.
    const c = sam('hold-3')
    const s0 = await signUp(c, '2026-03-02')
    await typeWeighIn(c, '2026-03-02', 62, 'yes')
    const fixed = await typeWeighIn(c, '2026-03-02', 81.5)
    check('a typo corrected the same day: asked (heavier than earlier today), saved, not waiting, target unmoved',
      !!fixed.asked && fixed.asked.daysSince === 0 && fixed.result!.targets.calories === s0.targets.calories && (await linesUnderBox(c)).held === null, fixed)
  }
  {
    // BACK AFTER MONTHS AT A VERY DIFFERENT WEIGHT: through in one answer, and the target follows on the second day.
    const r = sam('hold-4')
    const s0 = await signUp(r, '2026-01-05')
    const back = await typeWeighIn(r, '2026-04-20', 60)   // 105 days: 15.4 kg would be believed; 22 kg is asked about
    check('back after 15 weeks, 22 kg lighter: asked once', !!back.asked && back.asked.differenceKg === -22 && back.asked.daysSince === 105, back.asked)
    check('...saved on yes, target held that day', back.saved && back.result!.targets.calories === s0.targets.calories && back.result!.anchorKg === 82, back.result)
    const next = await typeWeighIn(r, '2026-04-21', 60.3)
    check('...and the next day\'s weigh-in is not asked about and moves the target to the new average', next.asked === null && Math.abs((next.result!.anchorKg ?? 0) - 60.15) < 0.001 && typeof next.result!.notice === 'string', next)
    const g = sam('hold-5')
    await signUp(g, '2026-01-05')
    const gentle = await typeWeighIn(g, '2026-04-20', 71)   // 11 kg in 15 weeks: believable
    check('back after 15 weeks, 11 kg lighter: not asked, and the target moves the same day as it always did', gentle.asked === null && gentle.result!.anchorKg === 71 && typeof gentle.result!.notice === 'string', gentle)
  }
  {
    // A surprise among ordinary days: the average is taken over the others.
    const m = sam('hold-6')
    const s0 = await signUp(m, '2026-03-02')
    await typeWeighIn(m, '2026-03-03', 81.8)
    await typeWeighIn(m, '2026-03-04', 81.9)
    const odd = await typeWeighIn(m, '2026-03-05', 70, 'yes')
    check('a surprise among ordinary days: the average the target follows leaves it out (81.9, not 78.9)', odd.result!.targets.calories === s0.targets.calories && odd.result!.anchorKg === 82 && /81\.9 kg$/.test((await linesUnderBox(m)).line), { r: odd.result, line: (await linesUnderBox(m)).line })
  }
  {
    // The Profile weight field edits the STARTING weight. The target is worked out from the weigh-in anchor, so it cannot move it.
    const p0 = sam('profile-field')
    check('the Profile field cannot move the target: with an anchor, the target does not read the profile\'s weight', kcalAt({ ...p0, weight_kg: 28 } as UserProfile, 82) === kcalAt(p0, 82) && nt.computeTargets({ ...p0, weight_kg: 28 } as UserProfile)!.calories !== kcalAt(p0, 82))
    const app = strip(raw('src/App.tsx'))
    check('...and App recomputes on a profile edit from the anchor first', /computeTargets\(profile, \{\s*latestWeightKg: targetWeightAnchorKg \?\? profile\.weight_kg/.test(app))
    const words = (wicApp as unknown as { profileWeightQuestionText?: (d: number, prev: number, kg: number) => string } | null)?.profileWeightQuestionText
    check('the Profile field\'s question names the figure it replaces', typeof words === 'function' && words(-51, 79, 28) === "That's 51 kg lighter than the 79 kg you gave before — is 28 kg right?", typeof words === 'function' ? words(-51, 79, 28) : 'missing')
  }

  console.log('\n12. The coach: a card instead of a write\n')
  {
    const wp = await import('../src/lib/weigh-in-proposal').catch(() => null)
    check('the card builder and its confirm exist', typeof wp?.buildWeighInProposal === 'function' && typeof wp?.executeWeighIn === 'function')
    const k = sam('coach-1')
    const s0 = await signUp(k, '2026-03-02')
    await typeWeighIn(k, '2026-03-02', 81.2)
    setDevClockOverride(k.id!, '2026-03-02')
    const pic = picture ? await picture(k.id!) : null
    // What the edge function sends: its own reads. The app re-asks from its own.
    const built = wp && pic ? wp.buildWeighInProposal(k.id!, { weight_kg: 62, date: '2026-03-02', difference_kg: -19.2, against_kg: 81.2, days_since: 0 }, pic as never) : null
    check('62 kg told to the coach becomes a card whose sentence is the weigh-in box\'s own question', built?.diff.lead === "That's 19.2 kg lighter than earlier today — is 62 kg right?", built?.diff.lead)
    check('...showing the two figures', built?.diff.rows.length === 1 && built.diff.rows[0].before === '81.2 kg' && built.diff.rows[0].after === '62 kg', built?.diff.rows)
    check('...and saying the target will wait', built?.diff.implications?.some(i => /calorie target stays where it is until another day's weigh-in agrees/.test(i.text)) === true, built?.diff.implications)
    // A beat first: a write started and not awaited would land after this line.
    await new Promise(r => setTimeout(r, 5))
    check('building the card wrote nothing', (db.daily_metrics ?? []).find(r => r.profile_id === k.id)?.weight_kg === 81.2)
    check('a weight outside 25-350 kg builds no card', wp && pic ? wp.buildWeighInProposal(k.id!, { weight_kg: 18, date: '2026-03-02' }, pic as never) === null : false)
    if (wp && built) {
      const done = await wp.executeWeighIn(k.id!, built.payload)
      check('her yes writes the weigh-in, on that day', done.receipt.failed.length === 0 && (db.daily_metrics ?? []).find(r => r.profile_id === k.id && r.date === '2026-03-02')?.weight_kg === 62, done.receipt)
      const r = await (nt.retargetAfterWeighIn as unknown as (id: string, p: UserProfile) => Promise<{ targets: MacroTargets; anchorKg: number | null }>)(k.id!, k)
      check('...and the target holds, as it does from the box', r.targets.calories === s0.targets.calories && r.anchorKg === 82, r)
    } else check('her yes writes the weigh-in, and the target holds', false)
    // A correction of a waiting typo is asked about but is not itself held: the card must not promise a wait.
    const pic2 = picture ? await picture(k.id!) : null
    const fix = wp && pic2 ? wp.buildWeighInProposal(k.id!, { weight_kg: 81.4, date: '2026-03-02', difference_kg: 19.4, against_kg: 62, days_since: 0 }, pic2 as never) : null
    check('a correction told to the coach is asked about, without the line about waiting', !!fix && /heavier than earlier today/.test(fix.diff.lead ?? '') && (fix.diff.implications ?? []).length === 0, fix?.diff)
    const chatUi = strip(raw('src/components/ChatAssistant.tsx'))
    check('the chat builds that card for the coach\'s proposal', /kind === 'propose_weigh_in'[\s\S]{0,300}buildWeighInProposal\(/.test(chatUi))
    check('...confirms it through that executor, then refreshes the targets', /row\.kind === 'propose_weigh_in'[\s\S]{0,700}executeWeighIn\([\s\S]{0,500}onWeightLogged\?\.\(\)/.test(chatUi))
    const { RECEIPTS } = await import('../src/lib/coach-voice')
    check('...and its receipt has a title', typeof RECEIPTS.propose_weigh_in?.done === 'string' && typeof RECEIPTS.propose_weigh_in?.failed === 'string')
  }

  console.log(`\n${ran} checks ran.`)
  if (failures > 0) { console.error(`${failures} check(s) failed\n`); process.exit(1) }
  console.log('Targets follow the 7-day average, from the first day.\n')
}

main().catch(err => { console.error(err); process.exit(1) })

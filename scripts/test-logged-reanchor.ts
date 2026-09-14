// ---------------------------------------------------------------------------
// Gate: once you log a set, the number you are shown comes from what you
// actually lifted — not from the estimate.
//
// Audit §6.5, and the second half of Ashley's ruling of 30 Aug 2026 ("log a
// set and the number can start moving again"). I previously reported this
// half as NOT BUILT. That was wrong, and this file is the correction: it is
// built, it has been for some time, and it runs on the surface people
// actually train on.
//
// WHY I GOT IT WRONG. I traced the ramp through load-prescription.ts, found
// that a logged weight never re-enters the estimate path, and stopped there —
// concluding the app could not re-anchor. What I had not followed was
// TodayPanel, which asks progression-engine.ts for a recommendation from the
// last logged session. The estimate is what the printed future weeks show; the
// logged number is what today shows. Reading one module and generalising to
// the app is the error, and it is worth naming because it is the same shape
// as the comment-that-lies problem this codebase keeps finding.
//
// AND THEN THIS FILE TOLD THE SAME KIND OF LIE, for eleven days. §5 claimed
// "...and OVERRIDES the plan number with what came back", checked by
// /progressedLoads\[ex\.name\] != null/ — a regex that matches the line
// flipping the chip's LABEL. The override did not exist. The recommendation
// changed the label above the number and the note below it, and the figure
// between them stayed the one generation printed weeks earlier. Ashley found
// it on a gym floor on 14 Sep 2026: a header reading 40kg, captioned "from
// your last session", above a note saying "Held at 35kg" and set rows
// prefilled at 35.
//
// CLAUDE.md names this exact shape — asserting a call APPEARS in the file
// rather than that its value is used. §5 is now anchored on the property: the
// substitution is EXECUTED and its output inspected, so a line that is present
// but unused cannot satisfy it. See docs/plans/one-lift-one-number-today.md.
//
// So this gate pins the behaviour, executed against a stubbed log store.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

// --- a database holding one real logged session ----------------------------
//
// Stubbed at the SUPABASE seam rather than by replacing getLastSessionSets:
// ES module exports are read-only, and going through the real store means the
// malformed-row filter, the session-picking and the pending-write merge are
// all exercised too, instead of being skipped by a convenient fake.

let loggedRows: Record<string, unknown>[] = []

function fakeFrom() {
  const api: Record<string, unknown> = {
    select: () => api, eq: () => api, lt: () => api, gt: () => api,
    order: () => api, limit: () => Promise.resolve({ data: loggedRows, error: null }),
  }
  return api
}
const { setSupabaseClient } = await import('../src/lib/supabase')
setSupabaseClient({ from: fakeFrom } as never)

const store = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v) },
  removeItem: (k: string) => { store.delete(k) },
  clear: () => store.clear(), key: () => null, length: 0,
} as Storage

/** One logged session, in the shape exercise_set_logs actually stores. */
const session = (sets: { kg: number; reps: number }[]) =>
  sets.map((s, i) => ({
    id: `row-${i}`, session_id: 'sess-1', user_id: 'p1',
    exercise_id: 'barbell-bench-press', exercise_name: 'Barbell Bench Press',
    set_number: i + 1, weight_kg: s.kg, reps_completed: s.reps,
    is_warmup: false, completed_at: '2026-08-29T10:00:00.000Z',
  }))

const { getDoubleProgressionRecommendation, withWorkingLoadKg } = await import('../src/lib/progression-engine')

console.log('\n1. With nothing logged, there is nothing to re-anchor to')
{
  loggedRows = []
  const rec = await getDoubleProgressionRecommendation('p1', 'Barbell Bench Press', '2026-08-30', 8)
  check('no logged session yields no recommendation, so the estimate stands', rec === null, rec)
}

console.log('\n2. Log a set that hits the target, and the weight moves')
{
  loggedRows = session([{ kg: 47.5, reps: 8 }, { kg: 47.5, reps: 8 }, { kg: 47.5, reps: 8 }])
  const rec = await getDoubleProgressionRecommendation('p1', 'Barbell Bench Press', '2026-08-30', 8)
  check('a recommendation comes back', rec !== null)
  check('...it is ABOVE what was lifted, because every set hit the target',
    !!rec && rec.weightKg > 47.5, rec)
  check('...and it says the weight went up', !!rec && rec.didProgress === true, rec)
  check('...naming the real number, not a rule',
    !!rec && new RegExp(String(rec.weightKg)).test(rec.note), rec?.note)
}

console.log('\n3. Fall short, and it holds — it does not invent progress')
{
  loggedRows = session([{ kg: 47.5, reps: 8 }, { kg: 47.5, reps: 6 }, { kg: 47.5, reps: 5 }])
  const rec = await getDoubleProgressionRecommendation('p1', 'Barbell Bench Press', '2026-08-30', 8)
  check('it holds at what was actually lifted', rec?.weightKg === 47.5, rec)
  check('...and says so rather than claiming progress', rec?.didProgress === false, rec)
  check('...explaining what would move it', !!rec && /reps/i.test(rec.note), rec?.note)
}

console.log('\n4. The anchor is what was LIFTED, not what was prescribed')
{
  // Somebody prescribed 47.5 who actually put 60 on the bar. The next number
  // has to follow the bar, or the app is arguing with the person about what
  // they did.
  loggedRows = session([{ kg: 60, reps: 8 }, { kg: 60, reps: 8 }])
  const rec = await getDoubleProgressionRecommendation('p1', 'Barbell Bench Press', '2026-08-30', 8)
  check('the recommendation builds on 60kg, not on the estimate', !!rec && rec.weightKg > 60, rec)

  // And it takes the HEAVIEST working set, not whichever row came back first
  // — with ramped loading, "first row" can be a light early set.
  loggedRows = session([{ kg: 40, reps: 8 }, { kg: 60, reps: 8 }])
  const ramped = await getDoubleProgressionRecommendation('p1', 'Barbell Bench Press', '2026-08-30', 8)
  check('...and off the heaviest working set, not the first', !!ramped && ramped.weightKg > 60, ramped)
}

console.log('\n5. The recommendation becomes the NUMBER, in every place it is written')
{
  // EXECUTED, not grepped. The predecessor of this section asserted that a
  // line mentioning progressedLoads existed in TodayPanel; the line existed,
  // flipped a label, and the number never moved. Nothing below can pass
  // unless the substitution actually produces different figures.
  const bench = 'Barbell Bench Press'
  const plan = {
    name: bench, sets: 4, reps: '8-10',
    suggested_load_kg: 60,
    suggested_load: '~60kg',
    // A ramp, because flattening one is the specific wrong answer here:
    // 70/80/90/100% of the top set.
    per_set_load: [
      { set_number: 1, load_kg: 42.5, display: '~42.5kg' },
      { set_number: 2, load_kg: 47.5, display: '~47.5kg' },
      { set_number: 3, load_kg: 55, display: '~55kg' },
      { set_number: 4, load_kg: 60, display: '~60kg' },
    ],
  } as unknown as import('../src/lib/types').Exercise

  const held = withWorkingLoadKg(plan, 50)
  check('the header figure becomes the logged number, not the plan\'s',
    held.suggested_load_kg === 50, held.suggested_load_kg)
  check('...and the display STRING moves with it, so the two cannot disagree',
    held.suggested_load === '~50kg', held.suggested_load)
  check('...and the heaviest set chip lands on it exactly, never a rounding away',
    held.per_set_load?.[3].load_kg === 50, held.per_set_load)
  check('...with no chip ever heavier than the header — the same two-number bug, one row down',
    held.per_set_load?.every(s => s.load_kg <= (held.suggested_load_kg ?? 0)) === true, held.per_set_load)
  check('...with every chip\'s own display rewritten too',
    held.per_set_load?.every(s => s.display === `~${s.load_kg}kg`) === true, held.per_set_load)

  // THE RAMP IS SCALED, NOT FLATTENED. Four identical top sets is materially
  // harder work than the plan prescribed — the reason this is not
  // rebuildLoadForExercise.
  check('the ramp keeps its shape — the early sets stay lighter than the top',
    new Set(held.per_set_load?.map(s => s.load_kg)).size > 1, held.per_set_load)
  check('...climbing, in the order the plan climbed',
    held.per_set_load?.every((s, i, a) => i === 0 || s.load_kg >= a[i - 1].load_kg) === true, held.per_set_load)
  check('...and every set came DOWN, because the top set did',
    held.per_set_load?.every((s, i) => s.load_kg <= (plan.per_set_load?.[i].load_kg ?? 0)) === true, held.per_set_load)

  // THE SAME INVARIANT ON A PLAN WHOSE THREE VIEWS HAVE ALREADY DRIFTED, which
  // is the only case where the top-set guard does any work — and therefore the
  // only fixture that can ever make its removal fail. Written after a mutation
  // survived: on a self-consistent plan the top set's share is exactly 1, so
  // the proportional arithmetic lands on the header figure by itself and the
  // guard could be deleted with nothing going red.
  const drifted = {
    ...plan,
    per_set_load: [
      { set_number: 1, load_kg: 42.5, display: '~42.5kg' },
      { set_number: 2, load_kg: 62.5, display: '~62.5kg' },
    ],
  } as unknown as import('../src/lib/types').Exercise
  const settled = withWorkingLoadKg(drifted, 50)
  check('a drifted plan still cannot show a chip heavier than its header',
    settled.per_set_load?.every(s => s.load_kg <= (settled.suggested_load_kg ?? 0)) === true, settled.per_set_load)

  // Upward too — a trainee who earned it sees the bigger number, not a note
  // about one.
  const up = withWorkingLoadKg(plan, 65)
  check('a progressed recommendation raises the figure as well',
    up.suggested_load_kg === 65 && up.per_set_load?.[3].load_kg === 65, up.suggested_load_kg)

  // The plan object itself is untouched: future weeks are re-anchored by
  // OFFER (beat-target-offer.ts), never silently by today's screen.
  check('the stored plan is not mutated — today gets a copy',
    plan.suggested_load_kg === 60 && plan.per_set_load?.[3].load_kg === 60, plan.suggested_load_kg)

  // The ceiling, which only started mattering when this number became
  // visible: getDoubleProgressionRecommendation adds an increment with no
  // ceiling of its own, so somebody at the top of their dumbbell rack would
  // be shown a weight they cannot load.
  const db = {
    name: 'Dumbbell Bench Press', sets: 3, reps: '8-10',
    suggested_load_kg: 30, suggested_load: '~30kg per hand', per_set_load: null,
  } as unknown as import('../src/lib/types').Exercise
  const clamped = withWorkingLoadKg(db, 40, { max_dumbbell_kg: 32 } as unknown as import('../src/lib/types').UserProfile)
  check('a stated kit ceiling clamps the displayed number',
    (clamped.suggested_load_kg ?? 0) <= 32, clamped.suggested_load_kg)
  const unclamped = withWorkingLoadKg(db, 40)
  check('...and without a stated one the app\'s own table still applies, never nothing',
    (unclamped.suggested_load_kg ?? 0) > 0, unclamped.suggested_load_kg)

  // Only then, the wiring: that today's screen calls this on the copy the row
  // renders. A source check, and it is deliberately the SMALL half of §5.
  const panel = stripComments(readFileSync(join(ROOT, 'src/components/exercise/TodayPanel.tsx'), 'utf8'))
  check('today asks the progression engine for every loaded exercise',
    /getDoubleProgressionRecommendation\(profileId, ex\.name, today/.test(panel))
  check('...and the row renders the SUBSTITUTED copy, not the plan\'s exercise',
    /rowEx\s*=\s*progressedLoad != null[\s\S]{0,120}withWorkingLoadKg\(/.test(panel)
    && /\bex:\s*rowEx\b/.test(panel), panel.match(/rowEx[\s\S]{0,160}/)?.[0])
  check('...labelling it as coming from a log, not an estimate',
    /progressedLoads\[ex\.name\] != null\) return 'logged'/.test(panel))

  // The message the converged lift shows must stay true: it promises the
  // number can start moving again, and this is the path that delivers that.
  const prescription = readFileSync(join(ROOT, 'src/lib/load-prescription.ts'), 'utf8')
  check('the "log a set" promise on a stuck lift is one this path can keep',
    /Log a set and the number can start moving again/.test(prescription))
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nAll logged-re-anchor checks passed.')

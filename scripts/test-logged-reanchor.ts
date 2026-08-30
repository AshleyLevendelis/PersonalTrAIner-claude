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
// last logged session and OVERRIDES the plan's number with it, labelling the
// chip 'logged'. The estimate is what the printed future weeks show; the
// logged number is what today shows. Reading one module and generalising to
// the app is the error, and it is worth naming because it is the same shape
// as the comment-that-lies problem this codebase keeps finding.
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

const { getDoubleProgressionRecommendation } = await import('../src/lib/progression-engine')

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

console.log('\n5. Today\'s screen really does use it, and says where the number came from')
{
  const panel = stripComments(readFileSync(join(ROOT, 'src/components/exercise/TodayPanel.tsx'), 'utf8'))
  check('today asks the progression engine for every loaded exercise',
    /getDoubleProgressionRecommendation\(profileId, ex\.name, today/.test(panel))
  check('...and OVERRIDES the plan number with what came back',
    /progressedLoads\[ex\.name\] != null/.test(panel))
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

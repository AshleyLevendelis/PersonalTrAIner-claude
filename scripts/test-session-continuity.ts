// ---------------------------------------------------------------------------
// Gate: what survives you putting the phone down mid-workout.
//
// Audit §6.3/§6.4/§5.1 — three things that made the app worse to actually
// use in a gym, plus one bug found while fixing them.
//
//   §6.3  Weight and reps typed into a set row, and any extra set rows added
//         by hand, lived in component state only. Reload, or leave the app
//         long enough for the browser to discard the tab — which is what a
//         locked phone eventually becomes — and they were gone. Logged sets
//         were always safe; this is the in-progress typing.
//   §6.4  No screen wake-lock anywhere, so the phone dimmed and locked on its
//         normal schedule mid-set and the user unlocked it between every set.
//   §5.1  The shopping list re-derived today from the meal pools, ignoring
//         what the user had actually chosen — so a swapped dinner was still
//         shopped for as the meal it replaced.
//
//   FOUND WHILE FIXING THEM: patchRecord listed the session-record fields to
//   carry forward by hand, and had fallen behind. prSnapshotAtStart was
//   missing, so the PR baseline captured at startSession was wiped by the
//   very next patch — starting a rest timer was enough — and finishSession
//   then built the session summary by diffing against nothing.
//
// Section 1 is behavioural, against the real store and a stubbed
// localStorage. The rest scan source with comments stripped.
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

const mem = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, v) },
  removeItem: (k: string) => { mem.delete(k) },
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() { return mem.size },
} as Storage

const store = await import('../src/lib/active-session-store')

console.log('\n1. The session record carries drafts, and never drops a field')
{
  const base = {
    profileId: 'p1', date: '2026-08-30', dayName: 'Sunday', liveWeek: 2,
    status: 'running' as const, startedAtIso: '2026-08-30T09:00:00.000Z',
    lastActivityIso: '2026-08-30T09:00:00.000Z',
  }

  store.saveActiveSessionRecord({
    ...base,
    prSnapshotAtStart: { 'barbell-squats': { weightKg: 100, reps: 5, e1rm: 112, achievedAt: '2026-08-01' } as never },
    drafts: { 'barbell-squats:2': { weight: '82.5', reps: '8', isBodyweight: false } },
    extraSets: { 'barbell-squats': [4] },
  })

  const read = store.getActiveSessionRecord('p1', '2026-08-30')
  check('a typed set value survives a round trip through storage',
    read?.drafts?.['barbell-squats:2']?.weight === '82.5', read?.drafts)
  check('...and so does an added set row', read?.extraSets?.['barbell-squats']?.[0] === 4, read?.extraSets)
  check('...alongside the PR baseline', read?.prSnapshotAtStart != null)

  // THE BUG THIS FOUND. A later patch must not drop unrelated fields.
  store.saveActiveSessionRecord({ ...read!, restEndsAt: '2026-08-30T09:03:00.000Z', restLabel: 'Rest' })
  const afterRest = store.getActiveSessionRecord('p1', '2026-08-30')
  check('starting a rest does not wipe the PR baseline', afterRest?.prSnapshotAtStart != null, afterRest)
  check('...nor the drafts', afterRest?.drafts?.['barbell-squats:2'] != null)
}

console.log('\n2. The hook merges rather than re-listing fields')
{
  const hook = stripComments(readFileSync(join(ROOT, 'src/hooks/useActiveSession.tsx'), 'utf8'))
  const start = hook.indexOf('const patchRecord')
  const body = hook.slice(start, hook.indexOf('}, [identity.profileId', start))

  // The fix that makes forgetting impossible. A hand-maintained list of
  // fields to carry forward is a rule someone has to remember to update, in
  // a record the design says later phases will keep growing.
  check('patchRecord spreads the existing record', /\.\.\.\(existing \?\? \{\}\)/.test(body), body.slice(0, 300))
  check('...instead of enumerating fields to carry forward',
    !/restTargetSetNumber: existing\?\./.test(body))
  check('the draft accessors are exposed on the session value',
    ['setDraft', 'saveSetDraft', 'clearSetDrafts', 'extraSetsFor', 'setExtraSets']
      .every(n => new RegExp(`${n},`).test(hook)),
    ['setDraft', 'saveSetDraft', 'clearSetDrafts', 'extraSetsFor', 'setExtraSets']
      .filter(n => !new RegExp(`${n},`).test(hook)))
}

console.log('\n3. The set grid reads and writes those drafts')
{
  const grid = stripComments(readFileSync(join(ROOT, 'src/components/exercise/SetGrid.tsx'), 'utf8'))
  check('a typed value is written to the record', /saveSetDraft\(exerciseId, setNumber, next\)/.test(grid))
  check('a stored draft is read back when nothing is in component state', /const draft = setDraft\(exerciseId, setNumber\)/.test(grid))
  // Ordering matters: a real logged set is always the truth, and must win.
  const inputFor = grid.slice(grid.indexOf('const inputFor'), grid.indexOf('const ghostFor'))
  check('...but a logged set still wins over a draft',
    inputFor.indexOf('existingLogs.find') < inputFor.indexOf('setDraft('), inputFor)
  check('the draft is cleared once the set is logged', /clearSetDrafts\(exerciseId\)/.test(grid))
  check('extra set rows come from the record, not component state',
    /const extraSetNumbers = extraSetsFor\(exerciseId\)/.test(grid) &&
    !/useState<number\[\]>\(\[\]\)/.test(grid))
}

console.log('\n4. The screen stays awake while a session is running')
{
  const hook = stripComments(readFileSync(join(ROOT, 'src/hooks/useWakeLock.ts'), 'utf8'))
  // Must match the ADD, not merely the word: an earlier version of this
  // check tested for /visibilitychange/ and stayed green after the listener
  // registration was deleted, because the cleanup's removeEventListener
  // still mentions it.
  check('the wake lock is re-acquired when the tab becomes visible again',
    /document\.addEventListener\('visibilitychange'/.test(hook))
  check('...by actually re-requesting it, not just re-rendering',
    /const onVisibility = \(\) => \{ void acquire\(\) \}/.test(hook))
  check('...because the browser releases it on hide — that is the contract, not a failure',
    /document\.visibilityState !== 'visible'/.test(hook))
  check('an unsupported browser is handled silently', /if \(!nav\.wakeLock\) return/.test(hook))
  check('the lock is released on cleanup', /sentinel\.release\(\)/.test(hook))

  const panel = stripComments(readFileSync(join(ROOT, 'src/components/exercise/TodayPanel.tsx'), 'utf8'))
  check('it is held only while the session is running, never idle or finished',
    /useWakeLock\(status === 'running'\)/.test(panel))
}

console.log('\n5. The shopping list buys what you actually chose')
{
  const grocery = stripComments(readFileSync(join(ROOT, 'src/lib/grocery-store.ts'), 'utf8'))
  check('today\'s real picks override the re-derived day', /day === 0 \? \{ \.\.\.chosen, \.\.\.todaysPicks \}/.test(grocery))
  check('...only today — the rest of the week is genuinely undecided',
    /day === 0 \?/.test(grocery) && !/todaysPicks \}\s*:\s*\{ \.\.\.chosen, \.\.\.todaysPicks/.test(grocery))
  check('the override also feeds variety, so tomorrow does not repeat today',
    /Object\.entries\(dayChosen\)/.test(grocery))

  const app = stripComments(readFileSync(join(ROOT, 'src/App.tsx'), 'utf8'))
  check('App passes the same chosenMeals the Nutrition tab renders',
    /todaysPicks=\{chosenMeals\}/.test(app))
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nAll session-continuity checks passed.')

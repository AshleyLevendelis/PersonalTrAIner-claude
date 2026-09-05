// ---------------------------------------------------------------------------
// Gate: a write that fails has to say so.
//
// THE FAMILY (audit §3.1-§3.5). Five separate places updated the screen first
// and then sent a write, and did nothing visible when the write failed:
//
//   - swapping an exercise: console.error only, so the swap sat there looking
//     applied until the next reload put the old exercise back. The SAME swap
//     made through the chat already returned a receipt and said "Couldn't
//     apply the swap" — one honest door and one dishonest one.
//   - banning an exercise: no error handling at all, so offline the handler
//     threw before changing anything and NOTHING happened. No ban, no error,
//     no visual change. The worst of the three outcomes, because it leaves
//     the user nothing to react to.
//   - logging steps: same, no handling.
//   - editing a remembered fact/goal/note: Supabase does not throw, it
//     returns { error }, which was dropped. The edit silently reverted.
//   - four of the five offline queues could dead-letter with no indicator
//     anywhere in the app. Only logged sets had a screen.
//
// Section 5 is behavioural — it drives a real store's dead-letter round trip
// against a stubbed localStorage. The rest scan source with comments
// stripped, so this file's own explanation can never be what satisfies it.
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

/** The real body of a top-level `const name = ...` in a component, not a guessed window. */
function handlerBody(src: string, decl: string): string {
  const start = src.indexOf(decl)
  if (start < 0) return ''
  const rest = src.slice(start)
  const endRel = rest.slice(1).search(/\n  (const |return |function |useEffect|\/\*)/)
  return endRel > 0 ? rest.slice(0, endRel + 1) : rest
}

const app = stripComments(readFileSync(join(ROOT, 'src/App.tsx'), 'utf8'))
const nutrition = stripComments(readFileSync(join(ROOT, 'src/components/NutritionDisplay.tsx'), 'utf8'))
const profile = stripComments(readFileSync(join(ROOT, 'src/components/ProfileScreen.tsx'), 'utf8'))
const indicator = stripComments(readFileSync(join(ROOT, 'src/components/OfflineStatusIndicator.tsx'), 'utf8'))
const chat = stripComments(readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8'))
// Steps moved off Nutrition to the Exercise tab on 5 Sep 2026. The handler
// travelled verbatim, so the checks travel with it rather than being relaxed.
const stepsRow = stripComments(readFileSync(join(ROOT, 'src/components/exercise/StepsRow.tsx'), 'utf8'))

console.log('\n1. Swapping an exercise')
{
  const body = handlerBody(app, 'const handleSwapExercise')
  check('the handler exists', body.length > 0)
  check('a failed save is reported, not only logged', /setWriteError\(/.test(body))
  check('...and the screen is put back rather than left showing the swap', /setMesocycle\(mesocycle\)/.test(body))
  check('the message does not blame the user or name a table',
    !/supabase|mesocycle_weeks|postgrest/i.test((/setWriteError\((["'`])([^"'`]*)\1/.exec(body) ?? [])[2] ?? ''))
}

console.log('\n2. Banning an exercise')
{
  const body = handlerBody(app, 'const handleBanExercise')
  check('the handler exists', body.length > 0)
  check('the memory write is guarded — offline it no longer silently does nothing',
    /try \{[\s\S]*createFact\(/.test(body))
  check('a failed memory write is reported', /setWriteError\(/.test(body))
  // Two different failures, two different truths: if the ban landed but the
  // plan rewrite didn't, telling them "that didn't save" would send them off
  // to re-tap something that already worked.
  const messages = [...body.matchAll(/setWriteError\(`([^`]*)`\)/g)].map(m => m[1])
  check('the two failure paths say different things', new Set(messages).size >= 2, messages)
}

console.log('\n3. Steps and the water target')
{
  const steps = handlerBody(stepsRow, 'const handleLogSteps')
  check('logging steps is guarded', /try \{/.test(steps) && /catch/.test(steps))
  check('...and reports the failure', /setEntryError\(/.test(steps))
  // The value is the user's — losing it once is bad enough without making
  // them retype it. Checked by slicing the catch block, not by looking for
  // the clear anywhere in the handler: it legitimately appears in the
  // success path, and an earlier version of this check confused the two.
  const stepsCatch = steps.slice(steps.indexOf('} catch'))
  check('...and keeps the typed number instead of clearing it', !/setStepsInput\(''\)/.test(stepsCatch), stepsCatch.slice(0, 200))
  // Its own error state, not a borrowed one. On Nutrition this was SHARED
  // with the water-target handler, and a shared string is how one failure
  // comes to describe the other once the two live on different screens.
  check('...and the steps error is rendered on the tab that logs them',
    /\{entryError && \(/.test(stepsRow))

  const water = handlerBody(nutrition, 'const handleSaveWaterTarget')
  check('saving the water target is guarded', /try \{/.test(water) && /catch/.test(water))
  check('...and puts the old target back on failure', /setWaterTarget\(previous\)/.test(water))
  check('the error is actually rendered somewhere', /\{entryError && \(/.test(nutrition))
}

console.log('\n3b. Logging steps from chat')
{
  // steps-store is plain async with NO offline queue (its own header says so),
  // unlike water-store's local-first queue. So this await can genuinely reject
  // where logWater cannot, and a rejection must not produce "Logged 9,000
  // steps." — the exact shape of lie this whole file exists to stop.
  const body = handlerBody(chat, 'const resolveAndSaveSteps')
  check('the chat steps handler exists', body.length > 0)
  check('the write is guarded', /try \{/.test(body) && /catch/.test(body))
  check('...and a failure is reported, not swallowed', /status: 'failed'/.test(body))
  check('...and it does not claim a log it did not make',
    !/Logged \$\{[\s\S]{0,40}\} steps\./.test(body.slice(body.indexOf('} catch'))))
  // An implausible number is refused BEFORE the write, not stored and regretted.
  // PRESENCE FIRST, THEN ORDER. The first version compared indexOf positions
  // alone, and -1 < anything: deleting the guard entirely left this GREEN.
  // Found by running the mutation, not by reading the check.
  const guardAt = body.indexOf('isPlausibleStepCount')
  const writeAt = body.indexOf('logStepsManual')
  check('the bound is applied at all (sanity check on this check)', guardAt !== -1 && writeAt !== -1,
    { guardAt, writeAt })
  check('an implausible count is refused before anything is written',
    guardAt !== -1 && writeAt !== -1 && guardAt < writeAt, { guardAt, writeAt })
}

console.log('\n4. Editing and deleting what the app remembers')
{
  check('the three edits go through one guarded helper', /const saveMemoryEdit = async/.test(profile))
  check('...which checks the error Supabase returns rather than dropping it',
    /const \{ error \} = await supabase[\s\S]{0,160}if \(error\)/.test(profile))
  check('...and reports it', /saveMemoryEdit[\s\S]{0,400}setSaveError\(/.test(profile))
  check('the three deletes go through one guarded helper', /const runDelete = async/.test(profile))
  const usesRunDelete = (n: string) => profile.includes(`const ${n} = (id: string) => runDelete(`)
  check('...and all three use it',
    ['deleteFact', 'deleteGoal', 'deleteContext'].every(usesRunDelete),
    ['deleteFact', 'deleteGoal', 'deleteContext'].filter(n => !usesRunDelete(n)))
  // The regression: a bare `await supabase...update(...)` with the result
  // thrown away.
  check('no memory write drops its result any more',
    !/await supabase\.from\('user_(facts|goals|context_facts)'\)\.update\([^)]*\)\.eq\('id', id\)\n/.test(profile))
}

console.log('\n5. The offline indicator reads every queue')
{
  check('it reads the shared queue view, not one store\'s dead letters',
    /from '@\/lib\/queue-health'/.test(indicator))
  check('...and no longer imports set-log-store\'s own dead-letter functions',
    !/getDeadLetterItems.*from '@\/lib\/set-log-store'/.test(indicator))
  check('the badge counts every queue, not set-log-store\'s own count',
    /failedItems\.length > 0/.test(indicator) && !/state\.deadLetterCount > 0/.test(indicator))
  check('it subscribes to the other four so their failures repaint it',
    /subscribeAllQueues\(/.test(indicator))
  check('...and reads once on mount, since none of them fires on mount',
    /refreshFailures\(\)\n\s*return \(\) =>/.test(indicator))

  const qh = stripComments(readFileSync(join(ROOT, 'src/lib/queue-health.ts'), 'utf8'))
  for (const store of ['set-log-store', 'water-store', 'grocery-store', 'cardio-log-store', 'meal-store']) {
    check(`queue-health reads ${store}`, new RegExp(`from '\\./${store}'`).test(qh))
  }
}

console.log('\n6. The dead-letter round trip actually works — behavioural')
{
  // A minimal localStorage, because these stores are local-first by design
  // and there is no browser here.
  const mem = new Map<string, string>()
  ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => { mem.set(k, v) },
    removeItem: (k: string) => { mem.delete(k) },
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() { return mem.size },
  } as Storage

  const water = await import('../src/lib/water-store')

  const seeded = [{
    op: { kind: 'upsert', log: { id: 'w-1', profileId: 'p1', date: '2026-08-29', amountMl: 500, source: 'manual', createdAt: '2026-08-29T10:00:00.000Z', attempts: 5 } },
    reason: 'max-attempts',
    errorMessage: 'network',
    failedAt: '2026-08-29T10:05:00.000Z',
  }]
  mem.set('fitplan_water_deadletter_v1', JSON.stringify(seeded))

  const items = water.getDeadLetterItems()
  check('a dead-lettered water log is visible', items.length === 1, items)
  check('...labelled in the user\'s terms, not the store\'s', items[0]?.label === '500 ml', items[0]?.label)

  water.retryDeadLetterItem('w-1')
  check('retry clears it from the dead-letter store', water.getDeadLetterItems().length === 0)
  const pending = JSON.parse(mem.get('fitplan_water_pending_v1') || '[]')
  check('...and puts it back in the pending queue', pending.length === 1, pending)
  check('...with its attempt count reset, or it would fail again immediately',
    pending[0]?.log?.attempts === 0, pending[0]?.log?.attempts)

  mem.set('fitplan_water_deadletter_v1', JSON.stringify(seeded))
  water.discardDeadLetterItem('w-1')
  check('discard removes it for good', water.getDeadLetterItems().length === 0)
}

console.log('\n7. Chat message persistence -- four writes that used to vanish into .then()')
{
  // Found in a follow-up sweep, 3 Sep 2026 -- not part of the original
  // audit's five, but the identical shape: a write fires, the promise
  // resolves or rejects, and NOTHING reads which one happened. `.then()`
  // with no argument discards the result outright; it is not even an
  // unhandled-rejection warning, because .then() with zero arguments never
  // rejects itself.
  //
  // Every one of these four is fire-and-forget by design -- the screen has
  // already moved on by the time the write lands, and there is no undo to
  // offer. So the bar here is lower than the swap/ban/log family above (no
  // setWriteError banner is owed for a background persistence detail), but
  // the floor from the rest of this file still applies: a failure has to be
  // TRACEABLE, not silent. A `.then()` with no argument fails that on its
  // own -- it cannot even be told apart from success by reading the code.
  for (const [label, decl] of [
    ['persistUserMessage', 'const persistUserMessage'],
    ['finalizePlaceholder', 'const finalizePlaceholder'],
    ['retryMessage', 'const retryMessage'],
    ['handleClearChat', 'const handleClearChat'],
  ] as const) {
    const body = handlerBody(chat, decl)
    check(`${label} exists`, body.length > 0)
    check(`${label}: a failed write is at least logged, not discarded`,
      /\.then\(\(\{\s*error\s*\}\)\s*=>\s*\{[\s\S]*?console\.error\(/.test(body), body.slice(0, 200))
  }

  // The one with a stated promise a silent failure would break outright.
  // Regressing this to a bare `.then()` should not read as "acceptable" just
  // because the OTHER three checks above still pass on unrelated matches.
  const clearChatBody = handlerBody(chat, 'const handleClearChat')
  check('handleClearChat: the comment\'s own promise ("reload doesn\'t resurrect") is backed by a real check on the delete',
    /delete\(\)[\s\S]*?\.then\(\(\{\s*error\s*\}\)\s*=>/.test(clearChatBody))
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nAll silent-write checks passed.')

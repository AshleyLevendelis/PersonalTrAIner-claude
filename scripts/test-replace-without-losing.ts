/**
 * Gate: every write that REPLACES rather than appends can be undone, and none
 * of them has a window where the data is simply gone.
 *
 * Five places did a delete and then a write, with nothing holding the gap:
 *
 *   - saveMesocycle deleted the whole plan then inserted it, from five call
 *     sites including undo. A failure between the two left no plan at all,
 *     and "reopen the app and try again" is exactly when that becomes
 *     permanent.
 *   - Undoing a chat set CORRECTION deleted the sets the correction had
 *     written, having already deleted the ones it replaced — so "no, 3x10
 *     deadlifts" then Undo left zero sets, from a button labelled Undo.
 *   - undoMealAddition deleted on (profile, slot, name) and nothing makes a
 *     name unique in a slot: ask the coach for a chicken curry when the
 *     generator had already given you one, undo, and both went.
 *   - revertAdaptation closed the adaptation row before restoring the plan,
 *     so a half-failure left someone permanently in a plan reduced around an
 *     injury they had recovered from.
 *   - persistPools deleted a slot's pool then inserted, swallowing every
 *     error — a failed insert left the slot empty and the Nutrition tab
 *     showing no dinner.
 *
 * §1 is behavioural: it runs the real executor against a fake session and
 * asserts the pre-image comes back. The rest are structural, because the
 * others need a database.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { executeLogWorkout } from '../src/lib/nl-logging-executor'
import { parseWorkoutEntries } from '../src/lib/set-parse'
import type { ExerciseSetLog } from '../src/lib/types'
import type { SaveSetInput } from '../src/lib/set-log-store'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}

console.log('\n1. A correction hands back what it replaced — behavioural\n')
{
  // Ashley's actual sequence: three sets logged wrong, corrected to 3x10,
  // then Undo.
  const existing: ExerciseSetLog[] = [1, 2, 3].map(n => ({
    user_id: 'p1', date: '2026-09-05', exercise_name: 'Deadlifts', exercise_id: 'deadlifts',
    set_number: n, weight_kg: 60, reps_completed: 8, is_bodyweight: false, unit: 'reps', rpe: 7,
  }))
  const written: SaveSetInput[] = []
  const deleted: { exerciseId: string; setNumber: number }[] = []

  const parsed = parseWorkoutEntries({
    entries: [{ rawText: '3x10 deadlifts at 70kg', exercisePhrase: 'deadlifts', setsPhrase: '3x10 @ 70kg' }],
    todaysPlanExerciseNames: ['Deadlifts'],
  })
  check('the correction parses (sanity check on this check)',
    !parsed.needsClarification && parsed.groups.length === 1, parsed.groups.length)

  const result = executeLogWorkout(parsed.groups, {
    profileId: 'p1',
    date: '2026-09-05',
    weekNumber: 2,
    dayName: 'Saturday',
    setsFor: () => existing,
    logSet: (input) => { written.push(input); return { ...existing[0], set_number: input.setNumber } },
    declareOffPlan: () => {},
    todaysPlanSetCounts: new Map([['Deadlifts', 3]]),
    todaysPlanLoads: new Map(),
    replaceExisting: true,
    deleteSet: key => { deleted.push(key) },
  })

  check('it deleted the three sets it replaced', deleted.length === 3, deleted)
  check('...and wrote three in their place', result.totalSets === 3, result.totalSets)
  // THE FIX. Without replacedLogs, undo deletes the three it wrote and the
  // three it replaced are already gone — zero sets from a button called Undo.
  check('...and captured all three as a pre-image', result.replacedLogs.length === 3, result.replacedLogs.length)
  check('...with enough to write them back exactly',
    result.replacedLogs.every(p =>
      p.weightKg === 60 && p.repsCompleted === 8 && p.exerciseId === 'deadlifts'
      && p.date === '2026-09-05' && p.day === 'Saturday' && p.weekNumber === 2),
    result.replacedLogs[0])
  check('...covering the same set numbers that were deleted',
    result.replacedLogs.map(p => p.setNumber).sort().join(',') === deleted.map(d => d.setNumber).sort().join(','))

  // An ordinary append must NOT carry a pre-image — an undo that "restores"
  // sets it never replaced would duplicate them.
  const appendResult = executeLogWorkout(parsed.groups, {
    profileId: 'p1', date: '2026-09-05', weekNumber: 2, dayName: 'Saturday',
    setsFor: () => existing,
    logSet: (input) => ({ ...existing[0], set_number: input.setNumber }),
    declareOffPlan: () => {},
    todaysPlanSetCounts: new Map([['Deadlifts', 3]]),
    todaysPlanLoads: new Map(),
  })
  check('an ordinary append carries no pre-image', appendResult.replacedLogs.length === 0, appendResult.replacedLogs.length)
}

console.log('\n2. The undo carries both halves, and applies them in the safe order\n')
{
  const chat = read('src/components/ChatAssistant.tsx')
  check('the receipt carries logged AND replaced',
    /undoToken: JSON\.stringify\(\{ logged: loggedKeys, replaced: replacedLogs \}\)/.test(chat))
  check('...and the undo still reads the old bare-array shape',
    /if \(Array\.isArray\(token\)\) keys = token/.test(chat))
  check('...without throwing on an unreadable token', /failed to read its own token/.test(chat))
  // ORDER. A correction refills the set numbers it freed, so restoring before
  // deleting would delete the sets just put back.
  const undo = chat.slice(chat.indexOf("if (receipt.kind === 'log_workout')"))
  const deleteAt = undo.indexOf('activeSession.deleteSet(')
  const restoreAt = undo.indexOf('activeSession.logSet(pre)')
  check('it deletes what it wrote before restoring what it replaced',
    deleteAt >= 0 && restoreAt > deleteAt, { deleteAt, restoreAt })
}

console.log('\n3. The plan is never absent from the database\n')
{
  const persist = read('src/lib/mesocycle-persistence.ts')
  const body = persist.slice(persist.indexOf('export async function saveMesocycle'))
  check('saveMesocycle upserts rather than deleting first',
    /\.upsert\(rows, \{ onConflict: 'profile_id,week_number' \}\)/.test(body))
  const upsertAt = body.indexOf('.upsert(')
  const deleteAt = body.indexOf('.delete()')
  check('...and any delete comes AFTER the upsert, trimming what is left over',
    deleteAt > upsertAt && upsertAt >= 0, { upsertAt, deleteAt })
  check('...trimming only weeks past the new plan\'s length',
    /\.gt\('week_number', highestWeek\)/.test(body))
  // The delete used to be what reset created_at for a fresh plan. An upsert
  // keeps the old row's value, which would leave a new trainee's plan dated
  // to the previous one and rewind them to week 1.
  check('...and created_at is written explicitly, not inherited from the old row',
    /created_at: createdAt/.test(body))
  check('...a failed trim does not lose the plan that did save',
    /Trimming stale mesocycle weeks failed \(plan itself saved\)/.test(persist))
}

console.log('\n4. A pool replace can fail without emptying the slot\n')
{
  const gen = read('src/lib/meal-generation.ts')
  const body = gen.slice(gen.indexOf('async function persistPools'))
  check('a read failure leaves the slot alone rather than deleting blind',
    /if \(readError\) \{[\s\S]{0,300}continue/.test(body))
  check('a delete failure stops before inserting on top', /if \(deleteError\) \{[\s\S]{0,300}continue/.test(body))
  // THE GUARD, not the message. The first version looked for the log line,
  // which sits inside the restore branch — replacing the branch's condition
  // with `false` left the string in place and the check green, on a function
  // that no longer restores anything. The same dead-code trap two other gates
  // in this repo record. Found by mutation.
  check('an insert failure puts the old pool back',
    /if \(error\) \{[\s\S]{0,300}?if \(previous\.length > 0\) \{[\s\S]{0,200}?\.insert\(/.test(body))
  check('...with its original indexes', /pool_index: row\.pool_index/.test(body))
  check('...and says so if even that fails', /restoring the previous pool for slot/.test(body))
}

console.log('\n5. Undo removes the row it added, not every row with that name\n')
{
  const exec = read('src/lib/pending-action-executor.ts')
  const body = exec.slice(exec.indexOf('export async function undoMealAddition'))
  check('undoMealAddition targets pool_index', /\.eq\('pool_index', targetIndex\)/.test(body))
  check('...taking the exact index when the caller has it', /poolIndex \?\? null/.test(body))
  check('...and otherwise the highest-indexed row of that name',
    /\.order\('pool_index', \{ ascending: false \}\)[\s\S]{0,80}\.limit\(1\)/.test(body))
  check('...and reports whether the row really went', /Promise<boolean>/.test(body))
  const chat = read('src/components/ChatAssistant.tsx')
  check('the rollback passes the index it was just given',
    /undoMealAddition\(profile\.id, payload, result\.poolIndex\)/.test(chat))
  check('and a failed undo keeps the Undo button', /if \(!removed\) return/.test(chat))
}

console.log('\n6. An adaptation that fails to revert is not left closed\n')
{
  const store = read('src/lib/plan-adaptations-store.ts')
  const body = store.slice(store.indexOf('async function revertAdaptation'))
  // Claiming first is what makes the race safe and must stay.
  check('it still claims the row before writing (the concurrency guard)',
    body.indexOf(".eq('status', 'active')") < body.indexOf('saveMesocycleWeek'))
  check('...but reopens it if the restore throws', /status: 'active', ended_at: null/.test(body))
  check('...and reports no reversion, so nothing announces one', /return null\s*\n\s*\}\s*\n\s*return row\.pre_image/.test(body))
}

if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log('\nEvery replace keeps what it replaced.\n')

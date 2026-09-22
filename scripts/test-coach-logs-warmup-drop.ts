/**
 * Gate: the coach can log a warm-up or drop set from chat, correctly and
 * safely — not just talk about ones already on record (that was the
 * previous build, 22 Sep 2026, test:coach-warmup-memory). Ashley's ruling
 * the same day: add the write half too.
 *
 * THE SAFETY FINDING THIS GATE EXISTS TO HOLD: `drop_index` is one of THREE
 * PENDING MIGRATIONS as of the last handoff doc — not yet applied to either
 * database. set-log-store.ts (the screen's own writer) already hit this
 * exact defect once, found by a browser driver 19 Sep 2026: on a database
 * without the migration, the old 5-column conflict target does not include
 * drop_index, so a drop and its parent working set collide on every OTHER
 * column and the upsert silently OVERWRITES the parent's row with the
 * drop's. The screen's fix was to refuse a drop write outright on an
 * unmigrated database rather than fall back destructively. chat-gemini has
 * its own, independent copy of this upsert (upsertUnifiedSets) — the same
 * shape of duplication CLAUDE.md's own history warns about — so it needed
 * the identical fix, separately, which is most of what this gate checks.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { setLabelLong } from '../src/lib/session-derive'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const raw = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const read = (p: string) =>
  raw(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const fn = read('supabase/functions/chat-gemini/index.ts')

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}

const bodyOf = (marker: string, endMarker = '\n}'): string => {
  const at = fn.indexOf(marker)
  if (at === -1) return ''
  const end = fn.indexOf(endMarker, at)
  return end === -1 ? fn.slice(at, at + 3000) : fn.slice(at, end)
}

console.log('\n1. The tool can say what it is — and never invents the drop_index itself\n')
{
  const toolAt = fn.indexOf('name: "log_workout_set"')
  const toolBody = fn.slice(toolAt, fn.indexOf('required: ["exercise_name"', toolAt))
  check('log_workout_set declares is_warmup', /is_warmup:\s*\{/.test(toolBody), toolBody.length)
  check('...and is_drop', /is_drop:\s*\{/.test(toolBody))
  check('is_drop\'s own description says set_number means the PARENT set',
    /set_number must be the WORKING set/.test(toolBody))
  check('...and tells the model never to send a drop_index itself',
    /never send drop_index/i.test(toolBody))
  check('...and to ask rather than guess which set a drop followed',
    /ask before calling rather than guessing/.test(toolBody))
  check('weight_kg\'s own description says a warm-up/drop weight is never inferred',
    /For a warm-up or a drop, an unstated weight is NEVER inferred/.test(toolBody))
}

console.log('\n2. Routing: a warm-up/drop mention reaches log_workout_set, not log_workout\n')
{
  const at = fn.indexOf('NATURAL LANGUAGE WORKOUT LOGGING')
  const section = fn.slice(at, at + 2500)
  check('log_workout is still the default for an ordinary natural-language report', /ALWAYS invoke the log_workout tool/.test(section))
  check('...but a named exception routes warm-ups/drops to log_workout_set instead',
    /THE ONE EXCEPTION/.test(section) && /Use log_workout_set instead/.test(section))
  check('...naming BOTH trigger phrasings (warm-up and drop)',
    /WARM-UP\/BUILD-UP/.test(section) && /DROP set/.test(section))
  check('...and says why log_workout cannot be used for either (its parser cannot mark either kind)',
    /log_workout's parser has no way to mark either kind/.test(section))
}

console.log('\n3. resolveWeight never infers a warm-up/drop weight from history or the plan\n')
{
  const body = bodyOf('async function resolveWeight(', '\n}')
  check('resolveWeight body found (sanity check on this check)', body.length > 200, body.length)
  check('gained an allowInference parameter', /allowInference:\s*boolean\s*=\s*true/.test(body))
  check('...checked BEFORE the history/plan lookups, not after',
    (() => {
      const guard = body.indexOf('if (!allowInference)')
      const historyLookup = body.indexOf('getLastLoggedWeight(')
      return guard !== -1 && historyLookup !== -1 && guard < historyLookup
    })(),
  )
  const handlerBody = bodyOf('if (name === "log_workout_set") {', '\n      if (name === "propose_volume_change")')
  check('the handler passes false for allowInference exactly when isWarmup or isDrop',
    /!\(isWarmup \|\| isDrop\)/.test(handlerBody), handlerBody.slice(0, 200))
}

console.log('\n4. drop_index is computed server-side, never trusted from the model\n')
{
  const body = bodyOf('async function getNextDropIndex(', '\n}\n')
  check('getNextDropIndex exists', body.length > 100, body.length)
  check('scoped to the CURRENT session, not just the exercise', /session_id=eq\.\$\{sessionId\}/.test(body))
  check('scoped to the SAME set_number (drops off different sets never collide)',
    /set_number=eq\.\$\{setNumber\}/.test(body))
  check('takes the max existing index and adds one — the same rule SetGrid.tsx uses',
    /Math\.max\(max, r\.drop_index/.test(body))
  check('returns null (not 1, not 0) when no parent set is on record — never a guess',
    /rows\.length === 0\) return null/.test(body))

  const handlerBody = bodyOf('if (name === "log_workout_set") {', '\n      if (name === "propose_volume_change")')
  check('the handler calls getNextDropIndex only when isDrop', /if \(isDrop\) \{[\s\S]{0,50}getNextDropIndex/.test(handlerBody))
  check('...and treats a null result as "do not write", not as index 1',
    /nextIndex === null/.test(handlerBody) && /canWrite = false/.test(handlerBody))
  check('...refusing with an honest reason naming the missing parent set',
    /noDropParent[\s\S]{0,400}don't have set \$\{args\.set_number\}/.test(handlerBody))
}

console.log('\n5. THE SAFETY PROPERTY — a drop never falls back to the pre-migration conflict target\n')
{
  const body = bodyOf('async function upsertUnifiedSets(', '\nasync function ')
  check('upsertUnifiedSets body found (sanity check on this check)', body.length > 500, body.length)
  check('is_warmup is threaded from the row, not hardcoded false anymore',
    /is_warmup:\s*r\.is_warmup\s*\?\?\s*false/.test(body))
  check('drop_index is threaded from the row', /drop_index:\s*r\.drop_index\s*\?\?\s*0/.test(body))

  // THE ACTUAL GUARD. Anchored on the property (a drop row present +
  // WITH_DROP failing 42P10 must not reach the BEFORE_DROP fallback), not on
  // line numbers — the guard must appear BETWEEN the 42P10 detection and the
  // fallback POST call.
  const on42P10 = body.indexOf('42P10|no unique or exclusion')
  const fallbackPost = body.indexOf('post(BEFORE_DROP)')
  const guard = body.indexOf('drop_index > 0')
  check('the drop-migration guard sits between detecting 42P10 and the fallback write',
    on42P10 !== -1 && fallbackPost !== -1 && guard !== -1 && on42P10 < guard && guard < fallbackPost,
    { on42P10, guard, fallbackPost })
  // A substring in the right POSITION is not proof the condition is live — a
  // `false &&` or `/* */` around it satisfies the check above unchanged. Pin
  // the whole `if (...) {` line's exact text, so neutering it (however it's
  // spelled) is a mismatch rather than a position match.
  const ifStart = guard === -1 ? -1 : body.lastIndexOf('if (', guard)
  const ifEnd = guard === -1 ? -1 : body.indexOf('{', guard) + 1
  const guardLine = ifStart === -1 ? '' : body.slice(ifStart, ifEnd)
  check('...and the guard condition itself is exactly this, not a neutered lookalike',
    guardLine === 'if (payload.some((p) => p.drop_index > 0)) {', guardLine)
  check('...and throws a DISTINCT, catchable error rather than a generic one',
    /throw new DropMigrationPendingError\(\)/.test(body))
  check('DropMigrationPendingError is its own class, not a string match on a generic Error',
    /class DropMigrationPendingError extends Error/.test(fn))

  const handlerBody = bodyOf('if (name === "log_workout_set") {', '\n      if (name === "propose_volume_change")')
  check('the handler catches it specifically, before the generic DB-error branch',
    /err instanceof DropMigrationPendingError/.test(handlerBody))
  check('...and tells the truth: nothing was lost, drop tracking just is not on yet',
    /drop-set tracking isn't switched on/.test(handlerBody))
  check('...and the action field is suppressed on this outcome (never claims it logged)',
    /!dropMigrationPending && !noDropParent/.test(handlerBody))
}

console.log('\n6. The confirmation never disagrees with how history reads the same row back\n')
{
  const handlerBody = bodyOf('if (name === "log_workout_set") {', '\n      if (name === "propose_volume_change")')
  const at = handlerBody.indexOf('const kindLabel')
  const semi = at === -1 ? -1 : handlerBody.indexOf(';', at)
  const kindLabelLine = at === -1 ? '' : handlerBody.slice(at, semi + 1)
  check('kindLabel line found (sanity check)', kindLabelLine.length > 20, kindLabelLine)
  const eqAt = kindLabelLine.indexOf('=')
  const exprText = eqAt === -1 ? '' : kindLabelLine.slice(eqAt + 1, kindLabelLine.length - 1).trim()

  // DRIFT CHECK — the two independent label formatters (this handler's
  // hand-written kindLabel, and daily-tracking.ts's labelFor via
  // setLabelLong, the shared function the SCREEN also uses) must produce
  // the SAME string for the same inputs. They cannot literally share code
  // across the Deno/browser boundary (this codebase's own established
  // pattern — chat-gemini already independently re-implements
  // upsertUnifiedSets rather than importing set-log-store.ts), so this gate
  // is what stands in for that shared definition.
  //
  // The comparison EVALUATES the handler's actual extracted expression text
  // rather than re-deriving what it "should" say — a hand-reconstruction
  // would keep matching setLabelLong even if the real expression in the file
  // changed, which is exactly the shape of check that misses its own defect
  // (asking a question of evidence the check wrote itself, not the file).
  let evalExpr: ((args: { set_number: number }, isDrop: boolean, isWarmup: boolean, dropIndex: number) => string) | null = null
  try {
    // eslint-disable-next-line no-new-func
    evalExpr = new Function('args', 'isDrop', 'isWarmup', 'dropIndex', `return (${exprText});`) as typeof evalExpr
  } catch (e) {
    check('kindLabel expression is well-formed JS (sanity check)', false, String(e))
  }

  const cases: { setNumber: number; dropIndex: number; kind: 'warmup' | 'working' }[] = [
    { setNumber: 1, dropIndex: 0, kind: 'working' },
    { setNumber: 3, dropIndex: 0, kind: 'warmup' },
    { setNumber: 3, dropIndex: 1, kind: 'working' },
    { setNumber: 2, dropIndex: 2, kind: 'working' },
  ]
  for (const c of cases) {
    const expected = setLabelLong({ kind: c.kind, setNumber: c.setNumber, dropIndex: c.dropIndex })
    const isDrop = c.kind === 'working' && c.dropIndex > 0
    const isWarmup = c.kind === 'warmup'
    const got = evalExpr ? evalExpr({ set_number: c.setNumber }, isDrop, isWarmup, c.dropIndex) : '<expression did not parse>'
    check(`kindLabel matches setLabelLong for ${JSON.stringify(c)}`, got === expected, { got, expected })
  }
}

if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log('\nA warm-up or a drop can be logged from chat, correctly labelled, and a pending migration cannot cost anyone their parent set.\n')

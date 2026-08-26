/**
 * Gate for the coach not promising what it cannot do.
 *
 * Root incident: Ashley told the coach, in advance, that she was skipping her
 * weights day for Muay Thai. It replied "Since you're skipping the weights,
 * I'll make sure today is marked as a rest day for lifting so we stay on
 * track" — and did nothing, because no tool touched a day's status at all.
 * Worse than a no-op: classifyDay ends `dateStr < todayStr ? 'missed' : 'due'`
 * with nothing between, so the day she announced IN ADVANCE showed as missed
 * the next morning, and the Muay Thai was recorded nowhere.
 *
 * The lesson was already written down and ignored. update_workout_schedule is
 * disabled with this in its own description: "It used to write to a profile
 * field the app doesn't actually render from, so schedule 'changes' looked
 * applied in chat but never showed up on the Exercise tab."
 *
 * Static text checks rather than imports, for the reason
 * test-chat-app-reality.ts already gives: a Deno edge function can't import
 * across the src/lib boundary, so this is the next-best thing to "cannot
 * drift".
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

let failures = 0
function check(label: string, condition: boolean, extra?: unknown) {
  if (condition) console.log(`  ok: ${label}`)
  else {
    failures++
    console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`)
  }
}

const chat = readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf8')
const hook = readFileSync(join(ROOT, 'src/hooks/useTrainingWeek.ts'), 'utf8')

console.log('\n1. Every tool the coach is offered can actually be executed')
{
  // The general form of the bug. A tool the model can see but nothing
  // implements is a promise with no delivery — the model will call it, the
  // call will fall through, and the reply will describe an action that never
  // happened. Currently 22 declared, all wired.
  const declared = [...chat.matchAll(/^\s*name:\s*"([a-z_]+)",\s*$/gm)].map(m => m[1])
  const executed = new Set([...chat.matchAll(/name\s*===\s*"([a-z_]+)"/g)].map(m => m[1]))
  const orphans = declared.filter(n => !executed.has(n))
  check(`all ${declared.length} declared tools have an executor branch`, orphans.length === 0, orphans)
  check('...and there are tools to check, so this has teeth', declared.length > 10, declared.length)
}

console.log('\n2. Skipping a day for something else is a tool, not a sentence')
{
  check('swap_session_for_activity is declared', /name:\s*"swap_session_for_activity"/.test(chat))
  check('...and executed', /name === "swap_session_for_activity"/.test(chat))

  // The update_workout_schedule trap: write only where the app reads. The
  // Exercise tab's week strip reads workout_sessions (via getWeeklyDashboard);
  // the streak reads cardio_logs. Anything else is a write nobody renders.
  const body = chat.slice(chat.indexOf('name === "swap_session_for_activity"'))
    .slice(0, chat.slice(chat.indexOf('name === "swap_session_for_activity"')).indexOf('if (name === "log_meal")'))
  check('it writes to workout_sessions — what the week strip reads', body.includes('workout_sessions'))
  check('it writes to cardio_logs — what the streak reads', body.includes('cardio_logs'))
  check('it does NOT write to fitness_profiles, the field update_workout_schedule died on',
    !body.includes('fitness_profiles'))

  // A failed write must never produce a success sentence. This is the exact
  // shape of the original defect, one layer down.
  check('a failed write reports failure rather than claiming success',
    /!dbSuccess[\s\S]{0,120}couldn't/.test(body))
}

console.log('\n3. The prompt forbids claiming an untaken action')
{
  check('the honesty rule is present', chat.includes('NEVER CLAIM AN ACTION YOU DID NOT TAKE'))
  check('...it names the tool to use instead', /swap_session_for_activity/.test(chat.slice(chat.indexOf('NEVER CLAIM AN ACTION'), chat.indexOf('NEVER CLAIM AN ACTION') + 1600)))
  check('...and tells it to say so plainly when it has no tool',
    /cannot do it from chat|can't do that from here/i.test(chat.slice(chat.indexOf('NEVER CLAIM AN ACTION'), chat.indexOf('NEVER CLAIM AN ACTION') + 1600)))
}

console.log('\n4. The app can render what the tool writes')
{
  // The other half of the update_workout_schedule trap: a column written by
  // the edge function that no client code reads is the same failure wearing
  // different clothes.
  check("classifyDay reads swapped_for_activity", hook.includes('swapped_for_activity'))
  check("'swapped' is a real day state", /DayGlyphState[\s\S]{0,200}'swapped'/.test(hook))
  check('the tally predicate excludes it', /countsTowardWeekTally[\s\S]{0,600}!== 'swapped'/.test(hook))

  // Every glyph/label map is Record<DayGlyphState, …>, so the compiler already
  // forces them to cover the new state — but a missing entry would render an
  // empty cell or announce an identifier to a screen reader, so it is worth
  // saying out loud which files carry them.
  for (const rel of ['src/components/exercise/WeekStrip.tsx', 'src/components/exercise/WeekContextRow.tsx']) {
    const src = readFileSync(join(ROOT, rel), 'utf8')
    check(`${rel} has a glyph for it`, /swapped:\s*'/.test(src))
  }
  const strip = readFileSync(join(ROOT, 'src/components/exercise/WeekStrip.tsx'), 'utf8')
  check('the screen-reader label is English, not the identifier',
    /swapped:\s*'swapped for another activity'/.test(strip))
}

console.log('\n5. The migration exists and is additive')
{
  const migration = readFileSync(join(ROOT, 'supabase/migrations/20260824210000_add_swapped_for_activity.sql'), 'utf8')
  check('adds the column with IF NOT EXISTS', /ADD COLUMN IF NOT EXISTS swapped_for_activity/.test(migration))
  check('no destructive statement', !/DROP\s+(TABLE|COLUMN)|TRUNCATE|DELETE\s+FROM/i.test(migration))
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nAll coach-promise checks passed.\n')

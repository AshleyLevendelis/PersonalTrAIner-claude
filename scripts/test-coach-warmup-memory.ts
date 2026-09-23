/**
 * Gate: the coach's conversational memory can now include warm-ups and
 * drops, correctly labelled — and the streak/PR/progression view they were
 * excluded from for a real, separate reason stays excluded.
 *
 * 22 Sep 2026, Ashley's ruling on the profile-field audit's screen-only
 * list: the coach could not discuss a build-up or drop set at all, because
 * getRecentLogs excludes both — an exclusion that ALSO feeds
 * dashboard-data.ts's streak calculation, where a warm-up-only day counting
 * as "trained" would be a second, unrelated bug. So this is two properties
 * held together, not one: the coach's memory widens, and the streak-facing
 * function does not move an inch.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { formatLogsForAI } from '../src/lib/daily-tracking'
import type { ExerciseSetLog } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const raw = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const read = (p: string) =>
  raw(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const fn = read('supabase/functions/chat-gemini/index.ts')
const chat = read('src/components/ChatAssistant.tsx')
const tracking = read('src/lib/daily-tracking.ts')
const dashboardData = read('src/lib/dashboard-data.ts')

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}

const row = (over: Partial<ExerciseSetLog>): ExerciseSetLog => ({
  user_id: 'u1', date: '2026-09-22', exercise_name: 'Bench Press', set_number: 1,
  weight_kg: 60, reps_completed: 8, is_bodyweight: false, completed_at: '2026-09-22T09:00:00.000Z',
  ...over,
})

console.log('\n1. formatLogsForAI labels every row by kind — never by position\n')
{
  const working = formatLogsForAI([row({ set_number: 1, weight_kg: 60 })])
  check('a plain working set is labelled "Set 1"', /\bSet 1\b/.test(working), working)
  check('...and never mislabelled as a warm-up', !/Warm-up/.test(working), working)

  const warmup = formatLogsForAI([row({ set_number: 1, weight_kg: 20, is_warmup: true })])
  check('a warm-up row is labelled "Warm-up 1", not "Set 1"', /Warm-up 1/.test(warmup) && !/\bSet 1\b/.test(warmup), warmup)

  const drop = formatLogsForAI([row({ set_number: 1, weight_kg: 45, drop_index: 1 })])
  check('a drop is labelled "Set 1, drop 1", never a bare "Set 2"',
    /Set 1, drop 1/.test(drop) && !/\bSet 2\b/.test(drop), drop)

  // THE REAL SEQUENCE: warm-up, then the working set, then its drop, for the
  // SAME exercise — nothing collapses into an undifferentiated list of
  // numbers, which is the exact failure this gate exists to catch.
  const session = formatLogsForAI([
    row({ set_number: 1, weight_kg: 20, is_warmup: true, completed_at: '2026-09-22T09:00:00.000Z' }),
    row({ set_number: 1, weight_kg: 60, completed_at: '2026-09-22T09:05:00.000Z' }),
    row({ set_number: 1, weight_kg: 45, drop_index: 1, completed_at: '2026-09-22T09:06:00.000Z' }),
  ])
  check('a mixed session shows all three kinds, distinctly labelled',
    /Warm-up 1/.test(session) && /\bSet 1\b/.test(session) && /Set 1, drop 1/.test(session), session)
  check('...and the warm-up weight (20kg) is never printed as if it were the working weight',
    !/Set 1 20kg/.test(session), session)
}

console.log('\n2. The two fetches stay separate, and neither borrows the other\'s filter\n')
{
  check('getRecentLogs (streak/PR-facing) still exists and still excludes warm-ups',
    /export async function getRecentLogs\(/.test(tracking) && /\.eq\('is_warmup', false\)/.test(tracking))
  check('...and still excludes drops', /drop_index \?\? 0\) === 0/.test(tracking))
  check('getRecentLogsWithWarmups exists as a SEPARATE function, not a parameter on the first',
    /export async function getRecentLogsWithWarmups\(/.test(tracking))
  // THE PROPERTY THAT MATTERS: the new fetch's own query must not carry the
  // is_warmup filter — a copy-paste of getRecentLogs that "widens" it by
  // deleting one clause would still be caught by the check above (which
  // requires the filter to exist SOMEWHERE in the file) unless this checks
  // the NEW function's own body in isolation.
  const at = tracking.indexOf('export async function getRecentLogsWithWarmups(')
  const body = at === -1 ? '' : tracking.slice(at, tracking.indexOf('\n}', at))
  check('...confirmed by reading its own body: no is_warmup filter in it',
    body.length > 0 && !body.includes("is_warmup"), body.slice(0, 400))
  check('...and no drop_index filter in it either', body.length > 0 && !/drop_index\s*\?\?\s*0\)\s*===\s*0/.test(body))

  check('dashboard-data.ts (streak calc) still calls getRecentLogs, not the warm-up-inclusive one',
    /getRecentLogs\(profileId/.test(dashboardData) && !/getRecentLogsWithWarmups/.test(dashboardData))
  check('ChatAssistant calls the warm-up-inclusive fetch for its own memory',
    /getRecentLogsWithWarmups\(profile\.id/.test(chat))
  check('...and no longer imports the narrower one for that purpose',
    !/\bgetRecentLogs\b(?!WithWarmups)/.test(chat.replace(/getRecentLogsWithWarmups/g, '')))
}

console.log('\n3. The prompt teaches the labels and fences off the coaching directives\n')
{
  check('the prompt explains what "Warm-up N" means', /Warm-up 1.*Warm-up 2/.test(fn) || /"Warm-up 1"/.test(fn))
  check('...and says it is never a working attempt / personal record',
    /NEVER a working attempt/i.test(fn) || /never a working attempt/i.test(fn))
  check('the prompt explains what a drop is', /Set 1, drop 1/.test(fn))
  check('...and says it never anchors next week\'s load',
    /never the weight their NEXT working set/i.test(fn))
  check('PERFORMANCE COACHING DIRECTIVES is scoped to working sets only, in its own heading',
    /PERFORMANCE COACHING DIRECTIVES — about WORKING SETS ONLY/.test(fn))
}

if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log('\nThe coach can see a warm-up now, and cannot mistake it for a working set.\n')

/**
 * THE ONE ASHLEY RUNS. Points the app's own anon key at whichever Supabase
 * project is configured and asks: with no account, what can I read?
 *
 * Audit §1.1. Before this migration the honest answer was "everything" —
 * every profile, weigh-in, injury, allergy and chat transcript in the
 * database, from a key that ships inside the app's JavaScript because it has
 * to. After it, the answer must be "nothing".
 *
 * This is deliberately the crudest possible test: no fixtures, no sign-in, no
 * cleanup, nothing written. It does exactly what someone who copied the key
 * out of the bundle would do, and prints what came back. If any user table
 * returns a row, the migration has not done its job on THAT project, whatever
 * every other gate says.
 *
 * Run it against TEST first:
 *     npm run db:link-test && npm run verify:rls
 * and only then against production. It is read-only, so it is safe on either.
 *
 * Note the one honest limitation: an empty database returns zero rows for the
 * right and the wrong reasons alike, so the script says so rather than
 * claiming a pass it cannot support. On a project with real data in it, the
 * result means what it looks like.
 */
import * as fs from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'

const envPath = path.join(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue
    const [key, ...rest] = line.split('=')
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim()
  }
}

// EXPLICIT TARGET WINS over .env.local, so production can be checked without
// hand-editing the env file — which .env.local's own comment warns not to
// commit, and which is a swap easy to forget to undo.
const url = process.env.RLS_TARGET_URL || process.env.VITE_SUPABASE_URL
const anonKey = process.env.RLS_TARGET_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
if (!url || !anonKey) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (.env.local),')
  console.error('and no RLS_TARGET_URL / RLS_TARGET_ANON_KEY given.')
  process.exit(1)
}

/**
 * WHICH DATABASE DID THIS ACTUALLY READ?
 *
 * The script used to print the bare project ref and nothing else. Ashley ran
 * it, got "PASSED — no user table gave up a single row", and the run had
 * gone to TEST: .env.local points there by design, and the ref is a
 * twenty-character string nobody is expected to recognise on sight. A
 * security check whose reassuring line can describe the wrong database is
 * worse than no check, because it stops the real one being run.
 */
const PROD_REF = 'sdkhuczcfnqqimdgfiks'
const TEST_REF = 'vswuurrtbzbrgubddefv'
const projectRef = url.replace(/^https:\/\//, '').split('.')[0]
const projectName = projectRef === PROD_REF ? 'PRODUCTION'
  : projectRef === TEST_REF ? 'TEST'
  : 'an UNRECOGNISED project'
const isProduction = projectRef === PROD_REF

// Every table holding user data. Kept explicit rather than discovered, so a
// table that stops being listed is a visible edit rather than a silent gap.
const USER_TABLES = [
  'fitness_profiles', 'chat_messages', 'daily_metrics', 'daily_steps', 'water_logs',
  'workout_sessions', 'workout_exercises', 'exercise_set_logs', 'workout_logs', 'cardio_logs',
  'set_logs', 'mesocycle_weeks', 'exercise_plans', 'meal_plans', 'meal_plan_slots',
  'meal_plan_picks', 'meal_events', 'favorite_meals', 'grocery_items',
  'daily_nutrition_targets', 'user_facts', 'user_goals', 'user_context_facts',
  'pending_actions', 'plan_adaptations', 'load_suggestions', 'weight_basis_offers',
  'ai_usage_daily',
]

const anon = createClient(url, anonKey)

console.log(`\nReading as an anonymous caller against ${projectName} (${projectRef})`)
if (!isProduction) {
  console.log('THIS IS NOT THE LIVE DATABASE. Whatever this run says, it says nothing')
  console.log('about the data real people have in the app.')
}
console.log('(this is exactly what someone holding the app\'s public key can do)\n')

let readable = 0
let denied = 0
let empty = 0
const leaks: { table: string; rows: number }[] = []

for (const table of USER_TABLES) {
  const { data, error, count } = await anon.from(table).select('*', { count: 'exact', head: false }).limit(1)
  if (error) {
    // A policy that denies rather than filters shows up as an error. Either
    // shape is a pass; what matters is that no row comes back.
    denied++
    console.log(`  refused  ${table.padEnd(26)} ${error.message}`)
    continue
  }
  const rows = count ?? data?.length ?? 0
  if (rows > 0) {
    readable++
    leaks.push({ table, rows })
    console.log(`  READABLE ${table.padEnd(26)} ${rows} row(s) visible without an account`)
  } else {
    empty++
    console.log(`  empty    ${table.padEnd(26)} nothing came back`)
  }
}

console.log(`\n${USER_TABLES.length} tables: ${empty} returned nothing, ${denied} refused outright, ${readable} handed over rows.`)

if (readable > 0) {
  console.error('\nFAILED — these tables are readable by anyone with the app\'s public key:')
  for (const l of leaks) console.error(`  ${l.table} (${l.rows} rows)`)
  console.error('\nThe migration has not been applied to this project, or a policy is still open.')
  process.exit(1)
}

console.log(`\nPASSED for ${projectName} — no user table there gave up a single row without an account.`)
if (!isProduction) {
  console.log('')
  console.log('THIS DOES NOT COVER YOUR LIVE DATA. To check the database real users are in,')
  console.log('point this at production explicitly (its URL and anon key are in the Supabase')
  console.log(`dashboard for ${PROD_REF}, under Project Settings > API):`)
  console.log('    RLS_TARGET_URL=... RLS_TARGET_ANON_KEY=... npm run verify:rls')
}

// A green tick over an EMPTY database proves nothing at all, and after this
// migration the anon key cannot tell the two apart — it sees zero either way.
// Only the service key can say whether there was anything there to hide, so
// the verdict is conditional on having one, and says so when it does not.
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!serviceKey) {
  console.log('\nNOTE, AND IT MATTERS: zero rows is what a correctly closed database looks')
  console.log('like AND what an empty one looks like, and this run cannot distinguish them.')
  console.log('To settle it, re-run with the project\'s service key in the environment:')
  console.log('    SUPABASE_SERVICE_ROLE_KEY=... npm run verify:rls')
  console.log('(the same run can carry RLS_TARGET_URL/RLS_TARGET_ANON_KEY to aim at production.)')
  console.log('which counts what is actually stored and compares.')
} else {
  const service = createClient(url, serviceKey)
  const { count: realProfiles } = await service
    .from('fitness_profiles')
    .select('*', { count: 'exact', head: true })
  const { count: realMessages } = await service
    .from('chat_messages')
    .select('*', { count: 'exact', head: true })
  console.log(`\nThe database actually holds ${realProfiles ?? 0} profile(s) and ${realMessages ?? 0} chat message(s).`)
  if ((realProfiles ?? 0) === 0) {
    console.log('All of them: none. This project is empty, so the pass above is vacuous —')
    console.log('run it against one with data before trusting it.')
    process.exit(1)
  }
  console.log('An anonymous caller saw none of them. That is the result this script exists for.')
}

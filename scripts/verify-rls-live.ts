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

/**
 * EXPLICIT TARGET WINS over .env.local, so production can be checked without
 * hand-editing the env file — which .env.local's own comment warns not to
 * commit, and which is a swap easy to forget to undo.
 *
 * FLAGS, NOT ENVIRONMENT VARIABLES, and that is the whole point. The first
 * version of this took RLS_TARGET_URL=... in front of the command, which is
 * bash syntax; Ashley runs PowerShell, where it fails with "is not recognized
 * as a name of a cmdlet". A security check nobody can invoke is a security
 * check nobody runs. process.argv parses identically on every shell, so there
 * is one instruction to give and it is right everywhere.
 *
 * The env vars still work, because CI has no argv to give.
 */
const argOf = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`)
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1]
  const inline = process.argv.find(a => a.startsWith(`--${name}=`))
  return inline ? inline.slice(name.length + 3) : undefined
}

const PROD_REF_EARLY = 'sdkhuczcfnqqimdgfiks'
const wantsProd = process.argv.includes('--prod')

/**
 * Strip what a paste picks up. Every one of these has actually arrived:
 * angle brackets copied from an instruction's placeholder, quotes added by a
 * shell, and trailing whitespace from a dashboard's copy button.
 */
const clean = (v: string | undefined): string | undefined => {
  if (v === undefined) return undefined
  const t = v.trim().replace(/^[<"']+|[>"']+$/g, '').trim()
  return t.length ? t : undefined
}

/**
 * AN EXPLICIT TARGET MUST NOT BORROW .env.local's KEY. That key belongs to
 * TEST; pairing it with a production URL asks production to accept a stranger's
 * credential. The reply is an auth error, which carries a PostgREST code, which
 * this script used to count as "the database refused me" — and a refusal is a
 * pass. So `--prod` would have printed PASSED for PRODUCTION on the strength of
 * a key production has never heard of. Caught while testing the prompt, because
 * the prompt did not appear when it should have.
 */
const explicitTarget = !!(clean(argOf('url')) || wantsProd)

const url = clean(argOf('url')) || (wantsProd ? `https://${PROD_REF_EARLY}.supabase.co` : undefined)
  || clean(process.env.RLS_TARGET_URL) || clean(process.env.VITE_SUPABASE_URL)

let anonKey = clean(argOf('anon-key')) || clean(process.env.RLS_TARGET_ANON_KEY)

/**
 * ASK, rather than make somebody build a command line.
 *
 * The instruction to run this was given three times and failed three times on
 * the same machine: once as bash syntax PowerShell cannot parse, then twice
 * because the placeholder — PASTE_KEY_HERE, then <the real key> — was pasted
 * literally, the second time hitting PowerShell's reserved `<`. The command
 * line was the defect, not the person typing it. `--prod` needs nothing
 * pasted at all except the key, and the key is asked for when it is needed.
 */
if (url && !anonKey && (explicitTarget || !clean(process.env.VITE_SUPABASE_ANON_KEY))) {
  const readline = await import('readline/promises')
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const ref = url.replace(/^https:\/\//, '').split('.')[0]
  console.log(`\nReading ${ref === PROD_REF_EARLY ? 'PRODUCTION' : ref}.`)
  console.log('Supabase dashboard > that project > Project Settings > API > the key')
  console.log('labelled "anon" "public" (long, starts with eyJ). Not the service key.\n')
  anonKey = clean(await rl.question('Paste it here and press Enter: '))
  rl.close()
}

if (!explicitTarget) anonKey = anonKey || clean(process.env.VITE_SUPABASE_ANON_KEY)

if (!url || !anonKey) {
  console.error('\nNo database to read, and no key given.')
  console.error('Easiest way to check the live database:')
  console.error('    npm run verify:rls -- --prod')
  console.error('and paste the key when it asks.')
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
let unreachable = 0
const leaks: { table: string; rows: number }[] = []

/**
 * DID THE DATABASE ANSWER, OR DID WE NEVER REACH IT?
 *
 * This script used to count EVERY error as a pass — "a policy that denies
 * rather than filters shows up as an error", which is true of a real refusal
 * and false of a connection that never arrived. Pointed at production with an
 * unreachable host, it printed "PASSED for PRODUCTION" over 28 consecutive
 * transport failures. A wrong URL, a stale key, no internet, or the free tier
 * auto-pausing after a quiet week would all have read as "your data is safe".
 *
 * PostgREST answers carry a `code`; fetch failures do not. Both are checked,
 * because a future client version could attach a code to a transport error
 * and the message patterns are the backstop.
 */
const isDatabaseAnswer = (error: { message?: string; code?: string }): boolean => {
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|allowlist|getaddrinfo|network|socket hang up|timed? ?out|certificate/i.test(error.message ?? '')) return false
  // A REJECTED KEY IS NOT A CLOSED TABLE. "Invalid API key" carries a code and
  // so used to read as a refusal, i.e. a pass — meaning a typo in the key
  // produced a clean bill of health for a database that never even considered
  // the question. We have to be accepted as an anonymous caller before "it
  // showed me nothing" means anything at all.
  if (/invalid api key|jwt|unauthorized|invalid authentication|no api key/i.test(error.message ?? '')) return false
  return !!error.code
}

for (const table of USER_TABLES) {
  const { data, error, count } = await anon.from(table).select('*', { count: 'exact', head: false }).limit(1)
  if (error) {
    if (!isDatabaseAnswer(error)) {
      unreachable++
      console.log(`  NO ANSWER ${table.padEnd(26)} ${error.message}`)
      continue
    }
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

console.log(`\n${USER_TABLES.length} tables: ${empty} returned nothing, ${denied} refused outright, ${readable} handed over rows, ${unreachable} never answered.`)

// AN UNANSWERED TABLE IS NOT A LOCKED ONE. Checked BEFORE the leak check,
// because a run that could not reach the database has not established
// anything either way — including that nothing leaked.
if (unreachable > 0) {
  console.error(`\nINCONCLUSIVE — ${unreachable} of ${USER_TABLES.length} tables never answered, so this run proves nothing.`)
  console.error('Nothing here says your data is safe, and nothing here says it is exposed.')
  console.error('')
  console.error('Usual causes, commonest first:')
  console.error('  - the URL or the anon key is wrong, or has a stray character from pasting')
  console.error('  - the project is PAUSED (free tier pauses after about a week of no traffic;')
  console.error('    open it in the Supabase dashboard and press "Restore project")')
  console.error('  - no internet, or a firewall in the way')
  console.error('')
  console.error('Fix the connection and run it again. This used to print PASSED here, over')
  console.error('28 failed connections in a row, which is the wrong answer to give about a')
  console.error('database nobody could reach.')
  process.exit(1)
}

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
  console.log(`dashboard for ${PROD_REF}, under Project Settings > API — the "anon"`)
  console.log('public key, NOT the service key):')
  console.log('')
  console.log('    npm run verify:rls -- --prod')
  console.log('')
  console.log('It asks for the key; paste it when prompted. Nothing else to type, and it')
  console.log('works the same in PowerShell, Command Prompt and a Mac terminal.')
}

// A green tick over an EMPTY database proves nothing at all, and after this
// migration the anon key cannot tell the two apart — it sees zero either way.
// Only the service key can say whether there was anything there to hide, so
// the verdict is conditional on having one, and says so when it does not.
const serviceKey = argOf('service-key') || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!serviceKey) {
  console.log('\nNOTE, AND IT MATTERS: zero rows is what a correctly closed database looks')
  console.log('like AND what an empty one looks like, and this run cannot distinguish them.')
  console.log('To settle it, re-run with the project\'s service key in the environment:')
  console.log(`    npm run verify:rls${isProduction ? '' : ' -- --prod'} --service-key=THE_KEY`)
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

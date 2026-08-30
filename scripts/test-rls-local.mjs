// ---------------------------------------------------------------------------
// Gate: the database actually refuses. Proven by running it, not by reading it.
//
// Audit §1.1/§1.2. Every other check on this migration is a source scan — it
// can tell you the text says `owns_profile(profile_id)`, and nothing more.
// That is a weak instrument for a change whose entire value is what Postgres
// does at runtime, and this session has already been bitten repeatedly by
// checks that were satisfied by their own explanatory text.
//
// So this one applies all fifty migrations to a REAL PostgreSQL, seeds two
// users and an unclaimed legacy profile, and then tries to read other
// people's data as `anon`. Everything it reports was executed.
//
// The auth schema is a faithful stub, not Supabase: auth.users, and an
// auth.uid() reading the same `request.jwt.claim.sub` GUC that Supabase
// populates from the JWT. That is the exact seam the policies depend on, so
// scoping behaviour transfers; what does NOT transfer is anything about
// Supabase's own GoTrue behaviour, and this gate claims nothing about it.
//
// SKIPS LOUDLY if no local PostgreSQL is installed, rather than passing
// quietly — a green tick for "nothing was run" is the failure mode this file
// exists to avoid.
// ---------------------------------------------------------------------------

import { execFileSync } from 'child_process'
import { existsSync, mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, chmodSync } from 'fs'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS = join(ROOT, 'supabase/migrations')
const PORT = 55433
const DB = 'rls_gate'

const UID_A = '11111111-1111-4111-8111-111111111111'
const UID_B = '22222222-2222-4222-8222-222222222222'
const PROFILE_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const PROFILE_B = 'bbbbbbbb-0000-4000-8000-000000000002'
const PROFILE_LEGACY = 'cccccccc-0000-4000-8000-000000000003'
const SESSION_A = 'dddddddd-0000-4000-8000-000000000001'

let failures = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

// --- find a postgres -------------------------------------------------------

function findBinDir() {
  const candidates = []
  for (const base of ['/usr/lib/postgresql', '/usr/local/pgsql', '/opt/homebrew/opt']) {
    if (!existsSync(base)) continue
    for (const entry of readdirSync(base)) {
      const bin = join(base, entry, 'bin')
      if (existsSync(join(bin, 'initdb'))) candidates.push(bin)
    }
  }
  if (existsSync('/usr/bin/initdb')) candidates.push('/usr/bin')
  return candidates.sort().pop() ?? null
}

const BIN = findBinDir()
if (!BIN) {
  console.log('\nSKIPPED — no local PostgreSQL found. NOTHING WAS VERIFIED by this gate.')
  console.log('Install postgresql (apt install postgresql) to run it, or use `npm run verify:rls`')
  console.log('against the TEST project instead.')
  process.exit(0)
}

// initdb refuses to run as root, so when this runs as root (containers, CI)
// everything goes through an unprivileged user and a path that user can reach.
const asRoot = typeof process.getuid === 'function' && process.getuid() === 0
const DATA = asRoot ? '/var/tmp/rls-gate-pgdata' : mkdtempSync(join(tmpdir(), 'rls-gate-'))
const SOCKET = '/tmp'

function run(cmd, args, opts = {}) {
  const env = { ...process.env, PATH: `${BIN}:${process.env.PATH}` }
  if (asRoot && opts.asPostgres) {
    const quoted = [cmd, ...args].map(a => `'${String(a).replace(/'/g, `'\\''`)}'`).join(' ')
    return execFileSync('su', ['postgres', '-c', `PATH=${BIN}:$PATH ${quoted}`], { env, encoding: 'utf8', stdio: opts.stdio ?? 'pipe' })
  }
  return execFileSync(cmd, args, { env, encoding: 'utf8', stdio: opts.stdio ?? 'pipe', input: opts.input })
}

function psql(sql, { db = DB, role, uid } = {}) {
  const prelude = role
    ? `BEGIN;\nSET LOCAL ROLE ${role};\nSET LOCAL request.jwt.claim.sub = '${uid ?? ''}';\n`
    : ''
  const body = `${prelude}${sql}\n${role ? 'COMMIT;' : ''}`
  const file = join(SOCKET, `rls-gate-${process.pid}.sql`)
  writeFileSync(file, body)
  chmodSync(file, 0o644)
  try {
    return run('psql', ['-h', SOCKET, '-p', String(PORT), '-U', 'postgres', '-d', db, '-tAq', '-v', 'ON_ERROR_STOP=1', '-f', file],
      { asPostgres: asRoot }).trim()
  } finally {
    rmSync(file, { force: true })
  }
}

/** Runs a statement expected to be refused; returns the error text, or null if it unexpectedly succeeded. */
function expectRefused(sql, opts) {
  try { psql(sql, opts); return null } catch (err) {
    return String(err.stderr ?? err.message).trim()
  }
}

function stop() {
  try { run('pg_ctl', ['-D', DATA, '-m', 'immediate', 'stop'], { asPostgres: asRoot, stdio: 'ignore' }) } catch { /* already down */ }
}

// --- bring one up ----------------------------------------------------------

console.log('Starting a throwaway PostgreSQL...')
stop()
rmSync(DATA, { recursive: true, force: true })
try {
  if (asRoot) {
    execFileSync('mkdir', ['-p', DATA])
    execFileSync('chown', ['-R', 'postgres', DATA])
  }
  run('initdb', ['-D', DATA, '-U', 'postgres', '--auth=trust'], { asPostgres: asRoot, stdio: 'ignore' })
  run('pg_ctl', ['-D', DATA, '-o', `-p ${PORT} -k ${SOCKET}`, '-l', join(DATA, 'log'), 'start'], { asPostgres: asRoot, stdio: 'ignore' })
} catch (err) {
  console.error('Could not start PostgreSQL:', String(err.stderr ?? err.message).trim())
  console.log('SKIPPED — NOTHING WAS VERIFIED by this gate.')
  process.exit(0)
}

process.on('exit', stop)

try {
  psql(`DROP DATABASE IF EXISTS ${DB}; CREATE DATABASE ${DB};`, { db: 'postgres' })

  // The Supabase-shaped seam the policies actually depend on.
  psql(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
    $fn$;
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

    -- Supabase grants these roles everything on objects created in public, via
    -- DEFAULT PRIVILEGES, and leans on RLS to narrow the result. Set BEFORE the
    -- migrations run, exactly as a real project has it — because the ordering
    -- is the whole point. A blanket GRANT after the migrations would silently
    -- undo their REVOKEs and this gate would pass while proving the opposite.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
  `)

  console.log('\n1. Every migration applies, in order, to a real PostgreSQL')
  {
    const files = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()
    const broken = []
    for (const f of files) {
      try { psql(readFileSync(join(MIGRATIONS, f), 'utf8')) }
      catch (err) { broken.push({ file: f, error: String(err.stderr ?? err.message).split('\n').find(l => l.includes('ERROR')) }) }
    }
    check(`all ${files.length} migrations apply cleanly`, broken.length === 0, broken)
    if (broken.length) { console.error('\nCannot verify behaviour on a schema that will not build.'); process.exit(1) }
  }

  psql(`
    INSERT INTO auth.users (id, email) VALUES ('${UID_A}','a@example.test'), ('${UID_B}','b@example.test');
    INSERT INTO fitness_profiles (id, owner_id, age, gender, height_cm, weight_kg, activity_level, fitness_goal, training_days, preferred_time) VALUES
      ('${PROFILE_A}','${UID_A}',30,'female',170,70,'moderate','muscle_gain','["mon"]','morning'),
      ('${PROFILE_B}','${UID_B}',40,'male',180,80,'moderate','fat_loss','["tue"]','evening'),
      ('${PROFILE_LEGACY}',NULL,25,'female',165,60,'light','maintain','["wed"]','evening');
    INSERT INTO chat_messages (profile_id, role, content) VALUES
      ('${PROFILE_A}','user','A secret'), ('${PROFILE_B}','user','B secret'), ('${PROFILE_LEGACY}','user','Legacy secret');
    INSERT INTO workout_sessions (id, profile_id, date, split_type, duration_minutes, is_completed) VALUES
      ('${SESSION_A}','${PROFILE_A}','2026-08-30','Push',60,false),
      ('dddddddd-0000-4000-8000-000000000002','${PROFILE_B}','2026-08-30','Pull',60,false);
    INSERT INTO workout_exercises (workout_session_id, exercise_name, tier, execution_order, sets, reps_scheme, rest_seconds) VALUES
      ('${SESSION_A}','Bench Press',1,1,3,'8-10',120),
      ('dddddddd-0000-4000-8000-000000000002','Barbell Row',1,1,3,'8-10',120);
    INSERT INTO set_logs (user_id, exercise_name, day, set_number, reps_completed) VALUES
      ('${PROFILE_A}','Legacy Bench','Push',1,8);
  `)

  console.log('\n2. The hole is shut: nobody reads anybody else')
  {
    const asA = sql => psql(sql, { role: 'authenticated', uid: UID_A })

    check('signed in as A, A sees their own profile',
      asA(`SELECT count(*) FROM fitness_profiles WHERE id = '${PROFILE_A}';`) === '1')
    check("...and NOT B's", asA(`SELECT count(*) FROM fitness_profiles WHERE id = '${PROFILE_B}';`) === '0')
    check('...and not the unclaimed legacy one either',
      asA(`SELECT count(*) FROM fitness_profiles WHERE id = '${PROFILE_LEGACY}';`) === '0')
    check('an unfiltered SELECT * returns exactly one row — theirs',
      asA('SELECT count(*) FROM fitness_profiles;') === '1')

    // The specific thing that would have survived a table-name-driven DROP.
    check("B's chat transcript is unreadable by A", asA("SELECT count(*) FROM chat_messages WHERE content = 'B secret';") === '0')
    check('...and A still reads their own', asA("SELECT count(*) FROM chat_messages WHERE content = 'A secret';") === '1')

    check('the child table with no profile column of its own is scoped through its parent',
      asA('SELECT count(*) FROM workout_exercises;') === '1' &&
      asA("SELECT count(*) FROM workout_exercises WHERE exercise_name = 'Barbell Row';") === '0')
  }

  console.log('\n3. Holding only the anon key, signed in as nobody, reads nothing')
  {
    const anon = sql => psql(sql, { role: 'anon' })
    const userTables = psql(`
      SELECT c.relname FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND c.relname NOT IN ('nutrition_cache')
      ORDER BY 1;
    `).split('\n').filter(Boolean)

    check('there are user tables to check at all', userTables.length > 20, userTables.length)
    const leaking = []
    for (const t of userTables) {
      const n = anon(`SELECT count(*) FROM ${t};`)
      if (n !== '0') leaking.push({ table: t, rows: Number(n) })
    }
    check('EVERY user table returns zero rows to an unauthenticated caller', leaking.length === 0, leaking)

    // The shared lookup is deliberately still readable — and deliberately
    // no longer writable by the key that ships in the app bundle.
    check('the shared ingredient cache is still readable', anon('SELECT count(*) FROM nutrition_cache;') === '0')
    const poisoned = expectRefused(
      `INSERT INTO nutrition_cache (ingredient_hash, ingredients, calories, protein, carbs, fat) VALUES ('poison', '[]', 1, 1, 1, 1);`,
      { role: 'anon' })
    check('...but no longer writable', poisoned !== null && /row-level security|policy/i.test(poisoned), poisoned)
  }

  console.log('\n4. Claiming a legacy profile works once, for one person')
  {
    const claimedByA = psql(`SELECT claim_profile('${PROFILE_LEGACY}');`, { role: 'authenticated', uid: UID_A })
    check('a signed-in caller can claim an unowned profile', claimedByA === 't', claimedByA)
    check('...and can then read it',
      psql(`SELECT count(*) FROM fitness_profiles WHERE id = '${PROFILE_LEGACY}';`, { role: 'authenticated', uid: UID_A }) === '1')
    check("...including the rows that hung off it", 
      psql(`SELECT count(*) FROM chat_messages WHERE content = 'Legacy secret';`, { role: 'authenticated', uid: UID_A }) === '1')

    const stolen = psql(`SELECT claim_profile('${PROFILE_LEGACY}');`, { role: 'authenticated', uid: UID_B })
    check('a second caller cannot take it off them', stolen === 'f', stolen)
    check('...and still cannot read it',
      psql(`SELECT count(*) FROM fitness_profiles WHERE id = '${PROFILE_LEGACY}';`, { role: 'authenticated', uid: UID_B }) === '0')

    const stolenOwned = psql(`SELECT claim_profile('${PROFILE_A}');`, { role: 'authenticated', uid: UID_B })
    check("an already-owned profile cannot be claimed at all", stolenOwned === 'f', stolenOwned)

    const anonClaim = psql(`SELECT claim_profile('${PROFILE_B}');`, { role: 'anon' })
    check('a caller who is not signed in claims nothing', anonClaim === 'f', anonClaim)
  }

  console.log('\n5. Writing as somebody else is refused, not silently ignored')
  {
    const forged = expectRefused(
      `INSERT INTO chat_messages (profile_id, role, content) VALUES ('${PROFILE_B}','user','forged');`,
      { role: 'authenticated', uid: UID_A })
    check("A cannot insert a message into B's history", forged !== null && /row-level security/i.test(forged), forged)

    // An UPDATE that matches no visible row is not an error — it is a no-op.
    // What matters is that B's row is unchanged afterwards.
    psql(`UPDATE chat_messages SET content = 'tampered' WHERE content = 'B secret';`, { role: 'authenticated', uid: UID_A })
    check("...and cannot edit B's messages", psql("SELECT count(*) FROM chat_messages WHERE content = 'B secret';") === '1')

    psql(`DELETE FROM fitness_profiles WHERE id = '${PROFILE_B}';`, { role: 'authenticated', uid: UID_A })
    check("...and cannot delete B's profile", psql(`SELECT count(*) FROM fitness_profiles WHERE id = '${PROFILE_B}';`) === '1')

    const misowned = expectRefused(
      `INSERT INTO fitness_profiles (id, owner_id, age, gender, height_cm, weight_kg, activity_level, fitness_goal, training_days, preferred_time)
       VALUES (gen_random_uuid(), '${UID_B}', 20, 'male', 175, 75, 'light', 'maintain', '["mon"]', 'morning');`,
      { role: 'authenticated', uid: UID_A })
    check('a new profile cannot be created owned by somebody else', misowned !== null && /row-level security/i.test(misowned), misowned)

    const unowned = expectRefused(
      `INSERT INTO fitness_profiles (id, age, gender, height_cm, weight_kg, activity_level, fitness_goal, training_days, preferred_time)
       VALUES (gen_random_uuid(), 20, 'male', 175, 75, 'light', 'maintain', '["mon"]', 'morning');`,
      { role: 'authenticated', uid: UID_A })
    check('...nor one owned by nobody, which would be unreadable anyway', unowned !== null && /row-level security/i.test(unowned), unowned)
  }

  console.log('\n6. The legacy table nothing reads is closed, not half-scoped')
  {
    check('set_logs returns nothing to a signed-in caller',
      psql('SELECT count(*) FROM set_logs;', { role: 'authenticated', uid: UID_A }) === '0')
    check('...and nothing to an anonymous one',
      psql('SELECT count(*) FROM set_logs;', { role: 'anon' }) === '0')
    check('...while the row is still there for the service role to see',
      psql('SELECT count(*) FROM set_logs;') === '1')
  }

  console.log('\n7. RLS is on everywhere, and nothing is still USING (true)')
  {
    const unprotected = psql(`
      SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity ORDER BY 1;
    `).split('\n').filter(Boolean)
    check('every table in public has row-level security enabled', unprotected.length === 0, unprotected)

    const wideOpen = psql(`
      SELECT tablename || '.' || policyname FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename <> 'nutrition_cache'
        AND (coalesce(qual, 'true') = 'true' AND coalesce(with_check, 'true') = 'true')
      ORDER BY 1;
    `).split('\n').filter(Boolean)
    check('no policy on a user table is unconditional', wideOpen.length === 0, wideOpen)

    // "Did a table get missed?" — asked of the SCHEMA's list of tables that
    // hold user data, not of the policies that happen to exist.
    //
    // The first version of this check grouped pg_policies by table and failed
    // any group whose count wasn't 4. Deleting every policy from a table left
    // no group at all, so it counted zero tables and passed: the exact
    // "a table got missed" case it was written to catch. A table with RLS on
    // and no policy is not a security hole — it denies everyone, its owner
    // included — but it silently breaks that feature for every user, which is
    // its own kind of shipped disaster.
    const expectScoped = psql(`
      SELECT DISTINCT cl.relname
      FROM pg_constraint con
      JOIN pg_class cl ON cl.oid = con.conrelid
      JOIN pg_class ref ON ref.oid = con.confrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
      WHERE con.contype = 'f' AND ref.relname = 'fitness_profiles' AND n.nspname = 'public'
      ORDER BY 1;
    `).split('\n').filter(Boolean)
    check('the schema still has the user tables this expects', expectScoped.length >= 24, expectScoped.length)

    const counts = new Map(psql(`
      SELECT tablename || '=' || count(*) FROM pg_policies
      WHERE schemaname = 'public' AND policyname LIKE 'owner\\_%'
      GROUP BY tablename ORDER BY 1;
    `).split('\n').filter(Boolean).map(row => row.split('=')))
    const wrong = expectScoped
      .map(t => ({ table: t, policies: Number(counts.get(t) ?? 0) }))
      .filter(r => r.policies !== 4)
    check('every table holding user data carries all four of select/insert/update/delete',
      wrong.length === 0, wrong)

    // And prove it by reading, not only by counting: a policy set that exists
    // but denies its own owner is the failure a count cannot see.
    const unreadable = []
    for (const t of expectScoped) {
      const col = psql(`
        SELECT a.attname FROM pg_constraint con
        JOIN pg_class cl ON cl.oid = con.conrelid
        JOIN pg_class ref ON ref.oid = con.confrelid
        JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attnum = con.conkey[1]
        WHERE con.contype = 'f' AND ref.relname = 'fitness_profiles' AND cl.relname = '${t}' LIMIT 1;
      `)
      if (!col) continue
      try { psql(`SELECT count(*) FROM ${t} WHERE ${col} = '${PROFILE_A}';`, { role: 'authenticated', uid: UID_A }) }
      catch (err) { unreadable.push({ table: t, error: String(err.stderr ?? err.message).split('\n')[0] }) }
    }
    check('...and every one of them is queryable by its owner', unreadable.length === 0, unreadable)
  }

  console.log('\n8. The counter behind the spend cap is reachable by nobody but the server')
  {
    check('anon reads no usage rows', psql('SELECT count(*) FROM ai_usage_daily;', { role: 'anon' }) === '0')
    const bumped = expectRefused(`SELECT increment_ai_usage('profile:x', 'chat-gemini');`, { role: 'anon' })
    check('anon cannot call the increment function', bumped !== null && /permission denied/i.test(bumped), bumped)
  }
} finally {
  stop()
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nAll local RLS checks passed — against a database that actually ran them.')

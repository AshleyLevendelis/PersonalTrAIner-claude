// ---------------------------------------------------------------------------
// Writes the RLS migration from the schema, rather than by hand.
//
// Audit §1.1/§1.2. Twenty-nine tables, four policies each, and every one of
// them has to be right — a single table left behind keeps the hole open, and
// a hand-written list is exactly the artefact that quietly misses one.
//
// TWO THINGS THIS CATCHES THAT A HUMAN LIST DID NOT, both found the first
// time it was run against the real schema:
//
//   1. chat_messages' existing policies are named `anon_select_messages`,
//      not `anon_select_chat_messages`. A DROP built from the table name
//      would have been a silent no-op, the old `USING (true)` policy would
//      have survived, and because permissive policies OR together, every
//      user's chat transcript would still have been world-readable AFTER a
//      migration whose entire purpose was to close that. The drops are
//      therefore taken from the policy names the migrations actually create.
//
//   2. set_logs keys on `user_id text`, not uuid — it is a pre-C0 table
//      nothing in src/ reads any more. `owns_profile(user_id)` there is not
//      a weak policy, it is a type error that fails the whole migration on
//      apply. Tables with no uuid path to a profile are CLOSED instead
//      (RLS on, no policy), which is also the right default for any future
//      table that arrives without an ownership story.
//
// Usage:
//   node scripts/generate-rls-migration.mjs           # write the migration
//   node scripts/generate-rls-migration.mjs --check   # fail if it is stale
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS = join(ROOT, 'supabase/migrations')
const OUTPUT_NAME = '20260830120000_scope_every_table_to_its_owner.sql'
const OUTPUT = join(MIGRATIONS, OUTPUT_NAME)

/**
 * Left open on purpose, with the reason on the record. Anything NOT in here
 * and with no ownership path gets closed rather than assumed harmless.
 */
const EXEMPT = {
  ai_usage_daily: 'service-role only already; RLS on, no policy. See its own migration.',
  nutrition_cache:
    'a shared ingredient->macros lookup with no user data in it. Left readable so every client does not re-derive the same numbers; writes are closed.',
}

const ROOT_TABLE = 'fitness_profiles'

// --- read the schema -------------------------------------------------------

const sources = readdirSync(MIGRATIONS)
  .filter(f => f.endsWith('.sql') && f !== OUTPUT_NAME)
  .sort()
const sql = sources.map(f => readFileSync(join(MIGRATIONS, f), 'utf8')).join('\n')

/** table -> [{ name, type, refTable }] */
const tables = new Map()
for (const m of sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\n\);/g)) {
  const [, table, body] = m
  const columns = []
  for (const line of body.split('\n')) {
    const col = /^\s*(\w+)\s+(uuid|text|integer|numeric|boolean|jsonb|timestamptz|date)\b(.*)$/.exec(line)
    if (!col) continue
    const ref = /REFERENCES\s+(\w+)\s*\(/.exec(col[3])
    columns.push({
      name: col[1],
      type: col[2],
      refTable: ref?.[1] ?? null,
      notNull: /\bNOT NULL\b/i.test(col[3]),
    })
  }
  // A table can be created once and altered later; keep the first definition
  // and merge any columns a later CREATE adds (none today, but silently
  // dropping one would be the same class of miss this script exists to stop).
  const existing = tables.get(table) ?? []
  const seen = new Set(existing.map(c => c.name))
  tables.set(table, [...existing, ...columns.filter(c => !seen.has(c.name))])
}

/** table -> Set of policy names that already exist. The drops come from HERE. */
const existingPolicies = new Map()
for (const m of sql.matchAll(/CREATE POLICY\s+"([^"]+)"\s+ON\s+(\w+)/g)) {
  const [, name, table] = m
  if (!existingPolicies.has(table)) existingPolicies.set(table, new Set())
  existingPolicies.get(table).add(name)
}

// --- classify --------------------------------------------------------------

/** A uuid column pointing straight at fitness_profiles(id). */
function directOwnerColumn(table) {
  return tables.get(table)?.find(c => c.refTable === ROOT_TABLE && c.type === 'uuid')?.name ?? null
}

const scoped = []      // { table, column }
const viaParent = []   // { table, column, parent, parentColumn }
const closed = []      // { table, why }

for (const table of [...tables.keys()].sort()) {
  if (table === ROOT_TABLE || table in EXEMPT) continue
  const direct = directOwnerColumn(table)
  if (direct) { scoped.push({ table, column: direct }); continue }

  // No column of its own — is its parent scoped? (workout_exercises is.)
  //
  // NOT NULL is load-bearing, not decoration. A nullable parent link means
  // rows can sit with no parent at all, and `EXISTS (... p.id = <null>)` is
  // false for every one of them: the policy would look like scoping while
  // actually being an unreachability accident. set_logs.exercise_plan_id is
  // exactly that — nullable, ON DELETE SET NULL — so it is refused here and
  // falls through to being closed, which is what its `user_id text` deserves.
  const parentRef = tables.get(table).find(
    c => c.type === 'uuid' && c.notNull && c.refTable && c.refTable !== table && directOwnerColumn(c.refTable),
  )
  if (parentRef) {
    viaParent.push({
      table,
      column: parentRef.name,
      parent: parentRef.refTable,
      parentColumn: directOwnerColumn(parentRef.refTable),
    })
    continue
  }

  // A non-uuid `user_id`/`profile_id` is the set_logs case: it LOOKS scopable
  // and is not. Naming that specifically beats a generic "no path" line.
  const lookalike = tables.get(table).find(c => /^(user_id|profile_id|owner_id)$/.test(c.name))
  closed.push({
    table,
    why: lookalike
      ? `${lookalike.name} is ${lookalike.type}, not a uuid pointing at ${ROOT_TABLE} — owns_profile() cannot be applied to it`
      : `no column linking it to ${ROOT_TABLE}`,
  })
}

// --- emit ------------------------------------------------------------------

const dropsFor = table =>
  [...(existingPolicies.get(table) ?? [])]
    .sort()
    .map(p => `DROP POLICY IF EXISTS "${p}" ON ${table};`)
    .join('\n')

function crudPolicies(table, predicate) {
  return [
    `CREATE POLICY "owner_select_${table}" ON ${table} FOR SELECT`,
    `  TO anon, authenticated USING (${predicate});`,
    `CREATE POLICY "owner_insert_${table}" ON ${table} FOR INSERT`,
    `  TO anon, authenticated WITH CHECK (${predicate});`,
    `CREATE POLICY "owner_update_${table}" ON ${table} FOR UPDATE`,
    `  TO anon, authenticated USING (${predicate}) WITH CHECK (${predicate});`,
    `CREATE POLICY "owner_delete_${table}" ON ${table} FOR DELETE`,
    `  TO anon, authenticated USING (${predicate});`,
  ].join('\n')
}

const rule = '-- ' + '-'.repeat(73)

const out = []

out.push(`/*
  # Every table belongs to somebody (audit §1.1, §1.2)

  GENERATED by scripts/generate-rls-migration.mjs from the migrations in this
  directory. Regenerate rather than edit by hand — \`node
  scripts/generate-rls-migration.mjs\`, and \`--check\` fails if this file has
  drifted from the schema.

  ## What was wrong

  All 112 policies across 28 tables were \`TO anon USING (true)\` — anonymous,
  unconditional read, write and delete. The anon key ships inside the app's
  JavaScript because it has to, so anyone who opened the app and copied one
  string could download every user's weight history, injuries, allergies and
  chat transcripts, or delete them.

  That was a deliberate single-tenant decision, and the migration that set
  the pattern says so. It stopped being right when the app got users.

  ## How ownership arrives without locking anyone out

  \`fitness_profiles.owner_id\` is new and NULL on every existing row. A NULL
  owner is readable by NOBODY — deliberately. The only way to attach one is
  \`claim_profile\`, a SECURITY DEFINER function that sets owner_id where it is
  still NULL, called by the client once it has signed in (anonymously, with
  no interruption) using the profile id already in its localStorage.

  The tempting alternative — a policy allowing reads where \`owner_id IS NULL\`
  so a client can find its own row — would leave every unclaimed profile
  readable by anyone, which is the hole this migration exists to close.

  RESIDUAL RISK, ON THE RECORD: someone who knows a specific profile's UUID
  could claim it before its owner next opens the app. That needs a v4 UUID
  that is no longer listable, where today the same person needs nothing at
  all. The window closes per user on their next visit.

  ## Why the drops name policies rather than tables

  chat_messages' policies are called \`anon_select_messages\`, not
  \`anon_select_chat_messages\`. Dropping the name a table-driven loop would
  have guessed is a silent no-op, the old \`USING (true)\` policy survives,
  and permissive policies OR together — so the transcripts would have stayed
  world-readable after the migration that existed to stop that. Every DROP
  below is a policy name read out of the migrations.

  ## Not scoped, on purpose
${Object.entries(EXEMPT).map(([t, why]) => `    - ${t}: ${why}`).join('\n')}
    - ${ROOT_TABLE}: the root table — scoped on owner_id directly, below.
${closed.map(c => `    - ${c.table}: CLOSED, not scoped — ${c.why}. Nothing in src/ reads it.`).join('\n')}

  ## Safety

  Edge functions use the service-role key and bypass RLS entirely, so none of
  them change. \`db:push-both\` applies this to TEST first.
*/`)

out.push(`
${rule}
-- 1. Ownership on the root table
${rule}

ALTER TABLE ${ROOT_TABLE} ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_fitness_profiles_owner ON ${ROOT_TABLE} (owner_id);`)

out.push(`
${rule}
-- 2. One predicate, used by every child policy
${rule}
--
-- STABLE so the planner calls it once per query rather than once per row, and
-- SECURITY DEFINER so a child table's policy can consult ${ROOT_TABLE}
-- without the caller needing to read it directly.

CREATE OR REPLACE FUNCTION owns_profile(p uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM ${ROOT_TABLE}
    WHERE id = p AND owner_id IS NOT NULL AND owner_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION owns_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION owns_profile(uuid) TO anon, authenticated;`)

out.push(`
${rule}
-- 3. Claiming a legacy profile — the ONLY way an unowned row gets an owner
${rule}

CREATE OR REPLACE FUNCTION claim_profile(p_profile_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  -- \`owner_id IS NULL\` is what makes this safe to call repeatedly and
  -- impossible to use to steal an owned profile.
  UPDATE ${ROOT_TABLE}
     SET owner_id = auth.uid()
   WHERE id = p_profile_id
     AND owner_id IS NULL;

  GET DIAGNOSTICS claimed = ROW_COUNT;
  RETURN claimed > 0;
END;
$$;

REVOKE ALL ON FUNCTION claim_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_profile(uuid) TO anon, authenticated;`)

out.push(`
${rule}
-- 4. The root table's own policies
${rule}

${dropsFor(ROOT_TABLE)}

CREATE POLICY "owner_select_${ROOT_TABLE}" ON ${ROOT_TABLE} FOR SELECT
  TO anon, authenticated USING (owner_id IS NOT NULL AND owner_id = auth.uid());

-- A new profile must be stamped with its creator. WITH CHECK makes it
-- impossible to insert one owned by somebody else.
CREATE POLICY "owner_insert_${ROOT_TABLE}" ON ${ROOT_TABLE} FOR INSERT
  TO anon, authenticated WITH CHECK (owner_id = auth.uid());

CREATE POLICY "owner_update_${ROOT_TABLE}" ON ${ROOT_TABLE} FOR UPDATE
  TO anon, authenticated
  USING (owner_id IS NOT NULL AND owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "owner_delete_${ROOT_TABLE}" ON ${ROOT_TABLE} FOR DELETE
  TO anon, authenticated USING (owner_id IS NOT NULL AND owner_id = auth.uid());`)

out.push(`
${rule}
-- 5. Every child table (${scoped.length + viaParent.length} of them), scoped through owns_profile
${rule}`)

for (const { table, column } of scoped) {
  out.push(`
-- ${table} (keys on ${column})
${dropsFor(table)}
ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
${crudPolicies(table, `owns_profile(${column})`)}`)
}

for (const { table, column, parent, parentColumn } of viaParent) {
  const predicate =
    `EXISTS (\n    SELECT 1 FROM ${parent} p WHERE p.id = ${table}.${column} AND owns_profile(p.${parentColumn}))`
  out.push(`
-- ${table} has no profile column of its own — scoped through its parent, ${parent}.
${dropsFor(table)}
ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
${crudPolicies(table, predicate)}`)
}

if (closed.length) {
  out.push(`
${rule}
-- 6. Closed entirely — reachable by the service role only
${rule}`)
  for (const { table, why } of closed) {
    out.push(`
-- ${table}: ${why}.
-- RLS on with no policy means anon and authenticated read nothing and write
-- nothing. Edge functions and the dashboard still reach it via service_role,
-- so nothing is destroyed — it stops being readable by anyone with the key
-- that ships in the app.
${dropsFor(table)}
ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`)
  }
}

const cacheDrops = [...(existingPolicies.get('nutrition_cache') ?? [])]
  .filter(p => !/select/.test(p))
  .sort()
  .map(p => `DROP POLICY IF EXISTS "${p}" ON nutrition_cache;`)
  .join('\n')

out.push(`
${rule}
-- ${closed.length ? 7 : 6}. nutrition_cache — readable by all, writable by none
${rule}
--
-- A shared ingredient->macros lookup holding no user data. Left readable so
-- every client does not re-derive the same numbers; the write policies go, so
-- it can no longer be poisoned by anyone holding the anon key.

${cacheDrops}
`)

const generated = out.join('\n')

// --- write, or complain ----------------------------------------------------

const isCheck = process.argv.includes('--check')
const current = (() => { try { return readFileSync(OUTPUT, 'utf8') } catch { return null } })()

if (isCheck) {
  if (current === generated) {
    console.log(`ok: ${OUTPUT_NAME} matches the schema`)
    process.exit(0)
  }
  console.error(`FAIL: ${OUTPUT_NAME} is stale or hand-edited.`)
  console.error('Run: node scripts/generate-rls-migration.mjs')
  process.exit(1)
}

writeFileSync(OUTPUT, generated)
console.log(`Wrote ${OUTPUT_NAME}`)
console.log(`  scoped directly : ${scoped.length}`)
console.log(`  scoped via parent: ${viaParent.length} (${viaParent.map(v => v.table).join(', ') || 'none'})`)
console.log(`  closed entirely : ${closed.length} (${closed.map(c => c.table).join(', ') || 'none'})`)
console.log(`  left open       : ${Object.keys(EXEMPT).join(', ')}`)

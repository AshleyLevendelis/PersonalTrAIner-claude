// ---------------------------------------------------------------------------
// Gate: a user can take their data with them, and can actually get rid of it.
//
// Audit §1.4. There was neither. "New Plan" cleared the browser and started
// fresh WITHOUT deleting a single row, so every profile, weigh-in, chat
// message and logged set from before it stayed in the database permanently,
// now unreachable from the app. There was no export at all.
//
// Two properties are worth holding still, and they pull in opposite
// directions:
//
//   THE EXPORT MUST BE COMPLETE, so its table list is checked against the
//   migrations. A table added later and not exported fails here rather than
//   being silently omitted from what someone is told is all their data.
//
//   THE DELETE MUST BE TOTAL, so it leans on the database's own cascades
//   rather than a hand-written list of thirty deletes — which is the version
//   that leaves someone's chat history behind the first time a table is
//   added and the list isn't updated. Section 3 re-derives the cascade map
//   from the migrations and fails if any user table stops cascading.
//
// Section 1 runs the real export against a stubbed client.
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync } from 'fs'
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

// --- a stub client that records what was asked for --------------------------

const reads: { table: string; column: string; value: string }[] = []
const deletes: { table: string; column: string; value: string }[] = []
let failingTable: string | null = null

function fakeFrom(table: string) {
  let mode: 'select' | 'delete' = 'select'
  const api: Record<string, unknown> = {
    select: () => { mode = 'select'; return api },
    delete: () => { mode = 'delete'; return api },
    eq: (column: string, value: string) => {
      if (mode === 'select') reads.push({ table, column, value })
      else deletes.push({ table, column, value })
      const result = mode === 'delete'
        ? { data: null, error: null }
        : table === failingTable
          ? { data: null, error: { message: 'permission denied' } }
          : { data: [{ id: `${table}-row` }], error: null }
      return Object.assign(Promise.resolve(result), api)
    },
  }
  return api
}

const { setSupabaseClient } = await import('../src/lib/supabase')
setSupabaseClient({ from: fakeFrom } as never)
const userData = await import('../src/lib/user-data')

console.log('\n1. The export reads every table it lists, and admits what it could not')
{
  reads.length = 0
  const exported = await userData.buildDataExport('prof-1')

  check('every listed table was actually read',
    userData.EXPORTED_TABLES.every(t => reads.some(r => r.table === t.table)),
    userData.EXPORTED_TABLES.filter(t => !reads.some(r => r.table === t.table)).map(t => t.table))
  check('...each filtered to this profile and no other',
    reads.every(r => r.value === 'prof-1'))
  // Checked against the SCHEMA, not against EXPORTED_TABLES — comparing the
  // reads to the list they came from is circular, and an earlier version of
  // this check did exactly that: renaming exercise_set_logs' column from
  // user_id to profile_id (which would export nobody's sets) kept it green.
  const schemaColumn = new Map<string, string>()
  {
    const allSql = readdirSync(join(ROOT, 'supabase/migrations'))
      .map(f => readFileSync(join(ROOT, 'supabase/migrations', f), 'utf8')).join('\n')
    for (const m of allSql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\n\);/g)) {
      const [, table, body] = m
      const ref = /(\w+)\s+uuid[^,]*REFERENCES\s+fitness_profiles\(id\)/.exec(body)
      if (ref) schemaColumn.set(table, ref[1])
    }
    schemaColumn.set('fitness_profiles', 'id') // the root table keys on itself
  }
  const wrongColumn = reads.filter(r => schemaColumn.has(r.table) && schemaColumn.get(r.table) !== r.column)
  check('...using the column the SCHEMA says that table keys on', wrongColumn.length === 0,
    wrongColumn.map(r => ({ table: r.table, used: r.column, schema: schemaColumn.get(r.table) })))
  check('a clean run reports nothing missing', exported.incomplete.length === 0, exported.incomplete)

  // AN EXPORT THAT QUIETLY OMITS A TABLE IS A LIE ABOUT COMPLETENESS.
  reads.length = 0
  failingTable = 'chat_messages'
  const partial = await userData.buildDataExport('prof-1')
  failingTable = null
  check('a table that fails to read is recorded, not skipped',
    partial.incomplete.some(i => i.table === 'chat_messages'), partial.incomplete)
  check('...with the reason', partial.incomplete[0]?.reason === 'permission denied', partial.incomplete)
  check('...and the rest still export', Object.keys(partial.data).length === userData.EXPORTED_TABLES.length - 1)

  const summary = userData.summariseExport(exported)
  check('the summary counts real rows, so the user is told a true number', summary.total > 0, summary.total)
}

console.log('\n2. The delete removes the profile, and the counter row that cannot cascade')
{
  deletes.length = 0
  const result = await userData.deleteAllUserData('prof-1')
  check('it succeeds', result.ok, result)
  check('it deletes the profile row — the one every cascade hangs off',
    deletes.some(d => d.table === 'fitness_profiles' && d.column === 'id' && d.value === 'prof-1'), deletes)
  // ai_usage_daily deliberately has no foreign key: it must outlive the
  // profile it is rate-limiting, so it cannot cascade and must be cleared.
  check('...and the usage counter, which has no foreign key by design',
    deletes.some(d => d.table === 'ai_usage_daily' && d.value === 'profile:prof-1'), deletes)

  const src = stripComments(readFileSync(join(ROOT, 'src/lib/user-data.ts'), 'utf8'))
  check('it does NOT hand-roll a list of per-table deletes',
    (src.match(/\.delete\(\)/g) ?? []).length <= 2,
    (src.match(/\.delete\(\)/g) ?? []).length)
}

console.log('\n3. Every user table still cascades from the profile')
{
  // Re-derived from the migrations, not asserted from memory — the delete is
  // only total for as long as this stays true, and a new table added without
  // ON DELETE CASCADE would silently survive a deletion.
  const sql = readdirSync(join(ROOT, 'supabase/migrations'))
    .map(f => readFileSync(join(ROOT, 'supabase/migrations', f), 'utf8'))
    .join('\n')

  const noCascade: string[] = []
  for (const m of sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\n\);/g)) {
    const [, table, body] = m
    for (const ref of body.matchAll(/(\w+)\s+uuid[^,]*REFERENCES\s+fitness_profiles\(id\)([^,]*)/g)) {
      if (!/ON DELETE CASCADE/i.test(ref[2])) noCascade.push(`${table}.${ref[1]}`)
    }
  }
  check('no table references the profile without cascading', noCascade.length === 0, noCascade)

  // And the export must cover them: a table whose rows are deleted but never
  // offered for download is data someone can lose but never take with them.
  const referencing = new Set<string>()
  for (const m of sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\n\);/g)) {
    if (/REFERENCES\s+fitness_profiles\(id\)/.test(m[2])) referencing.add(m[1])
  }
  const exportedNames = new Set(userData.EXPORTED_TABLES.map(t => t.table))
  const missing = [...referencing].filter(t => !exportedNames.has(t))
  check('every table that holds user data is in the export list', missing.length === 0, missing)
}

console.log('\n4. The screen makes deletion deliberate, and says what it costs')
{
  const screen = stripComments(readFileSync(join(ROOT, 'src/components/ProfileScreen.tsx'), 'utf8'))
  check('there is a download control', /Download my data/.test(screen))
  check('there is a delete control', /Delete everything/.test(screen))
  // Arm-then-tap is right for one remembered note. It is far too easy for
  // the single action in this app that destroys everything irreversibly.
  check('deleting needs a TYPED confirmation, not a second tap',
    /deleteConfirm\.trim\(\)\.toLowerCase\(\) !== 'delete'/.test(screen))
  check('...enforced on the button, not only in the handler',
    /disabled=\{deleteConfirm\.trim\(\)\.toLowerCase\(\) !== 'delete'/.test(screen))
  check('the warning names what is lost, rather than saying "are you sure"',
    /every weigh-in and logged set/.test(screen) && /cannot be undone/.test(screen))
  check('a failed delete is reported', /Couldn't delete your data/.test(screen))

  // The duplicate-rule trap: a second list of localStorage keys to clear,
  // living beside handleReset's, is what test:reset-clears-draft exists to
  // prevent. restoreSession already handles a stored id with no row.
  check('it does not keep a second list of keys to clear',
    !/localStorage\.removeItem/.test(screen))
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nAll user-data checks passed.')

// ---------------------------------------------------------------------------
// EVERY TABLE NAMED IN A MIGRATION OR A QUERY MUST ACTUALLY EXIST.
//
// WHY. Migration 20260826140000 shipped `alter table profiles`, and
// src/lib/load-ceiling-prompt.ts shipped `supabase.from('profiles')`. The
// table is called `fitness_profiles` and always has been — every one of the
// other 46 migrations says so. Nothing caught it:
//
//   - tsc cannot: a table name is a string.
//   - the 55 other gates cannot: they exercise the ENGINE, which is pure and
//     never touches a database.
//   - the app would not have: the write path's isMissingColumnError guard
//     matches /schema cache/, and PostgREST's reply for an absent table is
//     "Could not find the table 'public.profiles' in the schema cache" —
//     so the feature would have failed SILENTLY, forever, reporting only
//     "needs migration" to a screen that shows nothing.
//
// It surfaced only because a real migration run against a real database threw
// `relation "profiles" does not exist`. That is a good outcome — it failed on
// TEST, loudly, before production — but it should not need a human at a
// keyboard in another country to find a typo.
//
// WHAT THIS CHECKS. The set of tables the migrations CREATE, versus the set
// they ALTER and the set the app QUERIES. Anything referenced but never
// created is a hard failure.
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const MIG_DIR = 'supabase/migrations'
const files = readdirSync(MIG_DIR).filter(f => f.endsWith('.sql')).sort()

/** Strip SQL comments so a table named only in prose never counts as real. */
function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ')
}

const created = new Set<string>()
const altered = new Map<string, string>()   // table -> first migration that alters it

for (const f of files) {
  const sql = stripComments(readFileSync(join(MIG_DIR, f), 'utf8'))
  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi)) {
    created.add(m[1].toLowerCase())
  }
  for (const m of sql.matchAll(/alter\s+table\s+(?:only\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi)) {
    const t = m[1].toLowerCase()
    if (!altered.has(t)) altered.set(t, f)
  }
}

console.log(`\n1. Migrations only alter tables that migrations create`)
check(`tables created (${created.size})`, created.size >= 5, [...created].join(', '))
{
  const orphans = [...altered].filter(([t]) => !created.has(t))
  check(`every altered table is created somewhere (${altered.size} altered)`,
    orphans.length === 0,
    orphans.map(([t, f]) => `"${t}" altered in ${f} but never created`).join(' | '))
}

console.log(`\n2. The app only queries tables that exist`)
{
  // Every supabase.from('x') in src/ and in the edge functions.
  const roots = ['src', 'supabase/functions']
  const queried = new Map<string, string>()
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) { walk(p); continue }
      if (!/\.(ts|tsx)$/.test(e.name)) continue
      const src = readFileSync(p, 'utf8')
      for (const m of src.matchAll(/\.from\(\s*['"`]([a-z_][a-z0-9_]*)['"`]\s*\)/g)) {
        const t = m[1].toLowerCase()
        if (!queried.has(t)) queried.set(t, p)
      }
    }
  }
  for (const r of roots) { try { walk(r) } catch { /* absent in some checkouts */ } }

  // Views and RPC-backed names would be false positives; none exist today, and
  // if one is added it belongs in this list WITH a reason, not silently.
  const KNOWN_NON_TABLE = new Set<string>([])

  const unknown = [...queried].filter(([t]) => !created.has(t) && !KNOWN_NON_TABLE.has(t))
  check(`every queried table is created by a migration (${queried.size} distinct queried)`,
    unknown.length === 0,
    unknown.map(([t, p]) => `"${t}" queried in ${p} but no migration creates it`).join(' | '))
  check(`...and the check is not vacuous (${queried.size} tables queried)`, queried.size >= 4, String(queried.size))
}

console.log(`\n3. The specific typo that prompted this`)
{
  check('no migration alters a table called "profiles"', !altered.has('profiles'),
    altered.get('profiles') ?? '')
  check('"fitness_profiles" is what exists and is altered', created.has('fitness_profiles') && altered.has('fitness_profiles'))
}

console.log(failures === 0 ? '\nAll table-name checks passed.\n' : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)

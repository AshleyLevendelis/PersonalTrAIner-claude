// ---------------------------------------------------------------------------
// EVERY DATABASE CHANGE HAS ITS OWN TIMESTAMP (25 Nov 2026). Supabase identifies a migration by the number before its
// name, so two files sharing one collide: db:push-both applies one and silently skips the other, or refuses outright.
// It happened twice in one day: the walk recorder (restamped on merge) and the tester toolkit (both had 20261125120000
// beside days_ahead). Branches made the same day pick the same stamp; a merge is where they meet, and nothing looked.
// ---------------------------------------------------------------------------
import { readdirSync } from 'fs'
import { join } from 'path'

const DIR = join(import.meta.dirname ?? process.cwd(), '..', 'supabase', 'migrations')
let failures = 0, ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

/** The stamps used by more than one file, with the files. Exported for its own proof below. */
export function sharedStamps(files: string[]): Record<string, string[]> {
  const by = new Map<string, string[]>()
  for (const f of files) { const m = f.match(/^(\d+)_/); if (m) by.set(m[1], [...(by.get(m[1]) ?? []), f]) }
  return Object.fromEntries([...by].filter(([, fs]) => fs.length > 1))
}

const files = readdirSync(DIR).filter(f => f.endsWith('.sql'))
check(`the migrations are there (${files.length} files)`, files.length > 50, files.length)
check('every migration is named <14-digit stamp>_<name>.sql', files.every(f => /^\d{14}_[a-z0-9_]+\.sql$/.test(f)), files.filter(f => !/^\d{14}_[a-z0-9_]+\.sql$/.test(f)))
check('no two migrations share a stamp', Object.keys(sharedStamps(files)).length === 0, sharedStamps(files))
// The detector, proven on a case that must fail (the 25 Nov collision itself).
check('...and the detector finds a shared stamp when there is one', Object.keys(sharedStamps(['20261125120000_days_ahead.sql', '20261125120000_tester_toolkit.sql', '20261125140000_x.sql'])).length === 1)

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.error(`${failures} check(s) FAILED.`); process.exit(1) }
console.log('test:migration-stamps passed: every database change has a timestamp of its own.')

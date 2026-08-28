// Gate: fails (non-zero exit) when TEST and PRODUCTION have applied a
// different set of migrations. This is the mechanical backstop for
// db-push-both.mjs -- that script SHOULD keep both projects identical, but
// "should" isn't a guarantee (a push that partially failed, a migration run
// by hand against only one side). This script is what actually catches it.
//
// Compares APPLIED MIGRATION VERSIONS rather than a raw schema dump:
// `supabase db dump` shells out to a local Docker container to run pg_dump
// even for a remote-only dump, and this environment has no Docker. Since
// every schema change in this repo goes through a migration file (no
// hand-edited DDL, confirmed by convention elsewhere in this codebase), two
// projects with the identical ordered set of applied migrations have the
// identical schema -- this is a Docker-free, equally rigorous signal for
// the specific way this repo manages schema.
//
// Always leaves the CLI linked back to TEST when it finishes, same
// convention as db-push-both.mjs.
import { PROD_REF, TEST_REF, link, supabaseCapture, relinkTestOnExit } from './db-target.mjs'

relinkTestOnExit()

/** The "remote" (applied) migration versions, in order, one per line. */
function appliedVersions() {
  const { stdout } = supabaseCapture(['migration', 'list', '--linked', '--output-format', 'json'])
  let parsed
  try {
    parsed = JSON.parse(stdout)
  } catch {
    console.error('Could not read the migration list from the Supabase CLI. Output was:')
    console.error(stdout.slice(0, 500))
    process.exit(1)
  }
  const rows = Array.isArray(parsed) ? parsed : parsed.migrations
  return rows.filter((m) => m.remote).map((m) => m.remote)
}

console.log(`== Reading TEST (${TEST_REF}) applied migrations ==`)
link(TEST_REF, { quiet: true })
const test = appliedVersions()

console.log(`== Reading PRODUCTION (${PROD_REF}) applied migrations ==`)
link(PROD_REF, { quiet: true })
const prod = appliedVersions()

const onlyTest = test.filter((v) => !prod.includes(v))
const onlyProd = prod.filter((v) => !test.includes(v))

if (onlyTest.length === 0 && onlyProd.length === 0) {
  console.log(`PASS: TEST and PRODUCTION have applied the identical migration set (${test.length} migrations).`)
  process.exit(0)
}

console.log('FAIL: TEST and PRODUCTION have diverged.')
console.log('')
for (const v of onlyTest) console.log(`  + ${v}  (on TEST only)`)
for (const v of onlyProd) console.log(`  - ${v}  (on PRODUCTION only)`)
console.log('')
console.log("Run 'npm run db:push-both' to reconcile, or investigate a migration applied to only one side.")
process.exit(1)

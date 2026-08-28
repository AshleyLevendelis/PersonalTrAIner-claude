// Pushes all pending migrations to BOTH the test and production Supabase
// projects, by mechanism rather than memory. This is the ONLY sanctioned way
// to apply a new migration -- never run a bare `supabase db push` by hand,
// since the CLI's ambient link defaults to the TEST project (see
// db-link-test.mjs) and a bare push only reaches whichever project is
// currently linked.
//
// Always leaves the CLI linked back to TEST when it finishes, whether it
// succeeds or fails on the prod leg -- a stray follow-up command should land
// on the safe project, not on whatever project this script happened to be
// mid-push against.
import { PROD_REF, TEST_REF, link, supabase, relinkTestOnExit, confirmProduction } from './db-target.mjs'

// Registered before anything runs, so every exit path below -- success, a
// failed push, a declined confirmation, an uncaught throw -- still leaves the
// CLI on the safe project.
relinkTestOnExit()

function pushTo(ref, label) {
  console.log(`== Pushing migrations to ${label} (${ref}) ==`)
  link(ref)
  const status = supabase(['db', 'push', '--linked', '--yes'])
  if (status !== 0) {
    console.error(`\nThe push to ${label} failed. Stopping here.`)
    process.exit(status)
  }
}

pushTo(TEST_REF, 'TEST')

console.log('')
console.log(`TEST is up to date. Next: pushing the SAME migrations to PRODUCTION (${PROD_REF}).`)
if (!(await confirmProduction())) {
  console.log('Not confirmed -- stopping here. TEST is updated, PRODUCTION is untouched.')
  process.exit(1)
}

pushTo(PROD_REF, 'PRODUCTION')
console.log('== Done. Both projects share the same migration set. CLI relinked to TEST. ==')

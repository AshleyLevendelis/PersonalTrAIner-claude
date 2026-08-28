// ---------------------------------------------------------------------------
// Deploy edge functions to ONE named project, in one command.
//
// WHY THIS EXISTS. Deploying used to be two steps: link the CLI, then run
// `npx supabase functions deploy`. That shape has a failure mode with no
// warning attached -- if step one fails, step two still runs, against
// whatever project was linked before. It happened twice with the onboarding
// voice: the first time because the docs said the ambient link was
// PRODUCTION when it is TEST, the second because `db:link-prod` could not
// run on Windows at all. Both times the deploy printed a confident success
// line naming the WRONG project, and both times it read as a success.
//
// Here the link and the deploy are the same command, so the deploy cannot
// outlive a failed link, and the CLI always comes back to TEST afterwards.
//
//   npm run deploy:functions:test                    all functions -> TEST
//   npm run deploy:functions:prod                    all functions -> PRODUCTION
//   npm run deploy:functions:prod -- onboarding-chat  just one -> PRODUCTION
// ---------------------------------------------------------------------------

import { readdirSync } from 'fs'
import { PROD_REF, TEST_REF, nameOf, link, supabase, relinkTestOnExit, confirmProduction } from './db-target.mjs'

const target = process.argv[2] === 'prod' ? PROD_REF : TEST_REF
const label = nameOf(target)

// `--` survives npm's argument forwarding on some shells; drop it.
const requested = process.argv.slice(3).filter((a) => a && a !== '--')

const available = readdirSync('supabase/functions', { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
  .map((d) => d.name)
  .sort()

const unknown = requested.filter((f) => !available.includes(f))
if (unknown.length) {
  console.error(`No such edge function: ${unknown.join(', ')}`)
  console.error(`Available: ${available.join(', ')}`)
  process.exit(1)
}

const functions = requested.length ? requested : available

console.log(`About to deploy to ${label} (${target}):`)
for (const f of functions) console.log(`  - ${f}`)
console.log('')

if (target === PROD_REF) {
  console.log('This is the LIVE project. Users are on it right now.')
  if (!(await confirmProduction())) {
    console.log('Not confirmed -- nothing deployed, nothing linked.')
    process.exit(1)
  }
  console.log('')
}

// Registered only now, so a declined confirmation does not pointlessly
// relink; from here on every exit path returns the CLI to TEST.
relinkTestOnExit()

link(target)

// --project-ref names the target on the deploy call itself, so the deploy is
// aimed by argument rather than by ambient link state. The link above is what
// keeps a follow-up command consistent with what was just deployed; this flag
// is what makes the deploy itself impossible to misaim.
for (const f of functions) {
  const status = supabase(['functions', 'deploy', f, '--project-ref', target])
  if (status !== 0) {
    console.error(`\nDeploy of ${f} to ${label} FAILED. Later functions in the list were not attempted.`)
    process.exit(status)
  }
}

console.log('')
console.log(`== Deployed to ${label} (${target}) ==`)
console.log(`Check the Supabase line above: it must say "on project ${target}".`)
console.log('CLI relinked to TEST.')

// The ONLY sanctioned way to point the Supabase CLI at PRODUCTION. The
// ambient/default link is TEST (see db-link-test.mjs) so that any bare
// `supabase db push`/`db query --linked`/etc. lands somewhere safe to be
// wrong about. Reaching production requires running this script AND typing
// the confirmation phrase -- a wrong-target push should cost deliberate
// effort, not just a missing argument or an old terminal tab.
//
// If what you actually want is to deploy an edge function to production,
// prefer `npm run deploy:functions:prod`. It links, deploys and relinks in
// one command, so a failed link cannot leave a deploy pointing at TEST --
// which is exactly how two deploys of the onboarding voice went to the
// wrong project.
import { PROD_REF, link, confirmProduction } from './db-target.mjs'

console.log(`This will link the Supabase CLI to PRODUCTION (${PROD_REF}).`)
console.log('Every subsequent --linked command (db push, db query, functions deploy)')
console.log('will act on the LIVE database until you run `npm run db:link-test` to switch back.')
console.log('')

if (!(await confirmProduction())) {
  console.log('Not confirmed -- staying on whatever project was already linked. Nothing changed.')
  process.exit(1)
}

link(PROD_REF)
console.log('')
console.log('Linked to PRODUCTION. Run `npm run db:link-test` when you are done to return to the safe default.')

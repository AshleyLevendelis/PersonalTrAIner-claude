// Returns the Supabase CLI to the safe default link (TEST). Run this any
// time you're not sure what's currently linked, or right after finishing
// whatever you needed db-link-prod.mjs for.
import { TEST_REF, link } from './db-target.mjs'

link(TEST_REF)
console.log(`Linked to TEST (${TEST_REF}) -- the safe default.`)

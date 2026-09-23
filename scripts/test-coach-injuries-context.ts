/**
 * Gate: what the coach knows about current injuries — read only.
 *
 * 22 Sep 2026, Ashley's ruling on the systematic profile-field audit: the
 * coach can act on injuries (the plan generation already filters around
 * them) but could not previously TALK about them — asked "are you still
 * working around my knee?" it had nothing to check against. This gate holds
 * three things: the summary function is correct on its own, it actually
 * reaches the payload ChatAssistant sends, and the prompt actually teaches
 * the field — the same three-part shape test-coach-logs-steps.ts uses for
 * steps_summary, narrowed to a read with no new write path to cover.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { buildCoachInjuriesSummary } from '../src/lib/injuries-context'
import type { UserProfile } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const raw = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const read = (p: string) =>
  raw(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const fn = read('supabase/functions/chat-gemini/index.ts')
const chat = read('src/components/ChatAssistant.tsx')

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}

const profileWith = (injuries: string[]) => ({ injuries } as unknown as Pick<UserProfile, 'injuries'>)

console.log('\n1. The summary is correct on its own\n')
{
  const none = buildCoachInjuriesSummary(profileWith([]))
  check('an empty list says so plainly', /no injuries/i.test(none), none)

  const one = buildCoachInjuriesSummary(profileWith(['knees']))
  check('one code names it, in the real display label', /Knees/.test(one), one)
  check('...singular wording for one area', /loads? this\b/.test(one), one)
  check('...and says the plan already accounts for it', /plan already avoids/i.test(one), one)

  const two = buildCoachInjuriesSummary(profileWith(['lower_back', 'shoulders']))
  check('two codes name BOTH, in the real display labels', /Lower back/.test(two) && /Shoulders/.test(two), two)
  check('...plural wording for more than one area', /loads? these\b/.test(two), two)

  // A code stored in an odd case/spacing (real historical data, per
  // normaliseInjuryCode's own comment) still resolves to its real label —
  // proves this calls the shared normaliser rather than an exact-match on
  // the stored string.
  const messy = buildCoachInjuriesSummary(profileWith(['Lower Back']))
  check('a messily-cased stored value still resolves to the real label', /Lower back/.test(messy), messy)

  // THE SAFETY PROPERTY: legacy free text that maps to nothing is never
  // quoted back, but its PRESENCE still changes the wording rather than
  // being reported as an absence.
  const unrecognisedOnly = buildCoachInjuriesSummary(profileWith(['a dodgy elbow from cricket']))
  check('unrecognised free text is never echoed verbatim', !/cricket/i.test(unrecognisedOnly), unrecognisedOnly)
  check('...but its presence is not reported as "no injuries on file"',
    !/no injuries/i.test(unrecognisedOnly), unrecognisedOnly)
  check('...distinct wording from the genuinely-empty case',
    unrecognisedOnly !== buildCoachInjuriesSummary(profileWith([])), unrecognisedOnly)
}

console.log('\n2. It reaches the payload the coach is actually sent\n')
{
  check('ChatAssistant imports the shared builder', /buildCoachInjuriesSummary/.test(chat))
  check('...calls it (not just imports it)', /buildCoachInjuriesSummary\(profile\)/.test(chat))
  check('...and sends the result under injuries_summary', /injuries_summary:\s*injuriesSummary/.test(chat))
}

console.log('\n3. The prompt actually teaches the field\n')
{
  check('the USER PROFILE block reads context.injuries_summary', /context\.injuries_summary/.test(fn))
  check('...labelled as Injuries, next to the rest of the profile facts',
    /- Injuries:\s*\$\{context\.injuries_summary/.test(fn))
}

if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log('\nThe coach can now say what it is already doing about an injury, and nothing more.\n')

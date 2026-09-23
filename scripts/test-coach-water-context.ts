/**
 * Gate: what the coach knows about today's water — read only.
 *
 * 22 Sep 2026, the water half of the profile-field audit. Unlike steps
 * (5 Sep 2026), log_water needed no write-side fix — it is append-only, so
 * there is no "total vs increment" ambiguity a missing read could get
 * wrong. This is purely: the coach can now answer "how's my water today?"
 * instead of having nothing but a one-shot evening accountability nudge to
 * go on.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { buildCoachWaterSummary } from '../src/lib/water-context'

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

console.log('\n1. The summary is correct on its own\n')
{
  const mid = buildCoachWaterSummary(800, 2000)
  check('states what has been logged', /800/.test(mid), mid)
  check('...and the target', /2,000|2000/.test(mid), mid)

  // Zero is a real, honest answer here — unlike steps, water has no separate
  // "no row yet" state to distinguish it from.
  const none = buildCoachWaterSummary(0, 2000)
  check('nothing logged reads as zero, honestly (no row/zero ambiguity to hide)',
    /\b0ml\b/.test(none), none)

  // Large numbers still read clearly (comma-grouped, matching the app's own
  // convention elsewhere — steps_summary, macros).
  const large = buildCoachWaterSummary(3400, 4000)
  check('large amounts are comma-grouped for readability', /3,400/.test(large), large)
}

console.log('\n2. It reaches the payload the coach is actually sent\n')
{
  check('ChatAssistant imports the shared builder', /buildCoachWaterSummary/.test(chat))
  check('...calls it with the SAME source steps/PRs/weight-trend already use (proactiveData), not a second fetch',
    /buildCoachWaterSummary\(proactiveData\.waterMl,\s*proactiveData\.waterTargetMl\)/.test(chat))
  check('...and sends the result under water_summary', /water_summary:\s*waterSummary/.test(chat))
}

console.log('\n3. The prompt actually teaches the field\n')
{
  check('the prompt reads context.water_summary', /context\.water_summary/.test(fn))
  check('...labelled WATER, right beside STEPS (same shape, same place)',
    /STEPS:\s*\$\{context\.steps_summary[\s\S]{0,80}WATER:\s*\$\{context\.water_summary/.test(fn))
}

console.log('\n4. Freshness after a log — the bug this exists to avoid\n')
{
  // ChatAssistant's own comment on resolveAndSaveWater says the coach quotes
  // waterMl off proactiveData and that bumpOwnWrites exists so it does not
  // quote the PRE-log total in its very next sentence. That comment is only
  // true once something actually reads proactiveData.waterMl into the
  // prompt — before this change nothing did, so the staleness the comment
  // warns about could never have been observed. Confirm the write path
  // still bumps, now that a real reader depends on it.
  const at = chat.indexOf('const resolveAndSaveWater =')
  const body = at === -1 ? '' : chat.slice(at, at + 1200)
  check('resolveAndSaveWater still calls bumpOwnWrites after logging',
    /bumpOwnWrites\(\)/.test(body), body.slice(0, 200))
}

if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log('\nThe coach can now say how today\'s water is going, not just log it.\n')

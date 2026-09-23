/**
 * Gate: the coach tells a genuine first-timer, once, to check with a doctor
 * if they have any health concerns — VISION's own "Starting out" line,
 * which had NO implementation anywhere in chat-gemini's prompt until the
 * first real coach-exam run, 23 Sep 2026, measured it: a brand-new, nervous
 * 52-year-old asked what today should look like and got two warm, correct
 * replies that never once mentioned a doctor or a GP.
 *
 * Also covers the paired fix in the same run: the "doesn't contain any
 * nuts" wording the exam caught, and the wrong/right contrastive example
 * added to make the failure mode unmistakable rather than merely forbidden
 * in the abstract.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const raw = readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf8')
const fn = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}

console.log('\n1. The SCOPE section tells a genuine first-timer, once, to check with a doctor\n')
{
  const at = fn.indexOf('=== 1c. SCOPE')
  const section = fn.slice(at, at + 3000)
  const bulletAt = section.indexOf('GENUINE FIRST-TIMER')
  check('a first-timer bullet exists in the SCOPE section', bulletAt !== -1)
  const bullet = section.slice(bulletAt, bulletAt + 700)
  check('...mentions a doctor', /\bdoctor\b/i.test(bullet), bullet)
  check('...says it once, not repeated', /\bonce\b/i.test(bullet) && /never repeated/i.test(bullet))
  check('...is NOT a screening questionnaire (VISION: "no health questionnaire, no symptom checklist")',
    /not a screening question/i.test(bullet) && /not a symptom checklist/i.test(bullet))
  check('...scoped to a GENUINE first-timer, not every beginner-experience profile',
    /not every beginner-experience profile/i.test(bullet))
}

console.log('\n2. The allergen "hedge first" rule and its contrastive example both exist\n')
{
  const at = fn.indexOf('THE HEDGE COMES FIRST')
  check('the ordering rule exists in ALLERGEN HONESTY', at !== -1)
  const rule = fn.slice(at, at + 600)
  check('...names the exact incident phrasing ("doesn\'t contain")', /doesn't contain/i.test(rule), rule)

  const exAt = fn.indexOf('THE WRONG SHAPE')
  check('a WRONG/RIGHT contrastive example exists in FEW-SHOT EXAMPLES', exAt !== -1)
  const example = fn.slice(exAt, exAt + 1200)
  check('...the WRONG line is the real incident sentence', /it doesn't contain any nuts/i.test(example), example.slice(0, 200))
  check('...the RIGHT line hedges (tag-matching / not a lab check / not verified)',
    /tag-matching/i.test(example) && /not (a lab check|verified)/i.test(example))
  // THE ORDER MATTERS — a RIGHT reply that opened with the same claim and
  // hedged afterward would be the exact bug being fixed, hiding inside the
  // fix itself.
  const rightAt = example.indexOf('Assistant, RIGHT:')
  const rightLine = example.slice(rightAt, example.indexOf('\n', rightAt) + 400)
  const hedgeWordAt = rightLine.search(/tag-matching|not (a lab check|verified)/i)
  const claimWordAt = rightLine.search(/is safe|is nut-free|doesn't contain|won't contain/i)
  check('...and in the RIGHT line, no bare claim appears before the hedge (claimWordAt is -1, i.e. no bare claim at all)',
    claimWordAt === -1, { hedgeWordAt, claimWordAt, rightLine })
}

console.log('\n3. Both synced copies (chat-gemini and _shared/coach-rules.ts) carry the same allergen fix\n')
{
  const shared = readFileSync(join(ROOT, 'supabase/functions/_shared/coach-rules.ts'), 'utf8')
  check('_shared/coach-rules.ts also has the "hedge first" rule (test:coach-rules-sync enforces byte-identity; this just proves this specific line made the trip)',
    shared.includes('THE HEDGE COMES FIRST, NEVER AFTER'))
}

if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log('\nA genuine first-timer hears the doctor note once; a nut-safety answer hedges before it claims, never after.\n')

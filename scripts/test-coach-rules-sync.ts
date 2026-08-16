// ---------------------------------------------------------------------------
// Coach-rules sync gate — the same guard shape as test:diet-tag-sync, for
// behavioral rule text instead of tag lists.
//
// chat-gemini/index.ts deliberately keeps its own inline copies of the
// off-topic / app-reality / medical-scope / allergen-honesty rules (touching
// that shipped, incident-tuned prompt was explicitly avoided when
// onboarding-chat was added). onboarding-chat imports the same text from
// _shared/coach-rules.ts. This gate fails the moment either side is edited
// without the other, so the two surfaces can never silently drift apart.
//
// Extraction is textual (each exported constant's template literal), not an
// import — the _shared file is Deno-flavored and the constants contain no
// backticks or interpolations, which the gate also asserts.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { resolve } from 'path'

const root = process.cwd()
const rulesSource = readFileSync(resolve(root, 'supabase/functions/_shared/coach-rules.ts'), 'utf8').replace(/\r\n/g, '\n')
const chatSource = readFileSync(resolve(root, 'supabase/functions/chat-gemini/index.ts'), 'utf8').replace(/\r\n/g, '\n')
const onboardingSource = readFileSync(resolve(root, 'supabase/functions/onboarding-chat/index.ts'), 'utf8').replace(/\r\n/g, '\n')

const CONSTANT_NAMES = ['OFF_TOPIC_RULES', 'APP_REALITY', 'SCOPE_SAFETY_RULES', 'ALLERGEN_HONESTY_BLOCK']

let failures = 0
const fail = (msg: string) => {
  failures++
  console.error(`  ✗ ${msg}`)
}
const pass = (msg: string) => console.log(`  ✓ ${msg}`)

console.log('coach-rules sync gate')

for (const name of CONSTANT_NAMES) {
  const match = rulesSource.match(new RegExp(`export const ${name} = \`([\\s\\S]*?)\``))
  if (!match) {
    fail(`${name}: not found in coach-rules.ts (or no longer a plain template literal)`)
    continue
  }
  const text = match[1]
  if (text.includes('${')) {
    fail(`${name}: contains an interpolation — the verbatim-sync contract assumes plain text`)
    continue
  }
  if (text.trim().length < 200) {
    fail(`${name}: suspiciously short (${text.trim().length} chars) — was the constant gutted?`)
    continue
  }
  if (!chatSource.includes(text)) {
    fail(`${name}: chat-gemini/index.ts no longer contains this text verbatim — one side was edited without the other; re-sync them (this is the gate doing its job)`)
    continue
  }
  if (!onboardingSource.includes(name)) {
    fail(`${name}: onboarding-chat/index.ts does not reference this constant — it stopped importing a rule it must enforce`)
    continue
  }
  pass(`${name}: verbatim in chat-gemini, imported by onboarding-chat`)
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`)
  process.exit(1)
}
console.log('\nAll coach-rule constants in sync.')

// ---------------------------------------------------------------------------
// THREE THINGS ASHLEY HIT ON A REAL PHONE, none of which any gate could see.
//
// 1. Tapping Pause deleted the whole timer screen. pauseRound sets
//    running:false, and ToolsTab only held the screen while `running` — so a
//    pause dropped her back to the setup form mid-workout.
// 2. The dock chip repeated the round state, in 12px, on top of the very
//    screen already shouting it in colour — and sat over the Pause button.
// 3. "Want me to remember **that**?" — buildIntentProposal fell back to the
//    literal string 'that' when the model recorded a fact with no
//    target_phrase, putting a placeholder on a confirm button as if it were
//    the content she had asked to save.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { buildIntentProposal } from '../src/lib/intent-proposal'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

console.log('\n1. A confirm card never asks you to approve a placeholder')
{
  // The exact shape that produced "Remember — that": a scheduling fact, which
  // has no food or exercise target for the model to put in target_phrase.
  const p = buildIntentProposal('record_fact', {
    origin_verbatim_quote: 'I cant train on tuesday',
    fact_kind: 'availability',
  }, 'profile-1')
  const after = p.diff.rows[0].after
  check('the card shows what she actually said', after === 'I cant train on tuesday', after)
  check('...and never the bare word "that"', after !== 'that', after)

  // Every append kind, not just the one that bit.
  for (const kind of ['record_fact', 'record_goal', 'check_off_grocery_item', 'add_to_grocery_list']) {
    const bare = buildIntentProposal(kind, { origin_verbatim_quote: 'no more mushrooms please' }, 'p')
    check(`${kind} falls back to her words, not a pronoun`,
      bare.diff.rows[0].after === 'no more mushrooms please', bare.diff.rows[0].after)
  }

  // The placeholder must be gone from the source, not merely unreachable on
  // the paths this test happens to walk.
  const src = stripComments(readFileSync(join(ROOT, 'src/lib/intent-proposal.ts'), 'utf8'))
  check('no `|| \'that\'` fallback survives anywhere in the builder',
    !/\|\|\s*'that'/.test(src) && !/'that'/.test(src))
}

console.log('\n2. Pause does not throw you off the timer screen')
{
  const tools = stripComments(readFileSync(join(ROOT, 'src/components/ToolsTab.tsx'), 'utf8'))
  const at = tools.indexOf('const roundHoldsScreen')
  check('the condition exists to check', at !== -1)
  const cond = tools.slice(at, tools.indexOf('\n\n', at))
  // `running` alone is what caused it: pauseRound sets running:false.
  check('a paused round still holds the screen', /isActive/.test(cond), cond.trim())
  check('...and a finished one still does too', /isRoundComplete/.test(cond), cond.trim())
}

console.log('\n3. The dock chip does not repeat the screen it is sitting on')
{
  const dock = stripComments(readFileSync(join(ROOT, 'src/components/BottomDock.tsx'), 'utf8'))
  const at = dock.indexOf('const hasStandaloneTimer')
  check('the chip condition exists to check', at !== -1)
  const cond = dock.slice(at, at + 200)
  check('the chip is suppressed while the round field is on screen',
    /!roundFieldOnScreen/.test(cond), cond.split('\n')[0])
  check('...decided by the real route, not a guess',
    /route\.tab === 'tools'/.test(dock))
  // It must still appear when you navigate AWAY — that is the chip's whole job.
  check('...but the chip still exists for when you leave the tab',
    /hasStandaloneTimer \|\|/.test(dock) || /hasStandaloneTimer\b/.test(dock))
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nAll timer/intent copy checks passed.\n')

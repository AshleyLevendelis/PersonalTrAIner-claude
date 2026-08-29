/**
 * Gate: the app never asks a question and offers to build the plan at once.
 *
 * Ashley photographed exactly that — "how much time do you want to spend
 * cooking?" sitting directly above a Generate My Plan button. Her words:
 * "the questions should be finished by the time the generate plan button
 * appears."
 *
 * Neither half was misbehaving on its own, which is why this needs a gate
 * rather than a fix. She had just answered dislikedFoods, the last slot that
 * can hold a plan up, so complete_onboarding was correctly accepted and the
 * review correctly opened. The model meanwhile read the slot catalog — which
 * introduces itself as "the answers you need" — and picked the next unanswered
 * entry, cookingTime, which the app had long since decided could never delay
 * anyone. `required: false` did not mark that: age and injuries are also
 * optional and must still be asked.
 *
 * So this holds three things:
 *   1. the catalog tells the model which slots can never block (client half,
 *      runs the real buildSlotCatalog);
 *   2. the edge function renders that marker and forbids finishing-and-asking
 *      (static text, because a Deno function can't import across src/lib —
 *      the reason test-chat-app-reality.ts gives);
 *   3. the closing sweep actually strips questions (runs the real function).
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { buildSlotCatalog, NEVER_BLOCKING_SLOTS, initialSlotValues } from '../src/lib/onboarding-slots'
import { closeOutOpenQuestions, closeOutTrailingQuestions, COMPLETE_MESSAGE } from '../src/lib/onboarding-completion'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fn = readFileSync(join(root, 'supabase/functions/onboarding-chat/index.ts'), 'utf8')

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}

console.log('\n[1] The catalog the model receives says which slots can never block\n')
const catalog = buildSlotCatalog(initialSlotValues())
check('every catalog entry carries neverBlocks', catalog.every(c => typeof c.neverBlocks === 'boolean'))
const flagged = catalog.filter(c => c.neverBlocks).map(c => c.key).sort()
const expected = NEVER_BLOCKING_SLOTS.filter(k => catalog.some(c => c.key === k)).sort()
check('it flags exactly the never-blocking set', JSON.stringify(flagged) === JSON.stringify(expected), { flagged, expected })
// The four Ashley named. Spelled out rather than derived, so demoting a new
// slot into that list does not silently widen what the model may skip.
for (const k of ['cookingTime', 'includeSnacks', 'favoriteCuisines', 'breakfastStyle']) {
  check(`${k} is marked bonus`, catalog.find(c => c.key === k)?.neverBlocks === true)
}
// The other half of the same rule: slots that DO block must never be marked,
// or the model would be told it may skip a safety question.
for (const k of ['injuries', 'dietaryPreferences', 'fitnessGoal', 'age']) {
  check(`${k} is NOT marked bonus`, catalog.find(c => c.key === k)?.neverBlocks === false)
}

console.log('\n[2] The edge function renders the marker and forbids finishing-and-asking\n')
check('describeCatalog emits a BONUS grade', /BONUS/.test(fn) && /s\.neverBlocks/.test(fn))
check('the prompt states the two are mutually exclusive', /FINISHING AND ASKING ARE MUTUALLY EXCLUSIVE/.test(fn))
check('...and covers the same-turn case that actually fired',
  /includes the turn whose own set_slot calls empty it/i.test(fn))
check('...and forbids a question in a completing reply',
  /contains NO question/i.test(fn))
check('the prompt names the bonus slots', /BONUS SLOTS/.test(fn))

console.log('\n[3] The closing sweep strips questions — the half that holds without the model\n')
const turn = [
  { role: 'assistant' as const, content: 'Marmite is banned, noted! How much time do you want to spend cooking?' },
  { role: 'assistant' as const, content: 'Foods to avoid — Marmite', isReceipt: true },
]
const swept = closeOutOpenQuestions(turn)
check('the trailing question is replaced by the closing line', swept[0].content === COMPLETE_MESSAGE, swept[0].content)
check('receipts are left alone', swept[1].content === 'Foods to avoid — Marmite' && swept[1].isReceipt === true)
check('no question mark survives on any assistant turn',
  swept.every(m => m.role !== 'assistant' || m.isReceipt || !m.content.includes('?')), swept)

const carded = closeOutOpenQuestions([
  { role: 'assistant' as const, content: 'How long do you cook?', slotCard: 'cookingTime', slotCardEditing: true },
])
check('a chip card offered in that turn is removed', carded[0].slotCard === undefined && carded[0].slotCardEditing === undefined)

const twice = closeOutOpenQuestions([
  { role: 'assistant' as const, content: 'Cooking time?' },
  { role: 'assistant' as const, content: 'And snacks?' },
])
check('two questions do not print the closing line twice', twice.length === 1 && twice[0].content === COMPLETE_MESSAGE, twice)

const clean = [
  { role: 'assistant' as const, content: "That's you all set." },
  { role: 'user' as const, content: 'Marmite' },
]
check('a turn with no question is passed through untouched',
  JSON.stringify(closeOutOpenQuestions(clean)) === JSON.stringify(clean))
check('user turns are never rewritten even when they ask something',
  closeOutOpenQuestions([{ role: 'user' as const, content: 'why do you need that?' }])[0].content === 'why do you need that?')

console.log('\n[3b] BOTH paths that open the review, not just one\n')
// THE HALF THE FIRST FIX MISSED, and Ashley photographed it again. The review
// opens by two independent routes:
//   1. the model calls complete_onboarding  — swept in the response handler
//   2. the client's own safety net fires when readyToGenerate flips, whether
//      or not the model called anything — which had no sweep at all
// Route 2 exists because the conversation once went silent on the final
// answer with no way forward, so it can never be removed. It holds the whole
// transcript rather than one turn's messages, which is why it needs its own
// entry point: sweeping the full history would rewrite questions answered ten
// turns ago into a wall of identical closing lines.
{
  const history = [
    { role: 'assistant' as const, content: 'What should I call you?' },
    { role: 'user' as const, content: 'Ashley' },
    { role: 'assistant' as const, content: 'Anything you would rather I left out?' },
    { role: 'user' as const, content: 'Marmite' },
    { role: 'assistant' as const, content: 'Marmite is banned, noted! How much time do you want to spend cooking?' },
    { role: 'assistant' as const, content: 'Foods to avoid — Marmite', isReceipt: true },
  ]
  const swept = closeOutTrailingQuestions(history)
  check('the trailing question is closed out', swept[4].content === COMPLETE_MESSAGE, swept[4].content)
  check('an EARLIER question is left exactly as it was',
    swept[0].content === 'What should I call you?' && swept[2].content === 'Anything you would rather I left out?',
    [swept[0].content, swept[2].content])
  check('user turns are untouched', swept[1].content === 'Ashley' && swept[3].content === 'Marmite')
  check('the receipt survives', swept[5].isReceipt === true && swept[5].content === 'Foods to avoid — Marmite')
  check('nothing is lost or duplicated', swept.length === history.length, `${swept.length} vs ${history.length}`)
  check('the closing line appears exactly once',
    swept.filter(m => m.content === COMPLETE_MESSAGE).length === 1)

  // A transcript with no user turn at all (the scripted opener, before anyone
  // has typed) must still sweep rather than index off the end.
  const openerOnly = closeOutTrailingQuestions([{ role: 'assistant' as const, content: 'Quick question?' }])
  check('a transcript with no user turn yet still sweeps', openerOnly[0].content === COMPLETE_MESSAGE)
}

console.log('\n[4] ...and the app actually calls it\n')
// Static, and deliberately so. [3] proves the function is correct, which is
// worth nothing if nothing invokes it — a gate that passes against dead code
// is the failure mode this repo keeps hitting. A Deno/React boundary makes
// importing the component here impractical, so this reads the call site.
const comp = readFileSync(join(root, 'src/components/onboarding/ConversationalOnboarding.tsx'), 'utf8')
check('the component imports the sweep', /closeOutOpenQuestions/.test(comp))
check('...and runs it when the review opens',
  /openReview\)\s*\{[\s\S]{0,200}?closeOutOpenQuestions\(/.test(comp))
check('the closing line has ONE definition', !/const COMPLETE_MESSAGE\s*=/.test(comp))
// BOTH call sites, named separately. [3] and [3b] prove the two functions are
// correct; correctness of a sweep nothing invokes on the path that actually
// fired is exactly the shape of the first fix's failure.
check('...and the client safety-net effect sweeps too',
  /if \(!readyToGenerate\) return[\s\S]{0,600}?closeOutTrailingQuestions\(/.test(comp))
check('...sweeping BEFORE it appends the closing line, not after',
  /closeOutTrailingQuestions\(prev\)[\s\S]{0,300}?COMPLETE_MESSAGE/.test(comp))

if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log('\nThe review never opens beside an unanswered question.\n')

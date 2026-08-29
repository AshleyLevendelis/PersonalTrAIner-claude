// ---------------------------------------------------------------------------
// Gate for CORRECTING an onboarding answer.
//
// Ashley: "during the onboarding if you make a wrong selection and then send
// the right answer after it, it messes with the next question and the next
// quick reply."
//
// Three faults chained, all in ConversationalOnboarding.tsx:
//
//   1. present_slot was refused for any already-answered slot. That refusal
//      is right for "stop re-asking what you know" and wrong for the one
//      re-ask that matters — "you picked Advanced, let's fix that, which one
//      is you?" — so a corrected question came back with no buttons.
//   2. present_slot was ALSO decided mid-loop, against a turn that had not
//      finished happening: a present_slot listed before its own set_slot was
//      judged before the correction it belonged to had been applied.
//   3. With no card on the new question, the composer placeholder found an
//      OLDER card still pending further up and named that question instead
//      of the one on screen — the fourth failure of that kind in that block.
//
// And a fourth, reachable from a correction rather than caused by one: a card
// can stop applying while still on screen (correct your experience to
// beginner and the working-lifts question closes behind it). The write was
// already refused; the chips carried on looking tappable and did nothing.
//
// Ashley's ruling on (1), 30 Aug 2026: show the buttons again — "tapping is
// how the wrong answer got in and it should be how it gets out."
//
// SOURCE CHECKS STRIP COMMENTS FIRST. This gate family has been broken and
// silently satisfied by its own explanatory prose more than once; a rule
// about code must not be provable by a sentence about it.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  ONBOARDING_SLOTS,
  getSlotDef,
  initialSlotValues,
  isSlotApplicable,
  buildSlotCatalog,
  type OnboardingSlotValues,
} from '../src/lib/onboarding-slots'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

const raw = readFileSync(join(ROOT, 'src/components/onboarding/ConversationalOnboarding.tsx'), 'utf8')
const src = raw
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1')

console.log('\n1. A correction is recognised as a correction')
// Not "a slot was written" — a slot that ALREADY had an answer now has a
// different one. A first answer must not open the re-ask door, or the model
// can re-present every question it has just been told.
check('the change is measured against the value the slot already held',
  /const valueChanged = JSON\.stringify\(prior\[key\]\) !== JSON\.stringify\(coerced\)/.test(src))
check('...and against whether it had been answered at all',
  /const wasAnswered = ws\.confirmed\.has\(key\)/.test(src))
check('...both required before it counts as a correction',
  /if \(wasAnswered && valueChanged\) ws\.corrected\.add\(key\)/.test(src))
// applySlot writes confirmed itself, so reading it after the write would make
// every slot look previously-answered.
check('...read BEFORE the write that would make everything look answered',
  src.indexOf('const wasAnswered = ws.confirmed.has(key)') < src.indexOf('ws.confirmed = new Set(ws.confirmed).add(key)'))

console.log('\n2. A corrected question gets its buttons back — and nothing else does')
check('an answered slot is still refused',
  /if \(ws\.confirmed\.has\(key\) && !ws\.corrected\.has\(key\)\) continue/.test(src))
check('...with the correction as the only exception', !/if \(ws\.confirmed\.has\(key\)\) continue/.test(src))
// The old duplicate-card guard would otherwise swallow the re-ask, since a
// correction's own card is the thing being replaced.
check('the duplicate-card guard does not swallow the re-ask',
  /if \(alreadyLive && !ws\.corrected\.has\(key\)\) continue/.test(src))
check('...but two cards for the same slot in one turn are still impossible',
  /if \(ws\.newMessages\.some\(m => m\.slotCard === key\)\) continue/.test(src))

console.log('\n3. The turn is judged once it has finished happening')
// Actions arrive in the model's order. Deciding present_slot mid-loop judged
// it against a turn still being assembled — the correction it belonged to
// might not have been applied yet, and the message meant to host the chips
// might not have been pushed.
check('present_slot is collected during the loop', /presentRequests\.push\(/.test(src))
check('...and resolved after it', /for \(const rawKey of presentRequests\)/.test(src))
check('...so the decision sees the whole turn',
  src.indexOf('presentRequests.push(') < src.indexOf('for (const rawKey of presentRequests)'))
check('the host message is still chosen backwards past receipts',
  /\.find\(m => m\.role === 'assistant' && !m\.isReceipt && !m\.slotCard && m\.content\.trim\(\)\)/.test(src))

console.log('\n4. The typing box never names a question that is not the one on screen')
check('it compares which is newer, the pending card or the coach\'s question',
  /const staleCard = askedIdx >= 0 && coachQuestionIdx > askedIdx/.test(src))
check('...and says nothing rather than naming the stale one',
  /const key = staleCard\s*\n\s*\? undefined/.test(src))
check('the resume banner and receipts still do not count as questions',
  /m\.content !== RESUME_BANNER && m\.content\.includes\('\?'\)/.test(src))

console.log('\n5. A control that cannot act is not offered')
check('chips check applicability, not just resolved-ness',
  (src.match(/resolved=\{!!msg\.slotCardResolved \|\| !cardStillApplies\(msg\.slotCard\)\}/g) ?? []).length === 2,
  (src.match(/resolved=\{!!msg\.slotCardResolved \|\| !cardStillApplies\(msg\.slotCard\)\}/g) ?? []).length)
check('...via the real gate, not a second copy of the rule',
  /const cardStillApplies = \(key: string\) => \{\s*\n\s*const def = getSlotDef\(key\)\s*\n\s*return !def \|\| isSlotApplicable\(def, values\)/.test(src))

console.log('\n6. The state that makes this reachable is real, not hypothetical')
// Executable, not source text: correcting one answer genuinely does close a
// later question. This is what fault 5 protects against, and today's beginner
// ruling widened it — a beginner is no longer asked about working lifts, so
// any beginner correction can strand that card on screen.
{
  const base = { ...initialSlotValues(), equipment: 'full_gym', activityLevel: 'moderate' } as OnboardingSlotValues
  const asAdvanced = { ...base, trainingExperience: 'advanced' } as OnboardingSlotValues
  const asBeginner = { ...base, trainingExperience: 'beginner' } as OnboardingSlotValues
  const lifts = getSlotDef('knowsWorkingLifts')!
  check('the working-lifts card is live for an advanced lifter', isSlotApplicable(lifts, asAdvanced))
  check('...and dead the moment they correct themselves to beginner', !isSlotApplicable(lifts, asBeginner))
  check('...so a card CAN outlive its question, which is why the render checks',
    isSlotApplicable(lifts, asAdvanced) && !isSlotApplicable(lifts, asBeginner))
  // And the model stops being offered it, so it cannot re-ask in prose.
  check('...and the correction also withdraws it from the model',
    buildSlotCatalog(asAdvanced).some(e => e.key === 'knowsWorkingLifts')
    && !buildSlotCatalog(asBeginner).some(e => e.key === 'knowsWorkingLifts'))
}

console.log('\n7. Corrections are only meaningful for slots that can be re-offered')
// Every closed-set slot carries options, so present_slot has something to
// show for any correction the ruling covers. A slot with no options would
// re-open to an empty card.
{
  const closedSet = ONBOARDING_SLOTS.filter(s => s.control === 'single' || s.control === 'multi')
  const optionless = closedSet.filter(s => !s.options || s.options.length === 0).map(s => s.key)
  check('every closed-set question has buttons to show again', optionless.length === 0, optionless)
  check('...and there are enough of them for this to matter', closedSet.length >= 10, closedSet.length)
}

console.log('\nAll correction-flow checks passed.')

if (failures > 0) {
  console.error(`\n${failures} failure(s)`)
  process.exit(1)
}

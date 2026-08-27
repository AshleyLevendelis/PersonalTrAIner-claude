/**
 * Gate for the onboarding being a CONVERSATION, not a questionnaire.
 *
 * Root observation, Ashley: "the onboarding feels too much like a
 * questionnaire because it is that. a real coach wouldn't be sending you
 * buttons to click. they'd be waiting for a text reply."
 *
 * She was literally right. Three separate forces put chips under nearly every
 * question in the flow:
 *   1. present_slot's own description — "call this whenever you ask a
 *      closed-set question".
 *   2. the SLOT MECHANICS rule — "Closed-set question → ask it AND call
 *      present_slot".
 *   3. a forced SECOND Gemini call (functionCallingConfig mode "ANY") whose
 *      only job was to staple chips onto any question that lacked them.
 *
 * Her ruling: chips only when you're stuck. This gate holds that line, and
 * just as importantly holds the line on what must NOT have changed — every
 * safety and anti-stall backstop in the flow, none of which was ever the
 * questionnaire.
 *
 * Static text checks for the edge function, for the reason test-chat-app-
 * reality.ts gives: a Deno edge function can't import across the src/lib
 * boundary. The client half imports the real function and runs it.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { isStuckMessage, detectAllergenTags } from '../src/lib/onboarding-slots'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

let failures = 0
function check(label: string, condition: boolean, extra?: unknown) {
  if (condition) console.log(`  ok: ${label}`)
  else {
    failures++
    console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`)
  }
}

const fn = readFileSync(join(ROOT, 'supabase/functions/onboarding-chat/index.ts'), 'utf8')
const ui = readFileSync(join(ROOT, 'src/components/onboarding/ConversationalOnboarding.tsx'), 'utf8')

console.log('\n1. The forced-chips leg is gone')
{
  // The single biggest cause of the form feel: a second model call, with
  // function calling FORCED, that existed only to add chips the model had
  // deliberately not asked for. Its absence is the change.
  check('no forced-function-calling leg remains',
    !/functionCallingConfig/.test(fn))
  check('...specifically, nothing forces present_slot',
    !/allowedFunctionNames:\s*\[\s*"present_slot"\s*\]/.test(fn))
  check('the reason is recorded where the code used to be, not just deleted',
    /THE FORCED-CHIPS LEG USED TO LIVE HERE/.test(fn))
}

console.log('\n2. Chips are described as a rescue, not as how questions are asked')
{
  const decl = fn.slice(fn.indexOf('name: "present_slot"'), fn.indexOf('name: "set_slot"'))
  check('present_slot is declared', decl.length > 0)
  check('...it does NOT tell the model to use chips on every closed-set question',
    !/whenever you ask a closed-set question/i.test(decl))
  check('...it calls itself a rescue', /RESCUE, not the way questions are asked/i.test(decl))
  check('...and forbids the first asking', /[Nn]ever call it on the first asking/.test(decl))

  check('the SLOT MECHANICS rule says ask and WAIT',
    /Closed-set question → ask it in your own words and WAIT/.test(fn))
  check('...and no longer says to call present_slot alongside the question',
    !/ask it in your own words AND call present_slot/.test(fn))
}

console.log('\n3. The three stuck cases are spelled out')
{
  const rescue = fn.slice(fn.indexOf('CHIPS ARE A RESCUE'), fn.indexOf('CHIPS ARE A RESCUE') + 700)
  check('the rescue rule exists', rescue.length > 0)
  for (const [label, re] of [
    ["they don't know / asked for the options", /don't know, or asked what the options are/i],
    ['the answer was too ambiguous to map', /too ambiguous to map/i],
    ['it has already been asked once', /already asked this same question once/i],
  ] as [string, RegExp][]) {
    check(`case: ${label}`, re.test(rescue))
  }
}

console.log('\n4. The client rescues a stuck user without needing the model')
{
  // The lesson from fa683fc: a prompt-only behaviour change had an effect
  // nobody predicted and was reverted. A user who types "I don't know" and
  // gets more prose back is worse off than before chips were removed, so
  // this does not depend on the model noticing.
  check('the client detects a stuck message itself', /isStuckMessage\(trimmed\)/.test(ui))
  check('...and renders that slot\'s card in response', /THE STUCK-USER RESCUE/.test(ui))
  check('...only for slots that genuinely have a list',
    /def\.control === 'single' \|\| def\.control === 'multi'/.test(ui.slice(ui.indexOf('THE STUCK-USER RESCUE'))))
  check('...and never doubles up on a card already on screen',
    /alreadyHasCard/.test(ui))
}

console.log('\n5. The detector is narrow enough not to eat real answers')
{
  // The failure that would matter: someone hedges, gives an answer anyway,
  // and the hedge buries it under a chip grid.
  for (const t of ["I don't know", 'not sure', 'no idea', 'dunno', '?', 'What are my options?', 'help']) {
    check(`"${t}" reads as stuck`, isStuckMessage(t))
  }
  for (const t of [
    "I don't know, maybe three days a week?",
    'not sure but probably dumbbells only',
    "I don't know if my knee counts as an injury",
    'no idea what my deadlift is, never tested it',
    'help me get stronger',
  ]) {
    check(`"${t}" is an ANSWER, not a stuck signal`, !isStuckMessage(t))
  }
}

console.log('\n5b. The app\'s own copy does not promise buttons')
{
  // Caught on a real phone, by nobody's gate: the opening message still said
  // "you can type or tap" long after tapping stopped being how questions are
  // answered. The first thing a new user reads was describing the old app.
  // Scoped to the OPENER — the rescue paths ("tap the option that fits") are
  // correct, because a card really is on screen when they fire.
  const opener = ui.slice(ui.indexOf("Hey — I'm your coach."), ui.indexOf("Hey — I'm your coach.") + 400)
  check('the opener exists', opener.length > 100)
  check('...and does not offer tapping as a way to answer', !/\btap\b/i.test(opener), opener.slice(0, 80))
  check('...it invites words instead', /in your own words/.test(opener))
}

console.log('\n5c. A stated goal is taken, not appraised and re-asked')
{
  // Both halves found on Ashley's phone in one exchange: she typed "to get to
  // 12% body fat" and got back "That 12% target is a classic, sharp goal to
  // aim for" — a verdict — followed by "does that sound right?" and the full
  // four-option goal menu, about a goal she had just stated in plain words.
  const grade = fn.slice(fn.indexOf('NEVER grade their answers'), fn.indexOf('NEVER grade their answers') + 900)
  check('the no-grading rule exists', grade.length > 100)
  check('...and covers the compliment shaped like a description',
    /COMPLIMENT WEARING A DESCRIPTION/.test(grade))
  check('...naming the real phrasings, not just the obvious ones',
    /classic, sharp goal/.test(grade) && /solid target/.test(grade))
  check('...and gives the test: are you appraising THEM', /appraising THEM/.test(grade))

  const dir = fn.slice(fn.indexOf('A TARGET THAT NAMES ITS OWN DIRECTION'), fn.indexOf('A TARGET THAT NAMES ITS OWN DIRECTION') + 900)
  check('a self-describing target skips confirmation', dir.length > 100)
  check('...with the case that prompted it', /12% body fat/.test(dir))
  check('...and says re-asking reads as not listening', /not having listened/.test(dir))
  check('...while a genuinely ambiguous number is still confirmed',
    /bare number with no current value/.test(dir))
}

console.log('\n6. Nothing that was actually load-bearing was removed')
{
  // Chips were the questionnaire. These were never the questionnaire — they
  // fire when something has gone wrong, and each one exists because of a
  // defect found live.
  check('the deterministic allergen backstop still runs on every typed message',
    /detectAllergenTags\(trimmed\)/.test(ui))
  check('...and still works', detectAllergenTags('allergic to peanuts').includes('nut-free' as never))
  check('...and still does not fire on a mere mention', detectAllergenTags('I love peanuts').length === 0)

  check('a value that fails validation still re-asks with chips',
    /Fail LOUD[\s\S]{0,400}slotCard: key/.test(ui))
  check('the dead-air guard still renders the next question with its card',
    /Dead-air guard[\s\S]{0,1400}slotCard: nextDef\.control === 'text' \? undefined : nextDef\.key/.test(ui))
  check('the stuck-slot breaker still steps in', /pickSlotToForce\(/.test(ui))
  check('the typed-exact-label backstop still exists', /function tryExactLabelMatch/.test(ui))
  check('the reply guarantee is untouched', /resolveReply\(/.test(fn))
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nAll conversational-onboarding checks passed.\n')

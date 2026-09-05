/**
 * Gate: the coach can log your steps — behind a card, through the one store.
 *
 * Ashley, 5 Sep 2026: "build it so it can log them for you." Asked what should
 * happen when she says "I walked 9,000 steps today" — a sentence the app's own
 * imperative classifier reads as a statement, not a command — she chose:
 * SHOW A CONFIRM CARD, EVERY TIME. §1 pins that, because it is a ruling and
 * not an implementation detail: a later "simplification" that logs straight
 * away would be reversing her decision silently.
 *
 * §2 is the one that would have caught a real bug before it shipped. The
 * confirm branch used to route append-proposals through a ternary ending in a
 * bare `: resolveAndSaveWater(...)`. Adding log_steps to APPEND_PROPOSAL_KINDS
 * without touching that line would have LOGGED WATER when the user confirmed a
 * steps card — a silent write of the wrong thing, with a cheerful receipt.
 *
 * §3 is the shape of the data. daily_steps holds one row per day and the write
 * upserts, so a chat log REPLACES the day. That forces three things water does
 * not need: a before on the card, a pre-image in the undo token, and a
 * plausibility bound so a mistyped 900,000 cannot become permanent.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { APPEND_PROPOSAL_KINDS, INTENT_PROPOSAL_VERB, buildIntentProposal } from '../src/lib/intent-proposal'
import { isPlausibleStepCount, MAX_PLAUSIBLE_DAILY_STEPS } from '../src/lib/steps-store'
import { buildCoachStepsSummary } from '../src/lib/steps-context'
import { stepsTargetFor } from '../src/lib/steps-target'
import type { UserProfile } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const raw = (p: string) => readFileSync(join(ROOT, p), 'utf8')
// Comments are not code — checks in this repo have gone red on the prose
// explaining a fix more than once.
const read = (p: string) =>
  raw(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const fn = read('supabase/functions/chat-gemini/index.ts')
const chat = read('src/components/ChatAssistant.tsx')
const app = read('src/App.tsx')
const store = read('src/lib/steps-store.ts')
const stepsRow = read('src/components/exercise/StepsRow.tsx')

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}

console.log('\n1. It is offered, never done unasked — Ashley\'s ruling\n')
{
  check('the tool is declared to the model', /name: "log_steps"/.test(fn))
  check('...and has an executor branch (the coach-promises contract)',
    /name === "log_steps"/.test(fn))
  const at = fn.indexOf('if (name === "log_steps")')
  const body = at === -1 ? '' : fn.slice(at, at + 2000)
  check('handler body found (sanity check on this check)', body.length > 200, body.length)
  check('it forwards a PROPOSAL — the card is the only path',
    /proposal: \{ kind: name/.test(body), body.slice(0, 200))
  // The ruling, pinned. An intent channel would mean an immediate write.
  check('...and there is no immediate-write channel for steps anywhere',
    !/stepsIntent/.test(fn) && !/stepsIntent/.test(chat))
  check('the handler writes nothing itself',
    !/supabase\s*\n?\s*\.from\(/.test(body) && !/\.update\(|\.insert\(|\.upsert\(/.test(body))
  check('...and puts no words in the model\'s mouth', /reply: ""/.test(body))
  check('a malformed date is refused rather than upserted onto a wrong day',
    /\\d\{4\}-\\d\{2\}-\\d\{2\}/.test(body))
}

console.log('\n2. Confirming a steps card logs STEPS\n')
{
  check('log_steps is an append-proposal kind', APPEND_PROPOSAL_KINDS.has('log_steps'))
  check('...and has a confirmation verb', !!INTENT_PROPOSAL_VERB.log_steps)

  // THE ANTI-FALLTHROUGH CHECK. The ternary's default used to be water.
  const at = chat.indexOf('const saveResult = row.kind ===')
  const chain = at === -1 ? '' : chat.slice(at, at + 900)
  check('the confirm chain was found (sanity check on this check)', chain.length > 200, chain.length)
  check('log_steps routes to resolveAndSaveSteps by name',
    /row\.kind === 'log_steps'[\s\S]{0,120}resolveAndSaveSteps/.test(chain), chain.slice(0, 300))
  check('...and log_water is named too, not left as the default',
    /row\.kind === 'log_water'[\s\S]{0,120}resolveAndSaveWater/.test(chain))
  // No unguarded tail: an unknown kind must be loud, not routed somewhere.
  check('no append kind can fall through to another kind\'s writer',
    /No resolver wired for append proposal kind/.test(chat))
}

console.log('\n3. A replace, treated as a replace\n')
{
  // The card shows what confirming would overwrite. A replace the user cannot
  // see is a replace they cannot consent to.
  const withPrevious = buildIntentProposal('log_steps',
    { origin_verbatim_quote: 'I walked 9000 steps', steps: 9000 }, 'p1', 6240)
  check('the card shows the count it would replace',
    withPrevious.diff.rows[0].before === '6,240', withPrevious.diff.rows[0])
  check('...and the count it would become', withPrevious.diff.rows[0].after === '9,000', withPrevious.diff.rows[0])
  const noPrevious = buildIntentProposal('log_steps',
    { origin_verbatim_quote: 'I walked 9000 steps', steps: 9000 }, 'p1', null)
  check('nothing logged yet shows no before rather than a fake zero',
    noPrevious.diff.rows[0].before === '', noPrevious.diff.rows[0])

  // Undo RESTORES. Water's undo deletes, and its own comment explains why that
  // works there and not here: one row per day, upserted.
  check('the undo token carries the pre-image, not just a row id',
    /JSON\.stringify\(\{ date, previous \}\)/.test(chat))
  check('...and undo restores through the store', /restoreStepsForDate\(/.test(chat))
  check('...which deletes rather than writing 0 when there was nothing before',
    /if \(previous === null\)[\s\S]{0,200}\.delete\(\)/.test(store))

  // The prompt has to carry the one thing a model gets wrong.
  check('the prompt says the number is the day\'s total, not an increment',
    /TOTAL, NOT AN INCREMENT/i.test(fn) || /WHOLE DAY'S TOTAL/i.test(fn))
  check('...and tells it to add an increment to the count it can see',
    /add it to the count in the STEPS line/i.test(fn))
}

console.log('\n4. One writer, one rule, and the write is visible\n')
{
  check('chat writes through the shared store, never its own SQL',
    /logStepsManual\(/.test(chat) && !/from\('daily_steps'\)/.test(chat))
  check('the Exercise tab is still the screen that owns the row',
    /logStepsManual\(/.test(stepsRow))
  check('the coach reads its target from the shared rule, not a second copy',
    /stepsTargetFor/.test(read('src/lib/steps-context.ts')))

  // A WRITE THAT LANDS NOWHERE THE USER CAN SEE IS INDISTINGUISHABLE FROM ONE
  // THAT FAILED. onWaterChanged is declared and awaited in ChatAssistant and
  // passed by NOBODY, so chat water logs have exactly this bug today. This
  // check is here so steps cannot ship the same dead prop.
  check('App actually passes onStepsChanged, not merely declares it',
    /onStepsChanged=\{/.test(app), 'declared-but-unpassed is the onWaterChanged bug')
  check('...and the refresh reaches the row that renders the number',
    /refreshToken/.test(stepsRow) && /stepsVersion/.test(app))
  check('the receipt deep-links to Exercise, where steps live',
    /onViewExercise/.test(chat))
}

console.log('\n5. A typo cannot become the day\n')
{
  check('9,000 is a plausible day', isPlausibleStepCount(9000))
  check('0 is plausible (a real rest day)', isPlausibleStepCount(0))
  check(`${MAX_PLAUSIBLE_DAILY_STEPS.toLocaleString()} is the ceiling`, isPlausibleStepCount(MAX_PLAUSIBLE_DAILY_STEPS))
  check('900,000 is refused', !isPlausibleStepCount(900_000))
  check('negative is refused', !isPlausibleStepCount(-1))
  check('a fraction is refused', !isPlausibleStepCount(9000.5))
  check('the chat door actually applies the bound', /isPlausibleStepCount\(/.test(chat))
  check('...and says so instead of writing', /doesn't look like a day's step count/.test(raw('src/components/ChatAssistant.tsx')))
}

console.log('\n6. The coach can see the number it is about to change\n')
{
  const profile = { activity_level: 'moderate', daily_step_target: 8000 } as unknown as UserProfile
  const logged = buildCoachStepsSummary(6240, profile)
  check('a logged count is reported with its target', /6,240/.test(logged) && /8,000/.test(logged), logged)
  // "none yet" and "0" are different facts. Reporting zero would describe a
  // day spent motionless; reporting nothing invites the offer to log.
  const none = buildCoachStepsSummary(null, profile)
  check('nothing logged says so, rather than reporting zero',
    /none logged yet/i.test(none) && !/\b0 of\b/.test(none), none)
  check('the target matches the shared rule exactly',
    logged.includes(stepsTargetFor(profile).toLocaleString()))
  check('it reaches the payload the coach is sent', /steps_summary/.test(chat))
  check('...and the prompt teaches the field', /STEPS:/.test(fn))
}

if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log('\nOffered, not assumed; replaced, not appended; visible where it lands.\n')

// ---------------------------------------------------------------------------
// Gate for the onboarding's tappable options — when they appear, what shape
// they take, and the opening two messages above them.
//
// WHY THIS EXISTS. Ashley ran the onboarding and said the options "sometimes
// come up and sometimes they don't". They were doing exactly what they were
// told: present_slot's description called them "a RESCUE… Never call it on the
// first asking", so whether you got help depended on the model deciding you
// were stuck. Unpredictable from the user's side, and unmeasurable from the
// codebase's — nothing asserted anything about it either way.
//
// Two rules now hold, and this file is what keeps them:
//
//   1. Options are offered on EVERY closed-set question, first asking
//      included. A revert to the rescue wording fails §3.
//   2. Their SHAPE is read off the slot's own data: a card when the options
//      carry a description, pills when they do not. Never a hand-list — the
//      description is exactly what a card exists to show, so the data already
//      knows the answer.
//
// The size numbers in §2 are measured, not asserted: at 390px the old
// all-cards rendering ran 213px (goal) to 771px (dietary, on an 844px
// screen). That measurement is what made the case; this file just stops the
// rule drifting back.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { ONBOARDING_SLOTS, offeredOptionsFor } from '../src/lib/onboarding-slots'
import { buildOnboardingIntro, ONBOARDING_INTRO_THE_ASK } from '../src/lib/first-run-intro'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

const withOptions = ONBOARDING_SLOTS
  .map(s => ({ slot: s, options: offeredOptionsFor(s) ?? [] }))
  .filter(x => x.options.length > 0)

// ---------------------------------------------------------------------------
console.log('\n1. Every question with a list has one to offer')
// ---------------------------------------------------------------------------
{
  check(`there are option questions to check (${withOptions.length})`, withOptions.length >= 15, withOptions.length)
  for (const { slot, options } of withOptions) {
    check(`${slot.key}: every option has a label`, options.every(o => String(o.label ?? '').trim().length > 0))
  }
  // A question with a list has to be tappable — control 'single' or 'multi'
  // is what SlotChipsCard renders on; anything else returns null and the
  // options exist for nobody.
  for (const { slot } of withOptions) {
    check(`${slot.key}: is a control that can render options`,
      slot.control === 'single' || slot.control === 'multi', slot.control)
  }
}

// ---------------------------------------------------------------------------
console.log('\n2. Shape is derived from the options, not hand-listed')
// ---------------------------------------------------------------------------
{
  const card = withOptions.filter(x => x.options.some(o => o.description)).map(x => x.slot.key)
  const pill = withOptions.filter(x => !x.options.some(o => o.description)).map(x => x.slot.key)
  console.log(`    cards: ${card.join(', ')}`)
  console.log(`    pills: ${pill.join(', ')}`)

  check('both shapes are in use', card.length > 0 && pill.length > 0, { card: card.length, pill: pill.length })

  // THE HEIGHT RULE, which is the whole reason for the split. A card is two
  // per row, so 4 options is two rows and anything more is three or more —
  // and it was five and six rows that produced the 771px dietary screen.
  for (const { slot, options } of withOptions) {
    if (!options.some(o => o.description)) continue
    check(`${slot.key}: card question stays at 4 options or fewer (${options.length})`,
      options.length <= 4, options.length)
  }

  // The reverse guard. A long list must not acquire descriptions and quietly
  // become a wall of cards again — that is precisely how this got to 771px.
  const LONG = 6
  for (const { slot, options } of withOptions) {
    if (options.length < LONG) continue
    check(`${slot.key}: ${options.length} options, so it stays pills (no descriptions)`,
      !options.some(o => o.description), options.filter(o => o.description).map(o => o.label))
  }

  // Pills carry no emoji, and the day options are why: all seven were 📅.
  // Asserted on the DATA rather than the markup so a decorative icon added
  // later is caught here rather than on someone's phone.
  const days = withOptions.find(x => x.slot.key === 'trainingDays')
  check('the training-day options are label-only, no icon doing work',
    !!days && new Set(days.options.map(o => o.icon)).size === 1,
    days ? [...new Set(days.options.map(o => o.icon))] : null)
}

// ---------------------------------------------------------------------------
console.log('\n3. Options are offered on the FIRST asking, not as a rescue')
// ---------------------------------------------------------------------------
{
  const fn = readFileSync(join(ROOT, 'supabase/functions/onboarding-chat/index.ts'), 'utf8')

  // The exact wording that produced "sometimes they come up and sometimes
  // they don't". Named so a revert is a failure rather than a regression
  // nobody notices for a month.
  const RESCUE_WORDING = [
    /Never call it on the first asking/i,
    /Do NOT call present_slot on the first asking/i,
    /CHIPS ARE A RESCUE, and there are exactly three times/i,
  ]
  for (const re of RESCUE_WORDING) {
    check(`the rescue-only rule is gone: ${re.source.slice(0, 44)}…`, !re.test(fn))
  }
  check('present_slot is now asked for every closed-set question',
    /Call this EVERY time you ask a question that has a set list/i.test(fn))
  check('...including the first time', /including the first time you ask it/i.test(fn))

  // UNCHANGED ON PURPOSE, and the more important half: options under the
  // wrong question are worse than none, so the slot must match the sentence.
  check('the slot must still match the question just asked',
    /slot_key MUST be the exact question your sentence just asked/i.test(fn))
  check('one set of options per turn still holds', /One present_slot per turn at most/i.test(fn))

  // The client renders on SlotChipsCard, and only single/multi reach it.
  const card = readFileSync(join(ROOT, 'src/components/onboarding/SlotChipsCard.tsx'), 'utf8')
  check('the pill is the chat quick-reply shape', /rounded-full/.test(card) && /text-xs/.test(card))
  check('...and keeps a 44px tap target', /min-h-\[44px\]/.test(card))
  check('the shape switch reads the options, not a list of slot names',
    /options\.some\(o => o\.description\)/.test(card))
  check('no slot is named in the shape decision',
    !/hasDescriptions[\s\S]{0,200}(trainingDays|dietaryPreferences|injuries)/.test(card))
}

// ---------------------------------------------------------------------------
console.log('\n4. The opening messages')
// ---------------------------------------------------------------------------
{
  const intro = buildOnboardingIntro()
  const words = intro.map(m => m.content.trim().split(/\s+/).length)
  const total = words.reduce((a, b) => a + b, 0)

  // WAS 88 WORDS IN THREE BUBBLES. Ashley read it as too long; the message
  // that went was the capability pitch, because the post-onboarding tour now
  // demonstrates those same four things on the real screens. A budget rather
  // than a frozen string, so the copy can be edited without a gate edit, but
  // cannot creep back to a wall of text.
  check(`the opener is two messages (${intro.length})`, intro.length === 2, intro.length)
  check(`under 60 words before the first question (${total}, was 88)`, total <= 60, { words, total })
  check('nothing is empty', intro.every(m => m.content.trim().length > 0))

  // The name is the last thing said, not the first. Opening with a field is
  // what the whole rewrite was against.
  check('it ends by asking the name', /call you\?$/.test(intro[intro.length - 1].content.trim()),
    intro[intro.length - 1].content)
  check('the promise survived the cut', /Nothing changes without your okay/.test(ONBOARDING_INTRO_THE_ASK))
  check('no quick replies on the opener — a coach waits for a reply',
    intro.every(m => !m.quickReplies))

  // Same honesty rule as first-run-intro's chips: the opener speaks in the
  // app's own voice with no model in the loop, so an overclaim has nothing
  // downstream to catch it.
  const chat = readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf8')
  for (const stub of ['adjust_volume', 'update_workout_schedule']) {
    const at = chat.indexOf(`if (name === "${stub}")`)
    check(`${stub} is still a declining stub, so this check means something`,
      at !== -1 && /can't safely make plan changes yet/.test(chat.slice(at, at + 1200)))
  }
  const OVERCLAIM = [/\bre-?schedul/i, /\bchange your (training )?days?\b/i, /\b(add|drop|cut)\s+(\w+\s+)?(sets?|reps?|volume)\b/i]
  const text = intro.map(m => m.content).join(' ')
  check('the opener promises nothing that lands on a stub',
    !OVERCLAIM.some(re => re.test(text)), OVERCLAIM.filter(re => re.test(text)).map(String))
}

// ---------------------------------------------------------------------------
console.log('\n5. The injury question is asked while people are still answering')
// ---------------------------------------------------------------------------
{
  // Moved 16th -> 6th on Ashley's ruling. It is the only slot whose absence
  // can HURT someone rather than merely cost accuracy, and at 16th it sat
  // behind the four body-metric questions people most often abandon on.
  const index = (key: string) => ONBOARDING_SLOTS.findIndex(s => s.key === key)
  check(`injuries is in the opening block (position ${index('injuries') + 1} of ${ONBOARDING_SLOTS.length})`,
    index('injuries') <= 6, index('injuries') + 1)
  check('...after equipment, so the question follows what they train with',
    index('equipment') < index('injuries'), { equipment: index('equipment') + 1, injuries: index('injuries') + 1 })
  check('...and BEFORE the barbell numbers — a bad back gets mentioned first',
    index('injuries') < index('knowsWorkingLifts') && index('injuries') < index('knownSquatKg'),
    { injuries: index('injuries') + 1, knowsWorkingLifts: index('knowsWorkingLifts') + 1 })
  check('...and before the body metrics people abandon on',
    index('injuries') < index('age') && index('injuries') < index('weightKg'),
    { injuries: index('injuries') + 1, age: index('age') + 1 })
}

console.log(failures === 0 ? '\nAll onboarding-chip checks passed.\n' : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)
